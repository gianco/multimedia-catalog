import type { Item, UpdateItemRequest } from '../api/catalog-api.model';

/** What the user types in the edit form: every value is text, exactly as in the inputs. */
export interface EditFormValues {
  readonly title: string;
  readonly author: string;
  readonly publicationYear: string;
}

export type EditFormErrors = Readonly<Partial<Record<keyof EditFormValues, string>>>;

export type EditValidation =
  | { readonly valid: true; readonly request: UpdateItemRequest | null }
  | { readonly valid: false; readonly errors: EditFormErrors };

const MAX_YEAR = new Date().getFullYear() + 1;

/** The values to show when the form opens: the current ones of the item. */
export function toEditFormValues(item: Item): EditFormValues {
  return {
    title: item.title,
    author: item.author ?? '',
    publicationYear: item.publicationYear === null ? '' : String(item.publicationYear),
  };
}

/**
 * Checks the values and builds the body of the `PUT` request with only what changed.
 *
 * - An empty author or year becomes `null`, which clears the stored value.
 * - `request` is `null` when nothing changed, so the UI can skip a useless call.
 *
 * Only obvious mistakes are caught here: the real rules live in the backend domain.
 */
export function buildUpdateRequest(item: Item, values: EditFormValues): EditValidation {
  const title = values.title.trim();
  const author = values.author.trim();
  const year = values.publicationYear.trim();
  const errors: { title?: string; publicationYear?: string } = {};

  if (title === '') {
    errors.title = 'The title is required.';
  }
  if (year !== '' && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > MAX_YEAR)) {
    errors.publicationYear = `Enter a year between 1 and ${MAX_YEAR}.`;
  }
  if (errors.title !== undefined || errors.publicationYear !== undefined) {
    return { valid: false, errors };
  }

  const nextAuthor = author === '' ? null : author;
  const nextYear = year === '' ? null : Number(year);

  const request: {
    title?: string;
    author?: string | null;
    publicationYear?: number | null;
  } = {};
  if (title !== item.title) {
    request.title = title;
  }
  if (nextAuthor !== item.author) {
    request.author = nextAuthor;
  }
  if (nextYear !== item.publicationYear) {
    request.publicationYear = nextYear;
  }

  return { valid: true, request: Object.keys(request).length === 0 ? null : request };
}
