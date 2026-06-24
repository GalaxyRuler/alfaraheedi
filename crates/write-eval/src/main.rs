use anyhow::ensure;
use write_arabic::ArabicRuleSet;
use write_core::Engine;
use write_english::EnglishRuleSet;
use write_eval::{evaluate, seed_cases};

fn main() -> anyhow::Result<()> {
    let cases = seed_cases()?;
    let engine = Engine::new()
        .with_rule(ArabicRuleSet)
        .with_rule(EnglishRuleSet);
    let report = evaluate(&engine, &cases);

    println!("{}", serde_json::to_string_pretty(&report)?);

    ensure!(
        report.failures.is_empty(),
        "seed eval produced {} failures",
        report.failures.len()
    );
    ensure!(
        !report.release_blocked,
        "seed eval release is blocked by {} blockers",
        report.release_blockers.len()
    );
    ensure!(
        report.precision >= 0.98,
        "seed eval precision {} is below 0.98",
        report.precision
    );
    ensure!(
        report.recall >= 0.98,
        "seed eval recall {} is below 0.98",
        report.recall
    );

    Ok(())
}
