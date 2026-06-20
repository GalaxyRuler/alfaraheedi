use std::{
    io::{self, Read},
    net::SocketAddr,
    path::PathBuf,
};

use anyhow::Context;
use clap::{Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(name = "writecheck")]
#[command(about = "Local-first Arabic writing checker")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Check {
        path: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    Fix {
        path: PathBuf,
        #[arg(long)]
        safe: bool,
        #[arg(long)]
        output: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    Serve {
        #[arg(long, default_value = "127.0.0.1:3000")]
        addr: SocketAddr,
        #[arg(long)]
        frontend_dir: Option<PathBuf>,
    },
    Llm {
        #[command(subcommand)]
        command: LlmCommand,
    },
}

#[derive(Debug, Subcommand)]
enum LlmCommand {
    Status {
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    Doctor {
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    Suggest {
        path: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum OutputFormat {
    Json,
    Text,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Check { path, format } => check(path, format),
        Command::Fix {
            path,
            safe,
            output,
            format,
        } => fix(path, safe, output, format),
        Command::Serve { addr, frontend_dir } => {
            init_tracing();
            write_api::serve(addr, frontend_dir).await
        }
        Command::Llm { command } => match command {
            LlmCommand::Status { format } => llm_status(format).await,
            LlmCommand::Doctor { format } => llm_doctor(format).await,
            LlmCommand::Suggest { path, format } => llm_suggest(path, format).await,
        },
    }
}

fn check(path: Option<PathBuf>, format: OutputFormat) -> anyhow::Result<()> {
    let text = read_input(path)?;
    let engine = write_api::default_rule_set();
    let analysis = engine.analyze(text);

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&analysis)?);
        }
        OutputFormat::Text => {
            if analysis.suggestions.is_empty() {
                println!("No suggestions.");
            } else {
                for suggestion in analysis.suggestions {
                    println!(
                        "{} {}..{}: {} -> {:?}",
                        suggestion.source,
                        suggestion.span.start_byte,
                        suggestion.span.end_byte,
                        suggestion.original,
                        suggestion.replacements
                    );
                }
            }
        }
    }

    Ok(())
}

fn fix(
    path: PathBuf,
    safe: bool,
    output: Option<PathBuf>,
    format: OutputFormat,
) -> anyhow::Result<()> {
    anyhow::ensure!(safe, "MVP only supports --safe fixes");

    let text = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read input file {}", path.display()))?;
    let engine = write_api::default_rule_set();
    let outcome = engine.apply_safe(text)?;

    match format {
        OutputFormat::Json => {
            let json = serde_json::to_string_pretty(&outcome)?;
            if let Some(output) = output {
                std::fs::write(&output, format!("{json}\n"))
                    .with_context(|| format!("failed to write output file {}", output.display()))?;
            } else {
                println!("{json}");
            }
        }
        OutputFormat::Text => {
            if let Some(output) = output {
                std::fs::write(&output, &outcome.text)
                    .with_context(|| format!("failed to write output file {}", output.display()))?;
            } else {
                println!("{}", outcome.text);
            }
        }
    }

    Ok(())
}

async fn llm_status(format: OutputFormat) -> anyhow::Result<()> {
    let status = if let Some(config) = write_llm::LlmRuntimeConfig::from_env() {
        write_llm::runtime_status(&config).await
    } else {
        write_llm::default_status()
    };

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&status)?);
        }
        OutputFormat::Text => {
            println!(
                "Local LLM: {}",
                if status.available {
                    "available"
                } else {
                    "not configured"
                }
            );
            println!("Reason: {}", status.reason);
            println!("Default model: {}", status.catalog.policy.default_model_id);
            println!(
                "Policy: suggestion-only; no bundled weights; no hosted fallback; no raw text logging"
            );
            println!("Candidates:");
            for model in status.catalog.models {
                println!(
                    "- {} ({}, {}, ~{} MB RAM): {}/{}",
                    model.id,
                    model.display_name,
                    model.quantization,
                    model.estimated_min_ram_mb,
                    model.repo,
                    model.filename
                );
            }
        }
    }

    Ok(())
}

async fn llm_doctor(format: OutputFormat) -> anyhow::Result<()> {
    let report = write_llm::doctor_from_env().await;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        OutputFormat::Text => {
            let state = if report.ok && report.available {
                "passed"
            } else if report.ok {
                "skipped"
            } else {
                "failed"
            };
            println!("Local LLM doctor: {state}");
            println!("Summary: {}", report.summary);
            if let Some(runtime) = &report.runtime {
                println!("Runtime: {}", runtime.base_url);
                println!("Model: {}", runtime.model_id);
                println!("Timeout: {} ms", runtime.timeout_ms);
            }
            println!("Checks:");
            for check in &report.checks {
                println!(
                    "- {}: {}: {}",
                    check.name,
                    doctor_outcome_label(check.outcome),
                    check.message
                );
            }
        }
    }

    anyhow::ensure!(report.ok, "local LLM doctor found blocking issues");
    Ok(())
}

fn doctor_outcome_label(outcome: write_llm::LlmDoctorOutcome) -> &'static str {
    match outcome {
        write_llm::LlmDoctorOutcome::Pass => "pass",
        write_llm::LlmDoctorOutcome::Warn => "warn",
        write_llm::LlmDoctorOutcome::Fail => "fail",
        write_llm::LlmDoctorOutcome::Skip => "skip",
    }
}

async fn llm_suggest(path: Option<PathBuf>, format: OutputFormat) -> anyhow::Result<()> {
    let text = read_input(path)?;
    let config =
        write_llm::LlmRuntimeConfig::from_env().ok_or(write_llm::LlmError::NotConfigured)?;
    let suggestion = write_llm::suggest(&config, &text).await?;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&suggestion)?);
        }
        OutputFormat::Text => {
            println!("{}", suggestion.replacement);
            println!();
            println!("Explanation: {}", suggestion.explanation);
            println!("Model: {}", suggestion.model_id);
            println!("Safe auto-apply: {}", suggestion.safe_auto_apply);
        }
    }

    Ok(())
}

fn read_input(path: Option<PathBuf>) -> anyhow::Result<String> {
    if let Some(path) = path {
        std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read input file {}", path.display()))
    } else {
        let mut input = String::new();
        io::stdin()
            .read_to_string(&mut input)
            .context("failed to read standard input")?;
        Ok(input)
    }
}

fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt().with_env_filter(env_filter).init();
}
