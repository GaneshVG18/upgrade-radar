const { z }=require("zod");
const schema=z.number();
export const result=schema.safeParse(Infinity).success;
