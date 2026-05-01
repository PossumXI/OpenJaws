# Cloudflare Hosted Q Backend

This worker is the repo-owned production backend surface for:

- hosted Q signup, usage, and key issuance
- Stripe checkout and verified webhook entitlement sync
- D1-backed account and usage storage
- JAWS user profile, code-token wallet, and promotion/contact storage
- service-authenticated Resend notification sends
- service-authenticated AROBI ledger / LAAS event receipts

It is intentionally deployable from this repository, but it does not contain real
account IDs or secrets.

## Routes

- `GET /health`
- `POST /signup`
- `POST /profile`
- `POST /checkout`
- `POST /keys`
- `POST /usage`
- `POST /usage/record`
- `GET /code-tokens/wallet?email=<email>`
- `GET /code-tokens/ledger?email=<email>&limit=25`
- `POST /code-tokens/ledger`
- `POST /stripe-webhook`
- `POST /mail/notify`
- `POST /laas/events`
- `GET /laas/events`
- `GET /promotions/campaign?slug=<slug>`
- `POST /promotions/campaigns`
- `POST /promotions/contacts`

Privileged routes require `Authorization: Bearer <SERVICE_TOKEN>`. This
includes checkout, verified Stripe webhook sync, usage recording, mail, and
LAAS writes. Code-token ledger writes and promotion campaign upserts are also
service-authenticated; public promotion contact capture only stores normalized
contact intent for an existing campaign.

## Deploy

0. Run the provisioning preflight:

```powershell
bun run services:backend:preflight
```

The preflight is intentionally no-secret. It reports which Cloudflare auth,
D1, worker secret, route, and public-site proxy bindings are present or missing,
but it never prints secret values. It exits nonzero until every required binding
is ready; use `bun scripts/hosted-q-provisioning-preflight.ts --json --allow-blocked`
only when you need a receipt without failing the shell step.

1. Create a Cloudflare D1 database.
2. Replace `database_id` in `wrangler.toml` and configure production routes.
3. Set secrets:

```powershell
bunx wrangler secret put SERVICE_TOKEN --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put RESEND_API_KEY --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put RESEND_FROM_EMAIL --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_SECRET_KEY --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_PRICE_BUILDER --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_PRICE_OPERATOR --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_SUCCESS_URL --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_CANCEL_URL --config services/cloudflare-hosted-q/wrangler.toml
```

4. Apply migrations and deploy:

```powershell
bunx wrangler d1 migrations apply openjaws-hosted-q --remote --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler deploy --config services/cloudflare-hosted-q/wrangler.toml
```

5. Point `Q_HOSTED_SERVICE_BASE_URL` on qline.site and iorch.net to the
deployed worker origin, and set `Q_HOSTED_SERVICE_TOKEN` to the same service
token used by the worker.
6. Rerun:

```powershell
bun run services:backend:preflight
bun run service:routes
```

Only call hosted-Q production-ready when the preflight is `ready` and
`service:routes` shows the hosted-Q backend, Cloudflare/D1, database, and mail
checks as configured.

## Security

- API keys are stored as SHA-256 hashes and only returned once at issuance.
- Mail receipts hash recipient and subject values before storage.
- Checkout, webhook sync, ledger writes, usage writes, and mail sends are
  service-authenticated.
- Code-token wallet mutations are append-only through privileged ledger writes
  so app-side game rewards and marketplace spends can be audited.
- Promotion contacts are deduped per campaign and keep marketing consent
  separate from hosted Q entitlement state.
- The worker health route reports binding presence without exposing secret
  values.
