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

Default local Ollama traffic stays on the normal Ollama lane at
`http://127.0.0.1:11434`.

If you want local `Q` specifically to follow the dedicated Immaculate-style lane
while other Ollama models stay on the normal port, set `OPENJAWS_OLLAMA_Q_BASE_URL`
or, if you need the shared alias, `OLLAMA_Q_BASE_URL`:

```powershell
$env:OPENJAWS_OLLAMA_Q_BASE_URL = 'http://127.0.0.1:11435'
/provider use ollama q
/provider test ollama q
```

That override only applies to `ollama:q` or `ollama:q:latest`, and it beats the
generic provider-level Ollama base URL. Generic Ollama models still follow
`OLLAMA_BASE_URL` or the default `http://127.0.0.1:11434`. An explicit
per-model override for `ollama:q` still wins if you set one in `settings.json`.
Discord chat is separate: it stays on `DISCORD_Q_MODEL` and does not inherit
the general `Q_AGENT_MODEL` path.

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
- writes `bundle-manifest.json` plus pack files under `tags/` and `languages/` so you can benchmark focused slices later

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

## Local Benchmark and Curriculum Lane

Use the native in-repo benchmark lane when you want an honest local comparison before moving to heavier external suites:

```powershell
bun run q:bridgebench --bundle-dir data/sft/audited --base-model q-lite --pack all
```

That runs eval-only checks over audited packs and writes:

- `bridgebench-report.json`
- `reward.json`
- `reward-details.json`

Use the curriculum wrapper when you want a bounded specialization pass and an immediate follow-up benchmark:

```powershell
bun run q:curriculum --bundle-dir data/sft/audited --base-model q-lite --profile agentic --benchmark-pack all
```

This is good for comparing coding, agentic, and security-focused adapters inside the repo.

## Boundaries

- This repo includes dataset export and a first local trainer scaffold.
- Ollama is the local inference path.
- The local trainer and benchmark lane are scaffolds, not a public leaderboard service.
- Longer or heavier runs should still move onto a properly sized remote box.
- Public Immaculate benchmark numbers remain the authoritative published benchmark story.
