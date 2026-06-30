# Nahou V2 Grammarly-Like Development Plan

**Goal:** Build a Grammarly-like Nahou experience that works directly where the user types, starting with browser text fields in V2A and moving to desktop-wide overlays in V2B after browser behavior is proven.

**Architecture:** V2A makes the browser extension the flagship interaction surface: content scripts discover safe editable fields, request local loopback analysis, draw non-destructive underlines/status UI, and apply suggestions only when anchored text still matches. The existing Rust engine, local API, desktop installer, privacy/release gates, and packaging scripts remain the trust boundary. V2B is a later research-and-proof phase for Windows desktop overlays using UI Automation text ranges, overlay window positioning, and guarded replacement APIs.

**Tech Stack:** Rust workspace (`write-core`, `write-arabic`, `write-api`, `write-cli`, `write-eval`), Chrome Manifest V3 extension JavaScript/CSS, local loopback HTTP API, Tauri Windows desktop host, Playwright/Vitest, PowerShell release scripts, Windows UI Automation for V2B research, Office.js only as a deferred integration track.

---

## Grounded References

This plan is grounded in current public platform and product references checked on 2026-06-30.

- Grammarly browser extension UX: their guide describes dynamic checking while typing, a lower-right text-field icon, inline underlines, suggestion cards, per-site settings, and toolbar preferences. Source: [Grammarly browser extension user guide](https://support.grammarly.com/hc/en-us/articles/115000091592-Grammarly-s-browser-extension-user-guide).
- Grammarly desktop UX: their Windows/Mac guide describes a floating widget next to text fields, automatic underlines, a suggestion card opened from an underline/widget, anchored widget positions, and per-app/site turn-off. Source: [Grammarly for Windows and Mac user guide](https://support.grammarly.com/hc/en-us/articles/4412816078349-Grammarly-for-Windows-and-Grammarly-for-Mac-user-guide).
- Grammarly web engineering: their engineering writeup identifies web-editor diversity, custom underlines, `Range.getClientRects()`, and pixel-perfect overlay tracking as core compatibility challenges. Source: [Making Grammarly Feel Native On Every Website](https://www.grammarly.com/blog/engineering/making-grammarly-feel-native-on-every-website/).
- Grammarly suggestion anchoring: their editor architecture writeup emphasizes representing suggestions as document changes and applying them to the right place as text evolves. Source: [How Suggestions Work in the Grammarly Editor](https://www.grammarly.com/blog/engineering/how-suggestions-work-grammarly-editor/).
- Chrome extension platform: content scripts run in web pages, can read/change DOM, and communicate with the extension; they live in isolated worlds and static scripts are declared in `manifest.json`. Source: [Chrome extension content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- Chrome extension messaging: content scripts and service workers communicate through extension messaging; this remains the right architecture for routing browser text to the local loopback API through the background/service worker layer. Source: [Chrome extension message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
- Chrome permissions: `activeTab` can grant temporary host access after user invocation; this is relevant for any future permission-minimization redesign, but V2A can keep the current content-script model if the store/privacy disclosures match behavior. Source: [Chrome activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
- Chrome Web Store privacy: user-data and secure-handling policies require accurate disclosure and limited data use for extension behavior. Source: [Chrome Web Store user data policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
- CSS Custom Highlight API: supports styling arbitrary `Range` objects without changing page DOM structure; MDN marks it baseline since June 2025, so V2A should use it for contenteditable where available and keep a fallback for unsupported or complex editors. Source: [MDN CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API).
- DOM Range: Range objects represent document fragments and are the browser-side primitive for mapping suggestion offsets to DOM positions. Source: [MDN Range](https://developer.mozilla.org/en-US/docs/Web/API/Range).
- Input events: dispatched `InputEvent.inputType` values can identify replacement-like edits for page frameworks; Nahou already dispatches composed replacement input events and should formalize this in tests. Source: [MDN InputEvent.inputType](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/inputType).
- `contenteditable`: supports `true`, empty string, `false`, and `plaintext-only`; V2A should explicitly classify these tokens and reject unsupported nested islands. Source: [MDN contenteditable](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable).
- Accessibility: focus indicators must remain visible, suggestion UI needs keyboard dismissal/focus behavior, and interactive suggestion cards should use dialog-like semantics when they contain buttons rather than tooltip-only semantics. Sources: [WCAG Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/).
- Windows desktop overlay feasibility: UI Automation `TextPattern` exposes text and text ranges, but text modification is not provided by `TextPattern`; `ValuePattern` works for some single-line edit controls, while multiline/document controls often need simulated input or other APIs. Sources: [Microsoft UI Automation TextPattern overview](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-textpattern-overview), [ValuePattern.SetValue](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.valuepattern.setvalue).
- Desktop overlay geometry: UI Automation text ranges can expose bounding rectangles for visible text ranges, which makes V2B possible but app-dependent. Source: [IUIAutomationTextRange GetBoundingRectangles](https://learn.microsoft.com/en-us/previous-versions/dd388223%28v%3Dvs.85%29).
- Office later track: Word ranges expose text and document-range operations including temporary highlighting and text insertion, but Office needs its own sideload/app-store gates and should not be collapsed into browser V2A. Source: [Word.Range Office.js API](https://learn.microsoft.com/en-us/javascript/api/word/word.range?view=word-js-preview).

## Product Direction

### Decision

V2 is split into two sequential product phases:

1. **V2A: Browser-first Grammarly-like in-text assistance.**
2. **V2B: Desktop-wide Grammarly-like overlay and in-place correction research/buildout.**

Option A comes first because the browser extension already has a foundation for editable-field discovery, loopback analysis, underlines, suggestion panels, guarded apply, settings, and packaging. Browser content scripts also provide the clearest route to working directly where the user types without unsafe native overlay assumptions.

Option B follows only after V2A proves the interaction model, because desktop-wide inline behavior depends on app-specific text providers, text-range geometry, focus/caret tracking, overlay windows, privilege boundaries, and safer replacement APIs.

### V2A Public Claim

Nahou V2A should be able to claim:

> Nahou checks supported browser text fields as you type, shows local-first suggestions directly in the field, and applies accepted deterministic suggestions in place when the original text still matches.

### V2A Explicit Non-Claims

V2A must not claim:

- full Arabic grammar checking;
- universal support for every website or every rich editor;
- production-ready Google Docs/Gmail/WhatsApp support unless each is manually verified;
- desktop-wide live underlines;
- Office live underlines;
- hosted processing;
- bundled model weights;
- automatic LLM rewriting;
- store approval before account-side store review is complete.

### V2B Public Claim Target

V2B should not start with a public claim. Its first deliverable is a support matrix and prototype evidence:

> Nahou can place a floating widget and, where supported by the target app, align suggestions to selected or focused desktop text ranges without logging raw text.

Public desktop-wide inline claims come only after app-by-app proof.

## Current Baseline

The repository already contains:

- `browser-extension/manifest.json`: Manifest V3 extension with static content scripts on `http://*/*` and `https://*/*`, storage permission, loopback host permissions, popup/options, and background service worker.
- `browser-extension/src/content.js`: current all-in-one content script with focus/input/composition handling, debounce, local analyze messaging, marks, panel, sensitive-field exclusion, iframe/shadow DOM event path handling, and apply cleanup.
- `browser-extension/src/editorSurface.js`: exported browser-extension surface utilities tested from the frontend Vitest suite.
- `browser-extension/src/background.js`, `localApi.js`, `settings.js`, `popup.js`, `options.js`: local loopback routing and extension settings.
- `frontend/src/__tests__/browserExtension*.test.js`: existing package/surface/settings tests.
- `scripts/validate-browser-extension-release.ps1`, `prepare-browser-extension-release-candidate.ps1`, `export-browser-extension-store-submission.ps1`, `check-browser-extension-store-submission-integrity.ps1`, `get-browser-extension-release-readiness.ps1`: existing packaging and readiness gates.
- Rust engine and eval crates: deterministic suggestions, safe patch logic, API, CLI, and release eval gate.
- Desktop companion: Tauri selected-text/hotkey foundation plus UIA capture pilot, but no desktop-wide live underline overlay.
- Office add-ins: task-pane foundation and sideload scripts, but not a live underline product surface.

## Development Principles

1. **Browser-first, not browser-only.** V2A proves the Grammarly-like model in browser fields; V2B later adapts it to desktop.
2. **Never mutate host editor DOM just to draw underlines.** Prefer CSS Highlight for contenteditable when supported, and overlay marks for textareas/inputs or unsupported editors.
3. **Apply only when anchored.** Suggestions can be displayed stale or unanchored, but apply controls must require original-text span match.
4. **Privacy is a release gate.** Raw user text must not be stored in logs, reports, screenshots, source-controlled artifacts, or telemetry.
5. **No hidden hosted fallback.** All browser analysis goes to the configured loopback local Nahou API.
6. **IME and RTL first-class.** Arabic composition input, bidirectional text, and mixed Arabic/English offsets are release-blocking.
7. **One workstream per PR.** Do not merge a huge V2 branch. Each workstream gets a branch, local verification, PR, CI, and clean integration branch before the next one.
8. **V2B is proof-driven.** Desktop overlays begin as research/probes, not as public product claims.

## Branching Model

Base branch: `release/v1.0` until a `v2/main` or `main` release branch policy is chosen.

Recommended integration branch:

- `codex/v2a-browser-first-integration`

Workstream branches:

- `codex/v2a-contract-and-grounding`
- `codex/v2a-extension-architecture`
- `codex/v2a-field-detection`
- `codex/v2a-underlines-and-badge`
- `codex/v2a-suggestion-card`
- `codex/v2a-anchored-apply`
- `codex/v2a-engine-evals`
- `codex/v2a-settings-privacy`
- `codex/v2a-real-site-qa`
- `codex/v2a-release-candidate`
- `codex/v2b-desktop-overlay-spike`

Each workstream must:

1. start from the current integration branch;
2. create a focused failing test or documented RED proof;
3. implement the narrow change;
4. run the smallest relevant local verification first;
5. run broader gates only when the blast radius warrants it;
6. open a PR;
7. merge only when CI is green;
8. fast-forward local integration branch and confirm clean status.

## V2A Workstream Breakdown

### Workstream 0: V2 Product Contract And Grounding

**Purpose:** Turn this master plan into source-controlled V2 public boundaries and release gates.

**Branch:** `codex/v2a-contract-and-grounding`

**Files:**

- Create `docs/public/v2-product-contract.md`.
- Create `docs/testing/v2-acceptance-matrix.md`.
- Create `docs/security/v2-browser-extension-threat-model.md`.
- Create `docs/security/v2-browser-extension-privacy-review.md`.
- Modify `README.md`.
- Modify `docs/release-checklist.md`.
- Modify `frontend/src/__tests__/releasePackaging.test.js`.

**Deliverables:**

- V2A public claim and non-claims.
- Browser-first product surface definition.
- V2B deferred desktop overlay statement.
- Privacy/data flow description for active browser fields.
- Acceptance matrix rows for:
  - textarea/input inline suggestions;
  - simple contenteditable suggestions;
  - stale suggestion handling;
  - sensitive-field exclusion;
  - pause/resume and per-site disable;
  - API unavailable state;
  - IME/composition behavior;
  - RTL/mixed-direction behavior.

**Acceptance gates:**

- Claim-guard test fails before doc updates and passes after.
- No docs claim desktop-wide overlay support.
- No docs claim store approval.
- `npm test -- --run releasePackaging.test.js --minWorkers=1 --maxWorkers=2` passes.
- `git diff --check` passes.

### Workstream 1: Browser Extension Architecture Split

**Purpose:** Split current browser content logic into small modules so V2A can be implemented safely.

**Branch:** `codex/v2a-extension-architecture`

**Files:**

- Modify `browser-extension/src/content.js`.
- Modify `browser-extension/src/editorSurface.js`.
- Create `browser-extension/src/editorDiscovery.js`.
- Create `browser-extension/src/textProjection.js`.
- Create `browser-extension/src/suggestionAnchors.js`.
- Create `browser-extension/src/overlayLayer.js`.
- Create `browser-extension/src/suggestionCard.js`.
- Create `browser-extension/src/applySuggestion.js`.
- Modify `frontend/src/__tests__/browserExtension.test.js`.
- Add focused tests as needed under `frontend/src/__tests__/`.

**Deliverables:**

- `content.js` becomes orchestration only:
  - listen to focus/input/composition/keydown;
  - schedule analysis;
  - route results to rendering/apply modules;
  - clear UI on editor changes/removal.
- Existing exported test seam remains or is replaced by stable module exports.
- No behavior change in this workstream.

**Acceptance gates:**

- Existing browser extension tests pass before behavior additions.
- `.\scripts\validate-browser-extension-release.ps1` passes.
- `npm test -- --run browserExtension.test.js browserExtensionSettings.test.js browserExtensionPackage.test.js --minWorkers=1 --maxWorkers=2` passes.

### Workstream 2: Field Discovery And Safety Matrix

**Purpose:** Make supported and unsupported browser fields explicit and testable.

**Branch:** `codex/v2a-field-detection`

**Files:**

- Modify `browser-extension/src/editorDiscovery.js`.
- Modify or create `frontend/src/__tests__/browserExtensionDiscovery.test.js`.
- Modify `browser-extension/README.md`.
- Modify `docs/testing/v2-acceptance-matrix.md`.

**Supported in V2A:**

- `textarea`.
- `input` types: `text`, `search`, `email`, `url`, `tel`.
- `contenteditable="true"`, empty `contenteditable`, and `contenteditable="plaintext-only"` when text mapping is stable.
- Open Shadow DOM text controls reached through composed event paths.
- Same-origin and extension-injected iframes where current manifest behavior applies.

**Blocked in V2A:**

- password fields;
- read-only or disabled controls;
- ARIA read-only/disabled editors;
- one-time-code, card, CVC/CVV, token, API key, password, secret, auth, SSN, and similar sensitive fields or ancestor contexts;
- hidden fields and invisible rich-editor sentinel nodes;
- contenteditable false islands;
- editors over the maximum text limit;
- editors with unsupported mapping complexity.

**Acceptance gates:**

- Matrix tests cover each supported and blocked class.
- Sensitive fields are not sent to background/API.
- Browser extension docs list supported and intentionally ignored fields.
- `npm test -- --run browserExtensionDiscovery.test.js browserExtension.test.js --minWorkers=1 --maxWorkers=2` passes.

### Workstream 3: Text Projection And Offset Mapping

**Purpose:** Make DOM-to-plain-text projection deterministic enough for underlines and apply.

**Branch:** `codex/v2a-text-projection`

**Files:**

- Modify `browser-extension/src/textProjection.js`.
- Modify `browser-extension/src/editorSurface.js`.
- Create `frontend/src/__tests__/browserExtensionTextProjection.test.js`.

**Deliverables:**

- Projection model:
  - plain text controls use `.value`;
  - contenteditable walks editable text nodes only;
  - block boundaries map to newlines;
  - `<br>` maps to newlines;
  - repeated block breaks are stable;
  - non-editable islands are omitted;
  - rich-editor sentinels are omitted;
  - projection records a map from plain-text offsets to DOM nodes/offsets.
- Projection status:
  - `ok`;
  - `unsupported-editor`;
  - `too-large`;
  - `sensitive`;
  - `mapping-ambiguous`.

**Acceptance gates:**

- Mixed Arabic/English text offset tests pass.
- Repeated text tests prove later suggestions map to later instances.
- Projection never includes non-editable island text.
- Projection rejects unsupported mapping rather than guessing.

### Workstream 4: Underlines, Badge, And Layout Synchronization

**Purpose:** Make V2A visually feel like Grammarly in supported browser fields.

**Branch:** `codex/v2a-underlines-and-badge`

**Files:**

- Modify `browser-extension/src/overlayLayer.js`.
- Modify `browser-extension/src/content.css`.
- Modify `browser-extension/src/editorSurface.js`.
- Create `frontend/src/__tests__/browserExtensionOverlay.test.js`.
- Modify `frontend/src/__tests__/browserExtension.test.js`.

**Deliverables:**

- Textarea/input overlay:
  - transparent overlay copies text metrics;
  - wavy underline marks align with current scroll position;
  - overlay is `aria-hidden`;
  - overlay updates on scroll, resize, zoom/layout changes, and editor input.
- Contenteditable highlight:
  - use CSS Custom Highlight API when available;
  - fall back to no underline plus badge/suggestion list when highlight is unavailable or projection is ambiguous.
- Badge:
  - lower-right field badge with issue count;
  - spinner/checking state;
  - paused state;
  - API unavailable state;
  - no suggestions state;
  - viewport-clamped position.

**Acceptance gates:**

- Overlay cleanup on blur/editor removal.
- Badge does not cover typed text at normal field sizes.
- Forced-colors mode is usable.
- RTL fields position badge and panel without overlap.
- Playwright screenshot tests for desktop and narrow viewport.

### Workstream 5: Suggestion Card Interaction

**Purpose:** Replace the current compact panel with a Grammarly-like suggestion card flow.

**Branch:** `codex/v2a-suggestion-card`

**Files:**

- Modify `browser-extension/src/suggestionCard.js`.
- Modify `browser-extension/src/content.css`.
- Modify `browser-extension/src/editorSurface.js`.
- Create `frontend/src/__tests__/browserExtensionSuggestionCard.test.js`.

**Deliverables:**

- Clicking underline or badge opens a card near the anchor.
- Card shows:
  - rule category;
  - concise explanation;
  - original span;
  - replacement;
  - Apply;
  - Dismiss for this session;
  - Next/Previous when multiple suggestions exist.
- Keyboard:
  - Escape dismisses and returns focus to editor;
  - Tab order stays inside card only when card behaves as an interactive popover/dialog;
  - focus remains visible;
  - editor focus movement into the card does not clear suggestions.
- Accessibility:
  - card uses region/dialog semantics based on focus behavior;
  - visible label and accessible labels are concise;
  - replacement text uses `dir="auto"`;
  - status messages use `role="status"` where appropriate.

**Acceptance gates:**

- Keyboard-only flow can open, apply, dismiss, and return to editor.
- Pointer hover/click flow works for underlines and badge.
- Card clamps near viewport edges.
- No raw exception strings, URLs, or editor text in failure messages.

### Workstream 6: Anchored Apply And Stale Suggestion Handling

**Purpose:** Guarantee that in-place apply never rewrites the wrong text.

**Branch:** `codex/v2a-anchored-apply`

**Files:**

- Modify `browser-extension/src/suggestionAnchors.js`.
- Modify `browser-extension/src/applySuggestion.js`.
- Modify `browser-extension/src/editorSurface.js`.
- Create `frontend/src/__tests__/browserExtensionAnchoredApply.test.js`.

**Deliverables:**

- Each suggestion stores:
  - source rule;
  - original text;
  - replacement text;
  - plain-text span;
  - projection version/hash;
  - editor identity.
- Apply flow:
  - re-read current editor projection;
  - confirm same editor;
  - confirm original text still exists at expected mapped span;
  - apply replacement through native control APIs for textarea/input;
  - apply through DOM Range for simple contenteditable only when the mapped DOM range is stable;
  - dispatch composed `InputEvent` with replacement-like `inputType` where supported;
  - place caret after inserted replacement.
- Stale flow:
  - disable Apply;
  - show safe status;
  - keep review-only display if helpful;
  - clear marks after successful apply or current editor mutation.

**Acceptance gates:**

- Repeated text tests prove applying the second suggestion does not change the first.
- Stale text tests prove Apply is removed or fails safely.
- Framework-observer tests prove input/change behavior is observable.
- Contenteditable inline markup preservation tests pass for simple markup.

### Workstream 7: Local API, Desktop Host, And Extension Connection UX

**Purpose:** Make the local-first connection understandable and reliable for users.

**Branch:** `codex/v2a-local-connection-ux`

**Files:**

- Modify `browser-extension/src/background.js`.
- Modify `browser-extension/src/localApi.js`.
- Modify `browser-extension/src/settings.js`.
- Modify `browser-extension/src/popup.js`.
- Modify `browser-extension/src/options.js`.
- Modify `browser-extension/popup.html`.
- Modify `browser-extension/options.html`.
- Modify `browser-extension/README.md`.
- Modify `frontend/src/__tests__/browserExtensionSettings.test.js`.

**Deliverables:**

- Popup clearly shows:
  - enabled/paused;
  - local API reachable/unreachable;
  - current loopback URL;
  - current site enabled/disabled;
  - last safe error category.
- Options support:
  - loopback URL only;
  - default writing mode;
  - enabled/paused;
  - per-site disabled list;
  - reset to defaults.
- Background validates:
  - loopback-only URL;
  - no remote hosts;
  - timeout and sanitized errors;
  - no editor text while paused or disabled.

**Acceptance gates:**

- API unavailable UX is safe and not noisy.
- Settings persistence tests pass.
- Store package still has only required permissions and loopback host permissions.

### Workstream 8: Engine And Eval Upgrade For V2A Usefulness

**Purpose:** Make the browser UX valuable enough to justify V2.

**Branch:** `codex/v2a-engine-evals`

**Files:**

- Create `datasets/eval/v2-arabic.jsonl`.
- Create `datasets/eval/v2-mixed.jsonl`.
- Modify `crates/write-eval/src/lib.rs`.
- Modify `crates/write-eval/tests/report.rs`.
- Modify `crates/write-arabic/src/lib.rs`.
- Modify `crates/write-arabic/tests/rules.rs`.
- Modify `crates/write-mixed/src/lib.rs` and tests if mixed behavior changes.
- Modify `docs/evaluation.md`.

**Rule expansion themes:**

- punctuation and spacing completeness;
- Arabic/Latin mixed punctuation in browser text;
- narrow, deterministic Arabic orthography only when high precision is defensible;
- phrase-level corrections only for public-safe, exact patterns;
- protected-span safety;
- dialect/name/classical false-positive guards.

**Eval bar:**

- New safe auto-apply rule: at least one positive fixture, two negative fixtures, and one false-positive guard.
- New suggest-only rule: at least one positive fixture and one false-positive guard.
- Any rule that can touch URLs, code, names, dialectal phrases, or mixed technical text needs explicit negative fixtures.
- Overall release gate remains zero release-blocking false positives and false negatives for committed fixtures.

**Acceptance gates:**

- RED eval proof for each new rule family.
- `cargo run -p write-eval` passes.
- `cargo test -p write-arabic` passes.
- `cargo test -p write-eval` passes.
- `cargo clippy --workspace -- -D warnings` passes before merge.

### Workstream 9: Privacy, Store, And Security Hardening

**Purpose:** Make browser-first V2A releasable without weakening the V1 privacy contract.

**Branch:** `codex/v2a-settings-privacy`

**Files:**

- Modify `docs/security/v2-browser-extension-threat-model.md`.
- Modify `docs/security/v2-browser-extension-privacy-review.md`.
- Modify `browser-extension/PRIVACY_POLICY.md`.
- Modify `docs/public/browser-extension/privacy.html`.
- Modify `browser-extension/STORE_SUBMISSION.md`.
- Modify `browser-extension/MANUAL_RELEASE_GATES.md`.
- Modify `scripts/check-browser-extension-public-privacy-url.ps1` if dates/URLs change.
- Modify `scripts/check-public-release-hygiene.ps1` only if new source-controlled artifact rules are needed.

**Deliverables:**

- Data-flow table:
  - active editor text;
  - local loopback API request;
  - no retention;
  - no telemetry;
  - no hosted fallback;
  - optional local LLM remains separate and explicit.
- Permission rationale:
  - storage;
  - loopback host permissions;
  - content script matches.
- Public page readiness:
  - privacy URL current;
  - no raw QA content;
  - no unsupported store claims.

**Acceptance gates:**

- `.\scripts\check-browser-extension-public-privacy-url.ps1 -RequireLive` passes when public URL is in scope.
- `.\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady` passes when store readiness is in scope.
- `.\scripts\check-public-release-hygiene.ps1 -RequireClean` passes.
- Manual raw-text artifact review completed.

### Workstream 10: Real-Site QA Harness And Evidence

**Purpose:** Prove V2A outside unit tests while keeping public claims bounded.

**Branch:** `codex/v2a-real-site-qa`

**Files:**

- Modify `scripts\qa-browser-extension-production-editors-smoke.ps1`.
- Modify `scripts\qa-browser-extension-keyboard-flow-smoke.ps1`.
- Modify `scripts\qa-browser-extension-ax-smoke.ps1`.
- Create or modify ignored report templates under `dist\browser-extension-manual-qa\` via scripts.
- Modify `docs/testing/browser-extension-v2-validation.md`.
- Modify `docs/testing/v2-acceptance-matrix.md`.

**QA surfaces:**

- Local controlled fixture page:
  - textarea;
  - input;
  - simple contenteditable;
  - Shadow DOM;
  - iframe;
  - repeated text;
  - RTL/mixed text;
  - large text refusal;
  - sensitive fields.
- Real sites with disposable content:
  - Gmail compose;
  - WhatsApp Web message box;
  - Google Docs only if mapping is stable enough to avoid overclaiming;
  - one plain contenteditable site;
  - one framework-heavy editor if safe.

**Evidence rules:**

- Public docs contain only public-safe summaries and no raw editor text.
- Detailed screenshots/logs stay ignored under `dist\` or `docs/testing/reports\` when appropriate.
- Any failed real-site target becomes a documented limitation, not a hidden claim.

**Acceptance gates:**

- Existing local browser extension release validator passes.
- New keyboard and accessibility smokes pass.
- Manual report generator/checker supports V2A gates.
- `get-browser-extension-release-readiness.ps1 -RequireLocalReady` passes for local-ready claims.

### Workstream 11: Packaging And Release Candidate

**Purpose:** Cut V2A as a coherent release candidate.

**Branch:** `codex/v2a-release-candidate`

**Files:**

- Modify version files and manifests through `scripts/Set-ReleaseVersion.ps1`.
- Modify `CHANGELOG.md` if present or create a release notes document if the repo does not use a changelog yet.
- Modify `README.md`.
- Modify `docs/release-checklist.md`.
- Modify `browser-extension/STORE_ASSETS.md`.
- Modify `browser-extension/STORE_SUBMISSION.md`.

**Required commands:**

- `cargo fmt --all --check`
- `cargo clippy --workspace -- -D warnings`
- `cargo test --workspace`
- `cargo run -p write-eval`
- `cargo deny check licenses bans sources`
- In `frontend/`: `npm ci`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`
- `.\scripts\validate-browser-extension-release.ps1`
- `.\scripts\prepare-browser-extension-release-candidate.ps1`
- `.\scripts\export-browser-extension-store-submission.ps1`
- `.\scripts\check-browser-extension-store-submission-integrity.ps1 -RequireValid`
- `.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady`
- `.\scripts\check-public-release-hygiene.ps1 -RequireClean`

**Acceptance gates:**

- CI green on PR.
- Local release readiness true for V2A local-ready browser claims.
- Store readiness remains false unless manual/live/account gates are actually complete.
- Public claims and docs reviewed against V2 contract.
- Fresh clone smoke completed if cutting a public release.

## V2B Desktop Overlay Research And Buildout

V2B starts after V2A is merged and released or at least release-candidate stable.

### V2B Phase 0: Desktop Overlay Spike

**Branch:** `codex/v2b-desktop-overlay-spike`

**Purpose:** Decide whether desktop-wide inline assistance is feasible for selected target apps without unsafe replacement or privacy regressions.

**Files:**

- Modify or create `src-tauri/src/uia_overlay_probe.rs`.
- Modify `src-tauri/src/uia_pilot.rs`.
- Create `docs/research/v2b-desktop-overlay-spike.md`.
- Create `scripts/qa-desktop-overlay-whiteknight.ps1`.
- Create focused Rust tests if non-Windows logic can be tested locally.

**Target apps:**

- Notepad.
- Word.
- PowerPoint text box.
- Edge/Chrome text field.
- One Electron app text field if available.

**Questions to answer:**

- Can we detect the focused text control reliably?
- Can we read selected or caret-adjacent text without raw diagnostic leakage?
- Can UI Automation expose bounding rectangles for the current text range?
- Can an always-on-top transparent/floating Tauri window align to those rectangles?
- Can replacement be done through ValuePattern for single-line controls?
- When ValuePattern is unavailable, can replacement be safely guarded through selection plus clipboard paste?
- Which apps must stay selected-text/hotkey-only?

**Acceptance gates:**

- Whiteknight evidence for each target app.
- No public product claim changes.
- A support matrix with `supported`, `fallback`, `blocked`, and `unsafe` categories.
- A clear recommendation: proceed to V2B productization, limit to selected apps, or defer.

### V2B Phase 1: Desktop Floating Badge

Only start if Phase 0 proves stable coordinates.

**Goal:** Show a small Nahou badge near supported focused desktop text controls, without inline underlines at first.

**Acceptance gates:**

- No raw text logging.
- Badge does not steal focus.
- Badge hides on app switch, secure desktop, password-like fields, unsupported windows.
- Whiteknight installed-app proof.

### V2B Phase 2: Desktop Underline Overlay

Only start if badge and text-range geometry are stable.

**Goal:** Draw underlines over supported native text controls using UIA text-range bounding rectangles.

**Acceptance gates:**

- Pixel alignment proof on target apps.
- Scroll/caret movement updates.
- DPI scaling proof.
- Multi-monitor proof.
- RTL/mixed text proof.
- No claim for unsupported apps.

### V2B Phase 3: Desktop Guarded Apply

Only start after overlay proof.

**Goal:** Apply suggestions in place for app classes with safe replacement APIs.

**Acceptance gates:**

- Re-read current text before apply.
- Do not apply if stale.
- Prefer API replacement where available.
- Clipboard fallback remains explicit and guarded.
- Undo behavior documented per app.

## Office Track

Office is not part of V2A unless explicitly re-scoped. It should remain a parallel or later track because Office has separate sideload and AppSource-style gates.

Recommended Office timing:

1. Keep current task-pane foundation validated during CI.
2. After V2A, decide whether V2.1 or V2B includes Office.
3. If included, create a dedicated `codex/v2-office-inline-proof` plan using Word range APIs and PowerPoint host limitations.

Office must not block V2A unless the release claim includes Word/PowerPoint.

## Testing Strategy

### Unit Tests

- Browser field discovery.
- Sensitive-field exclusion.
- Projection and offset mapping.
- Suggestion anchoring.
- Apply failure modes.
- Settings persistence.
- Local API URL validation.
- Rust engine rule behavior.
- Eval report failure formatting.

### Integration Tests

- Browser extension local API request construction.
- Background messaging.
- Content script state transitions.
- Popup/options settings.
- Package manifest and artifact contents.
- Desktop local API host if touched.

### E2E Tests

- Controlled fixture page with textareas, inputs, contenteditable, iframe, Shadow DOM.
- Keyboard-only suggestion review.
- API unavailable state.
- Pause/resume and per-site disabled state.
- RTL/mixed text rendering.

### Manual QA

- Whiteknight or dedicated browser QA machine.
- Chrome and Edge.
- Gmail, WhatsApp Web, and Google Docs only as claim-gated live-editor checks.
- Screen-reader/manual assistive tech review before public store claims.
- Public-safe report summaries only.

## Release Gates

V2A cannot release until:

- V2 public contract exists and docs/tests enforce it.
- Browser extension V2 acceptance matrix is complete.
- Expanded V2 eval fixtures pass.
- Browser extension local-ready package validates.
- Privacy/security docs match behavior.
- Public privacy URL is current if store upload is in scope.
- CI passes all current jobs.
- Manual QA evidence exists for every claimed real surface.
- Store readiness is not claimed unless account-side/manual gates are complete.

## Stop Rules

Stop and ask before continuing if:

- A workstream requires broad remote-host permissions.
- A rule requires external corpora, dictionaries, licensed data, or morphology claims.
- Browser extension behavior would send text anywhere except the configured loopback API.
- Desktop overlay work requires machine-wide hooks, drivers, accessibility privilege escalation, or always-on monitoring.
- Store submission wording would claim support not proven by QA.
- A real-site editor cannot be mapped safely but the planned public claim depends on it.

## Recommended Execution Order

1. V2A contract and grounding.
2. Extension architecture split.
3. Field discovery and safety matrix.
4. Text projection and offset mapping.
5. Underlines, badge, and layout sync.
6. Suggestion card interaction.
7. Anchored apply and stale handling.
8. Engine and eval upgrade.
9. Local connection UX.
10. Privacy/store/security hardening.
11. Real-site QA harness and evidence.
12. V2A release candidate.
13. V2B desktop overlay spike.

This order deliberately puts architecture and safety before visual polish, and browser proof before desktop-wide overlay work.

## Self-Review

- **Spec coverage:** Covers V2A browser-first UX, V2B desktop follow-on, engine/eval work, privacy, QA, packaging, docs, and release gates.
- **Placeholder scan:** No TBD/TODO placeholders. Deferred work is explicitly scoped as V2B or Office track.
- **Scope check:** This is a master plan, not a single implementation plan. Each workstream must get its own executable plan before coding.
- **Ambiguity check:** V2A is browser-first. V2B is desktop overlay research/buildout after V2A. Office is deferred unless explicitly re-scoped.
