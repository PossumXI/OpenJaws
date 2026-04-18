from __future__ import annotations

import argparse
import base64
import configparser
import json
import os
import sys
import tempfile
import warnings
from pathlib import Path

import httpx
from openai import OpenAI
from oci_genai_auth import OciUserPrincipalAuth

warnings.filterwarnings(
    "ignore",
    message=r"Pydantic serializer warnings:.*",
    category=UserWarning,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Query OCI-backed Q through IAM auth.")
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--config-file", default=None)
    parser.add_argument("--profile", default="DEFAULT")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--project-id", default=None)
    parser.add_argument("--compartment-id", default=None)
    parser.add_argument("--model", required=True)
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--prompt-file", default=None)
    parser.add_argument("--input-json", default=None)
    parser.add_argument("--input-file", default=None)
    parser.add_argument("--system", default=None)
    parser.add_argument("--system-file", default=None)
    parser.add_argument("--instructions", default=None)
    parser.add_argument("--instructions-file", default=None)
    parser.add_argument("--tools-json", default=None)
    parser.add_argument("--tools-file", default=None)
    parser.add_argument("--max-output-tokens", type=int, default=700)
    parser.add_argument("--temperature", type=float, default=None)
    return parser.parse_args()


def read_optional_text(path: str | None) -> str | None:
    if not path:
        return None
    return Path(path).read_text(encoding="utf-8")


def materialize_embedded_oci_bundle(
    encoded_bundle: str,
) -> tuple[tempfile.TemporaryDirectory[str], str, str]:
    payload = json.loads(base64.b64decode(encoded_bundle).decode("utf-8"))
    temp_dir = tempfile.TemporaryDirectory(prefix="openjaws-oci-")
    temp_root = Path(temp_dir.name)

    for name, encoded_content in payload.get("files", {}).items():
        (temp_root / name).write_bytes(base64.b64decode(encoded_content))

    parser = configparser.RawConfigParser()
    parser.read_string(str(payload.get("config", "")))
    section_names = ["DEFAULT", *parser.sections()]
    for section_name in section_names:
        section = parser[section_name]
        for option in ("key_file", "security_token_file", "cert_bundle"):
            raw_value = section.get(option)
            if not raw_value:
                continue
            section[option] = str((temp_root / raw_value).resolve())

    config_path = temp_root / "config"
    with config_path.open("w", encoding="utf-8", newline="\n") as handle:
        parser.write(handle)
    profile = str(payload.get("profile") or "DEFAULT")
    return temp_dir, str(config_path), profile


def main() -> int:
    args = parse_args()
    max_output_tokens = max(args.max_output_tokens, 64)
    default_headers = (
        {"opc-compartment-id": args.compartment_id}
        if args.compartment_id
        else None
    )
    embedded_oci_bundle = os.getenv("OPENJAWS_OCI_CONFIG_BUNDLE_B64")
    embedded_bundle_ctx: tempfile.TemporaryDirectory[str] | None = None
    if not args.api_key and embedded_oci_bundle:
        embedded_bundle_ctx, embedded_config_path, embedded_profile = (
            materialize_embedded_oci_bundle(embedded_oci_bundle)
        )
        args.config_file = embedded_config_path
        args.profile = embedded_profile or args.profile

    try:
        if args.api_key:
            client = OpenAI(
                base_url=args.base_url,
                api_key=args.api_key,
                project=args.project_id,
                default_headers=default_headers,
            )
            auth_mode = "bearer"
        else:
            if not args.config_file or not args.project_id or not args.compartment_id:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": "OCI IAM mode requires --config-file, --project-id, and --compartment-id",
                            "error_type": "ArgumentError",
                        }
                    ),
                    file=sys.stderr,
                )
                return 1

            client = OpenAI(
                base_url=args.base_url,
                api_key="not-used",
                project=args.project_id,
                default_headers=default_headers,
                http_client=httpx.Client(
                    auth=OciUserPrincipalAuth(
                        config_file=args.config_file,
                        profile_name=args.profile,
                    )
                ),
            )
            auth_mode = "iam"

        prompt = args.prompt or read_optional_text(args.prompt_file)
        input_json = args.input_json or read_optional_text(args.input_file)
        system = args.system or read_optional_text(args.system_file)
        instructions = args.instructions or read_optional_text(args.instructions_file)
        tools_json = args.tools_json or read_optional_text(args.tools_file)

        if not prompt and not input_json:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": "Provide either --prompt/--prompt-file or --input-json/--input-file",
                        "error_type": "ArgumentError",
                    }
                ),
                file=sys.stderr,
            )
            return 1

        request = {
            "model": args.model,
            "max_output_tokens": max_output_tokens,
        }
        if instructions:
            request["instructions"] = instructions
        elif system:
            request["instructions"] = system

        if input_json:
            request["input"] = json.loads(input_json)
        else:
            request["input"] = prompt

        if tools_json:
            request["tools"] = json.loads(tools_json)

        if args.temperature is not None:
            request["temperature"] = args.temperature

        response = client.responses.create(**request)
    except Exception as error:  # pragma: no cover - exercised live
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(error),
                    "error_type": error.__class__.__name__,
                }
            ),
            file=sys.stderr,
        )
        return 1
    finally:
        if embedded_bundle_ctx is not None:
            embedded_bundle_ctx.cleanup()

    response_payload = (
        response.model_dump(mode="json")
        if hasattr(response, "model_dump")
        else json.loads(response.model_dump_json())
    )

    print(
        json.dumps(
            {
                "ok": True,
                "text": response.output_text,
                "model": args.model,
                "base_url": args.base_url,
                "auth_mode": auth_mode,
                "profile": args.profile if auth_mode == "iam" else None,
                "response": response_payload,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
