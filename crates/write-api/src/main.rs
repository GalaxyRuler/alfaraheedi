use std::{net::SocketAddr, path::PathBuf};

use anyhow::Context;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let addr = std::env::var("WRITECHECK_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:3000".to_owned())
        .parse::<SocketAddr>()
        .context("WRITECHECK_ADDR must be a socket address such as 127.0.0.1:3000")?;

    let frontend_dir = std::env::var("WRITECHECK_FRONTEND_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);

    write_api::serve(addr, frontend_dir).await
}

fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt().with_env_filter(env_filter).init();
}
