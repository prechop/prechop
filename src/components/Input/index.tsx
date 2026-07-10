"use client";

import {
	Children,
	type CSSProperties,
	type InputHTMLAttributes,
	isValidElement,
	type ReactNode,
	useEffect,
	useId,
	useState,
} from "react";
import ReactSelect, { type StylesConfig } from "react-select";
import styled from "styled-components";

const Field = styled.div`
	display: flex;
	flex-direction: column;
	gap: 7px;
`;

const Label = styled.label`
	font-size: 13px;
	font-weight: 700;
	color: var(--pc-text);
	letter-spacing: -0.01em;
`;

const controlStyles = `
	width: 100%;
	padding: 12px 15px;
	border: 1.5px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface);
	color: var(--pc-text);
	font-size: 15px;
	font-family: inherit;
	outline: none;
	transition: border-color var(--pc-dur) var(--pc-ease), box-shadow var(--pc-dur) var(--pc-ease);
	&:focus {
		border-color: var(--pc-color-primary);
		box-shadow: 0 0 0 4px var(--pc-color-primary-50);
	}
	&::placeholder { color: var(--pc-text-faint); }
	&:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const StyledInput = styled.input`
	${controlStyles}
`;

const StyledTextarea = styled.textarea`
	${controlStyles}
	resize: vertical;
	min-height: 96px;
	line-height: 1.55;
`;

export function Input({
	label,
	...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
	// No field in this app accepts a negative number (prices, quantities,
	// counts, fees, TTLs, percentages — all ≥ 0). For `type="number"` inputs we
	// therefore floor the value at 0 by default and strip any negative sign the
	// user manages to type or paste, so a negative can never reach component
	// state. Callers that need a higher floor (e.g. a max-quantity of at least 1)
	// can still pass their own `min`; only the anti-negative sanitising is forced.
	if (rest.type === "number") {
		const { min, onChange, onKeyDown, ...numberRest } = rest;
		return (
			<Field>
				{label && <Label>{label}</Label>}
				<StyledInput
					{...numberRest}
					type="number"
					min={min ?? 0}
					onKeyDown={(e) => {
						// Block the characters that introduce a negative value
						// (or exponent) before they ever land in the field.
						if (e.key === "-" || e.key === "e" || e.key === "E")
							e.preventDefault();
						onKeyDown?.(e);
					}}
					onChange={(e) => {
						// Belt-and-suspenders for paste/spinner/programmatic input:
						// drop any minus sign so the stored value stays ≥ 0.
						if (e.target.value.includes("-"))
							e.target.value = e.target.value.replace(/-/g, "");
						onChange?.(e);
					}}
				/>
			</Field>
		);
	}
	return (
		<Field>
			{label && <Label>{label}</Label>}
			<StyledInput {...rest} />
		</Field>
	);
}

/* -------------------------------------------------------------------- Select */

type SelectOption = { value: string; label: string; node: ReactNode };

/** Flatten a React node to its plain-text content, for react-select's
 *  string-based option filtering while `node` carries the rich rendering. */
function nodeToText(node: ReactNode): string {
	if (node === null || node === undefined || typeof node === "boolean")
		return "";
	if (typeof node === "string" || typeof node === "number")
		return String(node);
	if (Array.isArray(node)) return node.map(nodeToText).join("");
	if (isValidElement(node))
		return nodeToText((node.props as { children?: ReactNode }).children);
	return "";
}

/** Read `<option>` children (arrays/fragments from `.map()` are flattened by
 *  `Children.toArray`) into react-select options. */
function optionsFromChildren(children: ReactNode): SelectOption[] {
	return Children.toArray(children)
		.filter((c) => isValidElement(c) && c.type === "option")
		.map((c) => {
			const props = (
				c as { props: { value?: unknown; children?: ReactNode } }
			).props;
			return {
				value: String(props.value ?? ""),
				label: nodeToText(props.children),
				node: props.children,
			};
		});
}

const selectStyles: StylesConfig<SelectOption, false> = {
	control: (base, state) => ({
		...base,
		minHeight: 48,
		width: "100%",
		backgroundColor: "var(--pc-surface)",
		borderWidth: 1.5,
		borderStyle: "solid",
		borderColor: state.isFocused
			? "var(--pc-color-primary)"
			: "var(--pc-border)",
		borderRadius: "var(--pc-radius-sm)",
		boxShadow: state.isFocused
			? "0 0 0 4px var(--pc-color-primary-50)"
			: "none",
		opacity: state.isDisabled ? 0.6 : 1,
		cursor: state.isDisabled ? "not-allowed" : "pointer",
		transition:
			"border-color var(--pc-dur) var(--pc-ease), box-shadow var(--pc-dur) var(--pc-ease)",
		"&:hover": {
			borderColor: state.isFocused
				? "var(--pc-color-primary)"
				: "var(--pc-border)",
		},
	}),
	valueContainer: (base) => ({ ...base, padding: "2px 15px" }),
	singleValue: (base) => ({ ...base, color: "var(--pc-text)", fontSize: 15 }),
	input: (base) => ({ ...base, color: "var(--pc-text)", fontSize: 15 }),
	placeholder: (base) => ({
		...base,
		color: "var(--pc-text-faint)",
		fontSize: 15,
	}),
	indicatorSeparator: () => ({ display: "none" }),
	dropdownIndicator: (base, state) => ({
		...base,
		color: "var(--pc-text-faint)",
		paddingRight: 12,
		transition: "transform var(--pc-dur) var(--pc-ease)",
		transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : "none",
		"&:hover": { color: "var(--pc-text-muted)" },
	}),
	menu: (base) => ({
		...base,
		marginTop: 6,
		backgroundColor: "var(--pc-surface)",
		border: "1px solid var(--pc-border)",
		borderRadius: "var(--pc-radius-sm)",
		boxShadow: "var(--pc-shadow)",
		overflow: "hidden",
	}),
	menuPortal: (base) => ({ ...base, zIndex: 9999 }),
	option: (base, state) => ({
		...base,
		fontSize: 15,
		cursor: "pointer",
		color: state.isSelected ? "var(--pc-text-inverse)" : "var(--pc-text)",
		backgroundColor: state.isSelected
			? "var(--pc-color-primary)"
			: state.isFocused
				? "var(--pc-color-primary-50)"
				: "transparent",
		"&:active": {
			backgroundColor: state.isSelected
				? "var(--pc-color-primary)"
				: "var(--pc-color-primary-50)",
		},
	}),
	noOptionsMessage: (base) => ({ ...base, color: "var(--pc-text-muted)" }),
};

export function Select({
	label,
	children,
	value,
	onChange,
	disabled,
	style,
	className,
	placeholder = "Select…",
	name,
	required,
}: {
	label?: string;
	children?: ReactNode;
	value?: string | number;
	/** Kept event-shaped so existing `(e) => e.target.value` handlers work. */
	onChange?: (event: { target: { value: string } }) => void;
	disabled?: boolean;
	style?: CSSProperties;
	className?: string;
	placeholder?: string;
	name?: string;
	required?: boolean;
}) {
	const generatedId = useId();
	const inputId = `${generatedId}-select`;

	// Portal the menu to <body> so it escapes overflow/stacking contexts.
	// Only client-side (menu is closed on the server, so no hydration diff).
	const [menuPortalTarget, setMenuPortalTarget] = useState<
		HTMLElement | undefined
	>(undefined);
	useEffect(() => {
		setMenuPortalTarget(document.body);
	}, []);

	const options = optionsFromChildren(children);
	const selected =
		options.find((o) => o.value === String(value ?? "")) ?? null;

	return (
		<Field className={className} style={style}>
			{label && <Label htmlFor={inputId}>{label}</Label>}
			<ReactSelect<SelectOption, false>
				instanceId={generatedId}
				inputId={inputId}
				name={name}
				required={required}
				isDisabled={disabled}
				options={options}
				value={selected}
				placeholder={placeholder}
				onChange={(option) =>
					onChange?.({
						target: { value: option ? option.value : "" },
					})
				}
				formatOptionLabel={(option) => option.node}
				menuPortalTarget={menuPortalTarget}
				menuPosition="fixed"
				styles={selectStyles}
			/>
		</Field>
	);
}

export function Textarea({
	label,
	...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
	return (
		<Field>
			{label && <Label>{label}</Label>}
			<StyledTextarea {...rest} />
		</Field>
	);
}

export default Input;
