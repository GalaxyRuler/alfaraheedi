#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--qa-probe-desktop-overlay") {
        match alfaraheedi_desktop::desktop_overlay_probe_qa_json() {
            Ok(json) => {
                println!("{json}");
                return;
            }
            Err(error) => {
                eprintln!("Could not serialize desktop overlay probe: {error}");
                std::process::exit(1);
            }
        }
    }

    alfaraheedi_desktop::run();
}
