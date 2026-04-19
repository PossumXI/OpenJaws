# Q Website

This copy of the site is now a legacy mirror inside the OpenJaws repo.

Canonical live website repo:

- `https://github.com/PossumXI/q-s-unfolding-story`

Important boundary:

- do not publish `https://qline.site` from this OpenJaws repo anymore
- OpenJaws can still build this site locally for reference and compatibility work
- production deploys for `qline.site` must happen only from the canonical website repo above
- the guarded publish script in this repo now fails closed unless an explicit emergency override env var is set
- read-only live checks from this repo are still allowed

Domain target for the canonical repo: `https://qline.site`

It is designed to front:

- signup
- subscription and checkout
- API key generation
- usage and credit tracking
- monthly reset messaging

What it does today:

- ships the branded one-page frontend with real local 2D and 3D assets
- surfaces OpenJaws, Q_agents, Agent Co-Work, and the public repo directly on the landing page
- includes Netlify config
- includes a benchmark snapshot section generated from checked-in BridgeBench, soak, official public TerminalBench, repeated TerminalBench soak, and W&B-auth receipts
- includes server routes that proxy to a real hosted-Q backend when configured
- includes a local filesystem access ledger for development and self-hosted smoke work
- fails closed in production unless you attach a real hosted-Q backend

Share-card asset refresh:

- run `bun run website:sharecard` from the repo root to regenerate `website/public/assets/images/q-share-card.png`
- the shared-link preview is intentionally derived from repo-owned assets and verified benchmark copy, not invented metrics

Benchmark snapshot refresh:

- run `bun run website:snapshot:generate` after updating the checked-in benchmark receipts
- run `bun run website:snapshot:check` to fail closed if the public website snapshot drifted from those receipts
- CI and release verification now run that snapshot check before the website build

## Environment

Copy `.env.example` and set:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_AURA_GENESIS_URL`
- `Q_HOSTED_SERVICE_BASE_URL`
- `Q_HOSTED_SERVICE_TOKEN`
- `Q_HOSTED_SERVICE_LOCAL_MODE`
- `Q_ACCESS_STORE_PATH`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`
- `STRIPE_PRICE_BUILDER`
- `STRIPE_PRICE_OPERATOR`

## Stripe

- `POST /api/checkout` creates a Stripe Checkout subscription session when Stripe env vars are present
- `POST /api/webhooks/stripe` verifies incoming Stripe webhook signatures
- in local filesystem mode, the webhook can also activate or cancel demo entitlements in the local store
- once the site is hosted, point Stripe webhooks at `https://qline.site/api/webhooks/stripe`

## Local Hosted Access Mode

When `Q_HOSTED_SERVICE_BASE_URL` is not set, development mode can use a local
filesystem ledger instead:

- `POST /api/signup` creates or updates a local hosted-Q account by email
- `POST /api/checkout` creates a Stripe subscription checkout session when Stripe is configured
- `POST /api/webhooks/stripe` can sync completed checkout events back into the local ledger
- `POST /api/keys` issues a hosted-Q key and returns the plaintext token once
- `POST /api/usage` returns plan, credits, and rate-limit receipts

That local mode is useful for development and demos. It is not the production
operator backend.

## Local Run

```powershell
bun install
bun run dev
```

## Local Build

```powershell
bun run build
```

The guarded repo-level `bun run website:build` command uses a Node-driven Next
production build wrapper on Windows. That avoids the Bun-vs-Next manifest /
diagnostics flake that can break local release verification even when the site
code itself is clean.

## Netlify Deploy

Legacy note:

- `bun run website:deploy:check`
- `bun run website:deploy:safe`

now split cleanly in this repo:

- `website:deploy:check` is read-only and can still verify the live site
- `website:deploy:safe` fails closed unless `OPENJAWS_ALLOW_LEGACY_QLINE_DEPLOY=1` is set deliberately for an emergency one-off publish

Use the canonical website repo for live deploys instead of these OpenJaws commands.

Historical guarded deploy behavior from this repo used to be:

```powershell
bun run website:deploy:check
bun run website:deploy:safe
```

What the guarded publish does:

- uses the existing `qline.site` Netlify project instead of creating or targeting another site
- can reuse the authenticated Windows Netlify CLI config if the repo-local CLI config is missing
- runs the build from Linux or WSL, not from a Windows-built Next runtime bundle
- deploys the explicit Next output from `.netlify/static` plus `.netlify/functions-internal`
- rejects any draft that does not ship the real `Next.js Server Handler`
- verifies the unique deploy URL returns `200`
- verifies the apex domain `https://qline.site` returns `200`
- verifies the live page still contains the expected benchmark snapshot text before it leaves production in place

Do not use these broken paths for this site:

- `netlify deploy --build`
- `netlify deploy --functions .netlify/functions`
- a Windows-built `___netlify-server-handler` bundle

Reason:

- a Windows-built `___netlify-server-handler` can upload successfully but fail
  at runtime on Netlify with lambda decode errors
- a generic `--build` deploy on this site can publish with `No functions deployed`
  and produce a `404`
- a plain generic function upload can produce `error decoding lambda response`
  because it is missing the Next runtime metadata that this site needs

Production notes:

- Netlify envs should use `https://qline.site` for `NEXT_PUBLIC_SITE_URL`, success, cancel, and portal-return URLs
- `NEXT_PUBLIC_AURA_GENESIS_URL` should stay on `https://aura-genesis.org`
- `https://qline.site` now serves valid Netlify-managed HTTPS and is the canonical public domain for this site
- Stripe webhook target should be `https://qline.site/api/webhooks/stripe`
- benchmark snapshot copy should only be updated from real local receipts; do not invent a W&B URL or a Terminal-Bench score that the artifacts did not produce
- if you later move to a different custom domain, update the Netlify envs and reprovision TLS before exposing checkout traffic there

## Honest Boundary

This site now includes a small local filesystem ledger so the hosted-Q flow can
be exercised honestly during development. Production still needs a durable
operator backend for billing, entitlements, API-key storage, audit logs, credit
resets, and authenticated usage lookup.
