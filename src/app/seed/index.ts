/* eslint-disable no-console */
import config from '../config';
import { AUTH_STATUS, ROLE } from '../modules/Auth/auth.constant';
import Auth from '../modules/Auth/auth.model';

const adminData = {
  role: ROLE.ADMIN,
  email: config.admin.email,
  password: config.admin.password,
  otp: config.admin.otp,
  otpExpiry: new Date(),
  isVerifiedByOTP: true,
};

const seedAdmin = async () => {
  try {
    // Check if an admin already exists
    const admin = await Auth.findOne({
      role: ROLE.ADMIN,
      email: config.admin.email,
      status: AUTH_STATUS.VERIFIED,
    });

    if (!admin) {
      await Auth.create(adminData);

      console.log('🎉✅ Admin seeded successfully!');
    } else {
      console.log('🟡⚠️ Admin already exists!');
    }
  } catch (error) {
    console.log('🔴❌ Error seeding Admin', error);
  }
};

export default seedAdmin;
