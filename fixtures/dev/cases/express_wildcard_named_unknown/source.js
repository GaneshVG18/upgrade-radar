import express from "express";
import { routePattern } from "./routes.js";
const app=express();
app.get(routePattern, (_req,res)=>res.end("ok"));
