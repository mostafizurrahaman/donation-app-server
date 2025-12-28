import httpStatus from 'http-status';
import { JwtPayload } from 'jsonwebtoken';
import { AppError, asyncHandler } from '../utils';
import { ROLE, TRole } from '../modules/Auth/auth.constant';
import Auth from '../modules/Auth/auth.model';
import { verifyToken } from '../lib';
import config from '../config';

const auth = (...requiredRoles: TRole[]) => {
  return asyncHandler(async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';

    // checking if the token is missing
    if (!token) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
    }

    // checking if the given token is valid
    const decoded = verifyToken(
      token,
      config.jwt.accessTokenSecret!
    ) as JwtPayload;

    const { id, iat } = decoded;

    // checking if the user is exist
    const user = await Auth.findById(id);

    if (!user) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not exists!');
    }

    if (user.isDeleted) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
    }

    user.ensureActiveStatus();

    if (!user.isVerifiedByOTP) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
    }

    // checking if any hacker using a token even-after the user changed the password
    if (user.passwordChangedAt && user.isJWTIssuedBeforePasswordChanged(iat)) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
    }

    // Role-specific activation checks
    if (user.role === ROLE.CLIENT) {
      // CLIENT can proceed without admin approval, just need to be verified
      if (!user.isVerifiedByOTP) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          'Your account is not verified!'
        );
      }
    } else if (user.role === ROLE.ORGANIZATION || user.role === ROLE.BUSINESS) {
      // ORGANIZATION and BUSINESS need admin activation
      if (!user.isProfile || !user.isActive) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Your profile is not activated by admin yet!'
        );
      }
    } else if (user.role === ROLE.ADMIN) {
      // ADMIN also needs to be verified and active
      if (!user.isActive) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          'Your admin account is not active!'
        );
      }
    }

    // Final role authorization check
    if (requiredRoles.length && !requiredRoles.includes(user.role)) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        'You have no access to this route, Forbidden!'
      );
    }

    req.user = user;
    next();
  });
};

// Helper function to allow multiple roles for endpoints
const authMultiple = (roles: TRole[]) => {
  return auth(...roles);
};

export default auth;
export { authMultiple };
