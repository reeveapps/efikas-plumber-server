import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import * as controller from './users.controller.js';
import * as v from './users.validation.js';

const router = Router();

// Public — reachable from the marketing site without being logged into the
// app (Google Play's data-safety policy requires account deletion be
// requestable this way). Must come before `router.use(authenticate)` below.
router.post(
  '/deletion-request',
  validate({ body: v.requestAccountDeletionSchema }),
  controller.requestAccountDeletionByPhone
);

router.use(authenticate);

router.get('/me', controller.getMe);
router.patch('/me', upload.single('avatar'), validate({ body: v.updateMeSchema }), controller.updateMe);
router.post('/me/phone', validate({ body: v.changePhoneSchema }), controller.changePhone);
router.post('/me/devices', validate({ body: v.registerDeviceSchema }), controller.registerDevice);
router.delete('/me/devices/:tokenId', validate({ params: v.deviceIdParamSchema }), controller.removeDevice);
router.delete('/me', controller.deleteMe);

export default router;
