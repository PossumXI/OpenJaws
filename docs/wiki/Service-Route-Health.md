# Service Route Health

`bun run service:routes` produces the operator receipt for the routes that JAWS,
OpenJaws, Q, Immaculate, ApexOS, and the public release mirrors depend on.

The check is intentionally honest:

- required public routes fail closed when they are unreachable or return the wrong status
- private, admin, and localhost routes warn by default because they may only exist on the operator machine
- missing OCI, Cloudflare, production database, Resend/mail, hosted-Q backend, or AROBI LAAS config is reported as `not_configured`
- repo-owned deployable backend packages are recognized separately from live remote secrets, so operators can tell whether a service is absent from code or only waiting on account binding/deploy
- secrets are never printed; the receipt only names the missing config class

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
  - hosted-Q backend base URL or the repo-owned Cloudflare worker package
  - production SQL/D1/OCI database route or the checked-in D1 schema
  - Cloudflare deploy config when Cloudflare is the target host
  - Netlify auth for deploy metadata checks
  - Resend/SMTP mail engine or the service-authenticated worker mail route
  - AROBI ledger / LAAS API route or the service-authenticated worker LAAS route

The Cloudflare backend package lives at `services/cloudflare-hosted-q`. It adds
the worker, D1 schema, hosted-Q account/key/usage routes, Resend notification
route, and AROBI LAAS ledger route. The health receipt can prove that package is
present, but only a deployed worker URL plus real Cloudflare/Resend secrets can
prove the remote service is live.

## Release Use

`system:check` now runs this receipt after the live qline check. Public route
failures block the release check. Missing private/admin/infra config remains
visible as a warning so operators cannot accidentally claim a service is live
without the route, database, or mail engine being configured.

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
