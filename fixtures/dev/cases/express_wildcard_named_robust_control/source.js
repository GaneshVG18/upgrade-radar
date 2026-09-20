import web from "express";
const app=web();
app.get("/*splat", (_req, res) => res.end("ok"));
