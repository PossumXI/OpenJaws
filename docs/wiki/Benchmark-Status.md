# Benchmark Status

This page tracks the live Immaculate benchmark record currently used to explain why OpenJaws benefits from the harness.

## Source Snapshot

- Immaculate commit: `b7a571f`
- Branch: `main`
- Publication status reported green for benchmark publication, CI, security, and GitGuardian

## 60-Minute Soak Run

- W&B: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/5dnpoes7
- Duration: `3,600,967.49 ms`
- Throughput: `1270.73 events/s`
- Reflex latency:
  - `P50 17.46 ms`
  - `P95 17.86 ms`
  - `P99 17.94 ms`
  - `P99.9 18.06 ms`
- Cognitive latency:
  - `P50 50.50 ms`
  - `P95 57.04 ms`
  - `P99 58.32 ms`
  - `P99.9 58.95 ms`
- Throughput heuristic:
  - `P50 1608.80 ops/s`
  - `P95 1726.17 ops/s`
  - `P99 1751.99 ops/s`
  - `P99.9 1757.85 ops/s`
- Recovery: `checkpoint`
- Integrity: `verified`
- Failed assertions: `0`
- Hardware:
  - Windows 11 Pro
  - AMD Ryzen 7 7735HS
  - 16 cores
  - 23.29 GiB RAM
  - SSD
  - Node `v22.13.1`

## 60-Second Benchmark

- W&B: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/wm8wf7bf
- Duration: `61,098.97 ms`

## Why OpenJaws Cares

OpenJaws uses Immaculate as an execution-control layer. The benchmark numbers matter because they validate the control loop behind:

- worker assignment
- retry pacing
- crew burst budgeting
- remote route dispatch
- checkpointed recovery under sustained load
