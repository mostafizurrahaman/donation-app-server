import { Router } from 'express';
import { auth } from '../../middlewares';
import { StripeController } from './stripe.controller';

const router = Router();

// Create refund for payment (requires authentication)
router.post('/refund', auth(), StripeController.createRefund);

export default router;
