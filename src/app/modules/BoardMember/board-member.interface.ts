import { BoardMemberStatus } from './board-member.constant';
import { Document, Types } from 'mongoose';

export interface IBoardMember extends Document {
  _id: Types.ObjectId;
  organization: Types.ObjectId;

  boardMemberName: string;
  boardMemberEmail: string;
  boardMemberPhoneNumber: string;

  drivingLicenseURL?: string;
  status: TBoardMemberStatus;
}

export type TBoardMemberStatus =
  (typeof BoardMemberStatus)[keyof typeof BoardMemberStatus];
export const boardMemberStatusValues = Object.values(BoardMemberStatus) as [
  string,
  ...string[]
];
