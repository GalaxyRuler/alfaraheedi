use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tower_http::trace::TraceLayer;
pub use write_arabic::default_rule_set;
use write_core::{Analysis, ApplyOutcome, Engine, RuleInfo};
use write_llm::LlmStatus;

pub fn router() -> Router {
    let engine = Arc::new(default_rule_set());

    Router::new()
        .route("/healthz", get(health))
        .route("/v1/health", get(health))
        .route("/v1/analyze", post(analyze))
        .route("/v1/apply", post(apply))
        .route("/v1/rules", get(rules))
        .route("/v1/llm/status", get(llm_status))
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

#[derive(Debug, Clone, Deserialize)]
pub struct ApplyRequest {
    pub text: String,
    pub mode: ApplyMode,
}

#[derive(Debug, Clone, Serialize)]
pub struct RulesResponse {
    pub rules: Vec<RuleInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApplyMode {
    Safe,
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

async fn rules() -> Json<RulesResponse> {
    Json(RulesResponse {
        rules: write_arabic::rule_catalog(),
    })
}

async fn llm_status() -> Json<LlmStatus> {
    Json(write_llm::default_status())
}

async fn apply(
    State(engine): State<Arc<Engine>>,
    Json(request): Json<ApplyRequest>,
) -> Result<Json<ApplyOutcome>, (StatusCode, String)> {
    match request.mode {
        ApplyMode::Safe => engine
            .apply_safe(request.text)
            .map(Json)
            .map_err(|error| (StatusCode::BAD_REQUEST, error.to_string())),
    }
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::warn!(%error, "failed to install Ctrl-C handler");
    }
}
