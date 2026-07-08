import { api } from "./api";

// SWR fetcher — returns the unwrapped `data` field of the envelope.
export const fetcher = async <T = unknown>(url: string): Promise<T> => {
	const res = await api.get(url);
	return res.data?.data as T;
};
