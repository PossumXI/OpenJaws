# Public Site Copy Deploy Handoff

Date: 2026-04-24

## Scope

This pass updated and validated the public marketing copy for the three public surfaces:

- qline.site
- iorch.net
- aura-genesis.org

The goal was to remove internal/operator-facing wording, stale proof-hook phrases, and founder-directed notes, then present the products in plain marketing language.

## Live Deploys

- qline.site: Netlify site `qline-site-20260415022202`, published deploy `69ead5a3ce198c2cf974d2eb`.
- iorch.net: Netlify site `immaculate-iorch-20260415022035`, published deploy `69ead453ce198c292074d301`.
- aura-genesis.org: Netlify site `aura-genesis`, published deploy `69ead2f18b51ad2842674f12`.

## Validation

- qline safe deploy passed root, `/immaculate`, `/terms`, `/robots.txt`, `/sitemap.xml`, signup, checkout, OAuth success/callback/authorize, and invalid token rejection checks.
- Live headless Chrome checks passed for qline, iorch, and aura status pages.
- qline was explicitly checked for the new OpenJaws/Q browser copy and absence of old phrases like `flight deck`, `worker state`, and `public proof hook`.
- iorch was checked for accountable AI operator positioning and absence of internal phrases like `private Asgard_Arobi`, `both truths`, and `insurer-grade`.
- aura status was checked for the public 16-system showcase, public ledger language, and closed `00` control-route boundary.

## Operational Notes

- A stale qline deployment briefly overwrote the correct bundle. The current published qline deploy listed above was redeployed after confirming no remaining qline Netlify processes were running.
- The qline canonical source is `C:\Users\Knight\Desktop\q-s-unfolding-story`, not the legacy surface.
- The iorch public source used for this pass is `C:\Users\Knight\Desktop\Immaculate\Immaculate-public-publish`.
- The aura public source used for this pass is `C:\Users\Knight\Desktop\cheeks\Asgard\Websites`.

## Remaining Blockers Outside This Pass

- PersonaPlex is not confirmed listening on its expected ports, so Viola voice routing still needs a dedicated runtime fix.
- BridgeBench full run is still memory-gated on this machine.
- W&B publishing still needs configured `WANDB_*` environment credentials.
- Discord agent file delivery, invite/user admin actions, and open web browsing behavior need a dedicated live Discord staging run before being treated as production-ready.
