import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./lib/prisma";
import { healthRouter } from "./routes/health";
import { catalogRouter } from "./routes/catalog";
import { ordersRouter } from "./routes/orders";
import { adminAuthRouter } from "./routes/admin-auth";
import { adminOrdersRouter } from "./routes/admin-orders";
import { adminSettingsRouter } from "./routes/admin-settings";
import { adminProductsRouter } from "./routes/admin-products";
import { adminUploadsRouter } from "./routes/admin-uploads";
import { adminHomeRouter } from "./routes/admin-home";
import { adminAccountsRouter } from "./routes/admin-accounts";
import { adminPasswordResetRouter } from "./routes/admin-password-reset";
import { homeRouter } from "./routes/home";
import { accountRouter } from "./routes/account";
import { shopInfoRouter } from "./routes/shop-info";
import { startBackgroundJobs } from "./jobs/background-jobs";

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

// Behind a reverse proxy (Caddy on the server), trust it so we see the visitor's real IP
// for rate limiting. Locally there is no proxy, so leave TRUST_PROXY unset.
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet()); // standard security headers
// credentials: true lets the admin pages send their sign-in cookie; only our own sites are allowed.
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "20kb" })); // orders are small; reject huge bodies
app.use(cookieParser());

app.use("/health", healthRouter);
app.use("/api", catalogRouter);
app.use("/api", ordersRouter);
app.use("/api", shopInfoRouter);
app.use("/api", homeRouter);
app.use("/api", accountRouter);
app.use("/api/admin", adminAuthRouter);
app.use("/api/admin/password-reset", adminPasswordResetRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin", adminProductsRouter);
app.use("/api/admin/uploads", adminUploadsRouter);
app.use("/api/admin/accounts", adminAccountsRouter);
app.use("/api/admin", adminHomeRouter);
app.use("/api/admin", adminSettingsRouter);

// Unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Unexpected errors (Express 5 forwards errors from async handlers here).
// Details stay in the server log; the visitor only sees a generic message.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
const stopBackgroundJobs = startBackgroundJobs();

// Close the server and database connections cleanly on shutdown.
async function shutdown(): Promise<void> {
  stopBackgroundJobs();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
