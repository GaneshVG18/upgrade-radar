import { z } from "zod";
export const schema=z.object({a:z.string().default("x")});
