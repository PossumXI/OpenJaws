from __future__ import annotations

import json
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
from harbor.utils.trajectory_utils import format_trajectory_json


class OpenJawsHarborAgent(BaseInstalledAgent):
    """Minimal Harbor adapter for the compiled OpenJaws CLI."""

    SUPPORTS_ATIF: bool = True

    _STAGED_SOURCE_DIRNAME = "openjaws-source"
    _SOURCE_MANIFEST_FILENAME = "openjaws-source-manifest.json"
    _RESULT_FILENAME = "openjaws-result.json"
    _STDOUT_FILENAME = "openjaws.stdout.log"
    _STDERR_FILENAME = "openjaws.stderr.log"
    _TRAJECTORY_FILENAME = "trajectory.json"
    _CONTAINER_SOURCE_DIR = "/opt/openjaws-src"
    _CONTAINER_BINARY_PATH = "/usr/local/bin/openjaws"
    _CONTAINER_BUN_ARCHIVE_PATH = "/tmp/openjaws-bun.zip"
    _CONTAINER_BUN_ROOT = "/opt/openjaws-bun"
    _CONTAINER_OCI_DIR = "/opt/openjaws-oci"
    _WORKSPACE_DIR = "/app"
    _BUN_ARCHIVE_FILENAME = "bun-linux-x64-baseline.zip"
    _DEFAULT_BUN_VERSION = "1.3.11"

    def __init__(
        self,
        logs_dir: Path,
        source_root: str | None = None,
        max_turns: int = 12,
        build_timeout_sec: int = 1800,
        run_timeout_sec: int = 1800,
        skip_permissions: bool = True,
        extra_openjaws_args: str | None = None,
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
        self._extra_openjaws_args = extra_openjaws_args

    @staticmethod
    def name() -> str:
        return "openjaws-harbor"

    def get_version_command(self) -> str | None:
        return f"{self._CONTAINER_BINARY_PATH} --version"

    def parse_version(self, stdout: str) -> str:
        for line in stdout.splitlines():
            line = line.strip()
            if line:
                return line
        return stdout.strip()

    def _resolve_repo_file_list(self) -> list[Path]:
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
            return [path for path in files if path.is_file()]
        except Exception:
            files: list[Path] = []
            ignored_roots = {
                ".git",
                "node_modules",
                "dist",
                "artifacts",
                "wandb",
                ".venv-q",
                ".venv-gemma4",
                "__pycache__",
            }
            for path in self._source_root.rglob("*"):
                relative_parts = path.relative_to(self._source_root).parts
                if any(part in ignored_roots for part in relative_parts):
                    continue
                if path.is_file():
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

    async def install(self, environment: BaseEnvironment) -> None:
        stage_dir = self._stage_source_tree()
        bun_archive = self._resolve_host_bun_archive_path()
        resolved_env = self.resolve_env_vars()
        host_oci_config_file = resolved_env.get("OCI_CONFIG_FILE")
        host_oci_dir = (
            Path(host_oci_config_file).expanduser().resolve().parent
            if host_oci_config_file
            else None
        )
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apk >/dev/null 2>&1; then "
                "apk add --no-cache bash curl git unzip xz build-base python3 py3-pip; "
                "elif command -v apt-get >/dev/null 2>&1; then "
                "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y "
                "bash curl git unzip xz-utils ca-certificates build-essential python3 python3-pip; "
                "elif command -v yum >/dev/null 2>&1; then "
                "yum install -y bash curl git unzip xz ca-certificates gcc gcc-c++ make python3 python3-pip; "
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
        if host_oci_dir and host_oci_dir.exists():
            await self.exec_as_root(
                environment,
                command=f"rm -rf {self._CONTAINER_OCI_DIR} && mkdir -p {self._CONTAINER_OCI_DIR}",
                timeout_sec=120,
            )
            await environment.upload_dir(host_oci_dir, self._CONTAINER_OCI_DIR)
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
                "python3 -m pip install --no-cache-dir --break-system-packages "
                "httpx openai oci-genai-auth && "
                f"cd {self._CONTAINER_SOURCE_DIR} && "
                "((bun install --frozen-lockfile) || bun install) && "
                f"OPENJAWS_NATIVE_OUTFILE={self._CONTAINER_BINARY_PATH} bun run build:native && "
                f"chmod +x {self._CONTAINER_BINARY_PATH}"
            ),
            timeout_sec=self._build_timeout_sec,
        )

    def _write_host_log(self, filename: str, content: str | None) -> Path:
        path = self.logs_dir / filename
        path.write_text(content or "", encoding="utf-8")
        return path

    def _parse_json_result(self, stdout: str, stderr: str, return_code: int) -> dict[str, Any]:
        stripped = stdout.strip()
        payload: dict[str, Any]
        if stripped:
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                last_line = stripped.splitlines()[-1]
                try:
                    payload = json.loads(last_line)
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
                "result": stderr.strip() or "",
            }

        payload.setdefault("return_code", return_code)
        payload.setdefault("stderr", stderr)
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
        command_parts = [
            self._CONTAINER_BINARY_PATH,
            "-p",
            "--output-format",
            "json",
            "--bare",
            "--max-turns",
            str(self._max_turns),
        ]
        if self._skip_permissions and environment.default_user not in (None, "root", 0):
            command_parts.append("--dangerously-skip-permissions")
        if self.model_name:
            command_parts.extend(["--model", self.model_name])
        if self._extra_openjaws_args:
            command_parts.append(self._extra_openjaws_args)
        command_parts.append(shlex.quote(instruction))
        command = " ".join(command_parts)

        env = self.resolve_env_vars()
        env.update(getattr(self, "_extra_env", {}))
        env.setdefault(
            "OPENJAWS_OCI_BRIDGE_SCRIPT",
            f"{self._CONTAINER_SOURCE_DIR}/scripts/oci-q-response.py",
        )
        if env.get("OCI_CONFIG_FILE"):
            env["OCI_CONFIG_FILE"] = f"{self._CONTAINER_OCI_DIR}/config"
        result = await environment.exec(
            command=command,
            env=env or None,
            cwd=self._WORKSPACE_DIR,
            timeout_sec=self._run_timeout_sec,
        )

        self._write_host_log(self._STDOUT_FILENAME, result.stdout)
        self._write_host_log(self._STDERR_FILENAME, result.stderr)
        payload = self._parse_json_result(result.stdout, result.stderr, result.return_code)
        (self.logs_dir / self._RESULT_FILENAME).write_text(
            json.dumps(payload, indent=2) + "\n",
            encoding="utf-8",
        )
        self._write_trajectory(instruction, payload)
        self._populate_context(context, payload)

        if result.return_code != 0 or bool(payload.get("is_error")):
            message = payload.get("result")
            if not isinstance(message, str) or not message.strip():
                message = result.stderr.strip() or "OpenJaws Harbor agent failed."
            raise RuntimeError(message)
