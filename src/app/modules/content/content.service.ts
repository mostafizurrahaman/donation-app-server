import { IContentModel } from './content.interface';
import Content from './content.model';


const updateContent = async (payload: Partial<IContentModel>) => {
  const { terms, privacyPolicy, aboutUs } = payload;

  const content = await Content.findOneAndUpdate(
    {},
    {
      terms,
      privacyPolicy,
      aboutUs,
    },
    {
      upsert: true,
      new: true,
    }
  );

  return content;
};

const getContent = async () => {
  const content = await Content.findOne({});

  if (!content) {
    return {
      _id: null,
      terms: '',
      privacyPolicy: '',
      aboutUs: '',
    };
  }

  return content;
};

export const ContentService = {
  updateContent,
  getContent,
};
