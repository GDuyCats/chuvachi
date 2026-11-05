import { PrismaClient } from "@prisma/client";

// A single shared Prisma client for the whole app.
// Creating many clients would open too many database connections.
export const prisma = new PrismaClient();
