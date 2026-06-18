use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn llm_status_endpoint_reports_local_only_policy() {
    let app = write_api::router();
    let request = Request::builder()
        .method("GET")
        .uri("/v1/llm/status")
        .body(Body::empty())
        .expect("request");

    let response = app.oneshot(request).await.expect("response");

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("body");
    let value: serde_json::Value = serde_json::from_slice(&body).expect("json");

    assert_eq!(value["available"], false);
    assert_eq!(value["catalog"]["policy"]["bundled_weights"], false);
    assert_eq!(
        value["catalog"]["policy"]["decision_role"],
        "suggestion_only"
    );
    assert_eq!(
        value["catalog"]["policy"]["inference_runtime"],
        "local_openai_compatible_server"
    );
    assert_eq!(
        value["catalog"]["policy"]["default_model_id"],
        "qwen3-1.7b-q4_k_m"
    );
    assert!(
        value["catalog"]["models"]
            .as_array()
            .expect("models array")
            .iter()
            .any(|model| model["id"] == "qwen3-0.6b-q4_0")
    );
}
