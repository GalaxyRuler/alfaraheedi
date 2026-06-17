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
        Command::Serve { addr } => {
            init_tracing();
            write_api::serve(addr).await
        }
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
