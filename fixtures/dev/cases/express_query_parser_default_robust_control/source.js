import web from "express";
const app=web();
app.set("query parser", "extended");
app.get("/q", (req, res) => res.json(req.query.filters));
