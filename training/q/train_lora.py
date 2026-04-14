from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from datetime import datetime, timezone

from datasets import load_dataset
from peft import LoraConfig, get_peft_model
import torch
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
    if args.wandb_project and args.wandb_entity:
        os.environ.setdefault("WANDB_PROJECT", args.wandb_project)
        os.environ.setdefault("WANDB_ENTITY", args.wandb_entity)
        return ["wandb"]
    return []


def build_metrics_summary(log_history: list[dict]) -> dict:
    train_metrics = None
    eval_metrics = None
    for row in log_history:
        if "eval_loss" in row:
            eval_metrics = row
        if "train_runtime" in row or "loss" in row:
            train_metrics = row
    return {
        "latest_train_metrics": train_metrics,
        "latest_eval_metrics": eval_metrics,
        "log_history": log_history,
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


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

    raw_eval_dataset = dataset["eval"] if "eval" in dataset and len(dataset["eval"]) > 0 else None
    run_state_path = Path(args.output_dir, "run-state.json")
    run_state_writer = RunStateWriter(
        run_state_path,
        {
            "status": "initializing",
            "executionMode": args.execution_mode,
            "pid": os.getpid(),
            "createdAt": now_iso(),
            "baseModel": args.base_model,
            "trainFile": args.train_file,
            "evalFile": args.eval_file if raw_eval_dataset is not None else None,
            "outputDir": args.output_dir,
            "runName": args.run_name,
            "selectedTags": sorted(selected_tags),
            "selectedLanguages": sorted(selected_languages),
            "routeManifestPath": args.route_manifest,
            "routeRequest": load_route_request(args.route_manifest),
            "useCpu": args.use_cpu,
            "maxSteps": args.max_steps,
            "trainSampleCount": len(dataset["train"]),
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
    )

    dataset = dataset.map(
        lambda example: format_chat(example, tokenizer),
        remove_columns=dataset["train"].column_names,
    )
    eval_dataset = dataset["eval"] if "eval" in dataset and len(dataset["eval"]) > 0 else None
    report_to = resolve_report_to(args)
    run_state_writer.update(
        status="building_trainer",
        preparedTrainSampleCount=len(dataset["train"]),
        preparedEvalSampleCount=len(eval_dataset) if eval_dataset is not None else 0,
    )

    training_args = SFTConfig(
        output_dir=args.output_dir,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.per_device_train_batch_size,
        per_device_eval_batch_size=args.per_device_eval_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_steps=args.eval_steps,
        eval_strategy="steps" if eval_dataset is not None else "no",
        save_strategy="steps",
        bf16=args.bf16,
        report_to=report_to,
        run_name=args.run_name,
        gradient_checkpointing=True,
        use_cpu=args.use_cpu,
        dataset_text_field="text",
        max_length=args.max_seq_length,
    )

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset["train"],
        eval_dataset=eval_dataset,
        args=training_args,
    )
    trainer.add_callback(run_state_writer)
    run_state_writer.update(
        status="ready_to_train",
        trainerReadyAt=now_iso(),
    )

    try:
        trainer.train()
        trainer.save_model(args.output_dir)
        tokenizer.save_pretrained(args.output_dir)
        metrics_summary = build_metrics_summary(trainer.state.log_history)

        summary = {
            "base_model": args.base_model,
            "train_file": args.train_file,
            "eval_file": args.eval_file if eval_dataset is not None else None,
            "output_dir": args.output_dir,
            "selected_tags": sorted(selected_tags),
            "selected_languages": sorted(selected_languages),
            "max_steps": args.max_steps,
            "use_cpu": args.use_cpu,
            "target_module_count": len(target_modules),
            "report_to": report_to,
            "run_name": args.run_name,
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
            globalStep=int(trainer.state.global_step),
            epoch=float(trainer.state.epoch) if trainer.state.epoch is not None else None,
            loss=(
                float(metrics_summary["latest_train_metrics"]["loss"])
                if metrics_summary["latest_train_metrics"]
                and "loss" in metrics_summary["latest_train_metrics"]
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
