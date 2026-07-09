import { z as zod } from "zod";

const optionSchema = zod
	.object({
		name: zod.string().trim().min(1).max(120),
		priceNaira: zod.number().nonnegative(),
		displayOrder: zod.number().int().min(0).optional(),
	})
	.strict();

/** Shared cross-field checks for an option group's selection rules. */
function refineGroup(
	g: {
		required?: boolean;
		minSelect?: number;
		maxSelect?: number | null;
		options: unknown[];
	},
	ctx: zod.RefinementCtx,
) {
	const min = g.minSelect ?? 0;
	if (g.required && min < 1)
		ctx.addIssue({
			code: zod.ZodIssueCode.custom,
			message: "A required group must allow at least one selection.",
			path: ["minSelect"],
		});
	if (min > g.options.length)
		ctx.addIssue({
			code: zod.ZodIssueCode.custom,
			message: "minSelect cannot exceed the number of options.",
			path: ["minSelect"],
		});
	if (g.maxSelect != null && g.maxSelect < min)
		ctx.addIssue({
			code: zod.ZodIssueCode.custom,
			message: "maxSelect cannot be less than minSelect.",
			path: ["maxSelect"],
		});
}

export const createOptionGroupSchema = zod
	.object({
		name: zod.string().trim().min(1).max(120),
		required: zod.boolean().optional(),
		minSelect: zod.number().int().min(0).optional(),
		maxSelect: zod.number().int().positive().nullish(),
		displayOrder: zod.number().int().min(0).optional(),
		options: zod.array(optionSchema).min(1).max(50),
	})
	.strict()
	.superRefine(refineGroup);

export const updateOptionGroupSchema = zod
	.object({
		name: zod.string().trim().min(1).max(120).optional(),
		required: zod.boolean().optional(),
		minSelect: zod.number().int().min(0).optional(),
		maxSelect: zod.number().int().positive().nullish(),
		displayOrder: zod.number().int().min(0).optional(),
		options: zod.array(optionSchema).min(1).max(50).optional(),
	})
	.strict()
	.superRefine((g, ctx) => {
		// Only cross-validate select rules when options are being (re)set;
		// a partial update that omits options skips option-count checks.
		if (g.options !== undefined)
			refineGroup(
				{
					required: g.required,
					minSelect: g.minSelect,
					maxSelect: g.maxSelect,
					options: g.options,
				},
				ctx,
			);
		else if (g.maxSelect != null && (g.minSelect ?? 0) > g.maxSelect)
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "maxSelect cannot be less than minSelect.",
				path: ["maxSelect"],
			});
	});

export type CreateOptionGroupInput = zod.infer<typeof createOptionGroupSchema>;
export type UpdateOptionGroupInput = zod.infer<typeof updateOptionGroupSchema>;
