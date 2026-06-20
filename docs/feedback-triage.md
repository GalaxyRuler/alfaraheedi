# Feedback Triage And Patch Releases

This process keeps public feedback useful without turning GitHub issues into a raw-text archive. Alfaraheedi is local-first: the app does not send reports automatically, and the web workbench report defaults to no raw text.

Use this document when classifying public reports, deciding whether a patch release is warranted, and turning reported rule behavior into release eval coverage.

## What Users Should Report

Public issues are useful for:

- **False positives**: Alfaraheedi reports a suggestion that should not be reported.
- **False negatives**: Alfaraheedi misses a suggestion that an existing shipped rule should catch.
- **UI bugs**: The local web workbench behaves incorrectly, loses state, applies the wrong fix, exports a bad report, or is hard to use.
- **Packaging bugs**: A release zip, executable, startup script, Docker image, or install path does not work.
- **LLM runtime issues**: Optional local LLM status, configuration, or suggestion flow does not match the documented local-only contract.
- **Docs issues**: Public docs are wrong, unclear, unsafe, or out of date.

Report security or privacy vulnerabilities privately instead of opening a public issue. See [../SECURITY.md](../SECURITY.md).

## What Not To Paste Publicly

Do not paste private Arabic text into a public issue. Avoid posting:

- Full documents, drafts, contracts, legal text, medical text, financial text, or personal correspondence.
- Names, addresses, phone numbers, account numbers, ID numbers, case numbers, email addresses, URLs with private tokens, or API keys.
- Proprietary, unpublished, licensed, or employer-owned text.
- Any text the original author did not agree to share publicly.

Prefer the web workbench feedback report with **No raw text** selected. If text is required to reproduce a rule issue, use the smallest public-safe example:

1. Reduce the input to the shortest phrase or sentence that still reproduces the behavior.
2. Replace private names and facts with neutral placeholders.
3. Use a synthetic sentence when it preserves the same rule behavior.
4. Include only the selected span when that is enough and safe.

The maintainer should not ask users for full private documents in public issues.

## Triage Classes

| Class | Signals | First action | Release route |
| --- | --- | --- | --- |
| False positive | A rule reports acceptable text. | Reproduce, identify the rule source, and reduce to a public-safe fixture candidate. | Patch if a shipped safe auto-apply rule can change correct text; otherwise next minor unless impact is broad. |
| False negative | A shipped rule misses text it is expected to catch. | Reproduce, identify the missing expected source, and reduce to a public-safe fixture candidate. | Patch only for a narrow regression or claimed shipped behavior; otherwise next minor. |
| UI bug | Workbench controls, analysis, apply, report export, layout, or accessibility fail. | Reproduce in the packaged local app when possible. | Patch for data loss, privacy/report-export breakage, apply corruption, or unusable release app; otherwise next minor. |
| Packaging bug | Release zip, executable, script, Docker image, asset, or fresh-clone path fails. | Reproduce from a clean checkout or downloaded release asset. | Patch when the current public release cannot install, start, smoke-test, or verify; otherwise next minor. |
| LLM runtime issue | Optional local LLM status, configuration, or suggestion path fails. | Check `docs/local-llm.md`, status output, and mock or real smoke results. | Patch if the local-only policy, status contract, or smoke path is broken; otherwise next minor. |
| Docs issue | Documentation is wrong, unclear, or unsafe. | Confirm against the current release and code behavior. | Patch if docs cause unsafe privacy behavior or a broken install/release path; otherwise next minor. |

## Patch Release Criteria

Cut a patch release when the current public release has one of these defects:

- A privacy or data-minimization bug, including raw user text being logged, retained, exported unexpectedly, or requested publicly.
- A shipped safe auto-apply rule can rewrite correct text.
- A released package cannot install, start, run `writecheck`, serve the app, or pass the documented smoke path.
- The release eval gate fails on current `main` for shipped behavior.
- The web workbench can lose user text, apply the wrong fix, corrupt offsets, or generate an unsafe feedback report.
- Public docs instruct users to do something unsafe, privacy-breaking, or release-blocking.

Use the next minor release instead for:

- New rule coverage or broader Arabic quality improvements.
- New UI features that do not fix a current release blocker.
- Optional local LLM usability improvements when the existing local-only contract still works.
- Documentation polish that does not change safe use, installation, or release verification.
- Fixture additions for newly understood behavior that did not regress from the current public release.

When in doubt, prefer a minor release unless the defect affects privacy, safe auto-apply correctness, installability, release verification, or public user trust in the current release.

## Solo Maintainer Workflow

1. Label or classify the report using the triage classes above.
2. Confirm whether the public issue contains raw or private text. If it does, remove or ask the reporter to edit it before using the content.
3. Reproduce against the current public release and current `main` when practical.
4. For rule issues, identify the exact rule source, for example `arabic:tatweel` or `arabic:latin-question-mark`.
5. Reduce or rewrite the input into the smallest public-safe case that still reproduces the behavior.
6. Add an eval fixture under `datasets/eval/reported/` when the case is public-safe and release-relevant.
7. Use `expected_behavior: "no_suggestion"` for false-positive guards and `expected_behavior: "expected_suggestion"` for false-negative guards.
8. Set `raw_text_user_provided` to `true` only when the committed fixture still contains raw user-provided text and the user explicitly agreed to public sharing.
9. Run `cargo run -p write-eval` before release or merge of rule-related fixes.
10. Decide patch versus next minor using the criteria above, then follow [release-checklist.md](release-checklist.md).

If a report cannot become a fixture, close the loop explicitly:

- **Rejected**: out of scope, non-reproducible, or based on private context that cannot be shared.
- **Redacted**: sensitive parts were removed while the behavior stayed reproducible.
- **Reduced**: the example was rewritten to a smaller public-safe case.
- **Deferred**: valid feedback, but belongs to the next minor release rather than a patch.

## Eval Linkage

Rule feedback should connect back to the release eval gate. Public-safe false positives and false negatives should either become reported fixtures or have a documented reason why they were not added.

See [evaluation.md](evaluation.md) for the fixture schema, metadata fields, and release gate command.

## Related Docs

- [evaluation.md](evaluation.md)
- [release-checklist.md](release-checklist.md)
- [privacy.md](privacy.md)
- [local-llm.md](local-llm.md)
- [../SECURITY.md](../SECURITY.md)
