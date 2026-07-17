import { ValidationError } from '@zarax/shared-errors';
import { describe, expect, it } from 'vitest';

import { detectSourceType } from '../file-extractor';

describe('detectSourceType', () => {
  it('detects pdf from MIME type', () => {
    expect(detectSourceType('application/pdf', 'doc.pdf')).toBe('pdf');
  });

  it('detects docx from MIME type', () => {
    expect(
      detectSourceType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc.docx',
      ),
    ).toBe('docx');
  });

  it('falls back to file extension when the MIME type is generic', () => {
    expect(detectSourceType('application/octet-stream', 'notes.txt')).toBe('txt');
    expect(detectSourceType('application/octet-stream', 'report.pdf')).toBe('pdf');
  });

  it('throws ValidationError for an unsupported type', () => {
    expect(() => detectSourceType('image/png', 'photo.png')).toThrow(ValidationError);
  });
});
