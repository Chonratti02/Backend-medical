import { Request, Response, NextFunction } from 'express';
import db from '../config/database';

/**
 * ค้นหาหรือดึงข้อมูลสมุนไพรจากตาราง herbal_knowledge
 * GET /api/v1/herbs?q=xxx หรือ ?search=xxx
 */
export const searchHerbs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query['q'] || req.query['search'] || '').toString().trim();
    let query = `SELECT id, herb_name FROM herbal_knowledge`;
    const params: any[] = [];

    if (q) {
      query += ` WHERE herb_name ILIKE $1 ORDER BY herb_name ASC LIMIT 50`;
      params.push(`%${q}%`);
    } else {
      query += ` ORDER BY id ASC LIMIT 50`;
    }

    const { rows } = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * เพิ่มรายการสมุนไพรใหม่เข้าตาราง herbal_knowledge (กรณีสมุนไพรนอกตำรา)
 * POST /api/v1/herbs
 */
export const createHerb = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { herb_name } = req.body;
    if (!herb_name || !herb_name.trim()) {
      res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสมุนไพร' });
      return;
    }

    const cleanName = herb_name.trim();

    // ตรวจสอบว่ามีสมุนไพรชื่อนี้อยู่แล้วหรือไม่
    const existing = await db.query(
      `SELECT id, herb_name FROM herbal_knowledge WHERE herb_name = $1`,
      [cleanName]
    );

    if (existing.rows.length > 0) {
      res.json({
        success: true,
        message: 'มีสมุนไพรนี้ในคลังความรู้อยู่แล้ว',
        data: existing.rows[0],
      });
      return;
    }

    const insertResult = await db.query(
      `INSERT INTO herbal_knowledge (herb_name) VALUES ($1) RETURNING id, herb_name`,
      [cleanName]
    );

    res.status(201).json({
      success: true,
      message: `เพิ่มสมุนไพร "${cleanName}" เข้าสู่คลังความรู้สำเร็จ`,
      data: insertResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
};
