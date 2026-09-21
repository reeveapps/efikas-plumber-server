import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './auth.controller.js';
import * as v from './auth.validation.js';

const router = Router();

router.post('/otp/request', validate({ body: v.otpRequestSchema }), controller.requestOtp);
router.post('/otp/verify', validate({ body: v.otpVerifySchema }), controller.verifyOtp);

router.post('/guest', controller.createGuest);
router.post('/guest/upgrade', authenticate, validate({ body: v.guestUpgradeSchema }), controller.upgradeGuest);

router.post('/oauth/google', validate({ body: v.oauthSchema }), controller.oauthGoogle);
router.post('/oauth/apple', validate({ body: v.oauthSchema }), controller.oauthApple);

router.post('/register/password', validate({ body: v.registerPasswordSchema }), controller.registerPassword);
router.post('/login/password', validate({ body: v.loginPasswordSchema }), controller.loginPassword);
router.post('/2fa/verify', validate({ body: v.twoFactorVerifySchema }), controller.verifyTwoFactor);

router.post('/refresh', validate({ body: v.refreshSchema }), controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.post('/socket-token', authenticate, controller.issueSocketToken);

router.post('/password/forgot', validate({ body: v.passwordForgotSchema }), controller.forgotPassword);
router.post('/password/reset', validate({ body: v.passwordResetSchema }), controller.resetPassword);
router.post('/password/change', authenticate, validate({ body: v.passwordChangeSchema }), controller.changePassword);

export default router;
