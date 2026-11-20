import { Prisma, type SiteTheme } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import presets from "../content/theme-presets.json";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { parseLocale } from "../lib/locale";
import { prisma } from "../lib/prisma";
import {
  colorsSchema,
  ICONS,
  loadThemeSettings,
  MAX_EFFECT_IMAGES,
  pickActiveTheme,
  pieceSchema,
  pinnedUntil,
  publicTheme,
  readColors,
  readImages,
  readPieces,
} from "../lib/site-theme";
import { deleteImageByUrl, isOwnImageUrl } from "../lib/storage";
import { formatDateOnly, parseDateOnly, vietnamToday } from "../lib/time";

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
    effectOn: z.boolean(),
    effectPieces: z
      .array(pieceSchema)
      .max(12)
      .refine((pieces) => new Set(pieces.map((piece) => piece.kind)).size === pieces.length, "Each piece once"),
    effectImages: z
      .array(z.string().trim().max(500).refine((value) => isOwnImageUrl(value), "Upload the picture first"))
      .max(MAX_EFFECT_IMAGES),
    effectAmount: level,
    effectSpeed: level,
    effectSize: level,
    effectSizeMix: z.number().int().min(0).max(100),
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
  const { startDate, endDate, colors, effectPieces, effectImages, ...rest } = input;
  // Only the colors that were picked are kept; the others stay black and white.
  const picked = Object.fromEntries(Object.entries(colors).filter(([, value]) => value)) as Prisma.InputJsonObject;
  return {
    ...rest,
    colors: picked,
    effectPieces: effectPieces as Prisma.InputJsonArray,
    effectImages: effectImages as Prisma.InputJsonArray,
    // The old single effect is cleared so it never comes back when all pieces are removed.
    effect: "none",
    effectImageUrl: null,
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
    effectPieces: preset.effects as Prisma.InputJsonArray,
    effectOn: preset.effectOn,
    effectAmount: preset.effectAmount,
    effectSpeed: preset.effectSpeed,
    effectSize: preset.effectSize,
    effectSizeMix: preset.effectSizeMix,
    // Presets come with suggested dates, but nothing turns on until the admin ticks "follow the dates".
    scheduleOn: false,
    startDate: preset.startDate ? parseDateOnly(preset.startDate) : null,
    endDate: preset.endDate ? parseDateOnly(preset.endDate) : null,
    yearly: preset.yearly,
  };
}

function toRow(theme: SiteTheme) {
  const { effect: _effect, effectImageUrl: _effectImageUrl, ...rest } = theme;
  return {
    ...rest,
    colors: readColors(theme.colors),
    effectPieces: readPieces(theme),
    effectImages: readImages(theme),
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
  const pinned = themes.find((theme) => theme.id === settings.themePinnedId);
  const until = pinned ? pinnedUntil(pinned, settings.themePinnedAt) : null;
  return {
    themes: themes.map(toRow),
    presets: presets.map((preset) => ({ key: preset.key, group: preset.group, nameVi: preset.nameVi, nameEn: preset.nameEn, colors: preset.colors, icon: preset.icon })),
    settings: {
      themesOff: settings.themesOff,
      themePinnedId: pinned ? pinned.id : null,
      pinnedUntil: until ? formatDateOnly(until) : null, // null = on until turned off
      pinExpired: Boolean(pinned && until && vietnamToday().getTime() > until.getTime()),
      themeDefaultId: themes.some((theme) => theme.id === settings.themeDefaultId) ? settings.themeDefaultId : null,
    },
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
    const stillUsed = await prisma.siteTheme.count({
      where: { OR: [{ iconUrl: url }, { effectImageUrl: url }, { effectImages: { array_contains: [url] } }] },
    });
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
  const { id: _id, createdAt: _created, updatedAt: _updated, colors, effectPieces: _pieces, effectImages: _images, ...rest } = source;
  const copySuffix = req.body?.lang === "en" ? " (copy)" : " (bản sao)";
  const theme = await prisma.siteTheme.create({
    data: {
      ...rest,
      colors: readColors(colors) as Prisma.InputJsonObject,
      effectPieces: readPieces(source) as Prisma.InputJsonArray,
      effectImages: readImages(source) as Prisma.InputJsonArray,
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

// PUT /api/admin/themes/switches - { themesOff, themePinnedId }: all looks off, or one turned on
// by hand now (early, without waiting for its dates). It turns off by itself after its end day.
adminThemesRouter.put("/switches", async (req, res) => {
  const parsed = z
    .object({ themesOff: z.boolean(), themePinnedId: z.number().int().positive().nullable() })
    .safeParse(req.body);
  if (!parsed.success) return badRequest(res);
  const today = vietnamToday();
  if (parsed.data.themePinnedId !== null) {
    const theme = await prisma.siteTheme.findUnique({ where: { id: parsed.data.themePinnedId } });
    if (!theme) return badRequest(res, ["themePinnedId"]);
    // A one-off look whose last day has passed would turn off at once.
    const until = pinnedUntil(theme, today);
    if (until && today.getTime() > until.getTime()) return badRequest(res, ["pinEnded"]);
  }
  const data = { ...parsed.data, themePinnedAt: parsed.data.themePinnedId !== null ? today : null };
  await prisma.shopSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  res.json(await bundle());
});

// PUT /api/admin/themes/default - { themeDefaultId }: the everyday look shown whenever no holiday
// look is on (null = black and white).
adminThemesRouter.put("/default", async (req, res) => {
  const parsed = z.object({ themeDefaultId: z.number().int().positive().nullable() }).safeParse(req.body);
  if (!parsed.success) return badRequest(res);
  if (parsed.data.themeDefaultId !== null) {
    const exists = await prisma.siteTheme.count({ where: { id: parsed.data.themeDefaultId } });
    if (!exists) return badRequest(res, ["themeDefaultId"]);
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
  const kept = new Set([parsed.data.iconUrl, ...parsed.data.effectImages]);
  await removeUnusedImages([before.iconUrl, before.effectImageUrl, ...readImages(before)].filter((url) => !kept.has(url)));
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
    prisma.shopSetting.updateMany({ where: { id: 1, themeDefaultId: theme.id }, data: { themeDefaultId: null } }),
  ]);
  await removeUnusedImages([theme.iconUrl, theme.effectImageUrl, ...readImages(theme)]);
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
