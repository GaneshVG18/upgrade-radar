import express from "express";
import { registerDelete } from "./routes.js";
const app=express();
registerDelete(app);
