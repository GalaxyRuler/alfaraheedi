# UI Automation v0.9 Validation Summary

This is the public-safe validation summary for the Nahou v0.9 Windows UI
Automation pilot.

## Scope

The v0.9 pilot adds best-effort selected-text capture through Windows UI
Automation TextPattern for supported focused native text controls. It is not an
always-on overlay, does not monitor text in the background, and does not replace
text through UI Automation.

## Runtime Behavior

- The companion first attempts UIA TextPattern capture from the focused control.
- If UIA capture is unavailable, unsupported, empty, or blocked, the companion
  falls back to the existing clipboard-mediated copy flow.
- The review header shows whether the session used `Windows UI Automation
  capture` or `Clipboard capture`.
- Replacement still uses the existing clipboard paste fallback and restores the
  previous text clipboard when possible.

## Manual QA Matrix

Use public-safe disposable text only.

| Surface | Expected result |
| --- | --- |
| Notepad selected text | Prefer `Windows UI Automation capture` when TextPattern is exposed; fallback is acceptable only if documented. |
| Browser textarea | `Clipboard capture` is expected unless the browser exposes a native TextPattern selection. |
| Word/PowerPoint | Office add-in QA remains the deeper integration path; desktop UIA capture should not be claimed without current evidence. |
| No selection | Clear no-selection instruction, with no raw text retained. |
| Replace selection | Clipboard paste fallback still updates the intended selection and restores clipboard when possible. |

## Claim Boundary

Before widening claims:

- Capture must be verified on real target controls.
- Unsupported controls must fall back without breaking clipboard restore.
- No raw selected text may appear in logs, reports, screenshots, or public
  artifacts.
- UIA replacement and live underlines remain future work.
