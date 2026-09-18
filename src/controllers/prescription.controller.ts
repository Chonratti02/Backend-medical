import { Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';
import db from '../config/database';

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      visit_id, ai_assessment_id, herbs,
      preparation, usage_instruction, duration_days, notes,
    } = req.body;
    const doctor_id = req.user!.id;

    if (!visit_id || !herbs || !usage_instruction) {
      res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
      return;
    }

    const today = dayjs().format('YYYYMMDD');
    const countResult = await db.query(
      "SELECT COUNT(*) as count FROM prescriptions WHERE created_at::date = CURRENT_DATE"
    );
    const seq = String(parseInt(countResult.rows[0].count, 10) + 1).padStart(3, '0');
    const prescriptionNo = `RX-${today}-${seq}`;

    const insertResult = await db.query(
      `INSERT INTO prescriptions
        (visit_id, doctor_id, ai_assessment_id, prescription_no, herbs, preparation, usage_instruction, duration_days, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [visit_id, doctor_id, ai_assessment_id ?? null, prescriptionNo,
       JSON.stringify(herbs), preparation ?? null, usage_instruction, duration_days ?? 7, notes ?? null]
    );

    await db.query("UPDATE visits SET status = 'in_progress' WHERE id = $1", [visit_id]);

    res.status(201).json({
      success: true,
      message: `สร้างใบสั่งยาหมายเลข ${prescriptionNo} สำเร็จ`,
      data: insertResult.rows[0],
    });
  } catch (err) { next(err); }
};

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status    = (req.query['status'] as string) ?? 'pending';
    const visitDate = (req.query['date']   as string) ?? new Date().toISOString().split('T')[0];

    const { rows } = await db.query(
      `SELECT pr.*, p.prefix, p.first_name, p.last_name, p.national_id, d.full_name as doctor_name
       FROM prescriptions pr
       JOIN visits v   ON pr.visit_id  = v.id
       JOIN patients p ON v.patient_id = p.id
       JOIN staff d    ON pr.doctor_id = d.id
       WHERE pr.status = $1 AND pr.created_at::date = $2
       ORDER BY pr.created_at DESC`,
      [status, visitDate]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT pr.*, p.prefix, p.first_name, p.last_name, p.national_id,
              p.date_of_birth, p.drug_allergy,
              d.full_name as doctor_name, d.license_link,
              ph.full_name as pharmacist_name
       FROM prescriptions pr
       JOIN visits v   ON pr.visit_id  = v.id
       JOIN patients p ON v.patient_id = p.id
       JOIN staff d    ON pr.doctor_id = d.id
       LEFT JOIN staff ph ON pr.pharmacist_id = ph.id
       WHERE pr.id = $1`,
      [req.params['id']]
    );
    if (!rows.length) { res.status(404).json({ success: false, message: 'ไม่พบใบสั่งยา' }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

export const dispense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pharmacist_id = req.user!.id;
    await db.query(
      "UPDATE prescriptions SET status = 'dispensed', pharmacist_id = $1, dispensed_at = NOW() WHERE id = $2",
      [pharmacist_id, req.params['id']]
    );
    const presc = await db.query('SELECT visit_id FROM prescriptions WHERE id = $1', [req.params['id']]);
    await db.query("UPDATE visits SET status = 'completed' WHERE id = $1", [presc.rows[0].visit_id]);
    res.json({ success: true, message: 'จ่ายยาสำเร็จ และปิดเคสแล้ว' });
  } catch (err) { next(err); }
};

export const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await db.query("UPDATE prescriptions SET status = 'cancelled' WHERE id = $1", [req.params['id']]);
    res.json({ success: true, message: 'ยกเลิกใบสั่งยาสำเร็จ' });
  } catch (err) { next(err); }
};
