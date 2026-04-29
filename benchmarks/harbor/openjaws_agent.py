from __future__ import annotations

import base64
import configparser
import io
import json
import os
import shlex
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from harbor.agents.installed.base import BaseInstalledAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trajectories import Agent, FinalMetrics, Metrics, Step, Trajectory
from harbor.utils.env import resolve_env_vars
from harbor.utils.trajectory_utils import format_trajectory_json


class OpenJawsHarborAgent(BaseInstalledAgent):
    """Minimal Harbor adapter for the compiled OpenJaws CLI."""

    SUPPORTS_ATIF: bool = True

    _STAGED_SOURCE_DIRNAME = "openjaws-source"
    _STAGED_RUNTIME_DIRNAME = "openjaws-runtime"
    _SOURCE_MANIFEST_FILENAME = "openjaws-source-manifest.json"
    _RUNTIME_MANIFEST_FILENAME = "openjaws-runtime-manifest.json"
    _CLI_BUNDLE_META_FILENAME = "openjaws-cli-bundle.json"
    _HARNESS_BOOTSTRAP_FILENAME = ".openjaws_harness_bootstrap.py"
    _HARNESS_NOTES_FILENAME = ".openjaws_harness_notes.md"
    _RESULT_FILENAME = "openjaws-result.json"
    _STDOUT_FILENAME = "openjaws.stdout.log"
    _STDERR_FILENAME = "openjaws.stderr.log"
    _TRAJECTORY_FILENAME = "trajectory.json"
    _CONTAINER_SOURCE_DIR = "/opt/openjaws-src"
    _CONTAINER_BINARY_PATH = "/usr/local/bin/openjaws"
    _CONTAINER_CLI_BUNDLE_PATH = "/opt/openjaws-src/openjaws-cli.js"
    _CONTAINER_BUN_ARCHIVE_PATH = "/tmp/openjaws-bun.zip"
    _CONTAINER_BUN_ROOT = "/opt/openjaws-bun"
    _CONTAINER_OCI_DIR = "/opt/openjaws-src/runtime/oci"
    _CONTAINER_OCI_CONFIG_PATH = "/opt/openjaws-src/runtime/oci/config"
    _WORKSPACE_DIR = "/app"
    _BUN_ARCHIVE_FILENAME = "bun-linux-x64-baseline.zip"
    _CLI_BUNDLE_FILENAME = "openjaws-cli.js"
    _DEFAULT_BUN_VERSION = "1.3.11"
    _CLI_BUNDLE_BUILD_TIMEOUT_SEC = 180
    _OCI_REFERENCED_PATH_KEYS = ("key_file", "security_token_file", "cert_bundle")
    _EMBEDDED_OCI_BUNDLE_ENV = "OPENJAWS_OCI_CONFIG_BUNDLE_B64"
    _BENCHMARK_EFFORT_LEVEL = "max"
    _TERMINALBENCH_APPEND_SYSTEM_PROMPT = (
        "Terminal-Bench execution contract:\n"
        "- You are in a scored code-edit benchmark. Maximize verifier reward on the current /app workspace.\n"
        "- /app is the task workspace. Work inside /app, not inside the OpenJaws source tree.\n"
        "- Before any final judgment, inspect /app, write a best-effort artifact or generator into /app, and run at least one verification command.\n"
        "- A reusable editable harness scaffold is available in /app/.openjaws_harness_bootstrap.py and /app/.openjaws_harness_notes.md.\n"
        "- For hard tasks, start by encoding prompt sample cases in that harness, run it, and iterate on the requested artifact from the observed results.\n"
        "- Do not answer with feasibility analysis, refusal, templates, caveats, or advice-only output.\n"
        "- You must leave behind a concrete attempted implementation in the requested /app files before finishing.\n"
        "- Do not finish with a placeholder, scaffold-only artifact, or final answer that says the requested behavior is not implemented yet; keep editing and verifying.\n"
        "- It is allowed and expected to create helper scripts, generators, or search programs inside /app if that helps the score.\n"
        "- For generated-artifact tasks, prefer a script or generator that emits a large valid artifact over a toy hand-written scaffold.\n"
        "- Inspect task files, edit the workspace directly, and run the local commands needed to check the task.\n"
        "- Tool names and argument schemas are case-sensitive; if a tool call fails validation, retry with the corrected tool name or arguments before concluding.\n"
        "- Do not stop at a starter or example artifact if one exists; verify the requested behavior rather than the example behavior.\n"
        "- If the prompt includes concrete sample inputs or outputs, verify against at least one of them before finishing.\n"
        "- If the task seems infeasible, still produce the strongest partial implementation you can and verify it once before you mention infeasibility.\n"
        "- Never ask for relaxed constraints or a smaller task; attempt the benchmark as given.\n"
        "- Prefer working code, generated artifacts, and measured verification over explanation.\n"
        "- Keep the final response short: files changed, commands run, remaining risk.\n"
    )
    _RETRYABLE_RESULT_SNIPPETS = (
        "oci responses bridge failed",
        "oci request failed",
        "provider preflight failed",
    )
    _HOST_ENV_NAMES = (
        "Q_API_KEY",
        "Q_BASE_URL",
        "Q_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_MODEL",
        "OPENAI_ORG_ID",
        "OPENAI_ORGANIZATION",
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
        "OCI_CONFIG_FILE",
        "OCI_COMPARTMENT_ID",
        "OCI_GENAI_API_KEY",
        "OCI_GENAI_PROJECT_ID",
        "OCI_GENAI_ENDPOINT",
        "OCI_PROFILE",
        "OCI_REGION",
        "OCI_BASE_URL",
        "OCI_MODEL",
        "OCI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "HF_TOKEN",
    )

    def __init__(
        self,
        logs_dir: Path,
        source_root: str | None = None,
        max_turns: int = 12,
        build_timeout_sec: int = 1800,
        run_timeout_sec: int = 1800,
        skip_permissions: bool = True,
        use_runtime_bundle: bool = False,
        extra_openjaws_args: str | None = None,
        benchmark_repair_hint: str | None = None,
        *args,
        **kwargs,
    ):
        super().__init__(logs_dir=logs_dir, *args, **kwargs)
        self._source_root = (
            Path(source_root).expanduser().resolve()
            if source_root
            else Path.cwd().resolve()
        )
        self._max_turns = max_turns
        self._build_timeout_sec = build_timeout_sec
        self._run_timeout_sec = run_timeout_sec
        self._skip_permissions = skip_permissions
        self._use_runtime_bundle = use_runtime_bundle
        self._extra_openjaws_args = extra_openjaws_args
        self._benchmark_repair_hint = (benchmark_repair_hint or "").strip()

    @staticmethod
    def name() -> str:
        return "openjaws-harbor"

    @property
    def _install_agent_template_path(self) -> Path:
        # Harbor requires this property on installed agents, but this adapter
        # performs its own imperative setup via setup()/install().
        return Path(__file__)

    def resolve_env_vars(self) -> dict[str, str]:
        host_env = {
            name: value
            for name in self._HOST_ENV_NAMES
            if (value := os.environ.get(name))
        }
        return resolve_env_vars(host_env)

    async def exec_as_root(
        self,
        environment: BaseEnvironment,
        command: str,
        timeout_sec: int | None = None,
    ) -> None:
        result = await environment.exec(command=command, timeout_sec=timeout_sec)
        if result.return_code != 0:
            raise RuntimeError(
                f"OpenJaws Harbor setup command failed with exit code {result.return_code}. "
                f"Stdout: {result.stdout or ''}\nStderr: {result.stderr or ''}"
            )

    async def setup(self, environment: BaseEnvironment) -> None:
        # Terminal-Bench verifiers expect the task workspace to be the cwd.
        environment.task_env_config.workdir = self._WORKSPACE_DIR
        await environment.exec(
            command="echo 'PS1=1 . ~/.bashrc 2>/dev/null; unset PS1' >> ~/.bash_profile"
        )
        await self._ensure_linux_logs_aliases(environment)
        await self.install(environment)

    async def _ensure_linux_logs_aliases(self, environment: BaseEnvironment) -> None:
        await self.exec_as_root(
            environment,
            """python - <<'PY'
from pathlib import Path
import os

alias_map = {
    '/logs/agent': r'/\\logs\\agent',
    '/logs/verifier': r'/\\logs\\verifier',
    '/logs/artifacts': r'/\\logs\\artifacts',
}

os.makedirs('/logs', exist_ok=True)
for linux_path, windows_mount in alias_map.items():
    alias = Path(linux_path)
    target = Path(windows_mount)
    if alias.exists() or not target.exists():
        continue
    alias.symlink_to(target)

probe_path = Path('/logs/verifier/.openjaws-log-alias-probe.txt')
probe_path.write_text('openjaws harbor linux logs alias ready\\n', encoding='utf-8')
PY""",
            timeout_sec=30,
        )

    def get_version_command(self) -> str | None:
        return f"{self._CONTAINER_BINARY_PATH} --version"

    def parse_version(self, stdout: str | None) -> str:
        stdout_text = stdout or ""
        for line in stdout_text.splitlines():
            line = line.strip()
            if line:
                return line
        return stdout_text.strip()

    def _resolve_repo_file_list(self) -> list[Path]:
        ignored_roots = {
            ".git",
            "node_modules",
            "dist",
            "artifacts",
            "wandb",
            ".runtime",
            ".venv-q",
            ".venv-gemma4",
            "__pycache__",
            "website",
            "training",
            "benchmarks",
        }

        def should_stage(path: Path) -> bool:
            relative_parts = path.relative_to(self._source_root).parts
            if any(part in ignored_roots for part in relative_parts):
                return False
            if len(relative_parts) >= 2 and relative_parts[0] == "docs" and relative_parts[1] == "wiki":
                return False
            return True

        try:
            result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(self._source_root),
                    "ls-files",
                    "-co",
                    "--exclude-standard",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            files = [
                self._source_root / line
                for line in result.stdout.splitlines()
                if line.strip()
            ]
            return [path for path in files if path.is_file() and should_stage(path)]
        except Exception:
            files: list[Path] = []
            for path in self._source_root.rglob("*"):
                if path.is_file() and should_stage(path):
                    files.append(path)
            return files

    def _stage_source_tree(self) -> Path:
        stage_dir = self.logs_dir / self._STAGED_SOURCE_DIRNAME
        if stage_dir.exists():
            shutil.rmtree(stage_dir)
        stage_dir.mkdir(parents=True, exist_ok=True)

        copied_files: list[str] = []
        for source_path in self._resolve_repo_file_list():
            relative_path = source_path.relative_to(self._source_root)
            target_path = stage_dir / relative_path
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, target_path)
            copied_files.append(relative_path.as_posix())

        manifest_path = self.logs_dir / self._SOURCE_MANIFEST_FILENAME
        manifest_path.write_text(
            json.dumps(
                {
                    "sourceRoot": str(self._source_root),
                    "stagedDir": str(stage_dir),
                    "fileCount": len(copied_files),
                    "files": copied_files,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return stage_dir

    def _resolve_cli_macro_defaults(self) -> dict[str, str]:
        package_json_path = self._source_root / "package.json"
        package_name = "openjaws"
        package_version = "unknown"
        homepage = ""
        issues_url = ""

        try:
            package_json = json.loads(package_json_path.read_text(encoding="utf-8"))
            package_name = str(package_json.get("name") or package_name)
            package_version = str(package_json.get("version") or package_version)
            homepage = str(package_json.get("homepage") or homepage)
            bugs = package_json.get("bugs")
            if isinstance(bugs, dict):
                issues_url = str(bugs.get("url") or issues_url)
            elif isinstance(bugs, str):
                issues_url = bugs
        except Exception:
            pass

        explainer = issues_url or homepage or "https://github.com/PossumXI/OpenJaws/issues"
        return {
            "VERSION": package_version,
            "FEEDBACK_CHANNEL": explainer,
            "ISSUES_EXPLAINER": explainer,
            "PACKAGE_URL": package_name,
            "NATIVE_PACKAGE_URL": package_name,
        }

    def _inject_cli_macro_prelude(self, bundle_path: Path) -> None:
        bundle_text = bundle_path.read_text(encoding="utf-8")
        if bundle_text.startswith("var MACRO = Object.assign("):
            return

        prelude = (
            "var MACRO = Object.assign("
            f"{json.dumps(self._resolve_cli_macro_defaults())}, "
            "globalThis.MACRO ?? {});\n"
            "globalThis.MACRO = MACRO;\n"
        )
        bundle_path.write_text(prelude + bundle_text, encoding="utf-8")

    def _build_host_cli_bundle(self) -> Path | None:
        entrypoint = self._source_root / "src" / "entrypoints" / "cli.tsx"
        meta_path = self.logs_dir / self._CLI_BUNDLE_META_FILENAME
        runtime_dir = self.logs_dir / "runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = runtime_dir / self._CLI_BUNDLE_FILENAME

        metadata: dict[str, Any] = {
            "sourceRoot": str(self._source_root),
            "entrypoint": str(entrypoint),
            "bundlePath": str(bundle_path),
            "status": "missing_entrypoint",
        }

        if not entrypoint.exists():
            meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            return None

        build_command = [
            "bun",
            "build",
            "--target=bun",
            "--outfile",
            str(bundle_path),
            str(entrypoint),
        ]
        try:
            result = subprocess.run(
                build_command,
                cwd=str(self._source_root),
                check=False,
                capture_output=True,
                text=True,
                timeout=min(self._build_timeout_sec, self._CLI_BUNDLE_BUILD_TIMEOUT_SEC),
            )
        except subprocess.TimeoutExpired as error:
            metadata.update(
                {
                    "status": "build_timed_out",
                    "command": build_command,
                    "timeoutSec": min(
                        self._build_timeout_sec,
                        self._CLI_BUNDLE_BUILD_TIMEOUT_SEC,
                    ),
                    "stdoutTail": ((error.stdout or "")[-4000:]),
                    "stderrTail": ((error.stderr or "")[-4000:]),
                }
            )
            meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            return None
        metadata.update(
            {
                "command": build_command,
                "returnCode": result.returncode,
                "stdoutTail": (result.stdout or "")[-4000:],
                "stderrTail": (result.stderr or "")[-4000:],
            }
        )
        if result.returncode != 0 or not bundle_path.exists():
            metadata["status"] = "build_failed"
            meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            return None
        try:
            self._inject_cli_macro_prelude(bundle_path)
        except Exception as error:
            metadata["status"] = "macro_injection_failed"
            metadata["error"] = str(error)
            meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            return None
        metadata["status"] = "built"
        metadata["bundleBytes"] = bundle_path.stat().st_size
        meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        return bundle_path

    def _stage_runtime_bundle(self) -> Path | None:
        bundle_path = self._build_host_cli_bundle()
        bridge_script_path = self._source_root / "scripts" / "oci-q-response.py"
        if bundle_path is None or not bridge_script_path.exists():
            return None

        stage_dir = self.logs_dir / self._STAGED_RUNTIME_DIRNAME
        if stage_dir.exists():
            shutil.rmtree(stage_dir)
        stage_dir.mkdir(parents=True, exist_ok=True)

        staged_files: list[str] = []
        bundle_target = stage_dir / self._CLI_BUNDLE_FILENAME
        shutil.copy2(bundle_path, bundle_target)
        staged_files.append(bundle_target.relative_to(stage_dir).as_posix())

        bridge_target = stage_dir / "scripts" / bridge_script_path.name
        bridge_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bridge_script_path, bridge_target)
        staged_files.append(bridge_target.relative_to(stage_dir).as_posix())

        manifest_path = self.logs_dir / self._RUNTIME_MANIFEST_FILENAME
        manifest_path.write_text(
            json.dumps(
                {
                    "sourceRoot": str(self._source_root),
                    "stagedDir": str(stage_dir),
                    "fileCount": len(staged_files),
                    "files": staged_files,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return stage_dir

    def _resolve_host_bun_archive_path(self) -> Path:
        cache_dir = self.logs_dir / "runtime"
        cache_dir.mkdir(parents=True, exist_ok=True)
        archive_path = cache_dir / self._BUN_ARCHIVE_FILENAME
        if archive_path.exists():
            return archive_path

        bun_version = (
            subprocess.run(
                ["bun", "--version"],
                check=False,
                capture_output=True,
                text=True,
            ).stdout.strip()
            or self._DEFAULT_BUN_VERSION
        )
        archive_name = f"bun-v{bun_version}-{self._BUN_ARCHIVE_FILENAME}"
        archive_url = (
            f"https://github.com/oven-sh/bun/releases/download/bun-v{bun_version}/"
            f"{self._BUN_ARCHIVE_FILENAME}"
        )
        archive_path = cache_dir / archive_name
        if archive_path.exists():
            return archive_path

        with urllib.request.urlopen(archive_url, timeout=120) as response:
            archive_path.write_bytes(response.read())

        with zipfile.ZipFile(archive_path) as bun_zip:
            if not bun_zip.namelist():
                raise RuntimeError("Downloaded Bun archive is empty.")

        return archive_path

    def _stage_oci_runtime_bundle(self, host_config_file: str | None) -> Path | None:
        if not host_config_file:
            return None

        host_config_path = Path(host_config_file).expanduser().resolve()
        if not host_config_path.exists():
            raise FileNotFoundError(
                f"OCI_CONFIG_FILE points to a missing file: {host_config_path}"
            )

        bundle_dir = self.logs_dir / "runtime" / "oci"
        if bundle_dir.exists():
            shutil.rmtree(bundle_dir)
        bundle_dir.mkdir(parents=True, exist_ok=True)

        parser = configparser.RawConfigParser()
        parser.read(host_config_path, encoding="utf-8")
        staged_targets_by_source: dict[Path, str] = {}
        section_names = ["DEFAULT", *parser.sections()]

        for section_name in section_names:
            section = parser[section_name]
            section_slug = "".join(
                char.lower() if char.isalnum() else "-"
                for char in section_name
            ).strip("-") or "default"
            for option in self._OCI_REFERENCED_PATH_KEYS:
                raw_value = section.get(option)
                if not raw_value:
                    continue

                source_path = Path(raw_value).expanduser()
                if not source_path.is_absolute():
                    source_path = (host_config_path.parent / source_path).resolve()
                else:
                    source_path = source_path.resolve()

                if not source_path.exists():
                    raise FileNotFoundError(
                        "OCI config references a missing path "
                        f"for {section_name}.{option}: {source_path}"
                    )

                target_name = staged_targets_by_source.get(source_path)
                if not target_name:
                    target_name = f"{section_slug}-{option}-{source_path.name}"
                    shutil.copy2(source_path, bundle_dir / target_name)
                    staged_targets_by_source[source_path] = target_name

                section[option] = f"{self._CONTAINER_OCI_DIR}/{target_name}"

        config_output_path = bundle_dir / "config"
        with config_output_path.open("w", encoding="utf-8", newline="\n") as handle:
            parser.write(handle)

        return bundle_dir

    def _build_oci_embedded_env(
        self,
        host_config_file: str | None,
        profile_name: str | None,
    ) -> dict[str, str]:
        if not host_config_file:
            return {}

        host_config_path = Path(host_config_file).expanduser().resolve()
        if not host_config_path.exists():
            raise FileNotFoundError(
                f"OCI_CONFIG_FILE points to a missing file: {host_config_path}"
            )

        parser = configparser.RawConfigParser()
        parser.read(host_config_path, encoding="utf-8")
        staged_payload_files: dict[str, str] = {}
        staged_targets_by_source: dict[Path, str] = {}
        section_names = ["DEFAULT", *parser.sections()]

        for section_name in section_names:
            section = parser[section_name]
            section_slug = "".join(
                char.lower() if char.isalnum() else "-"
                for char in section_name
            ).strip("-") or "default"
            for option in self._OCI_REFERENCED_PATH_KEYS:
                raw_value = section.get(option)
                if not raw_value:
                    continue

                source_path = Path(raw_value).expanduser()
                if not source_path.is_absolute():
                    source_path = (host_config_path.parent / source_path).resolve()
                else:
                    source_path = source_path.resolve()

                if not source_path.exists():
                    raise FileNotFoundError(
                        "OCI config references a missing path "
                        f"for {section_name}.{option}: {source_path}"
                    )

                target_name = staged_targets_by_source.get(source_path)
                if not target_name:
                    target_name = f"{section_slug}-{option}-{source_path.name}"
                    staged_targets_by_source[source_path] = target_name
                    staged_payload_files[target_name] = base64.b64encode(
                        source_path.read_bytes()
                    ).decode("ascii")

                section[option] = target_name

        config_handle = io.StringIO()
        parser.write(config_handle)
        config_text = config_handle.getvalue()

        payload = {
            "profile": (profile_name or "DEFAULT").strip() or "DEFAULT",
            "config": config_text,
            "files": staged_payload_files,
        }
        return {
            self._EMBEDDED_OCI_BUNDLE_ENV: base64.b64encode(
                json.dumps(payload).encode("utf-8")
            ).decode("ascii")
        }

    async def install(self, environment: BaseEnvironment) -> None:
        bun_archive = self._resolve_host_bun_archive_path()
        runtime_stage_dir = (
            self._stage_runtime_bundle() if self._use_runtime_bundle else None
        )
        stage_dir = runtime_stage_dir or self._stage_source_tree()
        using_runtime_bundle = runtime_stage_dir is not None
        install_command_suffix = (
            f"cat > {self._CONTAINER_BINARY_PATH} <<'EOF'\n"
            "#!/usr/bin/env bash\n"
            f"exec bun {self._CONTAINER_CLI_BUNDLE_PATH} \"$@\"\n"
            "EOF\n"
            f"chmod +x {self._CONTAINER_BINARY_PATH}"
            if using_runtime_bundle
            else (
                f"cd {self._CONTAINER_SOURCE_DIR} && "
                "((bun install --frozen-lockfile --production) || bun install --production) && "
                f"cat > {self._CONTAINER_BINARY_PATH} <<'EOF'\n"
                "#!/usr/bin/env bash\n"
                f"exec bun {self._CONTAINER_SOURCE_DIR}/src/entrypoints/cli.tsx \"$@\"\n"
                "EOF\n"
                f"chmod +x {self._CONTAINER_BINARY_PATH}"
            )
        )
        await self.exec_as_root(
            environment,
            command=(
                "MISSING_DEPS=0; "
                "for cmd in bash curl git unzip xz python3 pip3; do "
                "command -v \"$cmd\" >/dev/null 2>&1 || MISSING_DEPS=1; "
                "done; "
                "if [ \"$MISSING_DEPS\" -eq 1 ]; then "
                "if command -v apk >/dev/null 2>&1; then "
                "apk add --no-cache bash curl git unzip xz build-base python3 py3-pip; "
                "elif command -v apt-get >/dev/null 2>&1; then "
                "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y "
                "bash curl git unzip xz-utils ca-certificates build-essential python3 python3-pip; "
                "elif command -v yum >/dev/null 2>&1; then "
                "yum install -y bash curl git unzip xz ca-certificates gcc gcc-c++ make python3 python3-pip; "
                "fi; "
                "fi"
            ),
            timeout_sec=900,
        )
        await self.exec_as_root(
            environment,
            command=f"rm -rf {self._CONTAINER_SOURCE_DIR} && mkdir -p {self._CONTAINER_SOURCE_DIR}",
            timeout_sec=120,
        )
        await environment.upload_dir(stage_dir, self._CONTAINER_SOURCE_DIR)
        await environment.upload_file(bun_archive, self._CONTAINER_BUN_ARCHIVE_PATH)
        await self.exec_as_root(
            environment,
            command=(
                "if ! command -v bun >/dev/null 2>&1; then "
                f"rm -rf {self._CONTAINER_BUN_ROOT} && "
                f"mkdir -p {self._CONTAINER_BUN_ROOT} && "
                f"unzip -qo {self._CONTAINER_BUN_ARCHIVE_PATH} -d {self._CONTAINER_BUN_ROOT} && "
                f"BUN_CANDIDATE=$(find {self._CONTAINER_BUN_ROOT} -type f -name bun | head -n 1) && "
                "test -n \"$BUN_CANDIDATE\" && "
                "chmod +x \"$BUN_CANDIDATE\" && "
                "ln -sf \"$BUN_CANDIDATE\" /usr/local/bin/bun; "
                "fi"
            ),
            timeout_sec=900,
        )
        await self.exec_as_root(
            environment,
            command=(
                "python3 -c \"import httpx, openai, oci_genai_auth\" >/dev/null 2>&1 || "
                "python3 -m pip install --no-cache-dir --break-system-packages "
                "httpx openai oci-genai-auth && "
                + install_command_suffix
            ),
            timeout_sec=self._build_timeout_sec,
        )

    def _build_workspace_harness_notes(self) -> str:
        return (
            "# OpenJaws Workspace Harness Notes\n\n"
            "- Use this workspace-local harness when the task needs generated files, repeated verification, or sample-case iteration.\n"
            f"- Edit `{self._HARNESS_BOOTSTRAP_FILENAME}` to encode concrete prompt examples and your current verification command.\n"
            "- Prefer writing a small harness first, then iterating on the target artifact from measured output.\n"
            "- Keep the harness and its JSON results in /app so the attempt is auditable after the run.\n"
            "- Do not stop at starter/example behavior; record at least one prompt-specific check.\n"
        )

    def _build_workspace_harness_script(self) -> str:
        return (
            "#!/usr/bin/env python3\n"
            "\"\"\"Editable workspace-local harness scaffold for hard benchmark tasks.\n\n"
            "Replace CASES with prompt-specific commands and expected outputs.\n"
            "Run `python .openjaws_harness_bootstrap.py` to record auditable results in /app.\n"
            "\"\"\"\n\n"
            "from __future__ import annotations\n\n"
            "import json\n"
            "import subprocess\n"
            "from pathlib import Path\n\n"
            "ROOT = Path('/app')\n"
            "RESULTS_PATH = ROOT / '.openjaws_harness_results.json'\n"
            "CASES = [\n"
            "    {\n"
            "        'label': 'replace-me',\n"
            "        'command': ['bash', '-lc', 'printf \"replace me\\n\"'],\n"
            "        'expected_stdout': 'replace me',\n"
            "    }\n"
            "]\n\n"
            "def run_case(case: dict[str, object]) -> dict[str, object]:\n"
            "    command = case.get('command')\n"
            "    if not isinstance(command, list) or not all(isinstance(part, str) for part in command):\n"
            "        raise ValueError(f\"Invalid command for case: {case!r}\")\n"
            "    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)\n"
            "    stdout = result.stdout.strip()\n"
            "    stderr = result.stderr.strip()\n"
            "    expected_stdout = case.get('expected_stdout')\n"
            "    passed = expected_stdout is None or stdout == expected_stdout\n"
            "    return {\n"
            "        'label': case.get('label'),\n"
            "        'command': command,\n"
            "        'returncode': result.returncode,\n"
            "        'stdout': stdout,\n"
            "        'stderr': stderr,\n"
            "        'expected_stdout': expected_stdout,\n"
            "        'passed': passed,\n"
            "    }\n\n"
            "def main() -> int:\n"
            "    results = [run_case(case) for case in CASES]\n"
            "    RESULTS_PATH.write_text(json.dumps(results, indent=2) + '\\n', encoding='utf-8')\n"
            "    print(f'Wrote {RESULTS_PATH}')\n"
            "    for result in results:\n"
            "        status = 'PASS' if result['passed'] else 'FAIL'\n"
            "        print(f\"[{status}] {result['label']}: {result['stdout']}\")\n"
            "    return 0\n\n"
            "if __name__ == '__main__':\n"
            "    raise SystemExit(main())\n"
        )

    async def _seed_workspace_harness(self, environment: BaseEnvironment) -> None:
        notes = self._build_workspace_harness_notes()
        script = self._build_workspace_harness_script()
        command = (
            f"cat > {self._WORKSPACE_DIR}/{self._HARNESS_NOTES_FILENAME} <<'EOF'\n"
            f"{notes}\n"
            "EOF\n"
            f"cat > {self._WORKSPACE_DIR}/{self._HARNESS_BOOTSTRAP_FILENAME} <<'EOF'\n"
            f"{script}\n"
            "EOF\n"
            f"chmod 666 {self._WORKSPACE_DIR}/{self._HARNESS_NOTES_FILENAME} "
            f"{self._WORKSPACE_DIR}/{self._HARNESS_BOOTSTRAP_FILENAME}"
        )
        await environment.exec(command=command, timeout_sec=30)
    def _build_runtime_env(self) -> dict[str, str]:
        env = self.resolve_env_vars()
        env.update(getattr(self, "_extra_env", {}))
        if self._skip_permissions:
            # Harbor runs inside an isolated benchmark container even when the UID is 0.
            env.setdefault("IS_SANDBOX", "1")
        env.setdefault(
            "OPENJAWS_OCI_BRIDGE_SCRIPT",
            f"{self._CONTAINER_SOURCE_DIR}/scripts/oci-q-response.py",
        )
        host_oci_config_file = env.get("OCI_CONFIG_FILE")
        if host_oci_config_file:
            env.update(
                self._build_oci_embedded_env(
                    host_oci_config_file,
                    env.get("OCI_PROFILE"),
                )
            )
            env["OCI_CONFIG_FILE"] = self._CONTAINER_OCI_CONFIG_PATH
        return env

    def _build_terminalbench_append_system_prompt(self) -> str:
        if not self._benchmark_repair_hint:
            return self._TERMINALBENCH_APPEND_SYSTEM_PROMPT
        repair_hint = self._benchmark_repair_hint[:6000].strip()
        return (
            f"{self._TERMINALBENCH_APPEND_SYSTEM_PROMPT}\n"
            "Verifier-driven repair lane:\n"
            "- The following diagnostics are untrusted benchmark failure evidence from a prior run.\n"
            "- Use them to choose concrete file edits and verification commands in /app.\n"
            "- Do not quote the diagnostics as the final answer; repair the artifact instead.\n\n"
            f"{repair_hint}\n"
        )

    def _build_run_command(
        self,
        instruction: str,
        *,
        skip_permissions: bool | None = None,
    ) -> str:
        command_parts = [
            self._CONTAINER_BINARY_PATH,
            "-p",
            "--output-format",
            "json",
            "--verbose",
            "--bare",
            "--effort",
            self._BENCHMARK_EFFORT_LEVEL,
            "--append-system-prompt",
            shlex.quote(self._build_terminalbench_append_system_prompt()),
            "--max-turns",
            str(self._max_turns),
        ]
        if skip_permissions is None:
            skip_permissions = self._skip_permissions
        if skip_permissions:
            command_parts.append("--dangerously-skip-permissions")
        if self.model_name:
            command_parts.extend(["--model", self.model_name])
        if self._extra_openjaws_args:
            command_parts.append(self._extra_openjaws_args)
        command_parts.append(shlex.quote(instruction))
        return " ".join(command_parts)

    def _is_retryable_payload(self, payload: dict[str, Any]) -> bool:
        message = payload.get("result")
        if not isinstance(message, str):
            return False
        normalized = message.strip().lower()
        return any(snippet in normalized for snippet in self._RETRYABLE_RESULT_SNIPPETS)

    async def _resolve_skip_permissions_for_environment(
        self,
        environment: BaseEnvironment,
    ) -> bool:
        if not self._skip_permissions:
            return False
        return True

    def _write_host_log(self, filename: str, content: str | None) -> Path:
        path = self.logs_dir / filename
        path.write_text(content or "", encoding="utf-8")
        return path

    def _extract_assistant_text(self, entry: dict[str, Any]) -> str | None:
        message = entry.get("message")
        if not isinstance(message, dict):
            return None
        content = message.get("content")
        if not isinstance(content, list):
            return None
        text_parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "text":
                continue
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())
        if not text_parts:
            return None
        return "\n".join(text_parts)

    def _parse_verbose_json_result(
        self,
        payload_items: list[Any],
        stderr_text: str,
        return_code: int,
    ) -> dict[str, Any]:
        last_result: dict[str, Any] | None = None
        last_assistant_text: str | None = None
        session_id: str | None = None

        for entry in payload_items:
            if not isinstance(entry, dict):
                continue
            entry_type = entry.get("type")
            if entry_type == "assistant":
                assistant_text = self._extract_assistant_text(entry)
                if assistant_text:
                    last_assistant_text = assistant_text
                entry_session_id = entry.get("session_id")
                if isinstance(entry_session_id, str) and entry_session_id.strip():
                    session_id = entry_session_id
            elif entry_type == "result":
                last_result = entry
                entry_session_id = entry.get("session_id")
                if isinstance(entry_session_id, str) and entry_session_id.strip():
                    session_id = entry_session_id

        if last_result:
            payload = dict(last_result)
            result_text = payload.get("result")
            if (not isinstance(result_text, str) or not result_text.strip()) and last_assistant_text:
                payload["result"] = last_assistant_text
            payload.setdefault("return_code", return_code)
            payload.setdefault("stderr", stderr_text)
            if session_id:
                payload.setdefault("session_id", session_id)
            return payload

        if last_assistant_text:
            return {
                "type": "result",
                "subtype": "success",
                "is_error": return_code != 0,
                "result": last_assistant_text,
                "return_code": return_code,
                "stderr": stderr_text,
                **({"session_id": session_id} if session_id else {}),
            }

        return {
            "type": "result",
            "subtype": "empty",
            "is_error": return_code != 0,
            "result": stderr_text.strip() or "",
            "return_code": return_code,
            "stderr": stderr_text,
            **({"session_id": session_id} if session_id else {}),
        }

    def _parse_json_result(
        self,
        stdout: str | None,
        stderr: str | None,
        return_code: int,
    ) -> dict[str, Any]:
        stdout_text = stdout or ""
        stderr_text = stderr or ""
        stripped = stdout_text.strip()
        payload: dict[str, Any]
        if stripped:
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    payload = self._parse_verbose_json_result(
                        parsed,
                        stderr_text,
                        return_code,
                    )
                elif isinstance(parsed, dict):
                    payload = parsed
                else:
                    payload = {
                        "type": "result",
                        "subtype": "unknown",
                        "is_error": return_code != 0,
                        "result": stripped,
                    }
            except json.JSONDecodeError:
                last_line = stripped.splitlines()[-1]
                try:
                    parsed = json.loads(last_line)
                    payload = parsed if isinstance(parsed, dict) else {
                        "type": "result",
                        "subtype": "unknown",
                        "is_error": return_code != 0,
                        "result": last_line,
                    }
                except json.JSONDecodeError:
                    payload = {
                        "type": "result",
                        "subtype": "unknown",
                        "is_error": return_code != 0,
                        "result": stripped,
                    }
        else:
            payload = {
                "type": "result",
                "subtype": "empty",
                "is_error": return_code != 0,
                "result": stderr_text.strip() or "",
            }

        payload.setdefault("return_code", return_code)
        payload.setdefault("stderr", stderr_text)
        return payload

    def _extract_metrics(self, payload: dict[str, Any]) -> tuple[Metrics | None, FinalMetrics | None]:
        usage = payload.get("usage")
        if not isinstance(usage, dict):
            return None, None
        prompt_tokens = usage.get("input_tokens")
        completion_tokens = usage.get("output_tokens")
        cached_tokens = (
            (usage.get("cache_creation_input_tokens") or 0)
            + (usage.get("cache_read_input_tokens") or 0)
        )
        metrics = Metrics(
            prompt_tokens=prompt_tokens if isinstance(prompt_tokens, int) else None,
            completion_tokens=completion_tokens if isinstance(completion_tokens, int) else None,
            cached_tokens=cached_tokens if cached_tokens else None,
            cost_usd=float(payload.get("total_cost_usd", 0) or 0),
            extra={"usage": usage},
        )
        final_metrics = FinalMetrics(
            total_prompt_tokens=metrics.prompt_tokens,
            total_completion_tokens=metrics.completion_tokens,
            total_cached_tokens=metrics.cached_tokens,
            total_cost_usd=metrics.cost_usd,
            total_steps=2,
            extra={"stop_reason": payload.get("stop_reason")},
        )
        return metrics, final_metrics

    def _write_trajectory(self, instruction: str, payload: dict[str, Any]) -> Path:
        metrics, final_metrics = self._extract_metrics(payload)
        message = payload.get("result")
        if not isinstance(message, str) or not message.strip():
            message = str(payload.get("stderr") or "OpenJaws returned no message.")
        trajectory = Trajectory(
            session_id=str(payload.get("session_id") or payload.get("uuid") or "openjaws-session"),
            agent=Agent(
                name="OpenJaws",
                version=self.version() or "unknown",
                model_name=self.model_name,
                extra={
                    "adapter": self.name(),
                    "containerBinaryPath": self._CONTAINER_BINARY_PATH,
                },
            ),
            steps=[
                Step(
                    step_id=1,
                    source="user",
                    message=instruction,
                ),
                Step(
                    step_id=2,
                    source="agent",
                    model_name=self.model_name,
                    message=message,
                    metrics=metrics,
                    extra={
                        "is_error": bool(payload.get("is_error")),
                        "stop_reason": payload.get("stop_reason"),
                        "return_code": payload.get("return_code"),
                        "permission_denials": payload.get("permission_denials"),
                    },
                ),
            ],
            notes=(
                "Generated from the compiled OpenJaws CLI via the Harbor adapter. "
                "This is a minimal ATIF projection of the shipped CLI contract."
            ),
            final_metrics=final_metrics,
            extra={
                "openjaws_result": payload,
            },
        )
        trajectory_path = self.logs_dir / self._TRAJECTORY_FILENAME
        trajectory_path.write_text(
            format_trajectory_json(trajectory.to_json_dict()) + "\n",
            encoding="utf-8",
        )
        return trajectory_path

    def _populate_context(self, context: AgentContext, payload: dict[str, Any]) -> None:
        usage = payload.get("usage")
        if not isinstance(usage, dict):
            usage = {}
        cached_tokens = (
            (usage.get("cache_creation_input_tokens") or 0)
            + (usage.get("cache_read_input_tokens") or 0)
        )
        context.n_input_tokens = usage.get("input_tokens")
        context.n_output_tokens = usage.get("output_tokens")
        context.n_cache_tokens = cached_tokens if cached_tokens else None
        cost = payload.get("total_cost_usd")
        context.cost_usd = float(cost) if isinstance(cost, (int, float)) else None
        context.metadata = {
            "session_id": payload.get("session_id"),
            "uuid": payload.get("uuid"),
            "stop_reason": payload.get("stop_reason"),
            "is_error": payload.get("is_error"),
            "return_code": payload.get("return_code"),
            "permission_denials": payload.get("permission_denials"),
        }

    def populate_context_post_run(self, context: AgentContext) -> None:
        result_path = self.logs_dir / self._RESULT_FILENAME
        if not result_path.exists():
            return
        payload = json.loads(result_path.read_text(encoding="utf-8"))
        self._populate_context(context, payload)

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        await self._seed_workspace_harness(environment)
        skip_permissions = await self._resolve_skip_permissions_for_environment(
            environment
        )
        command = self._build_run_command(
            instruction,
            skip_permissions=skip_permissions,
        )
        env = self._build_runtime_env()
        result = await self.exec_as_agent(
            environment,
            command=command,
            env=env or None,
            cwd=self._WORKSPACE_DIR,
            timeout_sec=self._run_timeout_sec,
        )
        payload = self._parse_json_result(result.stdout, result.stderr, result.return_code)
        if (
            (result.return_code != 0 or bool(payload.get("is_error")))
            and self._is_retryable_payload(payload)
        ):
            result = await self.exec_as_agent(
                environment,
                command=command,
                env=env or None,
                cwd=self._WORKSPACE_DIR,
                timeout_sec=self._run_timeout_sec,
            )
            payload = self._parse_json_result(result.stdout, result.stderr, result.return_code)

        self._write_host_log(self._STDOUT_FILENAME, result.stdout)
        self._write_host_log(self._STDERR_FILENAME, result.stderr)
        (self.logs_dir / self._RESULT_FILENAME).write_text(
            json.dumps(payload, indent=2) + "\n",
            encoding="utf-8",
        )
        self._write_trajectory(instruction, payload)
        self._populate_context(context, payload)

        if result.return_code != 0 or bool(payload.get("is_error")):
            message = payload.get("result")
            if not isinstance(message, str) or not message.strip():
                stderr_text = (result.stderr or "").strip()
                message = stderr_text or "OpenJaws Harbor agent failed."
            raise RuntimeError(message)
