import { z } from "zod";

export const preferences = z.object({
  theme: z.string().default('dark').optional(),
});

export const transformedDefault = z.string().transform((value) => value.toUpperCase()).default("raw");
export const transformedDefaultOutput = transformedDefault.parse(undefined);
export const finiteNumber = z.number();
export const finiteNumberAcceptsInfinity = finiteNumber.safeParse(Infinity).success;
export const stringRecord = z.record(z.string());

export const unrelated = z.object({ name: z.string() });
