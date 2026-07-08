"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
	useEffect(() => {
		if (
			typeof navigator === "undefined" ||
			!("serviceWorker" in navigator)
		) {
			return;
		}
		const register = () => {
			navigator.serviceWorker.register("/sw.js").catch(() => {
				// registration is best-effort
			});
		};
		if (document.readyState === "complete") register();
		else window.addEventListener("load", register);
		return () => window.removeEventListener("load", register);
	}, []);
	return null;
}
