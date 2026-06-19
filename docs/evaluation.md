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
- Failure rows with `kind` set to `false_positive` or `missing_expected`.
