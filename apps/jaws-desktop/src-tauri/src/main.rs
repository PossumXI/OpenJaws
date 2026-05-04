use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRuntimeSnapshot {
    checked_at: String,
    source: String,
    summary: String,
    queue_count: usize,
    worker_count: usize,
    runtime_count: usize,
    events: Vec<AgentRuntimeEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRuntimeEvent {
    time: String,
    lane: String,
    detail: String,
    state: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserPreviewSessionSummary {
    id: String,
    action: String,
    intent: String,
    requested_by: String,
    started_at: String,
    opened: bool,
    note: String,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserPreviewSnapshot {
    checked_at: String,
    receipt_path: String,
    receipt_exists: bool,
    receipt_summary: String,
    session_count: usize,
    launch_config_path: String,
    launch_config_exists: bool,
    launch_url: String,
    dev_command: String,
    preview_command: String,
    playwright_codegen_command: String,
    playwright_test_command: String,
    sessions: Vec<BrowserPreviewSessionSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewLaunchConfigResult {
    ok: bool,
    path: String,
    message: String,
    url: String,
    dev_command: String,
    preview_command: String,
    playwright_codegen_command: String,
    playwright_test_command: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewDemoHarnessResult {
    ok: bool,
    output_dir: String,
    message: String,
    name: String,
    slug: String,
    url: String,
    dev_command: String,
    preview_command: String,
    playwright_install_command: String,
    playwright_codegen_command: String,
    playwright_test_command: String,
    playwright_headed_command: String,
    readme_path: String,
    package_path: String,
    config_path: String,
    spec_path: String,
    receipt_path: String,
    receipt_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QAgentsCoworkPlan {
    mode: String,
    room_code: String,
    shared_phase_memory: bool,
    pooled_credits: bool,
    route_policy: String,
    controls: Vec<QAgentsCoworkControl>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QAgentsCoworkControl {
    id: String,
    label: String,
    detail: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InferenceCommandResult {
    ok: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
    summary: String,
    provider: String,
    model: String,
    base_url: String,
    auth_label: String,
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

fn now_unix_label() -> String {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => format!("unix:{}", duration.as_secs()),
        Err(_) => "unix:0".to_string(),
    }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

fn push_runtime_root_candidates(paths: &mut Vec<PathBuf>, start: PathBuf) {
    let root = if start.is_file() {
        start
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| start.clone())
    } else {
        start
    };

    for ancestor in root.ancestors() {
        push_unique_path(paths, ancestor.to_path_buf());
    }
}

fn candidate_runtime_roots(workspace_path: Option<String>) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(path) = workspace_path {
        let cleaned = clean_workspace_input(&path);
        if !cleaned.is_empty() {
            let candidate = PathBuf::from(cleaned);
            if candidate.is_absolute() {
                if let Ok(canonical) = candidate.canonicalize() {
                    if canonical.is_dir() {
                        push_runtime_root_candidates(&mut roots, canonical);
                    }
                }
            }
        }
    }

    if let Ok(current_dir) = env::current_dir() {
        push_runtime_root_candidates(&mut roots, current_dir);
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            push_runtime_root_candidates(&mut roots, parent.to_path_buf());
        }
    }

    if roots.is_empty() {
        roots.push(PathBuf::from("."));
    }

    roots
}

fn q_runtime_paths_exist(q_runs_dir: &Path) -> bool {
    q_runs_dir.join("route-queue.json").exists()
        || q_runs_dir.join("route-workers.json").exists()
        || q_runs_dir.join("route-worker-runtime.json").exists()
}

fn select_q_runs_dir(workspace_path: Option<String>) -> (PathBuf, bool) {
    let roots = candidate_runtime_roots(workspace_path);
    for root in &roots {
        let q_runs_dir = root.join("artifacts").join("q-runs");
        if q_runtime_paths_exist(&q_runs_dir) {
            return (q_runs_dir, true);
        }
    }

    let fallback = roots
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("artifacts")
        .join("q-runs");
    (fallback, false)
}

fn read_json_array(path: &Path) -> Vec<serde_json::Value> {
    match fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
    {
        Some(serde_json::Value::Array(entries)) => entries,
        _ => Vec::new(),
    }
}

fn json_field_string(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn json_nested_string(value: &serde_json::Value, key: &str, nested_key: &str) -> String {
    value
        .get(key)
        .and_then(|nested| nested.get(nested_key))
        .and_then(|nested| nested.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn json_bool_field(value: &serde_json::Value, key: &str) -> bool {
    value
        .get(key)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn json_string_array_summary(value: &serde_json::Value, key: &str, limit: usize) -> String {
    let entries = value
        .get(key)
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|entry| entry.as_str())
                .filter(|entry| !entry.trim().is_empty())
                .take(limit)
                .map(str::to_string)
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    entries.join(", ")
}

fn first_non_empty(values: Vec<String>) -> String {
    values
        .into_iter()
        .find(|value| !value.trim().is_empty())
        .unwrap_or_default()
}

fn shorten(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let mut output: String = value.chars().take(max_chars).collect();
    output.push_str("...");
    output
}

fn best_event_time(value: &serde_json::Value, keys: &[&str]) -> String {
    first_non_empty(
        keys.iter()
            .map(|key| json_field_string(value, key))
            .collect(),
    )
}

fn queue_event_state(status: &str) -> String {
    match status {
        "failed" | "rejected" => "blocked",
        "queued" | "claimed" => "waiting",
        "dispatched" | "completed" => "active",
        _ => "waiting",
    }
    .to_string()
}

fn runtime_event_state(status: &str) -> String {
    match status {
        "ready" | "local_only" => "active",
        "register_failed" | "heartbeat_failed" => "blocked",
        _ => "waiting",
    }
    .to_string()
}

fn route_queue_event(entry: &serde_json::Value) -> AgentRuntimeEvent {
    let status = json_field_string(entry, "status");
    let status_label = if status.is_empty() {
        "queued".to_string()
    } else {
        status.clone()
    };
    let run_id = shorten(&json_field_string(entry, "runId"), 14);
    let base_model = json_field_string(entry, "baseModel");
    let layer = first_non_empty(vec![
        json_field_string(entry, "recommendedLayerId"),
        json_field_string(entry, "phaseId"),
        json_field_string(entry, "lineageId"),
    ]);
    let worker = first_non_empty(vec![
        json_nested_string(entry, "assignment", "workerLabel"),
        json_nested_string(entry, "assignment", "workerId"),
        json_nested_string(entry, "claim", "workerId"),
    ]);
    let transport = first_non_empty(vec![
        json_nested_string(entry, "dispatch", "transport"),
        json_nested_string(entry, "dispatch", "executionMode"),
    ]);
    let remote_summary = first_non_empty(vec![
        json_nested_string(entry, "dispatch", "remoteCompletionSummary"),
        json_nested_string(entry, "dispatch", "remoteSummary"),
        json_field_string(entry, "rejectionReason"),
    ]);

    let mut parts = vec![format!(
        "Route {} is {}.",
        if run_id.is_empty() {
            "pending"
        } else {
            run_id.as_str()
        },
        status_label
    )];
    if !base_model.is_empty() {
        parts.push(format!("Base {base_model}."));
    }
    if !layer.is_empty() {
        parts.push(format!("Layer {layer}."));
    }
    if !worker.is_empty() {
        parts.push(format!("Worker {worker}."));
    }
    if !transport.is_empty() {
        parts.push(format!("Transport {transport}."));
    }
    if !remote_summary.is_empty() {
        parts.push(remote_summary);
    }

    AgentRuntimeEvent {
        time: first_non_empty(vec![
            best_event_time(entry, &["updatedAt", "queuedAt"]),
            now_unix_label(),
        ]),
        lane: "Q route".to_string(),
        detail: shorten(&parts.join(" "), 240),
        state: queue_event_state(&status_label),
    }
}

fn route_worker_event(worker: &serde_json::Value) -> AgentRuntimeEvent {
    let label = first_non_empty(vec![
        json_field_string(worker, "workerLabel"),
        json_field_string(worker, "workerId"),
        "worker".to_string(),
    ]);
    let profile = json_field_string(worker, "executionProfile");
    let heartbeat = json_field_string(worker, "heartbeatAt");
    let lease = json_field_string(worker, "leaseExpiresAt");
    let models = json_string_array_summary(worker, "supportedBaseModels", 3);
    let watch = json_bool_field(worker, "watch");
    let mut parts = vec![format!(
        "{} worker {} is registered.",
        if profile.is_empty() {
            "route"
        } else {
            profile.as_str()
        },
        label
    )];
    if !heartbeat.is_empty() {
        parts.push(format!("Heartbeat {heartbeat}."));
    }
    if !lease.is_empty() {
        parts.push(format!("Lease {lease}."));
    }
    if !models.is_empty() {
        parts.push(format!("Models {models}."));
    }

    AgentRuntimeEvent {
        time: first_non_empty(vec![heartbeat, now_unix_label()]),
        lane: "Q_agents".to_string(),
        detail: shorten(&parts.join(" "), 240),
        state: if watch { "active" } else { "waiting" }.to_string(),
    }
}

fn worker_runtime_event(runtime: &serde_json::Value) -> AgentRuntimeEvent {
    let status = json_field_string(runtime, "status");
    let label = first_non_empty(vec![
        json_field_string(runtime, "workerLabel"),
        json_field_string(runtime, "workerId"),
        "worker runtime".to_string(),
    ]);
    let profile = json_field_string(runtime, "executionProfile");
    let summary = first_non_empty(vec![
        json_field_string(runtime, "summary"),
        json_field_string(runtime, "detail"),
    ]);
    let harness = json_field_string(runtime, "harnessUrl");
    let mut parts = vec![format!(
        "{} runtime {} is {}.",
        if profile.is_empty() {
            "worker"
        } else {
            profile.as_str()
        },
        label,
        if status.is_empty() {
            "waiting"
        } else {
            status.as_str()
        }
    )];
    if !summary.is_empty() {
        parts.push(summary);
    }
    if !harness.is_empty() {
        parts.push(format!("Harness {harness}."));
    }

    AgentRuntimeEvent {
        time: first_non_empty(vec![
            best_event_time(runtime, &["updatedAt", "heartbeatAt", "registeredAt"]),
            now_unix_label(),
        ]),
        lane: "Immaculate".to_string(),
        detail: shorten(&parts.join(" "), 240),
        state: runtime_event_state(&status),
    }
}

fn build_agent_runtime_events(
    queue: &[serde_json::Value],
    workers: &[serde_json::Value],
    runtime: &[serde_json::Value],
    source_exists: bool,
) -> Vec<AgentRuntimeEvent> {
    let mut events = Vec::new();
    events.extend(runtime.iter().rev().take(5).map(worker_runtime_event));
    events.extend(queue.iter().rev().take(7).map(route_queue_event));
    events.extend(workers.iter().rev().take(4).map(route_worker_event));

    if events.is_empty() {
        let now = now_unix_label();
        events.push(AgentRuntimeEvent {
            time: now,
            lane: "Q route".to_string(),
            detail: if source_exists {
                "OpenJaws route runtime files are present and currently idle.".to_string()
            } else {
                "No OpenJaws route runtime files were found for this workspace yet.".to_string()
            },
            state: "waiting".to_string(),
        });
    }

    events.truncate(12);
    events
}

#[tauri::command]
fn agent_runtime_snapshot(workspace_path: Option<String>) -> AgentRuntimeSnapshot {
    let (q_runs_dir, source_exists) = select_q_runs_dir(workspace_path);
    let queue = read_json_array(&q_runs_dir.join("route-queue.json"));
    let workers = read_json_array(&q_runs_dir.join("route-workers.json"));
    let runtime = read_json_array(&q_runs_dir.join("route-worker-runtime.json"));
    let events = build_agent_runtime_events(&queue, &workers, &runtime, source_exists);
    let summary = if source_exists {
        format!(
            "Loaded {} route entries, {} worker registrations, and {} runtime statuses.",
            queue.len(),
            workers.len(),
            runtime.len()
        )
    } else {
        "No artifacts/q-runs runtime files were found from the selected workspace or repo ancestors."
            .to_string()
    };

    AgentRuntimeSnapshot {
        checked_at: now_unix_label(),
        source: q_runs_dir.display().to_string(),
        summary,
        queue_count: queue.len(),
        worker_count: workers.len(),
        runtime_count: runtime.len(),
        events,
    }
}

fn openjaws_config_home_dir() -> PathBuf {
    if let Ok(path) = env::var("OPENJAWS_CONFIG_DIR") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if let Ok(path) = env::var("USERPROFILE") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join(".openjaws");
        }
    }

    if let Ok(path) = env::var("HOME") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join(".openjaws");
        }
    }

    PathBuf::from(".openjaws")
}

fn browser_preview_receipt_path() -> PathBuf {
    openjaws_config_home_dir()
        .join("browser-preview")
        .join("receipt.json")
}

fn launch_config_path(workspace: &WorkspaceStatus) -> PathBuf {
    if workspace.valid {
        PathBuf::from(&workspace.path)
            .join(".openjaws")
            .join("launch.json")
    } else {
        PathBuf::from(".openjaws").join("launch.json")
    }
}

fn read_json_object(path: &Path) -> Option<serde_json::Map<String, serde_json::Value>> {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.as_object().cloned())
}

fn browser_preview_sessions(path: &Path) -> Vec<BrowserPreviewSessionSummary> {
    let Some(receipt) = read_json_object(path) else {
        return Vec::new();
    };

    receipt
        .get("sessions")
        .and_then(|value| value.as_array())
        .map(|sessions| {
            sessions
                .iter()
                .take(6)
                .map(|session| BrowserPreviewSessionSummary {
                    id: json_field_string(session, "id"),
                    action: json_field_string(session, "action"),
                    intent: json_field_string(session, "intent"),
                    requested_by: json_field_string(session, "requestedBy"),
                    started_at: json_field_string(session, "startedAt"),
                    opened: json_bool_field(session, "opened"),
                    note: json_field_string(session, "note"),
                    url: json_field_string(session, "url"),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn clean_preview_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("Enter a preview URL before saving the launch config.".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    if trimmed.starts_with("localhost") || trimmed.starts_with("127.0.0.1") {
        return Ok(format!("http://{trimmed}"));
    }
    Ok(format!("https://{trimmed}"))
}

fn clean_dev_command(command: &str) -> String {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        "npm run dev".to_string()
    } else {
        trimmed.chars().take(240).collect()
    }
}

fn preview_command(url: &str) -> String {
    format!("/preview {url}")
}

fn playwright_codegen_command(url: &str) -> String {
    format!("bunx playwright codegen {url}")
}

fn playwright_test_command() -> String {
    "bunx playwright test".to_string()
}

fn playwright_install_command() -> String {
    "bunx playwright install chromium".to_string()
}

fn quote_powershell(value: &str) -> String {
    format!("\"{}\"", value.replace('`', "``").replace('"', "`\""))
}

fn playwright_codegen_command_quoted(url: &str) -> String {
    format!("bunx playwright codegen {}", quote_powershell(url))
}

fn playwright_test_config_command(config_path: &Path) -> String {
    format!(
        "bunx playwright test -c {}",
        quote_powershell(&config_path.display().to_string())
    )
}

fn playwright_headed_config_command(config_path: &Path) -> String {
    format!(
        "bunx playwright test -c {} --headed",
        quote_powershell(&config_path.display().to_string())
    )
}

fn deterministic_receipt_hash(parts: &[&str]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for part in parts {
        for byte in part.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash ^= 0xff;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{hash:016x}")
}

fn sanitize_demo_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "OpenJaws web app demo".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn sanitize_demo_slug(name: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for character in name.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }

        if slug.len() >= 64 {
            break;
        }
    }

    while slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        "openjaws-web-app-demo".to_string()
    } else {
        slug
    }
}

fn build_demo_package_json(slug: &str) -> String {
    let payload = serde_json::json!({
        "name": slug,
        "private": true,
        "type": "module",
        "scripts": {
            "install:browsers": "playwright install chromium",
            "test": "playwright test",
            "test:headed": "playwright test --headed",
            "codegen": "playwright codegen"
        },
        "devDependencies": {
            "@playwright/test": "^1.59.1"
        }
    });

    serde_json::to_string_pretty(&payload).unwrap_or_default() + "\n"
}

fn build_demo_playwright_config() -> String {
    r#"import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: './artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
"#
    .to_string()
}

fn build_demo_spec(name: &str, url: &str) -> String {
    let name_json =
        serde_json::to_string(name).unwrap_or_else(|_| "\"OpenJaws web app demo\"".to_string());
    let url_json =
        serde_json::to_string(url).unwrap_or_else(|_| "\"http://127.0.0.1:5173\"".to_string());

    r#"import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const DEMO_NAME = __DEMO_NAME__
const DEMO_URL = __DEMO_URL__

test.describe(DEMO_NAME, () => {
  test('loads, renders meaningful content, and captures demo evidence', async ({ page }, testInfo) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []

    page.on('pageerror', error => {
      pageErrors.push(error.message)
    })
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await expect(page.locator('body')).toBeVisible()

    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
    expect(bodyText.length, 'page should render inspectable copy').toBeGreaterThan(20)

    const title = await page.title()
    const finalUrl = page.url()
    const screenshotPath = testInfo.outputPath('demo-full-page.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    await writeFile(
      testInfo.outputPath('demo-summary.json'),
      JSON.stringify({
        demoName: DEMO_NAME,
        requestedUrl: DEMO_URL,
        finalUrl,
        title,
        capturedAt: new Date().toISOString(),
        textPreview: bodyText.slice(0, 500),
        consoleErrors: consoleErrors.slice(0, 20),
        pageErrors: pageErrors.slice(0, 20),
      }, null, 2) + '\n',
      'utf8',
    )

    expect(pageErrors, 'page runtime errors').toEqual([])
  })
})
"#
    .replace("__DEMO_NAME__", &name_json)
    .replace("__DEMO_URL__", &url_json)
}

fn build_demo_readme(
    name: &str,
    url: &str,
    dev_command: &str,
    preview: &str,
    install: &str,
    test: &str,
    headed: &str,
    codegen: &str,
) -> String {
    format!(
        "# {name}\n\nThis OpenJaws preview harness turns a web app, product page, service, or game URL into reusable Playwright demo evidence.\n\n- URL: {url}\n- Dev command: {dev_command}\n\n## Commands\n\n```powershell\n{install}\n{test}\n{headed}\n{codegen}\n```\n\n## What It Captures\n\n- desktop and mobile Chromium runs\n- full-page screenshot artifacts\n- Playwright trace/video on failure\n- a JSON summary with title, final URL, text preview, console errors, and page errors\n\nUse the OpenJaws preview lane while building:\n\n```text\n{preview}\n```\n"
    )
}

fn preview_demo_error(
    message: String,
    url: String,
    dev_command: String,
    name: String,
) -> PreviewDemoHarnessResult {
    PreviewDemoHarnessResult {
        ok: false,
        output_dir: String::new(),
        message,
        name,
        slug: String::new(),
        url,
        dev_command,
        preview_command: String::new(),
        playwright_install_command: playwright_install_command(),
        playwright_codegen_command: String::new(),
        playwright_test_command: playwright_test_command(),
        playwright_headed_command: "bunx playwright test --headed".to_string(),
        readme_path: String::new(),
        package_path: String::new(),
        config_path: String::new(),
        spec_path: String::new(),
        receipt_path: String::new(),
        receipt_hash: String::new(),
    }
}

#[tauri::command]
fn browser_preview_snapshot(workspace_path: Option<String>) -> BrowserPreviewSnapshot {
    let workspace = workspace_path
        .as_deref()
        .map(|path| validate_workspace(path.to_string()))
        .unwrap_or_else(|| validate_workspace(String::new()));
    let receipt_path = browser_preview_receipt_path();
    let launch_path = launch_config_path(&workspace);
    let launch_config = read_json_object(&launch_path);
    let launch_url = launch_config
        .as_ref()
        .and_then(|value| value.get("url"))
        .and_then(|value| value.as_str())
        .unwrap_or("http://127.0.0.1:5173/")
        .to_string();
    let dev_command = launch_config
        .as_ref()
        .and_then(|value| value.get("command"))
        .and_then(|value| value.as_str())
        .unwrap_or("npm run dev")
        .to_string();
    let sessions = browser_preview_sessions(&receipt_path);
    let receipt_exists = receipt_path.exists();
    let receipt_summary = if sessions.is_empty() {
        if receipt_exists {
            "Browser preview receipts exist but no accountable agent/operator sessions were recorded."
                .to_string()
        } else {
            "No browser preview receipt exists yet. OpenJaws will create one when Q, an agent, or an operator records a preview handoff."
                .to_string()
        }
    } else {
        format!(
            "Loaded {} accountable browser preview session{}.",
            sessions.len(),
            if sessions.len() == 1 { "" } else { "s" }
        )
    };

    BrowserPreviewSnapshot {
        checked_at: now_unix_label(),
        receipt_path: receipt_path.display().to_string(),
        receipt_exists,
        receipt_summary,
        session_count: sessions.len(),
        launch_config_path: launch_path.display().to_string(),
        launch_config_exists: launch_path.exists(),
        preview_command: preview_command(&launch_url),
        playwright_codegen_command: playwright_codegen_command(&launch_url),
        playwright_test_command: playwright_test_command(),
        launch_url,
        dev_command,
        sessions,
    }
}

#[tauri::command]
fn write_browser_preview_launch_config(
    workspace_path: String,
    url: String,
    dev_command: String,
) -> PreviewLaunchConfigResult {
    let workspace = validate_workspace(workspace_path);
    if !workspace.valid {
        return PreviewLaunchConfigResult {
            ok: false,
            path: String::new(),
            message: workspace.message,
            url,
            dev_command,
            preview_command: String::new(),
            playwright_codegen_command: String::new(),
            playwright_test_command: playwright_test_command(),
        };
    }

    let cleaned_url = match clean_preview_url(&url) {
        Ok(value) => value,
        Err(message) => {
            return PreviewLaunchConfigResult {
                ok: false,
                path: String::new(),
                message,
                url,
                dev_command,
                preview_command: String::new(),
                playwright_codegen_command: String::new(),
                playwright_test_command: playwright_test_command(),
            }
        }
    };
    let cleaned_command = clean_dev_command(&dev_command);
    let path = launch_config_path(&workspace);
    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            return PreviewLaunchConfigResult {
                ok: false,
                path: path.display().to_string(),
                message: format!("Could not create .openjaws preview directory: {error}"),
                url: cleaned_url.clone(),
                dev_command: cleaned_command.clone(),
                preview_command: preview_command(&cleaned_url),
                playwright_codegen_command: playwright_codegen_command(&cleaned_url),
                playwright_test_command: playwright_test_command(),
            };
        }
    }

    let payload = serde_json::json!({
        "version": 1,
        "createdBy": "JAWS Desktop",
        "createdAt": now_unix_label(),
        "url": cleaned_url.clone(),
        "command": cleaned_command.clone(),
        "intent": "preview",
        "playwright": {
            "codegen": playwright_codegen_command(&cleaned_url),
            "test": playwright_test_command()
        }
    });
    match fs::write(
        &path,
        serde_json::to_string_pretty(&payload).unwrap_or_default() + "\n",
    ) {
        Ok(_) => PreviewLaunchConfigResult {
            ok: true,
            path: path.display().to_string(),
            message: "Preview launch config saved for this workspace.".to_string(),
            url: cleaned_url.clone(),
            dev_command: cleaned_command,
            preview_command: preview_command(&cleaned_url),
            playwright_codegen_command: playwright_codegen_command(&cleaned_url),
            playwright_test_command: playwright_test_command(),
        },
        Err(error) => PreviewLaunchConfigResult {
            ok: false,
            path: path.display().to_string(),
            message: format!("Could not write preview launch config: {error}"),
            url: cleaned_url.clone(),
            dev_command: cleaned_command,
            preview_command: preview_command(&cleaned_url),
            playwright_codegen_command: playwright_codegen_command(&cleaned_url),
            playwright_test_command: playwright_test_command(),
        },
    }
}

#[tauri::command]
fn write_browser_preview_demo_harness(
    workspace_path: String,
    url: String,
    dev_command: String,
    name: String,
) -> PreviewDemoHarnessResult {
    let clean_name = sanitize_demo_name(&name);
    let workspace = validate_workspace(workspace_path);
    if !workspace.valid {
        return preview_demo_error(workspace.message, url, dev_command, clean_name);
    }

    let cleaned_url = match clean_preview_url(&url) {
        Ok(value) => value,
        Err(message) => return preview_demo_error(message, url, dev_command, clean_name),
    };
    let cleaned_command = clean_dev_command(&dev_command);
    let slug = sanitize_demo_slug(&clean_name);
    let output_dir = PathBuf::from(&workspace.path)
        .join(".openjaws")
        .join("browser-preview")
        .join("demos")
        .join(&slug);
    let tests_dir = output_dir.join("tests");
    let readme_path = output_dir.join("README.md");
    let package_path = output_dir.join("package.json");
    let config_path = output_dir.join("playwright.config.ts");
    let spec_path = tests_dir.join("demo.spec.ts");
    let receipt_path = output_dir.join("openjaws-preview-demo.receipt.json");
    let preview = preview_command(&cleaned_url);
    let install = playwright_install_command();
    let codegen = playwright_codegen_command_quoted(&cleaned_url);
    let test = playwright_test_config_command(&config_path);
    let headed = playwright_headed_config_command(&config_path);

    if let Err(error) = fs::create_dir_all(&tests_dir) {
        return preview_demo_error(
            format!("Could not create Playwright demo harness directory: {error}"),
            cleaned_url,
            cleaned_command,
            clean_name,
        );
    }

    let readme_content = build_demo_readme(
        &clean_name,
        &cleaned_url,
        &cleaned_command,
        &preview,
        &install,
        &test,
        &headed,
        &codegen,
    );
    let package_content = build_demo_package_json(&slug);
    let config_content = build_demo_playwright_config();
    let spec_content = build_demo_spec(&clean_name, &cleaned_url);
    let mut receipt = serde_json::json!({
        "version": 1,
        "createdBy": "JAWS Desktop",
        "createdAt": now_unix_label(),
        "name": clean_name,
        "slug": slug,
        "url": cleaned_url,
        "devCommand": cleaned_command,
        "outputDir": output_dir.display().to_string(),
        "files": {
            "readme": readme_path.display().to_string(),
            "package": package_path.display().to_string(),
            "config": config_path.display().to_string(),
            "spec": spec_path.display().to_string()
        },
        "commands": {
            "preview": preview,
            "installBrowsers": install,
            "codegen": codegen,
            "test": test,
            "headed": headed
        }
    });
    let receipt_without_hash = serde_json::to_string_pretty(&receipt).unwrap_or_default() + "\n";
    let receipt_hash = deterministic_receipt_hash(&[
        &readme_content,
        &package_content,
        &config_content,
        &spec_content,
        &receipt_without_hash,
    ]);
    if let Some(object) = receipt.as_object_mut() {
        object.insert(
            "receiptHash".to_string(),
            serde_json::Value::String(receipt_hash.clone()),
        );
        object.insert(
            "integrity".to_string(),
            serde_json::json!({
                "algorithm": "fnv1a64",
                "covers": [
                    "README.md",
                    "package.json",
                    "playwright.config.ts",
                    "tests/demo.spec.ts",
                    "openjaws-preview-demo.receipt.json without receiptHash"
                ]
            }),
        );
    }
    let receipt_content = serde_json::to_string_pretty(&receipt).unwrap_or_default() + "\n";

    let writes = [
        (readme_path.as_path(), readme_content),
        (package_path.as_path(), package_content),
        (config_path.as_path(), config_content),
        (spec_path.as_path(), spec_content),
        (receipt_path.as_path(), receipt_content),
    ];

    for (path, content) in writes {
        if let Err(error) = fs::write(path, content) {
            return preview_demo_error(
                format!(
                    "Could not write Playwright demo harness file {}: {error}",
                    path.display()
                ),
                cleaned_url,
                cleaned_command,
                clean_name,
            );
        }
    }

    PreviewDemoHarnessResult {
        ok: true,
        output_dir: output_dir.display().to_string(),
        message: "Playwright demo harness written for this workspace.".to_string(),
        name: clean_name,
        slug,
        url: cleaned_url,
        dev_command: cleaned_command,
        preview_command: preview,
        playwright_install_command: install,
        playwright_codegen_command: codegen,
        playwright_test_command: test,
        playwright_headed_command: headed,
        readme_path: readme_path.display().to_string(),
        package_path: package_path.display().to_string(),
        config_path: config_path.display().to_string(),
        spec_path: spec_path.display().to_string(),
        receipt_path: receipt_path.display().to_string(),
        receipt_hash,
    }
}

#[tauri::command]
fn q_agents_cowork_plan() -> QAgentsCoworkPlan {
    QAgentsCoworkPlan {
        mode: "stacked-agents".to_string(),
        room_code: "JWS-QAGENTS".to_string(),
        shared_phase_memory: true,
        pooled_credits: false,
        route_policy: "health-gated dispatch with explicit user approval for shared credits"
            .to_string(),
        controls: vec![
            QAgentsCoworkControl {
                id: "planner".to_string(),
                label: "Q planner".to_string(),
                detail: "Owns task decomposition, route policy, and final synthesis.".to_string(),
                status: "ready".to_string(),
            },
            QAgentsCoworkControl {
                id: "implementer".to_string(),
                label: "Q_agent implementer".to_string(),
                detail: "Takes bounded code-change lanes with workspace-scoped permissions."
                    .to_string(),
                status: "health gated".to_string(),
            },
            QAgentsCoworkControl {
                id: "verifier".to_string(),
                label: "Q_agent verifier".to_string(),
                detail: "Runs tests, browser checks, and release gates before handoff.".to_string(),
                status: "health gated".to_string(),
            },
            QAgentsCoworkControl {
                id: "cowork".to_string(),
                label: "Co-work room".to_string(),
                detail:
                    "Pairs another JAWS user into the same workspace with explicit code exchange."
                        .to_string(),
                status: "local foundation".to_string(),
            },
        ],
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

fn clean_provider_arg(value: Option<String>) -> String {
    let candidate = value
        .unwrap_or_else(|| "oci".to_string())
        .trim()
        .to_ascii_lowercase();
    let safe = candidate
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-');

    if safe && !candidate.is_empty() && candidate.len() <= 40 {
        candidate
    } else {
        "oci".to_string()
    }
}

fn clean_model_arg(value: Option<String>) -> String {
    let candidate = value.unwrap_or_else(|| "Q".to_string()).trim().to_string();
    let safe = candidate.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ':' | '/' | '@')
    });

    if safe && !candidate.is_empty() && candidate.len() <= 120 {
        candidate
    } else {
        "Q".to_string()
    }
}

fn env_value(names: &[&str]) -> Option<(String, String)> {
    for name in names {
        if let Ok(value) = env::var(name) {
            if !value.trim().is_empty() {
                return Some((name.to_string(), value.trim().to_string()));
            }
        }
    }

    None
}

fn default_oci_base_url() -> String {
    if let Some((_, value)) = env_value(&["Q_BASE_URL", "OCI_BASE_URL"]) {
        return value.trim_end_matches('/').to_string();
    }

    if let Some((_, region)) = env_value(&["OCI_REGION"]) {
        return format!(
            "https://inference.generativeai.{}.oci.oraclecloud.com/openai/v1",
            region
        );
    }

    "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1".to_string()
}

fn inference_auth_label(provider: &str) -> String {
    if provider == "oci" {
        if let Some((name, _)) = env_value(&["Q_API_KEY", "OCI_API_KEY", "OCI_GENAI_API_KEY"]) {
            return format!("environment key ({name})");
        }

        let has_config = env_value(&["OCI_CONFIG_FILE"]).is_some()
            || env::var("USERPROFILE")
                .ok()
                .map(|home| PathBuf::from(home).join(".oci").join("config").exists())
                .unwrap_or(false)
            || env::var("HOME")
                .ok()
                .map(|home| PathBuf::from(home).join(".oci").join("config").exists())
                .unwrap_or(false);
        let has_compartment = env_value(&["OCI_COMPARTMENT_ID"]).is_some();
        let has_project = env_value(&["OCI_GENAI_PROJECT_ID"]).is_some();
        if has_config && has_compartment && has_project {
            let profile = env::var("OCI_PROFILE")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "DEFAULT".to_string());
            return format!("OCI IAM ({profile})");
        }

        if has_config || has_compartment || has_project {
            let mut missing = Vec::new();
            if !has_config {
                missing.push("OCI_CONFIG_FILE");
            }
            if !has_compartment {
                missing.push("OCI_COMPARTMENT_ID");
            }
            if !has_project {
                missing.push("OCI_GENAI_PROJECT_ID");
            }
            return format!("OCI IAM incomplete: missing {}", missing.join(", "));
        }
    }

    "not configured".to_string()
}

fn redact_inference_output(value: &str) -> String {
    value
        .lines()
        .map(|line| {
            line.split_whitespace()
                .map(|word| {
                    let lower = word.to_ascii_lowercase();
                    if lower.starts_with("sk-")
                        || lower.starts_with("rk-")
                        || lower.starts_with("pk-")
                        || (word.len() > 36 && lower.contains("token"))
                    {
                        "[redacted]".to_string()
                    } else {
                        word.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn fallback_inference_result(
    provider: String,
    model: String,
    summary: String,
    stderr: String,
) -> InferenceCommandResult {
    let base_url = if provider == "oci" {
        default_oci_base_url()
    } else {
        String::new()
    };
    let auth_label = inference_auth_label(&provider);
    InferenceCommandResult {
        ok: !auth_label.contains("not configured") && !auth_label.contains("incomplete"),
        code: None,
        stdout: format!(
            "- {provider}: model {provider}:{model} · key {auth_label} · base URL {base_url}"
        ),
        stderr,
        summary,
        provider,
        model,
        base_url,
        auth_label,
    }
}

#[tauri::command]
async fn openjaws_inference_status(
    app: tauri::AppHandle,
    provider: Option<String>,
    model: Option<String>,
    run_probe: bool,
) -> InferenceCommandResult {
    let provider = clean_provider_arg(provider);
    let model = clean_model_arg(model);
    let base_url = if provider == "oci" {
        default_oci_base_url()
    } else {
        String::new()
    };
    let auth_label = inference_auth_label(&provider);
    let command = match app.shell().sidecar("openjaws") {
        Ok(command) => {
            let command = command.arg("provider");
            if run_probe {
                command.arg("test").arg(provider.clone()).arg(model.clone())
            } else {
                command.arg("status")
            }
        }
        Err(error) => {
            return fallback_inference_result(
                provider,
                model,
                "OpenJaws sidecar is unavailable; showing local inference preflight only."
                    .to_string(),
                format!("OpenJaws sidecar unavailable: {error}"),
            );
        }
    };

    match tokio::time::timeout(Duration::from_secs(45), command.output()).await {
        Ok(Ok(output)) => {
            let stdout = truncate_text(
                &redact_inference_output(&String::from_utf8_lossy(&output.stdout)),
                4_000,
            );
            let stderr = truncate_text(
                &redact_inference_output(&String::from_utf8_lossy(&output.stderr)),
                2_000,
            );
            let ok = output.status.success();
            InferenceCommandResult {
                ok,
                code: output.status.code(),
                summary: if ok {
                    if run_probe {
                        "Provider route probe completed.".to_string()
                    } else {
                        "Provider route status loaded.".to_string()
                    }
                } else {
                    "Provider route command returned a non-zero exit code.".to_string()
                },
                stdout,
                stderr,
                provider,
                model,
                base_url,
                auth_label,
            }
        }
        Ok(Err(error)) => fallback_inference_result(
            provider,
            model,
            "Provider route command failed before output.".to_string(),
            format!("OpenJaws provider command failed: {error}"),
        ),
        Err(_) => fallback_inference_result(
            provider,
            model,
            "Provider route command timed out before output.".to_string(),
            "OpenJaws provider command timed out after 45 seconds.".to_string(),
        ),
    }
}

#[tauri::command]
async fn run_openjaws_provider_command(
    app: tauri::AppHandle,
    provider_args: Vec<String>,
    workspace_path: Option<String>,
) -> ChatCommandResult {
    let workspace = workspace_path
        .as_deref()
        .map(|path| validate_workspace(path.to_string()))
        .filter(|workspace| workspace.valid);

    let command = match app.shell().sidecar("openjaws") {
        Ok(command) => {
            let command = command.arg("provider").args(provider_args);
            if let Some(workspace) = &workspace {
                command.current_dir(workspace.path.clone())
            } else {
                command
            }
        }
        Err(error) => {
            return ChatCommandResult {
                ok: false,
                code: None,
                stdout: String::new(),
                stderr: format!("OpenJaws sidecar unavailable: {error}"),
                summary: "Sidecar unavailable.".to_string(),
                permission_mode: "default".to_string(),
                workspace_path: workspace_path.unwrap_or_default(),
            };
        }
    };

    match tokio::time::timeout(Duration::from_secs(45), command.output()).await {
        Ok(Ok(output)) => {
            let stdout = truncate_text(&String::from_utf8_lossy(&output.stdout), 4_000);
            let stderr = truncate_text(&String::from_utf8_lossy(&output.stderr), 2_000);
            let ok = output.status.success();
            ChatCommandResult {
                ok,
                code: output.status.code(),
                stdout,
                stderr,
                summary: if ok {
                    "Provider command completed.".to_string()
                } else {
                    "Provider command returned a non-zero exit code.".to_string()
                },
                permission_mode: "default".to_string(),
                workspace_path: workspace
                    .map(|workspace| workspace.path)
                    .unwrap_or_else(|| workspace_path.unwrap_or_default()),
            }
        }
        Ok(Err(error)) => ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: format!("OpenJaws provider command failed: {error}"),
            summary: "Provider command failed before output.".to_string(),
            permission_mode: "default".to_string(),
            workspace_path: workspace
                .map(|workspace| workspace.path)
                .unwrap_or_else(|| workspace_path.unwrap_or_default()),
        },
        Err(_) => ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "OpenJaws provider command timed out after 45 seconds.".to_string(),
            summary: "Provider command timed out.".to_string(),
            permission_mode: "default".to_string(),
            workspace_path: workspace
                .map(|workspace| workspace.path)
                .unwrap_or_else(|| workspace_path.unwrap_or_default()),
        },
    }
}

/// Matches desktop chat routing: `/provider` alone or `/provider …` (case-insensitive prefix).
fn provider_command_rest(command: &str) -> Option<&str> {
    const PREFIX: &str = "/provider";
    let s = command.trim_start();
    if s.len() < PREFIX.len() {
        return None;
    }
    if !s[..PREFIX.len()].eq_ignore_ascii_case(PREFIX) {
        return None;
    }
    if s.len() == PREFIX.len() {
        return Some("");
    }
    if !s.as_bytes()[PREFIX.len()].is_ascii_whitespace() {
        return None;
    }
    Some(s[PREFIX.len()..].trim_start())
}

/// Split arguments after `/provider`, respecting double-quoted tokens (same idea as the React chat shell).
fn shell_split_provider_args(rest: &str) -> Vec<String> {
    let rest = rest.trim();
    if rest.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = rest.chars().collect();
    let mut args = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() {
            break;
        }
        let mut token = String::new();
        if chars[i] == '"' {
            i += 1;
            while i < chars.len() && chars[i] != '"' {
                token.push(chars[i]);
                i += 1;
            }
            if i < chars.len() && chars[i] == '"' {
                i += 1;
            }
        } else {
            while i < chars.len() && !chars[i].is_whitespace() {
                token.push(chars[i]);
                i += 1;
            }
        }
        if !token.is_empty() {
            args.push(token);
        }
    }
    args
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

    // Never route `/provider` through headless `openjaws --print` (full Q turn); it hits the
    // 120s chat timeout while the model spins. The bundled `openjaws provider` CLI is immediate.
    if let Some(rest) = provider_command_rest(prompt) {
        let provider_args = shell_split_provider_args(rest);
        return run_openjaws_provider_command(app, provider_args, Some(workspace.path.clone())).await;
    }

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
            agent_runtime_snapshot,
            backend_status,
            account_session,
            browser_preview_snapshot,
            enrollment_links,
            openjaws_inference_status,
            openjaws_smoke,
            openjaws_workspace_smoke,
            probe_release_update_pipeline,
            q_agents_cowork_plan,
            resolve_workspace,
            run_openjaws_provider_command,
            run_openjaws_chat,
            validate_workspace,
            write_browser_preview_demo_harness,
            write_browser_preview_launch_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAWS Desktop");
}
