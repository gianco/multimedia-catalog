import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api/catalog-api.model';
import type { CatalogApi, Item } from '../api/catalog-api.model';
import { ITEM_KINDS, ITEM_KIND_INFO } from '../model/item-kinds.model';
import type { ItemKind } from '../model/item-kinds.model';
import { ItemCard } from './item-card';
import { ItemDetail } from './item-detail';
import { Spinner } from './spinner';

interface DashboardProps {
  readonly api: CatalogApi;
  /** Changing this value reloads the list (e.g. after a new item has been created). */
  readonly refreshKey?: number;
}

/** `all` is the global grid, a kind is the filtered tab. */
type Filter = 'all' | ItemKind;

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly items: readonly Item[] };

const TABS: ReadonlyArray<{ readonly filter: Filter; readonly label: string }> = [
  { filter: 'all', label: 'All' },
  ...ITEM_KINDS.map((kind) => ({ filter: kind, label: ITEM_KIND_INFO[kind].pluralLabel })),
];

/**
 * The three views of the catalog:
 * 1. global grid with every item (tab "All"),
 * 2. filter tabs, one per item type,
 * 3. single card with the detail of the item that was clicked.
 */
export function Dashboard({ api, refreshKey = 0 }: DashboardProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<Item | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  // Ignores the answer of a request that is no longer the latest one (fast tab switching).
  const latestRequest = useRef(0);

  useEffect(() => {
    const requestNumber = ++latestRequest.current;
    setState({ status: 'loading' });

    const load = filter === 'all' ? api.listItems() : api.listItemsByType(filter);
    load.then(
      (items) => {
        if (requestNumber === latestRequest.current) {
          setState({ status: 'ready', items });
        }
      },
      (error: unknown) => {
        if (requestNumber === latestRequest.current) {
          setState({ status: 'error', message: describeError(error) });
        }
      },
    );
  }, [api, filter, refreshKey, reloadCount]);

  const retry = useCallback(() => setReloadCount((count) => count + 1), []);

  /** After a deletion the user lands on the global grid, which is reloaded without the item. */
  const handleDeleted = (): void => {
    setSelected(null);
    setFilter('all');
    setReloadCount((count) => count + 1);
  };

  /** After a correction the detail shows the new values and the grid behind it is reloaded. */
  const handleUpdated = (updated: Item): void => {
    setSelected(updated);
    setReloadCount((count) => count + 1);
  };

  if (selected !== null) {
    return (
      <section className="panel">
        <ItemDetail
          api={api}
          item={selected}
          onBack={() => setSelected(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="dashboard-heading">
      <h2 id="dashboard-heading">Catalog</h2>

      <div role="tablist" aria-label="Filter by type" className="tabs">
        {TABS.map(({ filter: tabFilter, label }) => (
          <button
            key={tabFilter}
            type="button"
            role="tab"
            id={`tab-${tabFilter}`}
            aria-selected={filter === tabFilter}
            aria-controls="catalog-grid"
            className={filter === tabFilter ? 'tab tab--active' : 'tab'}
            onClick={() => setFilter(tabFilter)}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="catalog-grid" role="tabpanel" aria-labelledby={`tab-${filter}`}>
        {state.status === 'loading' && <Spinner label="Loading the catalog…" />}

        {state.status === 'error' && (
          <div className="alert alert--error" role="alert">
            <p>{state.message}</p>
            <button type="button" className="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <p className="empty">
            {filter === 'all'
              ? 'The catalog is empty. Add your first item with the form.'
              : `No ${ITEM_KIND_INFO[filter].pluralLabel.toLowerCase()} yet.`}
          </p>
        )}

        {state.status === 'ready' && state.items.length > 0 && (
          <ul className="grid">
            {state.items.map((item) => (
              <ItemCard key={item.id} item={item} onSelect={setSelected} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
