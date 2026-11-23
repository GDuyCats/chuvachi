import { z } from "zod";

// Body of the "new order" calls sent after dragging a list in the admin:
// { ids: [3, 1, 2] } = the rows from top to bottom. Each row then gets sortOrder = its position.
export const listOrderSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Each id once"),
});
