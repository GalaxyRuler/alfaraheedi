use std::process::Command;

#[test]
fn llm_status_prints_default_cpu_model() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "status"])
        .output()
        .expect("run writecheck");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("stdout");
    assert!(stdout.contains("Local LLM: not configured"));
    assert!(stdout.contains("qwen3-1.7b-q4_k_m"));
    assert!(stdout.contains("no bundled weights"));
}

#[test]
fn llm_status_json_reports_suggestion_only_policy() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "status", "--format", "json"])
        .output()
        .expect("run writecheck");

    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json stdout");

    assert_eq!(value["available"], false);
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
}
