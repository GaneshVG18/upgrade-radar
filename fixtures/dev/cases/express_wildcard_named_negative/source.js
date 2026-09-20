import express from "express";
const app=express();
app.get("/*splat", (_req, res) => res.end("ok"));
