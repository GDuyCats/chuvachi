import { Router } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter = Router();

// GET /health - reports whether the API and the database are reachable.
healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});
