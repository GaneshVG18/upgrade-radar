import { z } from "zod";
import { optionalWithDefault } from "./schema-wrapper.js";
export const schema=z.object({a:optionalWithDefault(z.string())});
