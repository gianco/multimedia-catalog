import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { describeError } from '../api/catalog-api.model';
import type { CatalogApi, Item } from '../api/catalog-api.model';
import { ITEM_KIND_INFO } from '../model/item-kinds.model';
import { buildUpdateRequest, toEditFormValues } from './edit-form.model';
import type { EditFormErrors, EditFormValues } from './edit-form.model';
import { Spinner } from './spinner';

interface ItemEditFormProps {
  readonly api: CatalogApi;
  readonly item: Item;
  /** Called with the item as it was stored, after the backend accepted the correction. */
  readonly onSaved: (item: Item) => void;
  readonly onCancel: () => void;
}

/**
 * Inline form that replaces the static detail card to correct the title, the author/artist and
 * the publication year. The identifier, the type and the AI data cannot be edited.
 */
export function ItemEditForm({ api, item, onSaved, onCancel }: ItemEditFormProps) {
  const formId = useId();
  const [values, setValues] = useState<EditFormValues>(() => toEditFormValues(item));
  const [errors, setErrors] = useState<EditFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const info = ITEM_KIND_INFO[item.kind];

  const update = (patch: Partial<EditFormValues>): void => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
    setFailure(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const result = buildUpdateRequest(item, values);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    if (result.request === null) {
      // Nothing changed: there is nothing to send, just leave the edit mode.
      onCancel();
      return;
    }

    setSaving(true);
    setFailure(null);
    try {
      onSaved(await api.updateItem(item.id, result.request));
    } catch (error) {
      setFailure(describeError(error));
      setSaving(false);
    }
  };

  const fieldId = (name: string): string => `${formId}-${name}`;

  return (
    <form
      className="ingest-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label={`Edit ${item.title}`}
    >
      <h2>Edit item</h2>

      <div className="field">
        <label htmlFor={fieldId('title')}>Title</label>
        <input
          id={fieldId('title')}
          type="text"
          value={values.title}
          onChange={(event) => update({ title: event.target.value })}
          disabled={saving}
          aria-invalid={errors.title !== undefined}
          aria-describedby={errors.title ? fieldId('title-error') : undefined}
        />
        {errors.title && (
          <p id={fieldId('title-error')} className="field__error" role="alert">
            {errors.title}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={fieldId('author')}>{info.creatorLabel}</label>
        <input
          id={fieldId('author')}
          type="text"
          value={values.author}
          onChange={(event) => update({ author: event.target.value })}
          disabled={saving}
        />
      </div>

      <div className="field">
        <label htmlFor={fieldId('year')}>Publication year</label>
        <input
          id={fieldId('year')}
          type="text"
          inputMode="numeric"
          value={values.publicationYear}
          onChange={(event) => update({ publicationYear: event.target.value })}
          disabled={saving}
          aria-invalid={errors.publicationYear !== undefined}
          aria-describedby={errors.publicationYear ? fieldId('year-error') : undefined}
        />
        {errors.publicationYear && (
          <p id={fieldId('year-error')} className="field__error" role="alert">
            {errors.publicationYear}
          </p>
        )}
      </div>

      <p className="hint">
        The {info.identifierLabel.toLowerCase()}, the type and the AI data cannot be edited.
      </p>

      <div className="actions">
        <button type="submit" className="button" disabled={saving}>
          Save changes
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>

      {saving && <Spinner label="Saving the changes…" />}
      {failure !== null && (
        <p className="alert alert--error" role="alert">
          {failure}
        </p>
      )}
    </form>
  );
}
