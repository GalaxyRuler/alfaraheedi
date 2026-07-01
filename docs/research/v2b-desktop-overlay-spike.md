# V2B Desktop Overlay Spike

Last updated: 2026-07-01

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
- visible text-range rectangle count and rectangle coordinates, currently
  hard-gated to empty results until the visible-range dereference path is
  crash-safe;
- ValuePattern capability;
- control class when available;
- monitor/window presence metadata.

It must not return selected text, current text, raw editor text, document names,
private window titles, screenshots, tokens, account data, or clipboard content.

## Support Matrix

The support matrix below is intentionally evidence-gated.

| Target | Initial classification | Evidence status | Notes |
| --- | --- | --- | --- |
| Notepad edit field | fallback | WhiteKnight target-matrix run on 2026-07-01 | Public-safe fixture returned `monitor_present: true`, `text_pattern_supported: true`, `value_pattern_supported: true`, `visible_range_rect_count: 0`, `control_class: RichEditD2DPT`; low-level visible-range dereferencing previously crashed in `uiautomationcore.dll` and is now disabled. |
| Word document body | fallback | WhiteKnight target-matrix run on 2026-07-01 | Public-safe fixture returned `monitor_present: true`, `text_pattern_supported: true`, `value_pattern_supported: false`, `visible_range_rect_count: 0`, `control_class: _WwG`; no desktop overlay support claim. |
| PowerPoint text box | fallback | WhiteKnight target-matrix run on 2026-07-01 | Public-safe fixture returned `monitor_present: true`, no TextPattern, no ValuePattern, `visible_range_rect_count: 0`, `control_class: mdiClass`; Word proof does not transfer to PowerPoint. |
| Edge or Chrome text field | fallback | WhiteKnight target-matrix run on 2026-07-01 | Public-safe browser fixture returned `monitor_present: true`, no TextPattern, no ValuePattern, `visible_range_rect_count: 0`; browser-extension V2A remains the supported browser path. |
| Electron text field | fallback | WhiteKnight target-matrix run on 2026-07-01 | Public-safe VS Code fixture returned `monitor_present: true`, no TextPattern, no ValuePattern, `visible_range_rect_count: 0`, `control_class: Chrome_WidgetWin_1`; stays fallback. |
| Password, credential, secure, or PIN-like controls | unsafe | source-controlled guard | Overlay and replacement must stay disabled. |
| Unsupported windows or missing focused controls | blocked | source-controlled guard | User stays on selected-text/hotkey fallback. |

Classification meanings:

- `supported`: Focused control exposes stable finite positive geometry from an
  allowlisted native text-control class through a crash-safe rectangle provider
  and remains safe for a probe-only badge. V2B currently does not report this
  state in live probing.
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

Use `scripts/qa-desktop-overlay-whiteknight.ps1` to stage public-safe focused
control metadata. Use
`scripts/qa-desktop-overlay-whiteknight-target-matrix.ps1` for the planned
WhiteKnight target matrix. A real WhiteKnight run must use only disposable
fixture text and must record capability counts, classification, command names,
hashes, and artifact paths. Do not include raw text.

The current WhiteKnight target-matrix run was captured on 2026-07-01 with the
ignored artifact root
`dist/desktop-overlay-whiteknight-qa/target-matrix/v2b-target-matrix-20260701-040056`.
It used public-safe fixture names only and produced fallback classifications for
Notepad, Word, PowerPoint, Edge/Chrome, and Electron.

The first useful evidence packet should answer:

- whether focused HWND detection is stable per target app;
- whether UI Automation TextPattern is exposed;
- whether a future crash-safe visible-range implementation can return non-empty
  screen-relative rectangles;
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

Current recommendation: defer desktop overlay productization and keep V2B as
selected-text/hotkey fallback only. The next desktop-overlay slice, if it is
authorized later, must replace the low-level visible-range dereference path with
a crash-safe implementation before any badge placement, underline placement, or
`supported` classification work resumes.
