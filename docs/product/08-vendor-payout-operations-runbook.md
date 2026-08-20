# Vendor payout operations runbook

Status: disabled V2 operational design. It does not authorize production activation.

## Normal schedule

- Payout batch: 10:00 Africa/Lagos, Monday-Friday.
- Minimum vendor total: ₦1,000; smaller balances roll indefinitely.
- Eligibility: explicit V2 Payment, verified success, trusted QR/PIN or audited support completion, 24-hour grace expired, active recipient, no refund, dispute or order hold.
- Fees: Prechop absorbs the Paystack transfer fee and qualifying stamp duty initially.

## Daily checks

1. Review eligible, held, queued, processing, paid, failed and reversed totals in the finance API.
2. Confirm the Paystack NGN balance covers payouts plus fees, stamp duty and the approved reserve.
3. Reconcile processing transfers. Webhooks are authoritative; polling is bounded recovery.
4. Investigate unknown references, amount/currency mismatches and transfers that remain non-final.

## Holds and refunds

- Hold only the affected order by default and record a reason and actor.
- Open disputes, no-shows, failed deliveries and pending/failed refunds stay held.
- Release only after the underlying case is resolved; the centralized evaluator rechecks all rules.
- If a refund completes after payout, create one immutable vendor debt adjustment linked to the refund, payment and order. Never silently edit a historical payout.

## Transfer failure or reversal

- Failed/reversed payout lines return to eligible state for a bounded retry with a new transfer reference.
- Never create a second PayoutLine for the same VendorPayable, Payment or Order.
- Escalate repeated failures and stop automatic retries before operator review.

## Emergency rollback

1. Select `EMERGENCY_V1` to classify only future Payments as V1.
2. Set the money-movement interlock to `0` and redeploy. This must not mutate existing Payment classifications.
3. Continue webhook/reconciliation reads for already-submitted transfers until every one reaches a conclusive state.
4. Do not convert V2 payments to V1, recreate subaccount splits, or pay an existing PayoutLine again.
5. Reconcile Paystack balance, Payouts, PayoutLines, VendorPayables, refunds and adjustments before resuming.

## Incident evidence

Preserve migration config version, Payment settlement snapshot, payout recipient/bank snapshot, transfer attempts, webhook payload identity, admin audit records and all linked dispute/refund ids.
