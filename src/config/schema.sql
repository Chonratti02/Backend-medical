-- ============================================================
--  Smart Herbal Clinic System - Full PostgreSQL + pgvector Schema
--  Database: smart_herbal_clinic
-- ============================================================

-- 0. เปิดใช้งาน Extension pgvector สำหรับจัดเก็บและค้นหา Vector Embedding
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- 1. ตารางเจ้าหน้าที่ / บุคลากรทางการแพทย์ (Staff)       น่าจะใช้ได้ละ น่าจะ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,                                      -- รหัสเจ้าหน้าที่ (Primary Key รันอัตโนมัติ)
    username VARCHAR(50) NOT NULL UNIQUE,                       -- ชื่อผู้ใช้สำหรับเข้าสู่ระบบ
    password_hash VARCHAR(255) NOT NULL,                        -- รหัสผ่านเข้ารหัสด้วย bcrypt
    full_name VARCHAR(100) NOT NULL,                            -- ชื่อ-นามสกุลจริงของเจ้าหน้าที่/แพทย์
    role VARCHAR(20) NOT NULL DEFAULT 'doctor'                  -- บทบาทผู้ใช้
        CHECK (role IN ('admin', 'doctor')),
    license_link TEXT DEFAULT NULL,                             -- เลขที่หรือลิงก์ใบประกอบวิชาชีพ (สำหรับแพทย์)
    is_active BOOLEAN NOT NULL DEFAULT FALSE,                    -- สถานะใช้งาน: TRUE=เปิด, FALSE=ปิด
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- วัน-เวลาที่สร้างบัญชี
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP  -- วัน-เวลาที่แก้ไขล่าสุด
);

CREATE INDEX IF NOT EXISTS idx_staff_username ON staff(username);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);

-- ------------------------------------------------------------
-- 2. ตารางข้อมูลผู้ป่วย / ข้อมูลส่วนตัว (Patients / Personal Data)
--    รองรับข้อมูลตามแบบฟอร์ม OPD (Personal Data Form) ทั้งหมด      น่าจะใช้ได้ละ น่าจะ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,                                      -- รหัสคนไข้ (Primary Key รันอัตโนมัติ)
    national_id VARCHAR(13) NOT NULL UNIQUE,                    -- เลขบัตรประจำตัวประชาชน 13 หลัก (มี Unique Index อัตโนมัติ)
    prefix VARCHAR(20) NOT NULL ,                               -- คำนำหน้าชื่อ (prefix) เช่น นาย, นาง, นางสาว
    first_name VARCHAR(100) NOT NULL,                           -- ชื่อจริง (firstName / first_name)
    last_name VARCHAR(100) NOT NULL,                            -- นามสกุล (lastName / last_name)
    gender VARCHAR(10) NOT NULL                                 -- เพศ (gender)
        CHECK (gender IN ('male', 'female')),
    nationality VARCHAR(50) NOT NULL DEFAULT 'ไทย',             -- สัญชาติ
    date_of_birth DATE NOT NULL,                                -- วันเกิด (birthday / date_of_birth)
    birth_day_of_week VARCHAR(20) DEFAULT NULL,                 -- วันเกิดในสัปดาห์ (เช่น วันจันทร์, วันอังคาร)
    birth_time TIME DEFAULT NULL,                               -- เวลาเกิด รูปแบบ HH:MM:SS (birthtime / birth_time)
    blood_group VARCHAR(10) DEFAULT 'unknown',                  -- กลุ่มเลือด (bloodgroup / blood_group) เช่น A, B, AB, O
    phone VARCHAR(20) DEFAULT NULL,                             -- เบอร์โทรศัพท์ (phone)
    
    -- ข้อมูลที่อยู่ตามแบบฟอร์ม
    house_no VARCHAR(50) DEFAULT NULL,                          -- บ้านเลขที่
    moo VARCHAR(50) DEFAULT NULL,                               -- หมู่ / ชุมชน
    road VARCHAR(100) DEFAULT NULL,                             -- ถนน / ซอย
    subdistrict VARCHAR(100) DEFAULT NULL,                      -- ตำบล / แขวง
    district VARCHAR(100) DEFAULT NULL,                         -- อำเภอ / เขต
    province VARCHAR(100) DEFAULT NULL,                         -- จังหวัด
    zipcode VARCHAR(10) DEFAULT NULL,                           -- รหัสไปรษณีย์

    -- ข้อมูลประวัติสุขภาพ
    drug_allergy TEXT DEFAULT NULL,                             -- ประวัติการแพ้ยา
    food_allergy TEXT DEFAULT NULL,                             -- ประวัติการแพ้อาหาร
    pmh TEXT DEFAULT NULL,                                      -- PMH โรคประจำตัว (Past Medical History / ประวัติการเจ็บป่วยในอดีต)
    chronic_disease TEXT DEFAULT NULL,                          -- โรคประจำตัว

    -- ข้อมูลการแพทย์แผนไทยและจักราศีสมุฏฐาน (Zodiac Samutthana & Thai Traditional Medicine)
    geography VARCHAR(50) DEFAULT NULL,                         -- ประเทศสมุฏฐาน (ถิ่นที่อยู่ เช่น muddy_rain, mountain, sandy, muddy_sea)
    lunar_birthday VARCHAR(100) DEFAULT NULL,                   -- วันเกิดทางจันทรคติ (เช่น ขึ้น 7 ค่ำ เดือน 10 ปีมะเส็ง)
    lunar_phase VARCHAR(10) DEFAULT NULL                        -- ข้างขึ้น (waxing) / ข้างแรม (waning)
        CHECK (lunar_phase IN ('waxing', 'waning')),
    lunar_day INT DEFAULT NULL,                                 -- ค่ำ (1-15)
    lunar_month INT DEFAULT NULL,                               -- เดือนทางจันทรคติ (1-12)
    zodiac_year VARCHAR(20) DEFAULT NULL,                       -- ปีนักษัตร (เช่น ปีมะเส็ง, ปีมะเมีย)
    body_element VARCHAR(50) DEFAULT NULL,                      -- ธาตุเจ้าเรือนเดิม (ปถวีธาตุ, อาโปธาตุ, วาโยธาตุ, เตโชธาตุ)

    -- 1. ธาตุประจำวันเกิดตามจักราศี (Birth Zodiac Samutthana)
    birth_zodiac VARCHAR(50) DEFAULT NULL,                      -- ราศีประจำวันเกิด (เช่น ราศีกันย์)
    birth_zodiac_element VARCHAR(50) DEFAULT NULL,              -- ธาตุประจำวันเกิด (เช่น ธาตุลม, ธาตุไฟ, ธาตุน้ำ, ธาตุดิน)
    birth_samutthana VARCHAR(100) DEFAULT NULL,                 -- สมุฏฐานและสภาวะวันเกิด (เช่น ปถวีสมุฏฐานหย่อน)
    birth_rakon VARCHAR(100) DEFAULT NULL,                      -- สิ่งระคนวันเกิด (เช่น อุทริยะระคน, พัทธะปิตตะระคน)
    birth_element_desc VARCHAR(255) DEFAULT NULL,               -- สรุปธาตุประจำวันเกิดเต็ม (เช่น ธาตุลม ปถวีสมุฏฐานหย่อน อุทริยะระคน ราศีกันย์)

    -- 2. ธาตุแรกปฏิสนธิตามจักราศี (Conception Zodiac Samutthana - ถอยหลัง 9 เดือน)
    conception_lunar_month VARCHAR(50) DEFAULT NULL,            -- เดือนปฏิสนธิทางจันทรคติ (เช่น เดือน ๑)
    conception_zodiac VARCHAR(50) DEFAULT NULL,                 -- ราศีปฏิสนธิ (เช่น ราศีธนู)
    conception_zodiac_element VARCHAR(50) DEFAULT NULL,         -- ธาตุปฏิสนธิ (เช่น ธาตุน้ำ, ธาตุดิน)
    conception_samutthana VARCHAR(100) DEFAULT NULL,            -- สมุฏฐานและสภาวะปฏิสนธิ (เช่น เตโชเจ้าสมุฏฐานพิการ)
    conception_rakon VARCHAR(100) DEFAULT NULL,                 -- สิ่งระคนปฏิสนธิ (เช่น กำเดาระคน)
    conception_element_desc VARCHAR(255) DEFAULT NULL,          -- สรุปธาตุปฏิสนธิเต็ม (เช่น ธาตุน้ำ เตโชเจ้าสมุฏฐานพิการ กำเดาระคน ราศีธนู)

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- วัน-เวลาที่ลงทะเบียน
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP  -- วัน-เวลาที่มีการแก้ไขข้อมูลล่าสุด
);

-- Indexes สำหรับ Patients (ตัด idx_patients_national_id ออกเพราะมี UNIQUE Index อัตโนมัติแล้ว)
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_dob ON patients(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_patients_birth_zodiac ON patients(birth_zodiac);
CREATE INDEX IF NOT EXISTS idx_patients_conception_zodiac ON patients(conception_zodiac);

-- ------------------------------------------------------------
-- 3. ตารางการตรวจรักษา / ประวัติการมาตรวจ (Visits)     ยังไม่เช็คทั้งหมด อาจขาดบางฟิล
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,                                      -- รหัสการตรวจรักษา (Primary Key)
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, -- รหัสคนไข้ FK -> patients(id)
    doctor_id INT DEFAULT NULL REFERENCES staff(id) ON DELETE SET NULL,  -- รหัสแพทย์ผู้ตรวจรักษา FK -> staff(id)
    visit_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- วัน-เวลาที่มาตรวจ
    chief_complaint TEXT NOT NULL,                              -- อาการสำคัญที่มาตรวจ (Chief Complaint)
    vital_signs JSONB DEFAULT NULL,                             -- สัญญาณชีพในรูปแบบ JSONB (bp, pulse, temp, weight, height, bmi ฯล)
    status VARCHAR(20) NOT NULL DEFAULT 'waiting'               -- สถานะคิวตรวจ
        CHECK (status IN ('waiting', 'in_progress', 'waiting_doctor', 'completed', 'cancelled')),
    doctor_note TEXT DEFAULT NULL,                              -- บันทึกการตรวจและการวินิจฉัยของแพทย์
    diagnoses JSONB DEFAULT NULL,                               -- รายการโรคที่วินิจฉัย (ICD-10 และ แพทย์แผนไทย TTM ทั้ง Primary / Secondary) ในรูปแบบ JSONB
    clinical_history JSONB DEFAULT NULL,                        -- ประวัติการซักประวัติ 5 ด้านอย่างละเอียด (present_illness, past_history, family_history, personal_history ฯลฯ) ในรูปแบบ JSONB
    physical_exam JSONB DEFAULT NULL,                           -- ผลการตรวจร่างกายทั่วไป 10 ระบบ (pe_ga, pe_heent, pe_heart, pe_chest, pe_abdomen, pe_pv, pe_pr, pe_genitalia, pe_neuro, pe_extremities) ในรูปแบบ JSONB
    ttm_exam JSONB DEFAULT NULL,                                -- ผลการตรวจเวชกรรมไทย 10 หมวด (ttm_ear, ttm_tongue, ttm_eye, ttm_nose, ttm_pulse_tridhatu, ttm_inspect, ttm_palpate, ttm_percuss, ttm_auscultate, ttm_diagnosis) ในรูปแบบ JSONB
    visit_lunar_phase VARCHAR(10) DEFAULT NULL                  -- ข้างขึ้นข้างแรมในวันที่มาตรวจ
        CHECK (visit_lunar_phase IN ('waxing', 'waning')),
    visit_lunar_day INT DEFAULT NULL,                           -- ค่ำในวันที่มาตรวจ (1-15)
    illness_start_date DATE DEFAULT NULL,                       -- วันที่เริ่มป่วย
    illness_start_time TIME DEFAULT NULL,                       -- เวลาที่เริ่มป่วย
    illness_days INT DEFAULT NULL,                              -- จำนวนวันที่ป่วย (เป็นมาแล้วกี่วัน)
    utu_samutthana JSONB DEFAULT NULL,                          -- ข้อมูลอุตุสมุฏฐาน 3 และช่วง 40 วันย่อย
    kala_samutthana JSONB DEFAULT NULL,                         -- ข้อมูลกาลสมุฏฐานและช่วงเวลากำเริบ
    tridhatu_samutthana JSONB DEFAULT NULL,                     -- ข้อมูลสมุฏฐานโทษ 3 สถาน (ชาติเอกโทษ, จลนทุวันโทษ, ภินนะตรีโทษ)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_doctor_id ON visits(doctor_id);
CREATE INDEX IF NOT EXISTS idx_visits_status_date ON visits(status, visit_date);

-- ------------------------------------------------------------
-- 4. ตารางผลการวิเคราะห์ด้วย AI / RAG Assessment (Redesigned)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_assessments (
    id SERIAL PRIMARY KEY,                                      -- รหัสผลการประเมิน
    patient_id INT DEFAULT NULL REFERENCES patients(id) ON DELETE CASCADE, -- เชื่อมโยงกับคนไข้
    visit_id INT DEFAULT NULL REFERENCES visits(id) ON DELETE SET NULL,    -- เชื่อมโยงกับประวัติการมาตรวจ FK -> visits(id)
    doctor_id INT DEFAULT NULL REFERENCES staff(id) ON DELETE SET NULL,    -- แพทย์ที่ส่งวิเคราะห์
    query_text TEXT NOT NULL,                                   -- ข้อความคำถามหรือข้อมูลอาการที่ส่งให้ AI วิเคราะห์
    symptoms_queried JSONB DEFAULT '[]'::jsonb,                 -- รายการอาการที่ส่งวิเคราะห์ (JSONB array)
    patient_context JSONB DEFAULT NULL,                         -- ข้อมูลบริบทคนไข้ (อายุ, ธาตุ, สัญญาณชีพ, ประวัติแพ้ยา)
    ai_response TEXT NOT NULL,                                  -- ข้อความผลวิเคราะห์จาก AI
    raw_ai_response TEXT DEFAULT NULL,                          -- Raw Response จาก AI
    structured_analysis JSONB DEFAULT NULL,                     -- JSON วิเคราะห์แยกหมวดหมู่ (probable_diseases, symptoms_analysis, precautions)
    matched_diseases JSONB DEFAULT '[]'::jsonb,                 -- โรคที่ตรงกับตาราง diseases (id, disease_name)
    matched_herbs JSONB DEFAULT '[]'::jsonb,                    -- สมุนไพรที่ตรงกับตาราง herbal_knowledge (id, herb_name)
    knowledge_references JSONB DEFAULT '[]'::jsonb,             -- Chunks จากตำราที่ใช้อ้างอิง
    references_used JSONB DEFAULT NULL,                         -- คัมภีร์ ตำรา หรือเอกสารที่ AI นำมาใช้อ้างอิง (JSONB)
    recommended_herbs JSONB DEFAULT NULL,                       -- ตำรับยา / สมุนไพรที่ AI แนะนำ (JSONB)
    confidence_score DECIMAL(3,2) DEFAULT NULL,                 -- ค่าความมั่นใจในการวิเคราะห์ (0.00 - 1.00)
    model_used VARCHAR(100) DEFAULT NULL,                       -- ชื่อโมเดล AI ที่ใช้ (เช่น gemini-1.5-flash)
    token_usage JSONB DEFAULT NULL,                             -- จำนวน token ที่ใช้ (prompt, candidates, total)
    processing_ms INT DEFAULT NULL,                             -- เวลาที่ใช้ในการประมวลผล (มิลลิวินาที)
    is_accepted_by_doctor BOOLEAN DEFAULT FALSE,                -- แพทย์ยอมรับผลวิเคราะห์นำไปสั่งยาหรือไม่
    doctor_feedback TEXT DEFAULT NULL,                          -- ความคิดเห็นหรือข้อบันทึกของแพทย์
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_visit_id ON ai_assessments(visit_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_patient_id ON ai_assessments(patient_id);

-- ------------------------------------------------------------
-- 5. ตารางใบสั่งยา / การจ่ายยาสมุนไพร (Prescriptions)      ยังไม่เช็คทั้งหมด อาจขาดบางฟิล
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,                                      -- รหัสใบสั่งยา
    visit_id INT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,     -- รหัสการตรวจรักษา FK -> visits(id)
    doctor_id INT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,     -- รหัสแพทย์ผู้ออกใบสั่งยา FK -> staff(id)
    ai_assessment_id INT DEFAULT NULL REFERENCES ai_assessments(id) ON DELETE SET NULL, -- ผลวิเคราะห์ AI ที่อ้างอิง
    prescription_no VARCHAR(50) NOT NULL UNIQUE,                -- เลขที่ใบสั่งยา (Unique)
    herbs JSONB NOT NULL,                                       -- รายการสมุนไพรและขนาดการใช้ในรูปแบบ JSONB
    notes TEXT DEFAULT NULL,                                    -- หมายเหตุเพิ่มเติม
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id ON prescriptions(visit_id);

-- ------------------------------------------------------------
-- 6. ตารางคลังความรู้สมุนไพรและคัมภีร์แพทย์แผนไทย (Herbal Knowledge)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS herbal_knowledge (
    id SERIAL PRIMARY KEY,                                      -- รหัสสมุนไพร (Primary Key)
    herb_name VARCHAR(100) NOT NULL,                            -- ชื่อสมุนไพร
    part_used VARCHAR(150) DEFAULT NULL,                        -- ส่วนที่ใช้ทำยา (เช่น ราก, ใบ, ดอก, ผล, เปลือกต้น, แก่น, หัว, เหง้า, ทั้งต้น)
    taste VARCHAR(150) DEFAULT NULL,                            -- รสยาตามคัมภีร์เภสัชกรรมไทย (เช่น รสเผ็ดร้อน, รสขม, รสหวาน, รสฝาด, รสเปรี้ยว, รสเค็ม, รสหอมเย็น, รสเมาเบื่อ, รสมัน, รสจืด)
    properties TEXT DEFAULT NULL,                               -- สรรพคุณทางยาในการบำบัดรักษาโรคหรืออาการตามคัมภีร์แพทย์แผนไทย
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_herb_th ON herbal_knowledge(herb_name);

-- ------------------------------------------------------------
-- 6.1 ตารางคลังข้อมูลโรคและการวินิจฉัย (Diseases & Diagnosis Knowledge)
-- ------------------------------------------------------------
CREATE TABLE diseases (
    id SERIAL PRIMARY KEY,                                     
    disease_name VARCHAR(255) NOT NULL                         
);

-- ------------------------------------------------------------
-- 7. ตารางเอกสารความรู้ที่อัปโหลดสำหรับ AI (Knowledge Uploads)           น่าจะใช้ได้ละ น่าจะ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_uploads (
    id SERIAL PRIMARY KEY,                                      -- รหัสเอกสาร (Primary Key รันอัตโนมัติ)
    title VARCHAR(255) NOT NULL,                                -- ชื่อเอกสาร / หัวข้อความรู้ เช่น คัมภีร์มุจฉาปักขันทิกา
    category VARCHAR(100) DEFAULT 'general',                    -- หมวดหมู่ความรู้ เช่น คัมภีร์, ตำรับยา, โรคทางเดินปัสสาวะ, สมุนไพรเดี่ยว
    file_name VARCHAR(255) DEFAULT NULL,                        -- ชื่อไฟล์ต้นฉบับที่อัปโหลด เช่น scripture_uro.pdf
    file_path VARCHAR(500) DEFAULT NULL,                        -- ที่อยู่ไฟล์ (Path) หรือ URL ที่จัดเก็บไฟล์บน Server / Storage
    file_type VARCHAR(50) DEFAULT NULL,                         -- ชนิดหรือนามสกุลไฟล์ เช่น pdf, docx, txt, json
    file_size_bytes BIGINT DEFAULT NULL,                        -- ขนาดไฟล์ (หน่วยเป็นไบต์)
    raw_content TEXT DEFAULT NULL,                              -- เนื้อหาข้อความทั้งหมดที่สกัด (Extract) ออกมาจากไฟล์
    total_chunks INT DEFAULT 0,                                 -- จำนวนชิ้นส่วนข้อความ (Chunks) ที่ตัดแบ่งเพื่อทำ Vector Embedding
    embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending'     -- สถานะการแปลงเป็น Vector: pending, processing, completed, failed
        CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT DEFAULT NULL,                            -- ข้อความแจ้งเตือนความผิดพลาด (กรณีการประมวลผลล้มเหลว)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,                    -- สถานะเปิดใช้งาน: TRUE = นำไปใช้ใน RAG ให้ AI ค้นหาได้, FALSE = ปิดการใช้งาน
    uploaded_by INT REFERENCES staff(id) ON DELETE SET NULL,    -- รหัสเจ้าหน้าที่ผู้อัปโหลด เชื่อมโยงกับ staff(id)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- วัน-เวลาที่อัปโหลดเข้าสู่ระบบ
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP  -- วัน-เวลาที่มีการแก้ไขข้อมูลล่าสุด
);

CREATE INDEX IF NOT EXISTS idx_ku_category ON knowledge_uploads(category);
CREATE INDEX IF NOT EXISTS idx_ku_status ON knowledge_uploads(embedding_status);

-- ------------------------------------------------------------
-- 7.1 ตารางท่อนข้อความความรู้พร้อม Vector Embedding ด้วย pgvector       น่าจะใช้ได้ละ น่าจะ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id SERIAL PRIMARY KEY,                                      -- รหัสชิ้นส่วนข้อความ (Primary Key)
    upload_id INT NOT NULL REFERENCES knowledge_uploads(id) ON DELETE CASCADE, -- เชื่อมโยงกับไฟล์แม่ใน knowledge_uploads
    chunk_index INT NOT NULL,                                   -- ลำดับที่ของ Chunk เริ่มต้นจาก 0, 1, 2, ...
    content TEXT NOT NULL,                                      -- ข้อความย่อยสำหรับนำไปทำ Embedding และส่งเป็นบริบท (Context) ให้ AI
    token_count INT DEFAULT NULL,                               -- จำนวนคำหรือโทเค็นโดยประมาณของ Chunk นี้
    embedding vector(768),                                      -- เวกเตอร์ขนาด 768 มิติ สำหรับ Google Gemini Embeddings (pgvector)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP -- วัน-เวลาที่บันทึก
);

-- Index สำหรับการค้นหาความคล้ายคลึงของ Vector ด้วย Cosine Distance (HNSW Index เร็วมากระดับ production)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw 
ON knowledge_chunks 
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_kc_upload_id ON knowledge_chunks(upload_id);




