use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn rules_endpoint_lists_arabic_rules() {
    let app = write_api::router();
    let request = Request::builder()
        .method("GET")
        .uri("/v1/rules")
        .body(Body::empty())
        .expect("request");

    let response = app.oneshot(request).await.expect("response");

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("body");
    let value: serde_json::Value = serde_json::from_slice(&body).expect("json");

    let rules = value["rules"].as_array().expect("rules array");
    assert!(rules.iter().any(|rule| rule["source"] == "arabic:tatweel"));
    assert!(
        rules
            .iter()
            .any(|rule| rule["source"] == "arabic:repeated-space")
    );
}
