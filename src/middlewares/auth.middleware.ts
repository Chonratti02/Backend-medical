import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../models/types';

/**
 * Middleware: ตรวจสอบ JWT Token
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
      return;
    }
    res.status(401).json({ success: false, message: 'Token ไม่ถูกต้อง' });
  }
};

/**
 * Middleware: ตรวจสอบ JWT Token แบบไม่บังคับ (Optional)
 */
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    req.user = decoded;
  } catch {
    // ในโหมด optional ให้ทำงานต่อไปได้แม้ token หมดอายุหรือไม่ถูกต้อง
  }
  next();
};

/**
 * Middleware: ตรวจสอบสิทธิ์ตาม Role
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // หาก route ไม่ได้ใส่ authenticate มาก่อน ให้ดึงและตรวจสอบ Token จาก Header โดยอัตโนมัติ
    if (!req.user && req.headers.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
        req.user = decoded;
      } catch {
        // Token ไม่ถูกต้องหรือหมดอายุ
      }
    }

    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `ไม่มีสิทธิ์เข้าถึง (ต้องการสิทธิ์: ${roles.join(', ')})`,
      });
      return;
    }
    next();
  };
};
