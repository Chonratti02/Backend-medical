import { Router } from 'express';
import * as diseaseController from '../controllers/disease.controller';

const router = Router();

// GET /api/v1/diseases หรือ /api/v1/diseases?search=xxx
router.get('/', diseaseController.searchDiseases);
router.get('/search', diseaseController.searchDiseases);

// POST /api/v1/diseases
router.post('/', diseaseController.createDisease);

export default router;
