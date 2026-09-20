import web from "express";
const app=web();
app.get("/q", (req, res) => res.json(req.query.filters));
