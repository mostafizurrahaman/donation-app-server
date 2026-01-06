import { model, Schema } from 'mongoose';
import {
  boardMemberStatusValues,
  IBoardMember,
} from './board-member.interface';

const BoardMemeberSchema = new Schema<IBoardMember>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    boardMemberName: {
      type: String,
    },
    boardMemberEmail: {
      type: String,
    },
    boardMemberPhoneNumber: {
      type: String,
    },
    drivingLicenseURL: {
      type: String,
    },
    status: {
      type: String,
      required: true,
      enum: boardMemberStatusValues,
    },
  },
  {
    versionKey: false,
  }
);

export const BoardMemeber = model<IBoardMember>(
  'BoardMemeber',
  BoardMemeberSchema
);
