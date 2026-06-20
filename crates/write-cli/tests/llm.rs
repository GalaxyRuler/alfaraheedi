use std::process::Command;

#[test]
fn llm_status_prints_default_cpu_model() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "status"])
        .env_remove("ALFARAHEEDI_LLM_BASE_URL")
        .env_remove("ALFARAHEEDI_LLM_MODEL")
        .env_remove("ALFARAHEEDI_LLM_TIMEOUT_MS")
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
        .env_remove("ALFARAHEEDI_LLM_BASE_URL")
        .env_remove("ALFARAHEEDI_LLM_MODEL")
        .env_remove("ALFARAHEEDI_LLM_TIMEOUT_MS")
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

#[test]
fn llm_doctor_skips_without_runtime_config() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "doctor"])
        .env_remove("ALFARAHEEDI_LLM_BASE_URL")
        .env_remove("ALFARAHEEDI_LLM_MODEL")
        .env_remove("ALFARAHEEDI_LLM_TIMEOUT_MS")
        .output()
        .expect("run writecheck");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("stdout");
    assert!(stdout.contains("Local LLM doctor: skipped"));
    assert!(stdout.contains("ALFARAHEEDI_LLM_BASE_URL"));
    assert!(stdout.contains("suggestion-only"));
    assert!(stdout.contains("no bundled weights"));
}

#[test]
fn llm_doctor_json_reports_skip_without_runtime_config() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "doctor", "--format", "json"])
        .env_remove("ALFARAHEEDI_LLM_BASE_URL")
        .env_remove("ALFARAHEEDI_LLM_MODEL")
        .env_remove("ALFARAHEEDI_LLM_TIMEOUT_MS")
        .output()
        .expect("run writecheck");

    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json stdout");

    assert_eq!(value["ok"], true);
    assert_eq!(value["available"], false);
    assert_eq!(value["runtime"], serde_json::Value::Null);
    assert!(
        value["checks"]
            .as_array()
            .expect("checks")
            .iter()
            .any(|check| { check["name"] == "runtime_config" && check["outcome"] == "skip" })
    );
}

#[test]
fn llm_doctor_rejects_non_local_runtime_url() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "doctor"])
        .env("ALFARAHEEDI_LLM_BASE_URL", "https://example.com")
        .env("ALFARAHEEDI_LLM_MODEL", "qwen3-1.7b-q4_k_m")
        .env_remove("ALFARAHEEDI_LLM_TIMEOUT_MS")
        .output()
        .expect("run writecheck");

    assert!(!output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("stdout");
    let stderr = String::from_utf8(output.stderr).expect("stderr");
    assert!(stdout.contains("Local LLM doctor: failed"));
    assert!(stdout.contains("base_url"));
    assert!(stdout.contains("local loopback runtime"));
    assert!(stderr.contains("blocking issues"));
}

#[test]
fn llm_suggest_requires_local_runtime_config() {
    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["llm", "suggest"])
        .env_remove("ALFARAHEEDI_LLM_BASE_URL")
        .env_remove("ALFARAHEEDI_LLM_MODEL")
        .env_remove("ALFARAHEEDI_LLM_TIMEOUT_MS")
        .output()
        .expect("run writecheck");

    assert!(!output.status.success());
    let stderr = String::from_utf8(output.stderr).expect("stderr");
    assert!(stderr.contains("ALFARAHEEDI_LLM_BASE_URL"));
}
