import { z as zod } from "zod";
import { DayOfWeek } from "@/server/models";

export const dayOfWeekParamSchema = zod
	.object({
		dayOfWeek: zod.enum(DayOfWeek),
	})
	.strict();

export const upsertEntrySchema = zod
	.object({
		menuItemId: zod.string().trim().min(1),
		dayOfWeek: zod.enum(DayOfWeek),
		isOpen: zod.boolean(),
	})
	.strict();

export const bulkEntriesSchema = zod
	.object({
		entries: zod.array(upsertEntrySchema).min(1),
	})
	.strict();

export const deleteEntrySchema = zod
	.object({
		id: zod.string().trim().min(1),
	})
	.strict();
