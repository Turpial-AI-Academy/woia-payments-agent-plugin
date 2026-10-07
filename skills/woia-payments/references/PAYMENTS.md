# Payment contract v1

Source: WOIA Real Estate `eb0a7278188b2f9968e21ed4299f08184d864cac`, ADR-0026/docs21, ADR-0027/docs22 and ADR-0029/docs24. No organization-private policy, account or vendor is bundled.

| Action | Result |
|---|---|
| payment.observe | Immutable PaymentObservation, source/Evidence retained, no cash |
| payment.accept | Immutable accepted Payment under exact source/confirmation; source transaction dedupe |
| payment.reconcile | Append same-source payment reconciliation; no historical rewrite |
| payment.reserve | Lock eligible accepted custodial funds within exact beneficiary/custody/purpose/account/currency |
| payment.execute | Persist UNKNOWN plus dispatch intent after exact approval/aggregate/qualified adapter guards |
| payment.status.observe | Scoped effect read without revision mutation |
| payment.effect.reconcile | Verified same-operation receipt; consume confirmed debit and retain partial/unknown remainder |
| payment.release-reservation | Approved release only if no unresolved effect |

`transition(state, command, context)` is pure and returns JSON-serializable new state/result/optional dispatch. `apply(store,command,resolveContext)` calls host-owned atomic persistence. Commands bind org/action/target/operation_key/expected_revision/payload. Context must be host-authenticated and current, never user/model assertions.

Money uses canonical integer string minor units plus explicit currency/scale; no floats/conversion/implicit rounding. Execute `minor` is total reserved debit **including fees**; `fee_minor` is an approved part of that total. Actual fee/rounding policy is organization-owned. Direct-to-beneficiary acceptance does not make agency cash.

Host resolver supplies current policy/grants, observation payload-bound source verification, acceptance payload-bound confirmation, Source Authority, funds revision/holds/purpose, aggregate remaining limit, independently qualified adapter/account and verified receipts. Approval binds exact payload including money/fees/beneficiary/account/custody/purpose/funds revision/provider operation, competent independent approver, actor/Task/target/policy/time/revocation. Self-grant, stale revision and altered payload fail closed.

Host `store.transaction(org,callback)` must atomically commit state/outbox or abort, serialize revisions and revalidate cross-provider funds and aggregate policy constraints. Qualified dispatcher claims once with fencing and provider idempotency key. UNKNOWN intent is persisted before network; replay never emits another dispatch. Physical adapter/store/outbox/dispatcher qualification is NOT_RUN; fixture store is not a production guarantee.

Observations and accepted Payments remain immutable. Reversal/chargeback evidence and Ledger compensation are independent; settlement documents/delivery never imply payment. No outward notification implementation exists.
