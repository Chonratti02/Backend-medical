import { Request, Response, NextFunction } from 'express';
import db from '../config/database';

/**
 * ค้นหาหรือดึงข้อมูลสมุนไพรจากตาราง herbal_knowledge
 * GET /api/v1/herbs?q=xxx หรือ ?search=xxx
 */
export const searchHerbs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query['q'] || req.query['search'] || '').toString().trim();
    const field = (req.query['field'] || '').toString().trim(); // 'name' หรือ 'all'
    const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 50, 100);

    if (!q) {
      const { rows } = await db.query(
        `SELECT DISTINCT ON (LOWER(herb_name), LOWER(COALESCE(part_used, '')))
           id, herb_name, part_used, taste, properties
         FROM herbal_knowledge
         ORDER BY LOWER(herb_name), LOWER(COALESCE(part_used, '')), id ASC
         LIMIT $1`,
        [limit]
      );
      res.json({ success: true, data: rows });
      return;
    }

    const cleanQuery = q;
    const prefixQuery = `${q}%`;
    const containsQuery = `%${q}%`;

    let whereClause = `herb_name ILIKE $3`;
    if (field !== 'name') {
      whereClause += ` OR properties ILIKE $3 OR taste ILIKE $3`;
    }

    const sql = `
      WITH ranked AS (
        SELECT 
          id, 
          herb_name, 
          part_used, 
          taste, 
          properties,
          CASE 
            WHEN LOWER(herb_name) = LOWER($1) THEN 1
            WHEN LOWER(herb_name) LIKE LOWER($2) THEN 2
            WHEN LOWER(herb_name) LIKE LOWER($3) THEN 3
            ELSE 4
          END as rank,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(herb_name), LOWER(COALESCE(part_used, ''))
            ORDER BY id ASC
          ) as rn
        FROM herbal_knowledge
        WHERE ${whereClause}
      )
      SELECT id, herb_name, part_used, taste, properties
      FROM ranked
      WHERE rn = 1
      ORDER BY 
        rank ASC,
        LENGTH(herb_name) ASC,
        herb_name ASC
      LIMIT $4
    `;

    const { rows } = await db.query(sql, [cleanQuery, prefixQuery, containsQuery, limit]);
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
    const { herb_name, part_used, taste, properties } = req.body;
    if (!herb_name || !herb_name.trim()) {
      res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสมุนไพร' });
      return;
    }

    const cleanName = herb_name.trim();
    const cleanPart = part_used?.trim() || null;

    // ตรวจสอบความซ้ำซ้อนตามชื่อ และส่วนที่ใช้ทำยา
    let existingQuery = `SELECT id, herb_name, part_used, taste, properties FROM herbal_knowledge WHERE LOWER(herb_name) = LOWER($1)`;
    const params: any[] = [cleanName];

    if (cleanPart) {
      existingQuery += ` AND LOWER(part_used) = LOWER($2)`;
      params.push(cleanPart);
    } else {
      existingQuery += ` AND (part_used IS NULL OR part_used = '')`;
    }

    const existing = await db.query(existingQuery, params);

    if (existing.rows.length > 0) {
      res.json({
        success: true,
        message: 'มีสมุนไพรและส่วนที่ใช้นี้ในคลังความรู้อยู่แล้ว',
        data: existing.rows[0],
      });
      return;
    }

    const insertResult = await db.query(
      `INSERT INTO herbal_knowledge (herb_name, part_used, taste, properties) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, herb_name, part_used, taste, properties`,
      [cleanName, part_used?.trim() || null, taste?.trim() || null, properties?.trim() || null]
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
