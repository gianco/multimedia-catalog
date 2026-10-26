import { AbsolutePathVo } from '../../domain/absolute-path.vo.js';
import { DomainError } from '../../domain/domain.error.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { CommandHandler } from '../cqrs.interface.js';
import { createCatalogItem, isFileKind } from '../factories/catalog-item.factory.js';
import type { FileKind } from '../factories/catalog-item.factory.js';
import type { AiEnrichmentService } from '../services/ai-enrichment.service.js';
import { FileNameLocalMetadataParser } from '../services/local-metadata-parser.service.js';
import type { LocalMetadataParser } from '../services/local-metadata-parser.service.js';

/** Creates a video or audio item from a file that already exists on the local file system. */
export interface ScanAndCreateFileCommand {
  readonly kind: FileKind;
  /** POSIX absolute path of the file. */
  readonly absolutePath: string;
}

export class ScanAndCreateFileCommandHandler implements CommandHandler<
  ScanAndCreateFileCommand,
  string
> {
  /**
   * @param localMetadataParser defaults to the mocked file-name parser
   */
  constructor(
    private readonly repository: CatalogItemRepository,
    private readonly aiEnrichmentService: AiEnrichmentService,
    private readonly localMetadataParser: LocalMetadataParser = new FileNameLocalMetadataParser(),
  ) {}

  /**
   * @returns the id of the new item
   * @throws DomainError when the kind or the path is invalid (neither parser nor AI are called)
   * @throws AiEnrichmentError when the AI fails or answers with corrupted data (nothing is saved)
   */
  async execute(command: ScanAndCreateFileCommand): Promise<string> {
    if (!isFileKind(command.kind)) {
      throw new DomainError(`Kind "${String(command.kind)}" cannot be created from a file.`);
    }

    const absolutePath = new AbsolutePathVo(command.absolutePath);
    const localMetadata = await this.localMetadataParser.parse(absolutePath);

    const metadata = await this.aiEnrichmentService.enrich({
      kind: command.kind,
      identifier: absolutePath.value,
      hints: {
        title: localMetadata.title,
        ...(localMetadata.author !== undefined && { author: localMetadata.author }),
      },
    });

    const item = createCatalogItem(command.kind, absolutePath, metadata);
    await this.repository.save(item);
    return item.id;
  }
}
