use serde::Serialize;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendStatus {
    app_version: String,
    sidecar_name: String,
    sidecar_ready: bool,
    sidecar_message: String,
    update_channel: String,
    release_sites: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrollmentLink {
    label: String,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarSmoke {
    ok: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[tauri::command]
fn backend_status(app: tauri::AppHandle) -> BackendStatus {
    let sidecar_ready = app.shell().sidecar("openjaws").is_ok();
    BackendStatus {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        sidecar_name: "openjaws".to_string(),
        sidecar_ready,
        sidecar_message: if sidecar_ready {
            "Bundled OpenJaws sidecar is addressable.".to_string()
        } else {
            "Run prepare:sidecar before building the desktop bundle.".to_string()
        },
        update_channel: "stable".to_string(),
        release_sites: vec![
            "https://qline.site/downloads/jaws".to_string(),
            "https://iorch.net/downloads/jaws".to_string(),
        ],
    }
}

#[tauri::command]
fn enrollment_links() -> Vec<EnrollmentLink> {
    vec![
        EnrollmentLink {
            label: "Qline".to_string(),
            url: "https://qline.site".to_string(),
        },
        EnrollmentLink {
            label: "Iorch".to_string(),
            url: "https://iorch.net".to_string(),
        },
        EnrollmentLink {
            label: "GitHub".to_string(),
            url: "https://github.com/PossumXI/OpenJaws".to_string(),
        },
    ]
}

#[tauri::command]
async fn openjaws_smoke(app: tauri::AppHandle) -> SidecarSmoke {
    let command = match app.shell().sidecar("openjaws") {
        Ok(command) => command.arg("--version"),
        Err(error) => {
            return SidecarSmoke {
                ok: false,
                code: None,
                stdout: String::new(),
                stderr: format!("OpenJaws sidecar unavailable: {error}"),
            };
        }
    };

    match command.output().await {
        Ok(output) => SidecarSmoke {
            ok: output.status.success(),
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(error) => SidecarSmoke {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: format!("OpenJaws sidecar check failed: {error}"),
        },
    }
}

fn main() {
    let updater_builder = tauri_plugin_updater::Builder::new();
    let updater_builder = match option_env!("JAWS_TAURI_UPDATER_PUBLIC_KEY") {
        Some(public_key) if !public_key.trim().is_empty() => {
            updater_builder.pubkey(public_key.trim())
        }
        _ => updater_builder,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(updater_builder.build())
        .invoke_handler(tauri::generate_handler![
            backend_status,
            enrollment_links,
            openjaws_smoke
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAWS Desktop");
}
