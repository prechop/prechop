"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import useSWR from "swr";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import type { PublicUser } from "@/types";

interface AuthCtx {
	user: PublicUser | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	refresh: () => void;
	logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
	user: null,
	isLoading: true,
	isAuthenticated: false,
	refresh: () => {},
	logout: async () => {},
});

export function useAuth(): AuthCtx {
	return useContext(Ctx);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const { data, error, isLoading, mutate } = useSWR<PublicUser>(
		"/users/me",
		fetcher,
		{ shouldRetryOnError: false, revalidateOnFocus: false },
	);

	const logout = async () => {
		try {
			await api.post("/auth/logout");
		} catch {
			// ignore
		}
		await mutate(undefined, { revalidate: false });
		router.push("/login");
	};

	const value: AuthCtx = {
		user: error ? null : (data ?? null),
		isLoading,
		isAuthenticated: !error && !!data,
		refresh: () => mutate(),
		logout,
	};

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
