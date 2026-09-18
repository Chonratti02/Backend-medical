import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

// GET  /api/v1/admin/staff/pending (รายการที่รออนุมัติ)
router.get('/staff/pending', adminController.getPendingStaff);

// PUT  /api/v1/admin/staff/:id/activate (อนุมัติบัญชี)
router.put('/staff/:id/activate', adminController.activateStaff);

// PUT  /api/v1/admin/staff/:id/deactivate (ระงับบัญชี)
router.put('/staff/:id/deactivate', adminController.deactivateStaff);

// DELETE /api/v1/admin/staff/:id/reject (ปฏิเสธคำขอสมัคร)
router.delete('/staff/:id/reject', adminController.rejectStaff);

export default router;