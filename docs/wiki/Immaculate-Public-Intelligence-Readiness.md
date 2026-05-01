# Immaculate Public Intelligence Readiness

Date: 2026-05-01

## Root Cause

OpenJaws treated the Immaculate deck receipt as an all-or-nothing read across `/api/topology` and `/api/intelligence`. That made operator and Discord-adjacent status surfaces fragile: if topology or private intelligence was protected, unavailable, or intentionally hidden, the deck could disappear even when `/api/health` was online and Immaculate exposed safe aggregate readiness through `/api/intelligence/status`.

## Change

- Added `intelligence_status` as a first-class Immaculate harness action for `GET /api/intelligence/status`.
- Added `/immaculate readiness` and `/immaculate intelligence-status` aliases for the public-redacted readiness view.
- Changed `getImmaculateHarnessDeckReceipt()` to use protected topology/private intelligence when available, but fall back to public-redacted layer, execution, worker, governor, and persistence aggregates when those richer routes are protected.
- Added `getImmaculateHarnessIntelligenceStatus()` for runtime coherence and other operator surfaces that need safe readiness without private worker IDs or topology detail.
- Added a runtime coherence check named `harness-intelligence-status` so the system can distinguish "harness reachable but queue/worker plane degraded" from "harness unreachable."

## Operator Notes

Use `/api/intelligence/status` or `/immaculate readiness` for public, Discord, and broad operator health checks. Use `/api/topology`, `/api/intelligence`, and `/api/intelligence/workers` only when the caller is authorized for richer internal topology and worker details.

This keeps OpenJaws aligned with Aura and Asgard fabric behavior: protected topology must not be treated as proof that Immaculate is down.
