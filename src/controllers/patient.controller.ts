import { Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { calculateLunarPhase, calculateZodiacSamutthana } from '../services/lunar/lunar.service';

/**
 * GET /api/v1/patients
 */
export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const search = (req.query['search'] as string) ?? '';
    const page   = parseInt((req.query['page']  as string) ?? '1', 10);
    const limit  = parseInt((req.query['limit'] as string) ?? '20', 10);
    const offset = (page - 1) * limit;
    const like   = `%${search}%`;

    const { rows } = await db.query(
      `SELECT *
       FROM patients
       WHERE national_id ILIKE $1 OR first_name ILIKE $2 OR last_name ILIKE $3
       ORDER BY updated_at DESC LIMIT $4 OFFSET $5`,
      [like, like, like, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM patients WHERE national_id ILIKE $1 OR first_name ILIKE $2 OR last_name ILIKE $3',
      [like, like, like]
    );

    res.json({
      success: true,
      data: rows,
      meta: { total: parseInt(countResult.rows[0].total, 10), page, limit },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/patients/search?national_id=xxx
 */
export const searchByNationalId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const nationalId = req.query['national_id'] as string;
    if (!nationalId) {
      res.status(400).json({ success: false, message: 'กรุณาระบุเลขบัตรประชาชน' });
      return;
    }
    const { rows } = await db.query(
      `SELECT p.*,
              v.vital_signs
       FROM patients p
       LEFT JOIN LATERAL (
         SELECT vital_signs
         FROM visits
         WHERE patient_id = p.id
         ORDER BY updated_at DESC, id DESC
         LIMIT 1
       ) v ON true
       WHERE p.national_id = $1
       LIMIT 1`,
      [nationalId]
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: 'ไม่พบข้อมูลคนไข้', data: null });
      return;
    }
    const row = rows[0];
    const vs = typeof row.vital_signs === 'string'
      ? (JSON.parse(row.vital_signs || '{}'))
      : (row.vital_signs || {});

    const patientData = {
      ...row,
      weight: vs.weight != null ? Number(vs.weight) : null,
      height: vs.height != null ? Number(vs.height) : null,
      bmi: vs.bmi != null ? Number(vs.bmi) : null,
      bmi_status: vs.bmi_status || null,
      bp_sys: vs.bp_sys != null ? Number(vs.bp_sys) : null,
      bp_dia: vs.bp_dia != null ? Number(vs.bp_dia) : null,
      temp: vs.temp != null ? Number(vs.temp) : null,
      pulse: vs.pulse != null ? Number(vs.pulse) : null,
    };
    res.json({ success: true, data: patientData });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/patients/:id
 */
export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await db.query('SELECT * FROM patients WHERE id = $1', [req.params['id']]);
    if (!rows.length) { res.status(404).json({ success: false, message: 'ไม่พบข้อมูลคนไข้' }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

/**
 * แปลงรูปแบบเวลาเป็น HH:mm:ss สำหรับบันทึกใน TIME
 */
function formatTimeToHHMMSS(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const clean = timeStr.replace(/[^0-9:]/g, '').trim();
  if (!clean) return null;
  const parts = clean.split(':');
  if (parts.length === 2) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    return `${hh}:${mm}:00`;
  }
  if (parts.length === 3) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const ss = parts[2].padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

/**
 * POST /api/v1/patients
 */
export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      national_id, prefix, first_name, last_name, date_of_birth,
      gender, phone, blood_type, allergy_notes,
      nationality, birth_day_of_week, birth_time, blood_group,
      house_no, moo, road, subdistrict, district, province, zipcode,
      drug_allergy, food_allergy, pmh, chronic_disease, lunar_birthday, body_element,
      geography, lunar_month, zodiac_year,
      birth_zodiac, birth_zodiac_element, birth_samutthana, birth_rakon, birth_element_desc,
      conception_lunar_month, conception_zodiac, conception_zodiac_element, conception_samutthana, conception_rakon, conception_element_desc,
    } = req.body as Record<string, any>;

    if (!national_id || national_id.length !== 13) {
      res.status(400).json({ success: false, message: 'เลขบัตรประชาชนต้องมี 13 หลัก' });
      return;
    }

    const existing = await db.query('SELECT id FROM patients WHERE national_id = $1', [national_id]);
    if (existing.rows.length) {
      res.status(409).json({ success: false, message: 'มีข้อมูลผู้ป่วยรายนี้ในระบบแล้ว' });
      return;
    }

    const lunar = calculateLunarPhase(new Date(date_of_birth));
    const effectiveBlood = blood_group ?? blood_type ?? 'unknown';
    const effectiveAllergy = drug_allergy ?? allergy_notes ?? null;
    const effectiveFoodAllergy = food_allergy ?? null;
    const formattedBirthTime = formatTimeToHHMMSS(birth_time);

    let effectiveLunarMonth = lunar_month ? parseInt(String(lunar_month), 10) : null;
    if (!effectiveLunarMonth && lunar_birthday) {
      const match = String(lunar_birthday).match(/เดือน\s*([0-9๑-๙]+)/);
      if (match) {
        const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
        const numStr = match[1].replace(/[๐-๙]/g, (d: string) => String(thaiDigits.indexOf(d)));
        effectiveLunarMonth = parseInt(numStr, 10);
      }
    }

    let zodiacCalc = null;
    if (effectiveLunarMonth && effectiveLunarMonth >= 1 && effectiveLunarMonth <= 12) {
      zodiacCalc = calculateZodiacSamutthana(lunar.phase, effectiveLunarMonth);
    }

    const effBirthZodiac = birth_zodiac ?? zodiacCalc?.birthZodiac ?? null;
    const effBirthElement = birth_zodiac_element ?? zodiacCalc?.birthZodiacElement ?? null;
    const effBirthSamutthana = birth_samutthana ?? zodiacCalc?.birthSamutthana ?? null;
    const effBirthRakon = birth_rakon ?? zodiacCalc?.birthRakon ?? null;
    const effBirthDesc = birth_element_desc ?? zodiacCalc?.birthElementDesc ?? null;

    const effConceptionMonth = conception_lunar_month ?? zodiacCalc?.conceptionLunarMonth ?? null;
    const effConceptionZodiac = conception_zodiac ?? zodiacCalc?.conceptionZodiac ?? null;
    const effConceptionElement = conception_zodiac_element ?? zodiacCalc?.conceptionZodiacElement ?? null;
    const effConceptionSamutthana = conception_samutthana ?? zodiacCalc?.conceptionSamutthana ?? null;
    const effConceptionRakon = conception_rakon ?? zodiacCalc?.conceptionRakon ?? null;
    const effConceptionDesc = conception_element_desc ?? zodiacCalc?.conceptionElementDesc ?? null;

    const { rows } = await db.query(
      `INSERT INTO patients
        (national_id, prefix, first_name, last_name, gender, nationality,
         date_of_birth, birth_day_of_week, birth_time, blood_group, phone,
         house_no, moo, road, subdistrict, district, province, zipcode,
         drug_allergy, food_allergy, pmh, chronic_disease, geography,
         lunar_birthday, lunar_phase, lunar_day, lunar_month, zodiac_year, body_element,
         birth_zodiac, birth_zodiac_element, birth_samutthana, birth_rakon, birth_element_desc,
         conception_lunar_month, conception_zodiac, conception_zodiac_element,
         conception_samutthana, conception_rakon, conception_element_desc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40)
       RETURNING *`,
      [
        national_id, prefix ?? 'นาย', first_name, last_name, gender ?? 'female', nationality ?? 'ไทย',
        date_of_birth, birth_day_of_week ?? null, formattedBirthTime, effectiveBlood, phone ?? null,
        house_no ?? null, moo ?? null, road ?? null, subdistrict ?? null, district ?? null, province ?? null, zipcode ?? null,
        effectiveAllergy, effectiveFoodAllergy, pmh ?? null, chronic_disease ?? null, geography ?? null,
        lunar_birthday ?? null, lunar.phase, lunar.day, effectiveLunarMonth, zodiac_year ?? null, body_element ?? null,
        effBirthZodiac, effBirthElement, effBirthSamutthana, effBirthRakon, effBirthDesc,
        effConceptionMonth, effConceptionZodiac, effConceptionElement,
        effConceptionSamutthana, effConceptionRakon, effConceptionDesc
      ]
    );

    res.status(201).json({ success: true, message: 'ลงทะเบียนผู้ป่วยสำเร็จ', data: rows[0] });
  } catch (err) { next(err); }
};

/**
 * PUT /api/v1/patients/:id
 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params['id'];
    const { rows: existingRows } = await db.query('SELECT * FROM patients WHERE id = $1', [patientId]);
    if (!existingRows.length) {
      res.status(404).json({ success: false, message: 'ไม่พบข้อมูลคนไข้' });
      return;
    }
    const current = existingRows[0];

    const {
      prefix, first_name, last_name, phone, blood_type, blood_group, allergy_notes,
      nationality, birth_day_of_week, birth_time, date_of_birth, house_no, moo, road, subdistrict, district, province, zipcode,
      drug_allergy, food_allergy, pmh, chronic_disease, geography, lunar_birthday, body_element,
      lunar_month, zodiac_year,
      birth_zodiac, birth_zodiac_element, birth_samutthana, birth_rakon, birth_element_desc,
      conception_lunar_month, conception_zodiac, conception_zodiac_element, conception_samutthana, conception_rakon, conception_element_desc,
    } = req.body;

    const effectiveBlood = blood_group !== undefined ? blood_group : (blood_type !== undefined ? blood_type : current.blood_group);
    const effectiveAllergy = drug_allergy !== undefined ? drug_allergy : (allergy_notes !== undefined ? allergy_notes : current.drug_allergy);
    const effectiveFoodAllergy = food_allergy !== undefined ? food_allergy : current.food_allergy;
    const formattedBirthTime = birth_time !== undefined
      ? (birth_time ? formatTimeToHHMMSS(birth_time) : null)
      : current.birth_time;

    const effectivePrefix = prefix !== undefined ? prefix : current.prefix;
    const effectiveFirstName = first_name !== undefined ? first_name : current.first_name;
    const effectiveLastName = last_name !== undefined ? last_name : current.last_name;
    const effectivePhone = phone !== undefined ? phone : current.phone;
    const effectiveNationality = nationality !== undefined ? nationality : current.nationality;
    const effectiveBirthDayOfWeek = birth_day_of_week !== undefined ? birth_day_of_week : current.birth_day_of_week;
    const effectiveDateOfBirth = date_of_birth !== undefined && date_of_birth !== null && date_of_birth !== ''
      ? date_of_birth
      : current.date_of_birth;

    const effectiveHouseNo = house_no !== undefined ? house_no : current.house_no;
    const effectiveMoo = moo !== undefined ? moo : current.moo;
    const effectiveRoad = road !== undefined ? road : current.road;
    const effectiveSubdistrict = subdistrict !== undefined ? subdistrict : current.subdistrict;
    const effectiveDistrict = district !== undefined ? district : current.district;
    const effectiveProvince = province !== undefined ? province : current.province;
    const effectiveZipcode = zipcode !== undefined ? zipcode : current.zipcode;
    const effectivePmh = pmh !== undefined ? pmh : current.pmh;
    const effectiveChronicDisease = chronic_disease !== undefined ? chronic_disease : current.chronic_disease;
    const effectiveGeography = geography !== undefined ? geography : current.geography;
    const effectiveLunarBirthday = lunar_birthday !== undefined ? lunar_birthday : current.lunar_birthday;
    const effectiveBodyElement = body_element !== undefined ? body_element : current.body_element;
    const effectiveLunarMonth = lunar_month !== undefined ? lunar_month : current.lunar_month;
    const effectiveZodiacYear = zodiac_year !== undefined ? zodiac_year : current.zodiac_year;
    const effectiveBirthZodiac = birth_zodiac !== undefined ? birth_zodiac : current.birth_zodiac;
    const effectiveBirthZodiacElement = birth_zodiac_element !== undefined ? birth_zodiac_element : current.birth_zodiac_element;
    const effectiveBirthSamutthana = birth_samutthana !== undefined ? birth_samutthana : current.birth_samutthana;
    const effectiveBirthRakon = birth_rakon !== undefined ? birth_rakon : current.birth_rakon;
    const effectiveBirthElementDesc = birth_element_desc !== undefined ? birth_element_desc : current.birth_element_desc;
    const effectiveConceptionLunarMonth = conception_lunar_month !== undefined ? conception_lunar_month : current.conception_lunar_month;
    const effectiveConceptionZodiac = conception_zodiac !== undefined ? conception_zodiac : current.conception_zodiac;
    const effectiveConceptionZodiacElement = conception_zodiac_element !== undefined ? conception_zodiac_element : current.conception_zodiac_element;
    const effectiveConceptionSamutthana = conception_samutthana !== undefined ? conception_samutthana : current.conception_samutthana;
    const effectiveConceptionRakon = conception_rakon !== undefined ? conception_rakon : current.conception_rakon;
    const effectiveConceptionElementDesc = conception_element_desc !== undefined ? conception_element_desc : current.conception_element_desc;

    await db.query(
      `UPDATE patients SET 
         prefix=$1, first_name=$2, last_name=$3, phone=$4, blood_group=$5,
         drug_allergy=$6, food_allergy=$7, nationality=$8, birth_day_of_week=$9, birth_time=$10,
         house_no=$11, moo=$12, road=$13, subdistrict=$14, district=$15, province=$16, zipcode=$17,
         pmh=$18, chronic_disease=$19, geography=$20, lunar_birthday=$21, body_element=$22,
         lunar_month=$23, zodiac_year=$24,
         birth_zodiac=$25, birth_zodiac_element=$26, birth_samutthana=$27, birth_rakon=$28, birth_element_desc=$29,
         conception_lunar_month=$30, conception_zodiac=$31, conception_zodiac_element=$32,
         conception_samutthana=$33, conception_rakon=$34, conception_element_desc=$35,
         date_of_birth=$36,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$37`,
      [
        effectivePrefix, effectiveFirstName, effectiveLastName, effectivePhone, effectiveBlood,
        effectiveAllergy, effectiveFoodAllergy, effectiveNationality, effectiveBirthDayOfWeek, formattedBirthTime,
        effectiveHouseNo, effectiveMoo, effectiveRoad, effectiveSubdistrict, effectiveDistrict, effectiveProvince, effectiveZipcode,
        effectivePmh, effectiveChronicDisease, effectiveGeography ?? null, effectiveLunarBirthday, effectiveBodyElement,
        effectiveLunarMonth ?? null, effectiveZodiacYear ?? null,
        effectiveBirthZodiac ?? null, effectiveBirthZodiacElement ?? null, effectiveBirthSamutthana ?? null, effectiveBirthRakon ?? null, effectiveBirthElementDesc ?? null,
        effectiveConceptionLunarMonth ?? null, effectiveConceptionZodiac ?? null, effectiveConceptionZodiacElement ?? null,
        effectiveConceptionSamutthana ?? null, effectiveConceptionRakon ?? null, effectiveConceptionElementDesc ?? null,
        effectiveDateOfBirth,
        patientId
      ]
    );
    res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/patients/:id/visits
 */
export const getVisitHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT v.*, s.full_name as doctor_name
       FROM visits v LEFT JOIN staff s ON v.doctor_id = s.id
       WHERE v.patient_id = $1 ORDER BY v.visit_date DESC LIMIT 20`,
      [req.params['id']]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};
