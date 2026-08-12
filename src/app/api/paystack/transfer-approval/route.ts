import {
	getPayoutV2SafetyState,
	isPayoutV2MoneyMovementAllowed,
} from "@/server/constants";
import { getPayoutByTransferIdentityDB } from "@/server/models";

export const runtime = "nodejs";

/** Paystack server-approval callback. Intentionally performs only indexed reads. */
export async function POST(req: Request): Promise<Response> {
	try {
		if (!isPayoutV2MoneyMovementAllowed(getPayoutV2SafetyState())) {
			return new Response(null, { status: 400 });
		}
		const body = (await req.json()) as {
			reference?: string;
			amount?: number;
			recipient?: string | { recipient_code?: string };
		};
		if (!body.reference || !Number.isSafeInteger(body.amount)) {
			return new Response(null, { status: 400 });
		}
		const payout = await getPayoutByTransferIdentityDB({
			reference: body.reference,
		});
		const recipientCode =
			typeof body.recipient === "string"
				? body.recipient
				: body.recipient?.recipient_code;
		if (
			!payout ||
			!["QUEUED", "PROCESSING"].includes(payout.status) ||
			payout.paystackTransferReference !== body.reference ||
			payout.totalAmountKobo !== body.amount ||
			(recipientCode &&
				recipientCode !==
					payout.recipientSnapshot.paystackRecipientCode)
		) {
			return new Response(null, { status: 400 });
		}
		return new Response(null, { status: 200 });
	} catch {
		return new Response(null, { status: 400 });
	}
}
