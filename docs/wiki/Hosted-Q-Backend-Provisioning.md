# Hosted Q Backend Provisioning

OpenJaws now owns a deployable Cloudflare backend package for the public hosted-Q
and JAWS account routes.

Path: `services/cloudflare-hosted-q`

## What It Provides

- Cloudflare Worker route surface:
  - `GET /health`
  - `POST /signup`
  - `POST /checkout`
  - `POST /keys`
  - `POST /usage`
  - `POST /usage/record`
  - `POST /stripe-webhook`
  - `POST /mail/notify`
  - `POST /laas/events`
  - `GET /laas/events`
- Cloudflare D1 schema for:
  - hosted-Q users
  - API key hashes
  - usage events
  - AROBI LAAS ledger events
  - mail receipts
- service-token protection for checkout, verified Stripe webhook sync,
  privileged usage, mail, and ledger writes
- Stripe checkout session creation plus entitlement sync for verified webhook
  events proxied by qline.site/iorch.net
- Resend-backed notification sending without storing raw recipient or subject
  values in receipts

## Required Remote Bindings

The repo contains the deployable service, not real infrastructure credentials.
Before production deploy, bind:

- Cloudflare account and API token for deployment
- D1 database id in `services/cloudflare-hosted-q/wrangler.toml`
- `SERVICE_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_BUILDER`
- `STRIPE_PRICE_OPERATOR`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Then set the public sites to proxy to the deployed worker:

- `Q_HOSTED_SERVICE_BASE_URL`
- `Q_HOSTED_SERVICE_TOKEN`

## Commands

```powershell
bun run services:backend:test
bun run services:backend:preflight
bunx wrangler d1 migrations apply openjaws-hosted-q --remote --config services/cloudflare-hosted-q/wrangler.toml
bun run services:backend:deploy
bun run service:routes
```

`services:backend:preflight` is the deployment gate before the remote commands.
It verifies the worker package, D1 migration files, concrete `database_id`,
uncommented Cloudflare route patterns, Cloudflare account auth, worker secret
key presence, and qline/iorch proxy env key presence. It prints key names and
missing classes only, never token values. The command exits nonzero while
blocked. For a report-only receipt, run
`bun scripts/hosted-q-provisioning-preflight.ts --json --allow-blocked`.

`bun run service:routes` reports the worker package as present from the repo,
then keeps hosted-Q, Cloudflare/D1, production database, and mail in
`not_configured` until real non-placeholder account bindings and route env are
present. AROBI/LAAS is checked separately from either a concrete URL+token pair
or the local `~/.arobi/edge-secrets.json` edge binding plus the public health
route. The hosted-Q worker route cannot be claimed live until the deployed base
URL is configured and `/health` is reachable. Stripe checkout and Resend/mail can
pass from the live qline.site Netlify environment when Netlify auth is available;
the health receipt records only which env keys exist and never prints secret
values.
