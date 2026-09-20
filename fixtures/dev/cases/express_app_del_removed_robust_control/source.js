import web from "express";
const app=web();
app.delete("/item/:id", (_req, res) => res.sendStatus(204));
