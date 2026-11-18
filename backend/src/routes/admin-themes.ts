import { Prisma, type SiteTheme } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import presets from "../content/theme-presets.json";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { parseLocale } from "../lib/locale";
import { prisma } from "../lib/prisma";
import {
  colorsSchema,
  EFFECTS,
  ICONS,
  loadThemeSettings,
  pickActiveTheme,
  publicTheme,
  readColors,
} from "../lib/site-theme";
import { deleteImageByUrl, isOwnImageUrl } from "../lib/storage";
import { formatDateOnly, parseDateOnly } from "../lib/time";

// Seasonal looks: list, create (empty or from a ready-made preset), edit, copy, delete, order,
// and the "turn on now" / "all off" switches. Admins only.
export const adminThemesRouter = Router();
adminThemesRouter.use(requireStaff, requireAdminRole);

type Preset = (typeof presets)[number];

function badRequest(res: Response, fields?: string[]): void {
  res.status(400).json({ error: "VALIDATION_ERROR", details: (fields ?? []).map((field) => ({ field })) });
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

// A page of this site without the language ("/news") or a full https link.
const linkUrl = optionalText(300).refine(
  (value) => !value || /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value),
  "Use a page like /news or a link starting with https://",
);
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .refine((value) => !value || isOwnImageUrl(value), "Upload the picture first");
const dateText = z
  .string()
  .nullable()
  .refine((value) => value === null || parseDateOnly(value) !== null, "Use the format YYYY-MM-DD");
const level = z.number().int().min(10).max(100);

const themeSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    colors: colorsSchema,
    messageVi: optionalText(400),
    messageEn: optionalText(400),
    linkUrl,
    icon: z.enum(ICONS).nullable(),
    iconUrl: imageUrl,
    effect: z.enum(EFFECTS),
    effectOn: z.boolean(),
    effectImageUrl: imageUrl,
    effectAmount: level,
    effectSpeed: level,
    effectSize: level,
    effectAllPages: z.boolean(),
    scheduleOn: z.boolean(),
    startDate: dateText,
    endDate: dateText,
    yearly: z.boolean(),
  })
  .superRefine((theme, ctx) => {
    if (theme.scheduleOn && (!theme.startDate || !theme.endDate)) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "Pick both days" });
    }
    // Yearly dates may cross New Year (20 Dec - 5 Jan); one-off dates must be in order.
    if (!theme.yearly && theme.startDate && theme.endDate && theme.startDate > theme.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "The last day is before the first day" });
    }
  });
type ThemeInput = z.infer<typeof themeSchema>;

const idParam = z.coerce.number().int().positive();

function toData(input: ThemeInput) {
  const { startDate, endDate, colors, ...rest } = input;
  // Only the colors that were picked are kept; the others stay black and white.
  const picked = Object.fromEntries(Object.entries(colors).filter(([, value]) => value)) as Prisma.InputJsonObject;
  return {
    ...rest,
    colors: picked,
    startDate: startDate ? parseDateOnly(startDate) : null,
    endDate: endDate ? parseDateOnly(endDate) : null,
  };
}

function presetData(preset: Preset, lang: "vi" | "en") {
  return {
    name: lang === "en" ? preset.nameEn : preset.nameVi,
    colors: preset.colors as Prisma.InputJsonObject,
    messageVi: preset.messageVi,
    messageEn: preset.messageEn,
    linkUrl: preset.linkUrl,
    icon: preset.icon,
    effect: preset.effect,
    effectOn: preset.effectOn,
    effectAmount: preset.effectAmount,
    effectSpeed: preset.effectSpeed,
    effectSize: preset.effectSize,
    // Presets come with suggested dates, but nothing turns on until the admin ticks "follow the dates".
    scheduleOn: false,
    startDate: preset.startDate ? parseDateOnly(preset.startDate) : null,
    endDate: preset.endDate ? parseDateOnly(preset.endDate) : null,
    yearly: preset.yearly,
  };
}

function toRow(theme: SiteTheme) {
  return {
    ...theme,
    colors: readColors(theme.colors),
    startDate: theme.startDate ? formatDateOnly(theme.startDate) : null,
    endDate: theme.endDate ? formatDateOnly(theme.endDate) : null,
  };
}

async function bundle() {
  const [themes, settings] = await Promise.all([
    prisma.siteTheme.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    loadThemeSettings(),
  ]);
  const active = pickActiveTheme(themes, settings);
  return {
    themes: themes.map(toRow),
    presets: presets.map((preset) => ({ key: preset.key, nameVi: preset.nameVi, nameEn: preset.nameEn, colors: preset.colors, icon: preset.icon })),
    settings,
    activeId: active?.id ?? null,
  };
}

async function nextSortOrder(): Promise<number> {
  const last = await prisma.siteTheme.aggregate({ _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

// Uploaded pictures no longer used by any look are removed from storage.
async function removeUnusedImages(urls: (string | null)[]): Promise<void> {
  for (const url of urls) {
    if (!url) continue;
    const stillUsed = await prisma.siteTheme.count({ where: { OR: [{ iconUrl: url }, { effectImageUrl: url }] } });
    if (stillUsed === 0) await deleteImageByUrl(url).catch(() => undefined);
  }
}

// GET /api/admin/themes - all looks, the presets, the switches and which look shows now.
adminThemesRouter.get("/", async (_req, res) => {
  res.json(await bundle());
});

// POST /api/admin/themes - a new look: { preset: "christmas", lang } copies a preset, otherwise a blank look.
adminThemesRouter.post("/", async (req, res) => {
  const parsed = z.object({ preset: z.string().max(40).nullable(), lang: z.enum(["vi", "en"]) }).safeParse(req.body);
  if (!parsed.success) return badRequest(res);
  const { preset: key, lang } = parsed.data;
  const preset = key ? presets.find((item) => item.key === key) : null;
  if (key && !preset) return badRequest(res, ["preset"]);
  const data = preset ? presetData(preset, lang) : { name: lang === "en" ? "New look" : "Giao diện mới" };
  const theme = await prisma.siteTheme.create({ data: { ...data, sortOrder: await nextSortOrder() } });
  res.status(201).json({ ...(await bundle()), createdId: theme.id });
});

// POST /api/admin/themes/:id/copy - a copy of a look (e.g. last year's Christmas), placed at the end.
adminThemesRouter.post("/:id/copy", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const source = await prisma.siteTheme.findUnique({ where: { id: id.data } });
  if (!source) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const { id: _id, createdAt: _created, updatedAt: _updated, colors, ...rest } = source;
  const copySuffix = req.body?.lang === "en" ? " (copy)" : " (bản sao)";
  const theme = await prisma.siteTheme.create({
    data: {
      ...rest,
      colors: readColors(colors) as Prisma.InputJsonObject,
      name: `${source.name}${copySuffix}`.slice(0, 60),
      scheduleOn: false, // a copy never turns on by itself until the admin checks its dates
      sortOrder: await nextSortOrder(),
    },
  });
  res.status(201).json({ ...(await bundle()), createdId: theme.id });
});

// PUT /api/admin/themes/order - { ids: [3, 1, 2] }: the list order, which also decides
// which look wins when dates overlap.
adminThemesRouter.put("/order", async (req, res) => {
  const parsed = z.object({ ids: z.array(z.number().int().positive()).max(200) }).safeParse(req.body);
  if (!parsed.success) return badRequest(res);
  await prisma.$transaction(
    parsed.data.ids.map((id, index) => prisma.siteTheme.updateMany({ where: { id }, data: { sortOrder: index } })),
  );
  res.json(await bundle());
});

// PUT /api/admin/themes/switches - { themesOff, themePinnedId }: all looks off, or one turned on by hand.
adminThemesRouter.put("/switches", async (req, res) => {
  const parsed = z
    .object({ themesOff: z.boolean(), themePinnedId: z.number().int().positive().nullable() })
    .safeParse(req.body);
  if (!parsed.success) return badRequest(res);
  if (parsed.data.themePinnedId !== null) {
    const exists = await prisma.siteTheme.count({ where: { id: parsed.data.themePinnedId } });
    if (!exists) return badRequest(res, ["themePinnedId"]);
  }
  await prisma.shopSetting.upsert({ where: { id: 1 }, create: { id: 1, ...parsed.data }, update: parsed.data });
  res.json(await bundle());
});

// PUT /api/admin/themes/:id - save a look.
adminThemesRouter.put("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = themeSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) {
    return badRequest(res, [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  }
  const before = await prisma.siteTheme.findUnique({ where: { id: id.data } });
  if (!before) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await prisma.siteTheme.update({ where: { id: id.data }, data: toData(parsed.data) });
  await removeUnusedImages(
    [before.iconUrl, before.effectImageUrl].filter((url) => url !== parsed.data.iconUrl && url !== parsed.data.effectImageUrl),
  );
  res.json(await bundle());
});

// DELETE /api/admin/themes/:id
adminThemesRouter.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const theme = await prisma.siteTheme.findUnique({ where: { id: id.data } });
  if (!theme) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await prisma.$transaction([
    prisma.siteTheme.delete({ where: { id: theme.id } }),
    // A look turned on by hand that is deleted is turned off too.
    prisma.shopSetting.updateMany({ where: { id: 1, themePinnedId: theme.id }, data: { themePinnedId: null } }),
  ]);
  await removeUnusedImages([theme.iconUrl, theme.effectImageUrl]);
  res.json(await bundle());
});

// GET /api/admin/themes/:id/preview?locale=vi - a look as the shop pages would get it, so an
// admin can try it on the real site before customers see it.
adminThemesRouter.get("/:id/preview", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const theme = await prisma.siteTheme.findUnique({ where: { id: id.data } });
  if (!theme) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(publicTheme(theme, parseLocale(req.query.locale)));
});
