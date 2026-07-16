import type { Principal } from '@zarax/shared-types';

declare global {
  namespace Express {
    interface Request {
      /** Set by CompositeAuthGuard once authentication succeeds. Undefined on @Public() routes. */
      principal?: Principal;
    }
  }
}

export {};
