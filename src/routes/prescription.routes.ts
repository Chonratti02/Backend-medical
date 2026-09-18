import { Router } from 'express';
import * as prescriptionController from '../controllers/prescription.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// POST /api/v1/prescriptions
router.post('/', authorize('doctor', 'admin'), prescriptionController.create);

// GET  /api/v1/prescriptions
router.get('/', prescriptionController.getAll);

// GET  /api/v1/prescriptions/:id
router.get('/:id', prescriptionController.getById);

// PUT  /api/v1/prescriptions/:id/dispense
router.put('/:id/dispense', prescriptionController.dispense);

// PUT  /api/v1/prescriptions/:id/cancel
router.put('/:id/cancel', authorize('doctor', 'admin'), prescriptionController.cancel);

export default router;
