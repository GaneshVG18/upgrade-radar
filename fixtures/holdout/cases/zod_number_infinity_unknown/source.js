import { z } from "zod";
import { runtimeNumber } from "./input.js";
const schema=z.number();
export const result=schema.safeParse(runtimeNumber).success;
