# Language Data Review Gate

**Status: Blocked.** The current Bengali/Hindi seed packs are explicitly unreviewed, have no external source records, and are not release-ready. The runtime and build-time gates reject them as approved packs.

## Inventory

- `bn-latn-bn.seed.json` and `hi-latn-hi.seed.json` contain starter examples only. They have no third-party source attribution or redistributable license assertion.
- The current phonetic fallback is project code, not a third-party transliteration package. No Sanscript dependency is installed in this workspace.
- No Bengali/Hindi native reviewer, reviewed corpus, or license approval record is currently attached to the project.

## Required Before Approval

- [ ] Select an authoritative, redistributable dataset for each language pair and record its exact release/revision and source URL.
- [ ] Review the dataset license and required notices with the project owner; record the chosen SPDX identifier and notice text.
- [ ] Pin source checksums and ensure every pack entry and candidate references one or more declared source IDs.
- [ ] Build a native-reviewed corpus that covers common vocabulary, inflections, ambiguous Roman input, names, and regional variants.
- [ ] Record reviewer IDs, review date, corpus version, and acceptance results without storing personal data unnecessarily.
- [ ] If adding `@indic-transliteration/sanscript` or another engine, audit its exact package version, license, dependency tree, and behavior before adding it to `package.json`.
- [ ] Run `npm run packs:verify` and unit/golden tests after the data and review metadata are complete.
- [ ] Change `releaseStatus` from `seed` to `approved` only after every required field is present and verified.

Do not treat the sample phrases or heuristic transliteration fallback as a production language pack, native-reviewed output, or complete Bengali/Hindi transliteration engine.