import { Router } from 'express';
import * as visitController from '../controllers/visit.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// POST /api/v1/visits
router.post('/', visitController.create);

// GET  /api/v1/visits
router.get('/', visitController.getQueue);

// GET  /api/v1/visits/:id
router.get('/:id', visitController.getById);

// PUT  /api/v1/visits/:id
router.put('/:id', visitController.update);

// PUT  /api/v1/visits/:id/status
router.put('/:id/status', visitController.updateStatus);

export default router;
