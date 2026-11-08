import { Router, type Response } from "express";
import { AdminRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { deleteSessionsOf, generateTemporaryPassword, hashPassword, requireAdminRole, requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";

// Staff and admin accounts. Admins only.
// Passwords are never stored or shown: a new account, or a reset, gets a one-time temporary
// password that is shown to the admin once and must be replaced at the next sign-in.
export const adminAccountsRouter = Router();
adminAccountsRouter.use(requireStaff, requireAdminRole);

const accountSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.AdminUserSelect;

type AccountRow = Prisma.AdminUserGetPayload<{ select: typeof accountSelect }>;

function toAccount(row: AccountRow) {
  return {
    ...row,
    locked: row.lockedUntil !== null && row.lockedUntil > new Date(),
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const idParam = z.coerce.number().int().positive();

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(60),
  role: z.nativeEnum(AdminRole),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.nativeEnum(AdminRole),
  isActive: z.boolean(),
});

function badRequest(res: Response, error?: z.ZodError) {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    details: error?.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) ?? [],
  });
}

async function listAccounts() {
  const rows = await prisma.adminUser.findMany({
    select: accountSelect,
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
  });
  return rows.map(toAccount);
}

// GET /api/admin/accounts
adminAccountsRouter.get("/", async (_req, res) => {
  res.json(await listAccounts());
});

// POST /api/admin/accounts - create an account; answers with its temporary password (shown once)
adminAccountsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  const temporaryPassword = generateTemporaryPassword();
  try {
    const created = await prisma.adminUser.create({
      data: { ...parsed.data, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
      select: accountSelect,
    });
    console.log(`Account ${created.email} (${created.role}) created by ${req.admin!.email}`);
    res.status(201).json({ account: toAccount(created), temporaryPassword, accounts: await listAccounts() });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "EMAIL_TAKEN" });
      return;
    }
    throw error;
  }
});

// PUT /api/admin/accounts/:id - rename, change role, switch on or off
adminAccountsRouter.put("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);

  const target = await prisma.adminUser.findUnique({ where: { id: id.data } });
  if (!target) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  const isSelf = target.id === req.admin!.id;
  const losesAdmin = target.role === "ADMIN" && target.isActive && (parsed.data.role !== "ADMIN" || !parsed.data.isActive);
  if (isSelf && losesAdmin) {
    // Stops an admin from locking themselves out by mistake.
    res.status(400).json({ error: "CANNOT_CHANGE_SELF" });
    return;
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.adminUser.update({ where: { id: target.id }, data: parsed.data });
        if (losesAdmin) {
          const admins = await tx.adminUser.count({ where: { role: "ADMIN", isActive: true } });
          if (admins === 0) throw new LastAdminError();
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof LastAdminError) {
      res.status(400).json({ error: "LAST_ADMIN" });
      return;
    }
    throw error;
  }

  // Fewer rights or switched off: sign that person out everywhere right away.
  if (losesAdmin || !parsed.data.isActive) {
    await deleteSessionsOf(target.id);
  }
  console.log(`Account ${target.email} updated by ${req.admin!.email}: ${JSON.stringify(parsed.data)}`);
  res.json(await listAccounts());
});

// POST /api/admin/accounts/:id/reset-password - new temporary password (shown once),
// unlocks the account and signs it out everywhere.
adminAccountsRouter.post("/:id/reset-password", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  if (id.data === req.admin!.id) {
    // Your own password is changed with "Change password", which asks for the current one.
    res.status(400).json({ error: "CANNOT_CHANGE_SELF" });
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  try {
    const updated = await prisma.adminUser.update({
      where: { id: id.data },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      },
      select: accountSelect,
    });
    await deleteSessionsOf(updated.id);
    console.log(`Password of ${updated.email} reset by ${req.admin!.email}`);
    res.json({ account: toAccount(updated), temporaryPassword, accounts: await listAccounts() });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
});

class LastAdminError extends Error {}
