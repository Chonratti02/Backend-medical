// ============================================================
//  Smart Herbal Clinic - Type Definitions
// ============================================================

export type StaffRole = 'admin' | 'doctor';
export type Gender    = 'male' | 'female';
export type LunarPhase = 'waxing' | 'waning';
export type BloodType  = 'A' | 'B' | 'AB' | 'O' | 'unknown';
export type VisitStatus = 'waiting' | 'in_progress' | 'waiting_doctor' | 'completed' | 'cancelled';
export type PrescriptionStatus = 'pending' | 'dispensed' | 'cancelled';

export interface Staff {
  id: number;
  username: string;
  password_hash?: string;
  full_name: string;
  role: StaffRole;
  license_link?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Patient {
  id: number;
  national_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  nationality?: string;
  date_of_birth: Date;
  birth_day_of_week?: string | null;
  birth_time?: string | null;
  blood_group?: string;
  phone?: string | null;

  // ที่อยู่
  house_no?: string | null;
  moo?: string | null;
  road?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  zipcode?: string | null;

  // ข้อมูลประวัติสุขภาพ
  drug_allergy?: string | null;
  food_allergy?: string | null;
  pmh?: string | null;
  chronic_disease?: string | null;

  // การแพทย์แผนไทย และจักราศีสมุฏฐาน
  lunar_birthday?: string | null;
  lunar_phase?: LunarPhase | null;
  lunar_day?: number | null;
  lunar_month?: number | null;
  zodiac_year?: string | null;
  body_element?: string | null;

  // 1. ธาตุประจำวันเกิดตามจักราศี
  birth_zodiac?: string | null;
  birth_zodiac_element?: string | null;
  birth_samutthana?: string | null;
  birth_rakon?: string | null;
  birth_element_desc?: string | null;

  // 2. ธาตุแรกปฏิสนธิตามจักราศี
  conception_lunar_month?: string | null;
  conception_zodiac?: string | null;
  conception_zodiac_element?: string | null;
  conception_samutthana?: string | null;
  conception_rakon?: string | null;
  conception_element_desc?: string | null;

  created_at: Date;
  updated_at: Date;
}

export type PersonalData = Patient;

export interface VitalSigns {
  bp?: string;
  pulse?: number;
  temp?: number;
  weight?: number;
  height?: number;
  bmi?: number;
}

export interface Visit {
  id: number;
  patient_id: number;
  doctor_id?: number | null;
  visit_date: Date;
  chief_complaint: string;
  vital_signs?: VitalSigns | null;
  status: VisitStatus;
  doctor_note?: string | null;
  diagnoses?: any[] | null;
  clinical_history?: any | null;
  physical_exam?: any | null;
  ttm_exam?: any | null;
  visit_lunar_phase?: LunarPhase | null;
  visit_lunar_day?: number | null;
  illness_start_date?: string | null;
  illness_start_time?: string | null;
  illness_days?: number | null;
  utu_samutthana?: any | null;
  kala_samutthana?: any | null;
  tridhatu_samutthana?: any | null;
  created_at: Date;
  updated_at: Date;
}

export interface HerbReference {
  title: string;
  page?: string;
  excerpt: string;
}

export interface RecommendedHerb {
  name: string;
  amount: number;
  unit: string;
  note?: string;
}

export interface AiAssessment {
  id: number;
  patient_id?: number | null;
  visit_id?: number | null;
  doctor_id?: number | null;
  query_text: string;
  symptoms_queried?: string[];
  patient_context?: any;
  ai_response: string;
  raw_ai_response?: string | null;
  structured_analysis?: any;
  matched_diseases?: any[];
  matched_herbs?: any[];
  knowledge_references?: any[];
  references_used: HerbReference[];
  recommended_herbs: RecommendedHerb[];
  confidence_score?: number | null;
  model_used?: string | null;
  token_usage?: any;
  processing_ms?: number | null;
  is_accepted_by_doctor?: boolean;
  doctor_feedback?: string | null;
  created_at: Date;
}

export interface PrescriptionHerb {
  name: string;
  role: string;
  role_name: string;
  detail?: string | null;
}

export interface Prescription {
  id: number;
  visit_id: number;
  doctor_id: number;
  ai_assessment_id?: number | null;
  prescription_no: string;
  herbs: PrescriptionHerb[];
  notes?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HerbalKnowledge {
  id: number;
  herb_name: string;
  herb_name_th?: string;
  herb_name_en?: string | null;
  herb_name_sci?: string | null;
  part_used?: string | null;
  taste?: string | null;
  properties?: string | null;
  category?: string | null;
  indications?: string | null;
  contraindications?: string | null;
  source_scripture?: string | null;
  source_page?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface Disease {
  id: number;
  code: string;
  name_th: string;
  name_en?: string | null;
  category: 'ttm' | 'icd10' | 'general';
  samutthana?: string | null;
  body_element?: string | null;
  source_scripture?: string | null;
  description?: string | null;
  symptoms?: string | null;
  recommended_treatment?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface VisitDiagnosis {
  id: number;
  visit_id: number;
  disease_id?: number | null;
  disease_code: string;
  disease_name_th: string;
  disease_name_en?: string | null;
  category: 'ttm' | 'icd10' | 'general';
  diagnosis_type: 'primary' | 'secondary' | 'other';
  doctor_id?: number | null;
  notes?: string | null;
  created_at: Date;
}

export interface LunarResult {
  phase: LunarPhase;
  day: number;
  phaseNameTh: string;
  description: string;
  moonAge: number;
}

export interface BodyElement {
  element: string;
  elementEn: string;
}

export interface RagAnalysisInput {
  symptoms: string;
  context?: PatientVisitContext;
}

export interface PatientVisitContext {
  gender?: Gender;
  blood_group?: string;
  lunar_phase?: LunarPhase;
  lunar_day?: number;
  visit_lunar_phase?: LunarPhase;
  visit_lunar_day?: number;
  drug_allergy?: string;
  food_allergy?: string;
  birth_time?: string | null;
  birth_day_of_week?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  body_element?: string | null;
  birth_zodiac?: string | null;
  birth_samutthana?: string | null;
  conception_zodiac?: string | null;
  geography?: string | null;
  illness_days?: number | null;
  bp?: string | null;
  pulse?: string | null;
  lunar_birthday?: string | null;
  lunar_month?: number | null;
  zodiac_year?: string | null;
  birth_zodiac_element?: string | null;
  birth_rakon?: string | null;
  birth_element_desc?: string | null;
  conception_lunar_month?: string | null;
  conception_zodiac_element?: string | null;
  conception_samutthana?: string | null;
  conception_rakon?: string | null;
  conception_element_desc?: string | null;
  chronic_disease?: string | null;
  pmh?: string | null;
  chief_complaint?: string | null;
  illness_start_date?: string | null;
  illness_start_time?: string | null;
  utu_samutthana?: any;
  kala_samutthana?: any;
  tridhatu_samutthana?: any;
  clinical_history?: any;
  physical_exam?: any;
  ttm_exam?: any;
  temp?: number | null;
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
  bmi_status?: string | null;
}

export interface HerbAnalysisItem {
  name: string;
  taste?: string; // รสยาหลัก เช่น รสเผ็ดร้อน, รสขม, รสสุขุม
  part_used?: string; // ส่วนที่ใช้ เช่น ราก, ใบ, ดอก, เปลือกต้น
  properties: string;
  usage: string;
  precautions: string;
  source: string;
}

export interface ProbableDiseaseItem {
  disease_name: string; // ชื่อโรค เช่น "โรคมุตรกฤจฉ์ (ทางเดินปัสสาวะอักเสบ/ขัดเบา)"
  probability_level: string; // เช่น "สูงมาก (High)", "สูง (High)", "ปานกลาง (Moderate)", "ต้องเฝ้าระวัง (Possible)"
  primary_cause: string; // สมุฏฐานเหตุแห่งโรค เช่น "ปิตตะและเสมหะระคนในระบบทางเดินปัสสาวะ"
  supporting_evidence: string; // ข้อมูลสนับสนุนจากอาการ ธาตุเจ้าเรือน เวลาเกิด อายุ หรือกาลสมุฏฐาน
  clinical_explanation?: string; // คำอธิบายการวินิจฉัยและการวิเคราะห์เชิงคลินิกอย่างละเอียด
  icd10_or_ttm_code?: string; // รหัสโรคหรือการจัดหมวดตามคัมภีร์
}

export interface SymptomAnalysisSection {
  symptom_title: string;
  has_knowledge: boolean;
  thai_diagnosis: string;
  description: string;
  herbs: HerbAnalysisItem[];
}

export interface MultiSymptomAnalysisResult {
  patient_summary: {
    name?: string;
    age?: number | null;
    gender?: string;
    weight?: number | null;
    height?: number | null;
    temperature?: number | null;
    bp?: string | null;
    pulse?: number | null;
    allergies?: string;
    chronic_disease?: string;
    smoking?: string;
    alcohol?: string;
    body_element?: string;
    utu_samutthana_summary?: string;
    kala_samutthana_summary?: string;
  };
  probable_diseases?: ProbableDiseaseItem[];
  symptoms_analysis: SymptomAnalysisSection[];
  overall_precautions: string;
  self_care: string;
  when_to_see_doctor: string;
  references: HerbReference[];
  confidence?: number;
  matched_diseases?: { id: number | null; disease_name: string; probability?: string }[];
  matched_herbs?: { id: number | null; herb_name: string; note?: string }[];
  user_prompt?: string;
  system_prompt?: string;
  raw_ai_response?: string | null;
  token_usage?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
  model_used?: string;
}

export interface RagAnalysisResult {
  response: string;
  references: HerbReference[];
  recommendedHerbs: RecommendedHerb[];
  confidence: number;
}

export interface KnowledgeDocument {
  id?: string;
  content: string;
  source: string;
  page?: string;
  category?: string;
}

export type EmbeddingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeUpload {
  id: number;
  title: string;
  category?: string;
  file_name?: string | null;
  file_path?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  raw_content?: string | null;
  total_chunks: number;
  embedding_status: EmbeddingStatus;
  error_message?: string | null;
  is_active: boolean;
  uploaded_by?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeChunk {
  id: number;
  upload_id: number;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  embedding?: number[];
  created_at: Date;
}

// ─── Express JWT Payload ─────────────────────────────────
export interface JwtPayload {
  id: number;
  role: StaffRole;
  name: string;
  iat?: number;
  exp?: number;
}

// ─── Augment Express Request ─────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
