# Lekhoni

Lekhoni is a local-first Angular 22 writing workspace for Bengali and Hindi Unicode writing. The app shell, typed domain model, IndexedDB adapter, phonetic composer, and writing checks are organized under `src/app`; the original single-file prototype remains available at the repository root for comparison.

## Requirements

- Node.js 24.15 or later in the 24.x line
- npm 10 or later

## Run

```powershell
npm install
npm start
```

Open the local URL printed by Angular CLI. Production builds enable the Angular service worker and install the app shell for offline launch.

## Verify

```powershell
npm test
npm run build
```

## Implemented in this workspace

- Standalone Angular shell with responsive library, workspaces, search, and local editor.
- IndexedDB storage for works, sources, research notes, and rolling recovery snapshots; existing prototype drafts migrate on first launch.
- Document, poem, essay, book, and academic work records; book chapter creation/reordering; duplicate, trash, restore, find/replace, and recovery snapshots.
- Bengali/Hindi phonetic composer with a small reviewed phrase set and an explicitly labeled phonetic fallback. The fallback is not a full language engine.
- Local checks for repeated spaces, repeated adjacent words, and unexpected controls. These are not Bengali/Hindi spelling or grammar proofing.
- Plain text, Markdown, HTML, and print/PDF export; bounded text/HTML import; local JSON library backup and restore with validation.
- Academic source/note capture and basic author-date markers. Citation formatting, metadata discovery, and scholarly style support are not enabled.

## Release gates still open

This is the Angular application foundation, not a v1 release. The report's ZIP archive format, rich ProseMirror schema, DOCX import/export, reviewed full language packs, English proofing, licensed Bengali/Hindi dictionaries, CSL processing, cross-tab revision conflict handling, asset/blob management, full accessibility/browser QA, and deployment security headers remain to be implemented and verified. Do not treat basic citation markers or phonetic fallback output as publication-ready.

The architecture plan is retained in `Lekhoni-MVP-Architecture-Plan.html`. Third-party citation processing and language dictionaries remain excluded until the report's license and quality gates are satisfied.