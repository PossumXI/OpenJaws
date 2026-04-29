from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

if os.name == "nt" and os.environ.get("PYTHONUTF8") != "1":
    os.environ["PYTHONUTF8"] = "1"
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.execv(sys.executable, [sys.executable, *sys.argv])

from datasets import load_dataset
from peft import LoraConfig, PeftModel, get_peft_model
import torch
from torch.utils.data import DataLoader
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainerCallback,
)
from trl import SFTConfig, SFTTrainer

TARGET_SUFFIXES = (
    "self_attn.q_proj",
    "self_attn.k_proj",
    "self_attn.v_proj",
    "self_attn.o_proj",
    "mlp.gate_proj",
    "mlp.up_proj",
    "mlp.down_proj",
)

Q_UPSTREAM_MODELS = {
    "q-lite": "".join(["google/", "ge", "mma", "-4-E2B-it"]),
    "q": "".join(["google/", "ge", "mma", "-4-E4B-it"]),
    "q-pro": "".join(["google/", "ge", "mma", "-4-26b-it"]),
    "q-ultra": "".join(["google/", "ge", "mma", "-4-31b-it"]),
}
DEFAULT_Q_BASE_MODEL = Q_UPSTREAM_MODELS["q"]


def resolve_q_base_model(base_model: str) -> str:
    normalized = base_model.strip().lower()
    if normalized in {"q", "q-main"}:
        return DEFAULT_Q_BASE_MODEL
    if normalized in Q_UPSTREAM_MODELS:
        return Q_UPSTREAM_MODELS[normalized]
    return base_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="LoRA fine-tune scaffold for Q on OpenJaws JSONL."
    )
    parser.add_argument(
        "--train-file",
        default="data/sft/prepared/train.jsonl",
        help="Prepared training JSONL produced by bun run prepare:sft",
    )
    parser.add_argument(
        "--eval-file",
        default="data/sft/prepared/eval.jsonl",
        help="Prepared eval JSONL produced by bun run prepare:sft",
    )
    parser.add_argument(
        "--base-model",
        default="Q",
        help="Base model family label or upstream checkpoint",
    )
    parser.add_argument(
        "--output-dir",
        default="artifacts/q-lora",
        help="Where adapters and checkpoints will be written",
    )
    parser.add_argument(
        "--route-manifest",
        default=None,
        help="Optional signed route manifest used to dispatch this run",
    )
    parser.add_argument(
        "--execution-mode",
        default="local",
        help="Execution mode label persisted into run-state metadata",
    )
    parser.add_argument("--num-train-epochs", type=float, default=1.0)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--per-device-train-batch-size", type=int, default=1)
    parser.add_argument("--per-device-eval-batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=8)
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--save-steps", type=int, default=100)
    parser.add_argument("--eval-steps", type=int, default=100)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--max-seq-length", type=int, default=8192)
    parser.add_argument("--lora-r", type=int, default=64)
    parser.add_argument("--lora-alpha", type=int, default=128)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--load-in-4bit", action="store_true")
    parser.add_argument("--bf16", action="store_true")
    parser.add_argument("--use-cpu", action="store_true")
    parser.add_argument(
        "--tag",
        action="append",
        default=[],
        help="Limit training to samples containing one or more tags such as coding, agentic, or security",
    )
    parser.add_argument(
        "--language",
        action="append",
        default=[],
        help="Limit training to samples containing one or more languages such as typescript, python, or go",
    )
    parser.add_argument("--wandb-project", default=None)
    parser.add_argument("--wandb-entity", default=None)
    parser.add_argument("--run-name", default=None)
    parser.add_argument(
        "--eval-only",
        action="store_true",
        help="Skip training and run only the evaluation lane against the selected pack",
    )
    parser.add_argument(
        "--adapter-dir",
        default=None,
        help="Optional LoRA adapter directory to load before evaluation",
    )
    parser.add_argument(
        "--curriculum-profile",
        default=None,
        help="Optional curriculum profile label written into run metadata",
    )
    parser.add_argument(
        "--benchmark-pack",
        default=None,
        help="Optional benchmark pack label written into run metadata",
    )
    parser.add_argument(
        "--lineage-id",
        default=None,
        help="Optional lineage ID used to bind related training and benchmark receipts together",
    )
    parser.add_argument(
        "--phase-id",
        default=None,
        help="Optional Agent Co-Work phase ID associated with this training run",
    )
    parser.add_argument(
        "--max-train-samples",
        type=int,
        default=None,
        help="Optional cap for train samples after filtering",
    )
    parser.add_argument(
        "--max-eval-samples",
        type=int,
        default=None,
        help="Optional cap for eval samples after filtering",
    )
    return parser.parse_args()


def format_chat(example: dict, tokenizer: AutoTokenizer) -> dict:
    rendered = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )
    return {"text": rendered}


def resolve_lora_target_modules(model: AutoModelForCausalLM) -> list[str]:
    targets: list[str] = []
    for name, module in model.named_modules():
        if not name.startswith("model.language_model.layers."):
            continue
        if not any(name.endswith(suffix) for suffix in TARGET_SUFFIXES):
            continue
        if isinstance(module, torch.nn.Linear):
            targets.append(name)

    if not targets:
        raise RuntimeError("No valid Q language-model LoRA targets were found.")

    return targets


def resolve_report_to(args: argparse.Namespace) -> list[str]:
    wandb_project = resolve_wandb_project(args)
    wandb_entity = resolve_wandb_entity(args)
    if wandb_project and wandb_entity:
        os.environ.setdefault("WANDB_PROJECT", wandb_project)
        os.environ.setdefault("WANDB_ENTITY", wandb_entity)
        wandb_mode = resolve_wandb_mode()
        if wandb_mode:
            os.environ.setdefault("WANDB_MODE", wandb_mode)
        wandb_api_key = resolve_wandb_api_key()
        if wandb_api_key:
            os.environ.setdefault("WANDB_API_KEY", wandb_api_key)
        return ["wandb"]
    return []


def normalize_optional_env(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def resolve_optional_file_value(path_value: str | None) -> str | None:
    normalized_path = normalize_optional_env(path_value)
    if not normalized_path:
        return None
    path = Path(normalized_path)
    if not path.exists() or not path.is_file():
        return None
    try:
        return normalize_optional_env(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def first_present_env(*names: str) -> str | None:
    for name in names:
        value = normalize_optional_env(os.getenv(name))
        if value:
            return value
    return None


def resolve_wandb_project(args: argparse.Namespace) -> str | None:
    return normalize_optional_env(args.wandb_project) or first_present_env(
        "IMMACULATE_WANDB_PROJECT", "WANDB_PROJECT"
    )


def resolve_wandb_entity(args: argparse.Namespace) -> str | None:
    return normalize_optional_env(args.wandb_entity) or first_present_env(
        "IMMACULATE_WANDB_ENTITY", "WANDB_ENTITY"
    )


def resolve_wandb_mode() -> str | None:
    return first_present_env("IMMACULATE_WANDB_MODE", "WANDB_MODE")


def resolve_wandb_api_key() -> str | None:
    return (
        first_present_env("IMMACULATE_WANDB_API_KEY", "WANDB_API_KEY")
        or resolve_optional_file_value(os.getenv("IMMACULATE_WANDB_API_KEY_FILE"))
        or resolve_optional_file_value(os.getenv("WANDB_API_KEY_FILE"))
    )


def resolve_wandb_metadata(args: argparse.Namespace) -> dict:
    cli_project = normalize_optional_env(args.wandb_project)
    cli_entity = normalize_optional_env(args.wandb_entity)
    env_project = first_present_env("IMMACULATE_WANDB_PROJECT", "WANDB_PROJECT")
    env_entity = first_present_env("IMMACULATE_WANDB_ENTITY", "WANDB_ENTITY")
    project = cli_project or env_project
    entity = cli_entity or env_entity
    missing: list[str] = []
    if project and not entity:
        missing.append("entity")
    if entity and not project:
        missing.append("project")
    source = (
        "mixed"
        if (cli_project or cli_entity) and (env_project or env_entity)
        else "cli"
        if cli_project or cli_entity
        else "env"
        if env_project or env_entity
        else "none"
    )
    url = f"https://wandb.ai/{entity}/{project}" if project and entity else None
    status = (
        "enabled"
        if project and entity
        else "incomplete"
        if missing
        else "disabled"
    )
    summary = (
        f"enabled via {source} for {entity}/{project} ({url})"
        if status == "enabled" and url
        else f"enabled via {source} for {entity}/{project}"
        if status == "enabled"
        else f"incomplete via {source}; missing {', '.join(missing)}"
        if status == "incomplete"
        else "disabled"
    )
    return {
        "project": project,
        "entity": entity,
        "enabled": bool(project and entity),
        "status": status,
        "source": source,
        "missing": missing,
        "api_key_present": bool(resolve_wandb_api_key()),
        "url": url,
        "summary": summary,
    }


def build_metrics_summary(
    log_history: list[dict],
    explicit_train_metrics: dict | None = None,
    explicit_eval_metrics: dict | None = None,
) -> dict:
    train_metrics = explicit_train_metrics
    eval_metrics = explicit_eval_metrics
    for row in log_history:
        if "eval_loss" in row:
            eval_metrics = row
        if "train_runtime" in row or "loss" in row or "train_loss" in row:
            train_metrics = row
    return {
        "latest_train_metrics": train_metrics,
        "latest_eval_metrics": eval_metrics,
        "log_history": log_history,
    }


def cap_dataset_rows(dataset_split, limit: int | None):
    if dataset_split is None or limit is None or limit < 0:
        return dataset_split
    if len(dataset_split) <= limit:
        return dataset_split
    return dataset_split.select(range(limit))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def ensure_eos_token_text(text: str, tokenizer: AutoTokenizer) -> str:
    eos_token = tokenizer.eos_token or ""
    if eos_token and not text.endswith(eos_token):
        return f"{text}{eos_token}"
    return text


def build_quantized_eval_collate_fn(
    tokenizer: AutoTokenizer,
    max_seq_length: int,
):
    def collate(examples: list[dict]) -> dict[str, torch.Tensor]:
        texts = [
            ensure_eos_token_text(str(example.get("text", "")), tokenizer)
            for example in examples
        ]
        batch = tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=max_seq_length,
            return_tensors="pt",
        )
        labels = batch["input_ids"].clone()
        if tokenizer.pad_token_id is not None:
            labels[labels == tokenizer.pad_token_id] = -100
        batch["labels"] = labels
        return batch

    return collate


def run_quantized_eval_only(
    *,
    model: AutoModelForCausalLM,
    tokenizer: AutoTokenizer,
    eval_dataset,
    run_state_writer: "RunStateWriter",
    per_device_eval_batch_size: int,
    max_seq_length: int,
) -> dict:
    model_device = next(model.parameters()).device
    dataloader = DataLoader(
        eval_dataset,
        batch_size=max(1, per_device_eval_batch_size),
        collate_fn=build_quantized_eval_collate_fn(tokenizer, max_seq_length),
    )

    total_batches = 0
    total_loss = 0.0
    total_correct = 0
    total_tokens = 0
    total_entropy = 0.0
    started_at = time.perf_counter()

    model.eval()
    with torch.no_grad():
        for step, batch in enumerate(dataloader, start=1):
            batch = {
                key: value.to(model_device) if isinstance(value, torch.Tensor) else value
                for key, value in batch.items()
            }
            outputs = model(**batch)
            logits = outputs.logits[:, :-1, :].float()
            labels = batch["labels"][:, 1:]
            valid_mask = labels != -100

            total_batches += 1
            total_loss += float(outputs.loss.item())

            if valid_mask.any():
                predictions = logits.argmax(dim=-1)
                total_correct += int(((predictions == labels) & valid_mask).sum().item())
                total_tokens += int(valid_mask.sum().item())
                log_probs = torch.nn.functional.log_softmax(logits, dim=-1)
                probs = log_probs.exp()
                token_entropies = -(probs * log_probs).sum(dim=-1)
                total_entropy += float(
                    token_entropies.masked_select(valid_mask).sum().item()
                )

            run_state_writer.update(
                status="running",
                startedAt=now_iso(),
                globalStep=step,
                epoch=None,
                maxSteps=len(dataloader),
                evalLoss=total_loss / total_batches,
            )

    eval_runtime = time.perf_counter() - started_at
    eval_loss = total_loss / total_batches if total_batches > 0 else None
    eval_accuracy = total_correct / total_tokens if total_tokens > 0 else None
    eval_entropy = total_entropy / total_tokens if total_tokens > 0 else None

    return {
        "eval_loss": eval_loss,
        "eval_mean_token_accuracy": eval_accuracy,
        "eval_entropy": eval_entropy,
        "eval_runtime": eval_runtime,
        "eval_steps_completed": total_batches,
        "eval_sample_count": len(eval_dataset),
        "eval_token_count": total_tokens,
        "eval_steps_per_second": (
            total_batches / eval_runtime if eval_runtime > 0 and total_batches > 0 else None
        ),
        "eval_samples_per_second": (
            len(eval_dataset) / eval_runtime if eval_runtime > 0 and len(eval_dataset) > 0 else None
        ),
    }


def load_route_request(route_manifest_path: str | None) -> dict | None:
    if not route_manifest_path:
        return None
    manifest = json.loads(Path(route_manifest_path).read_text(encoding="utf-8"))
    route_request = manifest.get("routeRequest")
    if not isinstance(route_request, dict):
        return None
    security = manifest.get("security")
    if isinstance(security, dict):
        route_request = {
            **route_request,
            "security": security,
        }
    return route_request


def load_existing_run_state(run_state_path: Path) -> dict:
    if not run_state_path.exists():
        return {}
    try:
        existing = json.loads(run_state_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return existing if isinstance(existing, dict) else {}


class RunStateWriter(TrainerCallback):
    def __init__(self, path: Path, base_state: dict) -> None:
        self.path = path
        self.state = base_state
        write_json(self.path, self.state)

    def update(self, **updates: object) -> None:
        self.state = {
            **self.state,
            **updates,
            "updatedAt": now_iso(),
        }
        write_json(self.path, self.state)

    def on_train_begin(self, args, state, control, **kwargs):
        self.update(
            status="running",
            startedAt=now_iso(),
            globalStep=int(state.global_step),
            epoch=float(state.epoch) if state.epoch is not None else None,
            maxSteps=int(args.max_steps),
        )

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs is None:
            return
        updates: dict[str, object] = {
            "globalStep": int(state.global_step),
            "epoch": float(state.epoch) if state.epoch is not None else None,
        }
        if "loss" in logs:
            updates["loss"] = float(logs["loss"])
        if "eval_loss" in logs:
            updates["evalLoss"] = float(logs["eval_loss"])
        if "learning_rate" in logs:
            updates["learningRate"] = float(logs["learning_rate"])
        self.update(**updates)

    def on_save(self, args, state, control, **kwargs):
        self.update(lastCheckpointStep=int(state.global_step))


def main() -> None:
    args = parse_args()
    args.base_model = resolve_q_base_model(args.base_model)

    data_files = {"train": args.train_file}
    if Path(args.eval_file).exists():
        data_files["eval"] = args.eval_file

    dataset = load_dataset("json", data_files=data_files)
    selected_tags = {tag.strip().lower() for tag in args.tag if tag.strip()}
    selected_languages = {
        language.strip().lower() for language in args.language if language.strip()
    }
    if selected_tags or selected_languages:
        dataset = dataset.filter(
            lambda example: (
                any(tag in selected_tags for tag in example.get("tags", []))
                if selected_tags
                else True
            )
            and (
                any(
                    language in selected_languages
                    for language in example.get("languages", [])
                )
                if selected_languages
                else True
            )
        )

    raw_train_dataset = cap_dataset_rows(dataset["train"], args.max_train_samples)
    raw_eval_dataset = (
        cap_dataset_rows(dataset["eval"], args.max_eval_samples)
        if "eval" in dataset and len(dataset["eval"]) > 0
        else None
    )
    run_state_path = Path(args.output_dir, "run-state.json")
    existing_run_state = load_existing_run_state(run_state_path)
    route_request = load_route_request(args.route_manifest)
    run_state_writer = RunStateWriter(
        run_state_path,
        {
            **existing_run_state,
            "status": "initializing",
            "executionMode": args.execution_mode,
            "mode": "eval_only" if args.eval_only else "train",
            "pid": os.getpid(),
            "createdAt": existing_run_state.get("createdAt", now_iso()),
            "baseModel": args.base_model,
            "trainFile": args.train_file,
            "evalFile": args.eval_file if raw_eval_dataset is not None else None,
            "outputDir": args.output_dir,
            "runName": args.run_name,
            "selectedTags": sorted(selected_tags),
            "selectedLanguages": sorted(selected_languages),
            "lineageId": args.lineage_id,
            "phaseId": args.phase_id,
            "evalOnly": args.eval_only,
            "adapterDir": args.adapter_dir,
            "curriculumProfile": args.curriculum_profile,
            "benchmarkPack": args.benchmark_pack,
            "routeManifestPath": args.route_manifest
            or existing_run_state.get("routeManifestPath"),
            "routeRequest": route_request
            if route_request is not None
            else existing_run_state.get("routeRequest"),
            "routeQueue": existing_run_state.get("routeQueue"),
            "routeQueueDisplayStatus": existing_run_state.get(
                "routeQueueDisplayStatus"
            ),
            "routeQueueSummary": existing_run_state.get("routeQueueSummary"),
            "useCpu": args.use_cpu,
            "maxSteps": args.max_steps,
            "maxTrainSamples": args.max_train_samples,
            "maxEvalSamples": args.max_eval_samples,
            "trainSampleCount": len(raw_train_dataset),
            "evalSampleCount": len(raw_eval_dataset) if raw_eval_dataset is not None else 0,
        },
    )

    run_state_writer.update(status="loading_tokenizer")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    run_state_writer.update(
        status="loading_model",
        tokenizerReadyAt=now_iso(),
    )

    quantization_config = None
    if args.load_in_4bit:
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if args.bf16 else torch.float16,
        )

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        device_map="cpu" if args.use_cpu else "auto",
        torch_dtype=torch.bfloat16 if args.bf16 else "auto",
        quantization_config=quantization_config,
        low_cpu_mem_usage=True,
    )
    model.config.use_cache = False
    target_modules: list[str] = []
    run_state_writer.update(
        status="configuring_adapters",
        modelReadyAt=now_iso(),
        targetModuleCount=0,
        adapterDir=args.adapter_dir,
    )

    if args.adapter_dir:
        model = PeftModel.from_pretrained(
            model,
            args.adapter_dir,
            is_trainable=not args.eval_only,
        )
        run_state_writer.update(
            status="preparing_dataset",
            adaptersReadyAt=now_iso(),
            targetModuleCount=0,
        )
    elif args.eval_only:
        run_state_writer.update(
            status="preparing_dataset",
            adaptersReadyAt=now_iso(),
            targetModuleCount=0,
        )
    else:
        target_modules = resolve_lora_target_modules(model)
        run_state_writer.update(
            status="configuring_adapters",
            modelReadyAt=now_iso(),
            targetModuleCount=len(target_modules),
        )
        lora_config = LoraConfig(
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=target_modules,
        )
        model = get_peft_model(model, lora_config)
        run_state_writer.update(
            status="preparing_dataset",
            adaptersReadyAt=now_iso(),
            targetModuleCount=len(target_modules),
        )

    train_dataset = raw_train_dataset.map(
        lambda example: format_chat(example, tokenizer),
        remove_columns=raw_train_dataset.column_names,
    )
    eval_dataset = (
        raw_eval_dataset.map(
            lambda example: format_chat(example, tokenizer),
            remove_columns=raw_eval_dataset.column_names,
        )
        if raw_eval_dataset is not None
        else None
    )
    if args.eval_only and (eval_dataset is None or len(eval_dataset) == 0):
        raise RuntimeError("Evaluation-only runs require at least one eval sample.")
    wandb_metadata = resolve_wandb_metadata(args)
    report_to = resolve_report_to(args)
    run_state_writer.update(
        status="building_trainer",
        preparedTrainSampleCount=len(train_dataset),
        preparedEvalSampleCount=len(eval_dataset) if eval_dataset is not None else 0,
        wandb=wandb_metadata,
    )

    training_args = SFTConfig(
        output_dir=args.output_dir,
        learning_rate=args.learning_rate,
        num_train_epochs=0.0 if args.eval_only else args.num_train_epochs,
        max_steps=0 if args.eval_only else args.max_steps,
        per_device_train_batch_size=args.per_device_train_batch_size,
        per_device_eval_batch_size=args.per_device_eval_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_steps=args.eval_steps,
        eval_strategy="no" if args.eval_only or eval_dataset is None else "steps",
        save_strategy="no" if args.eval_only else "steps",
        bf16=args.bf16,
        report_to=report_to,
        run_name=args.run_name,
        gradient_checkpointing=True,
        use_cpu=args.use_cpu,
        dataset_text_field="text",
        max_length=args.max_seq_length,
    )

    quantized_eval_only = (
        args.eval_only and args.load_in_4bit and args.adapter_dir is None
    )
    trainer = None
    if quantized_eval_only:
        run_state_writer.update(
            status="ready_to_train",
            trainerReadyAt=now_iso(),
            evaluationBackend="quantized_eval_only",
        )
    else:
        trainer = SFTTrainer(
            model=model,
            processing_class=tokenizer,
            train_dataset=train_dataset if len(train_dataset) > 0 else eval_dataset,
            eval_dataset=eval_dataset,
            args=training_args,
        )
        trainer.add_callback(run_state_writer)
        run_state_writer.update(
            status="ready_to_train",
            trainerReadyAt=now_iso(),
            evaluationBackend="trl_sft_trainer",
        )

    try:
        explicit_train_metrics = None
        explicit_eval_metrics = None
        if args.eval_only:
            if quantized_eval_only:
                explicit_eval_metrics = run_quantized_eval_only(
                    model=model,
                    tokenizer=tokenizer,
                    eval_dataset=eval_dataset,
                    run_state_writer=run_state_writer,
                    per_device_eval_batch_size=args.per_device_eval_batch_size,
                    max_seq_length=args.max_seq_length,
                )
            else:
                run_state_writer.update(
                    status="running",
                    startedAt=now_iso(),
                    globalStep=int(trainer.state.global_step),
                    epoch=float(trainer.state.epoch) if trainer.state.epoch is not None else None,
                    maxSteps=0,
                )
                explicit_eval_metrics = trainer.evaluate()
        else:
            trainer.train()
            trainer.save_model(args.output_dir)
            tokenizer.save_pretrained(args.output_dir)
        metrics_summary = build_metrics_summary(
            trainer.state.log_history if trainer is not None else [],
            explicit_train_metrics=explicit_train_metrics,
            explicit_eval_metrics=explicit_eval_metrics,
        )
        metrics_summary["lineage"] = {
            "lineage_id": args.lineage_id,
            "phase_id": args.phase_id,
        }

        summary = {
            "base_model": args.base_model,
            "train_file": args.train_file,
            "eval_file": args.eval_file if eval_dataset is not None else None,
            "output_dir": args.output_dir,
            "selected_tags": sorted(selected_tags),
            "selected_languages": sorted(selected_languages),
            "lineage_id": args.lineage_id,
            "phase_id": args.phase_id,
            "eval_only": args.eval_only,
            "adapter_dir": args.adapter_dir,
            "curriculum_profile": args.curriculum_profile,
            "benchmark_pack": args.benchmark_pack,
            "max_steps": args.max_steps,
            "max_train_samples": args.max_train_samples,
            "max_eval_samples": args.max_eval_samples,
            "use_cpu": args.use_cpu,
            "load_in_4bit": args.load_in_4bit,
            "target_module_count": len(target_modules),
            "report_to": report_to,
            "run_name": args.run_name,
            "wandb": wandb_metadata,
            "evaluation_backend": (
                "quantized_eval_only" if quantized_eval_only else "trl_sft_trainer"
            ),
        }
        Path(args.output_dir).mkdir(parents=True, exist_ok=True)
        Path(args.output_dir, "run-summary.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        Path(args.output_dir, "metrics-summary.json").write_text(
            json.dumps(metrics_summary, indent=2) + "\n", encoding="utf-8"
        )
        run_state_writer.update(
            status="completed",
            finishedAt=now_iso(),
            globalStep=(
                int(trainer.state.global_step)
                if trainer is not None
                else int(explicit_eval_metrics.get("eval_steps_completed", 0))
                if explicit_eval_metrics
                else 0
            ),
            epoch=(
                float(trainer.state.epoch) if trainer is not None and trainer.state.epoch is not None else None
            ),
            loss=(
                float(metrics_summary["latest_train_metrics"]["loss"])
                if metrics_summary["latest_train_metrics"]
                and "loss" in metrics_summary["latest_train_metrics"]
                else float(metrics_summary["latest_train_metrics"]["train_loss"])
                if metrics_summary["latest_train_metrics"]
                and "train_loss" in metrics_summary["latest_train_metrics"]
                else None
            ),
            evalLoss=(
                float(metrics_summary["latest_eval_metrics"]["eval_loss"])
                if metrics_summary["latest_eval_metrics"]
                and "eval_loss" in metrics_summary["latest_eval_metrics"]
                else None
            ),
        )
    except Exception as exc:
        run_state_writer.update(
            status="failed",
            finishedAt=now_iso(),
            error=str(exc),
        )
        raise


if __name__ == "__main__":
    main()
