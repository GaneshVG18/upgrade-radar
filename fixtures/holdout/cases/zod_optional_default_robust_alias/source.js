import { z as schemaLib } from "zod";
export const schema=schemaLib.object({a:schemaLib.string().default("x").optional()});
