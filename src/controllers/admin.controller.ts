import { Request, Response, NextFunction } from "express";
import db from "../config/database";

/**
 * GET /api/v1/admin/staff/pending
 * ดูรายการบัญชี staff ที่รอ admin อนุมัติ
 */
export const getPendingStaff = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, full_name, role, license_link, is_active, created_at
       FROM staff WHERE is_active = FALSE ORDER BY created_at ASC`,
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/admin/staff/:id/activate
 * Admin อนุมัติบัญชี
 */
export const activateStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rows } = await db.query(
      "UPDATE staff SET is_active = TRUE WHERE id = $1 RETURNING id, username, full_name, role, is_active, created_at",
      [req.params["id"]],
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: "ไม่พบข้อมูล" });
      return;
    }
    res.json({
      success: true,
      message: `อนุมัติบัญชี ${rows[0].full_name} สำเร็จ`,
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/admin/staff/:id/deactivate
 * Admin ระงับบัญชี
 */
export const deactivateStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // ป้องกันการระงับตัวเอง
    if (parseInt(req.params["id"]) === req.user!.id) {
      res
        .status(400)
        .json({ success: false, message: "ไม่สามารถระงับบัญชีตัวเองได้" });
      return;
    }
    const { rows } = await db.query(
      "UPDATE staff SET is_active = FALSE WHERE id = $1 RETURNING id, username, full_name, role, is_active, created_at",
      [req.params["id"]],
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: "ไม่พบข้อมูล" });
      return;
    }
    res.json({
      success: true,
      message: `ระงับบัญชี ${rows[0].full_name} สำเร็จ`,
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/admin/staff/:id/reject
 * Admin ปฏิเสธคำขอสมัครสมาชิก (ลบบัญชีที่ยังไม่ได้อนุมัติออกจากระบบ)
 * หมายเหตุ: อนุญาตให้ลบเฉพาะบัญชีที่ is_active = FALSE เท่านั้น
 * เพื่อป้องกันไม่ให้ลบบัญชีที่อนุมัติไปแล้วโดยไม่ตั้งใจ
 */
export const rejectStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rows } = await db.query(
      "DELETE FROM staff WHERE id = $1 AND is_active = FALSE RETURNING id, username, full_name",
      [req.params["id"]],
    );
    if (!rows.length) {
      res.status(404).json({
        success: false,
        message: "ไม่พบคำขอสมัครนี้ หรือบัญชีนี้ได้รับการอนุมัติไปแล้ว",
      });
      return;
    }
    res.json({
      success: true,
      message: `ปฏิเสธคำขอสมัครของ ${rows[0].full_name} สำเร็จ`,
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
};
