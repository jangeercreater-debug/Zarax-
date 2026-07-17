import { ValidationError } from '@zarax/shared-errors';
import { describe, expect, it } from 'vitest';

import { validateIngestionUrl } from '../url-extractor';

describe('validateIngestionUrl', () => {
  it('allows a normal public https URL', () => {
    expect(() => validateIngestionUrl('https://example.com/docs')).not.toThrow();
  });

  it('rejects an invalid URL string', () => {
    expect(() => validateIngestionUrl('not a url')).toThrow(ValidationError);
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => validateIngestionUrl('file:///etc/passwd')).toThrow(ValidationError);
    expect(() => validateIngestionUrl('ftp://example.com')).toThrow(ValidationError);
  });

  it('blocks localhost', () => {
    expect(() => validateIngestionUrl('http://localhost:3000')).toThrow(ValidationError);
  });

  it('blocks loopback and private IP ranges', () => {
    expect(() => validateIngestionUrl('http://127.0.0.1')).toThrow(ValidationError);
    expect(() => validateIngestionUrl('http://10.0.0.5')).toThrow(ValidationError);
    expect(() => validateIngestionUrl('http://192.168.1.1')).toThrow(ValidationError);
    expect(() => validateIngestionUrl('http://172.16.0.1')).toThrow(ValidationError);
  });

  it('blocks the cloud metadata / link-local range', () => {
    expect(() => validateIngestionUrl('http://169.254.169.254/latest/meta-data')).toThrow(ValidationError);
  });
});
