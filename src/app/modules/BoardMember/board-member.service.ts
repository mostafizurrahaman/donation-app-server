import { AppError } from '../../utils';
import Organization from '../Organization/organization.model';
import httpStatus from 'http-status';
import { BoardMemeber } from './board-member.model';
import { IBoardMember } from './board-member.interface';

const getAllBoardMemberByOrganizationId = async (userId: string) => {
  const organization = await Organization.findOne({
    auth: userId,
  });

  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  const boardMembers = await BoardMemeber.find({
    organization: organization?._id,
  });

  return boardMembers;
};

//  Update board member status
const updateBoardMemberStatusById = async (
  userId: string,
  boardMemberId: string,
  payload: Partial<IBoardMember>
) => {
  const { status } = payload;
  if (!boardMemberId) {
    throw new AppError(httpStatus.NOT_FOUND, 'Board member is missing!');
  }

  const organization = await Organization.findOne({
    auth: userId,
  });

  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  const boardMember = await BoardMemeber.findOneAndUpdate(
    {
      organization: organization?._id,
      _id: boardMemberId,
    },
    {
      $set: {
        status,
      },
    },
    {
      new: true,
      
    }
  );

  if (!boardMember) {
    throw new AppError(httpStatus.NOT_FOUND, 'Board member not exists!');
  }

  return boardMember;
};

export const boardMemberService = {
  getAllBoardMemberByOrganizationId,
  updateBoardMemberStatusById,
};
