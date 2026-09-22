import { Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';
import db from '../config/database';
import { calculateLunarPhase } from '../services/lunar/lunar.service';

function parseDateForDb(val: any): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str === 'null' || str === 'undefined') return null;

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    const effY = y > 2400 ? y - 543 : y;
    return `${effY}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // D/M/YYYY or DD/MM/YYYY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let d = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        d = parseInt(parts[2], 10);
      }
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        if (y > 2400) y -= 543;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // Try standard parse
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    let y = dt.getFullYear();
    if (y > 2400) y -= 543;
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      patient_id, chief_complaint, vital_signs, doctor_id, status, diagnoses,
      clinical_history, physical_exam, ttm_exam, visit_date,
      illness_start_date, illness_start_time, illness_days,
      utu_samutthana, kala_samutthana, tridhatu_samutthana
    } = req.body;
    const effectiveDoctorId = doctor_id ?? (req.user?.role === 'doctor' ? req.user.id : null);
    const effectiveStatus = status || 'waiting';

    if (!patient_id) {
      res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน (ต้องระบุ patient_id)' });
      return;
    }

    let effectiveVisitDate = new Date();
    if (visit_date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(visit_date).trim())) {
        const now = new Date();
        const [y, m, d] = String(visit_date).trim().split('-').map(Number);
        effectiveVisitDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
      } else {
        const parsed = new Date(visit_date);
        if (!isNaN(parsed.getTime())) {
          effectiveVisitDate = parsed;
        }
      }
    }
    const lunar = calculateLunarPhase(effectiveVisitDate);
    const dbIllnessStartDate = parseDateForDb(illness_start_date);

    const insertResult = await db.query(
      `INSERT INTO visits 
        (patient_id, doctor_id, chief_complaint, vital_signs, status, visit_lunar_phase, visit_lunar_day, diagnoses, clinical_history, physical_exam, ttm_exam, visit_date,
         illness_start_date, illness_start_time, illness_days, utu_samutthana, kala_samutthana, tridhatu_samutthana)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        patient_id,
        effectiveDoctorId,
        chief_complaint != null ? String(chief_complaint).trim() : '',
        vital_signs ? JSON.stringify(vital_signs) : null,
        effectiveStatus,
        lunar.phase,
        lunar.day,
        diagnoses ? JSON.stringify(diagnoses) : null,
        clinical_history ? JSON.stringify(clinical_history) : null,
        physical_exam ? JSON.stringify(physical_exam) : null,
        ttm_exam ? JSON.stringify(ttm_exam) : null,
        effectiveVisitDate,
        dbIllnessStartDate,
        illness_start_time || null,
        illness_days != null ? Number(illness_days) : null,
        utu_samutthana ? JSON.stringify(utu_samutthana) : null,
        kala_samutthana ? JSON.stringify(kala_samutthana) : null,
        tridhatu_samutthana ? JSON.stringify(tridhatu_samutthana) : null
      ]
    );

    const newId = insertResult.rows[0].id;

    const { rows } = await db.query(
      `SELECT v.*, p.first_name, p.last_name, p.national_id, p.date_of_birth, p.lunar_phase as birth_lunar_phase
       FROM visits v JOIN patients p ON v.patient_id = p.id WHERE v.id = $1`,
      [newId]
    );
    res.status(201).json({ success: true, message: 'สร้างประวัติการรักษาสำเร็จ', data: rows[0] });
  } catch (err) { next(err); }
};

export const getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = req.query['status'] as string;
    const visitDate = req.query['date'] as string;

    let query = `
      SELECT v.*, p.prefix, p.first_name, p.last_name, p.national_id, p.date_of_birth,
             p.gender, p.blood_group, p.drug_allergy,
             p.phone, p.house_no, p.moo, p.road, p.subdistrict, p.district, p.province, p.zipcode,
             p.pmh, p.chronic_disease, p.geography, p.birth_day_of_week, p.birth_time,
             p.body_element, p.lunar_birthday, p.zodiac_year,
             p.birth_zodiac, p.birth_zodiac_element, p.birth_samutthana, p.birth_rakon, p.birth_element_desc,
             p.conception_lunar_month, p.conception_zodiac, p.conception_zodiac_element,
             p.conception_samutthana, p.conception_rakon, p.conception_element_desc,
             p.nationality,
             p.lunar_phase as birth_lunar_phase, p.lunar_day as birth_lunar_day,
             d.full_name as doctor_name, d.license_link as doctor_license,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', pr.id,
                  'prescription_no', pr.prescription_no,
                  'herbs', pr.herbs,
                  'notes', pr.notes
                )) FROM prescriptions pr WHERE pr.visit_id = v.id),
                '[]'::json
              ) as prescriptions,
             (SELECT json_build_object(
               'ai_response', a.ai_response,
               'references_used', a.references_used,
               'recommended_herbs', a.recommended_herbs,
               'confidence_score', a.confidence_score
             ) FROM ai_assessments a WHERE a.visit_id = v.id ORDER BY a.created_at DESC LIMIT 1) as ai_assessment
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN staff d ON v.doctor_id = d.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`v.status = $${params.length}`);
    }

    if (visitDate && visitDate !== 'all') {
      params.push(visitDate);
      conditions.push(`v.visit_date::date = $${params.length}`);
    }

    if (conditions.length) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY v.updated_at DESC, v.visit_date DESC, v.created_at DESC`;

    const { rows } = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT v.*, p.prefix, p.first_name, p.last_name, p.national_id,
             p.date_of_birth, p.gender, p.blood_group, p.drug_allergy,
             p.phone, p.house_no, p.moo, p.road, p.subdistrict, p.district, p.province, p.zipcode,
             p.pmh, p.chronic_disease, p.geography, p.birth_day_of_week, p.birth_time,
             p.body_element, p.lunar_birthday, p.zodiac_year,
             p.birth_zodiac, p.birth_zodiac_element, p.birth_samutthana, p.birth_rakon, p.birth_element_desc,
             p.conception_lunar_month, p.conception_zodiac, p.conception_zodiac_element,
             p.conception_samutthana, p.conception_rakon, p.conception_element_desc,
             p.nationality,
             p.lunar_phase as birth_lunar_phase, p.lunar_day as birth_lunar_day,
             d.full_name as doctor_name, d.license_link
       FROM visits v
       JOIN patients p ON v.patient_id = p.id
       LEFT JOIN staff d ON v.doctor_id = d.id
       WHERE v.id = $1`,
      [req.params['id']]
    );

    if (!rows.length) { res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการรักษา' }); return; }

    const assessments = await db.query('SELECT * FROM ai_assessments WHERE visit_id = $1 ORDER BY created_at DESC', [req.params['id']]);
    const prescriptions = await db.query('SELECT * FROM prescriptions   WHERE visit_id = $1 ORDER BY created_at DESC', [req.params['id']]);

    res.json({
      success: true,
      data: { ...rows[0], assessments: assessments.rows, prescriptions: prescriptions.rows },
    });
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      doctor_id, doctor_note, vital_signs, status, herbs, prescriptions, diagnoses,
      chief_complaint, clinical_history, physical_exam, ttm_exam, ai_assessment,
      illness_start_date, illness_start_time, illness_days,
      utu_samutthana, kala_samutthana, tridhatu_samutthana,
      notes, prescription_notes, ai_assessment_id
    } = req.body;
    const visitId = req.params['id'];
    const dbIllnessStartDate = parseDateForDb(illness_start_date);

    await db.query(
      `UPDATE visits SET
        doctor_id            = COALESCE($1, doctor_id),
        doctor_note          = COALESCE($2, doctor_note),
        vital_signs          = COALESCE($3, vital_signs),
        status               = COALESCE($4, status),
        diagnoses            = COALESCE($5, diagnoses),
        chief_complaint      = COALESCE($6, chief_complaint),
        clinical_history     = COALESCE($7, clinical_history),
        physical_exam        = COALESCE($8, physical_exam),
        ttm_exam             = COALESCE($9, ttm_exam),
        illness_start_date   = COALESCE($10, illness_start_date),
        illness_start_time   = COALESCE($11, illness_start_time),
        illness_days         = COALESCE($12, illness_days),
        utu_samutthana       = COALESCE($13, utu_samutthana),
        kala_samutthana      = COALESCE($14, kala_samutthana),
        tridhatu_samutthana  = COALESCE($15, tridhatu_samutthana),
        updated_at           = CURRENT_TIMESTAMP
       WHERE id = $16`,
      [
        doctor_id ?? null,
        doctor_note ?? null,
        vital_signs ? JSON.stringify(vital_signs) : null,
        status ?? null,
        diagnoses ? JSON.stringify(diagnoses) : null,
        chief_complaint ?? null,
        clinical_history ? JSON.stringify(clinical_history) : null,
        physical_exam ? JSON.stringify(physical_exam) : null,
        ttm_exam ? JSON.stringify(ttm_exam) : null,
        dbIllnessStartDate,
        illness_start_time ?? null,
        illness_days != null ? Number(illness_days) : null,
        utu_samutthana ? JSON.stringify(utu_samutthana) : null,
        kala_samutthana ? JSON.stringify(kala_samutthana) : null,
        tridhatu_samutthana ? JSON.stringify(tridhatu_samutthana) : null,
        visitId
      ]
    );

    // 1. บันทึกผลวิเคราะห์ AI ลงตาราง ai_assessments เพื่อนำมาแสดงใน History และเชื่อมโยง id
    let createdAiAssessmentId: number | null = ai_assessment_id ? Number(ai_assessment_id) : null;
    if (ai_assessment) {
      try {
        const aiResponse = ai_assessment.ai_response || (typeof ai_assessment === 'string' ? ai_assessment : '');
        const aiRefs = ai_assessment.references_used || [];
        const aiHerbs = ai_assessment.recommended_herbs || [];
        if (aiResponse) {
          const aiInsert = await db.query(
            `INSERT INTO ai_assessments
              (visit_id, query_text, ai_response, references_used, recommended_herbs, confidence_score, model_used)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              visitId,
              chief_complaint || 'ตรวจวินิจฉัยโรค',
              aiResponse,
              JSON.stringify(aiRefs),
              JSON.stringify(aiHerbs),
              0.95,
              'gemini-1.5-flash'
            ]
          );
          if (!createdAiAssessmentId && aiInsert.rows.length > 0) {
            createdAiAssessmentId = aiInsert.rows[0].id;
          }
        }
      } catch (aiErr) {
        console.warn('⚠️ Could not insert into ai_assessments:', aiErr);
      }
    }

    // 2. บันทึกรายการยาสมุนไพรลงตาราง prescriptions เพื่อผูกกับรอบการตรวจจริง
    let createdPrescription: any = null;
    const herbList = herbs || prescriptions;
    if (herbList && Array.isArray(herbList) && herbList.length > 0) {
      try {
        const today = dayjs().format('YYYYMMDD');
        const countResult = await db.query(
          "SELECT COUNT(*) as count FROM prescriptions WHERE created_at::date = CURRENT_DATE"
        );
        const seq = String(parseInt(countResult.rows[0]?.count || '0', 10) + 1).padStart(3, '0');
        const prescriptionNo = `RX-${today}-${seq}-${Date.now().toString().slice(-4)}`;
        const effectiveDocId = doctor_id ?? (req.user?.id || 1);
        const pNotes = notes || prescription_notes || null;

        const rxInsert = await db.query(
          `INSERT INTO prescriptions
            (visit_id, doctor_id, prescription_no, herbs, notes, ai_assessment_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            visitId,
            effectiveDocId,
            prescriptionNo,
            JSON.stringify(herbList),
            pNotes,
            createdAiAssessmentId
          ]
        );
        if (rxInsert.rows.length > 0) {
          createdPrescription = rxInsert.rows[0];
        }
      } catch (rxErr) {
        console.warn('⚠️ Could not insert into prescriptions:', rxErr);
      }
    }

    res.json({
      success: true,
      message: 'อัปเดตข้อมูลการรักษาสำเร็จ',
      data: { prescription: createdPrescription }
    });
  } catch (err) { next(err); }
};

export const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body as { status: string };
    const validStatuses = ['waiting', 'in_progress', 'waiting_doctor', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
      return;
    }
    await db.query('UPDATE visits SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params['id']]);
    res.json({ success: true, message: `เปลี่ยนสถานะเป็น "${status}" สำเร็จ` });
  } catch (err) { next(err); }
};
