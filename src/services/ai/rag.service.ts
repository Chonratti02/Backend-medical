import { GoogleGenAI } from '@google/genai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import db, { pool } from '../../config/database';
import {
  RagAnalysisInput,
  RagAnalysisResult,
  RecommendedHerb,
  HerbReference,
  KnowledgeDocument,
  MultiSymptomAnalysisResult,
  SymptomAnalysisSection,
  HerbAnalysisItem,
  ProbableDiseaseItem,
  PatientVisitContext,
} from '../../models/types';

// ─── Initialize Google GenAI SDK ──────────────────────
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// ─── System Prompt (Strict Grounding 100% From Documents) ─────────────
const STRICT_SYSTEM_PROMPT = `คุณคือ AI ผู้ช่วยแพทย์แผนไทยสำหรับการวิเคราะห์อาการผู้ป่วยและสืบค้นคัมภีร์การแพทย์แผนไทย (Strict Grounding 100% จากเอกสารคลังความรู้)

กฎเหล็กที่ต้องปฏิบัติตามอย่างเคร่งครัด (Zero Hallucination Policy):
1. ตอบและอ้างอิงข้อมูลชื่อโรค, สมุฏฐานวินิจฉัย และสมุนไพรเฉพาะที่ปรากฏใน "คลังข้อมูลคัมภีร์ที่สืบค้นพบจากเอกสารคลังความรู้" (Doc) ที่แนบมาเท่านั้น ห้ามแนะนำตัวยาหรือตำรับยาที่ไม่มีอยู่ในเอกสารที่แนบมาเด็ดขาด
2. สำหรับการวินิจฉัยโรคที่น่าจะเป็น (probable_diseases) และสมุฏฐานวินิจฉัย (thai_diagnosis):
   - ให้ระบุชื่อโรคและชื่อสมุฏฐานตามที่มีบันทึกระบุในเอกสารคัมภีร์/ตำราที่แนบมา (Doc) โดยตรง ไม่จำกัดเฉพาะรายชื่อในฐานข้อมูล
3. สำหรับการแนะนำสมุนไพร/ตำรับยา (herbs):
   - แนะนำสมุนไพรเดี่ยวหรือตำรับยาตามชื่อและสรรพคุณที่มีระบุจริงในเอกสารคัมภีร์ที่แนบมา สูงสุดไม่เกิน 13 ชนิดต่อแต่ละโรค/อาการ (หรือเท่าที่มีบันทึกจริงในคัมภีร์)
   - name: ชื่อสมุนไพรเดี่ยวหรือชื่อตำรับยาที่ระบุในเอกสารคัมภีร์ (Doc) ห้ามคิดชื่อใหม่หรือสังเคราะห์ชื่อสูตรขึ้นมาเอง
   - properties: สรรพคุณ (ตามที่ระบุในเอกสารคัมภีร์)
   - usage: วิธีใช้และขนาดรับประทาน (ตามที่ระบุในเอกสารคัมภีร์)
   - precautions: ข้อควรระวัง
   - source: แหล่งอ้างอิงชื่อคัมภีร์/เอกสารและหน้าที่ระบุในเอกสาร
4. หากอาการใดระบุว่า "ไม่พบคัมภีร์หรือข้อความที่เกี่ยวข้อง" หรือในข้อความที่ให้มาไม่มีเนื้อหาการรักษาอาการนั้น:
   - กำหนด has_knowledge: false
   - กำหนด thai_diagnosis: "ไม่มีข้อมูลในคลังตำรา"
   - กำหนด description: "ไม่พบข้อมูลการรักษาอาการนี้ในคลังตำราการแพทย์แผนไทยที่จัดเก็บในระบบ"
   - กำหนด herbs: [] (เป็นรายการว่าง ห้ามแต่งเติมสมุนไพรใดๆ ทั้งสิ้น)
5. ให้คำแนะนำเพิ่มเติม:
   - overall_precautions: ข้อควรระวังโดยรวม คำนึงถึงประวัติแพ้ยา โรคประจำตัว อุณหภูมิ และสัญญาณชีพของผู้ป่วย
   - self_care: การปฏิบัติตัว พฤติกรรมสุขภาพ และอาหารแสลงที่ควรเลี่ยง
   - when_to_see_doctor: สัญญาณอันตราย (Red Flags) ที่ต้องส่งต่อหรือพบแพทย์ทันที
6. ห้ามวินิจฉัยโรคชี้ขาดแทนแพทย์ ให้เสนอเป็นข้อมูลสนับสนุนการตัดสินใจทางคลินิก
7. ตอบกลับเป็นรูปแบบ JSON ที่ถูกต้องสมบูรณ์เท่านั้น`;

// ─── Generate 768-dimensional Embedding using Google GenAI SDK ────────────────
async function getEmbedding(text: string): Promise<number[] | null> {
  if (!ai || !text) return null;
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768 },
    });
    return response?.embeddings?.[0]?.values || (response as any)?.embedding?.values || null;
  } catch (err: any) {
    console.warn('⚠️ GoogleGenAI getEmbedding error:', err?.message);
    return null;
  }
}

// ─── Robust JSON Extractor with Auto-repair & Auto-close ─────────────────────
function autoCloseJson(jsonStr: string): string {
  let stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack.length && stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  // If ended inside a string literal, close the quote
  if (inString) {
    jsonStr += '"';
  }

  // Remove trailing comma before closing if any
  jsonStr = jsonStr.replace(/,\s*$/, '');

  // Close all unclosed brackets/braces in reverse order
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') jsonStr += '}';
    else if (last === '[') jsonStr += ']';
  }

  return jsonStr;
}

function extractFirstCompleteJsonObject(str: string): string {
  let text = str.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;

  let stack = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        stack++;
      } else if (char === '}') {
        stack--;
        if (stack === 0) {
          // Found exact matching closing brace of root object!
          return text.substring(firstBrace, i + 1).trim();
        }
      }
    }
  }

  // If not cleanly closed, return up to last brace or remainder
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1).trim();
  }
  return text.substring(firstBrace).trim();
}

function cleanAndSanitizeJsonString(str: string): string {
  let cleaned = extractFirstCompleteJsonObject(str);

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  return cleaned;
}

function extractJsonFromAiResponse(raw: string | null): any {
  if (!raw) return null;
  const cleaned = cleanAndSanitizeJsonString(raw);

  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn('⚠️ Initial JSON.parse failed:', e?.message);

    // Step 1: Fix missing commas and trailing commas
    let repaired = cleaned
      .replace(/}\s*(\r?\n)?\s*{/g, '},\n{')
      .replace(/]\s*(\r?\n)?\s*\[/g, '],\n[')
      .replace(/,\s*([\]}])/g, '$1');

    try {
      return JSON.parse(repaired);
    } catch (e2: any) {
      // Step 2: Auto-close incomplete JSON structures
      try {
        const closed = autoCloseJson(repaired);
        return JSON.parse(closed);
      } catch (e3: any) {
        console.warn('⚠️ Auto-closed JSON.parse also failed:', e3?.message);
        return null;
      }
    }
  }
}

interface GeminiCallOutput {
  text: string;
  usage?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
  model_used: string;
}

// ─── Call Gemini with Strict Model (gemini-3.1-pro) & No Token Limit ────────────
async function callGemini(
  prompt: string,
  timeoutMs = 120000,
  asJson = false
): Promise<GeminiCallOutput | null> {
  if (!ai) {
    console.error('❌ GoogleGenAI SDK is not initialized: GEMINI_API_KEY is missing.');
    return null;
  }

  // Default to gemini-3.5-flash (free model with active quota & high throughput)
  let requestedModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  if (requestedModel === 'gemini-3.1-pro' || requestedModel === '3.1-pro') {
    requestedModel = 'gemini-3.1-pro-preview';
  }

  const candidateModels = [
    requestedModel,
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
  ].filter((m, i, arr): m is string => !!m && arr.indexOf(m) === i);

  for (const model of candidateModels) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
        );

        const generatePromise = ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.0,
            // Non-limit token: do not restrict maxOutputTokens so response won't truncate
            ...(asJson ? { responseMimeType: 'application/json' } : {}),
          },
        });

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        const text = response?.text;
        const finishReason = response?.candidates?.[0]?.finishReason;
        const usage = response?.usageMetadata;
        const tokenUsage = usage
          ? {
              prompt_tokens: Number(usage.promptTokenCount) || 0,
              candidates_tokens: Number(usage.candidatesTokenCount) || 0,
              total_tokens: Number(usage.totalTokenCount) || 0,
            }
          : undefined;

        console.log(
          `🤖 Gemini model=${model} returned text length=${text?.length}, finishReason=${finishReason}, total_tokens=${tokenUsage?.total_tokens ?? 'N/A'}`
        );
        if (text) {
          return {
            text,
            usage: tokenUsage,
            model_used: model,
          };
        }
      } catch (err: any) {
        console.warn(`⚠️ GoogleGenAI request failed on model ${model} (attempt ${attempt}):`, err?.message);
        if (err?.message?.includes('timed out') || err?.message?.includes('aborted')) {
          console.warn(`⏱️ Model ${model} timed out after ${timeoutMs}ms.`);
          break;
        }
        const isTransient =
          err?.message?.includes('503') ||
          err?.message?.includes('RESOURCE_EXHAUSTED') ||
          err?.message?.includes('UNAVAILABLE') ||
          err?.message?.includes('overloaded');
        if (isTransient && attempt < maxAttempts && !err?.message?.includes('limit: 0')) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        break; // ถ้า limit: 0 หรือ 404 ให้ลองโมเดลถัดไปทันที
      }
    }
  }

  return null;
}

// ─── ฐานข้อมูลสมุนไพรพื้นฐานสำหรับจับคู่ ID และความปลอดภัย ────────────
/** ดึงรายการสมุนไพรและตำรับยาที่มีระบุจริงใน Chunks ของฐานข้อมูลเท่านั้น (ห้ามเอาจากภายนอก) */
function extractHerbsFromDbChunks(chunks: any[], symptoms: string): any[] {
  const matchedHerbs: any[] = [];
  const seenHerbs = new Set<string>();
  const sLower = symptoms.toLowerCase();
  const words = symptoms.split(/[\s,]+/).filter(w => w.length >= 2);

  for (const chunk of chunks) {
    const text = chunk.content || '';
    const lines = text.split('\n');

    for (const line of lines) {
      // รูปแบบที่ 1: - [ชื่อสมุนไพร] รส... สรรพคุณ ...
      const m1 = line.match(/^\s*-\s*([^\s\t]+(?:\s+[^\s\t]+)*?)\s+รส([^\t\n]+?)สรรพคุณ\s*(.*)$/);
      if (m1) {
        const name = m1[1].trim();
        const taste = 'รส' + m1[2].trim();
        const prop = m1[3].trim();
        if (!seenHerbs.has(name)) {
          let score = 70;
          for (const w of words) {
            if (prop.includes(w)) score += 10;
            if (name.includes(w)) score += 15;
          }
          if (sLower.includes('ปัสสาวะ') && (prop.includes('ปัสสาวะ') || prop.includes('นิ่ว') || prop.includes('ไต') || prop.includes('เบา'))) score += 15;
          if (sLower.includes('ไข้') && (prop.includes('ไข้') || prop.includes('พิษ') || prop.includes('ร้อน'))) score += 15;
          if (sLower.includes('ปวด') && (prop.includes('ปวด') || prop.includes('เกร็ง') || prop.includes('ข้อ'))) score += 15;

          seenHerbs.add(name);
          matchedHerbs.push({
            id: 'db_' + seenHerbs.size,
            name,
            sub: taste,
            note: prop.length > 150 ? prop.slice(0, 150) + '…' : prop,
            dosage: 'ตามกรรมวิธีและคำแนะนำในคัมภีร์',
            cautionIf: /ไต|ครรภ์|ตับ/.test(prop) ? 'kidney' : null,
            source: chunk.title || 'เอกสารคลังความรู้',
            match: Math.min(99, score),
            tags: ['current']
          });
        }
      }

      // รูปแบบที่ 2: ยารักษา / ยาแก้... ประกอบด้วย...
      const m2 = line.match(/(?:ยารักษา|ยาแก้([^\s\t]+))\s*(.*)/);
      if (m2) {
        const formulaName = m2[1] ? `ยาแก้${m2[1]}` : 'ตำรับยารักษาตามคัมภีร์';
        const recipe = m2[2].trim();
        if (recipe.length > 15 && !seenHerbs.has(formulaName)) {
          seenHerbs.add(formulaName);
          matchedHerbs.push({
            id: 'db_' + seenHerbs.size,
            name: formulaName,
            sub: 'ตำรับยาแผนไทยจากคัมภีร์',
            note: recipe.length > 150 ? recipe.slice(0, 150) + '…' : recipe,
            dosage: 'ต้มหรือปรุงตามกรรมวิธีในคัมภีร์',
            cautionIf: null,
            source: chunk.title || 'คัมภีร์แพทย์แผนไทย',
            match: 95,
            tags: ['current']
          });
        }
      }
    }
  }

  return matchedHerbs.sort((a, b) => b.match - a.match);
}

// ─── คลังข้อมูลสมุนไพรและโรคทางการจาก PostgreSQL (herbal_knowledge & diseases) ────
let cachedHerbs: { id: number; herb_name: string }[] | null = null;
let cachedDiseases: { id: number; disease_name: string }[] | null = null;
let lastDbFetch = 0;

export async function getCanonicalKnowledge(): Promise<{
  herbs: { id: number; herb_name: string }[];
  diseases: { id: number; disease_name: string }[];
}> {
  const now = Date.now();
  if (cachedHerbs && cachedDiseases && now - lastDbFetch < 10 * 60 * 1000) {
    return { herbs: cachedHerbs, diseases: cachedDiseases };
  }
  try {
    const hRes = await pool.query('SELECT id, herb_name FROM herbal_knowledge ORDER BY id');
    const dRes = await pool.query('SELECT id, disease_name FROM diseases ORDER BY id');
    cachedHerbs = hRes.rows;
    cachedDiseases = dRes.rows;
    lastDbFetch = now;
  } catch (err: any) {
    console.error('Error fetching canonical herbal_knowledge and diseases:', err?.message);
    cachedHerbs = cachedHerbs || [];
    cachedDiseases = cachedDiseases || [];
  }
  return { herbs: cachedHerbs, diseases: cachedDiseases };
}

/** ค้นหา Chunks จาก PostgreSQL ด้วย Vector Cosine Similarity และ Keyword Match */
async function searchChunksForSymptom(symptom: string, limit = 4): Promise<any[]> {
  let rows: any[] = [];
  try {
    // 1. Vector Cosine Distance จาก pgvector (เฉพาะคัมภีร์ที่ is_active = TRUE)
    const queryEmbedding = await getEmbedding(symptom);
    if (queryEmbedding && queryEmbedding.length === 768) {
      const vectorStr = `[${queryEmbedding.join(',')}]`;
      const vecQuery = `
        SELECT kc.id, kc.content, kc.page_number, ku.title,
               1 - (kc.embedding <=> $1) AS similarity
        FROM knowledge_chunks kc
        JOIN knowledge_uploads ku ON kc.upload_id = ku.id
        WHERE ku.is_active = TRUE AND kc.embedding IS NOT NULL
        ORDER BY kc.embedding <=> $1
        LIMIT $2
      `;
      const vecRes = await pool.query(vecQuery, [vectorStr, limit]);
      rows = vecRes.rows.filter((r: any) => Number(r.similarity) >= 0.63);
    }

    // 2. เสริมด้วย Keyword Match ในเนื้อหาคัมภีร์ถ้าเวกเตอร์ได้ผลน้อย
    if (rows.length < limit && symptom.trim().length >= 2) {
      const cleanSym = symptom.trim();
      const kwRes = await pool.query(
        `SELECT kc.id, kc.content, kc.page_number, ku.title, 0.85 AS similarity
         FROM knowledge_chunks kc
         JOIN knowledge_uploads ku ON kc.upload_id = ku.id
         WHERE ku.is_active = TRUE AND kc.content ILIKE $1
         LIMIT $2`,
        [`%${cleanSym}%`, limit - rows.length]
      );

      for (const r of kwRes.rows) {
        if (!rows.some((existing) => existing.id === r.id)) {
          rows.push(r);
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ Vector/keyword search error for symptom "${symptom}":`, err.message);
  }
  return rows.slice(0, limit);
}

// ─── RAG Service ───────────────────────────────────────────
export const ragService = {
  /**
   * วิเคราะห์อาการผู้ป่วยหลายอาการ (สูงสุด 5 อาการ พร้อม Strict Grounding 100%)
   */
  async analyzeMultiSymptom(input: {
    symptoms: string | string[];
    patientData?: {
      name?: string;
      weight?: number | null;
      height?: number | null;
      temperature?: number | null;
      allergies?: string;
      smoking?: string;
      alcohol?: string;
      birth_time?: string | null;
      date_of_birth?: string | null;
      age?: number | null;
      gender?: string | null;
      birth_day_of_week?: string | null;
      body_element?: string | null;
      birth_zodiac?: string | null;
      birth_samutthana?: string | null;
      conception_zodiac?: string | null;
      geography?: string | null;
      illness_days?: number | null;
      bp?: string | null;
      pulse?: string | null;
    };
    context?: PatientVisitContext;
  }): Promise<MultiSymptomAnalysisResult & { drugs: any[]; flatHerbs: RecommendedHerb[]; textResponse: string }> {
    const { symptoms, patientData, context } = input;

    // 1. แปลง symptoms เป็น Array (รองรับสูงสุด 5 อาการ)
    let symptomList: string[] = [];
    if (Array.isArray(symptoms)) {
      symptomList = symptoms.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
    } else if (typeof symptoms === 'string' && symptoms.trim()) {
      symptomList = symptoms
        .split(/[\n;；,，]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    symptomList = symptomList.slice(0, 5);

    if (symptomList.length === 0) {
      symptomList = ['อาการไม่ระบุชัดเจน'];
    }

    // 2. ดึง Chunks สำหรับแต่ละอาการแบบขนาน (Parallel) เพื่อลดเวลาประมวลผล
    const perSymptomData = await Promise.all(
      symptomList.map(async (sym) => {
        const chunks = await searchChunksForSymptom(sym, 4);
        return { symptom: sym, chunks };
      })
    );

    const allReferences: HerbReference[] = [];
    const refKeySet = new Set<string>();

    for (const item of perSymptomData) {
      for (const c of item.chunks) {
        if ((c.title || '').includes('ข้อมูลส่วนที่ 2')) continue;
        const key = `${c.title}-${c.page_number || ''}`;
        if (!refKeySet.has(key)) {
          refKeySet.add(key);
          allReferences.push({
            title: c.title || 'คัมภีร์การแพทย์แผนไทย',
            page: c.page_number || '-',
            excerpt: (c.content || '').trim().replace(/\s+/g, ' ').substring(0, 160) + '…',
          });
        }
      }
    }

    // 3. จัดเตรียม Prompt ข้อมูลผู้ป่วยและ Chunks ตาม Data Fields ทั้งหมด
    const { herbs: dbHerbs, diseases: dbDiseases } = await getCanonicalKnowledge();

    // ข้อมูลทั่วไป & ระบุตัวตน
    const nameVal = patientData?.name || ((context as any)?.first_name ? `${(context as any)?.prefix || ''}${(context as any)?.first_name} ${(context as any)?.last_name || ''}`.trim() : '') || 'ไม่ระบุชื่อ';
    const genderVal = patientData?.gender || context?.gender;
    const genderStr = genderVal === 'male' ? 'ชาย' : (genderVal === 'female' ? 'หญิง' : 'ไม่ระบุ');
    const ageVal = patientData?.age || context?.age;
    const dobVal = patientData?.date_of_birth || context?.date_of_birth;
    const birthTimeVal = patientData?.birth_time || context?.birth_time;
    const dayOfWeekVal = patientData?.birth_day_of_week || context?.birth_day_of_week;
    const bloodVal = context?.blood_group && context.blood_group !== 'unknown' ? context.blood_group : 'ไม่ระบุ';
    const geoVal = patientData?.geography || context?.geography;

    // ธาตุเจ้าเรือนและจักราศีสมุฏฐานกำเนิด
    const bodyElemVal = patientData?.body_element || context?.body_element;
    const lunarBdayVal = context?.lunar_birthday;
    const lunarPhaseVal = context?.lunar_phase;
    const lunarDayVal = context?.lunar_day;
    const zodiacYearVal = context?.zodiac_year;

    // จักราศีวันเกิด
    const birthZodiacVal = patientData?.birth_zodiac || context?.birth_zodiac;
    const birthZodiacElemVal = context?.birth_zodiac_element;
    const birthSamutthanaVal = patientData?.birth_samutthana || context?.birth_samutthana;
    const birthRakonVal = context?.birth_rakon;
    const birthElemDescVal = context?.birth_element_desc;

    // จักราศีแรกปฏิสนธิ
    const conceptionMonthVal = context?.conception_lunar_month;
    const conceptionZodiacVal = patientData?.conception_zodiac || context?.conception_zodiac;
    const conceptionElemVal = context?.conception_zodiac_element;
    const conceptionSamutthanaVal = context?.conception_samutthana;
    const conceptionRakonVal = context?.conception_rakon;
    const conceptionDescVal = context?.conception_element_desc;

    // สัญญาณชีพ & ประวัติสุขภาพ
    const weightVal = patientData?.weight ?? context?.weight;
    const heightVal = patientData?.height ?? context?.height;
    const tempVal = patientData?.temperature ?? context?.temp;
    const bpVal = patientData?.bp || context?.bp;
    const pulseVal = patientData?.pulse || context?.pulse;
    const bmiVal = context?.bmi;
    const bmiStatusVal = context?.bmi_status;
    const drugAllergyVal = patientData?.allergies || context?.drug_allergy || 'ไม่มีประวัติแพ้ยา';
    const chronicDiseaseVal = context?.chronic_disease || 'ไม่มี';
    const pmhVal = context?.pmh || 'ไม่มี';
    const smokingVal = patientData?.smoking || 'ไม่ระบุ';
    const alcoholVal = patientData?.alcohol || 'ไม่ระบุ';

    // การเจ็บป่วยครั้งนี้ & สมุฏฐานปัจจุบัน
    const chiefComplaintVal = context?.chief_complaint;
    const illnessStartDateVal = context?.illness_start_date;
    const illnessStartTimeVal = context?.illness_start_time;
    const illnessDaysVal = patientData?.illness_days || context?.illness_days;
    const visitLunarPhaseVal = context?.visit_lunar_phase;
    const visitLunarDayVal = context?.visit_lunar_day;
    const utuVal = context?.utu_samutthana ? (typeof context.utu_samutthana === 'object' ? JSON.stringify(context.utu_samutthana) : context.utu_samutthana) : null;
    const kalaVal = context?.kala_samutthana ? (typeof context.kala_samutthana === 'object' ? JSON.stringify(context.kala_samutthana) : context.kala_samutthana) : null;
    const tridhatuVal = context?.tridhatu_samutthana ? (typeof context.tridhatu_samutthana === 'object' ? JSON.stringify(context.tridhatu_samutthana) : context.tridhatu_samutthana) : null;
    const clinicalHistoryVal = context?.clinical_history ? (typeof context.clinical_history === 'object' ? JSON.stringify(context.clinical_history) : context.clinical_history) : null;
    const physicalExamVal = context?.physical_exam ? (typeof context.physical_exam === 'object' ? JSON.stringify(context.physical_exam) : context.physical_exam) : null;
    const ttmExamVal = context?.ttm_exam ? (typeof context.ttm_exam === 'object' ? JSON.stringify(context.ttm_exam) : context.ttm_exam) : null;

    const patientClinicalSections = `
[ส่วนที่ 1: ข้อมูลทั่วไปและการระบุตัวตนผู้ป่วย (Patient Demographics)]
- ชื่อ-นามสกุล: ${nameVal}
- เพศ: ${genderStr}
- อายุ: ${ageVal ? `${ageVal} ปี` : 'ไม่ระบุ'}
- วันเกิด: ${dobVal || 'ไม่ระบุ'} (วันในสัปดาห์: ${dayOfWeekVal || 'ไม่ระบุ'})
- เวลาเกิด (Birth Time): ${birthTimeVal || 'ไม่ระบุ'}
- หมู่โลหิต: ${bloodVal}
- ประเทศสมุฏฐาน (ถิ่นที่อยู่อาศัย): ${geoVal || 'ไม่ระบุ'}

[ส่วนที่ 2: ธาตุเจ้าเรือนและจักราศีสมุฏฐานกำเนิด (TTM Elements & Zodiac Samutthana)]
- ธาตุเจ้าเรือนเดิม: ${bodyElemVal || 'ไม่ระบุ'}
- กำเนิดทางจันทรคติ: ${lunarBdayVal || (lunarPhaseVal && lunarDayVal ? `${lunarPhaseVal === 'waxing' ? 'ข้างขึ้น' : 'ข้างแรม'} ${lunarDayVal} ค่ำ` : 'ไม่ระบุ')} (ปีนักษัตร: ${zodiacYearVal || 'ไม่ระบุ'})
- จักราศีวันเกิด (Birth Zodiac): ${birthZodiacVal || 'ไม่ระบุ'} | ธาตุราศี: ${birthZodiacElemVal || 'ไม่ระบุ'} | สมุฏฐาน: ${birthSamutthanaVal || 'ไม่ระบุ'} | สิ่งระคน: ${birthRakonVal || 'ไม่ระบุ'} | รายละเอียด: ${birthElemDescVal || 'ไม่ระบุ'}
- จักราศีแรกปฏิสนธิ (Conception Zodiac): ${conceptionZodiacVal || 'ไม่ระบุ'} | ธาตุปฏิสนธิ: ${conceptionElemVal || 'ไม่ระบุ'} | เดือนปฏิสนธิ: ${conceptionMonthVal || 'ไม่ระบุ'} | สมุฏฐาน: ${conceptionSamutthanaVal || 'ไม่ระบุ'} | สิ่งระคน: ${conceptionRakonVal || 'ไม่ระบุ'} | รายละเอียด: ${conceptionDescVal || 'ไม่ระบุ'}

[ส่วนที่ 3: สัญญาณชีพและประวัติสุขภาพ (Vital Signs & Clinical History)]
- น้ำหนัก: ${weightVal ? `${weightVal} กก.` : 'ไม่ระบุ'} | ส่วนสูง: ${heightVal ? `${heightVal} ซม.` : 'ไม่ระบุ'} | BMI: ${bmiVal || 'ไม่ระบุ'} (${bmiStatusVal || '-'})
- อุณหภูมิร่างกาย (Body Temp): ${tempVal ? `${tempVal} °C` : 'ไม่ระบุ'}
- ความดันโลหิต (BP): ${bpVal || 'ไม่ระบุ'} mmHg | ชีพจร (Pulse): ${pulseVal ? `${pulseVal} ครั้ง/นาที` : 'ไม่ระบุ'}
- ประวัติการแพ้ยา (Drug Allergy): ${drugAllergyVal}
- โรคประจำตัว (Chronic Disease): ${chronicDiseaseVal}
- ประวัติการเจ็บป่วยในอดีต (PMH): ${pmhVal}
- พฤติกรรมสุขภาพ: สูบบุหรี่ (${smokingVal}), ดื่มสุรา (${alcoholVal})

[ส่วนที่ 4: ข้อมูลการเจ็บป่วยครั้งนี้และสมุฏฐานปัจจุบัน (Current Visit & Current Samutthana)]
- อาการสำคัญ (Chief Complaint): ${chiefComplaintVal || symptomList.join(', ')}
- วันที่เริ่มป่วย: ${illnessStartDateVal || 'ไม่ระบุ'} | เวลาเริ่มป่วย: ${illnessStartTimeVal || 'ไม่ระบุ'} | เป็นมาแล้ว: ${illnessDaysVal ? `${illnessDaysVal} วัน` : 'ไม่ระบุ'}
- ข้างขึ้นข้างแรมวันที่มาตรวจ: ${visitLunarPhaseVal && visitLunarDayVal ? `${visitLunarPhaseVal === 'waxing' ? 'ข้างขึ้น' : 'ข้างแรม'} ${visitLunarDayVal} ค่ำ` : 'ไม่ระบุ'}
- อุตุสมุฏฐาน (ฤดู/กาลอากาศ): ${utuVal || 'ไม่ระบุ'}
- กาลสมุฏฐาน (ช่วงเวลากำเริบ): ${kalaVal || 'ไม่ระบุ'}
- ตรีธาตุสมุฏฐาน (ปิตตะ/วาตะ/เสมหะ): ${tridhatuVal || 'ไม่ระบุ'}
- ประวัติอาการปัจจุบัน (Clinical History): ${clinicalHistoryVal || 'ไม่มีข้อมูลเพิ่มเติม'}
- การตรวจร่างกายทั่วไป (Physical Exam): ${physicalExamVal || 'ไม่มีข้อมูลเพิ่มเติม'}
- การตรวจเวชกรรมไทย (TTM Exam): ${ttmExamVal || 'ไม่มีข้อมูลเพิ่มเติม'}
`.trim();

    let chunksSection = '';
    perSymptomData.forEach((item, idx) => {
      chunksSection += `\n\n========================================\n`;
      chunksSection += `[อาการที่ ${idx + 1}]: "${item.symptom}"\n`;
      if (item.chunks.length === 0) {
        chunksSection += `[สถานะคลังข้อมูล]: ไม่พบคัมภีร์หรือข้อความที่เกี่ยวข้องกับอาการนี้ในฐานข้อมูล\n`;
      } else {
        chunksSection += `[คลังข้อมูลคัมภีร์ที่สืบค้นพบจากฐานข้อมูล (${item.chunks.length} ชิ้น)]:\n`;
        item.chunks.forEach((c, cIdx) => {
          const scripture = c.title || 'คัมภีร์การแพทย์แผนไทย';
          const page = c.page_number || '-';
          chunksSection += `--- ชิ้นที่ ${cIdx + 1} (คัมภีร์: ${scripture}, หน้า: ${page}) ---\n${c.content.trim().slice(0, 600)}\n`;
        });
      }
    });

    const prompt = `${STRICT_SYSTEM_PROMPT}

ข้อมูลผู้ป่วยและการตรวจทางคลินิกตามระเบียนข้อมูล (Clinical & TTM Patient Context):
${patientClinicalSections}

รายการอาการที่ต้องการวิเคราะห์และคลังข้อมูลคัมภีร์ที่สืบค้นพบจากเอกสารคลังความรู้ (Knowledge Documents):
${chunksSection}

โปรดประเมินอาการแต่ละข้อตามคลังข้อมูลคัมภีร์/เอกสาร (Doc) ที่ให้มาเท่านั้น โดยให้:
1. "patient_summary": สรุปข้อมูลผู้ป่วย (ชื่อ, น้ำหนัก, ส่วนสูง, อุณหภูมิ, ประวัติแพ้ยา, สูบบุหรี่, ดื่มสุรา) จากข้อมูลที่ได้รับ
2. "probable_diseases": วินิจฉัยโรคที่คาดว่าผู้ป่วยจะเป็นจากข้อมูลที่มีและสอดคล้องกับคัมภีร์/เอกสาร (Doc) ที่สืบค้นพบ โดยระบุชื่อโรค disease_name ตามที่ปรากฏในเอกสารคัมภีร์/ตำรา
3. "symptoms_analysis": วิเคราะห์แต่ละอาการและแนะนำสมุนไพรเฉพาะที่ระบุในเอกสารคัมภีร์ (Doc) ที่แนบมา สูงสุดไม่เกิน 13 ชนิดต่ออาการ/โรค (หรือเท่าที่มีบันทึกจริงในคัมภีร์ สูงสุดไม่เกิน 13 ชนิด หากอาการใดไม่พบคัมภีร์ ให้ has_knowledge: false และ herbs: [])

คำเตือนสำคัญ: ห้ามใส่ข้อความเกริ่นนำ ข้อความทักทาย หรือสรุปปิดท้ายใดๆ ทั้งสิ้น ให้ตอบกลับเฉพาะ JSON object ที่สมบูรณ์ตาม Schema ด้านล่างเท่านั้น เริ่มต้นด้วย { และปิดท้ายด้วย }
{
  "patient_summary": {
    "name": "ชื่อผู้ป่วย",
    "weight": 80,
    "height": 178,
    "temperature": 38.0,
    "allergies": "ประวัติแพ้ยา",
    "smoking": "ไม่สูบ",
    "alcohol": "ไม่ดื่ม"
  },
  "probable_diseases": [
    {
      "disease_name": "ชื่อโรคแพทย์แผนไทยตามที่ระบุในเอกสารคัมภีร์/ตำรา",
      "probability_level": "สูงมาก (High) / ปานกลาง (Medium) / น้อย (Low)",
      "primary_cause": "สมุฏฐานและพยาธิสภาพของธาตุที่กระทบตามคัมภีร์/เอกสาร",
      "supporting_evidence": "ข้อมูลสนับสนุนจากอาการ, ธาตุเจ้าเรือน, เวลาเกิด, กาลสมุฏฐาน, อายุผู้ป่วย",
      "icd10_or_ttm_code": "รหัสโรคหรือการจัดหมวดตามคัมภีร์"
    }
  ],
  "symptoms_analysis": [
    {
      "symptom_title": "ชื่ออาการ",
      "has_knowledge": true,
      "thai_diagnosis": "สมุฏฐานวินิจฉัยตามคัมภีร์/เอกสาร",
      "description": "คำอธิบายพยาธิสภาพและอาการตามคัมภีร์/เอกสาร",
      "herbs": [
        {
          "name": "ชื่อสมุนไพรเดี่ยวหรือชื่อตำรับยาที่ระบุตรงตามคัมภีร์/เอกสารเท่านั้น (ห้ามคิดชื่อใหม่ ห้ามตั้งชื่อว่าตำรับยาต้ม... ห้ามใส่วงเล็บสรุปสูตร)",
          "properties": "สรรพคุณตามคัมภีร์/เอกสาร",
          "usage": "วิธีใช้และขนาดรับประทาน",
          "precautions": "ข้อควรระวัง",
          "source": "แหล่งอ้างอิงคัมภีร์และหน้า"
        }
      ]
    }
  ],
  "overall_precautions": "ข้อควรระวังโดยรวม คำนึงถึงประวัติแพ้ยา โรคประจำตัว อุณหภูมิ และสัญญาณชีพ",
  "self_care": "การปฏิบัติตัวและอาหารแสลงที่ควรเลี่ยง",
  "when_to_see_doctor": "สัญญาณอันตรายที่ต้องพบแพทย์ทันที"
}
คำสั่งสำคัญอย่างยิ่งสำหรับฟิลด์ "name": ห้ามประดิษฐ์ชื่อหรือสรุปชื่อสูตรขึ้นมาเองเด็ดขาด เช่น หากคัมภีร์ระบุ "ยาเข้าเย็นเหนือ... ยาเข้าเย็นใต้... ขันทองพยาบาท... สมานลำไส้" ให้ระบุชื่อเป็นตัวยาเดี่ยวๆ เช่น "ยาเข้าเย็นเหนือ", "ยาเข้าเย็นใต้" ห้ามตั้งชื่อสังเคราะห์เด็ดขาด`;

    // 4. ส่งคำขอไปยัง Google Gemini (ให้เวลาสูงสุด 120 วินาทีสำหรับประมวลผลโมเดล Pro)
    const geminiTimeout = parseInt(process.env.GEMINI_TIMEOUT_MS || '120000', 10);
    const geminiResult = await callGemini(prompt, geminiTimeout, true);
    const aiRawJson = geminiResult?.text || null;
    const tokenUsage = geminiResult?.usage;
    const modelUsed = geminiResult?.model_used || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    let parsedResult: MultiSymptomAnalysisResult | null = null;

    if (aiRawJson) {
      parsedResult = extractJsonFromAiResponse(aiRawJson) as MultiSymptomAnalysisResult;
      if (!parsedResult) {
        console.warn('⚠️ Could not extract valid JSON from Gemini response:\n', aiRawJson.substring(0, 300));
      }
    }

    // 5. หาก Gemini ไม่สามารถประมวลผลได้ หรือ JSON ไม่สมบูรณ์ ให้ Throw Error อย่างชัดเจน (Zero Fallback Policy)
    if (!parsedResult || !Array.isArray(parsedResult.symptoms_analysis) || parsedResult.symptoms_analysis.length === 0) {
      console.error('❌ AI Analysis failed to generate a valid structured response.');
      throw new Error('ระบบ AI ไม่สามารถประมวลผลการวิเคราะห์ได้ในขณะนี้ กรุณากดลองใหม่อีกครั้ง');
    }

    // กำหนดรายการ probable_diseases โดยตรงจากที่ AI สกัดได้จากเอกสารคัมภีร์
    if (!Array.isArray(parsedResult.probable_diseases)) {
      parsedResult.probable_diseases = [];
    }

    parsedResult.references = allReferences;

    // 6. สกัด flat herbs และ drugs เพื่อให้รองรับปุ่มสั่งยาและระบบเดิมได้ 100%
    const flatDrugs: any[] = [];
    const flatHerbs: RecommendedHerb[] = [];
    const drugIdSet = new Set<string>();

    parsedResult.symptoms_analysis.forEach((sec, sIdx) => {
      sec.herbs.forEach((h, hIdx) => {
        flatHerbs.push({
          name: h.name,
          amount: 1,
          unit: 'ซอง/แคปซูล',
          note: h.usage,
        });

        const matchedDef = dbHerbs.find((d) => d.herb_name === h.name || h.name.includes(d.herb_name));
        const drugId = matchedDef ? `db_h_${matchedDef.id}` : `ai_h_${sIdx}_${hIdx}`;

        if (!drugIdSet.has(drugId)) {
          drugIdSet.add(drugId);
          flatDrugs.push({
            id: drugId,
            name: h.name,
            sub: matchedDef ? `สมุนไพรในคลังตำรา (ID: ${matchedDef.id})` : (h.source || 'สมุนไพรตามคัมภีร์'),
            dosage: h.usage || 'รับประทานตามคำแนะนำของแพทย์',
            note: h.properties || 'บรรเทาอาการตามคัมภีร์',
            match: 95 - hIdx * 2,
            tags: ['current', `sym_${sIdx + 1}`],
            cautionIf: h.precautions?.includes('ไต') ? 'kidney' : (h.precautions?.includes('ครรภ์') ? 'pregnant' : null),
            source: h.source,
            precautions: h.precautions,
            symptom_title: sec.symptom_title,
          });
        }
      });
    });

    // แมตช์โรคกับตาราง diseases
    const matchedDiseases = (parsedResult.probable_diseases || []).map((pd) => {
      const found = dbDiseases.find((d) => pd.disease_name.includes(d.disease_name) || d.disease_name.includes(pd.disease_name));
      return {
        id: found ? found.id : null,
        disease_name: found ? found.disease_name : pd.disease_name,
        probability: pd.probability_level,
      };
    });

    // แมตช์สมุนไพรกับตาราง herbal_knowledge
    const matchedHerbs = flatHerbs.map((fh) => {
      const found = dbHerbs.find((h) => h.herb_name === fh.name || fh.name.includes(h.herb_name));
      return {
        id: found ? found.id : null,
        herb_name: found ? found.herb_name : fh.name,
        note: fh.note,
      };
    });

    // สร้างข้อความสรุปสังเคราะห์แบบ Text
    const textSections = parsedResult.symptoms_analysis.map((s) => {
      if (!s.has_knowledge) {
        return `• ${s.symptom_title}: ${s.thai_diagnosis} (${s.description})`;
      }
      const herbNames = s.herbs.map((h) => h.name).join(', ') || 'ไม่มีตัวยาแนะนำเพิ่มเติม';
      return `• ${s.symptom_title} (${s.thai_diagnosis}): แนะนำ ${herbNames}`;
    }).join('\n');

    const textResponse = `ผลการวิเคราะห์สมุฏฐานและคัมภีร์แพทย์แผนไทย (${symptomList.length} อาการ):\n${textSections}\n\nข้อควรระวัง: ${parsedResult.overall_precautions}`;

    // คำนวณ Confidence Score แบบไดนามิกตามความครอบคลุมของคัมภีร์และความแม่นยำของ Similarity
    const symptomAnalysisList = parsedResult.symptoms_analysis || [];
    const totalSymptoms = symptomAnalysisList.length || symptomList.length || 1;
    const knownCount = symptomAnalysisList.filter((s: any) => s.has_knowledge).length;
    const coverageRatio = knownCount / totalSymptoms;

    const allSimilarities: number[] = [];
    perSymptomData.forEach((item) => {
      item.chunks.forEach((c: any) => {
        if (c.similarity != null) {
          allSimilarities.push(Number(c.similarity));
        }
      });
    });

    const avgSimilarity = allSimilarities.length > 0
      ? allSimilarities.reduce((sum, val) => sum + val, 0) / allSimilarities.length
      : 0.70;

    let dynamicConfidence: number;
    if (knownCount === 0) {
      dynamicConfidence = 0.15;
    } else {
      const rawScore = (0.60 * coverageRatio) + (0.40 * Math.min(1.0, avgSimilarity));
      dynamicConfidence = Math.min(0.98, Math.max(0.20, Number(rawScore.toFixed(2))));
    }

    return {
      ...parsedResult,
      matched_diseases: matchedDiseases,
      matched_herbs: matchedHerbs,
      user_prompt: prompt,
      system_prompt: STRICT_SYSTEM_PROMPT,
      raw_ai_response: aiRawJson,
      references: allReferences,
      drugs: flatDrugs,
      flatHerbs,
      textResponse,
      confidence: dynamicConfidence,
      token_usage: tokenUsage,
      model_used: modelUsed,
    };
  },

  /**
   * เมธอดเดิมสำหรับรองรับ Single Symptom (Backwards Compatibility)
   */
  async analyze({ symptoms, context }: RagAnalysisInput): Promise<RagAnalysisResult & { drugs?: any[]; multiResult?: MultiSymptomAnalysisResult }> {
    const multi = await this.analyzeMultiSymptom({
      symptoms,
      context,
    });

    return {
      response: multi.textResponse,
      references: multi.references,
      recommendedHerbs: multi.flatHerbs,
      drugs: multi.drugs,
      confidence: multi.confidence ?? 0.95,
      multiResult: multi,
    };
  },

  /** Ingest documents into PostgreSQL pgvector knowledge_chunks */
  async ingestDocuments(documents: KnowledgeDocument[], defaultUploadId?: number): Promise<void> {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });

    for (const doc of documents) {
      let uploadId = defaultUploadId;

      if (!uploadId) {
        const ins = await pool.query(
          `INSERT INTO knowledge_uploads (title, category, raw_content, embedding_status)
           VALUES ($1, $2, $3, 'processing')
           RETURNING id`,
          [doc.source || 'เอกสารความรู้', doc.category || 'general', doc.content]
        );
        uploadId = ins.rows[0].id;
      }

      const chunks = await splitter.createDocuments([doc.content]);
      const texts = chunks.map((c) => c.pageContent);
      const embeddingVectors: number[][] = [];
      for (const t of texts) {
        const vec = await getEmbedding(t);
        embeddingVectors.push(vec || new Array(768).fill(0));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i].pageContent;
        const vectorStr = `[${embeddingVectors[i].join(',')}]`;

        await pool.query(
          `INSERT INTO knowledge_chunks (upload_id, chunk_index, content, page_number, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [uploadId, i, chunkText, doc.page ?? null, vectorStr]
        );
      }

      await pool.query(
        `UPDATE knowledge_uploads 
         SET total_chunks = $1, embedding_status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [chunks.length, uploadId]
      );

      console.log(`✅ Ingested ${chunks.length} chunks into PostgreSQL pgvector for upload ${uploadId}`);
    }
  },

  /** Simple regex herb extractor จาก AI response */
  extractHerbs(text: string): RecommendedHerb[] {
    const herbs: RecommendedHerb[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/[-•*]\s*([ก-๙a-zA-Z\s]+?)\s+(\d+(?:\.\d+)?)\s*(กรัม|มล|ช้อน|กำมือ|ก้าน)/);
      if (m) {
        herbs.push({ name: m[1].trim(), amount: parseFloat(m[2]), unit: m[3] });
      }
    }
    return herbs;
  },

  /** ค้นหา Chunks จากคลังตำราสำหรับอาการที่ระบุ */
  searchChunksForSymptom,
};
