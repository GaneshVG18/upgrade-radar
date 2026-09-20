import express from "express";

const app = express();

app.get("/search", (req, res) => {
  const filters = req.query.filters;
  res.json({ filters });
});

app.get("/*", (_req, res) => {
  res.send("legacy wildcard");
});

app.del("/legacy/:id", (_req, res) => {
  res.sendStatus(204);
});

app.get("/legacy-param/:id", (req, res) => {
  res.json({ id: req.param("id") });
});

const configured = express();
configured.set("query parser", "extended");
configured.get("/search", (req, res) => {
  res.json({ filters: req.query.filters });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

export { app, configured };
