# Benchmark Status

This page tracks the live Immaculate benchmark record currently used to explain why OpenJaws benefits from the harness.

## Source Snapshot

- Immaculate commit: `b7a571f`
- Branch: `main`
- Benchmark publication date: `April 12, 2026`
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

## Executive Summary

These runs are relevant to OpenJaws because they validate the orchestration substrate that now sits behind:

- OpenCheek crew fan-out and deferred release
- route-worker heartbeat and assignment decisions
- fail-closed retry pacing under pressure
- remote Gemma dispatch, acknowledgement, and completion reconciliation

The soak result is the stronger signal. It shows that the harness can hold bounded reflex and cognitive latency for an hour-class run while preserving checkpointed recovery and integrity, which is exactly the property OpenJaws needs when it is pacing agents, routing tools, and managing remote execution instead of just answering one request.

## Reproducibility Notes

The benchmark source of truth lives in Immaculate, not in OpenJaws. OpenJaws consumes the published benchmark record and uses it to explain why Immaculate-backed orchestration improves routing, pressure control, and recovery semantics inside the cockpit.
