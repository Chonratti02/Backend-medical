import { Router } from 'express';
import * as herbController from '../controllers/herb.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/herbs หรือ /api/v1/herbs?q=xxx
router.get('/', herbController.searchHerbs);
router.get('/search', herbController.searchHerbs);

// POST /api/v1/herbs
router.post('/', authorize('doctor', 'admin'), herbController.createHerb);

export default router;
