const { z }=require("zod");
export const schema=z.object({a:z.string().default("x").optional()});
