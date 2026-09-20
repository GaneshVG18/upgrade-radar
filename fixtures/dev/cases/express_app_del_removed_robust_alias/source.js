import web from "express";
const app=web();
app.del("/item/:id", (_req, res) => res.sendStatus(204));
