import { Router } from 'express';
import * as staffController from '../controllers/staff.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// GET  /api/v1/staff
router.get('/', authorize('admin'), staffController.getAll);

// POST /api/v1/staff
router.post('/', authorize('admin'), staffController.create);

// GET  /api/v1/staff/:id
router.get('/:id', staffController.getById);

// PUT  /api/v1/staff/:id
router.put('/:id', authorize('admin'), staffController.update);

export default router;