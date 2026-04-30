# Hosted Q Backend Provisioning

OpenJaws now owns a deployable Cloudflare backend package for the public hosted-Q
and JAWS account routes.

Path: `services/cloudflare-hosted-q`

## What It Provides

- Cloudflare Worker route surface:
  - `GET /health`
  - `POST /signup`
  - `POST /keys`
  - `POST /usage`
  - `POST /usage/record`
  - `POST /mail/notify`
  - `POST /laas/events`
  - `GET /laas/events`
- Cloudflare D1 schema for:
  - hosted-Q users
  - API key hashes
  - usage events
  - AROBI LAAS ledger events
  - mail receipts
- service-token protection for privileged usage, mail, and ledger writes
- Resend-backed notification sending without storing raw recipient or subject
  values in receipts

## Required Remote Bindings

The repo contains the deployable service, not real infrastructure credentials.
Before production deploy, bind:

- Cloudflare account and API token for deployment
- D1 database id in `services/cloudflare-hosted-q/wrangler.toml`
- `SERVICE_TOKEN`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Then set the public sites to proxy to the deployed worker:

- `Q_HOSTED_SERVICE_BASE_URL`
- `Q_HOSTED_SERVICE_TOKEN`

## Commands

```powershell
bun run services:backend:test
bunx wrangler d1 migrations apply openjaws-hosted-q --remote --config services/cloudflare-hosted-q/wrangler.toml
bun run services:backend:deploy
bun run service:routes
```

`bun run service:routes` reports the worker package as present from the repo.
It still cannot claim the remote route is live until the deployed base URL is
configured and reachable.
