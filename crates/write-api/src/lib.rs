use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tower_http::trace::TraceLayer;
pub use write_arabic::default_rule_set;
use write_core::{Analysis, Engine};

pub fn router() -> Router {
    let engine = Arc::new(default_rule_set());

    Router::new()
        .route("/healthz", get(health))
        .route("/v1/health", get(health))
        .route("/v1/analyze", post(analyze))
        .layer(TraceLayer::new_for_http())
        .with_state(engine)
}

pub async fn serve(addr: SocketAddr) -> anyhow::Result<()> {
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind API listener at {addr}"))?;

    tracing::info!(%addr, "write-api listening");

    axum::serve(listener, router())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("write-api server failed")
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnalyzeRequest {
    pub text: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "write-api",
    })
}

async fn analyze(
    State(engine): State<Arc<Engine>>,
    Json(request): Json<AnalyzeRequest>,
) -> Json<Analysis> {
    Json(engine.analyze(request.text))
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::warn!(%error, "failed to install Ctrl-C handler");
    }
}
