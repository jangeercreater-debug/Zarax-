/** Resolves a single `{{a.b.c}}` path against a nested object — returns undefined,
 * not a throw, for a missing path (a node referencing an output that doesn't exist
 * yet is a config mistake the workflow author should see as an empty value in a
 * later node, not a hard failure of the whole run). */
function resolvePath(source: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), source);
}

const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Replaces every `{{path}}` placeholder in a string with its resolved value
 * (stringified) from the context. Non-string inputs are returned unchanged — only
 * string fields in a node's `data` are ever template strings. */
export function resolveTemplate(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value;

  return value.replace(PLACEHOLDER_PATTERN, (_match, path: string) => {
    const resolved = resolvePath(context, path);
    if (resolved === undefined || resolved === null) return '';
    return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  });
}

/** Recursively resolves every string value in a plain object/array — used for a
 * node's whole `data` config in one call rather than resolving field-by-field. */
export function resolveTemplatesDeep(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') return resolveTemplate(value, context);
  if (Array.isArray(value)) return value.map((item) => resolveTemplatesDeep(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, resolveTemplatesDeep(val, context)]),
    );
  }
  return value;
}
