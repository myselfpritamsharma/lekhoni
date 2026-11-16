import { PhoneticComposerService } from './phonetic-composer.service';

describe('PhoneticComposerService', () => {
  const service = new PhoneticComposerService();

  it('labels Bengali seed phrases as unreviewed', () => {
    expect(service.suggest('ami banglay likhi', 'bn')[0]).toMatchObject({ text: 'আমি বাংলায় লিখি', label: 'Seed suggestion (unreviewed)' });
  });

  it('labels Hindi seed phrases as unreviewed', () => {
    expect(service.suggest('main hindi mein likhta hoon', 'hi')[0]).toMatchObject({ text: 'मैं हिंदी में लिखता हूँ', label: 'Seed suggestion (unreviewed)' });
  });

  it('keeps an explicit Roman fallback candidate for ambiguous input', () => {
    const candidates = service.suggest('xyz', 'bn');
    expect(candidates[0].label).toBe('Phonetic fallback');
    expect(candidates.at(-1)).toMatchObject({ text: 'xyz', label: 'Keep Roman' });
  });

  it('ranks a saved correction before seed and fallback candidates', () => {
    const candidates = service.suggest('ami', 'bn', [{
      id: 'correction-1', pair: 'bn-latn-bn', normalizedRoman: 'ami', romanText: 'ami',
      nativeText: 'আমি তো', createdAt: 1, updatedAt: 2,
    }]);
    expect(candidates[0]).toMatchObject({ text: 'আমি তো', label: 'Your correction' });
    expect(candidates.some((candidate) => candidate.label === 'Seed suggestion (unreviewed)')).toBe(true);
    expect(candidates.at(-1)?.label).toBe('Keep Roman');
  });

  it('does not compose in native mode', () => {
    expect(service.suggest('ami', 'native')).toEqual([]);
  });
});