import { Router } from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';

import { validateRequestFromFormData } from '../../middlewares/validateRequest';
import { upload } from '../../lib';
import { SuperAdminValidation } from './superAdmin.validation';
import { SuperAdminController } from './superAdmin.controller';

const router = Router();

router.patch(
  '/update-me',
  auth(ROLE.ADMIN),
  upload.single('adminImage'),
  validateRequestFromFormData(
    SuperAdminValidation.updateSuperAdminProfileSchema
  ),
  SuperAdminController.updateMyProfile
);

export const SuperAdminRoutes = router;
