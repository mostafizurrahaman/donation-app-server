/* eslint-disable no-console */
import config from '../config';
import { AUTH_STATUS, ROLE } from '../modules/Auth/auth.constant';
import Auth from '../modules/Auth/auth.model';
import SuperAdmin from '../modules/superAdmin/superAdmin.model';

const adminData = {
  role: ROLE.ADMIN,
  email: config.admin.email,
  password: config.admin.password,
  otp: config.admin.otp,
  otpExpiry: new Date(),
  isProfile: true,
  isVerifiedByOTP: true,
  status: AUTH_STATUS.VERIFIED,
};

const seedAdmin = async () => {
  try {
    // Check if an admin already exists
    const admin = await Auth.findOne({
      role: ROLE.ADMIN,
      email: config.admin.email,
    });

    if (!admin) {
      const adminAdmin = await Auth.create(adminData);

      await SuperAdmin.findOneAndUpdate(
        {
          auth: adminAdmin._id,
        },
        {
          auth: adminAdmin._id,
          name: 'Crescent Change Admin',
        },
        { upsert: true }
      );

      console.log('🎉✅ Admin seeded successfully!');
    } else {
      console.log('🟡⚠️ Admin already exists!');
    }
  } catch (error) {
    console.log('🔴❌ Error seeding Admin', error);
  }
};

export default seedAdmin;
