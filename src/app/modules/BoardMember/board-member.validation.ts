import z from 'zod';
import { boardMemberStatusValues } from './board-member.interface';

const updateBoardMemberStatusByIdSchema = z.object({
  params: z.object({
    boardMemberId: z.string({
      error: 'boardMemberId is required!',
    }),
  }),
  body: z.object({
    status: z.enum(boardMemberStatusValues, {
      error: 'Board member status should be pending, active, suspended ',
    }),
  }),
});

export const boardMemberValidationSchema = {
  updateBoardMemberStatusByIdSchema,
};
