import { Router } from 'express';
import { contentController } from './content.controller';
import { auth, validateRequest } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { contentValidation } from './content.validation';

const router = Router();

// Define routes
router.get('/', contentController.getContent);

// Define routes
router.patch(
  '/',
  validateRequest(contentValidation.updateContentValidationSchema),
  auth(ROLE.ADMIN),
  contentController.updateContent
);

export const contentRouter = router;
