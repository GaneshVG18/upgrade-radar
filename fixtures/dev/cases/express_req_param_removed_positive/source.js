import express from "express";
const app=express();
app.get("/u/:id", (req, res) => res.end(String(req.param("id"))));
