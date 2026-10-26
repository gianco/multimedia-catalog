import { useState } from 'react';
import { describeError } from '../api/catalog-api.model';
import type { CatalogApi, Item } from '../api/catalog-api.model';
import { ITEM_KIND_INFO } from '../model/item-kinds.model';
import { ItemEditForm } from './item-edit-form';
import { Spinner } from './spinner';

interface ItemDetailProps {
  readonly api: CatalogApi;
  readonly item: Item;
  readonly onBack: () => void;
  /** Called after the item has been deleted: the dashboard goes back to the global grid. */
  readonly onDeleted: () => void;
  /** Called with the updated item, so that the rest of the UI can show the new values. */
  readonly onUpdated: (item: Item) => void;
  /** Asks the user to confirm. Defaults to the native dialog; tests replace it. */
  readonly confirm?: (message: string) => boolean;
}

type Mode = 'view' | 'edit';

/** Single card with every attribute of an item, where it can be edited or deleted. */
export function ItemDetail({
  api,
  item,
  onBack,
  onDeleted,
  onUpdated,
  confirm = (message) => window.confirm(message),
}: ItemDetailProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const info = ITEM_KIND_INFO[item.kind];

  const handleDelete = async (): Promise<void> => {
    if (deleting) {
      return;
    }
    if (!confirm(`Delete "${item.title}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setFailure(null);
    setNotice(null);
    try {
      await api.deleteItem(item.id);
      onDeleted();
    } catch (error) {
      setFailure(describeError(error));
      setDeleting(false);
    }
  };

  if (mode === 'edit') {
    return (
      <ItemEditForm
        api={api}
        item={item}
        onCancel={() => setMode('view')}
        onSaved={(updated) => {
          onUpdated(updated);
          setNotice(`“${updated.title}” was updated successfully.`);
          setMode('view');
        }}
      />
    );
  }

  const rows: ReadonlyArray<readonly [string, string]> = [
    ['Type', info.label],
    [info.creatorLabel, item.author ?? 'Unknown'],
    ['Publication year', item.publicationYear === null ? 'Unknown' : String(item.publicationYear)],
    ['Classification', item.aiClassification ?? 'Not classified'],
    [info.identifierLabel, item.identifier],
    ['AI enrichment', item.enrichmentCompleted ? 'Completed' : 'Pending'],
  ];

  return (
    <article className="detail" aria-labelledby="item-detail-title">
      <button type="button" className="button button--link" onClick={onBack} disabled={deleting}>
        ← Back to the list
      </button>

      {notice !== null && (
        <p className="alert alert--success" role="status">
          {notice}
        </p>
      )}
      {failure !== null && (
        <p className="alert alert--error" role="alert">
          {failure}
        </p>
      )}

      <h2 id="item-detail-title">{item.title}</h2>
      <dl className="detail__list">
        {rows.map(([label, value]) => (
          <div key={label} className="detail__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setNotice(null);
            setFailure(null);
            setMode('edit');
          }}
          disabled={deleting}
        >
          Edit
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          Delete
        </button>
      </div>

      {deleting && <Spinner label="Deleting the item…" />}
    </article>
  );
}
