use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, Method, StatusCode, header},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
pub use write_arabic::default_rule_set;
use write_core::{Analysis, ApplyOutcome, Engine, RuleInfo};
use write_llm::{LlmRuntimeConfig, LlmStatus, LlmSuggestion};

pub fn router() -> Router {
    router_with_options(LlmRuntimeConfig::from_env(), None)
}

pub fn router_with_llm_config(llm_config: Option<LlmRuntimeConfig>) -> Router {
    router_with_options(llm_config, None)
}

pub fn router_with_frontend(frontend_dir: Option<PathBuf>) -> Router {
    router_with_options(LlmRuntimeConfig::from_env(), frontend_dir)
}

pub fn router_with_options(
    llm_config: Option<LlmRuntimeConfig>,
    frontend_dir: Option<PathBuf>,
) -> Router {
    let engine = Arc::new(default_rule_set());
    let state = AppState { engine, llm_config };

    let router = Router::new()
        .route("/healthz", get(health))
        .route("/v1/health", get(health))
        .route("/v1/analyze", post(analyze))
        .route("/v1/apply", post(apply))
        .route("/v1/rules", get(rules))
        .route("/v1/llm/status", get(llm_status))
        .route("/v1/llm/suggest", post(llm_suggest))
        .layer(local_dev_cors())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    if let Some(frontend_dir) = frontend_dir {
        let index = frontend_dir.join("index.html");
        router
            .fallback_service(ServeDir::new(frontend_dir).not_found_service(ServeFile::new(index)))
    } else {
        router
    }
}

#[derive(Clone)]
struct AppState {
    engine: Arc<Engine>,
    llm_config: Option<LlmRuntimeConfig>,
}

/// CORS for local development only.
///
/// The local-first frontend is served by a separate dev server, such as Vite
/// on `http://localhost:5173`, and talks to this API on another port. This
/// layer allows only loopback origins so a local frontend works without
/// exposing the API to arbitrary websites.
fn local_dev_cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin.to_str().is_ok_and(is_local_origin)
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE])
}

fn is_local_origin(origin: &str) -> bool {
    let Some(authority) = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
    else {
        return false;
    };

    let authority = authority.split('/').next().unwrap_or(authority);
    let host = match authority.rsplit_once(':') {
        Some((host, port)) if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) => host,
        _ => authority,
    };

    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

pub async fn serve(addr: SocketAddr, frontend_dir: Option<PathBuf>) -> anyhow::Result<()> {
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind API listener at {addr}"))?;

    tracing::info!(%addr, "write-api listening");

    axum::serve(listener, router_with_frontend(frontend_dir))
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

#[derive(Debug, Clone, Deserialize)]
pub struct LlmSuggestRequest {
    pub text: String,
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
    State(state): State<AppState>,
    Json(request): Json<AnalyzeRequest>,
) -> Json<Analysis> {
    Json(state.engine.analyze(request.text))
}

async fn rules() -> Json<RulesResponse> {
    Json(RulesResponse {
        rules: write_arabic::rule_catalog(),
    })
}

async fn llm_status(State(state): State<AppState>) -> Json<LlmStatus> {
    if let Some(config) = &state.llm_config {
        Json(write_llm::runtime_status(config).await)
    } else {
        Json(write_llm::default_status())
    }
}

async fn llm_suggest(
    State(state): State<AppState>,
    Json(request): Json<LlmSuggestRequest>,
) -> Result<Json<LlmSuggestion>, (StatusCode, String)> {
    let Some(config) = &state.llm_config else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            write_llm::LlmError::NotConfigured.to_string(),
        ));
    };

    write_llm::suggest(config, &request.text)
        .await
        .map(Json)
        .map_err(llm_error_response)
}

async fn apply(
    State(state): State<AppState>,
    Json(request): Json<ApplyRequest>,
) -> Result<Json<ApplyOutcome>, (StatusCode, String)> {
    match request.mode {
        ApplyMode::Safe => state
            .engine
            .apply_safe(request.text)
            .map(Json)
            .map_err(|error| (StatusCode::BAD_REQUEST, error.to_string())),
    }
}

fn llm_error_response(error: write_llm::LlmError) -> (StatusCode, String) {
    let status = match error {
        write_llm::LlmError::NotConfigured => StatusCode::SERVICE_UNAVAILABLE,
        write_llm::LlmError::InputTooLong { .. } => StatusCode::PAYLOAD_TOO_LARGE,
        write_llm::LlmError::Http { .. }
        | write_llm::LlmError::Request(_)
        | write_llm::LlmError::Client(_)
        | write_llm::LlmError::InvalidStatusResponse
        | write_llm::LlmError::EmptyResponse
        | write_llm::LlmError::InvalidResponse
        | write_llm::LlmError::EmptyReplacement => StatusCode::BAD_GATEWAY,
    };

    (status, error.to_string())
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::warn!(%error, "failed to install Ctrl-C handler");
    }
}
