import { Injectable } from '@angular/core';
import type { ProofingFinding } from '../../domain/models';

@Injectable({ providedIn: 'root' })
export class ProofingService {
  inspect(text: string): ProofingFinding[] {
    const findings: ProofingFinding[] = [];
    const add = (category: ProofingFinding['category'], message: string, match: RegExpExecArray, replacement?: string) => {
      findings.push({ id: `${category}-${match.index}`, category, message, original: match[0], replacement, offset: match.index, length: match[0].length });
    };

    for (const match of text.matchAll(/ {2,}/g)) add('spacing', 'Repeated spaces', match as RegExpExecArray, ' ');
    let cursor = 0;
    let previous: { value: string; start: number; end: number } | undefined;
    for (const part of text.split(/(\s+)/u)) {
      const start = cursor;
      cursor += part.length;
      if (!part || /^\s+$/u.test(part)) continue;
      if (previous && start > previous.end && previous.value.normalize('NFC').toLocaleLowerCase() === part.normalize('NFC').toLocaleLowerCase()) {
        const offset = previous.start;
        const original = text.slice(offset, cursor);
        findings.push({
          id: `repetition-${offset}`, category: 'repetition', message: 'Repeated adjacent word', original,
          replacement: previous.value, offset, length: original.length,
        });
      }
      previous = { value: part, start, end: cursor };
    }
    for (const match of text.matchAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)) add('unicode', 'Unexpected control character', match as RegExpExecArray);
    return findings.sort((a, b) => a.offset - b.offset);
  }
}