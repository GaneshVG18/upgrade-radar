import web from "express";
const app=web();
app.get("/*", (_req, res) => res.end("ok"));
