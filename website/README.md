# Q Website

This is a one-page Next.js shell for the public Q surface.

Production target: `https://qline.site`

It is designed to front:

- signup
- subscription and checkout
- API key generation
- usage and credit tracking
- monthly reset messaging

What it does today:

- ships the branded one-page frontend with real local 2D and 3D assets
- includes Netlify config
- includes a benchmark snapshot section sourced from local BridgeBench, soak, and TerminalBench receipts
- includes server routes that proxy to a real hosted-Q backend when configured
- includes a local filesystem access ledger for development and self-hosted smoke work
- fails closed in production unless you attach a real hosted-Q backend

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

## Netlify Deploy

For this site, manual Netlify production deploys should be run from Linux or
WSL, not from a Windows-built Next runtime bundle.

Reason:

- the Windows-built `___netlify-server-handler` can upload successfully but fail
  at runtime on Netlify with lambda decode errors
- the Linux or WSL build path produces a working server handler and the correct
  runtime route bundle for the live site

Use the Netlify CLI from a Linux or WSL shell when you publish this site
manually.

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
