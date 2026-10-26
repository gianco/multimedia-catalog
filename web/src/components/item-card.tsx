import { ITEM_KIND_INFO } from '../model/item-kinds.model';
import type { Item } from '../api/catalog-api.model';

interface ItemCardProps {
  readonly item: Item;
  readonly onSelect: (item: Item) => void;
}

/** Compact card used by the grid views. The whole card is a button that opens the detail. */
export function ItemCard({ item, onSelect }: ItemCardProps) {
  const info = ITEM_KIND_INFO[item.kind];

  return (
    <li className="card">
      <button
        type="button"
        className="card__button"
        onClick={() => onSelect(item)}
        aria-label={`Open details of ${item.title}`}
      >
        <span className={`badge badge--${item.kind}`}>{info.label}</span>
        <span className="card__title">{item.title}</span>
        <span className="card__meta">
          {item.author ?? 'Unknown'}
          {item.publicationYear !== null && ` · ${item.publicationYear}`}
        </span>
        {!item.enrichmentCompleted && <span className="card__flag">Not enriched</span>}
      </button>
    </li>
  );
}
