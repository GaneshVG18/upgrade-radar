import { z } from "zod";

export const preferences = z.object({
  theme: z.string().default('dark').optional(),
});

export const transformedDefault = z.string().transform((value) => value.toUpperCase()).default("raw");
export const finiteNumber = z.number();
export const stringRecord = z.record(z.string());

export const unrelated = z.object({ name: z.string() });
