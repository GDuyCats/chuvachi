import { Router } from "express";
import { parseLocale } from "../lib/locale";
import { findActiveTheme, publicTheme } from "../lib/site-theme";

export const themeRouter = Router();

// GET /api/theme?locale=vi|en - the seasonal look showing now ({ theme: null } = plain black and white).
themeRouter.get("/theme", async (req, res) => {
  const theme = await findActiveTheme();
  res.json({ theme: theme ? publicTheme(theme, parseLocale(req.query.locale)) : null });
});
