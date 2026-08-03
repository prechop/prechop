"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const SAVED_KITCHENS_KEY = "pch-saved-kitchens";
const SAVED_LISTINGS_KEY = "pch-favourite-listings";
const SAVED_EVENT = "prechop:saved-collections";

function readIds(key: string): string[] {
	if (typeof window === "undefined") return [];
	try {
		const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
		return Array.isArray(parsed)
			? parsed.filter((id): id is string => typeof id === "string")
			: [];
	} catch {
		return [];
	}
}

function writeIds(key: string, ids: string[]) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, JSON.stringify(ids));
	window.dispatchEvent(new CustomEvent(SAVED_EVENT));
}

function useSavedIds(key: string) {
	const [ids, setIds] = useState<string[]>([]);

	useEffect(() => {
		const sync = () => setIds(readIds(key));
		sync();
		window.addEventListener("storage", sync);
		window.addEventListener(SAVED_EVENT, sync);
		return () => {
			window.removeEventListener("storage", sync);
			window.removeEventListener(SAVED_EVENT, sync);
		};
	}, [key]);

	const saved = useMemo(() => new Set(ids), [ids]);
	const toggle = useCallback(
		(id: string) => {
			const current = readIds(key);
			const next = current.includes(id)
				? current.filter((savedId) => savedId !== id)
				: [...current, id];
			writeIds(key, next);
			setIds(next);
		},
		[key],
	);

	return { ids, count: ids.length, saved, toggle };
}

export function useSavedKitchens() {
	return useSavedIds(SAVED_KITCHENS_KEY);
}

export function useSavedListings() {
	return useSavedIds(SAVED_LISTINGS_KEY);
}
