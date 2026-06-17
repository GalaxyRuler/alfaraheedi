# Evaluation

The public MVP uses a small release eval suite to prevent obvious false positives and protected-span corruption.

The eval suite is not a claim of broad Arabic grammar coverage. It is a release gate for the rules currently shipped.

## Gates

- Auto-apply rules must have zero false positives in the release eval suite.
- Suggest-only rules must not fire inside protected spans.
- Known-correct examples must remain clean for safe auto-apply rules.

## Command

```powershell
cargo run -p write-eval
```

The command prints JSON and exits non-zero on release-gating failures.
