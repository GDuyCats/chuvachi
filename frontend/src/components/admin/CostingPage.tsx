"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  adminApi,
  AdminApiError,
  type CostingBundle,
  type Ingredient,
  type IngredientInput,
  type IngredientKind,
  type ProductCost,
  type SoldCosts,
} from "@/lib/admin-api";
import { formatPrice } from "@/lib/format";
import { addDaysText, vietnamTodayText } from "@/lib/shop-date";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { useToast } from "./Toast";

type Tab = "margins" | "recipes" | "ingredients";
const LOW_MARGIN = 40; // percent; below this the row is flagged

// Cost of each cake from its recipe, compared with the selling price.
export function CostingPage() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const c = t.costing;
  const [data, setData] = useState<CostingBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("margins");
  const [productId, setProductId] = useState<number | null>(null); // product open in the recipes tab

  useEffect(() => {
    adminApi
      .getCosting()
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) router.replace("/admin/login");
        else setFailed(true);
      });
  }, [router]);

  function openRecipes(id: number) {
    setProductId(id);
    setTab("recipes");
    window.scrollTo({ top: 0 });
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "margins", label: c.tabs.margins },
    { key: "recipes", label: c.tabs.recipes },
    { key: "ingredients", label: c.tabs.ingredients },
  ];

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{c.title}</h1>
        <p className="text-sm text-muted">{c.hint}</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`min-h-11 border-[1.5px] border-black px-4 text-sm font-bold ${tab === item.key ? "bg-black text-white" : "bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {failed && <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{c.loadError}</p>}
      {!data && !failed && <AdminRowsSkeleton label={c.loading} />}
      {data && tab === "margins" && <MarginsTab data={data} onOpenRecipes={openRecipes} />}
      {data && tab === "recipes" && (
        <RecipesTab data={data} productId={productId ?? data.products[0]?.id ?? null} onProduct={setProductId} onSaved={setData} onGoIngredients={() => setTab("ingredients")} />
      )}
      {data && tab === "ingredients" && <IngredientsTab data={data} onSaved={setData} />}
    </div>
  );
}

// ---------- Margins ----------

function MarginsTab({ data, onOpenRecipes }: { data: CostingBundle; onOpenRecipes: (id: number) => void }) {
  const { t, lang } = useAdminI18n();
  const c = t.costing;
  const money = (n: number) => formatPrice(n, lang);
  const name = (item: { nameVi: string; nameEn: string }) => (lang === "vi" ? item.nameVi : item.nameEn);

  return (
    <div className="flex flex-col gap-5">
      {data.ingredients.length === 0 && <p className="border-[1.5px] border-black bg-white p-4 text-sm">{c.startHint}</p>}
      {data.products
        .filter((p) => p.isActive)
        .map((product) => {
          const flavorName = (id: number | null) => name(product.flavors.find((f) => f.optionId === id) ?? product);
          const packName = (id: number | null) => {
            const pack = product.packages.find((p) => p.optionId === id);
            return pack ? name(pack) : "";
          };
          return (
            <section key={product.id} className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{name(product)}</h2>
                <button type="button" onClick={() => onOpenRecipes(product.id)} className="min-h-9 text-sm font-semibold underline">
                  {c.editRecipes} →
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-black text-left text-xs uppercase tracking-wider text-muted">
                      {product.hasFlavors && <th className="py-2 pr-3">{c.flavor}</th>}
                      <th className="py-2 pr-3">{c.pack}</th>
                      <th className="py-2 pr-3 text-right">{c.price}</th>
                      <th className="py-2 pr-3 text-right">{c.cost}</th>
                      <th className="py-2 pr-3 text-right">{c.profit}</th>
                      <th className="py-2 text-right">{c.margin}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.rows.map((row) => {
                      const low = row.margin !== null && row.margin < LOW_MARGIN;
                      return (
                        <tr key={`${row.flavorOptionId}-${row.packageOptionId}`} className="border-b border-[#eeeeee]">
                          {product.hasFlavors && <td className="py-2 pr-3">{flavorName(row.flavorOptionId)}</td>}
                          <td className="py-2 pr-3">
                            {packName(row.packageOptionId)}
                            {row.missingPackaging && row.cost !== null && (
                              <span className="ml-1.5 text-xs text-muted">({c.noPackaging})</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">{money(row.price)}</td>
                          <td className="py-2 pr-3 text-right">{row.cost === null ? <span className="text-muted">{c.noRecipe}</span> : money(row.cost)}</td>
                          <td className={`py-2 pr-3 text-right font-semibold ${row.profit !== null && row.profit < 0 ? "underline decoration-2" : ""}`}>
                            {row.profit === null ? "—" : `${row.profit < 0 ? "−" : ""}${money(Math.abs(row.profit))}`}
                          </td>
                          <td className="py-2 text-right">
                            {row.margin === null ? (
                              "—"
                            ) : (
                              <span className={low ? "bg-black px-1.5 py-0.5 font-bold text-white" : "font-semibold"}>{row.margin}%</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      <p className="text-xs text-muted">{c.marginNote.replace("{percent}", String(LOW_MARGIN))}</p>
      <SoldSection />
    </div>
  );
}

type Preset = "month" | "30" | "lastMonth" | "all";

function presetRange(preset: Preset): { from: string | null; to: string | null } {
  const today = vietnamTodayText();
  if (preset === "30") return { from: addDaysText(today, -29), to: today };
  if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (preset === "lastMonth") {
    const firstThis = `${today.slice(0, 8)}01`;
    const lastPrev = addDaysText(firstThis, -1);
    return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
  }
  return { from: null, to: null };
}

// Estimated profit of what was actually sold, using today's recipes and prices.
function SoldSection() {
  const { t, lang } = useAdminI18n();
  const c = t.costing;
  const [preset, setPreset] = useState<Preset>("month");
  const [sold, setSold] = useState<SoldCosts | null>(null);
  const [failed, setFailed] = useState(false);
  const money = (n: number) => formatPrice(Math.abs(n), lang);

  useEffect(() => {
    let active = true;
    const range = presetRange(preset);
    adminApi
      .soldCosts(range.from, range.to)
      .then((result) => {
        if (!active) return;
        setSold(result);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [preset]);

  const presets: { key: Preset; label: string }[] = [
    { key: "month", label: c.presets.month },
    { key: "30", label: c.presets.days30 },
    { key: "lastMonth", label: c.presets.lastMonth },
    { key: "all", label: c.presets.all },
  ];

  return (
    <section className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-4">
      <h2 className="font-display text-2xl uppercase tracking-wide">{c.soldTitle}</h2>
      <p className="text-xs text-muted">{c.soldHint}</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPreset(item.key)}
            className={`min-h-10 border-[1.5px] border-black px-3 text-sm font-semibold ${preset === item.key ? "bg-black text-white" : "bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {failed && <p className="text-sm font-semibold">{c.loadError}</p>}
      {sold && sold.rows.length === 0 && <p className="text-sm text-muted">{c.soldEmpty}</p>}
      {sold && sold.rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-black text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3">{c.product}</th>
                  <th className="py-2 pr-3 text-right">{c.portions}</th>
                  <th className="py-2 pr-3 text-right">{c.revenue}</th>
                  <th className="py-2 pr-3 text-right">{c.cost}</th>
                  <th className="py-2 text-right">{c.profit}</th>
                </tr>
              </thead>
              <tbody>
                {sold.rows.map((row) => (
                  <tr key={`${row.productId}-${row.nameVi}`} className="border-b border-[#eeeeee]">
                    <td className="py-2 pr-3">{lang === "vi" ? row.nameVi : row.nameEn}</td>
                    <td className="py-2 pr-3 text-right">{row.portions}</td>
                    <td className="py-2 pr-3 text-right">{money(row.revenue)}</td>
                    <td className="py-2 pr-3 text-right">{row.cost === null ? <span className="text-muted">{c.noRecipe}</span> : money(row.cost)}</td>
                    <td className="py-2 text-right font-semibold">
                      {row.profit === null ? "—" : `${row.profit < 0 ? "−" : ""}${money(row.profit)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm font-semibold">
            {c.soldTotal
              .replace("{revenue}", money(sold.totals.costedRevenue))
              .replace("{cost}", money(sold.totals.cost))
              .replace("{profit}", `${sold.totals.profit < 0 ? "−" : ""}${money(sold.totals.profit)}`)}
          </p>
          {sold.totals.costedRevenue < sold.totals.revenue && <p className="text-xs text-muted">{c.soldPartial}</p>}
        </>
      )}
    </section>
  );
}

// ---------- Recipes ----------

function RecipesTab({
  data,
  productId,
  onProduct,
  onSaved,
  onGoIngredients,
}: {
  data: CostingBundle;
  productId: number | null;
  onProduct: (id: number) => void;
  onSaved: (data: CostingBundle) => void;
  onGoIngredients: () => void;
}) {
  const { t, lang } = useAdminI18n();
  const c = t.costing;
  const product = data.products.find((p) => p.id === productId) ?? null;
  const name = (item: { nameVi: string; nameEn: string }) => (lang === "vi" ? item.nameVi : item.nameEn);

  if (data.ingredients.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border-[1.5px] border-black bg-white p-4">
        <p className="text-sm">{c.needIngredients}</p>
        <button type="button" onClick={onGoIngredients} className="min-h-11 bg-black px-4 text-sm font-bold text-white">
          {c.tabs.ingredients} →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-md flex-col gap-1 text-sm font-semibold">
        {c.pickProduct}
        <select
          value={productId ?? ""}
          onChange={(e) => onProduct(Number(e.target.value))}
          className="h-11 border-[1.5px] border-black bg-white px-3 font-normal"
        >
          {data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {name(p)}
              {p.isActive ? "" : ` (${c.hidden})`}
            </option>
          ))}
        </select>
      </label>

      {product && (
        <>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{product.hasFlavors ? c.flavorRecipes : c.productRecipe}</h2>
          {product.flavors.map((flavor) => (
            <RecipeEditor
              key={`f-${product.id}-${flavor.optionId}`}
              data={data}
              product={product}
              optionId={flavor.optionId}
              title={name(flavor)}
              kind="flavor"
              onSaved={onSaved}
            />
          ))}
          {product.hasPackages && (
            <>
              <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">{c.packageRecipes}</h2>
              {product.packages.map((pack) => (
                <RecipeEditor
                  key={`p-${product.id}-${pack.optionId}`}
                  data={data}
                  product={product}
                  optionId={pack.optionId}
                  title={name(pack)}
                  kind="package"
                  onSaved={onSaved}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

type Line = { ingredientId: number; quantity: string };

// One recipe: a batch of a flavor (how many portions it makes), or what one box needs.
function RecipeEditor({
  data,
  product,
  optionId,
  title,
  kind,
  onSaved,
}: {
  data: CostingBundle;
  product: ProductCost;
  optionId: number | null;
  title: string;
  kind: "flavor" | "package";
  onSaved: (data: CostingBundle) => void;
}) {
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const c = t.costing;
  const saved = data.recipes.find((r) => r.productId === product.id && r.optionId === optionId);
  const [yieldText, setYieldText] = useState(String(saved?.yieldCount ?? (kind === "package" ? 1 : 10)));
  const [lines, setLines] = useState<Line[]>(saved?.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity) })) ?? []);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const byId = new Map(data.ingredients.map((i) => [i.id, i]));
  // Packaging first for boxes, food first for flavors.
  const preferred: IngredientKind = kind === "package" ? "PACKAGING" : "INGREDIENT";
  const options = [...data.ingredients].sort((a, b) => Number(b.kind === preferred) - Number(a.kind === preferred) || a.name.localeCompare(b.name));
  const money = (n: number) => formatPrice(Math.round(n), lang);
  const lineCost = (line: Line) => {
    const ingredient = byId.get(line.ingredientId);
    const quantity = Number(line.quantity.replace(",", "."));
    return ingredient && quantity > 0 ? (quantity * ingredient.packPrice) / ingredient.packSize : 0;
  };
  const total = lines.reduce((sum, line) => sum + lineCost(line), 0);
  const yieldCount = Math.max(1, Math.floor(Number(yieldText) || 1));

  function change(next: Line[]) {
    setLines(next);
    setDirty(true);
  }

  async function save() {
    const clean = lines
      .map((line) => ({ ingredientId: line.ingredientId, quantity: Number(line.quantity.replace(",", ".")) }))
      .filter((line) => line.quantity > 0);
    if (new Set(clean.map((l) => l.ingredientId)).size !== clean.length) {
      toast.error(c.duplicateIngredient);
      return;
    }
    setBusy(true);
    try {
      onSaved(await adminApi.saveRecipe({ productId: product.id, optionId, yieldCount, lines: clean }));
      setDirty(false);
      toast.success(c.recipeSaved);
    } catch {
      toast.error(c.error);
    } finally {
      setBusy(false);
    }
  }

  const input = "h-10 border-[1.5px] border-black bg-white px-2.5 text-sm";

  return (
    <section className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        <span className="text-sm">
          {lines.length === 0 ? (
            <span className="text-muted">{c.noRecipe}</span>
          ) : (
            <strong>{(kind === "package" ? c.perBox : c.perPortion).replace("{cost}", money(total / yieldCount))}</strong>
          )}
        </span>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {kind === "package" ? c.yieldBoxes : c.yieldPortions}
        <input
          inputMode="numeric"
          value={yieldText}
          onChange={(e) => {
            setYieldText(e.target.value);
            setDirty(true);
          }}
          className={`${input} w-20`}
        />
      </label>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((line, index) => {
            const ingredient = byId.get(line.ingredientId);
            return (
              <li key={index} className="grid grid-cols-[1fr_96px_auto] items-center gap-2 sm:grid-cols-[1fr_110px_100px_auto]">
                <select
                  value={line.ingredientId}
                  aria-label={c.ingredient}
                  onChange={(e) => change(lines.map((l, i) => (i === index ? { ...l, ingredientId: Number(e.target.value) } : l)))}
                  className={input}
                >
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <span className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    value={line.quantity}
                    aria-label={c.quantity}
                    onChange={(e) => change(lines.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))}
                    className={`${input} w-full`}
                  />
                  <span className="text-xs text-muted">{ingredient?.unit}</span>
                </span>
                <span className="hidden text-right text-sm sm:block">{money(lineCost(line))}</span>
                <button
                  type="button"
                  onClick={() => change(lines.filter((_, i) => i !== index))}
                  aria-label={c.removeLine}
                  className="flex h-10 w-10 items-center justify-center border-[1.5px] border-black"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            const unused = options.find((o) => !lines.some((l) => l.ingredientId === o.id)) ?? options[0];
            change([...lines, { ingredientId: unused.id, quantity: "" }]);
          }}
          className="min-h-10 text-sm font-semibold underline"
        >
          + {c.addLine}
        </button>
        {lines.length > 0 && (
          <span className="text-xs text-muted">{c.batchTotal.replace("{cost}", money(total)).replace("{count}", String(yieldCount))}</span>
        )}
      </div>
      {dirty && (
        <button type="button" onClick={save} disabled={busy} className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white disabled:opacity-60">
          {busy ? c.saving : c.save}
        </button>
      )}
    </section>
  );
}

// ---------- Ingredients ----------

const EMPTY_INGREDIENT: IngredientInput = { name: "", kind: "INGREDIENT", unit: "g", packSize: 1000, packPrice: 0, note: null };

function IngredientsTab({ data, onSaved }: { data: CostingBundle; onSaved: (data: CostingBundle) => void }) {
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const c = t.costing;
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);

  async function remove(item: Ingredient) {
    if (item.usedIn > 0) {
      toast.error(c.inUse.replace("{count}", String(item.usedIn)));
      return;
    }
    if (!window.confirm(c.deleteConfirm.replace("{name}", item.name))) return;
    try {
      onSaved(await adminApi.deleteIngredient(item.id));
      toast.success(c.deleted);
    } catch (error) {
      toast.error(error instanceof AdminApiError && error.code === "INGREDIENT_IN_USE" ? c.inUse.replace("{count}", "") : c.error);
    }
  }

  const unitPrice = (item: IngredientInput) =>
    item.packSize > 0 ? (item.packPrice / item.packSize).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 1 }) : "0";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{c.ingredientsHint}</p>
      {editing ? (
        <IngredientForm
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(next) => {
            onSaved(next);
            setEditing(null);
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white">
          + {c.addIngredient}
        </button>
      )}

      {data.ingredients.length === 0 ? (
        <p className="border border-dashed border-[#a8a8a8] bg-white p-7 text-center text-muted">{c.noIngredients}</p>
      ) : (
        <div className="overflow-x-auto border border-[#e0e0e0] bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-black text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2">{c.ingredient}</th>
                <th className="px-3 py-2">{c.kind}</th>
                <th className="px-3 py-2 text-right">{c.pack}</th>
                <th className="px-3 py-2 text-right">{c.packPrice}</th>
                <th className="px-3 py-2 text-right">{c.unitPrice}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.ingredients.map((item) => (
                <tr key={item.id} className="border-b border-[#eeeeee]">
                  <td className="px-3 py-2">
                    <span className="font-semibold">{item.name}</span>
                    {item.note && <span className="block text-xs text-muted">{item.note}</span>}
                  </td>
                  <td className="px-3 py-2">{c.kinds[item.kind]}</td>
                  <td className="px-3 py-2 text-right">
                    {item.packSize.toLocaleString(lang === "vi" ? "vi-VN" : "en-US")} {item.unit}
                  </td>
                  <td className="px-3 py-2 text-right">{formatPrice(item.packPrice, lang)}</td>
                  <td className="px-3 py-2 text-right">
                    {unitPrice(item)} đ/{item.unit}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" onClick={() => setEditing(item)} className="min-h-9 px-1 font-semibold underline">
                      {c.edit}
                    </button>
                    <button type="button" onClick={() => remove(item)} className="min-h-9 px-1 font-semibold underline">
                      {c.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IngredientForm({
  item,
  onCancel,
  onSaved,
}: {
  item: Ingredient | null;
  onCancel: () => void;
  onSaved: (data: CostingBundle) => void;
}) {
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const c = t.costing;
  const start = item ?? EMPTY_INGREDIENT;
  const [name, setName] = useState(start.name);
  const [kind, setKind] = useState<IngredientKind>(start.kind);
  const [unit, setUnit] = useState(start.unit);
  const [packSize, setPackSize] = useState(String(start.packSize));
  const [packPrice, setPackPrice] = useState(start.packPrice ? String(start.packPrice) : "");
  const [note, setNote] = useState(start.note ?? "");
  const [busy, setBusy] = useState(false);

  const size = Number(packSize.replace(",", "."));
  const price = Number(packPrice.replace(/[^\d]/g, ""));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !unit.trim() || !(size > 0) || !Number.isInteger(price)) {
      toast.error(c.invalidIngredient);
      return;
    }
    const input: IngredientInput = { name: name.trim(), kind, unit: unit.trim(), packSize: size, packPrice: price, note: note.trim() || null };
    setBusy(true);
    try {
      onSaved(item ? await adminApi.updateIngredient(item.id, input) : await adminApi.createIngredient(input));
      toast.success(c.ingredientSaved);
    } catch {
      toast.error(c.error);
    } finally {
      setBusy(false);
    }
  }

  const field = "flex flex-col gap-1 text-sm font-semibold";
  const input = "h-11 border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-4">
      <span className="text-xs font-bold uppercase tracking-widest text-muted">{item ? c.editIngredient : c.addIngredient}</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          {c.ingredient}
          <input required maxLength={80} value={name} placeholder={c.namePlaceholder} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className={field}>
          {c.kind}
          <select value={kind} onChange={(e) => setKind(e.target.value as IngredientKind)} className={input}>
            <option value="INGREDIENT">{c.kinds.INGREDIENT}</option>
            <option value="PACKAGING">{c.kinds.PACKAGING}</option>
          </select>
        </label>
        <label className={field}>
          {c.packSize}
          <span className="flex gap-2">
            <input required inputMode="decimal" value={packSize} onChange={(e) => setPackSize(e.target.value)} className={`${input} w-full`} />
            <input
              required
              list="costing-units"
              maxLength={12}
              value={unit}
              aria-label={c.unit}
              onChange={(e) => setUnit(e.target.value)}
              className={`${input} w-24`}
            />
            <datalist id="costing-units">
              <option value="g" />
              <option value="ml" />
              <option value="cái" />
              <option value="quả" />
            </datalist>
          </span>
          <span className="text-xs font-normal text-muted">{c.packSizeHint}</span>
        </label>
        <label className={field}>
          {c.packPrice}
          <input required inputMode="numeric" value={packPrice} placeholder="90000" onChange={(e) => setPackPrice(e.target.value)} className={input} />
          {size > 0 && price > 0 && (
            <span className="text-xs font-normal text-muted">
              = {(price / size).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 1 })} đ/{unit}
            </span>
          )}
        </label>
      </div>
      <label className={field}>
        {c.note}
        <input maxLength={300} value={note} placeholder={c.notePlaceholder} onChange={(e) => setNote(e.target.value)} className={input} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-11 bg-black px-5 text-sm font-bold text-white disabled:opacity-60">
          {busy ? c.saving : c.save}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 px-3 text-sm font-semibold underline">
          {c.cancel}
        </button>
      </div>
    </form>
  );
}
