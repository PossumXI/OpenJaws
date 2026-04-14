# Q and OCI Setup

This is the canonical public setup page for the shipped OpenJaws runtime path.

Fresh public installs default to `OCI:Q`.

## Default Runtime

- provider: `oci`
- model: `Q`
- typical base URL: `https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1`

OpenJaws keeps provider, model, base URL, and Immaculate reachability visible so installs do not drift silently.
OpenJaws now also has a first-class live provider probe, so `configured` and `reachable` are no longer treated as the same thing.

## First Run

1. Start OpenJaws.
2. Use the built-in first-run setup lane.
3. Keep `OCI:Q` if you want the default public runtime, or switch provider/model there.
4. Store your key with `/provider key oci <api-key>` or set one of:
   - `Q_API_KEY`
   - `OCI_API_KEY`
   - `OCI_GENAI_API_KEY`
5. Let the first-run lane complete its live provider check, or run `/provider test oci Q` yourself.
6. If your OCI endpoint differs, set it with `/provider base-url oci <url>`.
7. Run `/status` and confirm:
   - provider = `oci`
   - model = `Q`
   - the base URL is the one you intend
   - the latest provider reachability receipt matches the active model
   - Immaculate is reachable if you expect routed execution

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
6. Verify provider, model, runtime, route state, worker state, and the latest reachability receipt before starting heavier work.

## Verify Immaculate Reachability

Use either of these:

- the first-run setup lane inside the TUI
- `/status`
- `/immaculate status`

If Immaculate is unreachable, OpenJaws should tell you that explicitly instead of silently pretending the control plane is healthy.

## Security Notes

- Keep provider keys in local config or secure storage, never in the repository.
- Use the official tagged release lane for installed-user updates.
- Public updates now rely on GitHub Releases, `release-policy.json`, and signed per-platform manifest data.
