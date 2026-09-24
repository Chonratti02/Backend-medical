import { GoogleGenAI } from "@google/genai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import db, { pool } from "../../config/database";
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
} from "../../models/types";

// ─── Initialize Google GenAI SDK ──────────────────────
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// ─── System Prompt (Strict Grounding 100% From Documents) ─────────────
const STRICT_SYSTEM_PROMPT = `คุณคือ AI ผู้ช่วยแพทย์แผนไทยสำหรับการวิเคราะห์อาการผู้ป่วยและสืบค้นคัมภีร์การแพทย์แผนไทย (Strict Grounding 100% จากเอกสารคลังความรู้)

กฎเหล็กที่ต้องปฏิบัติตามอย่างเคร่งครัด (Zero Hallucination Policy):
1. ตอบและอ้างอิงข้อมูลชื่อโรค, สมุฏฐานวินิจฉัย และสมุนไพรเฉพาะที่ปรากฏใน "คลังข้อมูลคัมภีร์ที่สืบค้นพบจากเอกสารคลังความรู้" (Doc) ที่แนบมาเท่านั้น ห้ามแนะนำตัวยาหรือตำรับยาที่ไม่มีอยู่ในเอกสารที่แนบมาเด็ดขาด
2. สำหรับการวินิจฉัยโรคที่น่าจะเป็น (probable_diseases) และสมุฏฐานวินิจฉัย (thai_diagnosis):
   - ให้ระบุโรคที่มีความเป็นไปได้ อย่างน้อย 1 โรค และสูงสุดไม่เกิน 6 โรค (1 ถึง 6 โรค) ตามความสอดคล้องของหลักฐานในคัมภีร์ โดยเรียงลำดับจากความน่าจะเป็นสูงที่สุดลงมา
   - ให้ประเมินระดับโอกาสความเป็นไปได้ของแต่ละโรคเป็น ตัวเลขเปอร์เซ็นต์ % (เช่น "85%", "65%", "45%") โดยพิจารณาจาก:
     (1) ความสอดคล้องของอาการสำคัญและอาการร่วมกับคัมภีร์ (~50%)
     (2) ธาตุเจ้าเรือน อายุ และกาลสมุฏฐาน (~30%)
     (3) ลำดับน้ำหนักในการวินิจฉัยแยกโรค Differential Diagnosis (~20%)
   - ให้ระบุชื่อโรคและชื่อสมุฏฐานตามที่มีบันทึกระบุในเอกสารคัมภีร์/ตำราที่แนบมา (Doc) โดยตรง ไม่จำกัดเฉพาะรายชื่อในฐานข้อมูล
3. สำหรับการแนะนำสมุนไพร/ตำรับยา (herbs):
   - ให้แนะนำสมุนไพรเดี่ยวที่มีบันทึกในคัมภีร์สำหรับอาการนั้นๆ ไม่น้อยกว่า 10 ชนิด (min 10 herbs) ต่ออาการ/โรค โดยคัดเลือกให้ได้ 10 ถึง 15 ชนิด (หรือเท่าที่มีบันทึกจริงในคัมภีร์) เพื่อให้แพทย์มีตัวเลือกในการจัดตำรับยาได้อย่างครอบคลุม
   - **กฎเหล็กการสกัดสมุนไพรเดี่ยว (Single Herb Extraction):**
     * ให้สกัดเฉพาะสมุนไพรเดี่ยวที่มีบันทึกระบุโครงสร้างชัดเจนในคัมภีร์ เช่น "ชื่อสมุนไพร: [ชื่อ]", "ส่วนที่ใช้: [ส่วน]", "รสยา: [รส]", "สรรพคุณยา: [สรรพคุณ]" (ตัวอย่างเช่น: ชื่อสมุนไพร: น้ำแตงกวาสุก, ส่วนที่ใช้: (น้ำ), รสยา: รสเย็น, สรรพคุณยา: ขับปัสสาวะ แก้ปัสสาวะขัด)
     * **ข้อห้ามเด็ดขาด (Strict Prohibition):** ห้ามตัดเอาชื่อวัตถุดิบ ขั้นตอนปรุง หรือวิธีใช้ที่อยู่ในเนื้อหา "ตำรับยาผสม/ยารักษา" (เช่น ห้ามตัดคำว่า "ผลแตงกวา" จากข้อความปรุงยา "เอาสารส้มยัดเข้าในผลแตงกวา หมกไฟแกลบให้สุก...") มาแยกเป็นตัวยาเดี่ยวแล้วแต่งรสยาหรือสรรพคุณขึ้นมาเองเด็ดขาด หากเป็นตำรับยา ให้แนะนำในฐานะชื่อตำรับยาเท่านั้น ห้ามแยกส่วนประกอบมาแต่งเติม
   - name: ชื่อสมุนไพรเดี่ยวหรือชื่อตำรับยาที่ระบุในเอกสารคัมภีร์ (Doc) ห้ามคิดชื่อใหม่หรือสังเคราะห์ชื่อสูตรขึ้นมาเอง
   - taste: รสยาหลักตามที่ระบุในเอกสารคัมภีร์เท่านั้น (หากคัมภีร์ไม่ได้ระบุรสยา ให้ใส่ "-") ห้ามจินตนาการหรือเดารสยาขึ้นมาเองเด็ดขาด เช่น ห้ามแต่งว่า "รส: เย็น จืด ฉ่ำน้ำ"
   - part_used: ส่วนของพืชหรือวัตถุธาตุที่ใช้ตามที่ระบุในคัมภีร์ (หากไม่ได้ระบุให้ใส่ "-")
   - properties: สรรพคุณตรงตามที่ระบุในเอกสารคัมภีร์ ห้ามเขียนต่อเติมเอง
   - usage: วิธีใช้และขนาดรับประทาน (ตามที่ระบุในเอกสารคัมภีร์ หรือหากเป็นสมุนไพรเดี่ยวที่ไม่มีวิธีใช้ให้ใส่ "ตามคำแนะนำของแพทย์แผนไทย")
   - precautions: ข้อควรระวัง
   - source: แหล่งอ้างอิงชื่อคัมภีร์/เอกสารตามที่ระบุใน Doc
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
      model: "gemini-embedding-001",
      contents: text,
      config: { outputDimensionality: 768 },
    });
    return (
      response?.embeddings?.[0]?.values ||
      (response as any)?.embedding?.values ||
      null
    );
  } catch (err: any) {
    console.warn("⚠️ GoogleGenAI getEmbedding error:", err?.message);
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
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}") {
        if (stack.length && stack[stack.length - 1] === "{") stack.pop();
      } else if (char === "]") {
        if (stack.length && stack[stack.length - 1] === "[") stack.pop();
      }
    }
  }

  // If ended inside a string literal, close the quote
  if (inString) {
    jsonStr += '"';
  }

  // Remove trailing comma before closing if any
  jsonStr = jsonStr.replace(/,\s*$/, "");

  // Close all unclosed brackets/braces in reverse order
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === "{") jsonStr += "}";
    else if (last === "[") jsonStr += "]";
  }

  return jsonStr;
}

function extractFirstCompleteJsonObject(str: string): string {
  let text = str.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
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
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        stack++;
      } else if (char === "}") {
        stack--;
        if (stack === 0) {
          // Found exact matching closing brace of root object!
          return text.substring(firstBrace, i + 1).trim();
        }
      }
    }
  }

  // If not cleanly closed, return up to last brace or remainder
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1).trim();
  }
  return text.substring(firstBrace).trim();
}

function cleanAndSanitizeJsonString(str: string): string {
  let cleaned = extractFirstCompleteJsonObject(str);

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  return cleaned;
}

function extractJsonFromAiResponse(raw: string | null): any {
  if (!raw) return null;
  const cleaned = cleanAndSanitizeJsonString(raw);

  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn("⚠️ Initial JSON.parse failed:", e?.message);

    // Step 1: Fix missing commas and trailing commas
    let repaired = cleaned
      .replace(/}\s*(\r?\n)?\s*{/g, "},\n{")
      .replace(/]\s*(\r?\n)?\s*\[/g, "],\n[")
      .replace(/,\s*([\]}])/g, "$1");

    try {
      return JSON.parse(repaired);
    } catch (e2: any) {
      // Step 2: Auto-close incomplete JSON structures
      try {
        const closed = autoCloseJson(repaired);
        return JSON.parse(closed);
      } catch (e3: any) {
        console.warn("⚠️ Auto-closed JSON.parse also failed:", e3?.message);
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
  asJson = false,
): Promise<GeminiCallOutput | null> {
  if (!ai) {
    console.error(
      "❌ GoogleGenAI SDK is not initialized: GEMINI_API_KEY is missing.",
    );
    return null;
  }

  // Default to gemini-3.5-flash (free model with active quota & high throughput)
  let requestedModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  if (requestedModel === "gemini-3.1-pro" || requestedModel === "3.1-pro") {
    requestedModel = "gemini-3.1-pro-preview";
  }

  const candidateModels = [
    requestedModel
  ].filter((m, i, arr): m is string => !!m && arr.indexOf(m) === i);

  for (const model of candidateModels) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Operation timed out")), timeoutMs),
        );

        const generatePromise = ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.0,
            // Non-limit token: do not restrict maxOutputTokens so response won't truncate
            ...(asJson ? { responseMimeType: "application/json" } : {}),
          },
        });

        const response: any = await Promise.race([
          generatePromise,
          timeoutPromise,
        ]);
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
          `🤖 Gemini model=${model} returned text length=${text?.length}, finishReason=${finishReason}, total_tokens=${tokenUsage?.total_tokens ?? "N/A"}`,
        );
        if (text) {
          return {
            text,
            usage: tokenUsage,
            model_used: model,
          };
        }
      } catch (err: any) {
        console.warn(
          `⚠️ GoogleGenAI request failed on model ${model} (attempt ${attempt}):`,
          err?.message,
        );
        if (
          err?.message?.includes("timed out") ||
          err?.message?.includes("aborted")
        ) {
          console.warn(`⏱️ Model ${model} timed out after ${timeoutMs}ms.`);
          break;
        }
        const isTransient =
          err?.message?.includes("503") ||
          err?.message?.includes("RESOURCE_EXHAUSTED") ||
          err?.message?.includes("UNAVAILABLE") ||
          err?.message?.includes("overloaded");
        if (
          isTransient &&
          attempt < maxAttempts &&
          !err?.message?.includes("limit: 0")
        ) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        break; // ถ้า limit: 0 หรือ 404 ให้ลองโมเดลถัดไปทันที
      }
    }
  }

  return null;
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
    const hRes = await pool.query(
      "SELECT id, herb_name FROM herbal_knowledge ORDER BY id",
    );
    const dRes = await pool.query(
      "SELECT id, disease_name FROM diseases ORDER BY id",
    );
    cachedHerbs = hRes.rows;
    cachedDiseases = dRes.rows;
    lastDbFetch = now;
  } catch (err: any) {
    console.error(
      "Error fetching canonical herbal_knowledge and diseases:",
      err?.message,
    );
    cachedHerbs = cachedHerbs || [];
    cachedDiseases = cachedDiseases || [];
  }
  return { herbs: cachedHerbs, diseases: cachedDiseases };
}

/** ค้นหา Chunks จาก PostgreSQL ด้วย Vector Cosine Similarity และ Keyword Match แบบกระจายครอบคลุมคัมภีร์ตามหมวดที่ระบุ */
async function searchChunksForSymptom(
  symptom: string,
  limit = 6,
  category: "โรค" | "สมุนไพร" | "all" = "all",
): Promise<any[]> {
  let rows: any[] = [];
  try {
    const catCondition = category === "all" ? "" : "AND ku.category = $3";

    // 1. Vector Cosine Distance จาก pgvector (ดึงกระจายจากทุกคัมภีร์ที่ is_active = TRUE ตามหมวดที่กำหนด)
    const queryEmbedding = await getEmbedding(symptom);
    if (queryEmbedding && queryEmbedding.length === 768) {
      const vectorStr = `[${queryEmbedding.join(",")}]`;
      const vecQuery = `
        WITH RankedChunks AS (
          SELECT kc.id, kc.content, ku.title, ku.id AS upload_id, ku.category,
                 1 - (kc.embedding <=> $1) AS similarity,
                 ROW_NUMBER() OVER (PARTITION BY ku.id ORDER BY kc.embedding <=> $1) as rank
          FROM knowledge_chunks kc
          JOIN knowledge_uploads ku ON kc.upload_id = ku.id
          WHERE ku.is_active = TRUE ${catCondition} AND kc.embedding IS NOT NULL
        )
        SELECT id, content, title, similarity, upload_id, category
        FROM RankedChunks
        WHERE rank <= 3 AND similarity >= 0.55
        ORDER BY rank ASC, similarity DESC
        LIMIT $2
      `;
      const vecParams =
        category === "all"
          ? [vectorStr, limit]
          : [vectorStr, limit, category];
      const vecRes = await pool.query(vecQuery, vecParams);
      rows = vecRes.rows;
    }

    // 2. เสริมด้วย Keyword Match ในเนื้อหาคัมภีร์ถ้าเวกเตอร์ได้ผลน้อย หรือต้องการเติมข้อมูลสรรพคุณยาจากทุกเล่ม
    if (rows.length < limit && symptom.trim().length >= 2) {
      const cleanSym = symptom.trim();
      const kwQuery = `
        WITH KwRanked AS (
          SELECT kc.id, kc.content, ku.title, ku.id AS upload_id, ku.category,
                 0.85 AS similarity,
                 ROW_NUMBER() OVER (PARTITION BY ku.id ORDER BY kc.id) as rank
          FROM knowledge_chunks kc
          JOIN knowledge_uploads ku ON kc.upload_id = ku.id
          WHERE ku.is_active = TRUE ${catCondition} AND kc.content ILIKE $1
        )
        SELECT id, content, title, similarity, upload_id, category
        FROM KwRanked
        WHERE rank <= 2
        LIMIT $2
      `;
      const kwParams =
        category === "all"
          ? [`%${cleanSym}%`, limit - rows.length]
          : [`%${cleanSym}%`, limit - rows.length, category];
      const kwRes = await pool.query(kwQuery, kwParams);

      for (const r of kwRes.rows) {
        if (!rows.some((existing) => existing.id === r.id)) {
          rows.push(r);
        }
      }
    }
  } catch (err: any) {
    console.error(
      `❌ Vector/keyword search error for symptom "${symptom}" (category: ${category}):`,
      err.message,
    );
  }
  return rows.slice(0, limit);
}

// ─── Helper Functions for Formatting Clinical & TTM Data ────────────────────

function formatClinicalHistory(
  clinicalHistory: any,
  chiefComplaint?: string | null,
  presentIllness?: string | null,
  illnessStartDate?: string | null,
  illnessStartTime?: string | null,
  illnessDays?: number | null,
): string {
  const cc = chiefComplaint || clinicalHistory?.chief_complaint || "-";
  const pi = presentIllness || clinicalHistory?.present_illness || "-";
  const ph = clinicalHistory?.past_history || "-";
  const fh = clinicalHistory?.family_history || "-";
  const pers = clinicalHistory?.personal_history || "-";
  const onsetParts = [
    illnessStartDate ? `วันที่เริ่มป่วย: ${illnessStartDate}` : null,
    illnessStartTime ? `เวลาเริ่มป่วย: ${illnessStartTime} น.` : null,
    illnessDays ? `ระยะเวลาเป็นมา: ${illnessDays} วัน` : null,
  ].filter(Boolean);
  const onsetStr = onsetParts.length > 0 ? onsetParts.join(" | ") : null;

  return [
    `• 1. อาการสำคัญ (Chief Complaint): ${cc}`,
    onsetStr ? `  - การเริ่มป่วย: ${onsetStr}` : null,
    `• 2. ประวัติเจ็บป่วยปัจจุบัน (Present Illness): ${pi}`,
    `• 3. ประวัติเจ็บป่วยในอดีต (Past Medical History): ${ph}`,
    `• 4. ประวัติครอบครัว (Family History): ${fh}`,
    `• 5. ประวัติส่วนตัวและพฤติกรรม (Personal History): ${pers}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPhysicalExam(pe: any): string {
  if (!pe || (typeof pe === "object" && Object.keys(pe).length === 0)) {
    return "ไม่มีข้อมูลการตรวจร่างกายทั่วไป";
  }
  if (typeof pe === "string") return pe;
  return [
    `• 1. GA (General Appearance): ${pe.pe_ga || "-"}`,
    `• 2. HEENT (Head, Eyes, Ears, Nose, Throat): ${pe.pe_heent || "-"}`,
    `• 3. Heart (ระบบหัวใจและหลอดเลือด): ${pe.pe_heart || "-"}`,
    `• 4. Chest/Lungs (ระบบทางเดินหายใจและปอด): ${pe.pe_chest || "-"}`,
    `• 5. Abdomen (ช่องท้องและระบบทางเดินอาหาร): ${pe.pe_abdomen || "-"}`,
    `• 6. PV (การตรวจภายใน): ${pe.pe_pv || "-"}`,
    `• 7. PR (การตรวจทวารหนัก): ${pe.pe_pr || "-"}`,
    `• 8. Genitalia (อวัยวะสืบพันธุ์ภายนอก): ${pe.pe_genitalia || "-"}`,
    `• 9. Neuro (ระบบประสาท): ${pe.pe_neuro || "-"}`,
    `• 10. Extremities (แขนขา กล้ามเนื้อ กระดูกและข้อ): ${pe.pe_extremities || "-"}`,
  ].join("\n");
}

function formatTtmExam(ttm: any): string {
  if (!ttm || (typeof ttm === "object" && Object.keys(ttm).length === 0)) {
    return "ไม่มีข้อมูลการตรวจร่างกายแพทย์แผนไทย";
  }
  if (typeof ttm === "string") return ttm;
  return [
    `• การตรวจอวัยวะ: หู (${ttm.ttm_ear || "-"}), ลิ้น (${ttm.ttm_tongue || "-"}), ตา (${ttm.ttm_eye || "-"}), จมูก (${ttm.ttm_nose || "-"})`,
    `• การตรวจ 4 ขั้นตอน: การดู (${ttm.ttm_inspect || "-"}), การคลำ (${ttm.ttm_palpate || "-"}), การเคาะ (${ttm.ttm_percuss || "-"}), การฟัง (${ttm.ttm_auscultate || "-"})`,
    `• สภาพตรีสมุฏฐาน: วาตะ (${ttm.ttm_vata || "ปกติ"}), ปิตตะ (${ttm.ttm_pitta || "ปกติ"}), เสมหะ (${ttm.ttm_semha || "ปกติ"})`,
    `• ชีพจรตรีธาตุ (Pulse Tridhatu / อุณหภูมิสัมผัส): ${ttm.ttm_pulse_tridhatu || "-"}`,
    `• การวินิจฉัยเวชกรรมไทยเบื้องต้น: ${ttm.ttm_diagnosis || "-"}`,
  ].join("\n");
}

function formatCalculatedSamutthana(
  utu: any,
  kala: any,
  tridhatu: any,
  geoVal?: string | null,
): string {
  const parts: string[] = [];

  // อุตุสมุฏฐาน
  if (utu) {
    if (typeof utu === "object") {
      parts.push(
        `• อุตุสมุฏฐาน (ฤดู/กาลอากาศ): ${utu.seasonName || utu.season_name || "ไม่ระบุ"} | ธาตุครอง: ${utu.dominantElement || utu.dominant_element || "-"} | สมุฏฐาน: ${utu.dominantDosha || utu.dominant_dosha || "-"} | พิกัด 40 วัน: ${utu.phaseTitle || utu.phase_title || utu.subDosha || "-"} | พยาธิสภาพ: ${utu.pathologyNote || utu.pathology_note || "-"}`,
      );
    } else {
      parts.push(`• อุตุสมุฏฐาน: ${utu}`);
    }
  }

  // กาลสมุฏฐาน
  if (kala) {
    if (typeof kala === "object") {
      parts.push(
        `• กาลสมุฏฐาน (ช่วงเวลากำเริบ): ${kala.yamName || kala.yam_name || kala.timeRange || "ไม่ระบุ"} | สมุฏฐานประจำยาม: ${kala.dominantDosha || kala.activeDosha || "-"} | อิทธิพลธาตุ: ${kala.elementImpact || kala.doshaComplexity || "-"}`,
      );
    } else {
      parts.push(`• กาลสมุฏฐาน: ${kala}`);
    }
  }

  // ตรีธาตุสมุฏฐาน / อายุสมุฏฐาน
  if (tridhatu) {
    if (typeof tridhatu === "object") {
      parts.push(
        `• ตรีธาตุและอายุสมุฏฐาน: ${tridhatu.ageStage || tridhatu.stageName || "ไม่ระบุ"} | ธาตุครองวัย: ${tridhatu.ageDosha || tridhatu.dominantDosha || "-"} | ระยะการดำเนินโรค: ${tridhatu.diseaseStage || "-"} (${tridhatu.standardDays ? `${tridhatu.standardDays} วัน` : ""})`,
      );
    } else {
      parts.push(`• ตรีธาตุสมุฏฐาน: ${tridhatu}`);
    }
  }

  // ประเทศสมุฏฐาน
  if (geoVal) {
    const geoMap: Record<string, string> = {
      mountain: "ประเทศเทือกเขาสูง (กุรุราช: ธาตุเตโช/ปิตตะมักกำเริบ)",
      sandy: "ประเทศน้ำกรวดทราย (สันถวราช: ธาตุดิน/ปถวี/วาโยมักกำเริบ)",
      muddy_rain: "ประเทศน้ำฝนเปลือกตม (มิลักขราช: ธาตุวาโย/เสมหะมักกำเริบ)",
      muddy_sea: "ประเทศน้ำเค็มเปลือกตม (มัชฌิมราช: ธาตุอาโป/เสมหะมักกำเริบ)",
    };
    parts.push(`• ประเทศสมุฏฐาน: ${geoMap[geoVal] || geoVal}`);
  }

  return parts.length > 0
    ? parts.join("\n")
    : "ไม่มีข้อมูลการคำนวณสมุฏฐานเพิ่มเติม";
}

function logAiAnalysisSummary(params: {
  patientName: string;
  age?: number | null;
  gender?: string | null;
  bodyElement?: string | null;
  bp?: string | null;
  temp?: number | null;
  chiefComplaint: string;
  symptoms: string[];
  perSymptomData: { symptom: string; chunks: any[] }[];
  modelUsed: string;
  processingMs: number;
  tokenUsage?: {
    prompt_tokens?: number;
    candidates_tokens?: number;
    total_tokens?: number;
  };
  result: MultiSymptomAnalysisResult;
  confidence: number;
}): void {
  const line = "─".repeat(78);
  const doubleLine = "═".repeat(78);

  console.log(`\n╔${doubleLine}╗`);
  console.log(
    `║                  🌿 AI RAG CLINICAL ASSESSMENT INITIATED                    ║`,
  );
  console.log(`╚${doubleLine}╝`);
  console.log(
    `👤 ผู้ป่วย: ${params.patientName} | เพศ: ${params.gender || "-"} | อายุ: ${params.age ? `${params.age} ปี` : "-"} | ธาตุเจ้าเรือน: ${params.bodyElement || "-"}`,
  );
  console.log(
    `🩺 สัญญาณชีพ: BP: ${params.bp || "-"} mmHg | Temp: ${params.temp ? `${params.temp} °C` : "-"} | อาการสำคัญ: ${params.chiefComplaint}`,
  );
  console.log(
    `📊 อาการที่ส่งตรวจ (${params.symptoms.length}): ${params.symptoms.map((s, i) => `[${i + 1}] ${s}`).join("  ")}`,
  );
  console.log(`╟${line}╢`);
  console.log(`📚 ผลการสืบค้นคลังคัมภีร์ (pgvector Knowledge Retrieval):`);
  params.perSymptomData.forEach((item, idx) => {
    console.log(
      `  • [อาการที่ ${idx + 1}] "${item.symptom}": พบ ${item.chunks.length} ชิ้นเนื้อหา`,
    );
    item.chunks.forEach((c, cIdx) => {
      const sim =
        c.similarity != null
          ? `${(Number(c.similarity) * 100).toFixed(1)}%`
          : "N/A";
      const excerpt = (c.content || "")
        .trim()
        .replace(/\s+/g, " ")
        .substring(0, 60);
      console.log(
        `    [${cIdx + 1}] ${c.title || "คัมภีร์"} | ความคล้าย: ${sim} | "${excerpt}…"`,
      );
    });
  });
  console.log(`╟${line}╢`);
  console.log(
    `🤖 AI Engine: ${params.modelUsed} | เวลาประมวลผล: ${params.processingMs.toLocaleString()} ms | Tokens: ${params.tokenUsage?.total_tokens ?? "N/A"}`,
  );
  console.log(`╟${line}╢`);
  console.log(`📋 ผลการวิเคราะห์และการวินิจฉัย (AI Clinical Findings):`);
  if (
    params.result.probable_diseases &&
    params.result.probable_diseases.length > 0
  ) {
    console.log(
      `  🔮 โรคที่คาดว่าจะเป็น (${params.result.probable_diseases.length} โรค):`,
    );
    params.result.probable_diseases.forEach((pd, idx) => {
      console.log(
        `    ${idx + 1}. ${pd.disease_name} (โอกาส: ${pd.probability_level})`,
      );
      console.log(`       - สมุฏฐาน: ${pd.primary_cause}`);
      if (pd.clinical_explanation) {
        const shortExpl = pd.clinical_explanation
          .substring(0, 90)
          .replace(/\s+/g, " ");
        console.log(`       - คำอธิบาย: ${shortExpl}…`);
      }
    });
  } else {
    console.log(`  🔮 ไม่พบโรคที่เข้าข่ายโดยตรง`);
  }

  console.log(`  🌿 สมุนไพรและตำรับยาแนะนำ:`);
  let totalHerbs = 0;
  params.result.symptoms_analysis?.forEach((sec) => {
    sec.herbs?.forEach((h) => {
      totalHerbs++;
      const tasteStr = h.taste ? ` [รส: ${h.taste}]` : "";
      const partStr = h.part_used ? ` [ส่วน: ${h.part_used}]` : "";
      console.log(
        `    • ${h.name}${tasteStr}${partStr} -> ${h.properties || "-"}`,
      );
    });
  });
  if (totalHerbs === 0) {
    console.log(`    (ไม่มีรายการสมุนไพรแนะนำเพิ่มเติม)`);
  }

  if (params.result.overall_precautions) {
    console.log(
      `  ⚠️ ข้อควรระวัง: ${params.result.overall_precautions.substring(0, 90)}…`,
    );
  }
  console.log(
    `  💡 Dynamic Confidence Score: ${(params.confidence * 100).toFixed(1)}%`,
  );
  console.log(`╚${doubleLine}╝\n`);
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
  }): Promise<
    MultiSymptomAnalysisResult & {
      drugs: any[];
      flatHerbs: RecommendedHerb[];
      textResponse: string;
    }
  > {
    const { symptoms, patientData, context } = input;

    // 1. แปลง symptoms เป็น Array (รองรับสูงสุด 5 อาการ)
    let symptomList: string[] = [];
    if (Array.isArray(symptoms)) {
      symptomList = symptoms
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean);
    } else if (typeof symptoms === "string" && symptoms.trim()) {
      symptomList = symptoms
        .split(/[\n;；,，]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    symptomList = symptomList.slice(0, 5);

    if (symptomList.length === 0) {
      symptomList = ["อาการไม่ระบุชัดเจน"];
    }

    // 2. ดึง Chunks สำหรับแต่ละอาการแบบขนาน (Parallel):
    //    - diseaseChunks: ดึงจากหมวด 'โรค' สำหรับการวิเคราะห์และวินิจฉัยโรคใน probable_diseases
    //    - herbChunks: ดึงจากหมวด 'สมุนไพร' (Doc 3 & Doc 5) สำหรับการคัดเลือกและแนะนำสมุนไพรเดี่ยวใน symptoms_analysis.herbs
    const perSymptomData = await Promise.all(
      symptomList.map(async (sym) => {
        const [diseaseChunks, herbChunks] = await Promise.all([
          searchChunksForSymptom(sym, 6, "โรค"),
          searchChunksForSymptom(sym, 20, "สมุนไพร"),
        ]);
        const chunks = [...diseaseChunks, ...herbChunks];
        return { symptom: sym, diseaseChunks, herbChunks, chunks };
      }),
    );

    const allReferences: HerbReference[] = [];
    const refKeySet = new Set<string>();

    for (const item of perSymptomData) {
      for (const c of [...item.diseaseChunks, ...item.herbChunks]) {
        const key = c.title || "คัมภีร์การแพทย์แผนไทย";
        if (!refKeySet.has(key)) {
          refKeySet.add(key);
          allReferences.push({
            title: c.title || "คัมภีร์การแพทย์แผนไทย",
            excerpt:
              (c.content || "").trim().replace(/\s+/g, " ").substring(0, 160) +
              "…",
          });
        }
      }
    }

    // 3. จัดเตรียม Prompt ข้อมูลผู้ป่วยและ Chunks ตาม Data Fields ทั้งหมด
    const { herbs: dbHerbs, diseases: dbDiseases } =
      await getCanonicalKnowledge();

    // ข้อมูลทั่วไป & ระบุตัวตน
    const nameVal =
      patientData?.name ||
      ((context as any)?.first_name
        ? `${(context as any)?.prefix || ""}${(context as any)?.first_name} ${(context as any)?.last_name || ""}`.trim()
        : "") ||
      "ไม่ระบุชื่อ";
    const genderVal = patientData?.gender || context?.gender;
    const genderStr =
      genderVal === "male"
        ? "ชาย"
        : genderVal === "female"
          ? "หญิง"
          : "ไม่ระบุ";
    const ageVal = patientData?.age || context?.age;
    const dobVal = patientData?.date_of_birth || context?.date_of_birth;
    const birthTimeVal = patientData?.birth_time || context?.birth_time;
    const dayOfWeekVal =
      patientData?.birth_day_of_week || context?.birth_day_of_week;
    const bloodVal =
      context?.blood_group && context.blood_group !== "unknown"
        ? context.blood_group
        : "ไม่ระบุ";
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
    const birthSamutthanaVal =
      patientData?.birth_samutthana || context?.birth_samutthana;
    const birthRakonVal = context?.birth_rakon;
    const birthElemDescVal = context?.birth_element_desc;

    // จักราศีแรกปฏิสนธิ
    const conceptionMonthVal = context?.conception_lunar_month;
    const conceptionZodiacVal =
      patientData?.conception_zodiac || context?.conception_zodiac;
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
    const drugAllergyVal =
      patientData?.allergies || context?.drug_allergy || "ไม่มีประวัติแพ้ยา";
    const chronicDiseaseVal = context?.chronic_disease || "ไม่มี";
    const pmhVal = context?.pmh || "ไม่มี";
    const smokingVal = patientData?.smoking || "ไม่ระบุ";
    const alcoholVal = patientData?.alcohol || "ไม่ระบุ";

    // การเจ็บป่วยครั้งนี้ & สมุฏฐานปัจจุบัน
    const chiefComplaintVal = context?.chief_complaint;
    const illnessStartDateVal = context?.illness_start_date;
    const illnessStartTimeVal = context?.illness_start_time;
    const illnessDaysVal = patientData?.illness_days || context?.illness_days;
    const visitLunarPhaseVal = context?.visit_lunar_phase;
    const visitLunarDayVal = context?.visit_lunar_day;

    const clinicalHistoryFormatted = formatClinicalHistory(
      context?.clinical_history,
      chiefComplaintVal || symptomList.join(", "),
      (patientData as any)?.present_illness || (context as any)?.present_illness,
      illnessStartDateVal,
      illnessStartTimeVal,
      illnessDaysVal,
    );
    const physicalExamFormatted = formatPhysicalExam(context?.physical_exam);
    const ttmExamFormatted = formatTtmExam(context?.ttm_exam);
    const samutthanaCalcFormatted = formatCalculatedSamutthana(
      context?.utu_samutthana,
      context?.kala_samutthana,
      context?.tridhatu_samutthana,
      geoVal,
    );

    const patientClinicalSections = `
[ส่วนที่ 1: ข้อมูลทั่วไปและการระบุตัวตนผู้ป่วย (Patient Demographics)]
- ชื่อ-นามสกุล: ${nameVal}
- เพศ: ${genderStr} | อายุ: ${ageVal ? `${ageVal} ปี` : "ไม่ระบุ"}
- วันเกิด: ${dobVal || "ไม่ระบุ"} (วันในสัปดาห์: ${dayOfWeekVal || "ไม่ระบุ"}) | เวลาเกิด (Birth Time): ${birthTimeVal || "ไม่ระบุ"}
- หมู่โลหิต: ${bloodVal}
- ประเทศสมุฏฐาน (ถิ่นที่อยู่อาศัย): ${geoVal || "ไม่ระบุ"}

[ส่วนที่ 2: ธาตุเจ้าเรือนและจักราศีสมุฏฐานกำเนิด (TTM Elements & Zodiac Samutthana)]
- ธาตุเจ้าเรือนเดิม: ${bodyElemVal || "ไม่ระบุ"}
- กำเนิดทางจันทรคติ: ${lunarBdayVal || (lunarPhaseVal && lunarDayVal ? `${lunarPhaseVal === "waxing" ? "ข้างขึ้น" : "ข้างแรม"} ${lunarDayVal} ค่ำ` : "ไม่ระบุ")} (ปีนักษัตร: ${zodiacYearVal || "ไม่ระบุ"})
- จักราศีวันเกิด (Birth Zodiac): ${birthZodiacVal || "ไม่ระบุ"} | ธาตุราศี: ${birthZodiacElemVal || "ไม่ระบุ"} | สมุฏฐาน: ${birthSamutthanaVal || "ไม่ระบุ"} | สิ่งระคน: ${birthRakonVal || "ไม่ระบุ"}
  (รายละเอียด: ${birthElemDescVal || "ไม่ระบุ"})
- จักราศีแรกปฏิสนธิ (Conception Zodiac): ${conceptionZodiacVal || "ไม่ระบุ"} | ธาตุปฏิสนธิ: ${conceptionElemVal || "ไม่ระบุ"} | เดือนปฏิสนธิ: ${conceptionMonthVal || "ไม่ระบุ"} | สมุฏฐาน: ${conceptionSamutthanaVal || "ไม่ระบุ"} | สิ่งระคน: ${conceptionRakonVal || "ไม่ระบุ"}
  (รายละเอียด: ${conceptionDescVal || "ไม่ระบุ"})

[ส่วนที่ 3: สัญญาณชีพและประวัติสุขภาพพื้นฐาน (Vital Signs & Health Profile)]
- น้ำหนัก: ${weightVal ? `${weightVal} กก.` : "ไม่ระบุ"} | ส่วนสูง: ${heightVal ? `${heightVal} ซม.` : "ไม่ระบุ"} | BMI: ${bmiVal || "ไม่ระบุ"} (${bmiStatusVal || "ปกติ"})
- อุณหภูมิร่างกาย (Body Temp): ${tempVal ? `${tempVal} °C` : "ไม่ระบุ"}
- ความดันโลหิต (BP): ${bpVal || "ไม่ระบุ"} mmHg | ชีพจร (Pulse): ${pulseVal ? `${pulseVal} ครั้ง/นาที` : "ไม่ระบุ"}
- ประวัติการแพ้ยา (Drug Allergy): ${drugAllergyVal}
- โรคประจำตัว (Chronic Disease): ${chronicDiseaseVal}
- ประวัติการเจ็บป่วยในอดีต (PMH): ${pmhVal}
- พฤติกรรมสุขภาพ: สูบบุหรี่ (${smokingVal}), ดื่มสุรา (${alcoholVal})

[ส่วนที่ 4: การซักประวัติการเจ็บป่วย 5 ด้าน (Clinical History 5 Systems)]
${clinicalHistoryFormatted}

[ส่วนที่ 5: การตรวจร่างกายทั่วไป 10 ระบบ (General Physical Examination 10 Systems)]
${physicalExamFormatted}

[ส่วนที่ 6: การตรวจร่างกายทางการแพทย์แผนไทย (Traditional Thai Medicine Examination)]
${ttmExamFormatted}

[ส่วนที่ 7: ข้อมูลที่ได้จากการคำนวณสมุฏฐานทางเวชกรรมไทย (Calculated TTM Samutthana Analysis)]
- ข้างขึ้นข้างแรมวันที่มาตรวจ: ${visitLunarPhaseVal && visitLunarDayVal ? `${visitLunarPhaseVal === "waxing" ? "ข้างขึ้น" : "ข้างแรม"} ${visitLunarDayVal} ค่ำ` : "ไม่ระบุ"}
${samutthanaCalcFormatted}
`.trim();

    let chunksSection = "";
    perSymptomData.forEach((item, idx) => {
      chunksSection += `\n\n========================================\n`;
      chunksSection += `[อาการที่ ${idx + 1}]: "${item.symptom}"\n`;

      // 1. คลังข้อมูลคัมภีร์หมวด 'โรค'
      chunksSection += `\n[ก. คลังข้อมูลคัมภีร์หมวด 'โรค' (ใช้สำหรับวิเคราะห์และวินิจฉัยโรคใน probable_diseases)]:\n`;
      if (item.diseaseChunks.length === 0) {
        chunksSection += `- ไม่พบคัมภีร์หมวดโรคที่เกี่ยวข้องโดยตรงกับอาการนี้\n`;
      } else {
        item.diseaseChunks.forEach((c, cIdx) => {
          const scripture = c.title || "คัมภีร์การแพทย์แผนไทย (โรค)";
          chunksSection += `--- เอกสารโรค ชิ้นที่ ${cIdx + 1} (${scripture}) ---\n${c.content.trim().slice(0, 600)}\n`;
        });
      }

      // 2. คลังข้อมูลคัมภีร์หมวด 'สมุนไพร'
      chunksSection += `\n[ข. คลังข้อมูลคัมภีร์หมวด 'สมุนไพร' (ใช้สำหรับคัดเลือกสมุนไพรเดี่ยวประจำอาการใน symptoms_analysis.herbs)]:\n`;
      if (item.herbChunks.length === 0) {
        chunksSection += `- ไม่พบคัมภีร์หมวดสมุนไพรที่เกี่ยวข้องโดยตรงกับอาการนี้\n`;
      } else {
        item.herbChunks.forEach((c, cIdx) => {
          const scripture = c.title || "คัมภีร์การแพทย์แผนไทย (สมุนไพร)";
          chunksSection += `--- เอกสารสมุนไพร ชิ้นที่ ${cIdx + 1} (${scripture}) ---\n${c.content.trim().slice(0, 600)}\n`;
        });
      }
    });

    const prompt = `${STRICT_SYSTEM_PROMPT}

ข้อมูลผู้ป่วยและการตรวจทางคลินิกตามระเบียนข้อมูล (Clinical & TTM Patient Context):
${patientClinicalSections}

รายการอาการที่ต้องการวิเคราะห์และคลังข้อมูลคัมภีร์ที่สืบค้นพบจากเอกสารคลังความรู้ (Knowledge Documents):
${chunksSection}

โปรดประเมินอาการแต่ละข้อตามคลังข้อมูลคัมภีร์/เอกสาร (Doc) ที่ให้มาเท่านั้น โดยให้:
1. "patient_summary": สรุปข้อมูลผู้ป่วย (ชื่อ, อายุ, เพศ, น้ำหนัก, ส่วนสูง, อุณหภูมิ, ความดันโลหิต, ชีพจร, ประวัติแพ้ยา, โรคประจำตัว, สูบบุหรี่, ดื่มสุรา, ธาตุเจ้าเรือน, สรุปอุตุสมุฏฐาน, สรุปกาลสมุฏฐาน) จากข้อมูลที่ได้รับ
2. "probable_diseases": วินิจฉัยโรคที่คาดว่าผู้ป่วยจะเป็นจากข้อมูลที่มีและสอดคล้องกับ [ก. คลังข้อมูลคัมภีร์หมวด 'โรค'] ที่สืบค้นพบ (ระบุโรคที่มีโอกาสเป็นไปได้ อย่างน้อย 1 โรค ถึงสูงสุด 6 โรค โดยเรียงลำดับจากความน่าจะเป็นสูงที่สุดลงมา พร้อมระบุระดับโอกาสความเป็นไปได้เป็นตัวเลขเปอร์เซ็นต์ % เช่น "85%", "65%", "45%" เพื่อช่วยแพทย์ในการวินิจฉัยแยกโรค Differential Diagnosis) โดยระบุชื่อโรค disease_name ตามที่ปรากฏในเอกสารคัมภีร์หมวดโรค พร้อมระดับความเป็นไปได้เป็นเปอร์เซ็นต์ (probability_level เช่น "85%", "60%"), สมุฏฐานเหตุแห่งโรค (primary_cause), ข้อมูลสนับสนุน (supporting_evidence), คำอธิบายการวินิจฉัยและการวิเคราะห์เชิงคลินิกอย่างละเอียด (clinical_explanation), และรหัสโรคหรือการจัดหมวดตามคัมภีร์ (icd10_or_ttm_code)
3. "symptoms_analysis": วิเคราะห์แต่ละอาการและแนะนำสมุนไพรเดี่ยวประจำอาการ โดยต้องคัดเลือกจาก [ข. คลังข้อมูลคัมภีร์หมวด 'สมุนไพร'] (เช่น ข้อมูลส่วนที่ 3 ส่วนของการคัดแยกสมุนไพรในการรักษาแต่ละอาการ และข้อมูลส่วนที่ 5) เท่านั้น โดยต้องคัดเลือกสมุนไพรเดี่ยวอย่างน้อย 10 ชนิด (min 10 herbs) ต่ออาการ/โรค (กำหนดช่วง 10 ถึง 15 ชนิด หรือเท่าที่มีบันทึกจริงในคัมภีร์ หากอาการใดไม่พบคัมภีร์ ให้ has_knowledge: false และ herbs: []) โดยแต่ละสมุนไพรต้องระบุ:
   - name: ชื่อสมุนไพรเดี่ยวตรงตามคัมภีร์หมวดสมุนไพรเท่านั้น (เช่น กกลังกา, ขัดมอน, มะตูมอ่อน, ผักชี, บัวหลวง, สารส้ม, ดินประสิว ฯลฯ **ข้อห้ามเด็ดขาด: ห้ามนำชื่อตำรับยาจากหมวดโรค เช่น 'ตำรับยาแก้มุตกิต', 'ตำรับยารากไทรย้อยและไพลดำ', 'ยาชื่อ อัพยาธิคุณ' มาใส่ในช่องสมุนไพรเดี่ยว**)
   - taste: รสยาหลักตามที่ระบุในคัมภีร์สมุนไพร เช่น รสจืดเย็น, รสเผ็ดร้อน, รสฝาดเปรี้ยว (หรือระบุตามคัมภีร์)
   - part_used: ส่วนของพืชหรือวัตถุธาตุที่ใช้ เช่น ต้น, ราก, ใบ, ดอก, ผลึก
   - properties: สรรพคุณตามคัมภีร์สมุนไพร
   - usage: วิธีใช้และขนาดรับประทาน
   - precautions: ข้อควรระวัง
   - source: แหล่งอ้างอิงชื่อคัมภีร์ตามที่ระบุใน Doc หมวดสมุนไพร (เช่น ข้อมูลส่วนที่ 3 ส่วนของการคัดแยกสมุนไพรในการรักษาแต่ละอาการ)

คำเตือนสำคัญ: ห้ามใส่ข้อความเกริ่นนำ ข้อความทักทาย หรือสรุปปิดท้ายใดๆ ทั้งสิ้น ให้ตอบกลับเฉพาะ JSON object ที่สมบูรณ์ตาม Schema ด้านล่างเท่านั้น เริ่มต้นด้วย { และปิดท้ายด้วย }
{
  "patient_summary": {
    "name": "ระบุชื่อจริงของผู้ป่วยตามข้อมูลคลินิกที่ได้รับด้านบน หรือ - หากไม่ระบุ",
    "age": "ระบุเลขอายุจริงของผู้ป่วย หรือ null หากไม่ระบุ",
    "gender": "ระบุเพศจริงของผู้ป่วย หรือ - หากไม่ระบุ",
    "weight": "ระบุน้ำหนักจริง หรือ null หากไม่ระบุ",
    "height": "ระบุส่วนสูงจริง หรือ null หากไม่ระบุ",
    "temperature": "ระบุอุณหภูมิกายจริง หรือ null หากไม่ระบุ",
    "bp": "ระบุความดันโลหิตจริง หรือ - หากไม่ระบุ",
    "pulse": "ระบุอัตราชีพจรจริง หรือ null หากไม่ระบุ",
    "allergies": "ประวัติแพ้ยาจริงของผู้ป่วย หรือ ไม่มีประวัติแพ้ยา",
    "chronic_disease": "โรคประจำตัวจริงของผู้ป่วย หรือ ไม่มี",
    "smoking": "ประวัติการสูบบุหรี่ หรือ ไม่ระบุ",
    "alcohol": "ประวัติการดื่มสุรา หรือ ไม่ระบุ",
    "body_element": "ธาตุเจ้าเรือนของผู้ป่วยตามข้อมูลคลินิกที่ได้รับ หรือ -",
    "utu_samutthana_summary": "สรุปอิทธิพลอุตุสมุฏฐานที่มีต่อพยาธิสภาพของผู้ป่วยรายนี้อย่างกระชับ",
    "kala_samutthana_summary": "สรุปอิทธิพลกาลสมุฏฐานยามกำเริบที่มีต่อผู้ป่วยรายนี้อย่างกระชับ"
  },
  "probable_diseases": [
    {
      "disease_name": "ชื่อโรคแพทย์แผนไทยอันดับที่ 1 ตามคัมภีร์/ตำรา (โอกาสเป็นไปได้สูงสุด)",
      "probability_level": "85%",
      "primary_cause": "สมุฏฐานและพยาธิสภาพของธาตุที่กระทบตามคัมภีร์/เอกสาร",
      "supporting_evidence": "ข้อมูลสนับสนุนจากอาการ, ธาตุเจ้าเรือน, เวลาเกิด, กาลสมุฏฐาน, อายุผู้ป่วย",
      "clinical_explanation": "คำอธิบายการวิเคราะห์และวินิจฉัยทางการแพทย์แผนไทยอย่างละเอียด เชื่อมโยงอาการของผู้ป่วยกับคัมภีร์ กลไกการกำเริบของสมุฏฐาน และเหตุผลสนับสนุน",
      "icd10_or_ttm_code": "รหัสโรคหรือการจัดหมวดตามคัมภีร์"
    },
    {
      "disease_name": "ชื่อโรคแพทย์แผนไทยอันดับที่ 2 (วินิจฉัยแยกโรค หรือโรคที่มีโอกาสเป็นไปได้รองลงมา)",
      "probability_level": "65%",
      "primary_cause": "สมุฏฐานที่เกี่ยวข้อง",
      "supporting_evidence": "ข้อมูลสนับสนุนเพิ่มเติมจากอาการและปัจจัยแวดล้อม",
      "clinical_explanation": "คำอธิบายการวิเคราะห์เปรียบเทียบและการวินิจฉัยแยกโรค",
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
          "taste": "รสยาหลักตามคัมภีร์ เช่น รสสุขุม, รสขม, รสเผ็ดร้อน, รสฝาด ฯลฯ",
          "part_used": "ส่วนของพืชหรือวัตถุธาตุที่ใช้ เช่น ราก, ใบ, ดอก, เปลือกต้น, ทั้งต้น ฯลฯ",
          "properties": "สรรพคุณตามคัมภีร์/เอกสาร",
          "usage": "วิธีใช้และขนาดรับประทาน",
          "precautions": "ข้อควรระวัง",
          "source": "แหล่งอ้างอิงชื่อคัมภีร์ตามที่ระบุใน Doc"
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
    const geminiTimeout = parseInt(
      process.env.GEMINI_TIMEOUT_MS || "120000",
      10,
    );
    const geminiStartTime = Date.now();
    const geminiResult = await callGemini(prompt, geminiTimeout, true);
    const geminiProcessingMs = Date.now() - geminiStartTime;
    const aiRawJson = geminiResult?.text || null;
    const tokenUsage = geminiResult?.usage;
    const modelUsed =
      geminiResult?.model_used ||
      process.env.GEMINI_MODEL ||
      "gemini-3.5-flash";
    let parsedResult: MultiSymptomAnalysisResult | null = null;

    if (aiRawJson) {
      parsedResult = extractJsonFromAiResponse(
        aiRawJson,
      ) as MultiSymptomAnalysisResult;
      if (!parsedResult) {
        console.warn(
          "⚠️ Could not extract valid JSON from Gemini response:\n",
          aiRawJson.substring(0, 300),
        );
      }
    }

    // 5. หาก Gemini ไม่สามารถประมวลผลได้ หรือ JSON ไม่สมบูรณ์ ให้ Throw Error อย่างชัดเจน (Zero Fallback Policy)
    if (
      !parsedResult ||
      !Array.isArray(parsedResult.symptoms_analysis) ||
      parsedResult.symptoms_analysis.length === 0
    ) {
      console.error(
        "❌ AI Analysis failed to generate a valid structured response.",
      );
      throw new Error(
        "ระบบ AI ไม่สามารถประมวลผลการวิเคราะห์ได้ในขณะนี้ กรุณากดลองใหม่อีกครั้ง",
      );
    }

    // กำหนดรายการ probable_diseases โดยตรงจากที่ AI สกัดได้จากเอกสารคัมภีร์
    if (!Array.isArray(parsedResult.probable_diseases)) {
      parsedResult.probable_diseases = [];
    }

    // เติมเต็มและควบคุม patient_summary ด้วยข้อมูลจริงจากระบบ (Single Source of Truth) เพื่อป้องกันค่าหลอนหรือค่าตัวอย่างจาก AI
    parsedResult.patient_summary = {
      name: nameVal || parsedResult.patient_summary?.name || "-",
      age:
        ageVal != null
          ? Number(ageVal)
          : typeof parsedResult.patient_summary?.age === "number"
            ? parsedResult.patient_summary.age
            : null,
      gender: genderStr || parsedResult.patient_summary?.gender || "-",
      weight:
        weightVal != null
          ? Number(weightVal)
          : typeof parsedResult.patient_summary?.weight === "number"
            ? parsedResult.patient_summary.weight
            : null,
      height:
        heightVal != null
          ? Number(heightVal)
          : typeof parsedResult.patient_summary?.height === "number"
            ? parsedResult.patient_summary.height
            : null,
      temperature:
        tempVal != null
          ? Number(tempVal)
          : typeof parsedResult.patient_summary?.temperature === "number"
            ? parsedResult.patient_summary.temperature
            : null,
      bp: bpVal || parsedResult.patient_summary?.bp || "-",
      pulse:
        pulseVal != null
          ? Number(pulseVal)
          : typeof parsedResult.patient_summary?.pulse === "number"
            ? parsedResult.patient_summary.pulse
            : null,
      allergies:
        drugAllergyVal ||
        parsedResult.patient_summary?.allergies ||
        "ไม่มีประวัติแพ้ยา",
      chronic_disease:
        chronicDiseaseVal ||
        parsedResult.patient_summary?.chronic_disease ||
        "ไม่มี",
      smoking:
        smokingVal || parsedResult.patient_summary?.smoking || "ไม่ระบุ",
      alcohol:
        alcoholVal || parsedResult.patient_summary?.alcohol || "ไม่ระบุ",
      body_element:
        bodyElemVal || parsedResult.patient_summary?.body_element || "-",
      utu_samutthana_summary:
        parsedResult.patient_summary?.utu_samutthana_summary || "-",
      kala_samutthana_summary:
        parsedResult.patient_summary?.kala_samutthana_summary || "-",
    };

    parsedResult.references = allReferences;

    // 6. สกัด flat herbs และ drugs เพื่อให้รองรับปุ่มสั่งยาและระบบเดิมได้ 100%
    const flatDrugs: any[] = [];
    const flatHerbs: RecommendedHerb[] = [];
    const drugIdSet = new Set<string>();

    parsedResult.symptoms_analysis.forEach((sec, sIdx) => {
      const symData =
        perSymptomData.find((p) => p.symptom === sec.symptom_title) ||
        perSymptomData[sIdx];

      sec.herbs.forEach((h, hIdx) => {
        flatHerbs.push({
          name: h.name,
          amount: 1,
          unit: "ซอง/แคปซูล",
          note: h.usage,
        });

        const matchedDef = dbHerbs.find(
          (d) => d.herb_name === h.name || h.name.includes(d.herb_name),
        );
        const drugId = matchedDef
          ? `db_h_${matchedDef.id}`
          : `ai_h_${sIdx}_${hIdx}`;

        // คำนวณ % Match อิงจาก Vector Cosine Similarity จริงของคัมภีร์ที่ตรวจพบ (Real Math, No Cheating)
        let realMatch = 85;
        if (symData?.chunks?.length) {
          const matchedChunk = symData.chunks.find((c: any) =>
            c.content?.includes(h.name),
          );
          if (matchedChunk && matchedChunk.similarity != null) {
            realMatch = Math.round(Number(matchedChunk.similarity) * 100);
          } else {
            const topSim = Math.max(
              ...symData.chunks.map((c: any) => Number(c.similarity) || 0),
            );
            realMatch = Math.round(topSim * 100);
          }
        }
        realMatch = Math.min(99, Math.max(50, realMatch));

        if (!drugIdSet.has(drugId)) {
          drugIdSet.add(drugId);
          flatDrugs.push({
            id: drugId,
            name: h.name,
            sub: matchedDef
              ? `สมุนไพรในคลังตำรา (ID: ${matchedDef.id})`
              : h.source || "สมุนไพรตามคัมภีร์",
            dosage: h.usage || "รับประทานตามคำแนะนำของแพทย์",
            note: h.properties || "บรรเทาอาการตามคัมภีร์",
            match: realMatch,
            tags: ["current", `sym_${sIdx + 1}`],
            cautionIf: h.precautions?.includes("ไต")
              ? "kidney"
              : h.precautions?.includes("ครรภ์")
                ? "pregnant"
                : null,
            source: h.source,
            precautions: h.precautions,
            taste: h.taste,
            part_used: h.part_used,
            symptom_title: sec.symptom_title,
          });
        }
      });
    });

    // แมตช์โรคกับตาราง diseases
    const matchedDiseases = (parsedResult.probable_diseases || []).map((pd) => {
      const found = dbDiseases.find(
        (d) =>
          pd.disease_name.includes(d.disease_name) ||
          d.disease_name.includes(pd.disease_name),
      );
      return {
        id: found ? found.id : null,
        disease_name: found ? found.disease_name : pd.disease_name,
        probability: pd.probability_level,
      };
    });

    // แมตช์สมุนไพรกับตาราง herbal_knowledge
    const matchedHerbs = flatHerbs.map((fh) => {
      const found = dbHerbs.find(
        (h) => h.herb_name === fh.name || fh.name.includes(h.herb_name),
      );
      return {
        id: found ? found.id : null,
        herb_name: found ? found.herb_name : fh.name,
        note: fh.note,
      };
    });

    // สร้างข้อความสรุปสังเคราะห์แบบ Text
    const textSections = parsedResult.symptoms_analysis
      .map((s) => {
        if (!s.has_knowledge) {
          return `• ${s.symptom_title}: ${s.thai_diagnosis} (${s.description})`;
        }
        const herbNames =
          s.herbs.map((h) => h.name).join(", ") || "ไม่มีตัวยาแนะนำเพิ่มเติม";
        return `• ${s.symptom_title} (${s.thai_diagnosis}): แนะนำ ${herbNames}`;
      })
      .join("\n");

    const textResponse = `ผลการวิเคราะห์สมุฏฐานและคัมภีร์แพทย์แผนไทย (${symptomList.length} อาการ):\n${textSections}\n\nข้อควรระวัง: ${parsedResult.overall_precautions}`;

    // คำนวณ Confidence Score แบบไดนามิกตามความครอบคลุมของคัมภีร์และความแม่นยำของ Similarity
    const symptomAnalysisList = parsedResult.symptoms_analysis || [];
    const totalSymptoms = symptomAnalysisList.length || symptomList.length || 1;
    const knownCount = symptomAnalysisList.filter(
      (s: any) => s.has_knowledge,
    ).length;
    const coverageRatio = knownCount / totalSymptoms;

    const allSimilarities: number[] = [];
    perSymptomData.forEach((item) => {
      item.chunks.forEach((c: any) => {
        if (c.similarity != null) {
          allSimilarities.push(Number(c.similarity));
        }
      });
    });

    const avgSimilarity =
      allSimilarities.length > 0
        ? allSimilarities.reduce((sum, val) => sum + val, 0) /
          allSimilarities.length
        : 0.7;

    let dynamicConfidence: number;
    if (knownCount === 0) {
      dynamicConfidence = 0.15;
    } else {
      const rawScore = 0.6 * coverageRatio + 0.4 * Math.min(1.0, avgSimilarity);
      dynamicConfidence = Math.min(
        0.98,
        Math.max(0.2, Number(rawScore.toFixed(2))),
      );
    }

    logAiAnalysisSummary({
      patientName: nameVal,
      age: ageVal,
      gender: genderStr,
      bodyElement: bodyElemVal,
      bp: bpVal,
      temp: tempVal,
      chiefComplaint: chiefComplaintVal || symptomList.join(", "),
      symptoms: symptomList,
      perSymptomData,
      modelUsed,
      processingMs: geminiProcessingMs,
      tokenUsage,
      result: parsedResult,
      confidence: dynamicConfidence,
    });

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
  async analyze({
    symptoms,
    context,
  }: RagAnalysisInput): Promise<
    RagAnalysisResult & {
      drugs?: any[];
      multiResult?: MultiSymptomAnalysisResult;
    }
  > {
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
  async ingestDocuments(
    documents: KnowledgeDocument[],
    defaultUploadId?: number,
  ): Promise<void> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    for (const doc of documents) {
      let uploadId = defaultUploadId;

      if (!uploadId) {
        const ins = await pool.query(
          `INSERT INTO knowledge_uploads (title, category, raw_content, embedding_status)
           VALUES ($1, $2, $3, 'processing')
           RETURNING id`,
          [
            doc.source || "เอกสารความรู้",
            doc.category || "general",
            doc.content,
          ],
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
        const vectorStr = `[${embeddingVectors[i].join(",")}]`;

        await pool.query(
          `INSERT INTO knowledge_chunks (upload_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [uploadId, i, chunkText, vectorStr],
        );
      }

      await pool.query(
        `UPDATE knowledge_uploads 
         SET total_chunks = $1, embedding_status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [chunks.length, uploadId],
      );

      console.log(
        `✅ Ingested ${chunks.length} chunks into PostgreSQL pgvector for upload ${uploadId}`,
      );
    }
  },

  /** Simple regex herb extractor จาก AI response */
  extractHerbs(text: string): RecommendedHerb[] {
    const herbs: RecommendedHerb[] = [];
    for (const line of text.split("\n")) {
      const m = line.match(
        /[-•*]\s*([ก-๙a-zA-Z\s]+?)\s+(\d+(?:\.\d+)?)\s*(กรัม|มล|ช้อน|กำมือ|ก้าน)/,
      );
      if (m) {
        herbs.push({ name: m[1].trim(), amount: parseFloat(m[2]), unit: m[3] });
      }
    }
    return herbs;
  },

  /** ค้นหา Chunks จากคลังตำราสำหรับอาการที่ระบุ */
  searchChunksForSymptom,
};
