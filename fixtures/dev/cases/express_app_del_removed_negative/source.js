import express from "express";
const app=express();
app.delete("/item/:id", (_req, res) => res.sendStatus(204));
