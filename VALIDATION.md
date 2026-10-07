# Validation

Run `mise run test` and `mise run ci:fast`; domain suite `tests/payments-domain.test.mjs` uses synthetic XTS money, source identities and trusted fixture contexts. It checks exact minor units; Observation/Payment separation; confirmation modes; source/authority/scope/revision guards; dedupe; holds and competing reserves; exact approval/aggregate limits; UNKNOWN before dispatch; no retry/release on uncertainty; replay without redispatch; partial consumption; receipt/terminal-state integrity; scoped status and atomic host-port behavior.

Thin certification executes these authoring-only tests and checks the exact committed portable plugin. Canonical MIT license remains the official scaffold bytes.

NOT_RUN: real bank/provider integration, physical store/transaction/outbox/fenced dispatcher, cross-provider aggregate/funds atomicity, actual authority/source resolution, authenticated receipts, Operator E2E and Production Ready. A fixture or pure transition does not qualify a production host. External routes stay disabled until applicable gates pass.
