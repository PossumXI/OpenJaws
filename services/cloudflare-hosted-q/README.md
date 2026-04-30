# Cloudflare Hosted Q Backend

This worker is the repo-owned production backend surface for:

- hosted Q signup, usage, and key issuance
- Stripe checkout and verified webhook entitlement sync
- D1-backed account and usage storage
- service-authenticated Resend notification sends
- service-authenticated AROBI ledger / LAAS event receipts

It is intentionally deployable from this repository, but it does not contain real
account IDs or secrets.

## Routes

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

Privileged routes require `Authorization: Bearer <SERVICE_TOKEN>`. This
includes checkout, verified Stripe webhook sync, usage recording, mail, and
LAAS writes.

## Deploy

1. Create a Cloudflare D1 database.
2. Replace `database_id` in `wrangler.toml`.
3. Set secrets:

```powershell
bunx wrangler secret put SERVICE_TOKEN --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put RESEND_API_KEY --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put RESEND_FROM_EMAIL --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_SECRET_KEY --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_PRICE_BUILDER --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler secret put STRIPE_PRICE_OPERATOR --config services/cloudflare-hosted-q/wrangler.toml
```

4. Apply migrations and deploy:

```powershell
bunx wrangler d1 migrations apply openjaws-hosted-q --remote --config services/cloudflare-hosted-q/wrangler.toml
bunx wrangler deploy --config services/cloudflare-hosted-q/wrangler.toml
```

5. Point `Q_HOSTED_SERVICE_BASE_URL` on qline.site and iorch.net to the
deployed worker origin, and set `Q_HOSTED_SERVICE_TOKEN` to the same service
token used by the worker.

## Security

- API keys are stored as SHA-256 hashes and only returned once at issuance.
- Mail receipts hash recipient and subject values before storage.
- Checkout, webhook sync, ledger writes, usage writes, and mail sends are
  service-authenticated.
- The worker health route reports binding presence without exposing secret
  values.
