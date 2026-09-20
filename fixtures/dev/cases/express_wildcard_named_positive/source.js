import express from "express";
const app=express();
app.get("/*", (_req, res) => res.end("ok"));
