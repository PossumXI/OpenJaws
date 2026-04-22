# Q LoRA Scaffold

This directory contains the local fine-tuning scaffold for `Q`.

OpenJaws treats `Q` as the public model family name. The trainer resolves that
label to the upstream checkpoint internally, so operator docs and commands stay
consistent with the shipped product surface.

## Inputs

Generate raw and prepared datasets first:

```powershell
bun run export:sft --project openjaws --out data/sft/openjaws-q.jsonl
bun run prepare:sft --in data/sft/openjaws-q.jsonl --out-dir data/sft/prepared
bun run audit:sft --in data/sft/prepared/all.jsonl --out-dir data/sft/audited
```

Prepared output files:

- `data/sft/prepared/all.jsonl`
- `data/sft/prepared/train.jsonl`
- `data/sft/prepared/eval.jsonl`
- `data/sft/prepared/manifest.json`

Audited output files:

- `data/sft/audited/all.jsonl`
- `data/sft/audited/train.jsonl`
- `data/sft/audited/eval.jsonl`
- `data/sft/audited/audit-report.json`
- `data/sft/audited/manifest.json`
- `data/sft/audited/bundle-manifest.json`
- `data/sft/audited/tags/<tag>/{all,train,eval}.jsonl`
- `data/sft/audited/languages/<language>/{all,train,eval}.jsonl`

Each row includes:

- `messages`
- `metadata`
- `tags`
- `split`
- `signature`

## Trainer

Install Python dependencies:

```powershell
python -m pip install -r training/q/requirements.txt
```

For a Windows CPU-only machine, use:

```powershell
python -m pip install -r training/q/requirements-windows-cpu.txt
```

Run a first local adapter fine-tune:

```powershell
python training/q/train_lora.py --load-in-4bit --bf16
```

For a bounded CPU smoke run on this machine shape:

```powershell
python training/q/train_lora.py ^
  --train-file data/sft/prepared/train.jsonl ^
  --eval-file data/sft/prepared/eval.jsonl ^
  --output-dir artifacts/q-cpu-smoke ^
  --tag agentic ^
  --use-cpu ^
  --max-seq-length 256 ^
  --per-device-train-batch-size 1 ^
  --gradient-accumulation-steps 1 ^
  --max-steps 1
```

Enable W&B on tracked runs:

```powershell
python training/q/train_lora.py ^
  --train-file data/sft/prepared/train.jsonl ^
  --eval-file data/sft/prepared/eval.jsonl ^
  --wandb-entity arobi-arobi-technology-alliance ^
  --wandb-project openjaws-q ^
  --run-name q-agentic-smoke
```

Useful overrides:

```powershell
python training/q/train_lora.py ^
  --train-file data/sft/prepared/train.jsonl ^
  --eval-file data/sft/prepared/eval.jsonl ^
  --output-dir artifacts/q-coding-lora ^
  --num-train-epochs 2 ^
  --learning-rate 1e-4 ^
  --max-seq-length 4096
```

Run an eval-only benchmark over the audited bundle:

```powershell
bun run q:bridgebench --bundle-dir data/sft/audited --base-model q-lite --pack all
```

On this Windows host, the canonical benchmark Python runtime is:

```powershell
D:\openjaws\OpenJaws\.venv-gemma4\Scripts\python.exe
```

If you need an explicit 4-bit local eval path for investigation rather than the
default fail-closed host-memory gate, use:

```powershell
bun run q:bridgebench --bundle-dir data/sft/audited --base-model q --pack agentic --load-in-4bit
```

Or opt into automatic 4-bit local BridgeBench fallback for the current shell:

```powershell
$env:OPENJAWS_BRIDGEBENCH_AUTO_4BIT='true'
```

That writes:

- `bridgebench-report.json`
- `reward.json`
- `reward-details.json`

Run a bounded specialization pass plus follow-up benchmark:

```powershell
bun run q:curriculum --bundle-dir data/sft/audited --base-model q-lite --profile agentic --benchmark-pack all
```

## Current Intent

This scaffold is aimed at:

- coding and patch synthesis
- agentic shell/tool behavior
- security review and triage

The dataset preparer already tags samples into `coding`, `agentic`,
`security`, and `general`, so the next pass can add tag-based subset training
without retracing the raw transcript corpus.
The trainer already supports tag filtering through repeated `--tag` flags.
It also writes `metrics-summary.json` beside `run-summary.json` so local runs
stay reviewable even without W&B.

The benchmark lane uses those same audited packs. It is meant for honest local
comparison, not for pretending OpenJaws already owns the Harbor or
Terminal-Bench leaderboard story.

Train from the audited splits, not the raw prepared set, once you start doing
longer runs.
