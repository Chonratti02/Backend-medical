import { Router } from 'express';
import * as diseaseController from '../controllers/disease.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/diseases หรือ /api/v1/diseases?search=xxx
router.get('/', diseaseController.searchDiseases);
router.get('/search', diseaseController.searchDiseases);

// POST /api/v1/diseases
router.post('/', authorize('doctor', 'admin'), diseaseController.createDisease);

export default router;
