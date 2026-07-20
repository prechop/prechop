import "server-only";
import { NextResponse } from "next/server";
import { getErrorResponse, NODE_ENV } from "../constants";

export interface IResponseData<T> {
	code: number;
	message?: string | null;
	data?: T | null;
}

export function ok<T>(
	data: T,
	message: string | null = null,
	code = 200,
): NextResponse<IResponseData<T>> {
	return NextResponse.json({ code, message, data }, { status: code });
}

export function created<T>(
	data: T,
	message: string | null = "Created",
): NextResponse<IResponseData<T>> {
	return NextResponse.json({ code: 201, message, data }, { status: 201 });
}

export function fail(
	code: number,
	message: string,
): NextResponse<IResponseData<null>> {
	return NextResponse.json({ code, message, data: null }, { status: code });
}

export function handleError(error: unknown): NextResponse<IResponseData<null>> {
	const err = error as Error;
	const result = getErrorResponse(err);
	if (result?.code) {
		const message =
			NODE_ENV === "production" || result.code < 500
				? (result.message ?? "Error")
				: (err?.message ?? result.message ?? "Error");
		return NextResponse.json(
			{
				code: result.code,
				message,
				appCode: result.appCode,
				data: null,
			},
			{ status: result.code },
		);
	}

	const message =
		NODE_ENV === "production"
			? "Internal Server Error"
			: (err?.message ?? "Internal Server Error");

	return NextResponse.json(
		{ code: 500, message, data: null },
		{ status: 500 },
	);
}
