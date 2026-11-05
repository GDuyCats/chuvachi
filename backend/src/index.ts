import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { healthRouter } from "./routes/health";
import { catalogRouter } from "./routes/catalog";
import { ordersRouter } from "./routes/orders";

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api", catalogRouter);
app.use("/api", ordersRouter);

// Unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Unexpected errors (Express 5 forwards errors from async handlers here)
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

// Close the server and database connections cleanly on shutdown.
async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
