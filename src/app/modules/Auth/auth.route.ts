import { Router } from 'express';
import { auth, validateRequest } from '../../middlewares';
import { AuthValidation } from './auth.validation';
import { AuthController } from './auth.controller';
import { upload } from '../../lib';
import { validateRequestFromFormData } from '../../middlewares/validateRequest';
import { ROLE } from './auth.constant';

const router = Router();

router
  .route('/signup')
  .post(
    validateRequest(AuthValidation.createAuthSchema),
    AuthController.createAuth
  );

// 2. sendSignupOtpAgain
router
  .route('/send-signup-otp-again')
  .post(
    validateRequest(AuthValidation.sendSignupOtpAgainSchema),
    AuthController.sendSignupOtpAgain
  );

// 3. verifySignupOtp
router
  .route('/verify-signup-otp')
  .post(
    validateRequest(AuthValidation.verifySignupOtpSchema),
    AuthController.verifySignupOtp
  );

// 4. signin
router
  .route('/signin')
  .post(validateRequest(AuthValidation.signinSchema), AuthController.signin);

// 5. createProfile
router.route('/create-Profile').post(
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
  upload.fields([
    { name: 'clientImage', maxCount: 1 },
    { name: 'businessImage', maxCount: 1 },
    { name: 'organizationImage', maxCount: 1 },
    { name: 'drivingLincenseURL', maxCount: 1 },
    { name: 'adminImage', maxCount: 1 },
  ]),
  validateRequestFromFormData(AuthValidation.createProfileSchema),
  AuthController.createProfile
);

// 6. updatePhoto
router.route('/update-photo').put(
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'profileImage', maxCount: 1 },
    { name: 'avatar', maxCount: 1 },
  ]),
  AuthController.updatePhoto
);

// 7. changePassword
router
  .route('/change-password')
  .patch(
    auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
    validateRequest(AuthValidation.changePasswordSchema),
    AuthController.changePassword
  );

// 8. forgotPassword
router
  .route('/forgot-password')
  .post(
    validateRequest(AuthValidation.forgotPasswordSchema),
    AuthController.forgotPassword
  );

// 9. sendForgotPasswordOtpAgain
router
  .route('/send-forgot-password-otp-again')
  .post(
    validateRequest(AuthValidation.sendForgotPasswordOtpAgainSchema),
    AuthController.sendForgotPasswordOtpAgain
  );

// 10. verifyOtpForForgotPassword
router
  .route('/verify-forgot-password-otp')
  .post(
    validateRequest(AuthValidation.verifyOtpForForgotPasswordSchema),
    AuthController.verifyOtpForForgotPassword
  );

// 11. resetPassword
router
  .route('/reset-password')
  .post(
    validateRequest(AuthValidation.resetPasswordSchema),
    AuthController.resetPassword
  );

// 12. fetchProfile
router
  .route('/profile')
  .get(
    auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
    AuthController.fetchProfile
  );

// 13. deactivateUserAccount
router
  .route('/deactive-account')
  .post(
    auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION),
    validateRequest(AuthValidation.deactivateUserAccountSchema),
    AuthController.deactivateUserAccount
  );

// 14. deleteSpecificUserAccountFromDB
router
  .route('/delete-account')
  .delete(
    auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION),
    AuthController.deleteSpecificUserAccountFromDB
  );

// 15. getNewAccessToken
router
  .route('/access-token')
  .get(
    auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
    validateRequest(AuthValidation.getNewAccessTokenSchema),
    AuthController.getNewAccessToken
  );

// 16. updateAuthData
router
  .route('/update-auth-data')
  .patch(
    auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
    validateRequest(AuthValidation.updateAuthDataSchema),
    AuthController.updateAuthData
  );

// 17. Besiness Profile Create :
router
  .route('/business-signup')
  .post(
    upload.fields([{ name: 'logoImage', maxCount: 1 }]),
    validateRequestFromFormData(AuthValidation.businessSignupWithProfileSchema),
    AuthController.businessSignupWithProfile
  );

router.route('/organization-signup').post(
  upload.fields([
    { name: 'logoImage', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'drivingLicense', maxCount: 1 },
  ]),
  validateRequestFromFormData(
    AuthValidation.organizationSignupWithProfileSchema
  ),
  AuthController.organizationSignupWithProfile
);

router.patch(
  '/update-fcm',
  validateRequest(AuthValidation.updateFcmToken),
  AuthController.updateFcmToken
);
export const AuthRoutes = router;
