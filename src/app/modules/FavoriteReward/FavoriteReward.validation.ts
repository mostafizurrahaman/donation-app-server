import { z } from 'zod';

const addFavoriteRewardSchema = z.object({
  body: z.object({
    reward: z.string('Reward is required!'),
  }),
});

const deleteFavoriteRewardSchema = z.object({
  params: z.object({
    rewardId: z.string('Reward is required!'),
  }),
});

const getFavoriteRewardQuerySchema = z.object({
  query: z.object({
    searchTerm: z.string().optional(),
    limit: z
      .string({
        error: () => `limit should be string!`,
      })
      .transform((val) => Number(val))
      .optional(),
    page: z
      .string({
        error: () => `page should be number!`,
      })
      .transform((val) => Number(val))
      .optional(),
  }),
});

export const FavoriteRewardValidation = {
  addFavoriteRewardSchema,
  deleteFavoriteRewardSchema,
  getFavoriteRewardQuerySchema,
};
