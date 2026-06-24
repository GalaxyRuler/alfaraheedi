# Evaluation

The public MVP uses a small release eval suite to prevent obvious false positives and protected-span corruption.

The eval suite is not a claim of broad Arabic grammar coverage. It is a release gate for the rules currently shipped.

## Gates

- Auto-apply rules must have zero false positives in the release eval suite.
- Suggest-only rules must not fire inside protected spans.
- Known-correct examples must remain clean for safe auto-apply rules.
- Expected rules must be present. Missing expected sources are false negatives and fail the release gate.
- Overall precision and recall must each stay at or above `0.98`.

## Command

```powershell
cargo run -p write-eval
```

The command prints JSON and exits non-zero on release-gating failures. The report includes:

- `true_positives`, `false_positives`, and `false_negatives`.
- Overall `precision` and `recall`.
- Rule-level precision and recall.
- `release_blocked`, which is `true` when any release-blocking fixture fails or
  an explicit `blocked_sources` entry is present.
- `false_positives_by_rule` and `false_negatives_by_rule`, each listing the
  affected case ids by rule source.
- Failure rows with `kind` set to `false_positive` or `missing_expected`.
- Failure rows include `fixture_file` and `case_id` so CI output can point back
  to the exact JSON or JSONL fixture.

## v1.0 Fixture Files

The v1.0 release fixtures live in JSONL files so focused cases can be appended
without rewriting large arrays:

- `datasets/eval/v1.0-arabic.jsonl`
- `datasets/eval/v1.0-english.jsonl`
- `datasets/eval/v1.0-mixed.jsonl`

Each row uses the normal eval fields plus:

- `mode`: `arabic`, `english`, or `mixed`.
- `blocked_sources`: explicit release blockers that do not depend on a rule
  firing, usually for manual QA or policy evidence.
- `notes`: public-safe context for maintainers.

Every new safe rule must add at least one positive fixture, two negative
fixtures, and a false-positive guard when there is an obvious risk. The current
rule taxonomy is:

| Taxonomy | Current category/source examples |
| --- | --- |
| spelling-like | `english:common-typo` |
| punctuation | `arabic:latin-comma`, `arabic:latin-question-mark`, `arabic:latin-semicolon` |
| spacing | `arabic:repeated-space`, `arabic:space-before-punctuation`, `arabic:space-after-punctuation` |
| grammar | `arabic:conversational-greeting`, `english:you-are-do` |
| style | future suggest-only rules; no v1.0 safe auto-apply style rule |
| LLM-only | optional local LLM suggestions; never safe auto-apply in v1.0 |

## Report-Derived Fixtures

User feedback reports can become eval fixtures only after maintainer review. The goal is to preserve the smallest public-safe regression case, not to archive user text.

Use [feedback-triage.md](feedback-triage.md) first to classify the report and decide whether it belongs in a patch release or the next minor release.

Review checklist:

1. Classify the report as a false positive, false negative, UI bug, packaging bug, LLM runtime issue, or docs issue.
2. Confirm the rule source under review, for example `arabic:tatweel` or `arabic:latin-question-mark`.
3. Reduce the text to the shortest example that still reproduces the behavior.
4. Remove names, private facts, URLs, emails, IDs, and any text the user did not explicitly agree to share publicly.
5. Set `raw_text_user_provided` to `true` only when the committed fixture still contains raw user-provided text.
6. Reject the fixture if it cannot be minimized or redacted into a public-safe case.
7. Run `cargo run -p write-eval` before release. The gate remains strict: zero false positives and zero false negatives in the committed suite.

Reported fixture files live under `datasets/eval/reported/`. Each reported case keeps the normal eval fields plus metadata:

```json
{
  "id": "reported-v0-4-false-negative-question-mark",
  "text": "هل وصلت? نعم",
  "expected_sources": ["arabic:latin-question-mark"],
  "max_false_positives": 0,
  "metadata": {
    "source": {
      "kind": "maintainer_reduced_report",
      "reference": "github-issue-4-public-safe-seed"
    },
    "rule_source": "arabic:latin-question-mark",
    "expected_behavior": "expected_suggestion",
    "raw_text_user_provided": false,
    "notes": "Public-safe reduced fixture."
  }
}
```

`expected_behavior` is `no_suggestion` for false-positive guards and `expected_suggestion` for false-negative guards. The fixture loader validates that this metadata matches `expected_sources` before evaluation runs.

When a report is not committed as a fixture:

- **Rejected**: the behavior is out of scope, non-reproducible, or depends on private context that cannot be removed.
- **Redacted**: sensitive spans are removed while the same rule behavior remains reproducible.
- **Reduced**: the example is rewritten to a minimal public-safe sentence that preserves the rule behavior.

These fixtures protect shipped rules only. They do not imply broad Arabic grammar coverage.
