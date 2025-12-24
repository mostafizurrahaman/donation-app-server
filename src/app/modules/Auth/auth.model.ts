import bcrypt from 'bcryptjs';
import { model, Schema } from 'mongoose';
import config from '../../config';
import { ROLE, AUTH_STATUS } from './auth.constant';
import { IAuth, IAuthModel } from './auth.interface';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { authStatusValues } from './auth.constant';

const authSchema = new Schema<IAuth, IAuthModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required!'],
      unique: [true, 'This email is already used!'],
      trim: true,
    },
    basiqUserId: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: 0,
    },
    passwordChangedAt: {
      type: Date,
    },

    isProfile: {
      type: Boolean,
      default: false,
    },

    otp: {
      type: String,
      required: true,
    },
    otpExpiry: {
      type: Date,
      required: true,
    },
    isVerifiedByOTP: {
      type: Boolean,
      default: false,
    },

    twoFactorSecret: {
      type: String,
      select: 0,
    },
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorBackupCodes: {
      type: [String],
      select: 0,
    },

    role: {
      type: String,
      enum: Object.values(ROLE),
      default: ROLE.CLIENT,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deactivationReason: {
      type: String,
    },
    deactivatedAt: {
      type: Date,
    },
    status: {
      type: String,
      required: true,
      enum: authStatusValues,
    },
  },
  { timestamps: true, versionKey: false }
);

// Custom hooks/methods

// Hash password before saving
authSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('password')) {
    if (!this.password) {
      return next(
        new AppError(httpStatus.BAD_REQUEST, 'Password is required!')
      );
    }

    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt.saltRounds)
    );
  }
  next();
});

// Clear password after saving
authSchema.post('save', function (doc, next) {
  if (doc) {
    doc.password = '';
  }
  next();
});

// authSchema.post('find', function (doc, next) {
//   if (doc) {
//     doc.password = '';
//   }
//   next();
// });

authSchema.post('findOne', function (doc, next) {
  if (doc) {
    doc.password = '';
  }
  next();
});

// Remove deleted documents from find queries
authSchema.pre('find', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

authSchema.pre('findOne', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

authSchema.pre('aggregate', function (next) {
  this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
  next();
});

// isUserExistsByEmail
authSchema.statics.isUserExistsByEmail = async function (
  email: string
): Promise<IAuth | null> {
  return await Auth.findOne({ email }).select('+password');
};

// isPasswordMatched
authSchema.methods.isPasswordMatched = async function (
  plainTextPassword: string
): Promise<boolean> {
  return await bcrypt.compare(plainTextPassword, this.password);
};

// isJWTIssuedBeforePasswordChanged
authSchema.methods.isJWTIssuedBeforePasswordChanged = function (
  jwtIssuedTimestamp: number
): boolean {
  const passwordChangedTime = new Date(this.passwordChangedAt).getTime() / 1000;
  return passwordChangedTime > jwtIssuedTimestamp;
};

authSchema.methods.ensureActiveStatus = function (this: IAuth) {
  if (this.status === AUTH_STATUS.PENDING) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This account is not verified yet!'
    );
  }
  if (this.status === AUTH_STATUS.SUSPENDED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is suspended!');
  }
};

const Auth = model<IAuth, IAuthModel>('Auth', authSchema);

export default Auth;
