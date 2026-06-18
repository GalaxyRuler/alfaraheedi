# Model And Data Policy

Code licenses and data licenses are tracked separately. The public MVP ships source code and a small project-owned seed eval set; it does not ship corpora, dictionaries, model weights, or non-commercial datasets.

- GPL tools may be studied as specifications or called out-of-process when legally appropriate, but GPL code is not linked into Rust crates.
- GPL or restricted datasets are never bundled in the repository, Docker image, or default install.
- AyaSpell must be consumed under its MPL/LGPL option, not GPL, if used.
- CAMeL Tools code is MIT, but common CALIMA morphology databases are LDC/non-commercial research assets. They must be gated behind a research/non-commercial profile and kept swappable.
- QALB is restrictive and must not be committed or used to train shipped default models.
- Model registry entries must be per variant, with a `commercial_ok` flag per variant rather than per family.
- Hosted/default profiles may only fetch `commercial_ok = true` assets.
- New eval data must be project-owned, permissively licensed, or documented with explicit redistribution rights before it is committed.
