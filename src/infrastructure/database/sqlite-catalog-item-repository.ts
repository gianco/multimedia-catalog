import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import { ItemNotFoundError } from '../../domain/item-not-found.error.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { AppConfig } from '../config/env.config.js';
import { CATALOG_ITEM_KINDS, DataMapper, isCatalogItemKind } from './data-mapper.js';
import { PersistenceError } from './persistence.error.js';

const kindsSqlList = CATALOG_ITEM_KINDS.map((kind) => `'${kind}'`).join(', ');

const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN (${kindsSqlList})),
    title TEXT NOT NULL,
    author TEXT,
    publication_year INTEGER,
    ai_classification TEXT,
    enrichment_completed INTEGER NOT NULL DEFAULT 0 CHECK (enrichment_completed IN (0, 1)),
    identifier TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_catalog_items_kind ON catalog_items (kind);
`;

/** Columns are aliased to the camelCase property names of `CatalogItemRow`. */
const SELECT_COLUMNS_SQL = `
  id,
  kind,
  title,
  author,
  publication_year AS publicationYear,
  ai_classification AS aiClassification,
  enrichment_completed AS enrichmentCompleted,
  identifier
`;

const UPSERT_SQL = `
  INSERT INTO catalog_items
    (id, kind, title, author, publication_year, ai_classification, enrichment_completed, identifier)
  VALUES
    (:id, :kind, :title, :author, :publicationYear, :aiClassification, :enrichmentCompleted, :identifier)
  ON CONFLICT (id) DO UPDATE SET
    kind = excluded.kind,
    title = excluded.title,
    author = excluded.author,
    publication_year = excluded.publication_year,
    ai_classification = excluded.ai_classification,
    enrichment_completed = excluded.enrichment_completed,
    identifier = excluded.identifier
`;

/**
 * Replaces every mutable column of an existing row. The kind and the identifier are written too, so
 * the row always mirrors the entity; the `WHERE` clause makes sure a missing row is never created.
 */
const UPDATE_SQL = `
  UPDATE catalog_items SET
    kind = :kind,
    title = :title,
    author = :author,
    publication_year = :publicationYear,
    ai_classification = :aiClassification,
    enrichment_completed = :enrichmentCompleted,
    identifier = :identifier
  WHERE id = :id
`;

const DELETE_SQL = 'DELETE FROM catalog_items WHERE id = :id';

/**
 * SQLite implementation of the catalog item repository, built on Node's native `node:sqlite`.
 *
 * `node:sqlite` is synchronous: the methods are exposed as promises only to honour the
 * repository contract, which lets other implementations be asynchronous.
 */
export class SqliteCatalogItemRepository implements CatalogItemRepository {
  private readonly upsertStatement: StatementSync;
  private readonly selectAllStatement: StatementSync;
  private readonly selectByKindStatement: StatementSync;
  private readonly selectByIdStatement: StatementSync;
  private readonly updateStatement: StatementSync;
  private readonly deleteStatement: StatementSync;

  /**
   * @param database an open database; the repository takes its ownership and closes it on `close()`
   * @param mapper converter between entities and rows
   */
  constructor(
    private readonly database: DatabaseSync,
    private readonly mapper: DataMapper = new DataMapper(),
  ) {
    this.database.exec(CREATE_SCHEMA_SQL);

    this.upsertStatement = this.database.prepare(UPSERT_SQL);
    this.selectAllStatement = this.database.prepare(
      `SELECT ${SELECT_COLUMNS_SQL} FROM catalog_items ORDER BY rowid`,
    );
    this.selectByKindStatement = this.database.prepare(
      `SELECT ${SELECT_COLUMNS_SQL} FROM catalog_items WHERE kind = :kind ORDER BY rowid`,
    );
    this.selectByIdStatement = this.database.prepare(
      `SELECT ${SELECT_COLUMNS_SQL} FROM catalog_items WHERE id = :id`,
    );
    this.updateStatement = this.database.prepare(UPDATE_SQL);
    this.deleteStatement = this.database.prepare(DELETE_SQL);
  }

  /**
   * Opens (creating it when missing) the SQLite database stored in a local file.
   * Pass `:memory:` to get a private in-memory database.
   */
  static open(filePath: string): SqliteCatalogItemRepository {
    return new SqliteCatalogItemRepository(new DatabaseSync(filePath));
  }

  /**
   * Opens the database file configured through `DATABASE_FILE`.
   * The path comes from the centralized configuration, never from a hardcoded string.
   */
  static fromConfig(config: Pick<AppConfig, 'databaseFile'>): SqliteCatalogItemRepository {
    return SqliteCatalogItemRepository.open(config.databaseFile);
  }

  async save(item: CatalogItem): Promise<void> {
    this.upsertStatement.run(this.mapper.toRow(item));
  }

  async findAll(): Promise<CatalogItem[]> {
    return this.selectAllStatement.all().map((row) => this.mapper.toDomain(row));
  }

  async findByType(type: string): Promise<CatalogItem[]> {
    if (!isCatalogItemKind(type)) {
      throw new PersistenceError(
        `Unknown catalog item type "${type}". Supported types: ${CATALOG_ITEM_KINDS.join(', ')}.`,
      );
    }
    return this.selectByKindStatement.all({ kind: type }).map((row) => this.mapper.toDomain(row));
  }

  async findById(id: string): Promise<CatalogItem | null> {
    const row = this.selectByIdStatement.get({ id });
    return row === undefined ? null : this.mapper.toDomain(row);
  }

  async update(item: CatalogItem): Promise<void> {
    const { changes } = this.updateStatement.run(this.mapper.toRow(item));
    if (changes === 0) {
      throw new ItemNotFoundError(item.id);
    }
  }

  async delete(id: string): Promise<void> {
    const { changes } = this.deleteStatement.run({ id });
    if (changes === 0) {
      throw new ItemNotFoundError(id);
    }
  }

  /** Closes the underlying database; the repository cannot be used afterwards. */
  close(): void {
    this.database.close();
  }
}
