"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
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

const StyledSelect = styled.select`
	${controlStyles}
	cursor: pointer;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%237A6E62' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 15px center;
	padding-right: 40px;
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
	return (
		<Field>
			{label && <Label>{label}</Label>}
			<StyledInput {...rest} />
		</Field>
	);
}

export function Select({
	label,
	children,
	...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
	return (
		<Field>
			{label && <Label>{label}</Label>}
			<StyledSelect {...rest}>{children}</StyledSelect>
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
