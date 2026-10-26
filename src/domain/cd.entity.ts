import { BarcodeVo } from './barcode.vo.js';
import { CatalogItem } from './catalog-item.abstract.js';
import type { CatalogItemKind, ItemIdentifier } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import type { MetadataVo } from './metadata.vo.js';

/** Compact disc identified by a barcode. */
export class CD extends CatalogItem {
  readonly kind: CatalogItemKind = 'cd';
  readonly barcode: BarcodeVo;

  constructor(metadata: MetadataVo, barcode: BarcodeVo, id?: string) {
    super(metadata, id);

    if (!(barcode instanceof BarcodeVo)) {
      throw new DomainError('CD: the barcode must be an instance of BarcodeVo.');
    }
    this.barcode = barcode;
  }

  protected get identifier(): ItemIdentifier {
    return { type: 'barcode', value: this.barcode.toGtin13() };
  }
}
