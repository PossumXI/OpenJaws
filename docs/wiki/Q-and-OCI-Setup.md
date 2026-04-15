# Q and OCI Setup

This is the main setup page for the default OpenJaws runtime path.

Fresh public installs start on `OCI:Q`.

## Default Runtime

- provider: `oci`
- model: `Q`
- typical base URL: `https://inference.generativeai.<region>.oci.oraclecloud.com/openai/v1`

OpenJaws keeps provider, model, base URL, and Immaculate reachability visible so installs do not drift silently.
OpenJaws now also has a first-class live provider probe, so `configured` and `reachable` are no longer treated as the same thing.

In plain terms: OpenJaws does not just save your settings and hope for the best. It can check whether the provider path is actually live.

## First Run

1. Start OpenJaws.
2. Use the built-in first-run setup lane.
3. Keep `OCI:Q` if you want the default public runtime, or switch provider/model there.
4. Store your key with `/provider key oci <api-key>` or set one of:
   - `Q_API_KEY`
   - `OCI_API_KEY`
   - `OCI_GENAI_API_KEY`
   If the hosted public Q issuing lane is active, that key can come from `https://qline.site`, which is now the canonical HTTPS public shell.
5. Let the first-run flow finish its live provider check, or run `/provider test oci Q` yourself.
6. If your OCI endpoint differs, set it with `/provider base-url oci <url>`.
7. Run `/status` and confirm:
   - provider = `oci`
   - model = `Q`
   - the base URL is the one you intend
   - the latest provider reachability receipt matches the active model
   - Immaculate is reachable if you expect routed execution

## IAM Option For Internal Operator Surfaces

If you are running an internal surface such as a private Discord bot or an internal command station, you can use OCI IAM instead of a bearer key:

- `OCI_CONFIG_FILE`
- `OCI_PROFILE`
- `OCI_COMPARTMENT_ID`
- `OCI_GENAI_PROJECT_ID`
- `Q_MODEL` or `OCI_MODEL`
- `Q_BASE_URL` or `OCI_BASE_URL` when you are not using the default region endpoint

Downloaded public installs should bring their own `OCI` / `Q` key. Internal operator automation can use the tenancy profile and project you control locally.

## Public Key And Usage Boundary

- downloaded public installs should generate and use their own `Q` / `OCI` key
- internal operator surfaces can use local `OCI` IAM instead
- a free internal Discord surface does not automatically grant unlimited hosted `Q` access to downloaded installs
- if you later issue hosted `Q` keys yourself, credits, monthly free usage, billing, and real rate limits must live in that issuing service

See [Q Access and Limits](Q-Access-and-Limits.md) for the operator policy boundary.

## Common Operator Commands

- `/provider use oci Q`
- `/provider key oci <api-key>`
- `/provider test oci Q`
- `/provider base-url oci <url>`
- `/provider`
- `/status`
- `/immaculate status`

## Switch Providers Safely

1. Run `/provider`.
2. Select the provider and model you intend to use.
3. Update the matching API key or auth path.
4. Run `/provider test <provider> <model>`.
5. Run `/status`.
6. Verify the provider, model, runtime, route state, worker state, and latest reachability receipt before starting heavier work.

## Verify Immaculate Reachability

Use either of these:

- the first-run setup lane inside the TUI
- `/status`
- `/immaculate status`

If Immaculate is unreachable, OpenJaws should tell you that directly instead of pretending the control plane is healthy.

## Security Notes

- Keep provider keys in local config or secure storage, never in the repository.
- Keep OCI IAM config files and private keys local. Do not commit `~/.oci`, Discord bot env files, or internal project IDs that are not meant for public use.
- Use the official tagged release lane for installed-user updates.
- Public updates now rely on GitHub Releases, `release-policy.json`, and signed per-platform manifest data.
