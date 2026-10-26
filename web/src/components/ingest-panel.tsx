import { useId, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { describeError } from '../api/catalog-api.model';
import type { CatalogApi, Item } from '../api/catalog-api.model';
import { ITEM_KINDS, ITEM_KIND_INFO, isItemKind } from '../model/item-kinds.model';
import { EMPTY_FORM_VALUES, buildRequest, visibleFields } from './ingest-form.model';
import type { IngestFormValues, IngestMode } from './ingest-form.model';
import { Spinner } from './spinner';

interface IngestPanelProps {
  readonly api: CatalogApi;
  /** Called with the new item once the backend has saved it. */
  readonly onCreated?: (item: Item) => void;
}

type FieldErrors = Readonly<Partial<Record<keyof IngestFormValues, string>>>;

/**
 * Form to add an item. Its fields adapt to the selected type and input mode:
 * manual entry shows every field, AI mode only asks for the ISBN, barcode or absolute path.
 */
export function IngestPanel({ api, onCreated }: IngestPanelProps) {
  const formId = useId();
  const [values, setValues] = useState<IngestFormValues>(EMPTY_FORM_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [createdTitle, setCreatedTitle] = useState<string | null>(null);

  const info = ITEM_KIND_INFO[values.kind];
  const fields = visibleFields(values.mode);
  const aiMode = values.mode === 'ai';

  const update = (patch: Partial<IngestFormValues>): void => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
    setFailure(null);
    setCreatedTitle(null);
  };

  const handleKindChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (isItemKind(event.target.value)) {
      // The identifier of one kind is meaningless for another: start from a clean value.
      update({ kind: event.target.value, identifier: '' });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const result = buildRequest(values);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setSubmitting(true);
    setFailure(null);
    setCreatedTitle(null);
    try {
      const item = await api.createItem(result.request);
      setValues({ ...EMPTY_FORM_VALUES, kind: values.kind, mode: values.mode });
      setErrors({});
      setCreatedTitle(item.title);
      onCreated?.(item);
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldId = (name: string): string => `${formId}-${name}`;
  const errorFor = (name: keyof IngestFormValues): string | undefined => errors[name];

  return (
    <section className="panel" aria-labelledby={fieldId('heading')}>
      <h2 id={fieldId('heading')}>Add an item</h2>

      <form className="ingest-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={fieldId('kind')}>Type</label>
          <select
            id={fieldId('kind')}
            value={values.kind}
            onChange={handleKindChange}
            disabled={submitting}
          >
            {ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ITEM_KIND_INFO[kind].label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="field" disabled={submitting}>
          <legend>Input mode</legend>
          {(['manual', 'ai'] as const satisfies readonly IngestMode[]).map((mode) => (
            <label key={mode} className="radio">
              <input
                type="radio"
                name={fieldId('mode')}
                value={mode}
                checked={values.mode === mode}
                onChange={() => update({ mode })}
              />
              {mode === 'manual' ? 'Manual entry' : info.aiModeLabel}
            </label>
          ))}
        </fieldset>

        {fields.identifier && (
          <div className="field">
            <label htmlFor={fieldId('identifier')}>{info.identifierLabel}</label>
            <input
              id={fieldId('identifier')}
              type="text"
              value={values.identifier}
              placeholder={info.identifierPlaceholder}
              onChange={(event) => update({ identifier: event.target.value })}
              disabled={submitting}
              aria-invalid={errorFor('identifier') !== undefined}
              aria-describedby={errorFor('identifier') ? fieldId('identifier-error') : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {errorFor('identifier') && (
              <p id={fieldId('identifier-error')} className="field__error" role="alert">
                {errorFor('identifier')}
              </p>
            )}
          </div>
        )}

        {fields.title && (
          <div className="field">
            <label htmlFor={fieldId('title')}>Title</label>
            <input
              id={fieldId('title')}
              type="text"
              value={values.title}
              onChange={(event) => update({ title: event.target.value })}
              disabled={submitting}
              aria-invalid={errorFor('title') !== undefined}
              aria-describedby={errorFor('title') ? fieldId('title-error') : undefined}
            />
            {errorFor('title') && (
              <p id={fieldId('title-error')} className="field__error" role="alert">
                {errorFor('title')}
              </p>
            )}
          </div>
        )}

        {fields.author && (
          <div className="field">
            <label htmlFor={fieldId('author')}>{info.creatorLabel}</label>
            <input
              id={fieldId('author')}
              type="text"
              value={values.author}
              onChange={(event) => update({ author: event.target.value })}
              disabled={submitting}
            />
          </div>
        )}

        {fields.publicationYear && (
          <div className="field">
            <label htmlFor={fieldId('year')}>Publication year</label>
            <input
              id={fieldId('year')}
              type="text"
              inputMode="numeric"
              value={values.publicationYear}
              onChange={(event) => update({ publicationYear: event.target.value })}
              disabled={submitting}
              aria-invalid={errorFor('publicationYear') !== undefined}
              aria-describedby={errorFor('publicationYear') ? fieldId('year-error') : undefined}
            />
            {errorFor('publicationYear') && (
              <p id={fieldId('year-error')} className="field__error" role="alert">
                {errorFor('publicationYear')}
              </p>
            )}
          </div>
        )}

        {aiMode && (
          <p className="hint">
            The AI will look up the title, {info.creatorLabel.toLowerCase()}, year and genre for
            you. This can take a few seconds.
          </p>
        )}

        <button type="submit" className="button" disabled={submitting}>
          {aiMode ? 'Enrich and add' : 'Add item'}
        </button>

        {submitting && (
          <Spinner label={aiMode ? 'Asking the AI to enrich the item…' : 'Saving the item…'} />
        )}

        {failure !== null && (
          <p className="alert alert--error" role="alert">
            {failure}
          </p>
        )}
        {createdTitle !== null && (
          <p className="alert alert--success" role="status">
            “{createdTitle}” was added to the catalog.
          </p>
        )}
      </form>
    </section>
  );
}
