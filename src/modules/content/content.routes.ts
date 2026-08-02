// Mount path: /admin/content — CMS (docs/06 section 4.10). Admin-only; there's
// no public read endpoint yet since nothing on the mobile/web client consumes
// FAQs/app-copy from the API today (out of scope for this pass — add one
// when a client integration actually needs it).
import { Router } from 'express';
import { authenticate, requireAdmin, requirePermission } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './content.controller.js';
import * as v from './content.validation.js';

const router = Router();

router.use(authenticate, requireAdmin, requirePermission('MANAGE_CMS'));

router.get('/faqs', controller.listFaqs);
router.post('/faqs', validate({ body: v.createFaqSchema }), controller.createFaq);
router.patch('/faqs/reorder', validate({ body: v.reorderFaqsSchema }), controller.reorderFaqs);
router.patch('/faqs/:id', validate({ params: v.idParamSchema, body: v.updateFaqSchema }), controller.updateFaq);
router.delete('/faqs/:id', validate({ params: v.idParamSchema }), controller.deleteFaq);

router.get('/app-copy', controller.listAppCopy);
router.patch('/app-copy/:key', validate({ params: v.keyParamSchema, body: v.setAppCopySchema }), controller.setAppCopy);

export default router;
