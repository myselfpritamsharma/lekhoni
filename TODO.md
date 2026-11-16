# Lekhoni Remaining Work

This is the working backlog for turning the current Angular foundation into the v1 MVP described in [Lekhoni-MVP-Architecture-Plan.html](Lekhoni-MVP-Architecture-Plan.html). Keep this file current as work lands. Do not mark a feature complete until its acceptance checks pass.

## Current State

- Angular 22 standalone workspace, responsive writing shell, strict TypeScript configuration, and production service-worker configuration exist.
- Dexie stores works, sources, research notes, bounded recovery snapshots, and pair-specific translation corrections. The earlier prototype's local data and version-1 JSON backups have migration paths.
- Document, book, poem, essay, and academic work records exist. Books support basic chapter creation and reordering; works support search, duplication, trash, restore, and autosave.
- The composer loads versioned seed packs marked unreviewed plus a heuristic fallback. The release lookup blocks packs until license, provenance, and native-review metadata are approved.
- Writing checks cover repeated spaces, adjacent repeated words, and control characters only.
- Import/export currently covers bounded text/HTML input, TXT/Markdown/HTML output, browser print, and versioned JSON backup. DOCX and the planned ZIP archive are not implemented.
- Academic support currently covers source/note capture and basic author-date markers; it does not produce formatted citations or bibliographies.
- Node 24.20.0 and npm 11.19.0 are installed; npm resolves dependencies and `package-lock.json` is present. PowerShell's `npm.ps1` shim is blocked by execution policy, so use the Node-hosted npm CLI or configure PATH/command shims. The production build and 11 unit tests pass; the build warns that the initial bundle and component CSS exceed their warning budgets. Browser smoke checks verify both script modes and exact copy/share-fallback payloads.

## P0: Prove the Primary Workflow

- [x] Install and verify the required Node 24.x and npm toolchain; resolve `package-lock.json`.
- [x] Run the Angular production build and unit tests; repair all compiler, template, and test failures.
- [x] Add versioned pack manifests, provenance/review schema, catalog validation, and a release lookup gate.
- [ ] Replace the heuristic fallback with a versioned, licensed, native-reviewed Bengali/Hindi phonetic data pack.
- [ ] Blocked on selecting redistributable source data and obtaining native-review sign-off; seed packs must remain release-disabled until then.
- [x] Add candidate ranking, correction memory, grapheme-safe caret composition, stale-candidate protection, and one-step undo.
- [x] Verify keyboard selection, explicit language mode, NFC commit, and exact copy/share-fallback payloads for both scripts in the local browser.
- [ ] Verify paste into representative messaging, email, social, CMS, and office targets on physical devices.
- [ ] Complete the language-data and transliteration-package license/provenance review before shipping data; legal and native-review sign-off are still pending. See [docs/language-data-review.md](docs/language-data-review.md).

## P1: Data Safety and the Rich Editor

- [ ] Replace the plain-text editor with the reviewed ProseMirror schema and Angular editor integration; prove Angular compatibility before adopting `ngx-editor`.
- [ ] Persist canonical structured editor content and derived plain-text projections; support headings, lists, quotes, code, links, notes, tables, figures, and safe media cards.
- [ ] Finish IndexedDB schema migrations, repository tests, optimistic revisions, and multi-tab conflict-copy behavior.
- [ ] Add validated Blob asset storage, hashing/deduplication, quota visibility, orphan cleanup, and accessible asset fallbacks.
- [ ] Replace JSON-only backup with the report's bounded `.lekhoni` ZIP format using `fflate`; validate paths, sizes, counts, ratios, hashes, and restore transactions.
- [ ] Add recovery mode for database-open/migration failures; never silently reset user data.
- [ ] Verify backup/restore and migrations in a fresh browser profile, including Unicode, sources, notes, chapters, and binary fixtures.

## P2: Writing and Sharing

- [ ] Finish document actions: rename, duplicate, autosave status, recovery, soft-delete/restore, and conflict recovery tests.
- [ ] Add book chapter rename, safe switching, deletion policy, keyboard reordering, and restart-order tests.
- [ ] Verify poem stanza/blank-line fidelity and essay word-count/reading-time behavior.
- [ ] Add the complete Roman composer to every work mode with accessible candidate navigation and explicit Keep Roman behavior.
- [ ] Add previewed selection/document sharing, Unicode clipboard fallback, Web Share file support, and cancellation tests.
- [ ] Add focus mode and document formatting commands after the structured editor is established.

## P3: Language and Proofing

- [ ] Build the reproducible language-pack pipeline with pinned sources, checksums, attribution, normalization, sharding, and size/latency budgets.
- [ ] Implement all six supporting dictionary directions behind a worker and reviewed, licensed datasets.
- [ ] Add correction/translation-memory management without modifying signed base packs.
- [ ] Add English grammar/spelling through a local worker and a reviewed, licensed Bengali/Hindi spelling layer where available.
- [ ] Add proofing finding actions, ignore rules, personal dictionary, revision-safe ranges, undo, and accessibility behavior.
- [ ] Keep all proofing and language work offline; verify with network requests blocked.

## P4: Academic and Research

- [ ] Expand the five academic templates into editable, reorderable structured sections.
- [ ] Add source editing, verification state, duplicate detection, tags, and research-note locators/relationships.
- [ ] Implement BibTeX, RIS, and CSL-JSON import/export with provenance and validation.
- [ ] Resolve the `citeproc` CPAL/AGPL licensing decision before selecting a CSL processor.
- [ ] Add citation clusters, reviewed styles/locales, derived bibliographies, and golden tests.
- [ ] Add explicit, cancellable Crossref search; keep OpenAlex optional and send only user-confirmed query fields.
- [ ] Preflight broken references and require source review before treating imported/provider metadata as verified.

## P5: Import, Export, and Hardening

- [ ] Add safe Markdown and DOCX import with conversion reports; sanitize HTML and map imports into the controlled editor schema.
- [ ] Add DOCX export and improve PDF/print, HTML, Markdown, and text fidelity for formatting, citations, tables, assets, and poem boundaries.
- [ ] Add hostile-file, archive, asset, quota, and worker-resource tests with explicit size/time limits.
- [ ] Test current Chromium, Firefox, WebKit, mobile browsers, offline reload, storage pressure, and update recovery.
- [ ] Complete keyboard and screen-reader workflows; run axe/WCAG checks and resolve critical/serious findings.
- [ ] Add production CSP/security headers, privacy/help/license notices, dependency audit, SBOM, and data-minimizing diagnostics.
- [ ] Enforce bundle, latency, memory, and performance budgets.
- [ ] Reduce the current initial JavaScript bundle (963.51 kB raw) and component stylesheet (15.89 kB) below configured warning budgets.

## P6: Beta and Release

- [ ] Set up CI for deterministic install, formatting, lint, strict build, unit tests, language/citation goldens, Playwright, accessibility, and license/provenance gates.
- [ ] Deploy preview and staging; test service-worker updates and rollback without data loss.
- [ ] Run a multilingual and academic-user beta; resolve all P0 data-loss/security and P1 blocked-workflow defects.
- [ ] Publish release notes and verify the v1.0 smoke suite and rollback runbook.

## Definition of Done

- [ ] No open P0 data-loss/security defect or P1 blocked workflow.
- [ ] Critical user journeys pass in Chromium, Firefox, and WebKit, including offline use.
- [ ] Bengali/Hindi Unicode survives save/reload, undo/redo, copy/paste, share, backup/restore, and every supported export.
- [ ] Backup and restore preserve all supported records and assets and reject unsafe or mismatched archives.
- [ ] Language, proofing, citation, licensing, privacy, accessibility, performance, and deployment gates in the architecture report pass.