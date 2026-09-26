import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../config/database';
import { Staff } from '../models/types';
import { uploadBufferToCloudinary } from '../config/cloudinary';

/**
 * POST /api/v1/auth/register
 * สมัครสมาชิกบุคลากร/แพทย์ พร้อมอัปโหลดใบประกอบวิชาชีพขึ้น Cloudinary
 */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, password, full_name } = req.body as {
      username: string;
      password: string;
      full_name: string;
      role?: string;
    };

    // ป้องกัน Privilege Escalation: บังคับให้การสมัครสมาชิกผ่าน Public Register ได้รับสิทธิ์เป็นแพทย์ (doctor) เท่านั้น ไม่อนุญาตให้ขอสิทธิ์ admin
    const assignedRole: 'doctor' = 'doctor';

    if (!username || !password || !full_name) {
      res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อผู้ใช้, รหัสผ่าน, ชื่อ-สกุล)' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
      return;
    }

    // ตรวจสอบว่าชื่อผู้ใช้งานมีอยู่แล้วหรือไม่
    const existing = await db.query('SELECT id FROM staff WHERE username = $1', [username.trim()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, message: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น' });
      return;
    }

    // 1. อัปโหลดใบประกอบวิชาชีพขึ้น Cloudinary (ถ้ามี)
    let licenseLink: string | null = null;
    if (req.file) {
      try {
        licenseLink = await uploadBufferToCloudinary(req.file.buffer, 'medical_clinic/licenses');
        console.log(`☁️ License uploaded to Cloudinary: ${licenseLink}`);
      } catch (uploadErr: any) {
        console.error('❌ Cloudinary upload error:', uploadErr.message);
        res.status(500).json({
          success: false,
          message: `ไม่สามารถอัปโหลดใบประกอบวิชาชีพได้: ${uploadErr.message}`,
        });
        return;
      }
    }

    // 2. เข้ารหัสผ่าน
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. บันทึกบัญชีบุคลากร (is_active = FALSE รอ Admin อนุมัติ)
    const { rows } = await db.query<Staff>(
      `INSERT INTO staff (username, password_hash, full_name, role, license_link, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, username, full_name, role, license_link, is_active, created_at`,
      [username.trim(), passwordHash, full_name.trim(), assignedRole, licenseLink]
    );

    res.status(201).json({
      success: true,
      message: 'ส่งคำขอสมัครสมาชิกสำเร็จแล้ว กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติเข้าใช้งาน',
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/login
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, password } = req.body as { username: string; password: string };

    if (!username || !password) {
      res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน' });
      return;
    }

    const { rows } = await db.query<Staff>(
      'SELECT * FROM staff WHERE username = $1 AND is_active = TRUE LIMIT 1',
      [username]
    );

    if (!rows.length) {
      res.status(401).json({ success: false, message: 'ไม่พบบัญชีผู้ใช้งาน หรือบัญชีถูกระงับ' });
      return;
    }

    const staff = rows[0];
    const isValid = await bcrypt.compare(password, staff.password_hash!);

    if (!isValid) {
      res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
      return;
    }

    const token = jwt.sign(
      { id: staff.id, role: staff.role, name: staff.full_name },
      process.env.JWT_SECRET as string,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as jwt.SignOptions['expiresIn'] }
    );

    const { password_hash, ...safeStaff } = staff;
    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', data: { token, staff: safeStaff } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/auth/me
 */
export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, license_link, created_at FROM staff WHERE id = $1',
      [req.user!.id]
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 */
export const logout = (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
};
