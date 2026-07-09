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
	/** True if the user's resolved permissions include `action`. */
	can: (action: string) => boolean;
	/** True if the user belongs to the named IAM group. */
	inGroup: (group: string) => boolean;
}

const Ctx = createContext<AuthCtx>({
	user: null,
	isLoading: true,
	isAuthenticated: false,
	refresh: () => {},
	logout: async () => {},
	can: () => false,
	inGroup: () => false,
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

	const currentUser = error ? null : (data ?? null);
	const value: AuthCtx = {
		user: currentUser,
		isLoading,
		isAuthenticated: !error && !!data,
		refresh: () => mutate(),
		logout,
		can: (action: string) => !!currentUser?.permissions?.includes(action),
		inGroup: (group: string) => !!currentUser?.groups?.includes(group),
	};

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
