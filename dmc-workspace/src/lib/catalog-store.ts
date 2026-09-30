import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { categories, emptyFields, validateCatalogInput, type CatalogRecord, type CatalogInput, type Category } from './catalog-schema.ts';

export const projectRoot = () => path.resolve(process.cwd(), '..');
export const catalogRoot = () => path.join(projectRoot(), 'data', 'portal');
export const warehouseRoot = () => path.join(projectRoot(), 'warehouse');
export function legacyId(category: Category, row: Record<string, unknown>) {
  return 'cat-' + createHash('sha256').update(`${category}:${row.id ?? row.id_blu ?? row.nome_da_experiencia ?? `${row._source_sheet}:${row._source_row}`}`).digest('hex').slice(0, 32);
}
export class CatalogConflict extends Error {}
export class CatalogStore {
  db: DatabaseSync;
  constructor(root = catalogRoot()) {
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, 'catalog.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS catalog_records (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS catalog_history (id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(id,revision));`);
  }
  close() { this.db.close(); }
  list(): CatalogRecord[] { return this.db.prepare('SELECT snapshot FROM catalog_records ORDER BY id').all().map(r => JSON.parse(String(r.snapshot))); }
  history(id: string): CatalogRecord[] { return this.db.prepare('SELECT snapshot FROM catalog_history WHERE id=? ORDER BY revision DESC').all(id).map(r => JSON.parse(String(r.snapshot))); }
  private write(record: CatalogRecord) {
    const snapshot = JSON.stringify(record);
    this.db.prepare('INSERT INTO catalog_history VALUES (?,?,?)').run(record.id, record.revision, snapshot);
    this.db.prepare('INSERT OR REPLACE INTO catalog_records VALUES (?,?)').run(record.id, snapshot);
  }
  // Import once per stable ID; later ETL runs never overwrite portal edits.
  importWarehouse(root = warehouseRoot()) {
    const inputs = categories.flatMap(category => readFileSync(path.join(root, `${category}.jsonl`), 'utf8').split(/\r?\n/).filter(Boolean).map(line => ({ category, row: JSON.parse(line) })));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const { category, row } of inputs) {
        const id = row._catalog_id ?? legacyId(category, row);
        if (this.db.prepare('SELECT id FROM catalog_records WHERE id=?').get(id)) continue;
        const pick = (...keys: string[]) => String(keys.map(k => row[k]).find(v => v !== undefined && v !== null && v !== '') ?? '');
        const fields = { ...emptyFields(), name: pick('nome_da_atracao', 'estabelecimento', 'nome_da_experiencia'), location: pick('cidade', 'localizacao'),
          address: pick('morada', 'zona_bairro', 'zona_localidade'), description: pick('descricao_curada', 'descricao', 'proposta_de_curadoria_blu_nao_aprovada'),
          duration: pick('tempo_medio_de_visita', 'duracao', 'duracao_blu_estimativa'), price: pick('preco_da_atracao', 'preco', 'preco_nao_cotacao'),
          contacts: pick('contactos'), accessibility: pick('acessibilidade_nivel_de_confirmacao'), source: pick('site_fonte', 'fonte_indicada_na_base') || `${row._source_sheet}, linha ${row._source_row}`,
          effort: pick('esforco_fisico') || 'Por confirmar', kind: pick('categoria'), hours: pick('horario', 'horario_base_reconfirmar'),
          cuisine: pick('tipo_gastronomia_base'), dietary: pick('opcoes_alimentares_alergenios'), provider: pick('fornecedor'), modality: pick('modalidade') };
        this.write({ id, category, status: 'review', revision: 1, fields, raw: row, updatedAt: new Date().toISOString(), reason: 'Importação da base existente; requer revisão.' });
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  save(input: unknown): CatalogRecord {
    validateCatalogInput(input);
    const v: CatalogInput = input;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stored = v.id ? this.db.prepare('SELECT snapshot FROM catalog_records WHERE id=?').get(v.id) : undefined;
      const previous: CatalogRecord | undefined = stored && JSON.parse(String(stored.snapshot));
      if (v.id && (!previous || previous.revision !== v.baseRevision)) throw new CatalogConflict('Existe uma revisão mais recente. Reabra o registo antes de guardar.');
      if (previous && previous.category !== v.category) throw new Error('A categoria de um registo existente não pode ser alterada.');
      const record: CatalogRecord = { id: previous?.id ?? `cat-${randomUUID()}`, category: v.category, status: v.status,
        revision: (previous?.revision ?? 0) + 1, fields: Object.fromEntries(Object.entries(v.fields).filter(([k]) => k in emptyFields()).map(([k, val]) => [k, val.trim()])) as CatalogRecord['fields'],
        raw: previous?.raw ?? {}, updatedAt: new Date().toISOString(), reason: v.reason.trim() };
      this.write(record); this.db.exec('COMMIT'); return record;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  // Fail closed if an approved warehouse snapshot has since been edited/inactivated.
  isPublished(row: Record<string, unknown>) {
    if (row._catalog_status !== 'approved' || !row._catalog_id) return false;
    const saved = this.db.prepare('SELECT snapshot FROM catalog_records WHERE id=?').get(String(row._catalog_id));
    if (!saved) return false;
    const record: CatalogRecord = JSON.parse(String(saved.snapshot));
    return record.status === 'approved' && record.revision === row._catalog_revision;
  }
}
