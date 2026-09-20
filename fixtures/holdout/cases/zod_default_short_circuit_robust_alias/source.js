import { z as schemaLib } from "zod";
export const schema=schemaLib.string().transform(v=>v.toUpperCase()).default("x");
export const output=schema.parse(undefined);
