import { z } from 'zod';

const CandidateSchema = z.object({
  text: z.string().min(1).max(80),
  rank: z.number().int().positive(),
  sourceId: z.string().min(1).optional(),
});

const EntrySchema = z.object({
  roman: z.string().trim().min(1).max(80),
  candidates: z.array(CandidateSchema).min(1).max(8),
  sourceIds: z.array(z.string().min(1)).default([]),
});

const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  revision: z.string().min(1),
  licenseId: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const PhoneticPackSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.enum(['bn-latn-bn', 'hi-latn-hi']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  releaseStatus: z.enum(['seed', 'review', 'approved']),
  license: z.object({ spdxId: z.string().min(1), notice: z.string().min(1) }).nullable(),
  provenance: z.array(SourceSchema),
  nativeReview: z.object({
    status: z.enum(['pending', 'approved']),
    corpusVersion: z.string().optional(),
    reviewedAt: z.string().datetime().optional(),
    reviewerIds: z.array(z.string().min(1)),
  }),
  entries: z.array(EntrySchema).max(250_000),
}).superRefine((pack, context) => {
  const keys = new Set<string>();
  for (const [index, entry] of pack.entries.entries()) {
    const key = entry.roman.normalize('NFC').trim().toLocaleLowerCase();
    if (keys.has(key)) context.addIssue({ code: 'custom', path: ['entries', index, 'roman'], message: 'Duplicate normalized Roman key.' });
    keys.add(key);
    if (new Set(entry.candidates.map((candidate) => candidate.rank)).size !== entry.candidates.length) {
      context.addIssue({ code: 'custom', path: ['entries', index, 'candidates'], message: 'Candidate ranks must be unique within an entry.' });
    }
  }

  if (pack.releaseStatus === 'approved') {
    if (!pack.license) context.addIssue({ code: 'custom', path: ['license'], message: 'Approved packs require an explicit license and notice.' });
    if (!pack.provenance.length) context.addIssue({ code: 'custom', path: ['provenance'], message: 'Approved packs require source provenance.' });
    if (pack.nativeReview.status !== 'approved' || !pack.nativeReview.reviewedAt || !pack.nativeReview.corpusVersion || !pack.nativeReview.reviewerIds.length) {
      context.addIssue({ code: 'custom', path: ['nativeReview'], message: 'Approved packs require a recorded native review.' });
    }
    const sourceIds = new Set(pack.provenance.map((source) => source.id));
    for (const [index, entry] of pack.entries.entries()) {
      if (!entry.sourceIds.length || entry.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
        context.addIssue({ code: 'custom', path: ['entries', index, 'sourceIds'], message: 'Approved entries must reference declared provenance.' });
      }
      if (entry.candidates.some((candidate) => !candidate.sourceId || !sourceIds.has(candidate.sourceId))) {
        context.addIssue({ code: 'custom', path: ['entries', index, 'candidates'], message: 'Approved candidates must reference declared provenance.' });
      }
    }
  }
});

export type PhoneticPack = z.infer<typeof PhoneticPackSchema>;

export function getReleaseCandidates(pack: PhoneticPack, roman: string): PhoneticPack['entries'][number]['candidates'] {
  if (pack.releaseStatus !== 'approved') return [];
  const key = roman.normalize('NFC').trim().toLocaleLowerCase();
  return pack.entries.find((entry) => entry.roman.normalize('NFC').trim().toLocaleLowerCase() === key)?.candidates
    .slice()
    .sort((left, right) => left.rank - right.rank) ?? [];
}