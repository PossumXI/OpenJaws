import asyncio
import json
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath


def _apply_windows_proactor_policy() -> None:
    if sys.platform != "win32":
        return
    policy = asyncio.get_event_loop_policy()
    if isinstance(policy, asyncio.WindowsProactorEventLoopPolicy):
        return
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def _as_posix_container_path(value: str) -> str:
    return PurePosixPath(value.replace("\\", "/")).as_posix()


def _build_windows_safe_verifier_command(verifier) -> str:
    from harbor.models.trial.paths import EnvironmentPaths

    test_relative = verifier._task.paths.test_path.relative_to(
        verifier._task.paths.tests_dir
    )
    verifier_relative = verifier._trial_paths.test_stdout_path.relative_to(
        verifier._trial_paths.verifier_dir
    )
    test_script = _as_posix_container_path(f"/tests/{test_relative}")
    stdout_path = _as_posix_container_path(
        f"{EnvironmentPaths.verifier_dir}/{verifier_relative}"
    )
    verifier_dir = _as_posix_container_path(str(EnvironmentPaths.verifier_dir))
    return " ".join(
        [
            "mkdir",
            "-p",
            shlex.quote(verifier_dir),
            "&&",
            "printf",
            shlex.quote("openjaws verifier command write probe\n"),
            ">",
            shlex.quote(f"{verifier_dir}/.openjaws-verifier-command-probe.txt"),
            "&&",
            "bash",
            shlex.quote(test_script),
            "2>&1",
            "|",
            "tee",
            shlex.quote(stdout_path),
        ]
    )


def _normalize_text_file_to_lf(path: Path) -> None:
    data = path.read_bytes()
    if b"\0" in data:
        return
    normalized = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    if normalized != data:
        path.write_bytes(normalized)


def _stage_tests_dir_with_lf_normalization(source_dir: Path) -> Path:
    temp_root = Path(tempfile.mkdtemp(prefix="openjaws-harbor-tests-"))
    staged_dir = temp_root / "tests"
    shutil.copytree(source_dir, staged_dir)
    for path in staged_dir.rglob("*"):
        if path.is_file():
            try:
                _normalize_text_file_to_lf(path)
            except OSError:
                continue
    return staged_dir


def _infer_pytest_reward(stdout_text: str) -> float | None:
    normalized = stdout_text.strip()
    if not normalized:
        return None
    if "test session starts" not in normalized and "collected " not in normalized:
        return None
    if "== FAILURES ==" in normalized or re.search(
        r"=+\s+\d+\s+failed(?:,|\s)",
        normalized,
        flags=re.IGNORECASE,
    ):
        return 0.0
    if re.search(
        r"=+\s+\d+\s+passed(?:,|\s|=)",
        normalized,
        flags=re.IGNORECASE,
    ) and not re.search(r"\b(failed|error)\b", normalized, flags=re.IGNORECASE):
        return 1.0
    return None


def _write_pytest_reward_fallback(trial_paths) -> None:
    if trial_paths.reward_text_path.exists() or trial_paths.reward_json_path.exists():
        return
    for candidate in (trial_paths.test_stdout_path, trial_paths.test_stderr_path):
        if not candidate.exists():
            continue
        try:
            reward = _infer_pytest_reward(candidate.read_text(encoding="utf-8"))
        except OSError:
            continue
        if reward is None:
            continue
        trial_paths.reward_json_path.write_text(
            json.dumps({"reward": reward}) + "\n",
            encoding="utf-8",
        )
        return


def apply_windows_harbor_patches() -> None:
    if sys.platform != "win32":
        return

    _apply_windows_proactor_policy()

    from harbor.environments.base import ExecResult
    from harbor.environments.docker.docker import DockerEnvironment
    from harbor.models.trial.paths import EnvironmentPaths
    from harbor.utils.env import resolve_env_vars
    from harbor.verifier.verifier import (
        AddTestsDirError,
        DownloadVerifierDirError,
        RewardFileNotFoundError,
        Verifier,
    )

    async def _run_docker_compose_command_threaded(
        self, command: list[str], check: bool = True, timeout_sec: int | None = None
    ) -> ExecResult:
        full_command = [
            "docker",
            "compose",
            "-p",
            self.session_id.lower().replace(".", "-"),
            "--project-directory",
            str(self.environment_dir.resolve().absolute()),
        ]
        for path in self._docker_compose_paths:
            full_command.extend(["-f", str(path.resolve().absolute())])
        full_command.extend(command)

        def _run() -> subprocess.CompletedProcess[bytes]:
            return subprocess.run(
                full_command,
                env=self._env_vars.to_env_dict(include_os_env=True),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
                timeout=timeout_sec,
            )

        try:
            process = await asyncio.to_thread(_run)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"Command timed out after {timeout_sec} seconds"
            ) from exc

        stdout = process.stdout.decode(errors="replace") if process.stdout else None
        stderr = process.stderr.decode(errors="replace") if process.stderr else None

        result = ExecResult(
            stdout=stdout,
            stderr=stderr,
            return_code=process.returncode or 0,
        )

        if check and result.return_code != 0:
            raise RuntimeError(
                f"Docker compose command failed for environment {self.environment_name}. "
                f"Command: {' '.join(full_command)}. "
                f"Return code: {result.return_code}. "
                f"Stdout: {result.stdout}. "
                f"Stderr: {result.stderr}. "
            )

        return result

    async def _verify_windows_safe(self: Verifier):
        staged_tests_dir = None
        try:
            staged_tests_dir = _stage_tests_dir_with_lf_normalization(
                Path(self._task.paths.tests_dir)
            )
            await self._environment.upload_dir(
                source_dir=staged_tests_dir,
                target_dir="/tests",
            )
        except Exception as exc:
            raise AddTestsDirError(
                "Failed to add tests directory to environment."
            ) from exc

        self._trial_paths.test_stdout_path.touch()

        env = None
        if self._task.config.verifier.env:
            env = resolve_env_vars(self._task.config.verifier.env)

        try:
            result = await self._environment.exec(
                command=_build_windows_safe_verifier_command(self),
                env=env,
            )

            if result.stdout and (
                not self._trial_paths.test_stdout_path.exists()
                or self._trial_paths.test_stdout_path.stat().st_size == 0
            ):
                self._trial_paths.test_stdout_path.write_text(result.stdout)

            if result.stderr and (
                not self._trial_paths.test_stderr_path.exists()
                or self._trial_paths.test_stderr_path.stat().st_size == 0
            ):
                self._trial_paths.test_stderr_path.write_text(result.stderr)

            if not self._environment.is_mounted:
                try:
                    await self._environment.download_dir(
                        source_dir=str(EnvironmentPaths.verifier_dir),
                        target_dir=self._trial_paths.verifier_dir,
                    )
                except Exception as exc:
                    raise DownloadVerifierDirError(
                        "Failed to download verifier directory from environment"
                    ) from exc

            _write_pytest_reward_fallback(self._trial_paths)

            if self._trial_paths.reward_text_path.exists():
                rewards = self._parse_reward_text()
            elif self._trial_paths.reward_json_path.exists():
                rewards = self._parse_reward_json()
            else:
                raise RewardFileNotFoundError(
                    f"No reward file found at {self._trial_paths.reward_text_path} or "
                    f"{self._trial_paths.reward_json_path}"
                )

            from harbor.models.verifier.result import VerifierResult

            return VerifierResult(rewards=rewards)
        finally:
            if staged_tests_dir is not None:
                shutil.rmtree(staged_tests_dir.parent, ignore_errors=True)

    current_compose = DockerEnvironment._run_docker_compose_command
    if getattr(current_compose, "__module__", "") != __name__:
        DockerEnvironment._run_docker_compose_command = (
            _run_docker_compose_command_threaded
        )

    current_verify = Verifier.verify
    if getattr(current_verify, "__module__", "") != __name__:
        Verifier.verify = _verify_windows_safe
