import 'dotenv/config';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth.routes';
import staffRoutes from './routes/staff.routes';
import patientRoutes from './routes/patient.routes';
import visitRoutes from './routes/visit.routes';
import aiRoutes from './routes/ai.routes';
import prescriptionRoutes from './routes/prescription.routes';
import adminRoutes from './routes/admin.router';
import diseaseRoutes from './routes/disease.routes';
import herbRoutes from './routes/herb.routes';
import {
  authLoginLimiter,
  authRegisterLimiter,
  aiDiagnoseLimiter,
  knowledgeUploadLimiter,
  searchLimiter,
  generalApiLimiter,
} from './middlewares/rateLimit.middleware';

const app: Application = express();

// ─── Reverse Proxy Support ────────────────────────────────
// อ่าน IP ผู้ใช้จริงเมื่ออยู่หลัง Reverse Proxy (Render, Nginx, Cloudflare)
app.set('trust proxy', 1);

// ─── Security Middlewares ─────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const defaultAllowed = [
      "https://thaimedxai.web.app",
    ];
    const envAllowed = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((s) => s.trim())
      : [];
    const allowed = [...defaultAllowed, ...envAllowed];

    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS Error: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));

// ─── Tiered Rate Limiting ─────────────────────────────────
// 1. เข้าสู่ระบบ: ป้องกัน Brute-force (10 ครั้ง / 15 นาที เฉพาะครั้งที่ไม่ผ่าน)
app.use('/api/v1/auth/login', authLoginLimiter);

// 2. สมัครสมาชิก: ป้องกัน Spam และการอัปโหลดไฟล์ขยะ (5 ครั้ง / 1 ชั่วโมง)
app.use('/api/v1/auth/register', authRegisterLimiter);

// 3. AI Diagnose: ควบคุมค่าใช้จ่าย Token และโหลดของเซิร์ฟเวอร์ (20 ครั้ง / 1 นาที ต่อแพทย์)
app.use(['/api/v1/ai/analyze', '/api/analyze', '/api/ai/analyze'], aiDiagnoseLimiter);

// 4. Knowledge Upload: ป้องกันภาระหนักจากไฟล์ขนาดใหญ่ (15 ครั้ง / 15 นาที ต่อ Admin)
app.use(['/api/v1/ai/knowledge/upload', '/api/v1/ai/knowledge/uploads/:id/retry'], knowledgeUploadLimiter);

// 5. Search & Autocomplete: รองรับการพิมพ์ค้นหาชื่อยา/โรคแบบ Real-time Debounce (800 ครั้ง / 15 นาที)
app.use(['/api/v1/herbs', '/api/v1/diseases', '/api/v1/patients/search'], searchLimiter);

// 6. General API: รองรับการใช้งานคลินิกหลายโต๊ะตรวจพร้อมกัน (1,000 ครั้ง / 15 นาที)
app.use('/api', generalApiLimiter);

// ─── Body Parsing ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ─── Health Check ─────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Smart Herbal Clinic API',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────
// ป้องกันการแคชข้อมูลคิวตรวจและเวชระเบียนแบบเรียลไทม์
app.use(['/api/v1/visits', '/api/v1/patients'], (_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/visits', visitRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analyze', aiRoutes);
app.use('/api/v1/prescriptions', prescriptionRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/diseases', diseaseRoutes);
app.use('/api/v1/herbs', herbRoutes);

// ─── 404 Handler ──────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Error:', err.message);
  res.status(err.status ?? 500).json({
    success: false,
    message: err.message ?? 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;
