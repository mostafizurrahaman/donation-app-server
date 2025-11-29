import httpStatus from 'http-status';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import config from '../config';
import { AppError } from '../utils';

type TTokenData = {
  id: string;
  name: string;
  image: string;
  email: string;
  role: string;
  isProfile: boolean;
  isActive: boolean;
};

export const createAccessToken = (payload: TTokenData): string => {
  const token = jwt.sign(payload, config.jwt.accessTokenSecret!, {
    algorithm: 'HS256',
    expiresIn: config.jwt.accessTokenExpiresIn!,
  } as SignOptions);

  return token;
};

// type TArtistTokenData = {
//   id: string;
//   fullName: string;
//   phoneNumber: string;
//   image: string;
//   email: string;
//   role: string;
// };

// export const createArtistAccessToken = (payload: TArtistTokenData): string => {
//   const token = jwt.sign(payload, config.jwt.access_secret!, {
//     algorithm: 'HS256',
//     expiresIn: config.jwt.access_expires_in!,
//   } as SignOptions);

//   return token;
// };

export const createRefreshToken = (payload: { email: string }): string => {
  const token = jwt.sign(payload, config.jwt.refreshTokenSecret!, {
    algorithm: 'HS256',
    expiresIn: config.jwt.refreshTokenExpiresIn!,
  } as SignOptions);

  return token;
};

export interface ITokenUser {
  id: string;
  fullName: string;
  image: string;
  email: string;
  role: string;
}

export const verifyToken = (token: string, secret: Secret) => {
  try {
    const decoded = jwt.verify(token, secret) as ITokenUser;

    return decoded;
  } catch {
    console.log('Token verification failed for token:', token);
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized access!');
  }
};
