import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { runWithRequestContext } from '../context/request-context';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Register as the very first middleware in every service (`app.use(correlationIdMiddleware)`
 * before any other middleware/guard) so `correlationId` is available for the entire
 * request lifecycle, including inside auth guards and the global exception filter.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const correlationId = typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();

  res.setHeader(REQUEST_ID_HEADER, correlationId);

  runWithRequestContext({ correlationId }, () => next());
}
