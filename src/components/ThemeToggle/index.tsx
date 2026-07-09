"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";

const Btn = styled.button`
	width: 38px;
	height: 38px;
	display: grid;
	place-items: center;
	border-radius: 10px;
	border: 1px solid var(--pc-border);
	background: var(--pc-surface-2);
	color: var(--pc-text);
	font-size: 17px;
	cursor: pointer;
	line-height: 1;
	transition: background var(--pc-dur) var(--pc-ease);
	&:hover {
		background: var(--pc-surface);
	}
`;

type Theme = "light" | "dark";

/** Light/dark toggle. Persists to localStorage and flips `data-theme`. */
export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme | null>(null);

	useEffect(() => {
		const attr = document.documentElement.getAttribute(
			"data-theme",
		) as Theme | null;
		const initial =
			attr ??
			(window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light");
		setTheme(initial);
	}, []);

	function toggle() {
		const next: Theme = theme === "dark" ? "light" : "dark";
		document.documentElement.setAttribute("data-theme", next);
		try {
			localStorage.setItem("pc-theme", next);
		} catch {
			// ignore (private mode)
		}
		setTheme(next);
	}

	// Render a stable placeholder until we know the theme (avoids hydration mismatch).
	return (
		<Btn
			type="button"
			onClick={toggle}
			aria-label="Toggle dark mode"
			title="Toggle dark mode"
		>
			{theme === "dark" ? "☀️" : "🌙"}
		</Btn>
	);
}
