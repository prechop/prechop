# PLATFORM_BALANCE_TRANSFER_V2 Foundation

**Status:** Disabled Phase 3 foundation. No checkout migration, transfer execution, recipient
creation API, payout scheduler, or historical payment migration is authorized or active.

## Settlement-mode boundary

`Payment.settlementMode` identifies the architecture explicitly:

- `DIRECT_SUBACCOUNT_V1` — current Paystack subaccount split and automatic settlement.
- `PLATFORM_BALANCE_TRANSFER_V2` — future completion-based platform-balance transfer flow.

The current `createPaymentDB` boundary always persists `DIRECT_SUBACCOUNT_V1`; callers cannot select
V2. Historical rows without the field are classified as V1 on read without using timestamps. V2
checkout classification requires a separately approved migration change.

## Disabled financial records

- `VendorPayable` is unique by payment and buyer order. It stores the immutable vendor amount,
  trusted-completion evidence, `trustedCompletionAt`, derived `payoutEligibleAt`, current hold,
  refund/dispute links, status, and financial timestamps.
- `Payout` is an idempotent vendor-level draft/batch with immutable amount, fee, and verified
  recipient snapshot fields. Paystack transfer identifiers are present for a future phase but no
  code populates them or calls Paystack Transfers.
- `PayoutLine` is immutable and uniquely constrained by payable, payment, and order so the same
  earning cannot be allocated twice through an alternate retry path.
- `VendorTransferRecipient` versions an encrypted verified bank identity and Paystack recipient
  code. Only one version may be active per vendor. The current foundation stores metadata only and
  does not create recipients at Paystack.

All V2 model write helpers refuse to run unless `PLATFORM_BALANCE_TRANSFER_V2_ENABLED=1`.

## Eligibility boundary

`evaluatePayoutEligibility` is the single pure evaluator. Eligibility requires all of:

1. V2 feature context and explicit V2 payment classification.
2. Successful, webhook-verified payment with `paidAt`.
3. Matching payment/order/vendor identities.
4. A financially completable order outcome.
5. Explicit QR, PIN, or audited support completion evidence and `trustedCompletionAt`.
6. No unresolved dispute, refund record, or active payout hold.
7. An active, verified recipient belonging to the vendor.
8. Expiry of the 24-hour grace period, producing `payoutEligibleAt`.

`Order.status === COMPLETED` is therefore necessary for a normal completion but never sufficient.
No existing webhook, completion handler, cron, or checkout calls the evaluator or materializes a V2
payable.

## Safety interlocks

The documented defaults are closed:

```text
PLATFORM_BALANCE_TRANSFER_V2_ENABLED=0
PAYSTACK_MANUAL_PAYOUTS_APPROVED=0
PLATFORM_BALANCE_TRANSFER_V2_MONEY_MOVEMENT_ENABLED=0
```

Production boot refuses V2 enablement without the recorded Paystack approval flag. Future external
money movement must additionally pass `assertPayoutV2MoneyMovementEnabled`, which requires all
three independent conditions. Phase 3 contains no Paystack transfer implementation.

## Deferred work

- Paystack Manual Payouts / Settled to Balance approval.
- Legal, marketplace, custody, regulatory, tax, and accounting confirmation.
- Reserve methodology and amount.
- Final transfer-fee and stamp-duty policy.
- Checkout migration and explicit cutoff.
- Recipient creation/retirement workflow and bank-change cooling-period integration.
- Payable materialization from trusted completion, payout batching, balance checks, transfers,
  transfer webhooks, retries, reconciliation, and admin operations.

Each deferred money path requires a separate design review and explicit approval.
