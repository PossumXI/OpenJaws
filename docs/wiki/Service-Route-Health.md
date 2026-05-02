# Service Route Health

`bun run service:routes` produces the operator receipt for the routes that JAWS,
OpenJaws, Q, Immaculate, ApexOS, and the public release mirrors depend on.

The check is intentionally honest:

- required public routes fail closed when they are unreachable or return the wrong status
- private, admin, and localhost routes warn by default because they may only exist on the operator machine
- missing OCI, Cloudflare, production database, Stripe billing, Resend/mail, hosted-Q backend, or AROBI LAAS config is reported as `not_configured`
- repo-owned deployable backend packages are recognized separately from live remote secrets, so operators can tell whether a service is absent from code or only waiting on account binding/deploy
- package presence never marks production database, Cloudflare Worker/D1, hosted-Q, mail, or LAAS as provisioned
- Qline Netlify env metadata can satisfy Stripe and Resend/mail configuration checks when Netlify auth is available; the receipt records only env key names and booleans, never secret values
- AROBI LAAS can be marked configured only from a concrete URL+token pair or from the local `~/.arobi/edge-secrets.json` edge binding plus the live public health route; raw token values are never printed
- secrets are never printed; the receipt names missing config keys/classes and
  `nextActions` for each warning so operators can repair the route without
  guessing

## Current Route Classes

- Public JAWS downloads and updater routes:
  - `https://qline.site/downloads/jaws`
  - `https://qline.site/api/jaws/windows/x86_64/<version>`
  - `https://iorch.net/downloads/jaws`
  - `https://iorch.net/api/jaws/windows/x86_64/<version>`
- Public hosted-Q shell:
  - `https://qline.site`
  - `https://qline.site/api/signup`
- Local/admin runtime routes:
  - Immaculate harness on `127.0.0.1:8787`
  - Q, Viola, and Blackbeak agent health on `127.0.0.1:8788-8790`
  - Apex workspace, Chrono, and browser bridge health on `127.0.0.1:8797-8799`
- Required production configuration classes:
  - OCI/Q runtime auth
  - hosted-Q backend package presence
  - hosted-Q backend base URL and live `/health` route
  - production SQL/D1/OCI database route or concrete D1 database id
  - Cloudflare account auth plus concrete D1 binding when Cloudflare is the target host
  - Netlify auth for deploy metadata checks and qline.site env-key verification
  - Stripe checkout/webhook config from local env or qline.site Netlify env metadata
  - Resend/SMTP mail engine config from local env or qline.site Netlify env metadata
  - AROBI ledger / LAAS API route config or local edge-secret binding

The Cloudflare backend package lives at `services/cloudflare-hosted-q`. It adds
the worker, D1 schema, hosted-Q account/key/usage routes, Stripe checkout and
verified webhook sync routes, Resend notification route, and AROBI LAAS ledger
route. The health receipt can prove that package is present, but only a deployed
worker URL plus real Cloudflare/D1 configuration can prove those remote hosted-Q
dependencies are live. Stripe and Resend can be checked from local env first,
then from live qline.site Netlify env metadata when auth is available.
AROBI/LAAS is checked independently from either a concrete route+token env pair
or the local edge-secret binding and public health route. Placeholder values such as `replace_me` and
`REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID` are treated as missing.

## Release Use

`system:check` now runs this receipt after the live qline check. Public route
failures block the release check. Missing private/admin/infra config remains
visible as a warning so operators cannot accidentally claim a service is live
without the route, database, or mail engine being configured.

Before deploying the hosted-Q Cloudflare backend, run:

```powershell
bun run services:backend:preflight
```

That preflight is stricter than package presence. It blocks on missing
Cloudflare auth, placeholder D1 ids, commented/missing worker routes, missing
worker secrets, missing public-site proxy env keys, or any Q release-audit trace
that is active, stale, failed, timed out, cancelled, or missing successful probe
evidence while keeping all secret values out of the receipt. It exits nonzero until ready; use
`--allow-blocked` only for report-only automation.

When a route or config class reports `not_configured`, use the check-level
`missing` and `nextActions` fields in the JSON output as the source of truth.
For example, hosted-Q now requires both `Q_HOSTED_SERVICE_BASE_URL` and
`Q_HOSTED_SERVICE_TOKEN`; a reachable `/health` route alone does not prove paid
key issuance, billing, or usage routes are safe to expose.

Run stricter local/admin validation with:

```powershell
bun scripts/service-route-health.ts --json --strict-private
```

Run the dedicated Apex local bridge probe with:

```powershell
bun run apex:bridges
bun run apex:bridges:start
```

`apex:bridges:start` uses the existing guarded Apex launchers. It still fails
closed if the Apex source root, Cargo toolchain, or trust boundary is missing.
