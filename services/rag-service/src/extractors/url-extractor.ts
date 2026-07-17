import { Inject, Injectable } from '@nestjs/common';
import { ResilientClient } from '@zarax/resilience';
import { ValidationError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { convert as htmlToText } from 'html-to-text';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB — generous for an HTML page, guards against an accidental large-file URL

/** Blocks the obvious SSRF vectors (localhost, link-local/private IP ranges) — a
 * tenant-supplied URL is untrusted input reaching an outbound fetch from our own
 * infrastructure. Not exhaustive DNS-rebinding protection, but stops the common,
 * easy cases. Exported standalone (not a class method) so it's directly unit
 * testable without mocking fetch. */
export function validateIngestionUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('That is not a valid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Only http:// and https:// URLs are supported.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedPatterns = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // link-local, incl. cloud metadata endpoints
    /^\[?::1\]?$/,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(hostname))) {
    throw new ValidationError('This URL points to a private or internal address, which is not allowed.');
  }
}

@Injectable()
export class UrlExtractorService {
  private readonly resilientClient: ResilientClient;

  constructor(@Inject(ZARAX_LOGGER) logger: ZaraxLogger) {
    this.resilientClient = new ResilientClient({
      providerName: 'url-extractor',
      timeoutMs: 15_000,
      retry: { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 2000 },
      circuitBreaker: { failureThreshold: 10, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 20, refillPerSecond: 5 },
      logger,
    });
  }

  async extract(url: string): Promise<string> {
    validateIngestionUrl(url);

    return this.resilientClient.execute(async () => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ZaraXBot/1.0 (+knowledge base ingestion)' },
      });

      if (!response.ok) {
        throw new ValidationError(`Could not fetch this URL (HTTP ${response.status}).`);
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new ValidationError('This page is too large to ingest (over 10MB).');
      }

      const html = await response.text();
      const text = htmlToText(html, {
        wordwrap: false,
        selectors: [
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
        ],
      });

      if (!text.trim()) {
        throw new ValidationError('No readable text content found at this URL.');
      }
      return text;
    }, 'url-extractor.fetch');
  }
}
