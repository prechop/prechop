"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import styled from "styled-components";

const Field = styled.div`
	display: flex;
	flex-direction: column;
	gap: 6px;
`;

const Label = styled.label`
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-text-muted);
`;

const StyledInput = styled.input`
	width: 100%;
	padding: 11px 14px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface);
	color: var(--pc-text);
	font-size: 15px;
	outline: none;
	transition: border-color 0.15s ease;
	&:focus { border-color: var(--pc-color-primary); }
	&::placeholder { color: var(--pc-text-muted); }
`;

const StyledSelect = styled.select`
	width: 100%;
	padding: 11px 14px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface);
	color: var(--pc-text);
	font-size: 15px;
	outline: none;
	transition: border-color 0.15s ease;
	&:focus { border-color: var(--pc-color-primary); }
`;

const StyledTextarea = styled.textarea`
	width: 100%;
	padding: 11px 14px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface);
	color: var(--pc-text);
	font-size: 15px;
	outline: none;
	resize: vertical;
	min-height: 80px;
	&:focus { border-color: var(--pc-color-primary); }
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
