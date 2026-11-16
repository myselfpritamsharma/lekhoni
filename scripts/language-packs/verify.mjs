import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packDirectory = resolve(root, 'src/assets/language-packs');
const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  packs: z.array(z.object({ id: z.enum(['bn-latn-bn', 'hi-latn-hi']), version: z.string(), file: z.string().min(1) })).min(1),
});
const PackSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.enum(['bn-latn-bn', 'hi-latn-hi']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  releaseStatus: z.enum(['seed', 'review', 'approved']),
  license: z.object({ spdxId: z.string().min(1), notice: z.string().min(1) }).nullable(),
  provenance: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), revision: z.string().min(1),
    licenseId: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })),
  nativeReview: z.object({
    status: z.enum(['pending', 'approved']), corpusVersion: z.string().optional(),
    reviewedAt: z.string().datetime().optional(), reviewerIds: z.array(z.string().min(1)),
  }),
  entries: z.array(z.object({
    roman: z.string().trim().min(1).max(80),
    candidates: z.array(z.object({ text: z.string().min(1).max(80), rank: z.number().int().positive(), sourceId: z.string().optional() })).min(1).max(8),
    sourceIds: z.array(z.string()).default([]),
  })).max(250_000),
});

const catalog = CatalogSchema.parse(JSON.parse(await readFile(resolve(packDirectory, 'catalog.json'), 'utf8')));
const seenPairs = new Set();
let approvedCount = 0;

for (const item of catalog.packs) {
  if (isAbsolute(item.file)) throw new Error(`Absolute pack path rejected: ${item.file}`);
  const file = resolve(packDirectory, item.file);
  const relativePath = relative(packDirectory, file);
  if (relativePath.startsWith('..')) throw new Error(`Pack path escapes its directory: ${item.file}`);
  const pack = PackSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (pack.id !== item.id || pack.version !== item.version) throw new Error(`Catalog mismatch for ${item.file}`);
  if (seenPairs.has(pack.id)) throw new Error(`Duplicate language pair: ${pack.id}`);
  seenPairs.add(pack.id);

  const keys = new Set();
  const sourceIds = new Set(pack.provenance.map((source) => source.id));
  for (const entry of pack.entries) {
    const key = entry.roman.normalize('NFC').trim().toLocaleLowerCase();
    if (keys.has(key)) throw new Error(`Duplicate normalized key "${entry.roman}" in ${pack.id}`);
    keys.add(key);
    const ranks = entry.candidates.map((candidate) => candidate.rank);
    if (new Set(ranks).size !== ranks.length) throw new Error(`Duplicate candidate rank for "${entry.roman}" in ${pack.id}`);
    if (pack.releaseStatus === 'approved' && (!entry.sourceIds.length || entry.sourceIds.some((sourceId) => !sourceIds.has(sourceId)))) {
      throw new Error(`Missing entry provenance for "${entry.roman}" in ${pack.id}`);
    }
    if (pack.releaseStatus === 'approved' && entry.candidates.some((candidate) => !candidate.sourceId || !sourceIds.has(candidate.sourceId))) {
      throw new Error(`Missing candidate provenance for "${entry.roman}" in ${pack.id}`);
    }
  }

  if (pack.releaseStatus === 'approved') {
    if (!pack.license || !pack.provenance.length) throw new Error(`Approved pack ${pack.id} needs license and source provenance.`);
    if (pack.nativeReview.status !== 'approved' || !pack.nativeReview.reviewedAt || !pack.nativeReview.corpusVersion || !pack.nativeReview.reviewerIds.length) {
      throw new Error(`Approved pack ${pack.id} needs a complete native-review record.`);
    }
    approvedCount += 1;
  }
}

console.log(`Validated ${catalog.packs.length} language pack(s); ${approvedCount} release-ready.`);
if (approvedCount === 0) console.log('Release gate remains closed: no pack has approved provenance, license, and native review.');