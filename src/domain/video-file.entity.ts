import { AbsolutePathVo } from './absolute-path.vo.js';
import { CatalogItem } from './catalog-item.abstract.js';
import type { CatalogItemKind, ItemIdentifier } from './catalog-item.abstract.js';
import { DomainError } from './domain.error.js';
import type { MetadataVo } from './metadata.vo.js';

/** Local video file identified by its absolute path. */
export class VideoFile extends CatalogItem {
  readonly kind: CatalogItemKind = 'video-file';
  readonly absolutePath: AbsolutePathVo;

  constructor(metadata: MetadataVo, absolutePath: AbsolutePathVo, id?: string) {
    super(metadata, id);

    if (!(absolutePath instanceof AbsolutePathVo)) {
      throw new DomainError('VideoFile: the path must be an instance of AbsolutePathVo.');
    }
    this.absolutePath = absolutePath;
    this.assertInvariants();
  }

  protected override assertInvariants(): void {
    if (this.absolutePath.coincidesWithTitle(this.metadata.title)) {
      throw new DomainError('VideoFile: the absolute path must not coincide with the title.');
    }
  }

  get fileName(): string {
    return this.absolutePath.fileName;
  }

  get extension(): string {
    return this.absolutePath.extension;
  }

  protected get identifier(): ItemIdentifier {
    return { type: 'absolute-path', value: this.absolutePath.value };
  }
}
