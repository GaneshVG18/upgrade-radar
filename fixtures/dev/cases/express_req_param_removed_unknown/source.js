import express from "express";
import { readParameter } from "./params.js";
const app=express();
app.get("/u/:id",(req,res)=>res.end(String(readParameter(req,"id"))));
