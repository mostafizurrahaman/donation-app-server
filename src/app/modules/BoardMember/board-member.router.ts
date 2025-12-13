import express from 'express';
import { boardMemberController } from './board-member.controller';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';

const router = express.Router();

router.get(
  '/',
  auth(ROLE.ORGANIZATION),
  boardMemberController.getOrganizationBoardMembers
);

router.post(
  '/:boardMemberId/status',
  auth(ROLE.ORGANIZATION),
  boardMemberController.updateBoardMemberStatusById
);

export const boardMemberRoutes = router;
