import { Readable } from 'stream';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// pdf2json and csv-parser use CommonJS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFParser = require('pdf2json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const csvParser = require('csv-parser');

/**
 * Extract text from PDF buffer using pdf2json
 */
export const parsePDF = async (buffer: Buffer): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const pdfParser = new PDFParser(null, 1);

      pdfParser.on('pdfParser_dataError', (errData: any) => {
        const errMsg = typeof errData === 'object' ? JSON.stringify(errData) : String(errData);
        reject(new Error('PDF Parse Error: ' + errMsg));
      });

      pdfParser.on('pdfParser_dataReady', () => {
        try {
          const rawText = pdfParser.getRawTextContent();
          resolve(rawText || '');
        } catch (e: any) {
          reject(new Error('Failed to retrieve PDF content: ' + e.message));
        }
      });

      pdfParser.parseBuffer(buffer);
    } catch (err: any) {
      reject(new Error('PDF Initialization Error: ' + err.message));
    }
  });
};

/**
 * Extract text from Word document (.docx / .doc) buffer using mammoth
 */
export const parseWord = async (buffer: Buffer): Promise<string> => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error: any) {
    throw new Error('Failed to parse Word document: ' + error.message);
  }
};

/**
 * Extract text from Excel spreadsheet (.xlsx / .xls) buffer using xlsx
 * Converts each worksheet into structured CSV/text representation
 */
export const parseExcel = async (buffer: Buffer): Promise<string> => {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    let fullText = '';

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      if (worksheet) {
        const sheetCsv = xlsx.utils.sheet_to_csv(worksheet);
        if (sheetCsv.trim()) {
          fullText += `--- แผ่นงาน: ${sheetName} ---\n${sheetCsv}\n\n`;
        }
      }
    });

    return fullText.trim();
  } catch (error: any) {
    throw new Error('Failed to parse Excel document: ' + error.message);
  }
};

/**
 * Extract text from CSV buffer
 * Converts tabular rows into structured JSON-line or key-value representations
 */
export const parseCSV = (buffer: Buffer): Promise<string> => {
  return new Promise((resolve, reject) => {
    const results: string[] = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(csvParser())
      .on('data', (data: Record<string, any>) => {
        // Format each row with header keys and values
        const rowEntries = Object.entries(data)
          .filter(([_, val]) => val !== null && val !== undefined && String(val).trim() !== '')
          .map(([key, val]) => `[${key.trim()}]: ${String(val).trim()}`)
          .join(', ');

        if (rowEntries) {
          results.push(rowEntries);
        }
      })
      .on('end', () => resolve(results.join('\n')))
      .on('error', (error: any) => reject(new Error('Failed to parse CSV: ' + error.message)));
  });
};
