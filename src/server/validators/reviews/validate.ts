import { z } from "zod";

export const createReviewSchema = z.object({
	buyerOrderId: z.string().min(1),
	rating: z.number().int().min(1).max(5),
	comment: z.string().max(1000).optional(),
	tags: z.array(z.string()).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
