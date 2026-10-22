# OpenDesign reading refinement implementation plan

> **For agentic workers:** Use the existing checkout and parallel file ownership; verify behavior before completion.

**Goal:** Apply the eight reviewed optimization areas to Inkstone while keeping its light, Chinese long-form reading identity.

**Architecture:** Keep the pure CSS theme independent. Refine existing variables and components; optimize the existing annotation parser and sidebar without changing persisted markup. Keep thought drafts in the current popover session rather than writing them to notes before save.

**Tech stack:** CSS, dependency-free CommonJS, Python installer, native Obsidian QA via Playwright/CDP.

**Spec:** The preceding eight-point audit accepted by the user's request to optimize with OpenDesign. Design references: Paper (3306e19), Editorial (f67fc5a), Minimal (6c4ce30) from nexu-io/open-design, read on 2026-10-22.

## Constraints and design decisions

- Retain white backgrounds, device-local serif reading fonts, native font controls, 1.75 line height and 40em default readable width.
- Apply OpenDesign's whitespace-first hierarchy, 4/8/12/16/24/32 spacing and clear component states; adapt to grayscale and e-ink.
- Retain Obsidian >=1.10.6, public production APIs, independent theme/plugin installation, no network/runtime dependencies.
- Preserve persisted annotations, footnotes, undo and full view/file/snapshot write validation.
- Use branch codex/open-design-refinement in this checkout; no publishing or user-vault installation is required.

## Review focus

- Desktop wide window with a narrow Markdown pane must keep useful reading width.
- Native loading and notification actions must stay perceptible.
- Explicit image height and native font settings must retain precedence.
- Protected Markdown/HTML, CRLF and shared footnotes must keep identical parser semantics.
- Editing a thought must survive incidental scrolling without allowing stale writes.

## Task 1: Theme and component refinement

- [x] Add native behavioral checks for notice contrast, visible loading state, explicit image dimensions, pane-relative margins, links and annotation visual distinction, native font controls and plugin component sizing; run against the old theme to establish failures.
- [x] Fix notice-local colors, replace destructive loading-animation behavior with static visible loading indicators, scope automatic image heights, use Markdown pane containers for responsive margins and heading sizes.
- [x] Refine shared typography/spacing/focus and resolved-link decoration; preserve high contrast and touch targets.
- [x] Run native checks against the updated theme in the isolated Inkstone Upgrade Preview vault; save representative native screenshots.

## Task 2: Annotation parsing and sidebar

- [x] Add meaningful protected-region/dense-document regressions and record a repeatable parser benchmark before optimization.
- [x] Reuse a one-pass protected-line index during parsing; preserve all existing public parser/planner outputs.
- [x] Retain the sidebar header/focus on same-note updates, avoid unnecessary rebuilds and quadratic ordinal lookup; clarify export scope in the UI.
- [x] Run all JavaScript tests, compare representative 100KB/1MB parsing measurements, and verify sidebar behavior natively.

## Task 3: Thought composer and wording

- [x] Add regressions proving incidental scroll does not destroy an edited thought, explicit cancellation still writes nothing, stale content cannot save, and Escape restores focus/scope.
- [x] Keep dirty thought composers open during incidental scroll/outside dismissal, with an explicit cancel/close path and full snapshot checks.
- [x] Unify user-visible thought vocabulary where compatible with existing command IDs; reuse existing editor components.
- [x] Run JavaScript tests and existing/new native popover checks.

## Task 4: Integration and evidence

- [x] Rebuild committed generated artifacts, run the full JS/Python suites, package and verify build reproducibility.
- [x] Run the complete isolated native regression suite and new theme checks; visually inspect updated screenshots.
- [x] Request an independent read-only final diff review and resolve material findings.
- [x] Update bilingual behavior notes, design rationale and validation evidence, distinguishing local/native checks from real mobile/e-ink device validation.
