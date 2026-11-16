import { Injectable } from '@angular/core';
import type { LanguageCode, TranslationCorrection } from '../../domain/models';
import bengaliSeed from '../../../assets/language-packs/bn-latn-bn.seed.json';
import hindiSeed from '../../../assets/language-packs/hi-latn-hi.seed.json';
import { getReleaseCandidates, PhoneticPackSchema } from './phonetic-pack';

export interface CompositionCandidate {
  id: string;
  text: string;
  romanText: string;
  language: 'bn' | 'hi';
  label: 'Your correction' | 'Native-reviewed pack' | 'Seed suggestion (unreviewed)' | 'Phonetic fallback' | 'Keep Roman';
}

const SEED_PACKS = {
  bn: PhoneticPackSchema.parse(bengaliSeed),
  hi: PhoneticPackSchema.parse(hindiSeed),
};

const MAPS = {
  bn: {
    consonants: { kh: 'খ', gh: 'ঘ', chh: 'ছ', ch: 'চ', jh: 'ঝ', th: 'থ', dh: 'ধ', ph: 'ফ', bh: 'ভ', sh: 'শ', ng: 'ঙ', ny: 'ঞ', k: 'ক', g: 'গ', j: 'জ', t: 'ত', d: 'দ', n: 'ন', p: 'প', b: 'ব', m: 'ম', y: 'য়', r: 'র', l: 'ল', v: 'ব', w: 'ব', s: 'স', h: 'হ', f: 'ফ', z: 'জ', q: 'ক', c: 'ক', x: 'ক্ষ' },
    vowels: { aa: ['আ', 'া'], a: ['অ', ''], ii: ['ঈ', 'ী'], ee: ['ঈ', 'ী'], i: ['ই', 'ি'], uu: ['ঊ', 'ূ'], oo: ['ঊ', 'ূ'], u: ['উ', 'ু'], ai: ['ঐ', 'ৈ'], au: ['ঔ', 'ৌ'], e: ['এ', 'ে'], o: ['ও', 'ো'] },
  },
  hi: {
    consonants: { kh: 'ख', gh: 'घ', chh: 'छ', ch: 'च', jh: 'झ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', sh: 'श', ng: 'ङ', ny: 'ञ', k: 'क', g: 'ग', j: 'ज', t: 'त', d: 'द', n: 'न', p: 'प', b: 'ब', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', f: 'फ़', z: 'ज़', q: 'क', c: 'च', x: 'क्ष' },
    vowels: { aa: ['आ', 'ा'], a: ['अ', ''], ii: ['ई', 'ी'], ee: ['ई', 'ी'], i: ['इ', 'ि'], uu: ['ऊ', 'ू'], oo: ['ऊ', 'ू'], u: ['उ', 'ु'], ai: ['ऐ', 'ै'], au: ['औ', 'ौ'], e: ['ए', 'े'], o: ['ओ', 'ो'] },
  },
} as const;

@Injectable({ providedIn: 'root' })
export class PhoneticComposerService {
  suggest(input: string, language: LanguageCode, corrections: TranslationCorrection[] = []): CompositionCandidate[] {
    const roman = input.trim().toLocaleLowerCase();
    if (!roman || language === 'native') return [];
    const pack = SEED_PACKS[language];
    const ranked: Array<{ candidate: CompositionCandidate; rank: number }> = [];
    const add = (text: string, label: CompositionCandidate['label'], rank: number) => {
      const normalizedText = text.normalize('NFC');
      ranked.push({
        candidate: {
          id: `${language}:${roman}:${label}:${normalizedText}`,
          text: normalizedText,
          romanText: input.trim(),
          language,
          label,
        },
        rank,
      });
    };

    const pair = language === 'bn' ? 'bn-latn-bn' : 'hi-latn-hi';
    const correction = corrections.find((item) => item.pair === pair && item.normalizedRoman === roman);
    if (correction) add(correction.nativeText, 'Your correction', 0);
    const releaseCandidates = getReleaseCandidates(pack, roman);
    releaseCandidates.forEach((candidate) => add(candidate.text, 'Native-reviewed pack', 10 + candidate.rank));
    const seed = pack.entries.find((entry) => entry.roman.normalize('NFC').trim().toLocaleLowerCase() === roman);
    seed?.candidates.forEach((candidate) => add(candidate.text, 'Seed suggestion (unreviewed)', 100 + candidate.rank));
    const phrase = roman.split(/(\s+)/).map((part) => /^\s+$/.test(part)
      ? part
      : SEED_PACKS[language].entries.find((entry) => entry.roman === part)?.candidates[0]?.text ?? this.transliterate(part, language)).join('').normalize('NFC');
    add(phrase, 'Phonetic fallback', 1_000);
    add(input.trim(), 'Keep Roman', 10_000);

    const seen = new Set<string>();
    return ranked.sort((left, right) => left.rank - right.rank).flatMap(({ candidate }) => {
      const key = candidate.text.normalize('NFC').toLocaleLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      return [candidate];
    });
  }

  private transliterate(input: string, language: 'bn' | 'hi'): string {
    const map = MAPS[language];
    const consonants = Object.keys(map.consonants).sort((a, b) => b.length - a.length);
    const vowels = Object.keys(map.vowels).sort((a, b) => b.length - a.length);
    const text = input.toLocaleLowerCase();
    let result = '';
    for (let index = 0; index < text.length;) {
      const consonant = consonants.find((key) => text.startsWith(key, index));
      if (consonant) {
        result += map.consonants[consonant as keyof typeof map.consonants];
        index += consonant.length;
        const vowel = vowels.find((key) => text.startsWith(key, index));
        if (vowel) {
          result += map.vowels[vowel as keyof typeof map.vowels][1];
          index += vowel.length;
        } else if (consonants.some((key) => text.startsWith(key, index))) result += language === 'bn' ? '্' : '्';
        continue;
      }
      const vowel = vowels.find((key) => text.startsWith(key, index));
      if (vowel) {
        result += map.vowels[vowel as keyof typeof map.vowels][0];
        index += vowel.length;
        continue;
      }
      result += /[.,!?;:'"()\-\s]/.test(text[index]) ? text[index] : text[index];
      index += 1;
    }
    return result.normalize('NFC');
  }
}