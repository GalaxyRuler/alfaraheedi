# Browser Extension V2 Validation Summary

This is the public-safe validation summary for the Nahou V2A browser-first
evidence lane. Detailed logs, screenshots, account-side notes, and foreground
browser artifacts must stay in ignored private locations such as
`docs/testing/reports/` or `dist/browser-extension-manual-qa/`.

No raw live editor text belongs in this file, source-controlled reports,
screenshots, release notes, or store-prep evidence. Use public-safe fixture
names, pass/fail status, hashes, sanitized request summaries, and documented
limitation notes instead.

## Controlled Fixture Coverage

| Surface | Current evidence path | Status |
| --- | --- | --- |
| textarea | Package/runtime tests plus keyboard and accessibility smokes. | Local-ready |
| text-input | Package/runtime tests for safe text-like inputs. | Local-ready |
| simple-contenteditable | Production-editor fixture smoke and projection tests. | Local-ready |
| shadow-dom | Runtime fixture tests and composed event-path coverage. | Local-ready |
| iframe | Manifest `all_frames` package validation and VM fixture path. | Local-ready |
| repeated-text | Anchored apply tests for trusted spans and review-only fallback. | Local-ready |
| RTL/mixed text | Runtime fixtures plus visual/manual review gate. | Local-ready |
| large text refusal | Runtime tests and sanitized local status behavior. | Local-ready |
| sensitive fields | Runtime discovery tests plus manual release gate. | Local-ready, best-effort |
| API unavailable | Local connection UX tests and manual browser QA gate. | Local-ready |
| paused/site-disabled | Settings tests prove no content-side analyze message and no background local API call with editor text. | Local-ready |
| keyboard-only card flow | `qa-browser-extension-keyboard-flow-smoke.ps1`. | VM-gated |
| accessibility scan | `qa-browser-extension-ax-smoke.ps1` currently performs an Accessibility Tree smoke; axe/manual screen-reader review remains a separate gate. | VM/manual-gated |

The production-editor smoke reports `ControlledFixtureCoverage` and redacted
`RequestSummaries`; it must not return raw editor text. The keyboard smoke
reports `KeyboardOnlyCardFlow`. The accessibility smoke reports
`AccessibilityScanCoverage`.

## Real-Site Manual Coverage

Use disposable public-safe text only. If a surface fails, record it as a
documented limitation instead of broadening store or README claims.

| Surface | Required evidence before claim | Status |
| --- | --- | --- |
| Gmail compose | Panel appears only for compose text, quoted/signature/private surrounding text is not analyzed, Apply updates intended text. | Account-side manual gate |
| WhatsApp Web composer | Panel appears for composed message, paragraph/newline mapping is correct, Apply updates intended text without sending it. | Account-side manual gate |
| Google Docs | Either stable mapping is verified or the limitation is documented without a compatibility claim. | Manual-gated limitation |
| plain contenteditable site | Suggestions and guarded Apply work in a simple public-safe editor. | Manual gate |
| framework-heavy editor | Safe public fixture or disposable account evidence only when interaction is stable. | Manual gate |

## WhiteKnight

Use WhiteKnight for physical browser, foreground, or screenshot evidence when
VM evidence is not sufficient. WhiteKnight artifacts must remain private or be
reduced to public-safe summaries before source control. The manual QA report
template records whether WhiteKnight was used and requires a public-safe
artifact check.

## Artifact Rules

- Keep generated manual QA under `dist/browser-extension-manual-qa/`.
- Keep private VM/browser evidence under `docs/testing/reports/`.
- Do not include raw live editor text, private account names, store dashboard
  identifiers, tokens, private URLs, or private screenshots.
- Store-ready claims require live-editor evidence, manual screen-reader review,
  public privacy URL readiness, store-dashboard review, and account-side
  Chrome Web Store and Edge Add-ons completion.

## Current Phase 9 Status

Local-ready automated browser-extension evidence is represented by
`validate-browser-extension-release.ps1`, package/runtime tests, the keyboard
flow smoke, the Accessibility Tree smoke, and controlled production-editor
fixtures. Real-site claims remain manual-gated until a completed private report
passes `check-browser-extension-manual-qa-report.ps1 -RequireCompleted`.

Failures or unstable surfaces must become a documented limitation in this file,
`docs/testing/v2-acceptance-matrix.md`, `browser-extension/STORE_SUBMISSION.md`,
or `browser-extension/MANUAL_RELEASE_GATES.md` before any public release claim.
