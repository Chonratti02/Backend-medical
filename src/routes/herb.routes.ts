import { Router } from 'express';
import * as herbController from '../controllers/herb.controller';

const router = Router();

// GET /api/v1/herbs หรือ /api/v1/herbs?q=xxx
router.get('/', herbController.searchHerbs);
router.get('/search', herbController.searchHerbs);

// POST /api/v1/herbs
router.post('/', herbController.createHerb);

export default router;
