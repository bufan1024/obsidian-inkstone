# Reading workflow upgrade

User-authorized goal: implement the remaining improvements and small features discussed on 2026-10-23, automatically commit and merge verified batches, then verify main CI and publish updated distribution artifacts.

## Constraints

- Keep the existing checkout, CSS theme independence, local-only processing and persisted HTML/footnote format. No new runtime dependencies.
- Preserve source/view/full-snapshot write protection, shared footnotes and native undo. Recovered drafts never reuse stale offsets.
- Keep complex/cross-paragraph Markdown annotation, multi-step annotation history, AI, automatic excerpt synchronization, permanent vault indexing and dark mode out of scope.
- Desktop simulation is not mobile or physical e-ink proof. Record actual devices/versions, failures and unverified boundaries honestly.
- Default interface stays Chinese; English is an explicit setting. Color aliases change labels only, never stored markup.
- Publish once after the functional batches are stable; this also delivers PR #2 fixes without two successive release cycles. Never replace old release assets.

## Work and verification

- [x] Batch 1: improve selection diagnostics; current-note quote/thought search and thoughts-only filter; previous/next annotation commands; optional color labels; session-only draft recovery; excerpt timestamps and heading source context; manually collect selected notes/folders. Tests cover protected selections, stale actions, filters/focus, navigation boundaries, copied/recovered drafts, literal text export and source-safe links.
- [x] Batch 2: Chinese/English interface without changing command IDs; concise reading/theme versus annotation documentation; narrow animation overrides; native print/overflow/focus checks; measure 500/2000-annotation UI before adding performance mechanisms; Windows installer CI and reproducible device/lowest-version checklist. No physical-device pass without hardware.
- [ ] Each batch: build committed artifacts; JS/Python suites; performance benchmark; isolated native interaction/theme checks; independent review; narrow commit/PR; merge only the pinned tested head; verify main push CI.
- [ ] Release: bump plugin/theme-kit versions appropriately, export the standalone plugin repository from the source of truth, verify independent build/tests and package bytes, publish new releases, check downloaded artifacts and directory status without overstating approval or synchronization.

## Shared interfaces

- `plugin.t(chineseSource, params?)` supplies interface translations; callers/tests without it keep current Chinese text.
- `plugin.annotationLabel(record)` resolves a color alias or localized default. Stored color classes stay unchanged.
- Excerpt rendering is a pure helper consuming records, verified heading positions, timestamp, and host-generated source links; single-note and batch export share it.
- Drafts are bounded session memory with file path, quote, thought and style only. Explicit cancel clears drafts; incidental source invalidation may retain text but never permission to write.

Progress/evidence: `.qa/reading-workflow-goal/progress.md` (ignored local execution ledger); durable validation results belong in `VALIDATION.md` before merging.

Delivery ruling: functional and UI/documentation batches share a single reviewed release PR, followed by the generated distribution PR. This keeps the new modules, build artifacts and release versions atomic.
