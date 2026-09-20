import { z } from "zod";
import { makeRecord } from "./schema-wrapper.js";
export const schema=makeRecord(z.string());
