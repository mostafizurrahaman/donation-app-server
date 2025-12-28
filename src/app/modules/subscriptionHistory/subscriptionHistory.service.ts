import { SubscriptionHistory } from './subscriptionHistory.model';
import QueryBuilder from '../../builders/QueryBuilder';

const getMyBillingHistory = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const historyQuery = new QueryBuilder(
    SubscriptionHistory.find({
      user: userId,
      billingReason: {
        $ne: 'trial_start',
      },
    }),
    query
  )
    .sort()
    .paginate()
    .fields();

  const result = await historyQuery.modelQuery.exec();
  const meta = await historyQuery.countTotal();

  return { result, meta };
};

export const SubscriptionService = {
  // ... previous methods ...
  getMyBillingHistory,
};
