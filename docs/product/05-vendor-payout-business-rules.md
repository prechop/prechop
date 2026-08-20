# Prechop Vendor Payout Business Rules

**Status:** Phase 2 business decisions approved on 2026-08-11. Phase 3 is not approved for
implementation.

This document records the business rules for a future completion-based vendor payout system. It
does not change the current V1 Paystack subaccount split flow, live settlement settings, checkout,
or movement of money. Transactions created under V1 must remain governed by V1.

## Approved decisions

### Payout schedule and balance handling

- Run the automated vendor payout process on business days at **10:00 AM Africa/Lagos**.
- The minimum payout is **NGN 1,000**.
- An eligible balance below NGN 1,000 rolls forward indefinitely; it is not forfeited.
- Prechop initially absorbs Paystack transfer fees and applicable stamp duty. This is the initial
  commercial decision, but the final long-term treatment remains subject to the external
  confirmations listed below.
- If the available Paystack balance cannot cover a payout, the payout remains queued. It must not
  be marked paid or failed merely because the platform balance is insufficient.

### Financially trusted completion

- Payment success, order fulfilment, and vendor payout are separate lifecycles.
- A successful buyer payment does not by itself make a vendor payout eligible.
- A normal pickup or delivery is financially trusted when handover is confirmed by either:
  - the buyer's QR code;
  - the buyer's PIN; or
  - an audited support confirmation.
- An order has a **24-hour payout grace period** after financially trusted completion.
- Payout eligibility is evaluated only after that grace period and only when there is no unresolved
  dispute, refund, no-show, failed-delivery case, or applicable payout hold.

### Exceptions and holds

- Holds are order-specific by default. A problem with one order must not automatically delay a
  vendor's other valid completed earnings.
- An unresolved buyer no-show, failed delivery, dispute, refund, or refund failure keeps the
  affected order held.
- Normal vendor suspension does not confiscate valid completed earnings and does not automatically
  freeze every otherwise valid earning. An account-wide payout hold requires a separate justified
  reason, such as suspected fraud, compromised bank details, or a legal restriction.
- A refund or other vendor liability discovered after payout becomes an auditable vendor debt or
  adjustment. Its creation, recovery, set-off, waiver, and resolution must remain traceable.

### Bank-detail changes

- A bank-detail change affects future payouts only.
- Changed details must be reverified before use.
- A payout already submitted must retain its immutable recipient and bank snapshot.
- Queued but unsent payouts must not silently switch to changed bank details; their treatment will
  be specified in the Phase 3 operational design.

## Required lifecycle separation

The future design must keep these meanings independent:

| Lifecycle | Meaning | Explicit non-meaning |
| --- | --- | --- |
| Payment | Buyer charge, failure, cancellation, or refund state | `SUCCESS` does not mean the vendor is payable or paid. |
| Order | Fulfilment and operational outcome | `COMPLETED` alone does not establish payout eligibility. |
| Vendor payout | Eligibility, hold, queue, transfer, failure, payment, or debt state | A payout transition must not rewrite payment or fulfilment history. |

## Phase 3 design concepts — not implemented

Phase 3 must include the following concepts when its detailed files, models, functions, migration,
and feature-flag plan is presented for approval:

- **`trustedCompletionAt`** — the immutable timestamp at which financially trusted completion was
  established. It must identify or reference the qualifying evidence and must not be inferred only
  from the current order status.
- **`payoutEligibleAt`** — a derived financial timestamp based on `trustedCompletionAt`, the approved
  24-hour grace period, and applicable holds or blocking conditions. It is not equivalent to
  `Order.status === COMPLETED`.

The exact persistence location and recalculation rules for these concepts are deliberately deferred
to the Phase 3 design. Their inclusion here does not authorize schema or code changes.

## Eligibility rule

Conceptually, a vendor earning may become payout-eligible only when all of the following are true:

1. The buyer payment is successfully verified.
2. The transaction belongs to the future payout model and is after the explicit migration cutoff.
3. `trustedCompletionAt` exists from an approved completion path.
4. The 24-hour grace period has elapsed, producing `payoutEligibleAt`.
5. No unresolved dispute, refund, no-show, failed delivery, or order-specific hold exists.
6. The vendor's payout destination is approved and applicable to that future payout.
7. The earning has not already been paid or included in another payout.

These conditions are cumulative. No single Payment or Order status can substitute for them.

## Migration boundary

- Existing V1 transactions remain under the current Paystack subaccount split and settlement model.
- Future completion-based payouts apply only to transactions created after an explicit migration
  cutoff and under the future enabled payment model.
- Every financial record must identify its payment/settlement model.
- A V1 transaction must never create a new vendor payable or transfer that could pay the vendor a
  second time.
- The V1 flow must not be removed or changed until Paystack approval, external confirmation, the
  Phase 3 design, reconciliation, and the migration cutoff are all approved.

## Externally pending — not finalized

The following remain open and must not be treated as approved implementation assumptions:

- Paystack approval for Manual Payouts / Settled to Balance and confirmation of the account's exact
  supported flow.
- Marketplace, custody, safeguarding, contractual, and legal treatment of money held pending vendor
  eligibility. Prechop must not describe the arrangement as escrow unless legally structured as
  escrow.
- Accounting treatment of vendor-payable liabilities, refunds, chargebacks, reserves, debt,
  adjustments, and reconciliation.
- Regulatory, tax, reporting, and vendor-contract requirements.
- The reserve methodology and amount.
- Final long-term allocation of transfer fees and stamp duty, despite the approved initial decision
  that Prechop absorbs them.
- Paystack behavior and operational requirements for balances, transfers, retries, recipient
  changes, webhooks, reversals, and bank processing.

## Vendor-facing payout promise — approved planning wording

> Completed and undisputed orders become eligible after the applicable 24-hour review period and
> are included in the next eligible business-day payout run. Balances below NGN 1,000 roll forward.
> Payouts may be delayed by account or order reviews, refunds, payout holds, Paystack balance
> availability, transfer failures, holidays, or banking processing.

This is planning wording. It must receive Paystack and legal review before publication or replacement
of the current V1 vendor settlement wording.

## Change control

- Phase 2 records business decisions only.
- Phase 3 payout models, transfer recipients, transfers, checkout migration, settlement changes,
  feature flags, and money-moving code require separate explicit approval.
- Before any Phase 3 coding, present the planned files, models, fields, functions, migration cutoff,
  reconciliation controls, test coverage, and rollback strategy for approval.
- Do not modify the current V1 payment flow or live Paystack settings without that approval.
