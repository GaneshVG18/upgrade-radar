import express from "express";
const app=express();
app.get("/q", (req, res) => res.json(req.query.filters));
