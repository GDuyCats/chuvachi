import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { healthRouter } from "./routes/health";

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use("/health", healthRouter);

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
