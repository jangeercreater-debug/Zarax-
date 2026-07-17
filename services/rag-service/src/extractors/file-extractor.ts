import type { DocumentSourceType } from '@zarax/database';
import { ValidationError } from '@zarax/shared-errors';
import { convertToHtml } from 'mammoth';
import pdfParse from 'pdf-parse';

const MIME_TO_SOURCE_TYPE: Record<string, DocumentSourceType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

const EXTENSION_TO_SOURCE_TYPE: Record<string, DocumentSourceType> = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'txt',
};

/** Falls back to the file extension when the browser sends a generic/incorrect MIME
 * type (common for .txt uploads, which browsers often report as
 * application/octet-stream) — never silently guesses; throws a clear 400 if neither
 * signal identifies a supported type. */
export function detectSourceType(mimeType: string, filename: string): DocumentSourceType {
  if (MIME_TO_SOURCE_TYPE[mimeType]) return MIME_TO_SOURCE_TYPE[mimeType];

  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension && EXTENSION_TO_SOURCE_TYPE[extension]) return EXTENSION_TO_SOURCE_TYPE[extension];

  throw new ValidationError(
    `Unsupported file type. Upload a PDF, DOCX, or TXT file (got '${mimeType}').`,
  );
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text;
  } catch {
    throw new ValidationError('Could not read this PDF — it may be corrupted or password-protected.');
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    // mammoth's raw-text extraction drops all formatting, which is exactly what the
    // chunker wants — no HTML tags to strip back out afterward.
    const { value: html } = await convertToHtml({ buffer });
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    throw new ValidationError('Could not read this DOCX file — it may be corrupted.');
  }
}

function extractTxtText(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

export async function extractFileText(sourceType: DocumentSourceType, buffer: Buffer): Promise<string> {
  switch (sourceType) {
    case 'pdf':
      return extractPdfText(buffer);
    case 'docx':
      return extractDocxText(buffer);
    case 'txt':
      return extractTxtText(buffer);
    case 'url':
      throw new ValidationError('URL sources are extracted via extractUrlText, not extractFileText.');
    default: {
      const exhaustiveCheck: never = sourceType;
      throw new ValidationError(`Unsupported source type: ${String(exhaustiveCheck)}`);
    }
  }
}
