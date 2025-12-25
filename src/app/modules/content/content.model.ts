import { Schema, model } from 'mongoose';
import { IContentModel } from './content.interface';

const contentSchema = new Schema<IContentModel>(
  {
    terms: {
      type: String,
      required: true,
    },
    aboutUs: {
      type: String,
      required: true,
    },
    privacyPolicy: {
      type: String,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const Content = model<IContentModel>('Content', contentSchema);

export default Content;
