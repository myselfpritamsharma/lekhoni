import bengaliSeed from '../../../assets/language-packs/bn-latn-bn.seed.json';
import { getReleaseCandidates, PhoneticPackSchema } from './phonetic-pack';

describe('phonetic language-pack release gate', () => {
  it('parses a seed pack but never returns it from release lookup', () => {
    const pack = PhoneticPackSchema.parse(bengaliSeed);
    expect(pack.releaseStatus).toBe('seed');
    expect(getReleaseCandidates(pack, 'ami')).toEqual([]);
  });

  it('rejects an approved pack without license, provenance, and review', () => {
    const invalid = { ...bengaliSeed, releaseStatus: 'approved' };
    expect(() => PhoneticPackSchema.parse(invalid)).toThrow();
  });

  it('returns approved candidates in declared rank order', () => {
    const approved = PhoneticPackSchema.parse({
      ...bengaliSeed,
      releaseStatus: 'approved',
      license: { spdxId: 'CC0-1.0', notice: 'Reviewed data notice.' },
      provenance: [{ id: 'source-1', name: 'Approved source', revision: '1', licenseId: 'CC0-1.0', sha256: 'a'.repeat(64) }],
      nativeReview: { status: 'approved', corpusVersion: 'bn-1', reviewedAt: '2026-11-15T00:00:00.000Z', reviewerIds: ['reviewer-1'] },
      entries: [{ roman: 'ami', sourceIds: ['source-1'], candidates: [{ text: 'আমিই', rank: 2, sourceId: 'source-1' }, { text: 'আমি', rank: 1, sourceId: 'source-1' }] }],
    });
    expect(getReleaseCandidates(approved, 'ami').map((candidate) => candidate.text)).toEqual(['আমি', 'আমিই']);
  });
});