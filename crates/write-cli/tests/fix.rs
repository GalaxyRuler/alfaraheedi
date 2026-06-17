use std::{fs, process::Command};

fn write_temp_file(name: &str, content: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("alfaraheedi-{}-{}", std::process::id(), name));
    fs::write(&path, content).expect("write temp file");
    path
}

#[test]
fn fix_safe_prints_fixed_text_to_stdout() {
    let input = write_temp_file("fix-safe.txt", "مرحبــا  بالعالم");

    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["fix", "--safe"])
        .arg(&input)
        .output()
        .expect("run writecheck");

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).expect("stdout"),
        "مرحبا بالعالم\n"
    );
}

#[test]
fn fix_safe_writes_output_file_without_modifying_input() {
    let input = write_temp_file("fix-safe-input.txt", "مرحبــا  بالعالم");
    let output_path =
        std::env::temp_dir().join(format!("alfaraheedi-{}-fixed.txt", std::process::id()));
    let _ = fs::remove_file(&output_path);

    let output = Command::new(env!("CARGO_BIN_EXE_writecheck"))
        .args(["fix", "--safe"])
        .arg(&input)
        .args(["--output"])
        .arg(&output_path)
        .output()
        .expect("run writecheck");

    assert!(output.status.success());
    assert_eq!(
        fs::read_to_string(&input).expect("input text"),
        "مرحبــا  بالعالم"
    );
    assert_eq!(
        fs::read_to_string(&output_path).expect("output text"),
        "مرحبا بالعالم"
    );
}
