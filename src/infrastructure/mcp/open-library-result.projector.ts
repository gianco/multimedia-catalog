/** Maximum records kept of an Open Library answer (the best matches come first). */
export const MAX_RECORDS = 3;
/** Maximum entries kept of a list field (authors, publishers, ISBNs). */
const MAX_LIST_ITEMS = 5;
/** Maximum characters kept of any text field. */
const MAX_TEXT_LENGTH = 200;
/** Keys under which Open Library (or a wrapper of it) may expose the title of a record. */
const TITLE_KEYS = ['title', 'title_suggest', 'full_title', 'work_title', 'name'] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(text: string): JsonRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function clip(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.length > MAX_TEXT_LENGTH ? `${trimmed.slice(0, MAX_TEXT_LENGTH)}…` : trimmed;
}

/** Text of a string, a number or an `{ name }` object (authors may come in that shape). */
function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return clip(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return isRecord(value) ? textOf(value['name']) : undefined;
}

/** Accepts a single value or a list and returns at most `MAX_LIST_ITEMS` non-empty texts. */
function textList(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  const texts: string[] = [];
  for (const item of items) {
    const text = textOf(item);
    if (text !== undefined) {
      texts.push(text);
    }
    if (texts.length >= MAX_LIST_ITEMS) {
      break;
    }
  }
  return texts;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function pickTitle(record: JsonRecord): string | undefined {
  for (const key of TITLE_KEYS) {
    const value = record[key];
    const title = typeof value === 'string' ? clip(value) : undefined;
    if (title !== undefined) {
      return title;
    }
  }
  return undefined;
}

function firstNonEmpty(...lists: string[][]): string[] {
  return lists.find((list) => list.length > 0) ?? [];
}

/**
 * Keeps only the essential bibliographic fields of one record (an edition or a search hit).
 * A record without any usable title is dropped (`undefined`): the model must never receive an
 * entry it cannot name.
 */
function projectRecord(record: JsonRecord): JsonRecord | undefined {
  const title = pickTitle(record);
  if (title === undefined) {
    return undefined;
  }
  const best = isRecord(record['best_edition']) ? record['best_edition'] : {};
  const projected: JsonRecord = { title };

  const optionalFields: Array<[string, unknown]> = [
    ['authors', firstNonEmpty(textList(record['authors']), textList(record['author_name']))],
    ['publish_date', textOf(record['publish_date'])],
    ['first_publish_year', positiveInteger(record['first_publish_year'])],
    ['publishers', firstNonEmpty(textList(record['publishers']), textList(record['publisher']))],
    ['number_of_pages', positiveInteger(record['number_of_pages'])],
    ['isbn_10', firstNonEmpty(textList(record['isbn_10']), textList(best['isbn_10']))],
    ['isbn_13', firstNonEmpty(textList(record['isbn_13']), textList(best['isbn_13']))],
    ['edition_count', positiveInteger(record['edition_count'])],
    ['open_library_work_key', textOf(record['open_library_work_key'])],
  ];
  for (const [key, value] of optionalFields) {
    const isEmptyList = Array.isArray(value) && value.length === 0;
    if (value !== undefined && !isEmptyList) {
      projected[key] = value;
    }
  }
  return projected;
}

function projectSearch(parsed: JsonRecord, list: readonly unknown[]): JsonRecord {
  const kept: JsonRecord[] = [];
  for (const item of list) {
    if (kept.length >= MAX_RECORDS) {
      break;
    }
    const projected = isRecord(item) ? projectRecord(item) : undefined;
    if (projected !== undefined) {
      kept.push(projected);
    }
  }
  const numFound = positiveInteger(parsed['num_found'] ?? parsed['numFound']);
  const omitted = list.length - kept.length;
  return {
    ...(numFound !== undefined && { num_found: numFound }),
    results: kept,
    ...(omitted > 0 && { resultsOmitted: omitted }),
  };
}

/**
 * Anticorruption projection of an Open Library MCP answer: instead of cutting raw characters
 * (which can corrupt the JSON or strip the `title`), it parses the answer and keeps the top
 * matching record(s) with their essential fields intact (`title`, `authors`, `publish_date`,
 * `isbn_10`, `isbn_13`, `number_of_pages`, `publishers`), dropping the bulky rest (OCLC/OLID
 * arrays, URLs, notes, ratings).
 *
 * Recognized shapes: a flat edition (`get_book_by_id`) and a `{ num_found, results }` search
 * (`search_books`, `get_book_by_title`; the native `docs` key is accepted too).
 *
 * @returns the compact JSON text, or `undefined` when the text is not a recognized Open Library
 * answer (plain "not found" messages, errors, other shapes): the caller then falls back to the
 * generic truncation.
 */
export function projectOpenLibraryResult(text: string): string | undefined {
  const parsed = parseRecord(text);
  if (parsed === undefined) {
    return undefined;
  }
  const results = parsed['results'];
  const docs = parsed['docs'];
  const list = Array.isArray(results) ? results : Array.isArray(docs) ? docs : undefined;
  if (list !== undefined) {
    return JSON.stringify(projectSearch(parsed, list));
  }
  const edition = projectRecord(parsed);
  return edition === undefined ? undefined : JSON.stringify(edition);
}
