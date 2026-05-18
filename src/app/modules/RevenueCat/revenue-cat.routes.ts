import express from 'express';
import { RevenueCatController } from './revenue-cat.controllers';

const router = express.Router();

router.post('/', RevenueCatController.handleWebhook);

export const revenueCatRoutes = router;
