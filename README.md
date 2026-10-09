# WOIA Payments v0.5.7

Shared Finance provider for attributable observation, source-qualified Payment acceptance, exact reservation and effect reconciliation. Original observations and Payments are immutable; unknown/partial outcomes retain eligible funds.

Portable resources: [skill](skills/woia-payments/SKILL.md), [contract](skills/woia-payments/references/PAYMENTS.md), [module](skills/woia-payments/scripts/payments.mjs), [envelope schema](skills/woia-payments/assets/payment-command.schema.json).

The module implements deterministic JSON transitions and an atomic host-store port. No payment vendor or outward notification is called. Trusted authority/source resolution, physical transactional store/outbox/fenced dispatcher and real provider/account adapters require later qualification; NOT_RUN. No live payment support or permission is claimed.

Official Ecosystem v0.5.7 scaffold/toolchain retained. Use `mise run bootstrap`, `mise run doctor`, `mise run ci:fast`. Certify a clean committed candidate centrally with `mise run plugin:certify-thin --repo <absolute-path>`. Certification is not publication/admission.

## Maintenance

Edit only this canonical repository. Keep `plugin.json`, `package.json` and `dev.woia/manifest.json` versions aligned. From the canonical WOIA Ecosystem repository, run `mise run plugin:certify-thin --repo <absolute-plugin-repository>`, then use its release preparation/publication tasks. Install and update consumers from immutable published artifacts; keep Project personalization in overlays.
