import { z } from "zod";
const schema=z.number();
export const result=schema.safeParse(Infinity).success;
