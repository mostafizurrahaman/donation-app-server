import crypto from 'crypto';
import { Reward } from './reward.model';

export const generateUniqueRWDPrefix = async (): Promise<string> => {
  let prefix = '';
  let isUnique = false;
  while (!isUnique) {
    // Generates RWD + 4 random hex chars (e.g., RWD7F2A)
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    prefix = `RWD${random}`;
    const exists = await Reward.findOne({ codePrefix: prefix });
    if (!exists) isUnique = true;
  }
  return prefix;
};
