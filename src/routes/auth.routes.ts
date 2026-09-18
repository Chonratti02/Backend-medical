import { Router } from 'express';
import { login, getMe, logout, register } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadLicenseMiddleware } from '../config/cloudinary';

const router = Router();

// POST /api/v1/auth/register (แนบไฟล์ใบประกอบวิชาชีพผ่าน license_file)
router.post('/register', uploadLicenseMiddleware.single('license_file'), register);

// POST /api/v1/auth/login
router.post('/login', login);

// GET  /api/v1/auth/me
router.get('/me', authenticate, getMe);

// POST /api/v1/auth/logout
router.post('/logout', authenticate, logout);

export default router;
