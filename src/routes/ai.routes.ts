import { Router } from 'express';
import * as aiController from '../controllers/ai.controller';
import { authenticate, optionalAuthenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// POST /api/analyze หรือ POST /api/v1/ai/analyze
router.post('/', authenticate, authorize('doctor', 'admin'), aiController.analyze);
router.post('/analyze', authenticate, authorize('doctor', 'admin'), aiController.analyze);

// GET  /api/v1/ai/assessments/latest (ดึงผลวิเคราะห์ล่าสุดตาม visit_id หรือ patient_id + วันที่)
router.get('/assessments/latest', authenticate, authorize('doctor', 'admin'), aiController.getLatestAssessment);

// GET  /api/v1/ai/assessments/:visitId
router.get('/assessments/:visitId', authenticate, authorize('doctor', 'admin'), aiController.getByVisit);

// PATCH /api/v1/ai/assessments/:id/feedback (บันทึกความเห็นของแพทย์)
router.patch('/assessments/:id/feedback', authenticate, authorize('doctor', 'admin'), aiController.updateAssessmentFeedback);

// ─── Knowledge Base Uploads & Management ───────────────────

// GET    /api/v1/ai/knowledge/uploads (รายการเอกสารทั้งหมด)
router.get(
  '/knowledge/uploads',
  authenticate,
  authorize('admin'),
  aiController.getKnowledgeUploads
);

// POST   /api/v1/ai/knowledge/upload (อัปโหลดไฟล์ Word, PDF, Excel, CSV)
router.post(
  '/knowledge/upload',
  authenticate,
  authorize('admin'),
  aiController.upload.single('file'),
  aiController.uploadDocument
);

// DELETE /api/v1/ai/knowledge/uploads/:id (ลบเอกสาร)
router.delete(
  '/knowledge/uploads/:id',
  authenticate,
  authorize('admin'),
  aiController.deleteKnowledgeUpload
);

// PATCH  /api/v1/ai/knowledge/uploads/:id/toggle (สลับเปิด/ปิด RAG)
router.patch(
  '/knowledge/uploads/:id/toggle',
  authenticate,
  authorize('admin'),
  aiController.toggleKnowledgeActive
);

// POST   /api/v1/ai/knowledge/uploads/:id/retry (คำนวณเวกเตอร์ใหม่)
router.post(
  '/knowledge/uploads/:id/retry',
  authenticate,
  authorize('admin'),
  aiController.retryKnowledgeUpload
);

export default router;
