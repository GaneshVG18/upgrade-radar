import { z } from "zod";
import { withDefault } from "./schema-wrapper.js";
export const schema=withDefault(z.string().transform(v=>v.toUpperCase()));
