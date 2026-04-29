use serde::Serialize;
use std::path::{Path, PathBuf};
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceStatus {
    path: String,
    name: String,
    valid: bool,
    message: String,
    tui_command: String,
}

fn clean_workspace_input(input: &str) -> String {
    input
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn workspace_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Workspace")
        .to_string()
}

fn quote_shell_path(path: &str) -> String {
    format!("\"{}\"", path.replace('"', "\\\""))
}

fn build_tui_command(path: &Path) -> String {
    let display = path.display().to_string();
    if cfg!(target_os = "windows") {
        format!("cd /d {} && openjaws", quote_shell_path(&display))
    } else {
        format!("cd {} && openjaws", quote_shell_path(&display))
    }
}

#[tauri::command]
fn validate_workspace(path: String) -> WorkspaceStatus {
    let cleaned = clean_workspace_input(&path);
    if cleaned.is_empty() {
        return WorkspaceStatus {
            path: String::new(),
            name: "No workspace".to_string(),
            valid: false,
            message: "Set a project folder to bind JAWS to a workspace.".to_string(),
            tui_command: "openjaws".to_string(),
        };
    }

    let candidate = PathBuf::from(&cleaned);
    if !candidate.is_absolute() {
        return WorkspaceStatus {
            path: cleaned,
            name: "Relative path".to_string(),
            valid: false,
            message: "Use an absolute project folder path so JAWS can route work safely.".to_string(),
            tui_command: "openjaws".to_string(),
        };
    }

    match candidate.canonicalize() {
        Ok(canonical) if canonical.is_dir() => WorkspaceStatus {
            path: canonical.display().to_string(),
            name: workspace_name(&canonical),
            valid: true,
            message: "Project folder is ready for the embedded OpenJaws TUI.".to_string(),
            tui_command: build_tui_command(&canonical),
        },
        Ok(_) => WorkspaceStatus {
            path: cleaned,
            name: "Not a folder".to_string(),
            valid: false,
            message: "The selected path exists but is not a folder.".to_string(),
            tui_command: "openjaws".to_string(),
        },
        Err(error) => WorkspaceStatus {
            path: cleaned,
            name: "Unavailable".to_string(),
            valid: false,
            message: format!("Project folder could not be opened: {error}"),
            tui_command: "openjaws".to_string(),
        },
    }
}

#[tauri::command]
fn resolve_workspace(path: String) -> WorkspaceStatus {
    validate_workspace(path)
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
async fn openjaws_smoke(app: tauri::AppHandle, workspace_path: Option<String>) -> SidecarSmoke {
    let workspace = workspace_path
        .as_deref()
        .map(|path| validate_workspace(path.to_string()))
        .filter(|workspace| workspace.valid);
    let command = match app.shell().sidecar("openjaws") {
        Ok(command) => {
            let command = command.arg("--version");
            match workspace {
                Some(workspace) => command.current_dir(workspace.path),
                _ => command,
            }
        }
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

#[tauri::command]
async fn openjaws_workspace_smoke(app: tauri::AppHandle, path: String) -> SidecarSmoke {
    openjaws_smoke(app, Some(path)).await
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
            openjaws_smoke,
            openjaws_workspace_smoke,
            resolve_workspace,
            validate_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAWS Desktop");
}
