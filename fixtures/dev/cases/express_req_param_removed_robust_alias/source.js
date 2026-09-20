import web from "express";
const app=web();
app.get("/u/:id", (req, res) => res.end(String(req.param("id"))));
