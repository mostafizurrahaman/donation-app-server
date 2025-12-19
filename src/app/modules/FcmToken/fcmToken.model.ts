import { Schema, model, Types } from 'mongoose';

const fcmTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true },
    deviceType: {
      type: String,
      enum: ['android', 'ios', 'web'],
      required: true,
    },
  },
  { timestamps: true }
);

export const FcmToken = model('FcmToken', fcmTokenSchema);
