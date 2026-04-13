# Gemma 4 Local Track

This repo can now run Gemma 4 locally through Ollama and export OpenJaws transcripts into a fine-tuning dataset.

## Local Runtime

Pull the local model:

```powershell
ollama pull gemma4:e4b
```

Switch OpenJaws to the local Gemma 4 path:

```text
/provider use ollama gemma4:e4b
```

That stores `ollama:gemma4:e4b` as a first-class model option and makes plain `/provider use ollama` resolve to Gemma 4 by default.

## Dataset Export

Export real OpenJaws transcripts into JSONL:

```powershell
bun run export:sft --out data/sft/openjaws-gemma4.jsonl
```

Prepare a deduped train/eval dataset with tags:

```powershell
bun run prepare:sft --in data/sft/openjaws-gemma4.jsonl --out-dir data/sft/prepared
bun run audit:sft --in data/sft/prepared/all.jsonl --out-dir data/sft/audited
```

Useful variants:

```powershell
bun run export:sft --project openjaws --out data/sft/openjaws-only.jsonl
bun run export:sft --include-sidechains --out data/sft/openjaws-with-agents.jsonl
bun run export:sft --limit 5000 --out data/sft/openjaws-sample.jsonl
```

The exporter keeps only visible user/assistant text pairs by default. It drops command wrappers, local-command noise, meta messages, and empty tool/result shells.
It also drops greeting-only chatter like `hello`, `hey`, and `what's up` unless you pass `--include-low-signal`.

The prep step then:

- dedupes identical prompt/answer pairs
- tags samples as `coding`, `agentic`, `security`, or `general`
- writes deterministic `train` / `eval` splits
- emits a `manifest.json` with counts

The audit step then:

- flags bad literal-response pairs like `Reply with exactly X` -> wrong answer
- drops hard-fail examples into a cleaned dataset
- writes `audit-report.json` so you can inspect what was removed

## Fine-Tune Track

The practical starting point is instruction-tuned Gemma 4 with LoRA or QLoRA, not full-weight retraining. The current scaffold targets `google/gemma-4-E4B-it`.

Suggested sequence:

1. Export and manually review the JSONL dataset.
2. Remove low-signal chat, duplicate turns, and sessions that are mostly setup noise.
3. Separate coding, agentic orchestration, and security work into tagged subsets.
4. Fine-tune the official Gemma 4 instruction checkpoint with LoRA adapters.
5. Evaluate on real repo tasks before promoting the adapter into production use.

Trainer scaffold:

```powershell
python -m pip install -r training/gemma4/requirements.txt
python training/gemma4/train_lora.py --load-in-4bit --bf16
```

Windows CPU-only path:

```powershell
python -m pip install -r training/gemma4/requirements-windows-cpu.txt
python training/gemma4/train_lora.py --use-cpu --max-steps 1 --max-seq-length 256
```

Recommended first specialization areas:

- Code edit planning and patch synthesis
- Tool-call selection and shell-command discipline
- Security review and bug triage
- Multi-agent orchestration summaries

## Boundaries

- This repo now includes dataset export, not a trainer.
- Ollama is the runtime path for local inference.
- This repo now includes an initial LoRA trainer scaffold, but not a full experiment manager.
- Fine-tuning should use the official Gemma 4 weights/checkpoints from Google's release channels, then convert/export separately for local serving if needed.
