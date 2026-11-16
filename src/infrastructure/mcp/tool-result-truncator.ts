/** Maximum entries kept of any array found in a tool result (e.g. the editions of a work). */
export const MAX_ARRAY_ITEMS = 3;
/** Maximum characters kept of any single string found in a tool result. */
export const MAX_STRING_LENGTH = 500;
/** Maximum nesting depth kept of a tool result. */
export const MAX_DEPTH = 8;

const TRUNCATION_SUFFIX = '\n[truncated]';
const ELLIPSIS = '…';
const DEPTH_PLACEHOLDER = '[truncated]';
/** Overhead of the `{"truncated":true,"preview":""}` envelope, with some margin. */
const PREVIEW_ENVELOPE_LENGTH = 40;

interface TruncationLimits {
  readonly maxItems: number;
  readonly maxString: number;
  readonly maxDepth: number;
}

/** Tried in order: the second one is stricter and only used when the first is still too big. */
const LIMIT_PROFILES: readonly TruncationLimits[] = [
  { maxItems: MAX_ARRAY_ITEMS, maxString: MAX_STRING_LENGTH, maxDepth: MAX_DEPTH },
  { maxItems: 1, maxString: 200, maxDepth: 6 },
];

/** Tracks whether the reduction actually removed something. */
interface ReductionState {
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reduceValue(
  value: unknown,
  limits: TruncationLimits,
  depth: number,
  state: ReductionState,
): unknown {
  if (typeof value === 'string') {
    if (value.length <= limits.maxString) {
      return value;
    }
    state.changed = true;
    return `${value.slice(0, limits.maxString)}${ELLIPSIS}`;
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (depth >= limits.maxDepth) {
    state.changed = true;
    return DEPTH_PLACEHOLDER;
  }
  if (Array.isArray(value)) {
    return reduceArray(value, limits, depth, state);
  }
  return reduceRecord(value as Record<string, unknown>, limits, depth, state);
}

function reduceArray(
  items: readonly unknown[],
  limits: TruncationLimits,
  depth: number,
  state: ReductionState,
): unknown[] {
  if (items.length > limits.maxItems) {
    state.changed = true;
  }
  return items
    .slice(0, limits.maxItems)
    .map((item: unknown) => reduceValue(item, limits, depth + 1, state));
}

/**
 * Reduces an object property by property. An oversized array keeps its first entries and tells
 * the model how many were dropped through a sibling `<key>Omitted` counter.
 * `Object.fromEntries` defines own properties, so a hostile `__proto__` key stays inert.
 */
function reduceRecord(
  record: Record<string, unknown>,
  limits: TruncationLimits,
  depth: number,
  state: ReductionState,
): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(record)) {
    entries.push([key, reduceValue(value, limits, depth + 1, state)]);
    if (Array.isArray(value) && value.length > limits.maxItems) {
      entries.push([`${key}Omitted`, value.length - limits.maxItems]);
    }
  }
  return Object.fromEntries(entries);
}

/** A top-level array has no parent object to carry the counter, so it is wrapped. */
function reduceDocument(
  parsed: unknown[] | Record<string, unknown>,
  limits: TruncationLimits,
  state: ReductionState,
): unknown {
  if (!Array.isArray(parsed)) {
    return reduceValue(parsed, limits, 0, state);
  }
  const kept = reduceValue(parsed, limits, 0, state);
  return parsed.length > limits.maxItems
    ? { items: kept, itemsOmitted: parsed.length - limits.maxItems }
    : kept;
}

function sliceText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}${TRUNCATION_SUFFIX}` : text;
}

/** Last resort for a JSON payload that is still too big: a valid JSON envelope with a preview. */
function previewEnvelope(text: string, maxLength: number): string {
  let budget = Math.max(0, maxLength - PREVIEW_ENVELOPE_LENGTH);
  for (;;) {
    const candidate = JSON.stringify({ truncated: true, preview: text.slice(0, budget) });
    if (candidate.length <= maxLength || budget === 0) {
      return candidate;
    }
    // JSON escaping may expand the preview: shrink by at least the excess.
    budget = Math.max(0, budget - Math.max(1, candidate.length - maxLength));
  }
}

function tryParseJson(text: string): unknown[] | Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) || isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Deterministically shrinks the text returned by an external MCP tool before it is handed to
 * the LLM, so a work with hundreds of editions (e.g. Open Library "The Hobbit") can neither
 * saturate the context window nor corrupt the parsing.
 *
 * - JSON payload: arrays are cut to their first entries (with an `<key>Omitted` counter), long
 *   strings and deep nesting are cut, and the result is **always valid JSON** within `maxLength`.
 * - Any other text: cut to `maxLength` characters followed by a `[truncated]` marker.
 *
 * The same input always produces the same output. A payload that is already small is returned
 * untouched.
 */
export function truncateToolText(text: string, maxLength: number): string {
  const parsed = tryParseJson(text);
  if (parsed === undefined) {
    return sliceText(text, maxLength);
  }

  for (const limits of LIMIT_PROFILES) {
    const state: ReductionState = { changed: false };
    const reduced = reduceDocument(parsed, limits, state);
    if (!state.changed && text.length <= maxLength) {
      return text;
    }
    const serialized = JSON.stringify(reduced);
    if (serialized.length <= maxLength) {
      return serialized;
    }
  }
  return previewEnvelope(text, maxLength);
}
