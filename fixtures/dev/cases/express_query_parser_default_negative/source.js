import express from "express";
const app=express();
app.set("query parser", "extended");
app.get("/q", (req, res) => res.json(req.query.filters));
