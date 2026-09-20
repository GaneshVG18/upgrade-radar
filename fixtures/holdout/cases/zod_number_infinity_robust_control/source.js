import { z as schemaLib } from "zod";
const schema=schemaLib.number();
export const result=schema.safeParse(1).success;
