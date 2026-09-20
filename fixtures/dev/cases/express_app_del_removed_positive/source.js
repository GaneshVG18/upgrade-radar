import express from "express";
const app=express();
app.del("/item/:id", (_req, res) => res.sendStatus(204));
