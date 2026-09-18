import 'dotenv/config';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes         from './routes/auth.routes';
import staffRoutes        from './routes/staff.routes';
import patientRoutes      from './routes/patient.routes';
import visitRoutes        from './routes/visit.routes';
import aiRoutes           from './routes/ai.routes';
import prescriptionRoutes from './routes/prescription.routes';
import adminRoutes from './routes/admin.router';
import diseaseRoutes from './routes/disease.routes';
import herbRoutes from './routes/herb.routes';

const app: Application = express();

// ─── Security Middlewares ─────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:4200',
  credentials: true,
}));

// ─── Rate Limiting ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

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

app.use('/api/v1/auth',          authRoutes);
app.use('/api/v1/staff',         staffRoutes);
app.use('/api/v1/patients',      patientRoutes);
app.use('/api/v1/visits',        visitRoutes);
app.use('/api/v1/ai',            aiRoutes);
app.use('/api/ai',               aiRoutes);
app.use('/api/analyze',          aiRoutes);
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
