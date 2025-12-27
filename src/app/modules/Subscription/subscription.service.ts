/**
 * src/app/modules/Subscription/subscription.service.ts
 */
import httpStatus from 'http-status';
import { AppError } from '../../utils';
import { stripe } from '../../lib/stripeHelper';

import { Subscription } from './subscription.model';
import Auth from '../Auth/auth.model';
import { SUBSCRIPTION_STATUS } from './subscription.constant';
import { ROLE, roleValues } from '../Auth/auth.constant';
import { OrganizationModel } from '../Organization/organization.model';
import config from '../../config';
import QueryBuilder from '../../builders/QueryBuilder';
import { searchableFields } from '../Organization/organization.constants';
import { calculatePercentageChange } from '../../lib/filter-helper';

const createSubscriptionSession = async (
  userId: string,
  planType: 'monthly' | 'yearly'
) => {
  const user = await Auth.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // 1. Determine Price ID based on Role and Selection
  let priceId = '';
  if (user.role === ROLE.ORGANIZATION) {
    priceId =
      planType === 'monthly'
        ? config.stripe.orgMonthlyPriceId
        : config.stripe.orgYearlyPriceId;
  } else if (user.role === ROLE.BUSINESS) {
    priceId =
      planType === 'monthly'
        ? config.stripe.bizMonthlyPriceId
        : config.stripe.bizYearlyPriceId;
  }

  if (!priceId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Pricing not configured for your role'
    );
  }

  // 2. Check remaining local trial days to pass to Stripe
  const localSub = await Subscription.findOne({ user: userId });
  let remainingTrialDays = 0;

  if (localSub && localSub.status === SUBSCRIPTION_STATUS.TRIALING) {
    const diff = localSub.currentPeriodEnd.getTime() - new Date().getTime();
    remainingTrialDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // 3. Create Session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    subscription_data: {
      trial_period_days:
        remainingTrialDays > 0 ? remainingTrialDays : undefined,
      // trial_end: Math.floor(Date.now() / 1000 + 5 * 60),
      metadata: { userId, email: user.email },
    },
    success_url: `${config.clientUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.clientUrl}/subscription/cancel`,
    metadata: { userId, email: user.email },
  });

  return { url: session.url };
};

const getMySubscription = async (userId: string) => {
  const sub = await Subscription.findOne({ user: userId });
  if (!sub) return null;

  // Check for auto-expiry of local trial
  const now = new Date();
  if (
    sub.status === SUBSCRIPTION_STATUS.TRIALING &&
    now > sub.currentPeriodEnd
  ) {
    sub.status = SUBSCRIPTION_STATUS.EXPIRED;
    await sub.save();
  }

  return sub;
};

const validateOrganizationAccess = async (orgId: string) => {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw new AppError(httpStatus.NOT_FOUND, 'Org not found');

  const sub = await Subscription.findOne({ user: org.auth });
  const hasAccess =
    sub &&
    [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING].includes(
      sub.status as 'active' | 'trialing'
    ) &&
    new Date() < sub.currentPeriodEnd;

  if (!hasAccess) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'The recipient organization cannot receive recurring/round-up donations as their subscription or trial has expired.'
    );
  }
};

const checkHasSubscription = async (orgId: string): Promise<boolean> => {
  const org = await OrganizationModel.findById(orgId).select('auth');
  if (!org) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  const sub = await Subscription.findOne({
    user: org.auth,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING] },
  }).sort({ currentPeriodEnd: -1 });

  if (!sub || !sub.currentPeriodEnd) {
    return false;
  }

  return new Date() < new Date(sub.currentPeriodEnd);
};

const getAdminSubscriptionAndPaymentsStats = async () => {
  const subscriptions = await Subscription.aggregate([
    {
      $match: {
        status: {
          $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING],
        }, //TODO: IF NEED TO REMOVE TRIALING
      },
    },
    {
      $facet: {
        activeSubscription: [
          {
            $count: 'count',
          },
        ],
        breakdownByRole: [
          {
            $lookup: {
              from: 'auths',
              localField: 'user',
              foreignField: '_id',
              as: 'userRole',
              pipeline: [
                {
                  $project: {
                    _id: 0,
                    role: 1,
                  },
                },
              ],
            },
          },
          {
            $unwind: '$userRole',
          },
          {
            $project: {
              userRole: '$userRole.role',
            },
          },
          {
            $group: {
              _id: '$userRole',
              count: {
                $sum: 1,
              },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        activeSubscription: {
          $arrayElemAt: ['$activeSubscription.count', 0],
        },
      },
    },
  ]);

  const data = subscriptions[0];
  console.log(data);

  const breakDownByRole = [ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION].map(
    (item) => {
      const count =
        data?.breakdownByRole?.find((i: any) => i._id === item)?.count || 0;
      return {
        role: item === 'CLIENT' ? 'DONOR' : item,
        count,
      };
    }
  );

  return {
    activeSubscribers: data.activeSubscription,
    breakDownByRole,
  };
};

const getAdminSubscriptionAndPayments = async (query: Record<string, any>) => {
  const {
    status,
    planType,
    searchTerm,
    fromDate,
    toDate,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = query;

  const matchStage: any = {};

  if (status && status !== 'all') matchStage.status = status;
  if (planType && planType !== 'all') matchStage.planType = planType;

  const pipeline: any[] = [
    /** 1. Match subscription filters */
    { $match: matchStage },

    /** 2. User lookup */
    {
      $lookup: {
        from: 'auths',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    /** 3. Organization lookup */
    {
      $lookup: {
        from: 'organizations',
        localField: 'user._id',
        foreignField: 'auth',
        as: 'organization',
      },
    },

    /** 4. Business lookup */
    {
      $lookup: {
        from: 'businesses',
        localField: 'user._id',
        foreignField: 'auth',
        as: 'business',
      },
    },

    /** 5. Subscription history lookup */
    {
      $lookup: {
        from: 'subscriptionhistories',
        let: { subscriptionId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$subscription', '$$subscriptionId'] },
            },
          },
          ...(fromDate || toDate
            ? [
                {
                  $match: {
                    createdAt: {
                      ...(fromDate && { $gte: new Date(fromDate) }),
                      ...(toDate && { $lte: new Date(toDate) }),
                    },
                  },
                },
              ]
            : []),
          { $sort: { createdAt: -1 } },
        ],
        as: 'payments',
      },
    },

    /** 6. Payment calculations */
    {
      $addFields: {
        latestPayment: { $arrayElemAt: ['$payments', 0] },
        totalPaid: {
          $sum: {
            $map: {
              input: '$payments',
              as: 'p',
              in: '$$p.amount',
            },
          },
        },
      },
    },

    /** 7. Search (after lookups) */
    ...(searchTerm
      ? [
          {
            $match: {
              $or: [
                { 'user.name': { $regex: searchTerm, $options: 'i' } },
                { 'user.email': { $regex: searchTerm, $options: 'i' } },
                { 'organization.name': { $regex: searchTerm, $options: 'i' } },
                { 'business.name': { $regex: searchTerm, $options: 'i' } },
              ],
            },
          },
        ]
      : []),

    /** 8. Final projection */
    {
      $project: {
        user: {
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
        },

        organization: {
          $arrayElemAt: [
            {
              $map: {
                input: '$organization',
                as: 'org',
                in: {
                  _id: '$$org._id',
                  name: '$$org.name',
                  serviceType: '$$org.serviceType',
                  country: '$$org.country',
                  logoImage: '$$org.logoImage',
                },
              },
            },
            0,
          ],
        },

        business: {
          $arrayElemAt: [
            {
              $map: {
                input: '$business',
                as: 'biz',
                in: {
                  _id: '$$biz._id',
                  name: '$$biz.name',
                  category: '$$biz.category',
                  logoImage: '$$biz.logoImage',
                  coverImage: '$$biz.coverImage',
                },
              },
            },
            0,
          ],
        },

        planType: 1,
        status: 1,
        startDate: '$currentPeriodStart',
        renewalDate: '$currentPeriodEnd',
        isCanceled: '$cancelAtPeriodEnd',

        latestPayment: {
          amount: 1,
          currency: 1,
          status: 1,
          transactionDate: 1,
          invoiceUrl: 1,
        },

        totalPaid: 1,
        createdAt: 1,
      },
    },

    /** 9. Sort */
    {
      $sort: {
        [sortBy]: sortOrder === 'asc' ? 1 : -1,
      },
    },

    /** 10. Pagination */
    {
      $facet: {
        data: [
          { $skip: (Number(page) - 1) * Number(limit) },
          { $limit: Number(limit) },
        ],
        meta: [
          { $count: 'total' },
          { $addFields: { page: Number(page), limit: Number(limit) } },
        ],
      },
    },
    { $unwind: '$meta' },
  ];

  const result = await Subscription.aggregate(pipeline);

  return {
    data: result[0]?.data || [],
    meta: result[0]?.meta || { total: 0, page, limit },
  };
};

const getSubscriptionOverview = async () => {
  const now = new Date();

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59
  );

  const [currentStats, lastMonthStats] = await Promise.all([
    Subscription.aggregate([
      {
        $facet: {
          active: [
            {
              $match: {
                status: { $in: ['active', 'trialing'] },
              },
            },
            { $count: 'count' },
          ],
          canceled: [
            {
              $match: {
                status: 'canceled',
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]),
    Subscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfLastMonth,
            $lte: endOfLastMonth,
          },
        },
      },
      {
        $facet: {
          active: [
            {
              $match: {
                status: { $in: ['active', 'trialing'] },
              },
            },
            { $count: 'count' },
          ],
          canceled: [
            {
              $match: {
                status: 'canceled',
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]),
  ]);

  const activeNow = currentStats[0].active[0]?.count || 0;
  const activeLast = lastMonthStats[0].active[0]?.count || 0;

  const canceledNow = currentStats[0].canceled[0]?.count || 0;
  const canceledLast = lastMonthStats[0].canceled[0]?.count || 0;

  return {
    activeCnt: activeNow,
    activeChg: calculatePercentageChange(activeNow, activeLast),

    cancelCnt: canceledNow,
    cancelChg: calculatePercentageChange(canceledNow, canceledLast),

    renewRate: Number(
      ((activeNow / Math.max(activeNow + canceledNow, 1)) * 100).toFixed(1)
    ),
    renewChg: calculatePercentageChange(activeNow, activeLast),
  };
};

export const SubscriptionService = {
  createSubscriptionSession,
  getMySubscription,
  validateOrganizationAccess,
  checkHasSubscription,
  getAdminSubscriptionAndPaymentsStats,
  getAdminSubscriptionAndPayments,
  getSubscriptionOverview,
};
