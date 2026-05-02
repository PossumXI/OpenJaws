use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
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
    cognitive: CognitiveRuntimeSnapshot,
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
struct CognitiveRuntimeSnapshot {
    status: String,
    summary: String,
    goal_count: usize,
    decision_count: usize,
    allow_count: usize,
    review_count: usize,
    delay_count: usize,
    deny_count: usize,
    highest_risk_tier: u8,
    average_quality: u8,
    memory_layers: Vec<CognitiveMemoryLayer>,
    trace: Vec<CognitiveTraceNode>,
    scorecards: Vec<CognitiveScorecard>,
    policy_hints: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CognitiveMemoryLayer {
    layer: String,
    count: usize,
    status: String,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CognitiveTraceNode {
    kind: String,
    label: String,
    state: String,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CognitiveScorecard {
    goal_id: String,
    status: String,
    quality: u8,
    risk_tier: u8,
    detail: String,
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
struct PreviewWindowResult {
    ok: bool,
    url: String,
    label: String,
    message: String,
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
struct LedgerEventSummary {
    id: String,
    time: String,
    actor: String,
    action: String,
    surface: String,
    status: String,
    proof: String,
    detail: String,
    risk_tier: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LedgerSnapshot {
    checked_at: String,
    source: String,
    configured: bool,
    summary: String,
    event_count: usize,
    agent_event_count: usize,
    browser_event_count: usize,
    credit_event_count: usize,
    external_route_configured: bool,
    events: Vec<LedgerEventSummary>,
    warnings: Vec<String>,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextCategory {
    id: String,
    label: String,
    file_count: usize,
    included_count: usize,
    estimated_tokens: u64,
    confidence: u8,
    status: String,
    detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextPriorityFile {
    path: String,
    kind: String,
    reason: String,
    estimated_tokens: u64,
    status: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextSkippedGroup {
    reason: String,
    count: usize,
    examples: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextBrainLane {
    label: String,
    receives: String,
    status: String,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectContextSnapshot {
    checked_at: String,
    workspace_path: String,
    workspace_name: String,
    valid: bool,
    source: String,
    confidence_score: u8,
    summary: String,
    total_files: usize,
    scanned_files: usize,
    skipped_files: usize,
    estimated_tokens: u64,
    context_budget_tokens: u64,
    categories: Vec<ContextCategory>,
    priority_files: Vec<ContextPriorityFile>,
    skipped: Vec<ContextSkippedGroup>,
    brain_lanes: Vec<ContextBrainLane>,
    notes: Vec<String>,
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
                    "{} is reachable. Downloads start at {}.",
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
                    "GitHub download",
                    "error",
                    format!("GitHub returned HTTP {}.", status.as_u16()),
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
                    "GitHub download",
                    "error",
                    format!(
                        "Expected public release {}, got {tag} draft={draft}.",
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
                    "GitHub download",
                    "error",
                    format!(
                        "{} is missing downloads: {}.",
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
                "GitHub download",
                "ok",
                format!("{} is published with {routed_assets} downloads.", index.tag),
            )
        }
        Err(error) => update_entry(
            "github",
            "GitHub download",
            "error",
            format!("GitHub check failed: {error}"),
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
                    "Update file",
                    "error",
                    format!("Update file returned HTTP {}.", status.as_u16()),
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
                    "Update file",
                    "error",
                    format!(
                        "Update version mismatch: expected {}, got {version}.",
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
                    "Update file",
                    "error",
                    format!(
                        "Update file is missing downloads for: {}.",
                        missing.join(", ")
                    ),
                );
            }
            update_entry(
                "manifest",
                "Update file",
                "ok",
                format!("Update file is ready for {}.", index.version),
            )
        }
        Err(error) => update_entry(
            "manifest",
            "Update file",
            "error",
            format!("Update file check failed: {error}"),
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

fn json_nested_value<'a>(
    value: &'a serde_json::Value,
    key: &str,
    nested_key: &str,
) -> Option<&'a serde_json::Value> {
    value.get(key).and_then(|nested| nested.get(nested_key))
}

fn json_bool_field(value: &serde_json::Value, key: &str) -> bool {
    value
        .get(key)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn json_number_field(value: &serde_json::Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|value| value.as_f64())
}

fn json_string_array(value: Option<&serde_json::Value>, limit: usize) -> Vec<String> {
    value
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|entry| entry.as_str())
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .take(limit)
                .map(str::to_string)
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
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
        "Task {} is {}.",
        if run_id.is_empty() {
            "pending"
        } else {
            run_id.as_str()
        },
        status_label
    )];
    if !base_model.is_empty() {
        parts.push(format!("Model {base_model}."));
    }
    if !layer.is_empty() {
        parts.push(format!("Work area {layer}."));
    }
    if !worker.is_empty() {
        parts.push(format!("Worker {worker}."));
    }
    if !transport.is_empty() {
        parts.push(format!("Run mode {transport}."));
    }
    if !remote_summary.is_empty() {
        parts.push(remote_summary);
    }

    AgentRuntimeEvent {
        time: first_non_empty(vec![
            best_event_time(entry, &["updatedAt", "queuedAt"]),
            now_unix_label(),
        ]),
        lane: "Q task".to_string(),
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
    let mut parts = vec![format!("Worker {label} is ready.")];
    if !profile.is_empty() {
        parts.push(format!("Mode {profile}."));
    }
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
        "worker".to_string(),
    ]);
    let profile = json_field_string(runtime, "executionProfile");
    let summary = first_non_empty(vec![
        json_field_string(runtime, "summary"),
        json_field_string(runtime, "detail"),
    ]);
    let preview = json_field_string(runtime, "harnessUrl");
    let mut parts = vec![format!(
        "{} worker {} is {}.",
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
    if !preview.is_empty() {
        parts.push(format!("Preview {preview}."));
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
            lane: "Q task".to_string(),
            detail: if source_exists {
                "OpenJaws found agent activity files and is waiting for new work.".to_string()
            } else {
                "No agent activity has been recorded for this workspace yet.".to_string()
            },
            state: "waiting".to_string(),
        });
    }

    events.truncate(12);
    events
}

fn queue_cognitive_admission(entry: &serde_json::Value) -> Option<&serde_json::Value> {
    json_nested_value(entry, "claim", "cognitiveAdmission")
        .filter(|admission| admission.as_object().is_some())
}

fn cognitive_quality_percent(admission: &serde_json::Value) -> u8 {
    let quality = json_number_field(admission, "scorecardQuality").unwrap_or(0.0);
    let normalized = if quality <= 1.0 {
        quality * 100.0
    } else {
        quality
    };
    normalized.round().clamp(0.0, 100.0) as u8
}

fn cognitive_risk_tier(admission: &serde_json::Value) -> u8 {
    json_number_field(admission, "riskTier")
        .unwrap_or(0.0)
        .round()
        .clamp(0.0, 5.0) as u8
}

fn cognitive_status_state(status: &str) -> String {
    match status {
        "allow" => "active",
        "review" | "delay" => "waiting",
        "deny" => "blocked",
        _ => "waiting",
    }
    .to_string()
}

fn cognitive_status_label(admission: &serde_json::Value) -> String {
    first_non_empty(vec![
        json_field_string(admission, "status"),
        "review".to_string(),
    ])
}

fn cognitive_trace_detail(admission: &serde_json::Value) -> String {
    let reasons = json_string_array(admission.get("reasons"), 3);
    if !reasons.is_empty() {
        return shorten(&reasons.join(" "), 180);
    }

    let missing = json_string_array(admission.get("missingApprovals"), 3);
    if !missing.is_empty() {
        return format!("Waiting for {} approval.", missing.join(", "));
    }

    "Admission recorded with no extra operator notes.".to_string()
}

fn cognitive_memory_update_counts(
    admissions: &[&serde_json::Value],
) -> BTreeMap<String, (usize, String)> {
    let mut counts: BTreeMap<String, (usize, String)> = BTreeMap::new();
    for admission in admissions {
        let Some(updates) = admission
            .get("memoryUpdates")
            .and_then(|value| value.as_array())
        else {
            continue;
        };

        for update in updates {
            let layer = json_field_string(update, "layer").to_lowercase();
            if layer.is_empty() {
                continue;
            }
            let summary = json_field_string(update, "summary");
            let entry = counts.entry(layer).or_insert((0, summary.clone()));
            entry.0 += 1;
            if entry.1.is_empty() && !summary.is_empty() {
                entry.1 = summary;
            }
        }
    }
    counts
}

fn cognitive_memory_count(
    counts: &BTreeMap<String, (usize, String)>,
    layer: &str,
    fallback: usize,
) -> usize {
    counts
        .get(layer)
        .map(|(count, _)| (*count).max(fallback))
        .unwrap_or(fallback)
}

fn cognitive_memory_detail(
    counts: &BTreeMap<String, (usize, String)>,
    layer: &str,
    fallback: &str,
) -> String {
    counts
        .get(layer)
        .and_then(|(_, summary)| {
            if summary.trim().is_empty() {
                None
            } else {
                Some(shorten(summary, 140))
            }
        })
        .unwrap_or_else(|| fallback.to_string())
}

fn format_cognitive_trace_kind(kind: &str) -> String {
    let words = kind
        .split(|ch| ch == '_' || ch == '-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut word = first.to_uppercase().collect::<String>();
                    word.push_str(chars.as_str());
                    word
                }
                None => String::new(),
            }
        })
        .collect::<Vec<String>>();
    if words.is_empty() {
        "Trace".to_string()
    } else {
        words.join(" ")
    }
}

fn json_scalar_summary(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if let Some(number) = value.as_i64() {
        return Some(number.to_string());
    }
    if let Some(number) = value.as_u64() {
        return Some(number.to_string());
    }
    if let Some(number) = value.as_f64() {
        return Some(format!("{number:.3}"));
    }
    if let Some(flag) = value.as_bool() {
        return Some(flag.to_string());
    }
    None
}

fn cognitive_trace_node_detail(node: &serde_json::Value, admission: &serde_json::Value) -> String {
    let metadata = node
        .get("metadata")
        .and_then(|value| value.as_object())
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| {
                    json_scalar_summary(value).map(|summary| format!("{key}: {summary}"))
                })
                .take(3)
                .collect::<Vec<String>>()
                .join(". ")
        })
        .unwrap_or_default();
    if !metadata.is_empty() {
        return shorten(&metadata, 180);
    }

    let node_ref = json_field_string(node, "ref");
    if !node_ref.is_empty() {
        return format!("Reference {node_ref}.");
    }

    let timestamp = json_field_string(node, "timestamp");
    if !timestamp.is_empty() {
        return format!("Recorded at {timestamp}.");
    }

    cognitive_trace_detail(admission)
}

fn recorded_cognitive_trace_nodes(
    admission: &serde_json::Value,
    state: &str,
) -> Vec<CognitiveTraceNode> {
    let Some(nodes) = admission
        .get("trace")
        .and_then(|trace| trace.get("nodes"))
        .and_then(|nodes| nodes.as_array())
    else {
        return Vec::new();
    };

    nodes
        .iter()
        .filter_map(|node| {
            let label = first_non_empty(vec![
                json_field_string(node, "label"),
                json_field_string(node, "id"),
            ]);
            if label.is_empty() {
                return None;
            }
            Some(CognitiveTraceNode {
                kind: format_cognitive_trace_kind(&json_field_string(node, "kind")),
                label: shorten(&label, 64),
                state: state.to_string(),
                detail: cognitive_trace_node_detail(node, admission),
            })
        })
        .collect()
}

fn build_cognitive_memory_layers(
    queue: &[serde_json::Value],
    workers: &[serde_json::Value],
    runtime: &[serde_json::Value],
    admissions: &[&serde_json::Value],
) -> Vec<CognitiveMemoryLayer> {
    let memory_counts = cognitive_memory_update_counts(admissions);
    let live_queue = queue
        .iter()
        .filter(|entry| {
            matches!(
                json_field_string(entry, "status").as_str(),
                "queued" | "claimed" | "dispatched"
            )
        })
        .count();
    let episodic = queue
        .iter()
        .filter(|entry| {
            matches!(
                json_field_string(entry, "status").as_str(),
                "completed" | "failed" | "rejected"
            )
        })
        .count();
    let procedural = queue
        .iter()
        .filter(|entry| {
            !json_field_string(entry, "recommendedLayerId").is_empty()
                || !json_field_string(entry, "phaseId").is_empty()
                || queue_cognitive_admission(entry).is_some()
        })
        .count();
    let working_count =
        cognitive_memory_count(&memory_counts, "working", live_queue + runtime.len());
    let episodic_count = cognitive_memory_count(&memory_counts, "episodic", episodic);
    let semantic_count = cognitive_memory_count(&memory_counts, "semantic", workers.len());
    let procedural_count = cognitive_memory_count(
        &memory_counts,
        "procedural",
        procedural.max(admissions.len()),
    );

    vec![
        CognitiveMemoryLayer {
            layer: "Working".to_string(),
            count: working_count,
            status: if working_count > 0 {
                "active".to_string()
            } else {
                "waiting".to_string()
            },
            detail: cognitive_memory_detail(
                &memory_counts,
                "working",
                "Live queued routes and running worker updates.",
            ),
        },
        CognitiveMemoryLayer {
            layer: "Episodic".to_string(),
            count: episodic_count,
            status: if episodic_count > 0 {
                "active".to_string()
            } else {
                "waiting".to_string()
            },
            detail: cognitive_memory_detail(
                &memory_counts,
                "episodic",
                "Finished, failed, and rejected route history.",
            ),
        },
        CognitiveMemoryLayer {
            layer: "Semantic".to_string(),
            count: semantic_count,
            status: if semantic_count > 0 {
                "active".to_string()
            } else {
                "waiting".to_string()
            },
            detail: cognitive_memory_detail(
                &memory_counts,
                "semantic",
                "Registered worker capabilities and model lanes.",
            ),
        },
        CognitiveMemoryLayer {
            layer: "Procedural".to_string(),
            count: procedural_count,
            status: if procedural_count > 0 {
                "active".to_string()
            } else {
                "waiting".to_string()
            },
            detail: cognitive_memory_detail(
                &memory_counts,
                "procedural",
                "Layer choices, admission decisions, and route handoff patterns.",
            ),
        },
    ]
}

fn build_cognitive_trace(admissions: &[&serde_json::Value]) -> Vec<CognitiveTraceNode> {
    let mut trace = Vec::new();
    for admission in admissions.iter().rev().take(4) {
        let status = cognitive_status_label(admission);
        let state = cognitive_status_state(&status);
        let goal_id = first_non_empty(vec![
            json_field_string(admission, "goalId"),
            "q-route goal".to_string(),
        ]);
        let tool_name = first_non_empty(vec![
            json_field_string(admission, "toolName"),
            "q.route.dispatch".to_string(),
        ]);
        let risk_tier = cognitive_risk_tier(admission);
        let ledger_record = json_field_string(admission, "ledgerRecordId");
        let scorecard_status = json_field_string(admission, "scorecardStatus");
        let quality = cognitive_quality_percent(admission);
        let recorded_trace = recorded_cognitive_trace_nodes(admission, &state);

        if !recorded_trace.is_empty() {
            trace.extend(recorded_trace);
            continue;
        }

        trace.push(CognitiveTraceNode {
            kind: "Goal".to_string(),
            label: shorten(&goal_id, 48),
            state: state.clone(),
            detail: format!("Tool {tool_name}. Risk tier {risk_tier}."),
        });
        trace.push(CognitiveTraceNode {
            kind: "Decision".to_string(),
            label: status.clone(),
            state: state.clone(),
            detail: cognitive_trace_detail(admission),
        });
        trace.push(CognitiveTraceNode {
            kind: "Scorecard".to_string(),
            label: if scorecard_status.is_empty() {
                "scorecard".to_string()
            } else {
                scorecard_status
            },
            state: state.clone(),
            detail: format!("Quality {quality}%."),
        });
        if !ledger_record.is_empty() {
            trace.push(CognitiveTraceNode {
                kind: "Ledger".to_string(),
                label: shorten(&ledger_record, 42),
                state,
                detail: "Admission proof is linked to the route claim.".to_string(),
            });
        }
    }

    if trace.is_empty() {
        trace.push(CognitiveTraceNode {
            kind: "Waiting".to_string(),
            label: "No admission yet".to_string(),
            state: "waiting".to_string(),
            detail: "A cognitive trace appears after a Q worker claims a route.".to_string(),
        });
    }

    trace.truncate(12);
    trace
}

fn build_cognitive_scorecards(admissions: &[&serde_json::Value]) -> Vec<CognitiveScorecard> {
    admissions
        .iter()
        .rev()
        .take(5)
        .map(|admission| {
            let status = first_non_empty(vec![
                json_field_string(admission, "scorecardStatus"),
                cognitive_status_label(admission),
            ]);
            CognitiveScorecard {
                goal_id: shorten(
                    &first_non_empty(vec![
                        json_field_string(admission, "goalId"),
                        "q-route goal".to_string(),
                    ]),
                    54,
                ),
                status,
                quality: cognitive_quality_percent(admission),
                risk_tier: cognitive_risk_tier(admission),
                detail: cognitive_trace_detail(admission),
            }
        })
        .collect()
}

fn push_unique_hint(hints: &mut Vec<String>, hint: String) {
    if hint.trim().is_empty() || hints.iter().any(|existing| existing == &hint) {
        return;
    }
    hints.push(hint);
}

fn build_cognitive_policy_hints(admissions: &[&serde_json::Value]) -> Vec<String> {
    let mut hints = Vec::new();
    for admission in admissions.iter().rev() {
        for approval in json_string_array(admission.get("missingApprovals"), 3) {
            push_unique_hint(
                &mut hints,
                format!("Waiting for {approval} before this route can run."),
            );
        }
        for reason in json_string_array(admission.get("reasons"), 2) {
            push_unique_hint(&mut hints, reason);
        }
        if hints.len() >= 4 {
            break;
        }
    }

    if hints.is_empty() {
        if admissions.is_empty() {
            hints.push("Q route admissions will appear after a worker claims a route.".to_string());
        } else {
            hints.push("Planner, executor, critic, governor, and ledger roles are separated for route dispatch.".to_string());
        }
    }

    hints.truncate(4);
    hints
}

fn build_cognitive_runtime_snapshot(
    queue: &[serde_json::Value],
    workers: &[serde_json::Value],
    runtime: &[serde_json::Value],
    source_exists: bool,
) -> CognitiveRuntimeSnapshot {
    let admissions = queue
        .iter()
        .filter_map(queue_cognitive_admission)
        .collect::<Vec<&serde_json::Value>>();
    let mut allow_count = 0usize;
    let mut review_count = 0usize;
    let mut delay_count = 0usize;
    let mut deny_count = 0usize;
    let mut total_quality = 0usize;
    let mut highest_risk_tier = 0u8;

    for admission in &admissions {
        match cognitive_status_label(admission).as_str() {
            "allow" => allow_count += 1,
            "delay" => delay_count += 1,
            "deny" => deny_count += 1,
            _ => review_count += 1,
        }
        let risk_tier = cognitive_risk_tier(admission);
        highest_risk_tier = highest_risk_tier.max(risk_tier);
        total_quality += cognitive_quality_percent(admission) as usize;
    }

    let average_quality = if admissions.is_empty() {
        0
    } else {
        (total_quality / admissions.len()).min(100) as u8
    };
    let status = if deny_count > 0 {
        "blocked"
    } else if review_count + delay_count > 0 {
        "review"
    } else if allow_count > 0 {
        "ready"
    } else {
        "waiting"
    }
    .to_string();
    let summary = if admissions.is_empty() {
        if source_exists {
            "Agent files are live. No governed route admission has been recorded yet.".to_string()
        } else {
            "No agent route files were found for this workspace yet.".to_string()
        }
    } else {
        format!(
            "{} governed decisions: {} allowed, {} need review, {} delayed, {} denied. Average score {}%.",
            admissions.len(),
            allow_count,
            review_count,
            delay_count,
            deny_count,
            average_quality
        )
    };

    CognitiveRuntimeSnapshot {
        status,
        summary,
        goal_count: admissions.len(),
        decision_count: admissions.len(),
        allow_count,
        review_count,
        delay_count,
        deny_count,
        highest_risk_tier,
        average_quality,
        memory_layers: build_cognitive_memory_layers(queue, workers, runtime, &admissions),
        trace: build_cognitive_trace(&admissions),
        scorecards: build_cognitive_scorecards(&admissions),
        policy_hints: build_cognitive_policy_hints(&admissions),
    }
}

#[tauri::command]
fn agent_runtime_snapshot(workspace_path: Option<String>) -> AgentRuntimeSnapshot {
    let (q_runs_dir, source_exists) = select_q_runs_dir(workspace_path);
    let queue = read_json_array(&q_runs_dir.join("route-queue.json"));
    let workers = read_json_array(&q_runs_dir.join("route-workers.json"));
    let runtime = read_json_array(&q_runs_dir.join("route-worker-runtime.json"));
    let events = build_agent_runtime_events(&queue, &workers, &runtime, source_exists);
    let cognitive = build_cognitive_runtime_snapshot(&queue, &workers, &runtime, source_exists);
    let summary = if source_exists {
        format!(
            "Loaded {} waiting tasks, {} workers, and {} running updates.",
            queue.len(),
            workers.len(),
            runtime.len()
        )
    } else {
        "No agent activity files were found for this workspace yet.".to_string()
    };

    AgentRuntimeSnapshot {
        checked_at: now_unix_label(),
        source: q_runs_dir.display().to_string(),
        summary,
        queue_count: queue.len(),
        worker_count: workers.len(),
        runtime_count: runtime.len(),
        events,
        cognitive,
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

fn jaws_runtime_work_dir() -> PathBuf {
    let preferred = openjaws_config_home_dir().join("jaws-desktop-runtime");
    if fs::create_dir_all(&preferred).is_ok() {
        return preferred;
    }

    let fallback = env::temp_dir().join("jaws-desktop-runtime");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn openjaws_command_work_dir(workspace_path: Option<String>) -> (PathBuf, String, bool) {
    if let Some(workspace) = workspace_path
        .as_deref()
        .map(|path| validate_workspace(path.to_string()))
        .filter(|workspace| workspace.valid)
    {
        let path = PathBuf::from(&workspace.path);
        return (path, workspace.path, true);
    }

    let runtime = jaws_runtime_work_dir();
    let label = runtime.display().to_string();
    (runtime, label, false)
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

fn record_browser_preview_session(url: &str, action: &str, note: &str, opened: bool) {
    let path = browser_preview_receipt_path();
    if let Some(parent) = path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }

    let mut receipt = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();

    let mut sessions = receipt
        .remove("sessions")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();

    sessions.push(serde_json::json!({
        "id": format!("jaws-preview-{}", now_unix_label().replace(':', "-")),
        "action": action,
        "intent": "browser-preview",
        "requestedBy": "jaws-desktop",
        "startedAt": now_unix_label(),
        "opened": opened,
        "note": note,
        "url": url
    }));

    if sessions.len() > 50 {
        let keep_from = sessions.len().saturating_sub(50);
        sessions = sessions.into_iter().skip(keep_from).collect();
    }

    receipt.insert("version".to_string(), serde_json::Value::Number(1.into()));
    receipt.insert(
        "updatedAt".to_string(),
        serde_json::Value::String(now_unix_label()),
    );
    receipt.insert("sessions".to_string(), serde_json::Value::Array(sessions));

    let _ = fs::write(
        path,
        serde_json::to_string_pretty(&serde_json::Value::Object(receipt)).unwrap_or_default()
            + "\n",
    );
}

fn preview_window_label(url: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in url.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("jaws-preview-{hash:016x}")
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
        "OpenJaws website test".to_string()
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
        "openjaws-website-test".to_string()
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
        serde_json::to_string(name).unwrap_or_else(|_| "\"OpenJaws website test\"".to_string());
    let url_json =
        serde_json::to_string(url).unwrap_or_else(|_| "\"http://127.0.0.1:5173\"".to_string());

    r#"import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const DEMO_NAME = __DEMO_NAME__
const DEMO_URL = __DEMO_URL__

test.describe(DEMO_NAME, () => {
  test('loads, renders meaningful content, and captures evidence', async ({ page }, testInfo) => {
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
    const screenshotPath = testInfo.outputPath('full-page.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    await writeFile(
      testInfo.outputPath('summary.json'),
      JSON.stringify({
        name: DEMO_NAME,
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
        "# {name}\n\nThis JAWS website test checks a web app, product page, service, or game URL and saves a reusable browser record.\n\n- URL: {url}\n- Start command: {dev_command}\n\n## Commands\n\n```powershell\n{install}\n{test}\n{headed}\n{codegen}\n```\n\n## What It Captures\n\n- desktop and mobile Chromium checks\n- full-page screenshots\n- Playwright trace/video on failure\n- a JSON summary with title, final URL, visible text, console errors, and page errors\n\nUse the OpenJaws preview command while building:\n\n```text\n{preview}\n```\n"
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
            "Browser preview history exists, but no sessions were recorded.".to_string()
        } else {
            "No browser preview history yet. JAWS creates it when you or an agent records a preview."
                .to_string()
        }
    } else {
        format!(
            "Loaded {} browser preview session{}.",
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
fn open_browser_preview_window(app: tauri::AppHandle, url: String) -> PreviewWindowResult {
    let cleaned_url = match clean_preview_url(&url) {
        Ok(value) => value,
        Err(message) => {
            return PreviewWindowResult {
                ok: false,
                url,
                label: String::new(),
                message,
            };
        }
    };

    let parsed = match cleaned_url.parse() {
        Ok(value) => value,
        Err(error) => {
            return PreviewWindowResult {
                ok: false,
                url: cleaned_url,
                label: String::new(),
                message: format!("Preview URL could not be opened: {error}"),
            };
        }
    };

    let label = preview_window_label(&cleaned_url);
    let build_result =
        tauri::WebviewWindowBuilder::new(&app, label.clone(), tauri::WebviewUrl::External(parsed))
            .title(format!("JAWS Preview - {cleaned_url}"))
            .inner_size(1180.0, 820.0)
            .resizable(true)
            .build();

    match build_result {
        Ok(_) => {
            record_browser_preview_session(
                &cleaned_url,
                "native-window",
                "Opened in a dedicated JAWS preview window.",
                true,
            );
            PreviewWindowResult {
                ok: true,
                url: cleaned_url,
                label,
                message: "Opened in a dedicated JAWS preview window.".to_string(),
            }
        }
        Err(error) => PreviewWindowResult {
            ok: false,
            url: cleaned_url,
            label,
            message: format!("Native preview window could not be opened: {error}"),
        },
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
            format!("Could not create the website test folder: {error}"),
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
                    "Could not write website test file {}: {error}",
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
        message: "Website test files were created for this workspace.".to_string(),
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
        route_policy: "Start workers only when the room is ready and you approve shared credits."
            .to_string(),
        controls: vec![
            QAgentsCoworkControl {
                id: "planner".to_string(),
                label: "Q planner".to_string(),
                detail: "Breaks the request into clear jobs.".to_string(),
                status: "ready".to_string(),
            },
            QAgentsCoworkControl {
                id: "implementer".to_string(),
                label: "Q_agent implementer".to_string(),
                detail: "Works on approved project files.".to_string(),
                status: "ready check".to_string(),
            },
            QAgentsCoworkControl {
                id: "verifier".to_string(),
                label: "Q_agent verifier".to_string(),
                detail: "Runs tests and checks before you ship.".to_string(),
                status: "ready check".to_string(),
            },
            QAgentsCoworkControl {
                id: "cowork".to_string(),
                label: "Co-work room".to_string(),
                detail: "Pairs another JAWS user into the same workspace with a shared code."
                    .to_string(),
                status: "local ready".to_string(),
            },
        ],
    }
}

#[derive(Default)]
struct CategoryAccumulator {
    label: &'static str,
    file_count: usize,
    included_count: usize,
    estimated_tokens: u64,
}

#[derive(Default)]
struct SkipAccumulator {
    count: usize,
    examples: Vec<String>,
}

fn push_skip(skipped: &mut BTreeMap<String, SkipAccumulator>, reason: &str, path: String) {
    let entry = skipped.entry(reason.to_string()).or_default();
    entry.count += 1;
    if entry.examples.len() < 4 {
        entry.examples.push(path);
    }
}

fn relative_display_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .display()
        .to_string()
        .replace('\\', "/")
}

fn path_name_lower(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn path_extension_lower(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn is_generated_or_heavy_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".hg"
            | ".svn"
            | "node_modules"
            | "dist"
            | "build"
            | "target"
            | ".next"
            | ".nuxt"
            | ".tauri"
            | "coverage"
            | ".cache"
            | ".runtime"
            | "artifacts"
            | "__pycache__"
            | ".venv"
            | "venv"
    )
}

fn is_secret_like_path(path: &Path) -> bool {
    let name = path_name_lower(path);
    let extension = path_extension_lower(path);
    name == ".env"
        || name.starts_with(".env.")
        || name.ends_with(".local")
        || name.contains("secret")
        || name.contains("credential")
        || name.contains("private-key")
        || name.contains("id_rsa")
        || extension == "pem"
        || extension == "key"
        || extension == "p12"
        || extension == "pfx"
}

fn category_for_path(path: &Path) -> (&'static str, &'static str) {
    let name = path_name_lower(path);
    let extension = path_extension_lower(path);
    if name.contains("test")
        || name.contains("spec")
        || path.components().any(|part| {
            part.as_os_str()
                .to_str()
                .map(|value| matches!(value, "test" | "tests" | "__tests__"))
                .unwrap_or(false)
        })
    {
        return ("tests", "Tests");
    }
    if matches!(
        name.as_str(),
        "readme.md" | "changelog.md" | "license" | "license.md"
    ) || matches!(extension.as_str(), "md" | "mdx" | "rst" | "txt")
    {
        return ("docs", "Docs");
    }
    if matches!(
        name.as_str(),
        "package.json"
            | "cargo.toml"
            | "tauri.conf.json"
            | "tsconfig.json"
            | "vite.config.ts"
            | "next.config.js"
            | "netlify.toml"
            | "bunfig.toml"
            | "dockerfile"
    ) || matches!(
        extension.as_str(),
        "json" | "jsonc" | "toml" | "yaml" | "yml"
    ) {
        return ("config", "Config");
    }
    if matches!(
        extension.as_str(),
        "ts" | "tsx"
            | "js"
            | "jsx"
            | "rs"
            | "py"
            | "go"
            | "java"
            | "cs"
            | "cpp"
            | "c"
            | "h"
            | "hpp"
            | "css"
            | "scss"
            | "html"
            | "sql"
            | "sh"
            | "ps1"
    ) {
        return ("code", "Code");
    }
    if matches!(
        extension.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "ico"
            | "icns"
            | "mp4"
            | "mov"
            | "mp3"
            | "wav"
            | "zip"
            | "tar"
            | "gz"
            | "7z"
            | "pdf"
            | "dll"
            | "exe"
            | "bin"
    ) {
        return ("assets", "Assets");
    }
    ("other", "Other")
}

fn category_detail(id: &str) -> &'static str {
    match id {
        "code" => "Source files that explain behavior and implementation.",
        "tests" => "Verifier files that define expected behavior.",
        "docs" => "Project memory, release notes, and operator docs.",
        "config" => "Build, package, and app settings.",
        "assets" => "Binary or media assets tracked as metadata only.",
        _ => "Other lightweight project files considered as metadata.",
    }
}

fn context_category_status(included: usize, total: usize) -> String {
    if included == 0 {
        "blocked".to_string()
    } else if included < total {
        "partial".to_string()
    } else {
        "included".to_string()
    }
}

fn estimate_tokens(size: u64) -> u64 {
    (size / 4).max(1)
}

fn is_context_includable(category: &str, size: u64) -> bool {
    category != "assets" && size <= 256 * 1024
}

fn priority_reason(path: &Path, category: &str) -> Option<&'static str> {
    let name = path_name_lower(path);
    if matches!(
        name.as_str(),
        "readme.md"
            | "package.json"
            | "cargo.toml"
            | "tauri.conf.json"
            | "vite.config.ts"
            | "tsconfig.json"
            | "changelog.md"
    ) {
        return Some("project contract");
    }
    if category == "tests" {
        return Some("verifier surface");
    }
    if category == "docs" && name.contains("jaws") {
        return Some("product memory");
    }
    if category == "code" && matches!(path_extension_lower(path).as_str(), "ts" | "tsx" | "rs") {
        return Some("implementation surface");
    }
    None
}

fn build_context_categories(
    categories: BTreeMap<String, CategoryAccumulator>,
) -> Vec<ContextCategory> {
    categories
        .into_iter()
        .map(|(id, category)| {
            let confidence = if category.file_count == 0 {
                0
            } else {
                ((category.included_count as f64 / category.file_count as f64) * 100.0).round()
                    as u8
            };
            ContextCategory {
                status: context_category_status(category.included_count, category.file_count),
                detail: category_detail(&id).to_string(),
                id,
                label: category.label.to_string(),
                file_count: category.file_count,
                included_count: category.included_count,
                estimated_tokens: category.estimated_tokens,
                confidence,
            }
        })
        .collect()
}

fn build_context_skips(skipped: BTreeMap<String, SkipAccumulator>) -> Vec<ContextSkippedGroup> {
    skipped
        .into_iter()
        .map(|(reason, group)| ContextSkippedGroup {
            reason,
            count: group.count,
            examples: group.examples,
        })
        .collect()
}

fn context_brain_lanes(confidence_score: u8, scanned_files: usize) -> Vec<ContextBrainLane> {
    let status = if scanned_files == 0 {
        "blocked"
    } else if confidence_score >= 75 {
        "ready"
    } else {
        "review"
    };
    vec![
        ContextBrainLane {
            label: "Q planner".to_string(),
            receives: "project map and important files".to_string(),
            status: status.to_string(),
            detail: "Uses the Context view before planning.".to_string(),
        },
        ContextBrainLane {
            label: "Q_agents".to_string(),
            receives: "files to work on and files to avoid".to_string(),
            status: status.to_string(),
            detail: "Workers share the same project scan.".to_string(),
        },
        ContextBrainLane {
            label: "OpenCheek".to_string(),
            receives: "shared notes and project coverage".to_string(),
            status: if scanned_files == 0 {
                "blocked"
            } else {
                "ready"
            }
            .to_string(),
            detail: "Keeps co-work notes tied to this project.".to_string(),
        },
        ContextBrainLane {
            label: "Immaculate".to_string(),
            receives: "test scope, release checks, and privacy notes".to_string(),
            status: status.to_string(),
            detail: "Uses the scan for final checks.".to_string(),
        },
    ]
}

#[tauri::command]
fn project_context_snapshot(workspace_path: Option<String>) -> ProjectContextSnapshot {
    let workspace = workspace_path
        .as_deref()
        .map(|path| validate_workspace(path.to_string()))
        .unwrap_or_else(|| validate_workspace(String::new()));

    if !workspace.valid {
        return ProjectContextSnapshot {
            checked_at: now_unix_label(),
            workspace_path: workspace.path,
            workspace_name: workspace.name,
            valid: false,
            source: "workspace not selected".to_string(),
            confidence_score: 0,
            summary: "Select a valid project folder before building the Context view.".to_string(),
            total_files: 0,
            scanned_files: 0,
            skipped_files: 0,
            estimated_tokens: 0,
            context_budget_tokens: 200_000,
            categories: Vec::new(),
            priority_files: Vec::new(),
            skipped: Vec::new(),
            brain_lanes: context_brain_lanes(0, 0),
            notes: vec![
                "No raw file contents are shown in this view.".to_string(),
                "Open a folder to generate aggregate context evidence.".to_string(),
            ],
        };
    }

    let root = PathBuf::from(&workspace.path);
    let mut stack = vec![(root.clone(), 0usize)];
    let mut categories: BTreeMap<String, CategoryAccumulator> = BTreeMap::new();
    let mut skipped: BTreeMap<String, SkipAccumulator> = BTreeMap::new();
    let mut priority_files = Vec::new();
    let mut total_files = 0usize;
    let mut scanned_files = 0usize;
    let mut estimated_tokens_total = 0u64;
    let max_files = 5_000usize;
    let max_depth = 8usize;

    while let Some((dir, depth)) = stack.pop() {
        if depth > max_depth {
            push_skip(
                &mut skipped,
                "max depth",
                relative_display_path(&root, &dir),
            );
            continue;
        }

        let Ok(entries) = fs::read_dir(&dir) else {
            push_skip(
                &mut skipped,
                "unreadable directory",
                relative_display_path(&root, &dir),
            );
            continue;
        };

        for entry in entries.flatten() {
            if total_files >= max_files {
                push_skip(&mut skipped, "scan limit", format!(">{max_files} files"));
                break;
            }

            let path = entry.path();
            let name = path_name_lower(&path);
            let display_path = relative_display_path(&root, &path);
            let Ok(file_type) = entry.file_type() else {
                push_skip(&mut skipped, "unreadable metadata", display_path);
                continue;
            };

            if file_type.is_symlink() {
                push_skip(&mut skipped, "symlink", display_path);
                continue;
            }

            if file_type.is_dir() {
                if is_generated_or_heavy_dir(&name) || name.starts_with('.') {
                    push_skip(&mut skipped, "generated or hidden directory", display_path);
                } else {
                    stack.push((path, depth + 1));
                }
                continue;
            }

            if !file_type.is_file() {
                continue;
            }

            total_files += 1;
            if is_secret_like_path(&path) {
                push_skip(&mut skipped, "secret-like file", display_path);
                continue;
            }

            let size = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
            let (category_id, category_label) = category_for_path(&path);
            let category = categories
                .entry(category_id.to_string())
                .or_insert_with(|| CategoryAccumulator {
                    label: category_label,
                    ..CategoryAccumulator::default()
                });
            category.file_count += 1;

            if !is_context_includable(category_id, size) {
                let reason = if category_id == "assets" {
                    "asset metadata only"
                } else {
                    "large file"
                };
                push_skip(&mut skipped, reason, display_path);
                continue;
            }

            let tokens = estimate_tokens(size);
            scanned_files += 1;
            estimated_tokens_total += tokens;
            category.included_count += 1;
            category.estimated_tokens += tokens;

            if priority_files.len() < 18 {
                if let Some(reason) = priority_reason(&path, category_id) {
                    priority_files.push(ContextPriorityFile {
                        path: display_path,
                        kind: category_label.to_string(),
                        reason: reason.to_string(),
                        estimated_tokens: tokens,
                        status: "included".to_string(),
                    });
                }
            }
        }
    }

    let skipped_files: usize = skipped.values().map(|group| group.count).sum();
    let coverage = if total_files == 0 {
        0.0
    } else {
        scanned_files as f64 / total_files as f64
    };
    let has_tests = categories
        .get("tests")
        .map(|category| category.included_count > 0)
        .unwrap_or(false);
    let has_docs = categories
        .get("docs")
        .map(|category| category.included_count > 0)
        .unwrap_or(false);
    let has_config = categories
        .get("config")
        .map(|category| category.included_count > 0)
        .unwrap_or(false);
    let mut confidence = (coverage * 60.0).round() as u8;
    if has_config {
        confidence += 15;
    }
    if has_docs {
        confidence += 10;
    }
    if has_tests {
        confidence += 10;
    }
    if scanned_files > 25 {
        confidence += 5;
    }
    confidence = confidence.min(100);

    let categories = build_context_categories(categories);
    let summary = format!(
        "JAWS scanned {scanned_files} of {total_files} files with {confidence}% confidence. Sensitive, generated, binary, and large files are counted as skipped instead of shown."
    );

    ProjectContextSnapshot {
        checked_at: now_unix_label(),
        workspace_path: workspace.path,
        workspace_name: workspace.name,
        valid: true,
        source: root.display().to_string(),
        confidence_score: confidence,
        summary,
        total_files,
        scanned_files,
        skipped_files,
        estimated_tokens: estimated_tokens_total,
        context_budget_tokens: 200_000,
        categories,
        priority_files,
        skipped: build_context_skips(skipped),
        brain_lanes: context_brain_lanes(confidence, scanned_files),
        notes: vec![
            "This view shows counts and file names, not raw source, secrets, env files, or private prompts.".to_string(),
            "Q and Q_agents should use this scan before claiming they understand the project.".to_string(),
            "Skipped files are shown as counts and examples so you can spot missing context without exposing contents.".to_string(),
        ],
    }
}

fn has_config_value(names: &[&str]) -> bool {
    names.iter().any(|name| {
        env::var(name)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    })
}

fn arobi_external_route_configured() -> bool {
    let has_url = has_config_value(&[
        "LAAS_API_URL",
        "AROBI_LAAS_BASE_URL",
        "AROBI_LAAS_API_URL",
        "AROBI_LEDGER_BASE_URL",
        "AROBI_LEDGER_API_URL",
    ]);
    let has_token = has_config_value(&[
        "LAAS_API_TOKEN",
        "AROBI_LAAS_TOKEN",
        "AROBI_LAAS_API_TOKEN",
        "AROBI_LEDGER_TOKEN",
    ]);
    let edge_secret = openjaws_config_home_dir()
        .parent()
        .map(|home| home.join(".arobi").join("edge-secrets.json"))
        .filter(|path| path.exists())
        .is_some();

    (has_url && has_token) || edge_secret
}

fn push_ledger_event(events: &mut Vec<LedgerEventSummary>, event: LedgerEventSummary) {
    if event.id.trim().is_empty()
        || events
            .iter()
            .any(|existing| existing.id == event.id && existing.surface == event.surface)
    {
        return;
    }
    events.push(event);
}

fn route_ledger_event(entry: &serde_json::Value) -> LedgerEventSummary {
    let admission = queue_cognitive_admission(entry);
    let run_id = first_non_empty(vec![
        json_field_string(entry, "runId"),
        json_field_string(entry, "id"),
        "q-route".to_string(),
    ]);
    let status = first_non_empty(vec![
        json_field_string(entry, "status"),
        admission
            .map(cognitive_status_label)
            .unwrap_or_else(|| "recorded".to_string()),
    ]);
    let proof = admission
        .map(|value| json_field_string(value, "ledgerRecordId"))
        .unwrap_or_default();
    let risk_tier = admission.map(cognitive_risk_tier).unwrap_or(0);
    let detail = admission
        .map(cognitive_trace_detail)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            first_non_empty(vec![
                json_field_string(entry, "summary"),
                json_field_string(entry, "prompt"),
                json_field_string(entry, "objective"),
                "Q route activity recorded.".to_string(),
            ])
        });

    LedgerEventSummary {
        id: shorten(&run_id, 80),
        time: best_event_time(entry, &["updatedAt", "createdAt", "claimedAt", "startedAt"]),
        actor: first_non_empty(vec![
            json_nested_string(entry, "claim", "workerId"),
            json_field_string(entry, "workerId"),
            "Q".to_string(),
        ]),
        action: "agent route".to_string(),
        surface: "OpenJaws".to_string(),
        status,
        proof: if proof.is_empty() {
            "local route receipt".to_string()
        } else {
            shorten(&proof, 80)
        },
        detail: shorten(&detail, 180),
        risk_tier,
    }
}

fn browser_ledger_event(session: &BrowserPreviewSessionSummary) -> LedgerEventSummary {
    LedgerEventSummary {
        id: first_non_empty(vec![
            session.id.clone(),
            format!("browser-{}", session.started_at),
        ]),
        time: session.started_at.clone(),
        actor: first_non_empty(vec![
            session.requested_by.clone(),
            "JAWS Desktop".to_string(),
        ]),
        action: first_non_empty(vec![session.action.clone(), "browser preview".to_string()]),
        surface: "Browser Preview".to_string(),
        status: if session.opened {
            "opened".to_string()
        } else {
            "recorded".to_string()
        },
        proof: "browser-preview receipt".to_string(),
        detail: shorten(
            &first_non_empty(vec![session.note.clone(), session.url.clone()]),
            180,
        ),
        risk_tier: 1,
    }
}

fn generic_json_ledger_events(path: &Path, surface: &str, limit: usize) -> Vec<LedgerEventSummary> {
    let value = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let Some(value) = value else {
        return Vec::new();
    };

    let rows = if let Some(rows) = value.as_array() {
        rows.clone()
    } else if let Some(rows) = value.get("events").and_then(|events| events.as_array()) {
        rows.clone()
    } else if let Some(rows) = value.get("ledger").and_then(|events| events.as_array()) {
        rows.clone()
    } else if value.is_object() {
        vec![value]
    } else {
        Vec::new()
    };

    rows.into_iter()
        .take(limit)
        .enumerate()
        .map(|(index, row)| {
            let id = first_non_empty(vec![
                json_field_string(&row, "id"),
                json_field_string(&row, "eventId"),
                json_field_string(&row, "referenceId"),
                format!("{}#{index}", path.display()),
            ]);
            let action = first_non_empty(vec![
                json_field_string(&row, "type"),
                json_field_string(&row, "eventType"),
                json_field_string(&row, "action"),
                json_field_string(&row, "kind"),
                "ledger event".to_string(),
            ]);
            let status = first_non_empty(vec![
                json_field_string(&row, "status"),
                json_field_string(&row, "state"),
                "recorded".to_string(),
            ]);
            LedgerEventSummary {
                id: shorten(&id, 80),
                time: best_event_time(
                    &row,
                    &[
                        "createdAt",
                        "created_at",
                        "updatedAt",
                        "timestamp",
                        "savedAt",
                    ],
                ),
                actor: first_non_empty(vec![
                    json_field_string(&row, "actor"),
                    json_field_string(&row, "email"),
                    json_field_string(&row, "source"),
                    "Arobi".to_string(),
                ]),
                action: shorten(&action, 80),
                surface: surface.to_string(),
                status,
                proof: relative_display_path(
                    &path.parent().unwrap_or_else(|| Path::new(".")),
                    path,
                ),
                detail: shorten(
                    &first_non_empty(vec![
                        json_field_string(&row, "description"),
                        json_field_string(&row, "summary"),
                        json_field_string(&row, "reason"),
                        json_field_string(&row, "plan"),
                        "Local ledger JSON event.".to_string(),
                    ]),
                    180,
                ),
                risk_tier: json_number_field(&row, "riskTier")
                    .or_else(|| json_number_field(&row, "risk_tier"))
                    .unwrap_or(0.0)
                    .round()
                    .clamp(0.0, 5.0) as u8,
            }
        })
        .collect()
}

fn push_preview_demo_receipts(root: &Path, events: &mut Vec<LedgerEventSummary>) {
    let demo_root = root.join(".openjaws").join("browser-preview-demos");
    let Ok(entries) = fs::read_dir(&demo_root) else {
        return;
    };

    for entry in entries.flatten().take(12) {
        let path = entry.path().join("openjaws-preview-demo.receipt.json");
        for event in generic_json_ledger_events(&path, "Website Test", 1) {
            push_ledger_event(events, event);
        }
    }
}

#[tauri::command]
fn arobi_ledger_snapshot(workspace_path: Option<String>) -> LedgerSnapshot {
    let (command_dir, command_label, workspace_attached) =
        openjaws_command_work_dir(workspace_path.clone());
    let mut events = Vec::new();
    let mut sources = Vec::new();
    let external_route_configured = arobi_external_route_configured();
    let (q_runs_dir, q_runs_exists) = select_q_runs_dir(workspace_path.clone());

    if q_runs_exists {
        sources.push(q_runs_dir.display().to_string());
        for entry in read_json_array(&q_runs_dir.join("route-queue.json"))
            .into_iter()
            .take(18)
        {
            push_ledger_event(&mut events, route_ledger_event(&entry));
        }
    }

    let browser_receipt = browser_preview_receipt_path();
    if browser_receipt.exists() {
        sources.push(browser_receipt.display().to_string());
        for session in browser_preview_sessions(&browser_receipt) {
            push_ledger_event(&mut events, browser_ledger_event(&session));
        }
    }

    if workspace_attached {
        push_preview_demo_receipts(&command_dir, &mut events);
        let local_ledgers = [
            command_dir
                .join("website")
                .join(".data")
                .join("usage-ledger.local.json"),
            command_dir
                .join("website")
                .join(".data")
                .join("jaws-admin.local.json"),
            command_dir.join(".data").join("usage-ledger.local.json"),
            command_dir.join(".openjaws").join("ledger.json"),
            command_dir.join(".openjaws").join("ledger.local.json"),
        ];
        for path in local_ledgers {
            if path.exists() {
                sources.push(path.display().to_string());
                for event in generic_json_ledger_events(&path, "Arobi Ledger", 8) {
                    push_ledger_event(&mut events, event);
                }
            }
        }
    }

    events.truncate(40);
    let agent_event_count = events
        .iter()
        .filter(|event| event.surface == "OpenJaws" || event.actor.contains('Q'))
        .count();
    let browser_event_count = events
        .iter()
        .filter(|event| event.surface.contains("Browser") || event.surface.contains("Website"))
        .count();
    let credit_event_count = events
        .iter()
        .filter(|event| {
            let text = format!(
                "{} {} {}",
                event.action.to_ascii_lowercase(),
                event.surface.to_ascii_lowercase(),
                event.detail.to_ascii_lowercase()
            );
            text.contains("credit")
                || text.contains("token")
                || text.contains("wallet")
                || text.contains("billing")
        })
        .count();
    let mut warnings = Vec::new();
    if !external_route_configured {
        warnings.push(
            "No external AROBI LAAS route/token is configured in this desktop process; showing local receipts only."
                .to_string(),
        );
    }
    if events.is_empty() {
        warnings.push(
            "No local agent, browser, billing, or credit receipts were found for this workspace yet."
                .to_string(),
        );
    }

    let event_count = events.len();
    let configured = external_route_configured || event_count > 0;
    LedgerSnapshot {
        checked_at: now_unix_label(),
        source: if sources.is_empty() {
            command_label
        } else {
            sources.join(" | ")
        },
        configured,
        summary: if configured {
            format!(
                "{event_count} local audit events found. {agent_event_count} agent, {browser_event_count} browser/test, {credit_event_count} credit/account."
            )
        } else {
            "Ledger is waiting for local receipts or a configured AROBI LAAS route.".to_string()
        },
        event_count,
        agent_event_count,
        browser_event_count,
        credit_event_count,
        external_route_configured,
        events,
        warnings,
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
            message: "Use an absolute project folder path so JAWS can start work safely."
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
            "OpenJaws is connected.".to_string()
        } else {
            "OpenJaws is not bundled in this build.".to_string()
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
                "Release check",
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
                stderr: format!("OpenJaws is unavailable: {error}"),
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
            stderr: format!("OpenJaws check failed: {error}"),
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

fn default_base_url_for_provider(provider: &str) -> String {
    match provider {
        "oci" => default_oci_base_url(),
        "openai" | "codex" => "https://api.openai.com/v1".to_string(),
        "groq" => "https://api.groq.com/openai/v1".to_string(),
        "minimax" => "https://api.minimax.io/v1".to_string(),
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai".to_string(),
        "kimi" => "https://api.moonshot.cn/v1".to_string(),
        "ollama" => "http://127.0.0.1:11434".to_string(),
        _ => String::new(),
    }
}

fn provider_api_key_env_names(provider: &str) -> &'static [&'static str] {
    match provider {
        "oci" => &["Q_API_KEY", "OCI_API_KEY", "OCI_GENAI_API_KEY"],
        "openai" => &["OPENAI_API_KEY"],
        "groq" => &["GROQ_API_KEY"],
        "minimax" => &["MINI_MAX_API_KEY", "MINIMAX_API_KEY"],
        "gemini" => &["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "codex" => &["CODEX_API_KEY", "OPENAI_API_KEY"],
        "kimi" => &["KIMI_API_KEY", "MOONSHOT_API_KEY"],
        "ollama" => &["OLLAMA_API_KEY"],
        _ => &[],
    }
}

fn clean_base_url_arg(value: Option<String>, provider: &str) -> String {
    let fallback = default_base_url_for_provider(provider);
    let candidate = value
        .unwrap_or_else(|| fallback.clone())
        .trim()
        .trim_end_matches('/')
        .to_string();
    let lower = candidate.to_ascii_lowercase();
    let safe_chars = candidate
        .chars()
        .all(|character| !character.is_control() && !character.is_whitespace());
    let allowed_scheme = lower.starts_with("https://")
        || (provider == "ollama"
            && (lower.starts_with("http://127.0.0.1")
                || lower.starts_with("http://localhost")
                || lower.starts_with("http://[::1]")));

    if safe_chars && allowed_scheme && candidate.len() <= 300 {
        candidate
    } else {
        fallback
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
    if provider == "ollama" {
        return "local runtime".to_string();
    }

    if let Some((name, _)) = env_value(provider_api_key_env_names(provider)) {
        return format!("environment key ({name})");
    }

    if provider == "oci" {
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
    let base_url = default_base_url_for_provider(&provider);
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

async fn run_provider_sidecar(
    app: &tauri::AppHandle,
    command_dir: PathBuf,
    args: Vec<String>,
) -> Result<(bool, Option<i32>, String, String), String> {
    let mut command = app
        .shell()
        .sidecar("openjaws")
        .map_err(|error| format!("OpenJaws is unavailable: {error}"))?
        .arg("provider")
        .current_dir(command_dir);
    for arg in args {
        command = command.arg(arg);
    }

    match tokio::time::timeout(Duration::from_secs(45), command.output()).await {
        Ok(Ok(output)) => Ok((
            output.status.success(),
            output.status.code(),
            redact_inference_output(&String::from_utf8_lossy(&output.stdout)),
            redact_inference_output(&String::from_utf8_lossy(&output.stderr)),
        )),
        Ok(Err(error)) => Err(format!("OpenJaws provider command failed: {error}")),
        Err(_) => Err("OpenJaws provider command timed out after 45 seconds.".to_string()),
    }
}

#[tauri::command]
async fn openjaws_inference_status(
    app: tauri::AppHandle,
    provider: Option<String>,
    model: Option<String>,
    run_probe: bool,
    workspace_path: Option<String>,
) -> InferenceCommandResult {
    let provider = clean_provider_arg(provider);
    let model = clean_model_arg(model);
    let base_url = default_base_url_for_provider(&provider);
    let auth_label = inference_auth_label(&provider);
    let (command_dir, command_dir_label, workspace_attached) =
        openjaws_command_work_dir(workspace_path);
    let command = match app.shell().sidecar("openjaws") {
        Ok(command) => {
            let command = command.arg("provider").current_dir(command_dir.clone());
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
                "OpenJaws is unavailable; showing local AI settings only.".to_string(),
                format!("OpenJaws is unavailable: {error}"),
            );
        }
    };

    match tokio::time::timeout(Duration::from_secs(45), command.output()).await {
        Ok(Ok(output)) => {
            let stdout = truncate_text(
                &format!(
                    "{}\n\nRuntime directory: {}{}",
                    redact_inference_output(&String::from_utf8_lossy(&output.stdout)),
                    command_dir_label,
                    if workspace_attached {
                        " (workspace)"
                    } else {
                        " (JAWS writable runtime)"
                    }
                ),
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
                        "AI connection checked.".to_string()
                    } else {
                        "AI settings loaded.".to_string()
                    }
                } else {
                    "AI check returned an error.".to_string()
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
            "AI check failed before output.".to_string(),
            format!("OpenJaws provider command failed: {error}"),
        ),
        Err(_) => fallback_inference_result(
            provider,
            model,
            "AI check timed out before output.".to_string(),
            "OpenJaws provider command timed out after 45 seconds.".to_string(),
        ),
    }
}

#[tauri::command]
async fn openjaws_inference_apply(
    app: tauri::AppHandle,
    provider: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    run_probe: bool,
    workspace_path: Option<String>,
) -> InferenceCommandResult {
    let provider = clean_provider_arg(provider);
    let model = clean_model_arg(model);
    let base_url = clean_base_url_arg(base_url, &provider);
    let auth_label = inference_auth_label(&provider);
    let (command_dir, command_dir_label, workspace_attached) =
        openjaws_command_work_dir(workspace_path);
    let mut stdout_sections = Vec::new();
    let mut stderr_sections = Vec::new();
    let mut final_code = Some(0);
    let mut all_ok = true;

    let commands = [
        vec!["base-url".to_string(), provider.clone(), base_url.clone()],
        vec!["use".to_string(), provider.clone(), model.clone()],
        if run_probe {
            vec!["test".to_string(), provider.clone(), model.clone()]
        } else {
            vec!["status".to_string()]
        },
    ];

    for args in commands {
        match run_provider_sidecar(&app, command_dir.clone(), args.clone()).await {
            Ok((ok, code, stdout, stderr)) => {
                final_code = code;
                if !ok {
                    all_ok = false;
                }
                let command_label = format!("openjaws provider {}", args.join(" "));
                if !stdout.trim().is_empty() {
                    stdout_sections.push(format!("{command_label}\n{stdout}"));
                }
                if !stderr.trim().is_empty() {
                    stderr_sections.push(format!("{command_label}\n{stderr}"));
                }
                if !ok {
                    break;
                }
            }
            Err(error) => {
                all_ok = false;
                final_code = None;
                stderr_sections.push(error);
                break;
            }
        }
    }

    stdout_sections.push(format!(
        "Runtime directory: {}{}",
        command_dir_label,
        if workspace_attached {
            " (workspace)"
        } else {
            " (JAWS writable runtime)"
        }
    ));

    InferenceCommandResult {
        ok: all_ok,
        code: final_code,
        stdout: truncate_text(&stdout_sections.join("\n\n"), 4_000),
        stderr: truncate_text(&stderr_sections.join("\n\n"), 2_000),
        summary: if all_ok {
            if run_probe {
                "AI provider saved and tested.".to_string()
            } else {
                "AI provider saved.".to_string()
            }
        } else {
            "AI provider save needs review.".to_string()
        },
        provider,
        model,
        base_url,
        auth_label,
    }
}

fn is_workspace_analysis_prompt(prompt: &str) -> bool {
    let lower = prompt.to_ascii_lowercase();
    let asks_for_workspace = lower.contains("workspace")
        || lower.contains("project")
        || lower.contains("repo")
        || lower.contains("codebase");
    let asks_for_analysis = lower.contains("analy")
        || lower.contains("inspect")
        || lower.contains("audit")
        || lower.contains("tell me what you see")
        || lower.contains("what do you see")
        || lower.contains("summarize");
    let asks_for_write = lower.contains(" edit ")
        || lower.contains(" change ")
        || lower.contains(" fix ")
        || lower.contains(" implement ")
        || lower.contains(" create ")
        || lower.contains(" delete ")
        || lower.contains(" deploy ");

    asks_for_workspace && asks_for_analysis && !asks_for_write
}

fn workspace_analysis_chat_result(
    workspace: &WorkspaceStatus,
    permission_mode: &str,
) -> ChatCommandResult {
    let context = project_context_snapshot(Some(workspace.path.clone()));
    let ledger = arobi_ledger_snapshot(Some(workspace.path.clone()));
    let categories = if context.categories.is_empty() {
        "- No source categories were scanned.".to_string()
    } else {
        context
            .categories
            .iter()
            .take(8)
            .map(|category| {
                format!(
                    "- {}: {}/{} files, {}% confidence, {} tokens.",
                    category.label,
                    category.included_count,
                    category.file_count,
                    category.confidence,
                    category.estimated_tokens
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let priority_files = if context.priority_files.is_empty() {
        "- No priority files were selected by the bounded scanner.".to_string()
    } else {
        context
            .priority_files
            .iter()
            .take(10)
            .map(|file| format!("- {} ({}) - {}", file.path, file.kind, file.reason))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let skips = if context.skipped.is_empty() {
        "- No privacy or size skips were recorded.".to_string()
    } else {
        context
            .skipped
            .iter()
            .take(6)
            .map(|group| format!("- {}: {}", group.reason, group.count))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let ledger_events = if ledger.events.is_empty() {
        "- No local ledger events were found yet.".to_string()
    } else {
        ledger
            .events
            .iter()
            .take(8)
            .map(|event| {
                format!(
                    "- {} {} {} [{}]",
                    event.actor, event.action, event.surface, event.status
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    ChatCommandResult {
        ok: true,
        code: Some(0),
        stdout: format!(
            "Workspace Analysis\n\
             Workspace: {}\n\
             Source: {}\n\
             Confidence: {}%\n\
             Files scanned: {}/{}\n\
             Estimated context: {} tokens\n\n\
             What I see:\n{}\n\n\
             Priority files:\n{}\n\n\
             Privacy and scan limits:\n{}\n\n\
             Ledger state:\n{}\n{}",
            context.workspace_path,
            context.source,
            context.confidence_score,
            context.scanned_files,
            context.total_files,
            context.estimated_tokens,
            categories,
            priority_files,
            skips,
            ledger.summary,
            ledger_events
        ),
        stderr: String::new(),
        summary: "JAWS completed bounded workspace analysis without waiting on a long chat turn."
            .to_string(),
        permission_mode: permission_mode.to_string(),
        workspace_path: workspace.path.clone(),
    }
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

    if is_workspace_analysis_prompt(prompt) {
        return workspace_analysis_chat_result(&workspace, permission_mode);
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
                stderr: format!("OpenJaws is unavailable: {error}"),
                summary: "OpenJaws unavailable.".to_string(),
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
            summary: "OpenJaws execution failed.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: workspace.path,
        },
        Err(_) => ChatCommandResult {
            ok: false,
            code: None,
            stdout: String::new(),
            stderr: "OpenJaws Chat command timed out after 120 seconds.".to_string(),
            summary: "OpenJaws command timed out.".to_string(),
            permission_mode: permission_mode.to_string(),
            workspace_path: workspace.path,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cognitive_runtime_snapshot_reports_real_admission_state() {
        let queue = vec![
            json!({
                "runId": "route-123456789",
                "status": "claimed",
                "phaseId": "phase-alpha",
                "claim": {
                    "workerId": "worker-1",
                    "cognitiveAdmission": {
                        "status": "review",
                        "goalId": "q-route:route-123456789",
                        "toolName": "q.route.dispatch",
                        "riskTier": 3,
                        "reasons": ["policy governor approval is missing"],
                        "requiredApprovals": ["policy_governor", "ledger_recorder"],
                        "missingApprovals": ["ledger_recorder"],
                        "delayMs": 0,
                        "scorecardStatus": "review",
                        "scorecardQuality": 0.812,
                        "ledgerRecordId": "ledger-record-route-123456789",
                        "trace": {
                            "goalId": "q-route:route-123456789",
                            "nodes": [
                                {
                                    "id": "q-route:route-123456789",
                                    "kind": "goal",
                                    "label": "Dispatch Q route route-123456789.",
                                    "timestamp": "2026-05-01T12:00:00Z",
                                    "metadata": { "owner": "worker-1", "status": "active" }
                                },
                                {
                                    "id": "tool:q-route:route-123456789:q.route.dispatch",
                                    "kind": "tool_call",
                                    "label": "Tool call requested.",
                                    "timestamp": "2026-05-01T12:00:00Z"
                                }
                            ],
                            "edges": []
                        },
                        "memoryUpdates": [
                            {
                                "id": "mem:q-route:route-123456789:working",
                                "layer": "working",
                                "goalId": "q-route:route-123456789",
                                "summary": "Current goal: Dispatch Q route route-123456789.",
                                "evidenceNodeIds": ["q-route:route-123456789"],
                                "createdAt": "2026-05-01T12:00:00Z",
                                "retention": "session",
                                "tags": ["goal", "active"],
                                "policyHints": []
                            },
                            {
                                "id": "mem:q-route:route-123456789:procedural",
                                "layer": "procedural",
                                "goalId": "q-route:route-123456789",
                                "summary": "Route through planner, executor, critic, governor, and recorder roles before release.",
                                "evidenceNodeIds": ["q-route:route-123456789"],
                                "createdAt": "2026-05-01T12:00:00Z",
                                "retention": "durable",
                                "tags": ["procedure"],
                                "policyHints": ["raise verifier coverage before repeating this action"]
                            }
                        ]
                    }
                }
            }),
            json!({
                "runId": "route-done",
                "status": "completed",
                "updatedAt": "2026-05-01T12:00:00Z"
            }),
        ];
        let workers = vec![json!({
            "workerId": "worker-1",
            "executionProfile": "local",
            "supportedBaseModels": ["q-base"]
        })];
        let runtime = vec![json!({
            "workerId": "worker-1",
            "status": "ready"
        })];

        let snapshot = build_cognitive_runtime_snapshot(&queue, &workers, &runtime, true);

        assert_eq!(snapshot.status, "review");
        assert_eq!(snapshot.goal_count, 1);
        assert_eq!(snapshot.review_count, 1);
        assert_eq!(snapshot.highest_risk_tier, 3);
        assert_eq!(snapshot.average_quality, 81);
        assert!(snapshot
            .memory_layers
            .iter()
            .any(|layer| layer.layer == "Working" && layer.detail.contains("Current goal")));
        assert!(snapshot
            .trace
            .iter()
            .any(|node| node.kind == "Tool Call" && node.label.contains("Tool call")));
        assert!(snapshot
            .policy_hints
            .iter()
            .any(|hint| hint.contains("ledger_recorder")));
    }

    #[test]
    fn cognitive_runtime_snapshot_uses_waiting_state_without_mocked_admission() {
        let snapshot = build_cognitive_runtime_snapshot(&[], &[], &[], false);

        assert_eq!(snapshot.status, "waiting");
        assert_eq!(snapshot.goal_count, 0);
        assert_eq!(snapshot.average_quality, 0);
        assert_eq!(snapshot.trace[0].kind, "Waiting");
        assert!(snapshot.summary.contains("No agent route files"));
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let path = env::temp_dir().join(format!(
            "jaws-desktop-{name}-{}",
            now_unix_label().replace(':', "-")
        ));
        fs::create_dir_all(&path).expect("test temp dir should be created");
        path
    }

    #[test]
    fn command_work_dir_never_defaults_to_process_cwd_without_workspace() {
        let (path, label, attached) = openjaws_command_work_dir(None);

        assert!(!attached);
        assert!(path.ends_with("jaws-desktop-runtime"));
        assert!(path.is_dir());
        assert!(label.contains("jaws-desktop-runtime"));
    }

    #[test]
    fn workspace_analysis_prompt_uses_bounded_native_scan() {
        assert!(is_workspace_analysis_prompt(
            "analysis the workspace tell me what you see"
        ));
        assert!(is_workspace_analysis_prompt(
            "Inspect this project and summarize the safest next step"
        ));
        assert!(!is_workspace_analysis_prompt(
            "inspect this workspace and fix the failing test"
        ));
    }

    #[test]
    fn inference_provider_inputs_are_bounded_and_provider_aware() {
        assert_eq!(
            clean_base_url_arg(Some("https://api.openai.com/v1/".to_string()), "openai"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            clean_base_url_arg(Some("http://127.0.0.1:11434/".to_string()), "ollama"),
            "http://127.0.0.1:11434"
        );
        assert_eq!(
            clean_base_url_arg(Some("http://evil.example".to_string()), "openai"),
            "https://api.openai.com/v1"
        );
        assert_eq!(clean_provider_arg(Some("MiniMax".to_string())), "minimax");
        assert_eq!(
            default_base_url_for_provider("groq"),
            "https://api.groq.com/openai/v1"
        );
    }

    #[test]
    fn ledger_snapshot_reads_local_q_route_receipts() {
        let root = temp_test_dir("ledger");
        let q_runs = root.join("artifacts").join("q-runs");
        fs::create_dir_all(&q_runs).expect("q-runs dir should be created");
        fs::write(
            q_runs.join("route-queue.json"),
            serde_json::to_string_pretty(&json!([
                {
                    "runId": "route-ledger-test",
                    "status": "claimed",
                    "updatedAt": "2026-05-02T02:00:00Z",
                    "claim": {
                        "workerId": "worker-ledger",
                        "cognitiveAdmission": {
                            "status": "allow",
                            "goalId": "q-route:route-ledger-test",
                            "toolName": "q.route.dispatch",
                            "riskTier": 2,
                            "scorecardQuality": 0.91,
                            "ledgerRecordId": "ledger-record-ledger-test"
                        }
                    }
                }
            ]))
            .unwrap(),
        )
        .expect("route queue should be written");

        let snapshot = arobi_ledger_snapshot(Some(root.display().to_string()));

        assert!(snapshot.configured);
        assert!(snapshot.event_count >= 1);
        assert!(snapshot.agent_event_count >= 1);
        assert!(snapshot.events.iter().any(|event| {
            event.id.contains("route-ledger-test")
                && event.proof.contains("ledger-record-ledger-test")
        }));
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(updater_builder.build())
        .invoke_handler(tauri::generate_handler![
            agent_runtime_snapshot,
            arobi_ledger_snapshot,
            backend_status,
            account_session,
            browser_preview_snapshot,
            enrollment_links,
            open_browser_preview_window,
            openjaws_inference_apply,
            openjaws_inference_status,
            openjaws_smoke,
            openjaws_workspace_smoke,
            probe_release_update_pipeline,
            project_context_snapshot,
            q_agents_cowork_plan,
            resolve_workspace,
            run_openjaws_chat,
            validate_workspace,
            write_browser_preview_demo_harness,
            write_browser_preview_launch_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAWS Desktop");
}
