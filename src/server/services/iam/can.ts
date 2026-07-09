import type { IPolicyStatement } from "../../models";

/** Context available to policy conditions & resource matching. */
export interface PermissionContext {
	/** Attributes of the acting user, e.g. `{ campusId }`. */
	user?: Record<string, string | undefined>;
	/** Attributes of the target resource, e.g. `{ campusId, id }`. */
	resource?: Record<string, string | undefined>;
	/** Convenience: the resource id, matched against statement `resources`. */
	resourceId?: string;
}

/**
 * Does an action pattern match a concrete action?
 * - `*` matches everything.
 * - `resource:*` (or any `prefix:*`) matches every action under that prefix,
 *   including deeper ones (`iam:*` matches `iam:user:read`).
 * - otherwise an exact match is required.
 */
export function matchAction(pattern: string, action: string): boolean {
	if (pattern === "*") return true;
	if (pattern.endsWith(":*")) {
		const prefix = pattern.slice(0, -1); // keep trailing ":" → "iam:"
		return action.startsWith(prefix);
	}
	return pattern === action;
}

function matchResource(patterns: string[] | undefined, id?: string): boolean {
	if (!patterns || patterns.length === 0) return true; // all resources
	if (!id) return false;
	return patterns.some((p) =>
		p === "*"
			? true
			: p.endsWith("*")
				? id.startsWith(p.slice(0, -1))
				: p === id,
	);
}

function resolveExpected(
	expr: string,
	ctx: PermissionContext,
): string | undefined {
	if (expr.startsWith("$user.")) return ctx.user?.[expr.slice(6)];
	if (expr.startsWith("$resource.")) return ctx.resource?.[expr.slice(10)];
	return expr; // literal
}

function conditionHolds(
	condition: Record<string, string> | undefined,
	ctx: PermissionContext,
): boolean {
	if (!condition) return true;
	for (const [key, expr] of Object.entries(condition)) {
		const expected = resolveExpected(expr, ctx);
		const actual = ctx.resource?.[key];
		if (expected === undefined || actual === undefined) return false;
		if (String(expected) !== String(actual)) return false;
	}
	return true;
}

function statementApplies(
	stmt: IPolicyStatement,
	action: string,
	ctx: PermissionContext,
): boolean {
	if (!stmt.actions.some((p) => matchAction(p, action))) return false;
	if (!matchResource(stmt.resources, ctx.resourceId)) return false;
	if (!conditionHolds(stmt.condition, ctx)) return false;
	return true;
}

/**
 * Evaluate whether the given set of policy statements permits `action` in
 * `ctx`. Semantics mirror AWS IAM: an explicit Deny always wins; otherwise an
 * Allow grants; with no matching statement the result is an implicit deny.
 */
export function can(
	statements: IPolicyStatement[],
	action: string,
	ctx: PermissionContext = {},
): boolean {
	let allowed = false;
	for (const stmt of statements) {
		if (!statementApplies(stmt, action, ctx)) continue;
		if (stmt.effect === "Deny") return false; // explicit deny wins
		allowed = true;
	}
	return allowed;
}

/**
 * Flatten statements to the concrete action strings a subject is *potentially*
 * allowed (ignoring resource/condition narrowing and `*` expansion). Used only
 * for building the client-side permission list for UI gating — never for
 * server-side authorization, which always goes through `can()`.
 */
export function listAllowedActions(
	statements: IPolicyStatement[],
	catalog: string[],
): string[] {
	const denied = new Set<string>();
	const allowed = new Set<string>();
	for (const stmt of statements) {
		for (const a of catalog) {
			if (!stmt.actions.some((p) => matchAction(p, a))) continue;
			if (stmt.effect === "Deny") denied.add(a);
			else allowed.add(a);
		}
	}
	return catalog.filter((a) => allowed.has(a) && !denied.has(a));
}
