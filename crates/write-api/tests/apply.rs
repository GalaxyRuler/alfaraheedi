use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn apply_endpoint_returns_safe_fixed_text() {
    let app = write_api::router();
    let request = Request::builder()
        .method("POST")
        .uri("/v1/apply")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "text": "مرحبــا  بالعالم",
                "mode": "safe"
            })
            .to_string(),
        ))
        .expect("request");

    let response = app.oneshot(request).await.expect("response");

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("body bytes");
    let value: serde_json::Value = serde_json::from_slice(&body).expect("json body");

    assert_eq!(value["text"], "مرحبا بالعالم");
    assert_eq!(value["applied_count"], 2);
    assert_eq!(value["skipped_count"], 0);
}
