import { Router } from 'express';
import { AuthRoutes } from '../modules/Auth/auth.route';
import { AdminRoutes } from '../modules/Admin/admin.route';
import DonationRoutes from '../modules/Donation/donation.route';
import { CauseRoutes } from '../modules/Causes/causes.route';
import StripeRoutes from '../modules/Stripe/stripe.route';
import { PaymentMethodRoutes } from '../modules/PaymentMethod/paymentMethod.route';
import { OrganizationRoutes } from '../modules/Organization/organization.routes';
import ScheduledDonationRoutes from '../modules/ScheduledDonation/scheduledDonation.route';
import { CronJobsRoutes } from '../modules/CronJobs/cronJobs.route';
import { BankConnectionRoutes } from '../modules/BankConnection/bankConnection.route';
import { SecureRoundUpRoutes } from '../modules/RoundUp/secureRoundUp.route';
import { roundUpTransactionRoutes } from '../modules/RoundUpTransaction/roundUpTransaction.route';
import { ReceiptRoutes } from '../modules/Receipt/receipt.router';
import { PointsRoutes } from '../modules/Points/points.route';
import { RewardRoutes } from '../modules/Reward/reward.route';
import { BadgeRoutes } from '../modules/badge/badge.route';
import { BusinessRoutes } from '../modules/Business/business.routes';
import { BalanceRoutes } from '../modules/Balance/balance.route';
import { PayoutRoutes } from '../modules/Payout/payout.route';
import { clientRoutes } from '../modules/Client/client.route';
import { boardMemberRoutes } from '../modules/BoardMember/board-member.router';
import { RewardRedemptionRoutes } from '../modules/RewardRedeemtion/reward-redeemtion.routes';
import { notificationRoutes } from '../modules/Notification/notification.routes';
import { SuperAdminRoutes } from '../modules/superAdmin/superAdmin.routes';
import { contentRouter } from '../modules/content/content.routes';
import { SubscriptionRoutes } from '../modules/Subscription/subscription.routes';

const router = Router();

const moduleRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/admin',
    route: AdminRoutes,
  },
  {
    path: '/client',
    route: clientRoutes,
  },

  {
    path: '/business',
    route: BusinessRoutes,
  },
  {
    path: '/notification',
    route: notificationRoutes,
  },

  {
    path: '/donation',
    route: DonationRoutes,
  },
  {
    path: '/scheduled-donation',
    route: ScheduledDonationRoutes,
  },
  {
    path: '/cron-jobs',
    route: CronJobsRoutes,
  },
  {
    path: '/cause',
    route: CauseRoutes,
  },

  {
    path: '/stripe',
    route: StripeRoutes,
  },
  {
    path: '/payment-method',
    route: PaymentMethodRoutes,
  },
  {
    path: '/organization',
    route: OrganizationRoutes,
  },
  {
    path: '/board-member',
    route: boardMemberRoutes,
  },
  {
    path: '/bank-connection',
    route: BankConnectionRoutes,
  },
  {
    path: '/secure-roundup',
    route: SecureRoundUpRoutes,
  },
  {
    path: '/roundup-transactions',
    route: roundUpTransactionRoutes,
  },
  {
    path: '/receipt',
    route: ReceiptRoutes,
  },
  {
    path: '/points',
    route: PointsRoutes,
  },
  {
    path: '/rewards',
    route: RewardRoutes,
  },
  {
    path: '/rewards',
    route: RewardRedemptionRoutes,
  },
  {
    path: '/badges',
    route: BadgeRoutes,
  },
  {
    path: '/balance',
    route: BalanceRoutes,
  },
  {
    path: '/payout',
    route: PayoutRoutes,
  },
  {
    path: '/super-admin',
    route: SuperAdminRoutes,
  },
  {
    path: '/content',
    route: contentRouter,
  },
  {
    path: '/subscription',
    route: SubscriptionRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
