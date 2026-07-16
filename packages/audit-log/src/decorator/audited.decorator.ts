import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'audit:action';

export interface AuditedOptions {
  action: string;
  resourceType?: string;
  /** Name of the route param holding the resource ID (e.g. 'id' for `/agents/:id`) —
   * read automatically from the request if provided. */
  resourceIdParam?: string;
}

/**
 * Usage: `@Audited({ action: 'agent.updated', resourceType: 'agent', resourceIdParam: 'id' })`
 * Combine with AuditInterceptor (registered globally or per-controller) — the
 * interceptor does the actual recording after a successful response, using the
 * request's authenticated Principal.
 */
export const Audited = (options: AuditedOptions): MethodDecorator =>
  SetMetadata(AUDIT_METADATA_KEY, options);
