import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import db from "../config/database";

export const getAll = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, license_link, is_active, created_at FROM staff ORDER BY role, full_name'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { username, password, full_name, role, license_link, license_no } = req.body as Record<string, string>;
    const effectiveLicense = license_link ?? license_no ?? null;

    if (!username || !password || !full_name || !role) {
      res
        .status(400)
        .json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      return;
    }
    if (role === 'doctor' && !effectiveLicense) {
      res.status(400).json({ success: false, message: 'แพทย์ต้องระบุเลขหรือลิงก์ใบประกอบวิชาชีพ' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      "INSERT INTO staff (username, password_hash, full_name, role, license_no) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [username, hash, full_name, role, license_no ?? null],
    );
    res.status(201).json({
      success: true,
      message: "เพิ่มบุคลากรสำเร็จ",
      data: { id: rows[0].id },
    });
  } catch (err) {
    next(err);
  }
};

export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rows } = await db.query(
      "SELECT id, username, full_name, role, license_no, is_active, created_at FROM staff WHERE id = $1",
      [req.params["id"]],
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: "ไม่พบข้อมูล" });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { full_name, role, license_link, license_no } = req.body;
    const effectiveLicense = license_link ?? license_no ?? null;
    await db.query(
      "UPDATE staff SET full_name = $1, role = $2, license_no = $3 WHERE id = $4",
      [full_name, role, license_no ?? null, req.params["id"]],
    );
    res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
  } catch (err) {
    next(err);
  }
};
