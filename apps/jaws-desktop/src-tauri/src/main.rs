use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;
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
    release_tag: String,
    release_version: String,
    release_repo: String,
    release_url: String,
    release_api_url: String,
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
struct ChatCommandResult {
    ok: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
    summary: String,
    permission_mode: String,
    workspace_path: String,
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

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountSession {
    email: String,
    role: String,
    plan: String,
    status: String,
    saved_at: String,
    source: String,
    display_name: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseIndex {
    version: String,
    tag: String,
    repo: String,
    github: ReleaseGithub,
    mirrors: Vec<ReleaseMirror>,
    assets: Vec<ReleaseAsset>,
    updater_platforms: Vec<ReleaseUpdaterPlatform>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseGithub {
    release_url: String,
    api_url: String,
    base_asset_url: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseMirror {
    id: String,
    label: String,
    page_url: String,
    route_base_url: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseAsset {
    id: String,
    route: String,
    file: String,
    requires_signature: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseUpdaterPlatform {
    platform: String,
    asset_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePipelineEntry {
    id: String,
    label: String,
    status: String,
    detail: String,
}

fn clean_workspace_input(input: &str) -> String {
    input
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn release_index() -> ReleaseIndex {
    serde_json::from_str(include_str!("../../src/release-index.json"))
        .expect("JAWS release-index.json must be valid")
}

fn expected_asset_url(index: &ReleaseIndex, file: &str) -> String {
    format!("{}/{}", index.github.base_asset_url, file)
}

fn update_entry(
    id: impl Into<String>,
    label: impl Into<String>,
    status: &str,
    detail: impl Into<String>,
) -> UpdatePipelineEntry {
    UpdatePipelineEntry {
        id: id.into(),
        label: label.into(),
        status: status.to_string(),
        detail: detail.into(),
    }
}

fn required_asset_names(index: &ReleaseIndex) -> Vec<String> {
    let mut names = Vec::new();
    for asset in &index.assets {
        names.push(asset.file.clone());
        if asset.requires_signature {
            names.push(format!("{}.sig", asset.file));
        }
    }
    names.sort();
    names.dedup();
    names
}

fn asset_by_id<'a>(index: &'a ReleaseIndex, id: &str) -> Option<&'a ReleaseAsset> {
    index.assets.iter().find(|asset| asset.id == id)
}

async fn probe_mirror_page(
    client: &reqwest::Client,
    mirror: &ReleaseMirror,
) -> UpdatePipelineEntry {
    match client
        .get(&mirror.page_url)
        .header(reqwest::header::ACCEPT, "text/html,*/*")
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if !status.is_success() {
                return update_entry(
                    &mirror.id,
                    format!("{} mirror", mirror.label),
                    "error",
                    format!("{} returned HTTP {}.", mirror.page_url, status.as_u16()),
                );
            }
            if !body.to_ascii_lowercase().contains("jaws") {
                return update_entry(
                    &mirror.id,
                    format!("{} mirror", mirror.label),
                    "error",
                    format!(
                        "{} is reachable but did not include a JAWS marker.",
                        mirror.page_url
                    ),
                );
            }
            update_entry(
                &mirror.id,
                format!("{} mirror", mirror.label),
                "ok",
                format!(
                    "{} is reachable; download routes are rooted at {}.",
                    mirror.page_url, mirror.route_base_url
                ),
            )
        }
        Err(error) => update_entry(
            &mirror.id,
            format!("{} mirror", mirror.label),
            "error",
            format!("Mirror probe failed for {}: {error}", mirror.page_url),
        ),
    }
}

async fn probe_github_release(
    client: &reqwest::Client,
    index: &ReleaseIndex,
) -> UpdatePipelineEntry {
    match client
        .get(&index.github.api_url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                return update_entry(
                    "github",
                    "GitHub release",
                    "error",
                    format!("GitHub release API returned HTTP {}.", status.as_u16()),
                );
            }
            let body = response
                .json::<serde_json::Value>()
                .await
                .unwrap_or_default();
            let tag = body
                .get("tag_name")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let draft = body
                .get("draft")
                .and_then(|value| value.as_bool())
                .unwrap_or(true);
            if tag != index.tag || draft {
                return update_entry(
                    "github",
                    "GitHub release",
                    "error",
                    format!(
                        "Expected {} draft=false, got {tag} draft={draft}.",
                        index.tag
                    ),
                );
            }
            let assets = body
                .get("assets")
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default();
            let missing: Vec<String> = required_asset_names(index)
                .into_iter()
                .filter(|name| {
                    !assets.iter().any(|asset| {
                        asset.get("name").and_then(|value| value.as_str()) == Some(name.as_str())
                            && asset
                                .get("size")
                                .and_then(|value| value.as_u64())
                                .unwrap_or(0)
                                > 0
                    })
                })
                .collect();
            if !missing.is_empty() {
                return update_entry(
                    "github",
                    "GitHub release",
                    "error",
                    format!(
                        "{} is missing release assets: {}.",
                        index.tag,
                        missing.join(", ")
                    ),
                );
            }
            let routed_assets = index
                .assets
                .iter()
                .filter(|asset| !asset.route.is_empty())
                .count();
            update_entry(
                "github",
                "GitHub release",
                "ok",
                format!(
                    "{} is published with required signed assets and {routed_assets} routed downloads.",
                    index.tag
                ),
            )
        }
        Err(error) => update_entry(
            "github",
            "GitHub release",
            "error",
            format!("GitHub release probe failed: {error}"),
        ),
    }
}

async fn probe_updater_manifest(
    client: &reqwest::Client,
    index: &ReleaseIndex,
) -> UpdatePipelineEntry {
    let manifest_url = expected_asset_url(index, "latest.json");
    match client
        .get(&manifest_url)
        .header(reqwest::header::ACCEPT, "application/json,*/*")
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                return update_entry(
                    "manifest",
                    "Signed manifest",
                    "error",
                    format!("Updater manifest returned HTTP {}.", status.as_u16()),
                );
            }
            let body = response
                .json::<serde_json::Value>()
                .await
                .unwrap_or_default();
            let version = body
                .get("version")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            if version != index.version {
                return update_entry(
                    "manifest",
                    "Signed manifest",
                    "error",
                    format!(
                        "Manifest version mismatch: expected {}, got {version}.",
                        index.version
                    ),
                );
            }
            let mut missing = Vec::new();
            for platform in &index.updater_platforms {
                let expected_url = asset_by_id(index, &platform.asset_id)
                    .map(|asset| expected_asset_url(index, &asset.file))
                    .unwrap_or_default();
                let entry = body
                    .get("platforms")
                    .and_then(|value| value.get(&platform.platform));
                let url = entry
                    .and_then(|value| value.get("url"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                let signature = entry
                    .and_then(|value| value.get("signature"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                if url != expected_url || signature.trim().is_empty() {
                    missing.push(platform.platform.clone());
                }
            }
            if !missing.is_empty() {
                return update_entry(
                    "manifest",
                    "Signed manifest",
                    "error",
                    format!(
                        "Manifest is missing signed platform entries: {}.",
                        missing.join(", ")
                    ),
                );
            }
            update_entry(
                "manifest",
                "Signed manifest",
                "ok",
                format!("latest.json is signed for {}.", index.version),
            )
        }
        Err(error) => update_entry(
            "manifest",
            "Signed manifest",
            "error",
            format!("Updater manifest probe failed: {error}"),
        ),
    }
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

fn clean_string(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn display_name_from_email(email: &str) -> String {
    email
        .split('@')
        .next()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Founder")
        .to_string()
}

fn session_source_from_path(path: &Path, configured_source: String) -> String {
    let configured_source = configured_source.trim();
    if !configured_source.is_empty()
        && !configured_source.contains('\\')
        && !configured_source.contains('/')
        && !configured_source.contains(':')
    {
        return configured_source.to_string();
    }

    match path.file_name().and_then(|name| name.to_str()) {
        Some("jaws-local-session.json") => "local_app_config".to_string(),
        Some("jaws-admin.local.json") => "local_founder_admin".to_string(),
        _ => "local_session".to_string(),
    }
}

fn read_account_session(path: &Path) -> Option<AccountSession> {
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let email = clean_string(value.get("email"));
    if email.is_empty() {
        return None;
    }

    let role = clean_string(value.get("role"));
    let plan = clean_string(value.get("plan"));
    let display_name = clean_string(value.get("displayName"));

    Some(AccountSession {
        email,
        role: if role.is_empty() {
            "founder_admin".to_string()
        } else {
            role
        },
        plan: if plan.is_empty() {
            "admin_free_life".to_string()
        } else {
            plan
        },
        status: "signed_in".to_string(),
        saved_at: clean_string(value.get("savedAt").or_else(|| value.get("createdAt"))),
        source: session_source_from_path(path, clean_string(value.get("source"))),
        display_name: if display_name.is_empty() {
            display_name_from_email(clean_string(value.get("email")).as_str())
        } else {
            display_name
        },
    })
}

fn push_ancestor_receipts(paths: &mut Vec<PathBuf>, root: PathBuf) {
    for ancestor in root.ancestors() {
        paths.push(
            ancestor
                .join("website")
                .join(".data")
                .join("jaws-admin.local.json"),
        );
    }
}

fn account_session_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(path) = env::var("JAWS_LOCAL_SESSION_PATH") {
        paths.push(PathBuf::from(path));
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        paths.push(config_dir.join("jaws-local-session.json"));
    }

    if let Ok(current_dir) = env::current_dir() {
        push_ancestor_receipts(&mut paths, current_dir);
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            push_ancestor_receipts(&mut paths, parent.to_path_buf());
        }
    }

    paths
}

#[tauri::command]
fn account_session(app: tauri::AppHandle) -> Option<AccountSession> {
    for path in account_session_paths(&app) {
        if let Some(session) = read_account_session(&path) {
            return Some(session);
        }
    }

    None
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
            message: "Use an absolute project folder path so JAWS can route work safely."
                .to_string(),
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
    let index = release_index();
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
        release_sites: index
            .mirrors
            .iter()
            .map(|mirror| mirror.page_url.clone())
            .collect(),
        release_tag: index.tag,
        release_version: index.version,
        release_repo: index.repo,
        release_url: index.github.release_url,
        release_api_url: index.github.api_url,
    }
}

#[tauri::command]
async fn probe_release_update_pipeline() -> Vec<UpdatePipelineEntry> {
    let index = release_index();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("jaws-desktop-release-probe/0.1")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return vec![update_entry(
                "native-probe",
                "Native release probe",
                "error",
                format!("HTTP client could not be created: {error}"),
            )];
        }
    };

    let mut entries = Vec::new();
    for mirror in &index.mirrors {
        entries.push(probe_mirror_page(&client, mirror).await);
    }
    entries.push(probe_github_release(&client, &index).await);
    entries.push(probe_updater_manifest(&client, &index).await);
    entries
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

fn truncate_text(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for character in value.chars().take(max_chars) {
        output.push(character);
    }

    if value.chars().count() > max_chars {
        output.push_str("\n...[truncated]");
    }

    output.trim().to_string()
}

#[tauri::command]
async fn run_openjaws_chat(
    app: tauri::AppHandle,
    prompt: String,
    workspace_path: Option<String>,
    fast_run_mode: bool,
) -> ChatCommandResult {
    let prompt = prompt.trim();
    let permission_mode = if fast_run_mode {
        "acceptEdits"
    } else {
        "default"
    };

    if prompt.is_empty() {
        return ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "Enter a command before routing work through OpenJaws.".to_string(),
            summary: "Command was empty.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: String::new(),
        };
    }

    if prompt.chars().count() > 4_000 {
        return ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "Chat commands are capped at 4,000 characters in the desktop shell."
                .to_string(),
            summary: "Command was too long.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: String::new(),
        };
    }

    let workspace = workspace_path
        .as_deref()
        .map(|path| validate_workspace(path.to_string()))
        .filter(|workspace| workspace.valid);
    let Some(workspace) = workspace else {
        return ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "Select a valid project folder before running Chat commands.".to_string(),
            summary: "Workspace validation failed.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: String::new(),
        };
    };

    let command = match app.shell().sidecar("openjaws") {
        Ok(command) => command
            .arg("--print")
            .arg("--output-format")
            .arg("text")
            .arg("--max-turns")
            .arg("1")
            .arg("--permission-mode")
            .arg(permission_mode)
            .arg("--workload")
            .arg("jaws-desktop")
            .arg(prompt)
            .current_dir(workspace.path.clone()),
        Err(error) => {
            return ChatCommandResult {
                ok: false,
                code: None,
                stdout: String::new(),
                stderr: format!("OpenJaws sidecar unavailable: {error}"),
                summary: "Sidecar unavailable.".to_string(),
                permission_mode: permission_mode.to_string(),
                workspace_path: workspace.path,
            };
        }
    };

    match tokio::time::timeout(Duration::from_secs(120), command.output()).await {
        Ok(Ok(output)) => {
            let stdout = truncate_text(&String::from_utf8_lossy(&output.stdout), 4_000);
            let stderr = truncate_text(&String::from_utf8_lossy(&output.stderr), 2_000);
            let ok = output.status.success();
            ChatCommandResult {
                ok,
                code: output.status.code(),
                summary: if ok {
                    "OpenJaws completed the desktop Chat command.".to_string()
                } else {
                    "OpenJaws returned a non-zero exit code.".to_string()
                },
                stdout,
                stderr,
                permission_mode: permission_mode.to_string(),
                workspace_path: workspace.path,
            }
        }
        Ok(Err(error)) => ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: format!("OpenJaws Chat command failed: {error}"),
            summary: "Sidecar execution failed.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: workspace.path,
        },
        Err(_) => ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "OpenJaws Chat command timed out after 120 seconds.".to_string(),
            summary: "Sidecar command timed out.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: workspace.path,
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(updater_builder.build())
        .invoke_handler(tauri::generate_handler![
            backend_status,
            account_session,
            enrollment_links,
            openjaws_smoke,
            openjaws_workspace_smoke,
            probe_release_update_pipeline,
            resolve_workspace,
            run_openjaws_chat,
            validate_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAWS Desktop");
}
