import { Request, Response, NextFunction } from 'express';
import db from '../config/database';

/**
 * ดึงรายการหรือค้นหาข้อมูลโรคจากตาราง diseases
 * GET /api/v1/diseases?search=xxx หรือ ?q=xxx
 */
export const searchDiseases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query['q'] || req.query['search'] || '').toString().trim();
    let query = `SELECT id, disease_name FROM diseases`;
    const params: any[] = [];

    if (q) {
      query += ` WHERE disease_name ILIKE $1 ORDER BY disease_name ASC LIMIT 50`;
      params.push(`%${q}%`);
    } else {
      query += ` ORDER BY id ASC LIMIT 50`;
    }

    const { rows } = await db.query(query, params);
    const data = rows.map((r: any) => ({
      id: r.id,
      disease_name: r.disease_name
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * เพิ่มรายการโรคใหม่เข้าตาราง diseases (ถ้าต้องการ)
 * POST /api/v1/diseases
 */
export const createDisease = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { disease_name } = req.body;
    if (!disease_name || !disease_name.trim()) {
      res.status(400).json({ success: false, message: 'กรุณาระบุชื่อโรค' });
      return;
    }

    const cleanName = disease_name.trim();

    // ตรวจสอบว่ามีชื่อนี้อยู่แล้วหรือไม่
    const existing = await db.query(
      `SELECT id, disease_name FROM diseases WHERE LOWER(TRIM(disease_name)) = LOWER($1)`,
      [cleanName]
    );
    if (existing.rows.length > 0) {
      const r = existing.rows[0];
      res.json({
        success: true,
        message: 'มีข้อมูลโรคนี้อยู่ในระบบแล้ว',
        data: {
          id: r.id,
          disease_name: r.disease_name,
        }
      });
      return;
    }

    const insertResult = await db.query(
      `INSERT INTO diseases (disease_name) VALUES ($1) RETURNING id, disease_name`,
      [cleanName]
    );

    const newDisease = insertResult.rows[0];
    res.status(201).json({
      success: true,
      message: 'เพิ่มข้อมูลโรคสำเร็จ',
      data: {
        id: newDisease.id,
        disease_name: newDisease.disease_name,
      }
    });
  } catch (err) {
    next(err);
  }
};
