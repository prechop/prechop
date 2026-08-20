# PLATFORM_BALANCE_TRANSFER_V2 activation checklist

Status: **not approved for production activation**. V1 remains the live default.

## External gates

- Paystack has upgraded Prechop to a registered business and explicitly approved Transfers / Manual Payouts / Settled to Balance.
- Legal and accounting advisers have approved the marketplace, custody, vendor-payable, tax, chargeback and safeguarding treatment.
- Reserve amount and operating account treatment are documented and approved.
- Final transfer-fee and ₦50 qualifying stamp-duty treatment is approved and disclosed.

## Technical gates

- Keep `V1_ONLY` until all checks below pass.
- Confirm live webhook HMAC verification and configure the Paystack webhook URL.
- Configure `/api/paystack/transfer-approval` as the server approval URL only after security review.
- Verify every pilot vendor has one active, reverified `VendorTransferRecipient` and that historical recipients remain retired, not overwritten.
- Reconcile all V1 payments and confirm no V1 Payment has a VendorPayable or PayoutLine.
- Run duplicate webhook/job/refund-vs-payout race tests and a test-mode pilot.
- Confirm Paystack balance monitoring covers payout amount, transfer fee, stamp duty and the externally approved reserve.
- Confirm admin IAM grants payout actions only to finance operators.
- Record the exact migration configuration version and pilot vendor/campus ids.

## Required production interlocks

All four runtime gates must be `1`; otherwise V2 classification and money movement fail closed:

1. `PLATFORM_BALANCE_TRANSFER_V2_ENABLED`
2. `PAYSTACK_MANUAL_PAYOUTS_APPROVED`
3. `PAYOUT_V2_LEGAL_ACCOUNTING_APPROVED`
4. `PLATFORM_BALANCE_TRANSFER_V2_MONEY_MOVEMENT_ENABLED`

After the gates pass, select `V2_PILOT` first. Observe at least one complete payout and reconciliation cycle before considering `V2_NEW_PAYMENTS`.

## Vendor promise (approved wording)

“Completed, undisputed orders enter the next automated business-day payout run after the 24-hour grace period, subject to the ₦1,000 minimum balance, Paystack balance availability and banking processing.”

This wording remains a draft until the external approvals above are complete. Do not publish it from this checklist.
