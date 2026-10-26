import type { CreateItemRequest } from '../api/catalog-api.model';
import { isCodeIdentifiedKind } from '../model/item-kinds.model';
import type { ItemKind } from '../model/item-kinds.model';

/** How the item is entered: typed by hand or built by the AI from its identifier. */
export type IngestMode = 'manual' | 'ai';

export interface IngestFormValues {
  readonly kind: ItemKind;
  readonly mode: IngestMode;
  readonly identifier: string;
  readonly title: string;
  readonly author: string;
  readonly publicationYear: string;
}

export const EMPTY_FORM_VALUES: IngestFormValues = {
  kind: 'book',
  mode: 'manual',
  identifier: '',
  title: '',
  author: '',
  publicationYear: '',
};

/** Fields shown by the form for a given combination of kind and mode. */
export interface VisibleFields {
  readonly identifier: boolean;
  readonly title: boolean;
  readonly author: boolean;
  readonly publicationYear: boolean;
}

export function visibleFields(mode: IngestMode): VisibleFields {
  return mode === 'manual'
    ? { identifier: true, title: true, author: true, publicationYear: true }
    : { identifier: true, title: false, author: false, publicationYear: false };
}

export type FormValidation =
  | { readonly valid: true; readonly request: CreateItemRequest }
  | {
      readonly valid: false;
      readonly errors: Readonly<Partial<Record<keyof IngestFormValues, string>>>;
    };

const CURRENT_YEAR_LIMIT = new Date().getFullYear() + 1;

/** Checks only that required values are present: the real rules live in the backend domain. */
export function buildRequest(values: IngestFormValues): FormValidation {
  const errors: Partial<Record<keyof IngestFormValues, string>> = {};
  const identifier = values.identifier.trim();
  const title = values.title.trim();
  const year = values.publicationYear.trim();

  if (identifier === '') {
    errors.identifier = 'This field is required.';
  }
  if (values.mode === 'manual') {
    if (title === '') {
      errors.title = 'The title is required.';
    }
    if (
      year !== '' &&
      (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > CURRENT_YEAR_LIMIT)
    ) {
      errors.publicationYear = `Enter a year between 1 and ${CURRENT_YEAR_LIMIT}.`;
    }
  }
  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  if (values.mode === 'manual') {
    const author = values.author.trim();
    return {
      valid: true,
      request: {
        mode: 'manual',
        kind: values.kind,
        identifier,
        title,
        ...(author !== '' && { author }),
        ...(year !== '' && { publicationYear: Number(year) }),
      },
    };
  }

  return {
    valid: true,
    request: isCodeIdentifiedKind(values.kind)
      ? { mode: 'enrich', kind: values.kind, identifier }
      : { mode: 'scan', kind: values.kind, absolutePath: identifier },
  };
}
