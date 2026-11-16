export type WorkKind = 'document' | 'book' | 'poem' | 'essay' | 'academic';
export type LanguageCode = 'bn' | 'hi' | 'native';
export type WorkspaceFilter = WorkKind | 'all' | 'trash';

export interface Chapter {
  id: string;
  title: string;
  text: string;
}

export interface WorkRecord {
  id: string;
  kind: WorkKind;
  title: string;
  text: string;
  language: LanguageCode;
  createdAt: number;
  updatedAt: number;
  revision: number;
  deletedAt?: number;
  chapters?: Chapter[];
  activeChapterId?: string;
  academicTemplate?: 'assignment' | 'paper' | 'thesis-dissertation' | 'research-note' | 'report';
}

export interface SourceRecord {
  id: string;
  title: string;
  authors: string;
  year: string;
  doi: string;
  url: string;
  verificationStatus: 'unreviewed' | 'reviewed' | 'verified' | 'needs-correction';
  updatedAt: number;
}

export interface ResearchNote {
  id: string;
  workId: string;
  sourceId?: string;
  kind: 'quote' | 'paraphrase' | 'summary' | 'idea';
  text: string;
  locator: string;
  updatedAt: number;
}

export interface RecoverySnapshot {
  id: string;
  workId: string;
  title: string;
  text: string;
  createdAt: number;
}

export interface TranslationCorrection {
  id: string;
  pair: 'bn-latn-bn' | 'hi-latn-hi';
  normalizedRoman: string;
  romanText: string;
  nativeText: string;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryBackup {
  format: 'lekhoni-library';
  formatVersion: 2;
  exportedAt: string;
  activeId: string | null;
  works: WorkRecord[];
  sources: SourceRecord[];
  notes: ResearchNote[];
  snapshots: RecoverySnapshot[];
  corrections: TranslationCorrection[];
}

export interface ProofingFinding {
  id: string;
  message: string;
  original: string;
  replacement?: string;
  offset: number;
  length: number;
  category: 'spacing' | 'repetition' | 'unicode';
}

export const WORKSPACE_LABELS: Record<WorkKind, string> = {
  document: 'Document',
  book: 'Book',
  poem: 'Poem',
  essay: 'Essay',
  academic: 'Academic',
};