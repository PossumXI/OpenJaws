# Q Local Track

This repo can run `Q` locally through Ollama and export OpenJaws transcripts
into a fine-tuning dataset.

## Local Runtime

Pull the local model you want to serve as `Q` through Ollama:

```powershell
ollama pull q
```

Switch OpenJaws to the local `Q` path:

```text
/provider use ollama q
```

That stores `ollama:q` as a first-class model option and makes plain
`/provider use ollama` resolve to your local `Q` default.

## Dataset Export

Export real OpenJaws transcripts into JSONL:

```powershell
bun run export:sft --out data/sft/openjaws-q.jsonl
```

Prepare a deduped train/eval dataset with tags:

```powershell
bun run prepare:sft --in data/sft/openjaws-q.jsonl --out-dir data/sft/prepared
bun run audit:sft --in data/sft/prepared/all.jsonl --out-dir data/sft/audited
```

Useful variants:

```powershell
bun run export:sft --project openjaws --out data/sft/openjaws-only.jsonl
bun run export:sft --include-sidechains --out data/sft/openjaws-with-agents.jsonl
bun run export:sft --limit 5000 --out data/sft/openjaws-sample.jsonl
```

The exporter keeps only visible user/assistant text pairs by default. It drops
command wrappers, local-command noise, meta messages, and empty tool/result
shells. It also drops greeting-only chatter like `hello`, `hey`, and
`what's up` unless you pass `--include-low-signal`.

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

The practical starting point is instruction-tuned `Q` with LoRA or QLoRA, not
full-weight retraining.

Suggested sequence:

1. Export and manually review the JSONL dataset.
2. Remove low-signal chat, duplicate turns, and sessions that are mostly setup noise.
3. Separate coding, agentic orchestration, and security work into tagged subsets.
4. Fine-tune the `Q` base family with LoRA adapters.
5. Evaluate on real repo tasks before promoting the adapter into production use.

Trainer scaffold:

```powershell
python -m pip install -r training/q/requirements.txt
python training/q/train_lora.py --load-in-4bit --bf16
```

Windows CPU-only path:

```powershell
python -m pip install -r training/q/requirements-windows-cpu.txt
python training/q/train_lora.py --use-cpu --max-steps 1 --max-seq-length 256
```

Recommended first specialization areas:

- Code edit planning and patch synthesis
- Tool-call selection and shell-command discipline
- Security review and bug triage
- Multi-agent orchestration summaries

## Boundaries

- This repo includes dataset export and a first local trainer scaffold.
- Ollama is the local inference path.
- The local trainer is a scaffold, not a full experiment manager.
- Longer or heavier runs should still move onto a properly sized remote box.
