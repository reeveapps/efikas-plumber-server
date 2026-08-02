import { Router } from 'express';
import * as controller from './subscriptions.controller.js';

// mount at /subscription-plans
export const subscriptionPlansRouter = Router();

subscriptionPlansRouter.get('/', controller.listPlans);

// No routes currently live under the /subscriptions prefix itself — subscription
// creation/management lives in the companies module (POST /companies/me/subscription).
// This default export is kept for symmetry with other modules / future use.
const router = Router();

export default router;
