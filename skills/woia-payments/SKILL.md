---
name: woia-payments
description: Observe, accept and reconcile source-qualified payments; reserve eligible funds and prepare exactly authorized payment effects without treating observations as cash.
license: MIT
---

# Payments

Use the eight actions in [the operation contract](references/PAYMENTS.md). Finance owns acceptance/reservation/effects. Installation, requests or credentials never grant payment authority.

1. Resolve authenticated Finance actor/Task, exact admitted capability/grant, current policy and Source Authority from the trusted host; never trust model-produced authority.
2. Preserve immutable PaymentObservation source namespace/account/transaction/version/Evidence. Only `payment.accept` promotes exact bound confirmation to Payment; missing policy, stale/conflicting source or unconfigured confirmation mode blocks it.
3. Distinguish provider-confirmed, competent-human-confirmed and direct-to-beneficiary confirmation. Direct beneficiary funds never invent agency custody or payout.
4. Resolve holds, eligibility, purpose and revisions. Reserve exact funds; prepare execute only with exact independent approval, aggregate limit and configured qualified adapter with embedded notifications suppressed.
5. Run [the deterministic module](scripts/payments.mjs) through a qualified atomic store/outbox. Persist UNKNOWN before dispatch. Host store/CAS/dispatcher fencing must prevent competing consumption and second dispatch.
6. Reconcile same-operation verified receipts; unknown/partial outcomes retain remaining funds and forbid retry/release. Reversal is new evidence and separate Ledger compensation, never historical overwrite.

Local support is JSON transitions, exact minor-unit arithmetic and safety guards. Physical storage/dispatcher, real account/provider integration and Operator E2E are NOT_RUN; external-effect routes remain disabled until qualification. No vendor or payment permission is implied. Customer Service/Communications owns external-person notifications.

Report action, state revision, exact candidate and attributable evidence. Never equate local fixture PASS with live execution or Production Ready.
