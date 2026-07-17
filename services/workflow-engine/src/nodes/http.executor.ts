import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { ValidationError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';
import { resolveTemplate, resolveTemplatesDeep } from './template-resolver';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function buildClient(nodeId: string, logger: ZaraxLogger): ResilientHttpClient {
  return new ResilientHttpClient({
    providerName: `workflow-node.${nodeId}`,
    timeoutMs: 15_000,
    retry: { maxAttempts: 2, baseDelayMs: 300, maxDelayMs: 2000 },
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    logger,
  });
}

/**
 * Shared by the 'webhook' and 'http_request' node types — same underlying operation
 * (resolve templated url/body → resilient HTTP call → capture the response), with
 * 'webhook' simply defaulting to POST. Uses ResilientHttpClient directly, NOT
 * tool-executor's send_webhook_notification tool — that tool's URL comes from an
 * Agent's config, not a workflow node's own configured URL; a genuinely different
 * concern, not something to force-reuse just to avoid writing this.
 */
@Injectable()
export class HttpNodeExecutor implements NodeExecutor {
  readonly nodeType = 'http_request'; // registered under both node type names — see nodes.module.ts

  constructor(@Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger) {}

  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const url = resolveTemplate(node.data.url, context.context);
    if (typeof url !== 'string' || !url) {
      throw new ValidationError(`${node.type} node '${node.id}' has no URL configured.`);
    }

    const method =
      (node.data.method as string | undefined)?.toUpperCase() ?? (node.type === 'webhook' ? 'POST' : 'GET');
    if (!ALLOWED_METHODS.includes(method as (typeof ALLOWED_METHODS)[number])) {
      throw new ValidationError(`Unsupported HTTP method '${method}' on node '${node.id}'.`);
    }

    const headers = (resolveTemplatesDeep(node.data.headers ?? {}, context.context) as Record<string, string>) ?? {};
    const body = node.data.body !== undefined ? resolveTemplatesDeep(node.data.body, context.context) : undefined;

    const client = buildClient(node.id, this.logger);
    const response = await client.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const responseText = await response.text();
    let parsedBody: unknown = responseText;
    try {
      parsedBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      // Not JSON — keep the raw text. A workflow author referencing {{node.body}}
      // still gets something usable either way.
    }

    return { output: { statusCode: response.status, ok: response.ok, body: parsedBody } };
  }
}
