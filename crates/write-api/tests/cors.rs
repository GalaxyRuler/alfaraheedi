use axum::http::{Request, StatusCode};
use tower::ServiceExt;

#[tokio::test]
async fn preflight_allows_local_origin() {
    let app = write_api::router();
    let request = Request::builder()
        .method("OPTIONS")
        .uri("/v1/analyze")
        .header("origin", "http://localhost:5173")
        .header("access-control-request-method", "POST")
        .header("access-control-request-headers", "content-type")
        .body(axum::body::Body::empty())
        .expect("request");

    let response = app.oneshot(request).await.expect("response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|value| value.to_str().ok()),
        Some("http://localhost:5173"),
    );
}

#[tokio::test]
async fn preflight_rejects_remote_origin() {
    let app = write_api::router();
    let request = Request::builder()
        .method("OPTIONS")
        .uri("/v1/analyze")
        .header("origin", "http://example.com")
        .header("access-control-request-method", "POST")
        .header("access-control-request-headers", "content-type")
        .body(axum::body::Body::empty())
        .expect("request");

    let response = app.oneshot(request).await.expect("response");

    assert!(
        response
            .headers()
            .get("access-control-allow-origin")
            .is_none(),
        "remote origin must not be allowed",
    );
}
