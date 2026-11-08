import { Router } from "express";
import { z } from "zod";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { salesReport } from "../lib/sales";
import { parseDateOnly } from "../lib/time";

// Sales figures. Admins only: revenue is business information.
export const adminStatsRouter = Router();
adminStatsRouter.use(requireStaff, requireAdminRole);

const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

// GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional; none = since the shop opened)
adminStatsRouter.get("/", async (req, res) => {
  const from = dateText.safeParse(req.query.from);
  const to = dateText.safeParse(req.query.to);
  if (!from.success || !to.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const fromDate = from.data ? parseDateOnly(from.data) : null;
  const toDate = to.data ? parseDateOnly(to.data) : null;
  if ((from.data && !fromDate) || (to.data && !toDate) || (fromDate && toDate && fromDate > toDate)) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  res.json(await salesReport(fromDate, toDate));
});
