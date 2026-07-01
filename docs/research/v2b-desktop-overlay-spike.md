# V2B Desktop Overlay Spike

Last updated: 2026-06-30

V2B is a probe-only desktop overlay spike. It exists to answer whether Nahou can
reliably detect focused Windows text controls, read UI Automation geometry, and
place a small desktop badge without stealing focus or exposing raw user text.

No public desktop-wide overlay claim is made by this spike.

## Scope

This work starts after the V2A browser-first release-candidate lane. It does not
replace the V1 desktop selected-text workflow and does not change the current
clipboard-based replacement path.

The first implementation surface is `probe_desktop_overlay`, a Tauri command
that returns sanitized metadata only:

- support classification;
- focused-control availability;
- TextPattern availability;
- visible text-range rectangle count and rectangle coordinates;
- ValuePattern capability;
- control class when available;
- monitor/window presence metadata.

It must not return selected text, current text, raw editor text, document names,
private window titles, screenshots, tokens, account data, or clipboard content.

## Support Matrix

The support matrix below is intentionally evidence-gated.

| Target | Initial classification | Evidence status | Notes |
| --- | --- | --- | --- |
| Notepad edit field | fallback | pending WhiteKnight run | First target for focused control and rectangle probing. |
| Word document body | fallback | pending WhiteKnight run | Requires separate UIA provider proof before any overlay claim. |
| PowerPoint text box | fallback | pending WhiteKnight run | Word proof is not PowerPoint proof. |
| Edge or Chrome text field | fallback | pending WhiteKnight run | Browser-extension V2A remains the supported browser path. |
| Electron text field | fallback | pending WhiteKnight run | Optional target when a safe public fixture app is available. |
| Password, credential, secure, or PIN-like controls | unsafe | source-controlled guard | Overlay and replacement must stay disabled. |
| Unsupported windows or missing focused controls | blocked | source-controlled guard | User stays on selected-text/hotkey fallback. |

Classification meanings:

- `supported`: Focused control exposes stable finite positive geometry from an
  allowlisted native text-control class and remains safe for a probe-only badge.
- `fallback`: Focused control is detectable, but Nahou must keep selected-text
  or browser-extension behavior as the product path.
- `blocked`: The control cannot be probed safely or reliably.
- `unsafe`: The control looks sensitive or would require behavior forbidden by
  the V2B stop rules.

## Stop Rules

Stop before:

- drivers, kernel hooks, or machine-wide security changes;
- global keyboard or mouse hooks beyond the existing Tauri hotkey path;
- always-on background raw-text polling;
- accessibility privilege escalation;
- raw user text in logs, public reports, screenshots, release notes, or source;
- unguarded clipboard paste as an inline replacement strategy.

## Evidence Plan

Use `scripts/qa-desktop-overlay-whiteknight.ps1` to stage public-safe evidence
metadata. A real WhiteKnight run must use only disposable fixture text and must
record capability counts, classification, command names, hashes, and artifact
paths. Do not include raw text.

The first useful evidence packet should answer:

- whether focused HWND detection is stable per target app;
- whether UI Automation TextPattern is exposed;
- whether visible range rectangles are non-empty and screen-relative;
- whether rectangles are finite, positive-sized, and from an allowlisted native
  text-control class before `supported` is reported;
- whether ValuePattern appears available without using it for replacement;
- whether password-like classes and native password-style edit controls are
  classified as `unsafe`;
- whether the probe hides unsupported apps behind `fallback` or `blocked`.

## Recommendation Gate

After WhiteKnight evidence exists, make one of these recommendations:

- productize a limited app-specific badge;
- keep V2B as selected-text fallback only;
- defer desktop overlays and continue investing in browser/Office-specific paths.
