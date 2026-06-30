# Nahou V2 Grammarly-Like Execution Plan

**Goal:** Execute the V2 plan in controlled, reviewable slices that first deliver V2A browser-first in-text assistance, then use the proven browser model to decide whether V2B desktop overlays are safe to productize.

**Source Plan:** `docs/v2-grammarly-like-development-plan.md`

**Current Baseline:** The repository is at the V1 completed baseline with a tracked V2 master plan. Browser extension behavior is partially V2-shaped already, but the packaged runtime still depends on `browser-extension/src/content.js`; test-only helpers in `browser-extension/src/editorSurface.js` must never be treated as shipped behavior until they are wired into the packaged runtime.

---

## Execution Assumptions

- Work stays in `C:\CodexProjects\Alfaraheedi`, not the historical OneDrive checkout.
- V2A remains browser-first. Desktop overlay and Office inline claims stay out of V2A.
- The base branch remains `release/v1.0` unless the repository owner chooses a new `main` or `v2/main` policy.
- The current planning branch is `codex/v2-grammarly-like-development-plan`.
- This execution plan should be merged before code implementation starts.
- Every implementation workstream gets its own branch, focused tests, commits, PR review, and CI.
- Subagents are useful for isolated implementation, review, and evidence lanes, but browser runtime slices that share `content.js` must be sequenced to avoid conflicts.
- Public docs and release artifacts must not include raw user text, private account details, screenshots with private content, secrets, or internal local machine paths unless explicitly public-safe.

## Definition Of Done

V2A is done when Nahou can truthfully claim:

> Nahou checks supported browser text fields as you type, shows local-first suggestions directly in the field, and applies accepted deterministic suggestions in place when the original text still matches.

The claim is only valid after all of these are complete:

- V2 public contract and acceptance matrix are source-controlled.
- Browser extension modules are split so shipped `content.js` uses the same tested logic as the test seams.
- Supported and unsupported field types are explicit and tested.
- Text projection maps plain text offsets to DOM ranges safely for supported contenteditable surfaces.
- Textarea/input underlines, contenteditable highlights, field badge, suggestion card, and keyboard interactions are implemented and tested.
- Apply is anchored to editor identity, projection version, and original text match.
- Paused/site-disabled settings prevent editor text from being sent to the local API.
- Engine/eval improvements make the browser UX useful without overclaiming grammar coverage.
- Privacy, store, and security docs match actual extension behavior.
- Controlled browser QA passes.
- Real-site/manual QA exists for every real-site claim, or unsupported sites are documented as limitations.
- `StoreReady` is not claimed unless external account-side store gates are actually complete.

V2B is done only after V2A, and starts with evidence rather than a product claim.

## Branch And Worktree Strategy

### Planning Branch

Keep this execution plan on:

- `codex/v2-grammarly-like-development-plan`

After review, merge the planning branch through the normal PR path.

### Integration Branch

Create the V2A integration branch after the planning docs are accepted:

```powershell
git switch release/v1.0
git pull --ff-only origin release/v1.0
git switch -c codex/v2a-browser-first-integration
git merge --no-ff codex/v2-grammarly-like-development-plan
git push -u origin codex/v2a-browser-first-integration
```

If the planning branch is merged into `release/v1.0` first, create the integration branch directly from the updated `release/v1.0`.

### Workstream Branches

Create each implementation branch from the current integration branch:

- `codex/v2a-contract-and-grounding`
- `codex/v2a-extension-architecture`
- `codex/v2a-field-discovery-projection`
- `codex/v2a-underlines-badge-card`
- `codex/v2a-anchored-apply`
- `codex/v2a-local-connection-ux`
- `codex/v2a-engine-evals`
- `codex/v2a-privacy-security-store`
- `codex/v2a-qa-evidence`
- `codex/v2a-release-candidate`
- `codex/v2b-desktop-overlay-spike`
- `codex/v2-office-inline-proof` only if Office is explicitly rescoped.

Recommended worktree root:

```text
C:\CodexProjects\Alfaraheedi-worktrees\
```

Example worktree command:

```powershell
git -C C:\CodexProjects\Alfaraheedi worktree add C:\CodexProjects\Alfaraheedi-worktrees\v2a-extension-architecture -b codex/v2a-extension-architecture codex/v2a-browser-first-integration
```

Remove a worktree only after confirming it is clean and its branch is merged or intentionally abandoned:

```powershell
git -C C:\CodexProjects\Alfaraheedi-worktrees\v2a-extension-architecture status --short
git -C C:\CodexProjects\Alfaraheedi worktree remove C:\CodexProjects\Alfaraheedi-worktrees\v2a-extension-architecture
```

## Subagent Operating Model

Use a main coordinator plus fresh subagents for bounded lanes.

### Coordinator Responsibilities

The main session owns:

- branch creation and integration order;
- resolving cross-workstream conflicts;
- deciding when a subagent task is narrow enough;
- reviewing subagent outputs before merge;
- running final local gates;
- keeping public claims aligned with evidence.

The coordinator should not delegate the immediate blocking task. While subagents run, the coordinator should work on a non-overlapping lane.

### When To Use Subagents

Use subagents for:

- codebase exploration with a precise question;
- implementation with a disjoint write set;
- RED/GREEN test creation in isolated modules;
- docs/security/release script updates that do not share files with browser runtime work;
- spec compliance reviews;
- code quality/security reviews;
- WhiteKnight/Agent-Dev evidence packet preparation after the scripts exist.

Do not use parallel subagents for:

- simultaneous edits to `browser-extension/src/content.js`;
- simultaneous edits to `browser-extension/src/editorSurface.js`;
- overlapping changes to release scripts and tests that assert those scripts;
- any task needing secrets, store dashboards, private accounts, or machine-wide security changes.

### Review Pattern Per Workstream

For each implementation workstream:

1. Dispatch one implementer subagent only after the workstream has a concrete write set.
2. Implementer writes RED test, verifies failure, implements, verifies pass, commits.
3. Dispatch a spec-review subagent with the workstream acceptance criteria and changed files.
4. If spec review finds gaps, the implementer fixes them and the spec reviewer re-checks.
5. Dispatch a code-quality/security review subagent after spec compliance is clean.
6. If quality review finds issues, the implementer fixes them and the reviewer re-checks.
7. Coordinator runs the smallest relevant local gate.
8. Coordinator opens or updates the PR.
9. Merge only after CI and required manual evidence are clean.

### Subagent Allocation Matrix

| Workstream | Subagent Use | Reason | Write Scope | Parallel Policy |
| --- | --- | --- | --- | --- |
| Contract and grounding | Worker plus spec reviewer | Mostly docs/tests and claim guards | `docs/public`, `docs/testing`, `docs/security`, `README.md`, `frontend/src/__tests__/releasePackaging.test.js` | Can run before code |
| Extension architecture split | Worker, then strict review | Large but bounded refactor | `browser-extension/src/content.js`, new extension modules, browser extension tests | Serial only |
| Field discovery and projection | Worker after architecture | Logic is testable and module-bounded | `editorDiscovery.js`, `textProjection.js`, discovery/projection tests | Serial with browser runtime |
| Underlines, badge, card | Worker after projection | Visual behavior and keyboard UX | `overlayLayer.js`, `suggestionCard.js`, `content.css`, tests | Serial with browser runtime |
| Anchored apply | Worker after projection/card | Safety-critical apply logic | `suggestionAnchors.js`, `applySuggestion.js`, tests | Serial with browser runtime |
| Local connection UX | Worker or main | Mostly settings/background/popup/options | `background.js`, `localApi.js`, `settings.js`, popup/options files/tests | Can run after architecture if no `content.js` edits |
| Engine/eval | Worker | Rust/data lane is disjoint from extension UI | `crates/write-*`, `datasets/eval`, `docs/evaluation.md` | Parallel with browser UI |
| Privacy/security/store | Worker plus security reviewer | Docs/scripts lane, high policy risk | privacy docs, store docs, readiness scripts/tests | Parallel draft, final after behavior |
| QA evidence scripts | Worker | Script/report lane after UI behavior exists | `scripts/qa-*`, testing docs, report checkers | Parallel after browser UI |
| Release candidate | Coordinator-led | Cross-cutting gates and versioning | version files, changelog/release docs, package artifacts | Serial final gate |
| V2B overlay spike | Worker plus reviewer | Disjoint from browser after V2A | `src-tauri/src/uia_overlay_probe.rs`, QA script, research doc | Starts after V2A RC |
| Office proof | Separate worker only if rescoped | Separate product and sideload gate | `office-addins/`, Office scripts/docs | Separate from V2A |

## Phase 0: Planning And Repository Setup

**Owner:** Coordinator.

**Purpose:** Make the plans durable and prepare the integration branch.

**Files:**

- `docs/v2-grammarly-like-development-plan.md`
- `docs/v2-grammarly-like-execution-plan.md`

**Steps:**

1. Confirm the planning branch is clean.
2. Commit this execution plan.
3. Push the planning branch.
4. Open or update the planning PR.
5. After approval, create `codex/v2a-browser-first-integration`.
6. Confirm `git status --short --branch` is clean on integration.

**Verification:**

```powershell
git diff --check
git status --short --branch
```

**Exit Criteria:**

- Both V2 plan docs are tracked.
- The integration branch exists or the PR is ready to merge before implementation starts.

## Phase 1: V2A Contract And Claim Gates

**Recommended Branch:** `codex/v2a-contract-and-grounding`

**Recommended Subagents:**

- Implementer subagent for docs and release claim tests.
- Spec-review subagent to check every V2 public claim and non-claim.
- Code-quality reviewer only after spec review passes.

**Files:**

- Create `docs/public/v2-product-contract.md`.
- Create `docs/testing/v2-acceptance-matrix.md`.
- Create `docs/security/v2-browser-extension-threat-model.md`.
- Create `docs/security/v2-browser-extension-privacy-review.md`.
- Modify `README.md`.
- Modify `docs/release-checklist.md`.
- Modify `frontend/src/__tests__/releasePackaging.test.js`.

**RED Proof:**

Add failing assertions to `frontend/src/__tests__/releasePackaging.test.js` proving:

- `docs/public/v2-product-contract.md` exists.
- The V2 contract includes the V2A browser-first claim.
- The V2 contract includes explicit non-claims for desktop-wide live overlays, Office live underlines, hosted processing, store approval, and full grammar checking.
- The acceptance matrix includes textarea/input, contenteditable, stale apply, sensitive-field exclusion, paused/site-disabled, API unavailable, IME, RTL/mixed text, and real-site/manual-gated rows.
- README does not claim "works everywhere", "complete grammar checker", or desktop-wide live underlines.

**Implementation Steps:**

1. Write the failing release-packaging assertions.
2. Run the focused test and confirm failure.
3. Add the V2 contract docs and acceptance matrix.
4. Add threat model and privacy review skeletons with concrete V2A data flow.
5. Update README and release checklist with bounded V2A language.
6. Re-run the focused test.
7. Run doc hygiene.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run releasePackaging.test.js --minWorkers=1 --maxWorkers=2
cd C:\CodexProjects\Alfaraheedi
git diff --check
```

**Exit Criteria:**

- V2 claims are explicit and bounded.
- V2B and Office are documented as separate gates.
- No implementation claim exceeds evidence.

## Phase 2: Browser Extension Architecture Split

**Recommended Branch:** `codex/v2a-extension-architecture`

**Recommended Subagents:**

- One implementer subagent, serial only.
- Spec reviewer focused on "packaged runtime uses extracted modules".
- Code-quality reviewer focused on duplication, module boundaries, and regressions.

**Files:**

- Modify `browser-extension/src/content.js`.
- Modify `browser-extension/src/editorSurface.js`.
- Create `browser-extension/src/editorDiscovery.js`.
- Create `browser-extension/src/textProjection.js`.
- Create `browser-extension/src/suggestionAnchors.js`.
- Create `browser-extension/src/overlayLayer.js`.
- Create `browser-extension/src/suggestionCard.js`.
- Create `browser-extension/src/applySuggestion.js`.
- Modify `browser-extension/tools/package-extension.mjs` only if package inclusion needs updating.
- Modify `frontend/src/__tests__/browserExtension.test.js`.
- Create focused tests under `frontend/src/__tests__/` as modules are extracted.

**RED Proof:**

Before moving logic, add at least one failing package/runtime assertion that proves the packaged `content.js` imports or contains the extracted runtime modules as intended. The key risk is changing only `editorSurface.js`, which is not the shipped runtime.

**Implementation Steps:**

1. Identify duplicated functions between `content.js` and `editorSurface.js`.
2. Extract editor discovery first with no behavior change.
3. Extract text projection and range mapping with no behavior change.
4. Extract suggestion anchoring helpers with no behavior change.
5. Extract overlay rendering and layout sync with no behavior change.
6. Extract card/panel rendering with no behavior change.
7. Extract apply logic with no behavior change.
8. Keep `content.js` as the event orchestration layer.
9. Ensure package build includes all runtime imports.
10. Remove duplicate private copies after tests pass.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run browserExtension.test.js browserExtensionSettings.test.js browserExtensionPackage.test.js --minWorkers=1 --maxWorkers=2
cd C:\CodexProjects\Alfaraheedi
.\scripts\validate-browser-extension-release.ps1
git diff --check
```

**Exit Criteria:**

- Packaged `content.js` and tested helpers no longer diverge.
- Existing browser extension behavior is preserved.
- No new feature behavior is mixed into the refactor.

## Phase 3: Field Discovery And Text Projection

**Recommended Branch:** `codex/v2a-field-discovery-projection`

**Recommended Subagents:**

- One browser logic implementer.
- Spec reviewer focused on supported/unsupported matrix.

**Files:**

- Modify `browser-extension/src/editorDiscovery.js`.
- Modify `browser-extension/src/textProjection.js`.
- Modify `browser-extension/src/content.js` only for wiring.
- Create `frontend/src/__tests__/browserExtensionDiscovery.test.js`.
- Create `frontend/src/__tests__/browserExtensionProjection.test.js`.
- Modify `docs/testing/v2-acceptance-matrix.md`.
- Modify `browser-extension/README.md`.

**Required Behaviors:**

- Support `textarea`.
- Support input types `text`, `search`, `email`, `url`, `tel`.
- Support `contenteditable="true"`, empty `contenteditable`, and `contenteditable="plaintext-only"` when mapping is stable.
- Support open Shadow DOM event paths.
- Keep iframe coverage tied to manifest `all_frames` and local QA.
- Reject password, hidden, readonly, disabled, ARIA-disabled, ARIA-readonly, closed shadow roots, sensitive hints, sensitive ancestor labels, oversized text, and unsupported complex rich-editor islands.
- Projection must handle UTF-16 spans, emoji, Arabic/Latin mixed text, RTL text, line breaks, block boundaries, hidden decoration, non-editable islands, and production editor sentinels.
- If projection is ambiguous or unavailable, render review-only UI and disable apply.

**RED Proof:**

Add failing tests for:

- closed Shadow DOM unsupported classification;
- false-positive sensitive labels that must not exclude normal message fields;
- emoji/UTF-16 span mapping;
- RTL/mixed range mapping;
- ambiguous repeated original without trusted span;
- projection-unavailable review-only result.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run browserExtensionDiscovery.test.js browserExtensionProjection.test.js browserExtension.test.js --minWorkers=1 --maxWorkers=2
cd C:\CodexProjects\Alfaraheedi
git diff --check
```

**Exit Criteria:**

- The V2 supported-field matrix is implemented as tests.
- Unsupported editors fail closed.
- Projection is a reusable runtime seam.

## Phase 4: Underlines, Badge, And Suggestion Card

**Recommended Branch:** `codex/v2a-underlines-badge-card`

**Recommended Subagents:**

- One UI implementer after Phase 3.
- Accessibility/spec reviewer.
- Code-quality reviewer focused on layout cleanup and DOM safety.

**Files:**

- Modify `browser-extension/src/overlayLayer.js`.
- Modify `browser-extension/src/suggestionCard.js`.
- Modify `browser-extension/src/content.css`.
- Modify `browser-extension/src/content.js` wiring.
- Create `frontend/src/__tests__/browserExtensionOverlay.test.js`.
- Create `frontend/src/__tests__/browserExtensionSuggestionCard.test.js`.
- Modify `frontend/src/__tests__/browserExtension.test.js` only for shared runtime expectations.

**Required Behaviors:**

- Textarea/input underlines remain non-mutating overlay marks.
- Contenteditable uses CSS Custom Highlight when supported.
- Unsupported contenteditable highlight falls back to review-only card or no inline apply, not DOM mutation.
- Field badge appears at the lower inline-end of supported active fields.
- Badge shows issue count and local/API status.
- Clicking badge opens the suggestion card.
- Clicking an underline opens the card for the related suggestion when the range can be identified.
- Card supports keyboard open, apply, dismiss, Escape, focus return, and viewport clamping.
- UI respects RTL and mixed direction.
- UI cleans up on focusout, editor removal, successful apply, disabled state, and stale result.

**RED Proof:**

Add failing tests for:

- badge appears only for supported active editors with suggestions;
- badge issue count updates;
- badge click opens card;
- card does not steal editor text;
- keyboard dismissal returns focus;
- CSS Highlight unavailable disables inline contenteditable apply;
- viewport edge clamping.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run browserExtensionOverlay.test.js browserExtensionSuggestionCard.test.js browserExtension.test.js --minWorkers=1 --maxWorkers=2
npm run lint
cd C:\CodexProjects\Alfaraheedi
git diff --check
```

**Exit Criteria:**

- The browser interaction now visually resembles the intended Grammarly-like field experience.
- UI is keyboard accessible and cleans up reliably.
- Visual polish does not weaken apply safety.

## Phase 5: Anchored Apply And Stale Handling

**Recommended Branch:** `codex/v2a-anchored-apply`

**Recommended Subagents:**

- Safety-critical implementer.
- Spec reviewer focused on stale and wrong-editor cases.
- Code-quality/security reviewer focused on event dispatch and mutation boundaries.

**Files:**

- Modify `browser-extension/src/suggestionAnchors.js`.
- Modify `browser-extension/src/applySuggestion.js`.
- Modify `browser-extension/src/textProjection.js`.
- Modify `browser-extension/src/content.js` wiring.
- Create `frontend/src/__tests__/browserExtensionAnchoredApply.test.js`.
- Modify `docs/testing/v2-acceptance-matrix.md`.

**Required Behaviors:**

Every rendered suggestion stores:

- editor identity;
- projection version or hash;
- source rule;
- original text;
- replacement text;
- trusted UTF-16 span when available;
- mapped DOM range details when needed.

Apply must:

- re-read the editor;
- confirm the same editor identity;
- confirm projection version or hash is still valid;
- confirm original text still exists at the expected span;
- reject ambiguous repeated text without trusted span;
- use native `value` and selection APIs for textarea/input;
- use DOM Range only for stable simple contenteditable ranges;
- dispatch composed replacement-like input events;
- place caret after replacement;
- clear marks/card after success;
- show safe stale status after failure.

**RED Proof:**

Add failing tests for:

- wrong editor identity;
- changed projection hash;
- repeated original without trusted span;
- stale DOM range;
- contenteditable range mismatch;
- framework observer receives replacement input event;
- apply does not fall back to first occurrence.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run browserExtensionAnchoredApply.test.js browserExtension.test.js --minWorkers=1 --maxWorkers=2
cd C:\CodexProjects\Alfaraheedi
.\scripts\validate-browser-extension-release.ps1
git diff --check
```

**Exit Criteria:**

- Wrong-text replacement is blocked by construction.
- Stale suggestions can be displayed but cannot apply.
- Runtime and test seam agree.

## Phase 6: Local Connection UX And Settings Enforcement

**Recommended Branch:** `codex/v2a-local-connection-ux`

**Recommended Subagents:**

- Worker if Phase 2 has reduced `content.js` overlap.
- Otherwise coordinator implements to avoid conflicts.
- Privacy/spec reviewer.

**Files:**

- Modify `browser-extension/src/background.js`.
- Modify `browser-extension/src/localApi.js`.
- Modify `browser-extension/src/settings.js`.
- Modify `browser-extension/src/popup.js`.
- Modify `browser-extension/src/options.js`.
- Modify `browser-extension/popup.html`.
- Modify `browser-extension/options.html`.
- Modify `browser-extension/src/content.js` only if a content-side settings cache is required.
- Modify `frontend/src/__tests__/browserExtensionSettings.test.js`.
- Modify `browser-extension/README.md`.

**Required Behaviors:**

- Popup shows enabled/paused state.
- Popup shows local API reachable/unreachable.
- Popup shows loopback URL.
- Popup shows current site enabled/disabled.
- Options allow loopback URL, writing mode, enabled state, disabled hosts, and reset.
- Background accepts only loopback API URLs.
- Content/runtime does not send editor text while paused or site-disabled.
- Health checks never include editor text.
- Errors shown to the user are sanitized.

**RED Proof:**

Add failing tests proving:

- paused extension prevents content-side analyze messages or background API calls;
- site-disabled state prevents text transmission;
- remote API URL cannot be persisted;
- health check payload contains no editor text;
- popup displays API unavailable without raw error leakage.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run browserExtensionSettings.test.js browserExtension.test.js --minWorkers=1 --maxWorkers=2
cd C:\CodexProjects\Alfaraheedi
.\scripts\validate-browser-extension-release.ps1
git diff --check
```

**Exit Criteria:**

- Privacy-sensitive settings are enforced before text leaves the page context.
- User-facing connection state is understandable.

## Phase 7: Engine And Eval Usefulness

**Recommended Branch:** `codex/v2a-engine-evals`

**Recommended Subagents:**

- Rust/eval implementer in parallel with browser UI after Phase 1.
- Spec reviewer focused on eval fixture integrity.
- Code-quality reviewer focused on precision, protected spans, and false positives.

**Files:**

- Create `datasets/eval/v2-arabic.jsonl`.
- Create `datasets/eval/v2-mixed.jsonl`.
- Modify `crates/write-eval/src/lib.rs`.
- Modify `crates/write-eval/tests/report.rs`.
- Modify `crates/write-arabic/src/lib.rs`.
- Modify `crates/write-arabic/tests/rules.rs`.
- Modify `crates/write-mixed/src/lib.rs` and tests only if mixed behavior changes.
- Modify `docs/evaluation.md`.

**Rule Themes:**

- browser punctuation and spacing;
- Arabic/Latin mixed punctuation;
- high-precision Arabic orthography;
- public-safe exact phrase corrections;
- protected-span safety;
- name, dialect, URL, code, and technical false-positive guards.

**RED Proof:**

For every new rule family:

- add at least one failing positive fixture;
- add at least two negative fixtures for auto-apply rules;
- add a false-positive guard for suggest-only rules;
- prove `cargo run -p write-eval` blocks before implementation.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi
cargo test -p write-arabic
cargo test -p write-eval
cargo run -p write-eval
cargo clippy --workspace -- -D warnings
git diff --check
```

**Exit Criteria:**

- V2 rules improve browser usefulness without loosening release-blocking eval strictness.
- Fixtures are public-safe and metadata is complete.

## Phase 8: Privacy, Security, Store, And Public-Release Hardening

**Recommended Branch:** `codex/v2a-privacy-security-store`

**Recommended Subagents:**

- Docs/security worker can draft in parallel after Phase 1.
- Final security reviewer must run after actual V2A behavior is implemented.

**Files:**

- Modify `docs/security/v2-browser-extension-threat-model.md`.
- Modify `docs/security/v2-browser-extension-privacy-review.md`.
- Modify `browser-extension/PRIVACY_POLICY.md`.
- Modify `docs/public/browser-extension/privacy.html`.
- Modify `browser-extension/STORE_SUBMISSION.md`.
- Modify `browser-extension/MANUAL_RELEASE_GATES.md`.
- Modify `scripts/check-browser-extension-public-privacy-url.ps1` only if public dates/URLs change.
- Modify `scripts/check-public-release-hygiene.ps1` only if new tracked artifact rules are needed.
- Modify browser-extension package tests that assert privacy/store copy.

**Required Behaviors To Document:**

- active editor text is read only for supported active fields;
- local loopback API only;
- no hosted fallback;
- no telemetry;
- no retained raw editor text;
- no raw text in reports;
- sensitive-field exclusion is best-effort;
- per-site disable and pause;
- store readiness depends on account-side gates.

**RED Proof:**

Add failing package tests for any new privacy copy, store permission rationale, and release gate wording before updating docs.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi\frontend
npm test -- --run browserExtensionPackage.test.js releasePackaging.test.js --minWorkers=1 --maxWorkers=2
cd C:\CodexProjects\Alfaraheedi
.\scripts\check-public-release-hygiene.ps1 -RequireClean
.\scripts\validate-browser-extension-release.ps1
git diff --check
```

When public URL readiness is in scope:

```powershell
.\scripts\check-browser-extension-public-privacy-url.ps1 -RequireLive
.\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady
```

**Exit Criteria:**

- Privacy docs and actual behavior match.
- Store docs do not imply unsupported real-site, Office, or desktop-wide coverage.

## Phase 9: Controlled Browser QA And Real-Site Evidence

**Recommended Branch:** `codex/v2a-qa-evidence`

**Recommended Subagents:**

- QA script worker after browser UX is implemented.
- Evidence-review subagent to inspect public-safe reports.
- Coordinator handles account-side/manual blockers.

**Files:**

- Modify `scripts/qa-browser-extension-production-editors-smoke.ps1`.
- Modify `scripts/qa-browser-extension-keyboard-flow-smoke.ps1`.
- Modify `scripts/qa-browser-extension-ax-smoke.ps1`.
- Modify `scripts/new-browser-extension-manual-qa-report.ps1`.
- Modify `scripts/check-browser-extension-manual-qa-report.ps1`.
- Create `docs/testing/browser-extension-v2-validation.md`.
- Modify `docs/testing/v2-acceptance-matrix.md`.
- Keep detailed generated reports ignored under `dist\browser-extension-manual-qa\` or `docs\testing\reports\` according to repo policy.

**Controlled Fixture Coverage:**

- textarea;
- input;
- simple contenteditable;
- Shadow DOM;
- iframe;
- repeated text;
- RTL/mixed text;
- large text refusal;
- sensitive fields;
- API unavailable;
- paused/site-disabled;
- keyboard-only card flow;
- accessibility scan.

**Real-Site Manual Coverage:**

- Gmail compose with disposable public-safe text;
- WhatsApp Web composer with disposable public-safe text;
- Google Docs only if mapping is stable enough;
- one plain contenteditable site;
- one framework-heavy editor if safe.

**WhiteKnight Usage:**

Use WhiteKnight for physical browser/foreground/screenshot evidence when VM evidence is not sufficient. Keep raw text out of artifacts.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi
.\scripts\validate-browser-extension-release.ps1
.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady
git diff --check
```

When VM/browser smoke is available:

```powershell
.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
.\scripts\qa-browser-extension-keyboard-flow-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml> -Browser ChromeForTesting -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
.\scripts\qa-browser-extension-ax-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

**Exit Criteria:**

- Local-ready browser claims have automated evidence.
- Real-site claims have manual evidence.
- Failures become documented limitations, not hidden gaps.

## Phase 10: V2A Release Candidate

**Recommended Branch:** `codex/v2a-release-candidate`

**Recommended Subagents:**

- Coordinator leads.
- Final spec-review subagent checks all V2A claims against docs and evidence.
- Final code-quality/security reviewer checks full diff.

**Files:**

- Version files through `scripts/Set-ReleaseVersion.ps1`.
- `README.md`.
- `docs/release-checklist.md`.
- release notes or changelog file according to repo convention.
- `browser-extension/STORE_ASSETS.md`.
- `browser-extension/STORE_SUBMISSION.md`.
- `docs/testing/v2-acceptance-matrix.md`.
- `docs/testing/browser-extension-v2-validation.md`.

**Required Gates:**

```powershell
cd C:\CodexProjects\Alfaraheedi
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo run -p write-eval
cargo deny check licenses bans sources
cd C:\CodexProjects\Alfaraheedi\frontend
npm ci
npm run lint
npm run test
npm run build
npm run test:e2e
cd C:\CodexProjects\Alfaraheedi
.\scripts\validate-browser-extension-release.ps1
.\scripts\prepare-browser-extension-release-candidate.ps1
.\scripts\export-browser-extension-store-submission.ps1
.\scripts\check-browser-extension-store-submission-integrity.ps1 -RequireValid
.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady
.\scripts\check-public-release-hygiene.ps1 -RequireClean
git diff --check
```

**Exit Criteria:**

- CI is green.
- Local release readiness is true for V2A local-ready browser claims.
- Store readiness is false unless manual/external account gates are actually done.
- Release docs and public copy match the contract.

## Phase 11: V2B Desktop Overlay Spike

**Recommended Branch:** `codex/v2b-desktop-overlay-spike`

**Start Condition:** Start only after V2A is release-candidate stable, unless the user explicitly reprioritizes desktop research.

**Recommended Subagents:**

- Windows/Tauri worker for probe code.
- QA/evidence worker for WhiteKnight script/report.
- Safety reviewer for privacy and OS interaction risk.

**Files:**

- Create `src-tauri/src/uia_overlay_probe.rs`.
- Modify `src-tauri/src/uia_pilot.rs`.
- Modify `src-tauri/src/lib.rs` only for a probe command or gated development endpoint.
- Create `scripts/qa-desktop-overlay-whiteknight.ps1`.
- Create `docs/research/v2b-desktop-overlay-spike.md`.
- Modify `docs/testing/uia-v0.9-validation.md` only if it remains the active UIA validation doc.

**Questions To Answer:**

- Can Nahou detect the focused text control reliably?
- Can UI Automation expose visible text-range bounding rectangles?
- Can a small Tauri badge align to those rectangles without stealing focus?
- Can it hide on app switch, secure desktop, password-like fields, unsupported windows, and DPI/monitor changes?
- Can ValuePattern safely replace single-line control text?
- Which apps must remain selected-text/hotkey-only?

**Target Apps:**

- Notepad.
- Word.
- PowerPoint text box.
- Edge or Chrome text field.
- One Electron app text field if available.

**Stop Rules:**

- Stop before drivers, global hooks, accessibility privilege escalation, always-on background raw-text polling, or machine-wide security changes.
- Stop if raw selected text would enter logs, screenshots, reports, or source-controlled docs.
- Stop if replacement depends on unguarded clipboard paste.

**Verification:**

```powershell
cd C:\CodexProjects\Alfaraheedi
cargo test -p alfaraheedi-desktop
git diff --check
```

WhiteKnight evidence command after the script exists:

```powershell
.\scripts\qa-desktop-overlay-whiteknight.ps1
```

**Exit Criteria:**

- A support matrix classifies each app as `supported`, `fallback`, `blocked`, or `unsafe`.
- No public desktop-wide overlay claim is added.
- Recommendation is explicit: productize, limit to selected apps, or defer.

## Phase 12: Office Track Decision

**Recommended Branch:** `codex/v2-office-inline-proof` only if explicitly authorized.

**Default Decision:** Office remains deferred and should not block V2A.

**Recommended Subagents:**

- Office worker only if the user explicitly scopes Office into V2.1 or V2B.
- Manual QA/evidence worker after package scripts are stable.

**Files If Rescoped:**

- `office-addins/src/officeApi.js`
- `office-addins/src/localApi.js`
- `office-addins/MANUAL_RELEASE_GATES.md`
- Office package tests under `frontend/src/__tests__/officeAddinsPackage.test.js`
- Office QA scripts under `scripts/qa-office-addins-*`

**Stop Rules:**

- Do not imply live Office underlines without proof.
- Do not imply AppSource readiness.
- Do not run Office certificate trust changes without explicit acceptance.
- Do not treat Word proof as PowerPoint proof.

**Existing Commands:**

```powershell
cd C:\CodexProjects\Alfaraheedi
.\scripts\validate-office-addins-release.ps1
.\scripts\package-office-addins.ps1
.\scripts\new-office-addins-manual-qa-report.ps1
.\scripts\check-office-addins-manual-qa-report.ps1 -RequireCompleted
.\scripts\qa-office-addins-whiteknight-word-sideload.ps1 -AllowBlocked
.\scripts\qa-office-addins-whiteknight-powerpoint-sideload.ps1 -AllowBlocked
```

## Parallel Execution Map

### Safe Parallel Lanes After Phase 1

- Engine/eval worker can run while browser architecture work proceeds.
- Privacy/security docs can draft while browser behavior is under construction, but final approval waits for actual behavior.
- Release script/package test adjustments can run in parallel if their files do not overlap with browser runtime changes.

### Sequential Browser Runtime Lane

Run these in order because they share `content.js`, runtime imports, and tests:

1. Architecture split.
2. Field discovery and projection.
3. Underlines, badge, and suggestion card.
4. Anchored apply.
5. Local connection UX if it touches content-side settings.
6. Controlled browser QA scripts.

### Deferred Lanes

- V2B desktop overlay starts after V2A RC.
- Office starts only if explicitly rescoped.

## PR And Commit Policy

Each workstream PR should include:

- branch name;
- one-paragraph scope statement;
- changed files grouped by responsibility;
- RED proof summary;
- verification commands and results;
- manual QA status if applicable;
- explicit limitations and blockers;
- claim-impact statement.

Preferred commit style:

- `Add V2 browser contract gates`
- `Split browser extension editor discovery`
- `Add browser text projection seam`
- `Add field badge and anchored suggestion card`
- `Guard browser suggestion apply by anchor`
- `Harden extension local connection UX`
- `Add V2 Arabic browser eval fixtures`
- `Update V2 browser privacy review`
- `Add V2 browser QA evidence gates`
- `Prepare V2A browser release candidate`
- `Add V2B desktop overlay probe`

## Final Gate Checklist

Before saying V2A is complete:

- `git status --short --branch` is clean on the release branch.
- All V2A workstream PRs are merged.
- CI is green.
- `cargo run -p write-eval` passes.
- `.\scripts\validate-browser-extension-release.ps1` passes.
- `.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady` passes.
- V2 acceptance matrix is complete.
- Privacy and public docs match behavior.
- Real-site evidence exists for each real-site claim.
- Store readiness is reported honestly.
- Desktop-wide and Office claims remain deferred unless separately proven.

## Immediate Next Step

After this execution plan is reviewed, start Phase 1 with `codex/v2a-contract-and-grounding`. Use a docs/tests implementer subagent, then a spec-review subagent, then a code-quality reviewer. Do not begin browser runtime refactoring until Phase 1 is merged into the integration branch.
