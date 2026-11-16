import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, QueryList, ViewChild, ViewChildren, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LibraryDatabaseService } from './core/storage/library-database';
import type { Chapter, LanguageCode, ProofingFinding, ResearchNote, SourceRecord, TranslationCorrection, WorkKind, WorkRecord, WorkspaceFilter } from './domain/models';
import { WORKSPACE_LABELS } from './domain/models';
import { PhoneticComposerService } from './features/unicode-composer/phonetic-composer.service';
import type { CompositionCandidate } from './features/unicode-composer/phonetic-composer.service';
import { ProofingService } from './features/proofing/proofing.service';

interface CompositionEdit {
  beforeText: string;
  afterText: string;
  beforeStart: number;
  beforeEnd: number;
  afterCaret: number;
}

@Component({
  selector: 'lk-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnDestroy {
  private readonly library = inject(LibraryDatabaseService);
  private readonly composer = inject(PhoneticComposerService);
  private readonly proofing = inject(ProofingService);
  private saveTimer?: number;
  private pendingSave?: WorkRecord;
  private readonly compositionUndoStack: CompositionEdit[] = [];
  private readonly compositionRedoStack: CompositionEdit[] = [];
  @ViewChild('editor') private editorRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChildren('candidateButton') private candidateButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  readonly labels = WORKSPACE_LABELS;
  readonly works = signal<WorkRecord[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly filter = signal<WorkspaceFilter>('all');
  readonly searchQuery = signal('');
  readonly loading = signal(true);
  readonly saveStatus = signal('Opening your library…');
  readonly toastMessage = signal('');
  readonly researchOpen = signal(false);
  readonly proofingOpen = signal(false);
  readonly recoveryOpen = signal(false);
  readonly restoreOpen = signal(false);
  readonly replaceOpen = signal(false);
  readonly pendingBackup = signal<File | null>(null);
  readonly snapshots = signal<Awaited<ReturnType<LibraryDatabaseService['recover']>>>([]);
  readonly sources = signal<SourceRecord[]>([]);
  readonly notes = signal<ResearchNote[]>([]);
  readonly corrections = signal<TranslationCorrection[]>([]);
  readonly chapterId = signal<string | null>(null);
  readonly activeWork = computed(() => this.works().find((work) => work.id === this.activeId()) ?? null);
  readonly activeChapter = computed(() => this.activeWork()?.chapters?.find((chapter) => chapter.id === this.chapterId()) ?? null);
  readonly filteredWorks = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    return this.works()
      .filter((work) => this.filter() === 'trash' ? Boolean(work.deletedAt) : !work.deletedAt && (this.filter() === 'all' || work.kind === this.filter()))
      .filter((work) => !query || `${work.title} ${work.text} ${work.chapters?.map((chapter) => `${chapter.title} ${chapter.text}`).join(' ') ?? ''}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });
  readonly isOnline = signal(navigator.onLine);

  titleDraft = '';
  editorText = '';
  romanDraft = '';
  searchText = '';
  replaceText = '';
  sourceTitle = '';
  sourceAuthors = '';
  sourceYear = '';
  sourceDoi = '';
  sourceUrl = '';
  noteText = '';
  noteKind: ResearchNote['kind'] = 'idea';
  toastTimer?: number;
  selectedCandidateIndex = -1;

  get candidates() { return this.composer.suggest(this.romanDraft, this.activeWork()?.language ?? 'bn', this.corrections()); }
  get canUndoComposition(): boolean { return this.compositionUndoStack.length > 0; }
  get canRedoComposition(): boolean { return this.compositionRedoStack.length > 0; }
  get wordCount(): number { return this.editorText.trim() ? this.editorText.trim().split(/\s+/u).length : 0; }
  get characterCount(): number { return [...this.editorText].length; }
  get readingMinutes(): number { return Math.max(1, Math.ceil(this.wordCount / 220)); }
  get findings(): ProofingFinding[] { return this.proofing.inspect(this.editorText); }

  constructor() {
    void this.initialize();
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    if (this.pendingSave) void this.library.saveWork(this.pendingSave);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
  }

  private readonly handleOnline = () => this.isOnline.set(true);
  private readonly handleOffline = () => this.isOnline.set(false);

  private async initialize(): Promise<void> {
    try {
      await this.library.ready;
      let works = await this.library.listWorks(true);
      if (!works.some((work) => !work.deletedAt)) {
        await this.library.createWork('document');
        works = await this.library.listWorks(true);
      }
      this.works.set(works);
      const selected = works.find((work) => !work.deletedAt) ?? works[0];
      if (selected) this.activate(selected);
      this.sources.set(await this.library.listSources());
      this.loading.set(false);
    } catch {
      this.saveStatus.set('Your local library could not be opened. Check browser storage and reload.');
      this.loading.set(false);
    }
  }

  private activate(work: WorkRecord): void {
    this.activeId.set(work.id);
    this.titleDraft = work.title;
    const chapter = work.chapters?.find((item) => item.id === (work.activeChapterId ?? this.chapterId())) ?? work.chapters?.[0];
    this.chapterId.set(chapter?.id ?? null);
    this.editorText = chapter?.text ?? work.text;
    this.romanDraft = '';
    this.corrections.set([]);
    if (work.language !== 'native') void this.loadCorrections(work.language);
    this.saveStatus.set('Saved on this device');
    void this.loadNotes(work.id);
  }

  private async loadNotes(workId: string): Promise<void> {
    this.notes.set(await this.library.listNotes(workId));
  }

  private async loadCorrections(language: Exclude<LanguageCode, 'native'>): Promise<void> {
    const corrections = await this.library.listCorrections(language);
    if (this.activeWork()?.language === language) this.corrections.set(corrections);
  }

  async selectWork(work: WorkRecord): Promise<void> {
    await this.flushSave();
    this.activate(work);
  }

  setFilter(filter: WorkspaceFilter): void {
    this.filter.set(filter);
    this.searchQuery.set('');
  }

  setSearch(value: string): void {
    this.searchQuery.set(value);
  }

  setTitle(value: string): void {
    this.titleDraft = value;
    this.scheduleSave();
  }

  onTextChange(value: string): void {
    this.editorText = value.normalize('NFC');
    this.compositionUndoStack.length = 0;
    this.compositionRedoStack.length = 0;
    this.scheduleSave();
  }

  setLanguage(language: LanguageCode): void {
    const work = this.activeWork();
    if (!work) return;
    this.works.update((items) => items.map((item) => item.id === work.id ? { ...item, language } : item));
    this.corrections.set([]);
    if (language !== 'native') void this.loadCorrections(language);
    this.scheduleSave();
  }

  setAcademicTemplate(template: NonNullable<WorkRecord['academicTemplate']>): void {
    const work = this.activeWork();
    if (!work || work.kind !== 'academic') return;
    this.works.update((items) => items.map((item) => item.id === work.id ? { ...item, academicTemplate: template } : item));
    this.scheduleSave();
  }

  private scheduleSave(): void {
    const work = this.activeWork();
    if (!work) return;
    const title = this.titleDraft.trim().slice(0, 120) || 'Untitled document';
    const chapters = work.chapters?.map((chapter) => chapter.id === this.chapterId() ? { ...chapter, text: this.editorText } : chapter);
    const next: WorkRecord = { ...work, title, text: chapters ? work.text : this.editorText, chapters, updatedAt: Date.now() };
    this.works.update((items) => items.map((item) => item.id === work.id ? next : item));
    this.pendingSave = next;
    this.saveStatus.set('Saving…');
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flushSave(), 350);
  }

  private async flushSave(): Promise<void> {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const pending = this.pendingSave;
    if (!pending) return;
    this.pendingSave = undefined;
    try {
      await this.library.saveWork(pending);
      const saved = await this.library.getWork(pending.id);
      if (saved) this.works.update((items) => items.map((item) => item.id === saved.id ? saved : item));
      if (this.activeId() === pending.id) this.saveStatus.set('Saved on this device');
    } catch {
      this.saveStatus.set('Save failed. Your current text is still in this tab.');
    }
  }

  async createWork(kind?: WorkKind): Promise<void> {
    await this.flushSave();
    const selectedFilter = this.filter();
    const selectedKind: WorkKind = kind ?? (selectedFilter === 'all' || selectedFilter === 'trash' ? 'document' : selectedFilter);
    const work = await this.library.createWork(selectedKind);
    const works = await this.library.listWorks(true);
    this.works.set(works);
    this.filter.set(selectedKind);
    this.activate(work);
    this.toast(`${this.labels[selectedKind]} created.`);
  }

  async duplicateWork(): Promise<void> {
    const work = this.activeWork();
    if (!work) return;
    await this.flushSave();
    const copy = await this.library.duplicateWork(work);
    this.works.set(await this.library.listWorks(true));
    this.activate(copy);
    this.toast('Draft duplicated.');
  }

  async moveToTrash(): Promise<void> {
    const work = this.activeWork();
    if (!work || work.deletedAt) return;
    await this.flushSave();
    const deleted = { ...work, deletedAt: Date.now(), updatedAt: Date.now() };
    await this.library.saveWork(deleted);
    let works = await this.library.listWorks(true);
    if (!works.some((item) => !item.deletedAt)) {
      await this.library.createWork('document');
      works = await this.library.listWorks(true);
    }
    this.works.set(works);
    this.filter.set('all');
    this.activate(works.find((item) => !item.deletedAt) as WorkRecord);
    this.toast('Moved to trash.');
  }

  async restoreWork(): Promise<void> {
    const work = this.activeWork();
    if (!work?.deletedAt) return;
    const restored = { ...work };
    delete restored.deletedAt;
    await this.library.saveWork(restored);
    this.works.set(await this.library.listWorks(true));
    this.filter.set('all');
    this.activate((await this.library.getWork(work.id)) ?? restored);
    this.toast('Draft restored.');
  }

  async addChapter(): Promise<void> {
    const work = this.activeWork();
    if (!work || work.kind !== 'book') return;
    await this.flushSave();
    const chapter: Chapter = { id: crypto.randomUUID(), title: `Chapter ${(work.chapters?.length ?? 0) + 1}`, text: '' };
    const next = { ...work, chapters: [...(work.chapters ?? []), chapter], activeChapterId: chapter.id };
    await this.library.saveWork(next);
    this.works.set(await this.library.listWorks(true));
    this.activate((await this.library.getWork(work.id)) ?? next);
  }

  async selectChapter(chapter: Chapter): Promise<void> {
    const work = this.activeWork();
    if (!work) return;
    await this.flushSave();
    const updated = { ...work, activeChapterId: chapter.id };
    await this.library.saveWork(updated);
    this.works.set(await this.library.listWorks(true));
    this.activate((await this.library.getWork(work.id)) ?? updated);
  }

  async moveChapter(chapter: Chapter, direction: -1 | 1): Promise<void> {
    const work = this.activeWork();
    if (!work?.chapters) return;
    const chapters = [...work.chapters];
    const index = chapters.findIndex((item) => item.id === chapter.id);
    const destination = index + direction;
    if (destination < 0 || destination >= chapters.length) return;
    [chapters[index], chapters[destination]] = [chapters[destination], chapters[index]];
    const next = { ...work, chapters };
    await this.library.saveWork(next);
    this.works.set(await this.library.listWorks(true));
    this.activate((await this.library.getWork(work.id)) ?? next);
  }

  updateChapterTitle(chapter: Chapter, title: string): void {
    const work = this.activeWork();
    if (!work?.chapters) return;
    const chapters = work.chapters.map((item) => item.id === chapter.id ? { ...item, title } : item);
    const next = { ...work, chapters };
    this.works.update((items) => items.map((item) => item.id === work.id ? next : item));
    this.pendingSave = next;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flushSave(), 350);
  }

  onRomanChange(value: string): void {
    this.romanDraft = value;
    this.selectedCandidateIndex = -1;
  }

  async saveCorrection(candidate: CompositionCandidate): Promise<void> {
    const work = this.activeWork();
    if (!work || work.language === 'native' || candidate.label === 'Keep Roman' || candidate.romanText !== this.romanDraft.trim()) return;
    const language = work.language;
    await this.library.saveCorrection(language, candidate.romanText, candidate.text);
    this.corrections.set(await this.library.listCorrections(language));
    this.toast('Saved as your private correction.');
  }

  insertCandidate(candidate: CompositionCandidate): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;
    const work = this.activeWork();
    if (!work || work.language === 'native' || candidate.language !== work.language || candidate.romanText !== this.romanDraft.trim() || !this.candidates.some((item) => item.id === candidate.id)) {
      this.toast('That candidate is out of date. Review the current suggestions.');
      return;
    }
    const [start, end] = this.graphemeSafeRange(editor.value, editor.selectionStart, editor.selectionEnd);
    const prefix = editor.value.slice(0, start);
    const needsSpace = prefix.length > 0 && !/\s$/u.test(prefix) && !/^\s/u.test(candidate.text);
    const insertion = `${needsSpace ? ' ' : ''}${candidate.text.normalize('NFC')} `;
    const beforeText = editor.value;
    editor.setRangeText(insertion, start, end, 'end');
    const afterText = editor.value.normalize('NFC');
    const afterCaret = start + insertion.length;
    this.compositionUndoStack.push({ beforeText, afterText, beforeStart: start, beforeEnd: end, afterCaret });
    this.compositionRedoStack.length = 0;
    editor.value = afterText;
    this.editorText = afterText;
    this.scheduleSave();
    editor.focus();
    this.romanDraft = '';
    this.selectedCandidateIndex = 0;
  }

  composerKeydown(event: KeyboardEvent): void {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.candidates.length) {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.selectedCandidateIndex = this.selectedCandidateIndex < 0
        ? direction > 0 ? 0 : this.candidates.length - 1
        : (this.selectedCandidateIndex + direction + this.candidates.length) % this.candidates.length;
      this.candidateButtons?.get(this.selectedCandidateIndex)?.nativeElement.focus();
      return;
    }
    if (event.key === 'Enter' && this.candidates.length) {
      event.preventDefault();
      this.insertCandidate(this.candidates[this.selectedCandidateIndex] ?? this.candidates[0]);
    }
  }

  candidateKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    this.selectedCandidateIndex = (index + direction + this.candidates.length) % this.candidates.length;
    this.candidateButtons?.get(this.selectedCandidateIndex)?.nativeElement.focus();
  }

  undoComposition(): void {
    const editor = this.editorRef?.nativeElement;
    const edit = this.compositionUndoStack.pop();
    if (!editor || !edit) return;
    this.compositionRedoStack.push(edit);
    editor.value = edit.beforeText;
    editor.setSelectionRange(edit.beforeStart, edit.beforeEnd);
    this.editorText = edit.beforeText;
    this.scheduleSave();
  }

  redoComposition(): void {
    const editor = this.editorRef?.nativeElement;
    const edit = this.compositionRedoStack.pop();
    if (!editor || !edit) return;
    this.compositionUndoStack.push(edit);
    editor.value = edit.afterText;
    editor.setSelectionRange(edit.afterCaret, edit.afterCaret);
    this.editorText = edit.afterText;
    this.scheduleSave();
  }

  editorKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'z') return;
    if (event.shiftKey && this.canRedoComposition) {
      event.preventDefault();
      this.redoComposition();
    } else if (!event.shiftKey && this.canUndoComposition) {
      event.preventDefault();
      this.undoComposition();
    }
  }

  private graphemeSafeRange(text: string, start: number, end: number): [number, number] {
    if (typeof Intl.Segmenter !== 'function') return [start, end];
    const boundaries = [0, ...Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.index), text.length];
    const before = boundaries.filter((boundary) => boundary <= start).at(-1) ?? 0;
    const after = boundaries.find((boundary) => boundary >= end) ?? text.length;
    if (start === end) {
      const next = boundaries.find((boundary) => boundary >= start) ?? text.length;
      return start - before <= next - start ? [before, before] : [next, next];
    }
    return [before, after];
  }

  async copyText(): Promise<void> {
    if (!this.editorText) return this.toast('Write something first.');
    try {
      await navigator.clipboard.writeText(this.editorText.normalize('NFC'));
      this.toast('Native Unicode copied.');
    } catch {
      this.toast('Clipboard is unavailable in this context.');
    }
  }

  async shareText(): Promise<void> {
    if (!this.editorText) return this.toast('Write something first.');
    if (!navigator.share) return this.copyText();
    try {
      await navigator.share({ title: this.titleDraft, text: this.editorText.normalize('NFC') });
    } catch (error) {
      if (error instanceof DOMException && error.name !== 'AbortError') this.toast('Sharing was unavailable.');
    }
  }

  exportText(format: 'txt' | 'md' | 'html'): void {
    const work = this.activeWork();
    if (!work) return;
    const content = this.editorText.normalize('NFC');
    const body = format === 'html'
      ? `<!doctype html><meta charset="utf-8"><title>${this.escapeHtml(this.titleDraft)}</title><article><h1>${this.escapeHtml(this.titleDraft)}</h1><p>${this.escapeHtml(content).replace(/\n/g, '<br>')}</p></article>`
      : format === 'md' ? `# ${this.titleDraft}\n\n${content}` : content;
    const blob = new Blob([body], { type: format === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' });
    this.download(blob, `${this.safeFilename(this.titleDraft)}.${format}`);
  }

  printDocument(): void {
    window.print();
  }

  async importFile(file?: File): Promise<void> {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return this.toast('Import is limited to 10 MB.');
    try {
      let text = await file.text();
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'html' || extension === 'htm') {
        const parsed = new DOMParser().parseFromString(text, 'text/html');
        parsed.querySelectorAll('script,style,iframe,object,embed,form').forEach((node) => node.remove());
        text = parsed.body.innerText;
      } else if (extension === 'docx') {
        return this.toast('DOCX import is not enabled in this build. Export as HTML or plain text first.');
      }
      const selectedFilter = this.filter();
      const kind: WorkKind = selectedFilter === 'all' || selectedFilter === 'trash' ? 'document' : selectedFilter;
      const work = await this.library.createWork(kind);
      const imported = { ...work, title: file.name.replace(/\.[^.]+$/, '').slice(0, 120), text: text.normalize('NFC') };
      await this.library.saveWork(imported);
      this.works.set(await this.library.listWorks(true));
      this.filter.set(imported.kind);
      this.activate((await this.library.getWork(imported.id)) ?? imported);
      this.toast('File imported as plain text.');
    } catch {
      this.toast('This file could not be imported.');
    }
  }

  async downloadBackup(): Promise<void> {
    try {
      const blob = await this.library.exportBackup(this.activeId());
      this.download(blob, `lekhoni-library-${new Date().toISOString().slice(0, 10)}.json`);
    } catch {
      this.toast('Backup could not be created.');
    }
  }

  chooseBackup(file?: File): void {
    if (!file) return;
    this.pendingBackup.set(file);
    this.restoreOpen.set(true);
  }

  async confirmRestore(): Promise<void> {
    const file = this.pendingBackup();
    if (!file) return;
    try {
      const backup = await this.library.restoreBackup(file);
      this.works.set(await this.library.listWorks(true));
      this.filter.set('all');
      const selected = this.works().find((work) => work.id === backup.activeId && !work.deletedAt) ?? this.works().find((work) => !work.deletedAt);
      if (selected) this.activate(selected);
      this.restoreOpen.set(false);
      this.pendingBackup.set(null);
      this.toast('Library restored.');
    } catch {
      this.restoreOpen.set(false);
      this.toast('Backup is invalid, unsupported, or too large. Your library was not changed.');
    }
  }

  cancelRestore(): void {
    this.pendingBackup.set(null);
    this.restoreOpen.set(false);
  }

  async showRecovery(): Promise<void> {
    const work = this.activeWork();
    if (!work) return;
    this.snapshots.set(await this.library.recover(work.id));
    this.recoveryOpen.set(true);
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots().find((item) => item.id === snapshotId);
    const work = this.activeWork();
    if (!snapshot || !work) return;
    this.editorText = snapshot.text;
    this.titleDraft = snapshot.title;
    this.recoveryOpen.set(false);
    this.scheduleSave();
    this.toast('Recovery snapshot restored.');
  }

  async addSource(): Promise<void> {
    if (!this.sourceTitle.trim()) return;
    const source: SourceRecord = {
      id: crypto.randomUUID(), title: this.sourceTitle.trim(), authors: this.sourceAuthors.trim(),
      year: this.sourceYear.trim(), doi: this.sourceDoi.trim(), url: this.sourceUrl.trim(),
      verificationStatus: 'unreviewed', updatedAt: Date.now(),
    };
    await this.library.saveSource(source);
    this.sources.set(await this.library.listSources());
    this.sourceTitle = '';
    this.sourceAuthors = '';
    this.sourceYear = '';
    this.sourceDoi = '';
    this.sourceUrl = '';
    this.toast('Source saved as unverified.');
  }

  insertCitation(source: SourceRecord): void {
    const author = source.authors.split(/[;,]/u)[0]?.trim() || source.title;
    const marker = `(${author}${source.year ? `, ${source.year}` : ''})`;
    this.editorText = `${this.editorText}${this.editorText && !/\s$/u.test(this.editorText) ? ' ' : ''}${marker}`;
    this.scheduleSave();
    this.toast('Citation marker inserted. Review formatting before publication.');
  }

  async addNote(): Promise<void> {
    const work = this.activeWork();
    if (!work || !this.noteText.trim()) return;
    const note: ResearchNote = { id: crypto.randomUUID(), workId: work.id, kind: this.noteKind, text: this.noteText.trim(), locator: '', updatedAt: Date.now() };
    await this.library.saveNote(note);
    this.notes.set(await this.library.listNotes(work.id));
    this.noteText = '';
  }

  async openRecoveryForWork(work: WorkRecord): Promise<void> {
    await this.selectWork(work);
    await this.showRecovery();
  }

  applyFinding(finding: ProofingFinding): void {
    if (!finding.replacement) return;
    this.editorText = `${this.editorText.slice(0, finding.offset)}${finding.replacement}${this.editorText.slice(finding.offset + finding.length)}`;
    this.scheduleSave();
  }

  replaceAll(): void {
    if (!this.searchText) return;
    this.editorText = this.editorText.split(this.searchText).join(this.replaceText);
    this.scheduleSave();
  }

  trackById(_index: number, item: { id: string }): string { return item.id; }
  exportName(extension: string): string { return `${this.safeFilename(this.titleDraft)}.${extension}`; }

  private toast(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastMessage.set(''), 2400);
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private safeFilename(value: string): string {
    return value.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 100) || 'lekhoni-document';
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  }
}