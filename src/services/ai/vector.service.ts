import { GoogleGenAI } from '@google/genai';
import pgvector from 'pgvector/pg';
import { pool } from '../../config/database';

export interface ChunkItem {
  chunkIndex: number;
  content: string;
}

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

/**
 * Generate 768-dimensional embedding for a single text chunk using Google GenAI SDK
 */
async function generateEmbeddingWithRetry(
  text: string,
  retries = 3
): Promise<number[] | null> {
  if (!ai) {
    console.warn('⚠️ GoogleGenAI SDK not initialized: GEMINI_API_KEY is missing.');
    return null;
  }
  if (!text || !text.trim()) return null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: { outputDimensionality: 768 },
      });

      if (response?.embeddings?.[0]?.values) {
        return response.embeddings[0].values;
      }
      if ((response as any)?.embedding?.values) {
        return (response as any).embedding.values;
      }
      return null;
    } catch (err: any) {
      const isTransient =
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('503') ||
        err?.message?.includes('UNAVAILABLE') ||
        err?.message?.includes('overloaded');

      if (isTransient && attempt < retries) {
        const waitMs = attempt * 1500;
        console.warn(`⏳ Gemini rate limit reached. Retrying in ${waitMs / 1000}s...`);
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }

      console.error(`⚠️ Embedding error on attempt ${attempt}:`, err?.message);
      if (attempt === retries) return null;
    }
  }
  return null;
}

/**
 * Split text into overlapping chunks with natural boundary detection
 */
export function chunkText(
  text: string,
  options: { chunkSize?: number; overlap?: number } = {}
): ChunkItem[] {
  const { chunkSize = 1000, overlap = 150 } = options;
  if (!text || typeof text !== 'string') return [];

  const cleanedText = text.replace(/\r\n/g, '\n').trim();
  if (cleanedText.length <= chunkSize) {
    return [{ chunkIndex: 0, content: cleanedText }];
  }

  const chunks: ChunkItem[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < cleanedText.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex < cleanedText.length) {
      // Look for natural breaking points
      const lastBreak = cleanedText.lastIndexOf('\n', endIndex);
      const lastPeriod = cleanedText.lastIndexOf('. ', endIndex);
      const lastSpace = cleanedText.lastIndexOf(' ', endIndex);

      if (lastBreak > startIndex + chunkSize * 0.5) {
        endIndex = lastBreak;
      } else if (lastPeriod > startIndex + chunkSize * 0.5) {
        endIndex = lastPeriod + 1;
      } else if (lastSpace > startIndex + chunkSize * 0.5) {
        endIndex = lastSpace;
      }
    } else {
      endIndex = cleanedText.length;
    }

    const chunkContent = cleanedText.substring(startIndex, endIndex).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        chunkIndex,
        content: chunkContent,
      });
      chunkIndex++;
    }

    if (endIndex >= cleanedText.length) break;

    startIndex = endIndex - overlap;
    if (startIndex < 0) startIndex = 0;
  }

  return chunks;
}

/**
 * Asynchronously process document chunks, generate vectors, and store them in PostgreSQL pgvector
 */
export async function processDocumentChunks(
  uploadId: number,
  rawText: string,
  _metadata: { fileName?: string; fileType?: string; fileSize?: number } = {}
): Promise<void> {
  try {
    // 1. Update status to 'processing'
    await pool.query(
      `UPDATE knowledge_uploads 
       SET embedding_status = 'processing', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [uploadId]
    );

    // 2. Clear any existing chunks for this uploadId (in case of retry)
    await pool.query('DELETE FROM knowledge_chunks WHERE upload_id = $1', [uploadId]);

    // 3. Split raw text into chunks
    const chunks = chunkText(rawText);
    if (!chunks.length) {
      throw new Error('ไม่สามารถตัดแบ่งข้อความในเอกสารได้ (เนื้อหาว่างเปล่า)');
    }

    console.log(`📄 Splitting upload ID ${uploadId} into ${chunks.length} chunks...`);

    // 4. Generate embeddings and save sequentially to respect API rate limits
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let vectorSql: string | null = null;

      try {
        const vector = await generateEmbeddingWithRetry(chunk.content);
        if (vector) {
          vectorSql = pgvector.toSql(vector);
        }
      } catch (embErr: any) {
        console.warn(`⚠️ Could not generate embedding for chunk ${i}:`, embErr.message);
      }

      await pool.query(
        `INSERT INTO knowledge_chunks (upload_id, chunk_index, content, token_count, embedding, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [uploadId, chunk.chunkIndex, chunk.content, chunk.content.length, vectorSql]
      );

      // Add a small delay between embedding calls to prevent 429 rate limit
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }

    // 5. Mark as 'completed'
    await pool.query(
      `UPDATE knowledge_uploads 
       SET total_chunks = $1, embedding_status = 'completed', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [chunks.length, uploadId]
    );

    console.log(`✅ Upload ID ${uploadId} successfully vectorized (${chunks.length} chunks stored).`);
  } catch (err: any) {
    console.error(`❌ Failed to process chunks for upload ID ${uploadId}:`, err.message);
    await pool.query(
      `UPDATE knowledge_uploads 
       SET embedding_status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [err.message || 'การประมวลผล Vector ล้มเหลว', uploadId]
    );
  }
}
