const { z }=require("zod");
export const schema=z.string().transform(v=>v.toUpperCase()).default("x");
export const output=schema.parse(undefined);
