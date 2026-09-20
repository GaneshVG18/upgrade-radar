import express from "express";
import { queryParser } from "./config.js";
const app=express();
app.set("query parser", queryParser);
app.get("/q",(req,res)=>res.json(req.query.filters));
