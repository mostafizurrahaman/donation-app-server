import { Request, Response } from 'express';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import { boardMemberService } from './board-member.service';
import httpStatus from 'http-status';

const getOrganizationBoardMembers = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req?.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.NOT_FOUND, 'You are not authorized!');
    }

    const result = await boardMemberService.getAllBoardMemberByOrganizationId(
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: `Board member retrieved successully!`,
      data: result,
    });
  }
);

const updateBoardMemberStatusById = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req?.user?._id?.toString();
    const boareMemberId = req.params.boardMemberId;

    if (!userId) {
      throw new AppError(httpStatus.NOT_FOUND, 'You are not authorized!');
    }

    const result = await boardMemberService.updateBoardMemberStatusById(
      userId,
      boareMemberId,
      req.body
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: `Update board member status successfully!`,
      data: result,
    });
  }
);

export const boardMemberController = {
  getOrganizationBoardMembers,
  updateBoardMemberStatusById,
};
