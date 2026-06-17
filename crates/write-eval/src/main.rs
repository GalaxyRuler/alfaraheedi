use anyhow::ensure;
use write_arabic::default_rule_set;
use write_eval::{evaluate, seed_cases};

fn main() -> anyhow::Result<()> {
    let cases = seed_cases()?;
    let engine = default_rule_set();
    let report = evaluate(&engine, &cases);

    println!("{}", serde_json::to_string_pretty(&report)?);

    ensure!(
        report.failures.is_empty(),
        "seed eval produced {} failures",
        report.failures.len()
    );
    ensure!(
        report.precision >= 0.98,
        "seed eval precision {} is below 0.98",
        report.precision
    );

    Ok(())
}
