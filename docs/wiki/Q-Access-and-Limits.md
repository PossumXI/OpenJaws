# Q Access and Limits

This page explains how people should access `Q`, what is free, what is not, and where rate limits actually belong.

## Plain Version

- downloaded public OpenJaws installs should use their own `Q` / `OCI` key
- internal operator surfaces can use `OCI` IAM when you control the tenancy locally
- the internal Discord surface can stay free if you choose
- heavy public `Q` usage should be metered and billed by the service that issues the key, not guessed from the client
- the public hosted-Q web shell belongs at `https://qline.site`
- `https://qline.site` should be the only public signup and checkout domain; it now serves valid HTTPS on the live Netlify surface

## Public Install Path

If someone downloads OpenJaws and wants to stay on the default runtime:

1. generate or provision their own `Q` / `OCI` key from the service they are allowed to use
   or, when the hosted issuing path is live, request a hosted key from `https://qline.site`
2. store it with `/provider key oci <api-key>` or set:
   - `Q_API_KEY`
   - `OCI_API_KEY`
   - `OCI_GENAI_API_KEY`
3. run `/provider test oci Q`
4. run `/status`

This keeps the public install path explicit and avoids silently borrowing internal operator credentials.

## Internal Operator Path

Internal operator surfaces can use local `OCI` IAM instead of a bearer key:

- `OCI_CONFIG_FILE`
- `OCI_PROFILE`
- `OCI_COMPARTMENT_ID`
- `OCI_GENAI_PROJECT_ID`
- `Q_MODEL` or `OCI_MODEL`
- `Q_BASE_URL` or `OCI_BASE_URL` when you are not using the default region endpoint

That path is appropriate for private command stations, internal bots, and other operator-controlled automation.

## Discord Exception

The Discord bot can be a separate internal or community surface.

If you want that path to stay free:

- keep it on its own credentials and moderation rules
- keep its rate limits separate from downloaded public installs
- do not treat Discord access as proof that a downloaded OpenJaws install is entitled to unlimited hosted `Q`

## Rate Limits and Credits

The honest place to enforce credits and rate limits is the hosted `Q` service that issues the key.

Recommended service-side pattern:

- a small free monthly credit grant for light evaluation and testing
- stricter per-key request and token limits on the free lane
- higher paid limits for heavier daily use
- separate limits for training, benchmarking, and routed worker execution
- abuse controls that can throttle, suspend, or revoke a key

Recommended website/backend contract:

- `https://qline.site` is the public signup / checkout / key / usage shell
- frontend shell calls `signup`, `checkout`, `keys`, and `usage`
- the website forwards those requests to `Q_HOSTED_SERVICE_BASE_URL`
- the backend owns billing, entitlement lookup, key issuance, and usage metering
- Stripe webhook target is `https://qline.site/api/webhooks/stripe`
- useful response headers include:
  - `x-ratelimit-limit`
  - `x-ratelimit-remaining`
  - `x-ratelimit-reset`
  - `x-q-plan`
  - `x-q-credits-remaining`
  - `retry-after`

Recommended boundary between lanes:

- free lane: short interactive use, bounded evaluation, light experimentation
- paid lane: heavier daily usage, longer coding sessions, larger benchmark volume, and sustained team use
- internal Discord lane: optional no-charge exception, still rate-limited and moderated

## Example Operator Policy

An example policy template lives here:

- [`docs/examples/q-hosted-access-policy.example.json`](../examples/q-hosted-access-policy.example.json)

Treat that file as a planning scaffold for the issuing service, not as enforcement by itself.

The Netlify-ready website shell also expects:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_AURA_GENESIS_URL`
- `Q_HOSTED_SERVICE_BASE_URL`
- `Q_HOSTED_SERVICE_TOKEN`

For the production domain, `NEXT_PUBLIC_SITE_URL` should resolve to `https://qline.site`.

For development or a self-hosted smoke lane, the website can also use:

- `Q_HOSTED_SERVICE_LOCAL_MODE=filesystem`
- `Q_ACCESS_STORE_PATH`

That local mode can store demo signups, Stripe webhook sync, generated keys, and
usage receipts on disk. It is useful for proving the hosted-Q flow in the repo.
It is not the production entitlement service.

## Honest Boundary

OpenJaws can document and consume a hosted `Q` entitlement path, but this repository does not ship:

- a durable production wallet or ledger
- a production-grade hosted key vault
- a production rate-limit gateway
- authenticated production usage lookup

The repo now includes a small filesystem-backed demo ledger in `website/` so the
hosted flow can be exercised locally, but durable billing and entitlement
enforcement still belong in the operator service that owns the real `Q` keys.
