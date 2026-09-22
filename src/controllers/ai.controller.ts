import { Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { ragService } from '../services/ai/rag.service';
import { processDocumentChunks } from '../services/ai/vector.service';
import { parsePDF, parseWord, parseExcel, parseCSV } from '../utils/fileParser';
import { PatientVisitContext } from '../models/types';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ─── Multer config — รองรับ Word, PDF, Excel, CSV ─────────
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Fix Mojibake Thai filename caused by busboy/multer decoding multipart headers as latin1
 */
export function fixUtf8Filename(fileName: string): string {
  if (!fileName) return fileName;
  const hasHighUnicode = Array.from(fileName).some((c) => c.charCodeAt(0) > 255);
  if (hasHighUnicode) return fileName;
  try {
    return Buffer.from(fileName, 'latin1').toString('utf8');
  } catch {
    return fileName;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const safeName = fixUtf8Filename(file.originalname);
    cb(null, `${unique}-${safeName}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const safeName = fixUtf8Filename(file.originalname);
  const ext = path.extname(safeName).toLowerCase();
  const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv'];
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('รองรับเฉพาะไฟล์ PDF, Word (.docx, .doc), Excel (.xlsx, .xls) และ CSV (.csv) เท่านั้น'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * POST /api/v1/ai/analyze
 * วิเคราะห์อาการผู้ป่วย (รองรับสูงสุด 5 อาการ พร้อมแนะนำสมุนไพรสูงสุดไม่เกิน 13 ชนิดต่อแต่ละอาการ แยก Section และ Strict Grounding 100%)
 */
export const analyze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      visit_id,
      symptoms,
      patient_id,
      national_id,
      name,
      weight,
      height,
      temperature,
      allergies,
      smoking,
      alcohol,
      birth_time,
      date_of_birth,
      age,
      gender,
      birth_day_of_week,
      body_element,
      birth_zodiac,
      birth_samutthana,
      conception_zodiac,
      geography,
      illness_days,
      bp,
      pulse,
    } = req.body as {
      visit_id?: number;
      symptoms: string | string[];
      patient_id?: number;
      national_id?: string;
      name?: string;
      weight?: number;
      height?: number;
      temperature?: number;
      allergies?: string;
      smoking?: string;
      alcohol?: string;
      birth_time?: string;
      date_of_birth?: string;
      age?: number;
      gender?: string;
      birth_day_of_week?: string;
      body_element?: string;
      birth_zodiac?: string;
      birth_samutthana?: string;
      conception_zodiac?: string;
      geography?: string;
      illness_days?: number;
      bp?: string;
      pulse?: string;
    };

    // แปลง symptoms เป็น Array ของอาการ (รองรับสูงสุด 5 อาการ)
    let symptomList: string[] = [];
    if (Array.isArray(symptoms)) {
      symptomList = symptoms.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
    } else if (typeof symptoms === 'string' && symptoms.trim()) {
      symptomList = symptoms
        .split(/[\n;；,，]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (symptomList.length === 0) {
      res.status(400).json({
        success: false,
        error: 'กรุณาระบุอาการสำคัญที่ต้องการวิเคราะห์ (สูงสุด 5 อาการ)',
        message: 'กรุณาระบุอาการสำคัญที่ต้องการวิเคราะห์ (สูงสุด 5 อาการ)',
      });
      return;
    }

    symptomList = symptomList.slice(0, 5);

    const patientData: any = {
      name: name || undefined,
      weight: weight != null ? Number(weight) : undefined,
      height: height != null ? Number(height) : undefined,
      temperature: temperature != null ? Number(temperature) : undefined,
      allergies: allergies || undefined,
      smoking: smoking || undefined,
      alcohol: alcohol || undefined,
      birth_time: birth_time || undefined,
      date_of_birth: date_of_birth || undefined,
      age: age != null ? Number(age) : undefined,
      gender: gender || undefined,
      birth_day_of_week: birth_day_of_week || undefined,
      body_element: body_element || undefined,
      birth_zodiac: birth_zodiac || undefined,
      birth_samutthana: birth_samutthana || undefined,
      conception_zodiac: conception_zodiac || undefined,
      geography: geography || undefined,
      illness_days: illness_days != null ? Number(illness_days) : undefined,
      bp: bp || undefined,
      pulse: pulse || undefined,
    };

    let context: PatientVisitContext | undefined;

    if (visit_id) {
      const visitResult = await db.query(
        `SELECT v.chief_complaint, v.vital_signs, v.visit_lunar_phase, v.visit_lunar_day,
                v.illness_start_date, v.illness_start_time, v.illness_days,
                v.utu_samutthana, v.kala_samutthana, v.tridhatu_samutthana,
                v.clinical_history, v.physical_exam, v.ttm_exam,
                p.prefix, p.first_name, p.last_name, p.date_of_birth, p.gender, p.blood_group,
                p.birth_time, p.birth_day_of_week, p.body_element,
                p.geography, p.lunar_birthday, p.lunar_phase, p.lunar_day, p.lunar_month, p.zodiac_year,
                p.birth_zodiac, p.birth_zodiac_element, p.birth_samutthana, p.birth_rakon, p.birth_element_desc,
                p.conception_lunar_month, p.conception_zodiac, p.conception_zodiac_element,
                p.conception_samutthana, p.conception_rakon, p.conception_element_desc,
                p.drug_allergy, p.chronic_disease, p.pmh
         FROM visits v JOIN patients p ON v.patient_id = p.id
         WHERE v.id = $1`,
        [visit_id]
      );
      if (visitResult.rows.length) {
        const row = visitResult.rows[0];
        context = row as PatientVisitContext;
        if (!patientData.name && row.first_name) {
          patientData.name = `${row.prefix || ''}${row.first_name} ${row.last_name || ''}`.trim();
        }
        if (!patientData.gender && row.gender) {
          patientData.gender = row.gender;
        }
        if (!patientData.birth_time && row.birth_time) {
          patientData.birth_time = row.birth_time;
        }
        if (!patientData.date_of_birth && row.date_of_birth) {
          patientData.date_of_birth = row.date_of_birth;
          if (patientData.age == null) {
            patientData.age = new Date().getFullYear() - new Date(row.date_of_birth).getFullYear();
          }
        }
        if (!patientData.body_element && row.body_element) {
          patientData.body_element = row.body_element;
        }
        if (!patientData.birth_zodiac && row.birth_zodiac) {
          patientData.birth_zodiac = row.birth_zodiac;
        }
        if (!patientData.birth_samutthana && row.birth_samutthana) {
          patientData.birth_samutthana = row.birth_samutthana;
        }
        if (!patientData.conception_zodiac && row.conception_zodiac) {
          patientData.conception_zodiac = row.conception_zodiac;
        }
        if (!patientData.geography && row.geography) {
          patientData.geography = row.geography;
        }
        if (patientData.illness_days == null && row.illness_days != null) {
          patientData.illness_days = Number(row.illness_days);
        }
        if (row.vital_signs) {
          let vs = row.vital_signs;
          if (typeof vs === 'string') {
            try { vs = JSON.parse(vs); } catch (e) {}
          }
          if (patientData.weight == null && vs?.weight != null) patientData.weight = Number(vs.weight);
          if (patientData.height == null && vs?.height != null) patientData.height = Number(vs.height);
          if (patientData.temperature == null && vs?.temp != null) patientData.temperature = Number(vs.temp);
          if (!patientData.bp && vs?.bp) patientData.bp = vs.bp;
          if (!patientData.pulse && vs?.pulse) patientData.pulse = vs.pulse;
        }
        if (!patientData.allergies && row.drug_allergy) {
          patientData.allergies = row.drug_allergy;
        }
      }
    } else if (patient_id || national_id) {
      const patientQuery = patient_id
        ? `SELECT prefix, first_name, last_name, date_of_birth, gender, blood_group,
                  birth_time, birth_day_of_week, body_element,
                  geography, lunar_birthday, lunar_phase, lunar_day, lunar_month, zodiac_year,
                  birth_zodiac, birth_zodiac_element, birth_samutthana, birth_rakon, birth_element_desc,
                  conception_lunar_month, conception_zodiac, conception_zodiac_element,
                  conception_samutthana, conception_rakon, conception_element_desc,
                  drug_allergy, chronic_disease, pmh
           FROM patients WHERE id = $1`
        : `SELECT prefix, first_name, last_name, date_of_birth, gender, blood_group,
                  birth_time, birth_day_of_week, body_element,
                  geography, lunar_birthday, lunar_phase, lunar_day, lunar_month, zodiac_year,
                  birth_zodiac, birth_zodiac_element, birth_samutthana, birth_rakon, birth_element_desc,
                  conception_lunar_month, conception_zodiac, conception_zodiac_element,
                  conception_samutthana, conception_rakon, conception_element_desc,
                  drug_allergy, chronic_disease, pmh
           FROM patients WHERE national_id = $1`;
      const pRes = await db.query(patientQuery, [patient_id || national_id]);
      if (pRes.rows.length) {
        const row = pRes.rows[0];
        context = row as PatientVisitContext;
        if (!patientData.name && row.first_name) {
          patientData.name = `${row.prefix || ''}${row.first_name} ${row.last_name || ''}`.trim();
        }
        if (!patientData.gender && row.gender) {
          patientData.gender = row.gender;
        }
        if (!patientData.birth_time && row.birth_time) {
          patientData.birth_time = row.birth_time;
        }
        if (!patientData.date_of_birth && row.date_of_birth) {
          patientData.date_of_birth = row.date_of_birth;
          if (patientData.age == null) {
            patientData.age = new Date().getFullYear() - new Date(row.date_of_birth).getFullYear();
          }
        }
        if (!patientData.body_element && row.body_element) {
          patientData.body_element = row.body_element;
        }
        if (!patientData.birth_zodiac && row.birth_zodiac) {
          patientData.birth_zodiac = row.birth_zodiac;
        }
        if (!patientData.birth_samutthana && row.birth_samutthana) {
          patientData.birth_samutthana = row.birth_samutthana;
        }
        if (!patientData.conception_zodiac && row.conception_zodiac) {
          patientData.conception_zodiac = row.conception_zodiac;
        }
        if (!patientData.geography && row.geography) {
          patientData.geography = row.geography;
        }
        if (!patientData.allergies && row.drug_allergy) {
          patientData.allergies = row.drug_allergy;
        }
      }
    }

    // รวมข้อมูล OPD Fields และ Samutthana ที่คำนวณจาก Client เข้ากับ Context อย่างครบถ้วน
    if (!context) {
      context = {} as PatientVisitContext;
    }
    if (req.body.context && typeof req.body.context === 'object') {
      context = { ...context, ...req.body.context };
    }
    const extraFields = [
      'clinical_history',
      'physical_exam',
      'ttm_exam',
      'utu_samutthana',
      'kala_samutthana',
      'tridhatu_samutthana',
      'chief_complaint',
      'illness_start_date',
      'illness_start_time',
      'illness_days',
      'blood_group',
      'chronic_disease',
      'pmh',
      'bmi',
      'bmi_status',
      'present_illness',
      'lunar_birthday',
      'zodiac_year',
      'birth_zodiac_element',
      'birth_rakon',
      'birth_element_desc',
      'conception_lunar_month',
      'conception_zodiac_element',
      'conception_samutthana',
      'conception_rakon',
      'conception_element_desc',
    ];
    for (const key of extraFields) {
      if ((req.body as any)[key] !== undefined && (context as any)[key] === undefined) {
        (context as any)[key] = (req.body as any)[key];
      }
    }
    if ((req.body as any).present_illness && !(patientData as any).present_illness) {
      (patientData as any).present_illness = (req.body as any).present_illness;
    }

    const startTime = Date.now();
    const result = await ragService.analyzeMultiSymptom({
      symptoms: symptomList,
      patientData,
      context,
    });
    const processingMs = Date.now() - startTime;

    let responseData: any = {
      query_text: symptomList.join(', '),
      symptoms: symptomList,
      patient_summary: result.patient_summary,
      probable_diseases: result.probable_diseases ?? [],
      symptoms_analysis: result.symptoms_analysis,
      overall_precautions: result.overall_precautions,
      self_care: result.self_care,
      when_to_see_doctor: result.when_to_see_doctor,
      ai_response: result.textResponse,
      references_used: result.references ?? [],
      recommended_herbs: result.flatHerbs ?? [],
      drugs: result.drugs ?? [],
      confidence_score: result.confidence ?? 0.95,
      model_used: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
      processing_ms: processingMs,
    };

    const doctorId = (req as any).user?.id || null;
    let resolvedPatientId = patient_id || null;
    if (!resolvedPatientId && visit_id) {
      const pLookup = await db.query('SELECT patient_id FROM visits WHERE id = $1', [visit_id]);
      if (pLookup.rows.length) {
        resolvedPatientId = pLookup.rows[0].patient_id;
      }
    }

    if (visit_id || resolvedPatientId) {
      const insertResult = await db.query(
        `INSERT INTO ai_assessments
          (visit_id, patient_id, doctor_id, query_text, symptoms_queried, patient_context,
           raw_ai_response, structured_analysis,
           matched_diseases, matched_herbs, knowledge_references,
           ai_response, references_used, recommended_herbs, confidence_score, model_used, processing_ms, token_usage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          visit_id || null,
          resolvedPatientId,
          doctorId,
          symptomList.join(', '),
          JSON.stringify(symptomList),
          JSON.stringify(patientData),
          (result as any).raw_ai_response || null,
          JSON.stringify({
            patient_summary: result.patient_summary,
            probable_diseases: result.probable_diseases,
            symptoms_analysis: result.symptoms_analysis,
            overall_precautions: result.overall_precautions,
            self_care: result.self_care,
            when_to_see_doctor: result.when_to_see_doctor,
          }),
          JSON.stringify((result as any).matched_diseases || []),
          JSON.stringify((result as any).matched_herbs || []),
          JSON.stringify(result.references || []),
          result.textResponse,
          JSON.stringify(result.references ?? []),
          JSON.stringify(result.flatHerbs ?? []),
          result.confidence ?? 0.95,
          (result as any).model_used || process.env.GEMINI_MODEL || 'gemini-3.5-flash',
          processingMs,
          (result as any).token_usage ? JSON.stringify((result as any).token_usage) : null,
        ]
      );
      responseData = {
        ...responseData,
        id: insertResult.rows[0]?.id,
        created_at: insertResult.rows[0]?.created_at,
        token_usage: (result as any).token_usage || null,
        confidence_score: result.confidence ?? 0.95,
      };
    }

    res.json({
      success: true,
      message: 'วิเคราะห์อาการและสืบค้นคัมภีร์สำเร็จ (Strict Grounding 100%)',
      data: responseData,
      assessment_id: responseData.id,
      token_usage: (result as any).token_usage || null,
      confidence_score: result.confidence ?? 0.95,
      probable_diseases: result.probable_diseases ?? [],
      drugs: result.drugs ?? [],
      symptoms_analysis: result.symptoms_analysis,
      processing_ms: processingMs,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/ai/assessments/:visitId
 */
export const getByVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM ai_assessments WHERE visit_id = $1 ORDER BY created_at DESC',
      [req.params['visitId']]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/ai/assessments/:id/feedback
 * บันทึกผลตอบรับและความเห็นของแพทย์ต่อการวินิจฉัยของ AI (Audit & RLHF Loop)
 */
export const updateAssessmentFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { is_accepted_by_doctor, doctor_feedback } = req.body;
    const { rows } = await db.query(
      `UPDATE ai_assessments
       SET is_accepted_by_doctor = COALESCE($1, is_accepted_by_doctor),
           doctor_feedback = COALESCE($2, doctor_feedback)
       WHERE id = $3
       RETURNING *`,
      [is_accepted_by_doctor, doctor_feedback, id]
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: 'Assessment not found' });
      return;
    }
    res.json({ success: true, message: 'บันทึกความเห็นของแพทย์สำเร็จ', data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/ai/knowledge/uploads
 * รายการเอกสารความรู้ทั้งหมดในระบบ
 */
export const getKnowledgeUploads = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { rows } = await db.query(`
      SELECT id, title, category, 
             file_name, file_type, file_size_bytes, total_chunks, 
             embedding_status, error_message, is_active,
             LEFT(raw_content, 300) AS preview,
             created_at, updated_at
      FROM knowledge_uploads
      ORDER BY created_at DESC
    `);

    const sanitizedRows = rows.map((r: any) => ({
      ...r,
      file_name: fixUtf8Filename(r.file_name),
    }));

    res.json({
      success: true,
      data: sanitizedRows,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/ai/knowledge/upload
 * อัปโหลดไฟล์เอกสาร (PDF, Word, Excel, CSV) และเริ่ม Background Chunking + Vectorization
 */
export const uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์เอกสาร' });
      return;
    }

    const originalname = fixUtf8Filename(req.file.originalname);
    const ext = path.extname(originalname).toLowerCase();
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    // 1. สกัดข้อความตามชนิดไฟล์
    let rawText = '';
    try {
      if (ext === '.pdf') {
        rawText = await parsePDF(fileBuffer);
      } else if (ext === '.docx' || ext === '.doc') {
        rawText = await parseWord(fileBuffer);
      } else if (ext === '.xlsx' || ext === '.xls') {
        rawText = await parseExcel(fileBuffer);
      } else if (ext === '.csv') {
        rawText = await parseCSV(fileBuffer);
      } else {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(400).json({ success: false, message: 'ประเภทไฟล์ไม่ถูกต้อง' });
        return;
      }
    } catch (parseErr: any) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(400).json({
        success: false,
        message: `ไม่สามารถอ่านเนื้อหาไฟล์ได้: ${parseErr.message}`,
      });
      return;
    }

    if (!rawText || !rawText.trim()) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(400).json({ success: false, message: 'ไม่พบเนื้อหาข้อความในไฟล์ กรุณาตรวจสอบไฟล์อีกครั้ง' });
      return;
    }

    const title = (req.body['title'] as string)?.trim() || originalname;
    const category = (req.body['category'] as string)?.trim() || 'โรค';
    const uploadedBy = (req as any).user?.id || null;

    // 2. บันทึก Metadata และเนื้อหาดิบลงใน knowledge_uploads
    const { rows } = await db.query(
      `INSERT INTO knowledge_uploads 
        (title, category, file_name, file_path, file_type, 
         file_size_bytes, raw_content, embedding_status, is_active, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', TRUE, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, title, file_name, file_type, file_size_bytes, embedding_status, created_at`,
      [
        title,
        category,
        originalname,
        filePath,
        ext.replace('.', ''),
        req.file.size,
        rawText,
        uploadedBy,
      ]
    );

    const newDoc = rows[0];

    // 3. เริ่มกระบวนการ Chunking และแปลงเป็น Vector ในเบื้องหลัง (Asynchronous)
    processDocumentChunks(newDoc.id, rawText, {
      fileName: originalname,
      fileType: ext.replace('.', ''),
      fileSize: req.file.size,
    }).catch((err) => {
      console.error(`Background chunking error for document ${newDoc.id}:`, err);
    });

    res.status(201).json({
      success: true,
      message: `อัปโหลดเอกสาร "${title}" เรียบร้อยแล้ว กำลังประมวลผล Vector ในเบื้องหลัง`,
      data: newDoc,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/ai/knowledge/uploads/:id
 * ลบเอกสารและ Chunks/Vectors ที่เกี่ยวข้องทั้งหมด
 */
export const deleteKnowledgeUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'รหัสเอกสารไม่ถูกต้อง' });
      return;
    }

    // ดึงที่อยู่ไฟล์เพื่อลบไฟล์บน disk ถ้ามี
    const { rows } = await db.query('SELECT file_path FROM knowledge_uploads WHERE id = $1', [id]);
    if (!rows.length) {
      res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการลบ' });
      return;
    }

    const filePath = rows[0].file_path;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn('Could not delete physical file:', e);
      }
    }

    // ลบในฐานข้อมูล (knowledge_chunks จะถูกลบตาม CASCADE)
    await db.query('DELETE FROM knowledge_uploads WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'ลบเอกสารและเวกเตอร์ที่เกี่ยวข้องเรียบร้อยแล้ว',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/ai/knowledge/uploads/:id/toggle
 * สลับสถานะเปิด/ปิดการใช้งานเอกสารในระบบ RAG
 */
export const toggleKnowledgeActive = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'รหัสเอกสารไม่ถูกต้อง' });
      return;
    }

    const { rows } = await db.query(
      `UPDATE knowledge_uploads 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, title, is_active`,
      [id]
    );

    if (!rows.length) {
      res.status(404).json({ success: false, message: 'ไม่พบเอกสาร' });
      return;
    }

    const statusText = rows[0].is_active ? 'เปิดใช้งาน' : 'ปิดการใช้งาน';
    res.json({
      success: true,
      message: `${statusText}เอกสาร "${rows[0].title}" ในระบบ AI RAG แล้ว`,
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/ai/knowledge/uploads/:id/retry
 * ลองประมวลผล Vector ใหม่อีกครั้งสำหรับเอกสารที่ล้มเหลว
 */
export const retryKnowledgeUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'รหัสเอกสารไม่ถูกต้อง' });
      return;
    }

    const { rows } = await db.query('SELECT id, file_name, file_type, file_size_bytes, raw_content FROM knowledge_uploads WHERE id = $1', [id]);
    if (!rows.length) {
      res.status(404).json({ success: false, message: 'ไม่พบเอกสาร' });
      return;
    }

    const doc = rows[0];
    if (!doc.raw_content) {
      res.status(400).json({ success: false, message: 'เอกสารนี้ไม่มีเนื้อหาข้อความ ไม่สามารถประมวลผลใหม่ได้' });
      return;
    }

    // เริ่มคำนวณเบื้องหลัง
    processDocumentChunks(doc.id, doc.raw_content, {
      fileName: doc.file_name,
      fileType: doc.file_type,
      fileSize: doc.file_size_bytes,
    }).catch((err) => {
      console.error(`Retry background chunking error for document ${doc.id}:`, err);
    });

    res.json({
      success: true,
      message: 'เริ่มการประมวลผล Vector ใหม่อีกครั้งแล้ว',
    });
  } catch (err) {
    next(err);
  }
};
