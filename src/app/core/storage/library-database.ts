import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import { z } from 'zod';

import type { LanguageCode, LibraryBackup, RecoverySnapshot, ResearchNote, SourceRecord, TranslationCorrection, WorkRecord } from '../../domain/models';

const ChapterSchema = z.object({ id: z.string().min(1), title: z.string().max(120), text: z.string().max(5_000_000) });
const WorkSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['document', 'book', 'poem', 'essay', 'academic']),
  title: z.string().max(120),
  text: z.string().max(5_000_000),
  language: z.enum(['bn', 'hi', 'native']),
  createdAt: z.number(),
  updatedAt: z.number(),
  revision: z.number().int().nonnegative(),
  deletedAt: z.number().optional(),
  chapters: z.array(ChapterSchema).max(200).optional(),
  activeChapterId: z.string().optional(),
  academicTemplate: z.enum(['assignment', 'paper', 'thesis-dissertation', 'research-note', 'report']).optional(),
});
const SourceSchema = z.object({
  id: z.string().min(1), title: z.string().max(500), authors: z.string().max(500), year: z.string().max(40),
  doi: z.string().max(300), url: z.string().max(2000),
  verificationStatus: z.enum(['unreviewed', 'reviewed', 'verified', 'needs-correction']), updatedAt: z.number(),
});
const NoteSchema = z.object({
  id: z.string().min(1), workId: z.string().min(1), sourceId: z.string().optional(),
  kind: z.enum(['quote', 'paraphrase', 'summary', 'idea']), text: z.string().max(1_000_000), locator: z.string().max(200), updatedAt: z.number(),
});
const SnapshotSchema = z.object({ id: z.string().min(1), workId: z.string().min(1), title: z.string().max(120), text: z.string().max(5_000_000), createdAt: z.number() });
const CorrectionSchema = z.object({
  id: z.string().min(1), pair: z.enum(['bn-latn-bn', 'hi-latn-hi']), normalizedRoman: z.string().min(1).max(200),
  romanText: z.string().min(1).max(200), nativeText: z.string().min(1).max(500), createdAt: z.number(), updatedAt: z.number(),
});
const BackupSchema = z.object({
  format: z.literal('lekhoni-library'), formatVersion: z.literal(2), exportedAt: z.string(), activeId: z.string().nullable(),
  works: z.array(WorkSchema).max(10_000), sources: z.array(SourceSchema).max(50_000),
  notes: z.array(NoteSchema).max(100_000), snapshots: z.array(SnapshotSchema).max(50_000), corrections: z.array(CorrectionSchema).max(100_000).default([]),
});
const LegacyBackupSchema = z.object({
  format: z.literal('lekhoni-library'), formatVersion: z.literal(1), exportedAt: z.string(), activeId: z.string().nullable().optional(),
  documents: z.array(z.object({
    id: z.string().min(1), title: z.string().max(120), mode: z.enum(['document', 'book', 'poem', 'essay', 'academic']),
    text: z.string().max(5_000_000), language: z.enum(['bn', 'hi', 'native']).optional(), updatedAt: z.number().optional(), deletedAt: z.number().optional(),
  })).max(10_000),
});

class LekhoniDatabase extends Dexie {
  works!: Table<WorkRecord, string>;
  sources!: Table<SourceRecord, string>;
  notes!: Table<ResearchNote, string>;
  snapshots!: Table<RecoverySnapshot, string>;
  translationMemory!: Table<TranslationCorrection, string>;

  constructor() {
    super('lekhoni-library');
    const schema = {
      works: 'id, kind, normalizedTitle, updatedAt, deletedAt',
      sources: 'id, normalizedTitle, doi, updatedAt, verificationStatus',
      notes: 'id, workId, sourceId, kind, updatedAt',
      snapshots: 'id, workId, createdAt',
    };
    this.version(1).stores(schema);
    this.version(2).stores({ ...schema, translationMemory: 'id, &[pair+normalizedRoman], pair, updatedAt' });
  }
}

@Injectable({ providedIn: 'root' })
export class LibraryDatabaseService {
  private readonly db = new LekhoniDatabase();
  readonly ready = this.initialize();

  async listWorks(includeDeleted = false): Promise<WorkRecord[]> {
    await this.ready;
    const records = await this.db.works.orderBy('updatedAt').reverse().toArray();
    return includeDeleted ? records : records.filter((work) => !work.deletedAt);
  }

  async getWork(id: string): Promise<WorkRecord | undefined> {
    await this.ready;
    return this.db.works.get(id);
  }

  async saveWork(work: WorkRecord): Promise<void> {
    await this.ready;
    const normalized: WorkRecord = { ...work, text: work.text.normalize('NFC'), updatedAt: Date.now(), revision: work.revision + 1 };
    await this.db.transaction('rw', this.db.works, this.db.snapshots, async () => {
      const previous = await this.db.works.get(work.id);
      if (previous && previous.text !== normalized.text) {
        await this.db.snapshots.add({
          id: crypto.randomUUID(), workId: previous.id, title: previous.title, text: previous.text, createdAt: Date.now(),
        });
        const oldSnapshots = await this.db.snapshots.where('workId').equals(work.id).sortBy('createdAt');
        if (oldSnapshots.length > 20) await this.db.snapshots.bulkDelete(oldSnapshots.slice(0, oldSnapshots.length - 20).map((snapshot) => snapshot.id));
      }
      await this.db.works.put(normalized);
    });
  }

  async createWork(kind: WorkRecord['kind']): Promise<WorkRecord> {
    await this.ready;
    const now = Date.now();
    const title = kind === 'document' ? 'Untitled document' : `Untitled ${kind}`;
    const work: WorkRecord = {
      id: crypto.randomUUID(), kind, title, text: '', language: 'bn', createdAt: now, updatedAt: now, revision: 0,
      ...(kind === 'book' ? { chapters: [{ id: crypto.randomUUID(), title: 'Chapter 1', text: '' }] } : {}),
      ...(kind === 'academic' ? { academicTemplate: 'paper' as const } : {}),
    };
    await this.db.works.add(work);
    return work;
  }

  async duplicateWork(work: WorkRecord): Promise<WorkRecord> {
    const copy: WorkRecord = { ...structuredClone(work), id: crypto.randomUUID(), title: `${work.title} (copy)`, createdAt: Date.now(), updatedAt: Date.now(), revision: 0 };
    delete copy.deletedAt;
    await this.db.works.add(copy);
    return copy;
  }

  async saveSource(source: SourceRecord): Promise<void> {
    await this.ready;
    const normalizedTitle = source.title.normalize('NFC').trim().toLocaleLowerCase();
    await this.db.sources.put({ ...source, title: source.title.normalize('NFC'), updatedAt: Date.now(), normalizedTitle } as SourceRecord & { normalizedTitle: string });
  }

  async listSources(): Promise<SourceRecord[]> {
    await this.ready;
    return this.db.sources.orderBy('updatedAt').reverse().toArray();
  }

  async saveNote(note: ResearchNote): Promise<void> {
    await this.ready;
    await this.db.notes.put({ ...note, text: note.text.normalize('NFC'), updatedAt: Date.now() });
  }

  async listNotes(workId: string): Promise<ResearchNote[]> {
    await this.ready;
    return this.db.notes.where('workId').equals(workId).sortBy('updatedAt');
  }

  async listCorrections(language: Exclude<LanguageCode, 'native'>): Promise<TranslationCorrection[]> {
    await this.ready;
    const pair = language === 'bn' ? 'bn-latn-bn' : 'hi-latn-hi';
    return this.db.translationMemory.where('pair').equals(pair).reverse().sortBy('updatedAt');
  }

  async saveCorrection(language: Exclude<LanguageCode, 'native'>, romanText: string, nativeText: string): Promise<TranslationCorrection> {
    await this.ready;
    const pair = language === 'bn' ? 'bn-latn-bn' : 'hi-latn-hi';
    const normalizedRoman = romanText.normalize('NFC').trim().toLocaleLowerCase();
    const existing = await this.db.translationMemory.where('[pair+normalizedRoman]').equals([pair, normalizedRoman]).first();
    const now = Date.now();
    const correction: TranslationCorrection = {
      id: existing?.id ?? crypto.randomUUID(), pair, normalizedRoman,
      romanText: romanText.normalize('NFC').trim(), nativeText: nativeText.normalize('NFC'),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    await this.db.translationMemory.put(correction);
    return correction;
  }

  async exportBackup(activeId: string | null): Promise<Blob> {
    await this.ready;
    const payload: LibraryBackup = {
      format: 'lekhoni-library', formatVersion: 2, exportedAt: new Date().toISOString(), activeId,
      works: await this.db.works.toArray(), sources: await this.db.sources.toArray(),
      notes: await this.db.notes.toArray(), snapshots: await this.db.snapshots.toArray(),
      corrections: await this.db.translationMemory.toArray(),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  }

  async restoreBackup(file: File): Promise<LibraryBackup> {
    await this.ready;
    if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds the 20 MB restore limit.');
    const parsed: unknown = JSON.parse(await file.text());
    let backup: LibraryBackup;
    if (typeof parsed === 'object' && parsed !== null && 'formatVersion' in parsed && parsed.formatVersion === 1) {
      const legacy = LegacyBackupSchema.parse(parsed);
      backup = {
        format: 'lekhoni-library', formatVersion: 2, exportedAt: legacy.exportedAt,
        activeId: legacy.activeId ?? legacy.documents[0]?.id ?? null,
        works: legacy.documents.map((document) => ({
          id: document.id, title: document.title, kind: document.mode, text: document.text.normalize('NFC'),
          language: document.language ?? 'bn', createdAt: document.updatedAt ?? Date.now(), updatedAt: document.updatedAt ?? Date.now(),
          revision: 0, ...(document.deletedAt ? { deletedAt: document.deletedAt } : {}),
        })),
        sources: [], notes: [], snapshots: [], corrections: [],
      };
    } else {
      backup = BackupSchema.parse(parsed) as LibraryBackup;
    }
    const ids = new Set(backup.works.map((work) => work.id));
    if (ids.size !== backup.works.length || backup.notes.some((note) => !ids.has(note.workId))) throw new Error('Backup references are inconsistent.');
    await this.db.transaction('rw', this.db.works, this.db.sources, this.db.notes, this.db.snapshots, this.db.translationMemory, async () => {
      await Promise.all([this.db.works.clear(), this.db.sources.clear(), this.db.notes.clear(), this.db.snapshots.clear(), this.db.translationMemory.clear()]);
      await Promise.all([
        this.db.works.bulkPut(backup.works), this.db.sources.bulkPut(backup.sources),
        this.db.notes.bulkPut(backup.notes), this.db.snapshots.bulkPut(backup.snapshots), this.db.translationMemory.bulkPut(backup.corrections),
      ]);
    });
    return backup;
  }

  async recover(workId: string): Promise<RecoverySnapshot[]> {
    await this.ready;
    return this.db.snapshots.where('workId').equals(workId).reverse().sortBy('createdAt');
  }

  private async initialize(): Promise<void> {
    await this.db.open();
    if (await this.db.works.count()) return;
    try {
      const legacy = JSON.parse(localStorage.getItem('lekhoni.local.v1') || 'null') as { documents?: Array<Record<string, unknown>> } | null;
      const documents = legacy?.documents ?? [];
      const migrated = documents.filter((item) => typeof item['id'] === 'string' && typeof item['title'] === 'string' && typeof item['text'] === 'string');
      if (migrated.length) {
        const now = Date.now();
        await this.db.works.bulkPut(migrated.map((item) => ({
          id: item['id'] as string,
          title: (item['title'] as string).slice(0, 120),
          kind: ['document', 'book', 'poem', 'essay', 'academic'].includes(String(item['mode'])) ? item['mode'] as WorkRecord['kind'] : 'document',
          text: (item['text'] as string).normalize('NFC'),
          language: item['language'] === 'hi' || item['language'] === 'native' ? item['language'] : 'bn',
          createdAt: typeof item['updatedAt'] === 'number' ? item['updatedAt'] : now,
          updatedAt: typeof item['updatedAt'] === 'number' ? item['updatedAt'] : now,
          revision: 0,
          ...(typeof item['deletedAt'] === 'number' ? { deletedAt: item['deletedAt'] } : {}),
        })));
      }
    } catch {
      // Keep the database open; the UI can start a fresh library and surface storage errors.
    }
  }
}