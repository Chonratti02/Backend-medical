import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Key generator: ใช้ User ID หากเข้าสู่ระบบแล้ว
 * เพื่อให้แพทย์แต่ละท่านในคลินิกเดียวกันมีโควตาแยกกัน แม้จะใช้ IP เครือข่ายเดียวกัน
 */
const userOrIpKey = (req: Request): string => {
  return (req as any).user?.id ? `user_${(req as any).user.id}` : (req.ip || 'unknown');
};

const createLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    keyGenerator: options.keyGenerator,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        message: options.message,
        retryAfterMinutes: Math.ceil(options.windowMs / 60000),
      });
    },
  });
};

/**
 * 1. Auth Login Limiter: จำกัด 10 ครั้งต่อ 15 นาที
 * นับเฉพาะครั้งที่ล็อกอินไม่ผ่าน (skipSuccessfulRequests: true) เพื่อป้องกัน Brute-force Password Guessing
 */
export const authLoginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'พยายามเข้าสู่ระบบไม่สำเร็จหลายครั้งเกินกำหนด เพื่อความปลอดภัยกรุณารอ 15 นาที',
});

/**
 * 2. Auth Register Limiter: จำกัด 5 ครั้งต่อ 1 ชั่วโมง
 * ป้องกันการสแปมสร้างบัญชีและอัปโหลดไฟล์ใบประกอบวิชาชีพขึ้น Cloudinary
 */
export const authRegisterLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'มีการส่งคำขอสมัครสมาชิกจากเครือข่ายนี้บ่อยเกินไป กรุณารอ 1 ชั่วโมง',
});

/**
 * 3. AI Diagnose Limiter: จำกัด 20 ครั้งต่อ 1 นาที
 * ควบคุมต้นทุนการเรียกใช้ Gemini API และการประมวลผล pgvector โดยคิดโควตาแยกตามแพทย์แต่ละท่าน
 */
export const aiDiagnoseLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  message: 'มีการส่งวิเคราะห์ AI ถี่เกินไป กรุณารอสักครู่ (1 นาที) แล้วลองใหม่อีกครั้ง',
});

/**
 * 4. Knowledge Upload Limiter: จำกัด 15 ครั้งต่อ 15 นาที
 * ป้องกันภาระหนักจากการประมวลผลไฟล์ขนาดใหญ่ (PDF/Word/Excel 50MB) และสร้าง Vector Chunks
 */
export const knowledgeUploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: userOrIpKey,
  message: 'อัปโหลดเอกสารคลังความรู้บ่อยเกินไป กรุณารอสักครู่ก่อนทำรายการต่อ',
});

/**
 * 5. Search & Autocomplete Limiter: จำกัด 800 ครั้งต่อ 15 นาที
 * รองรับการพิมพ์ค้นหาชื่อยา/โรค/คนไข้แบบ Real-time Debounce จากแพทย์หลายโต๊ะตรวจพร้อมกัน
 */
export const searchLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 800,
  message: 'มีการค้นหาข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
});

/**
 * 6. General API Limiter: จำกัด 1,000 ครั้งต่อ 15 นาที
 * เพิ่มจากเดิม 100 ครั้ง เพื่อรองรับการทำงานปกติในคลินิก (คิวตรวจ, ข้อมูลคนไข้, บันทึกการรักษา)
 */
export const generalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'คำขอใช้งานระบบมากเกินขีดจำกัด กรุณารอสักครู่',
});
