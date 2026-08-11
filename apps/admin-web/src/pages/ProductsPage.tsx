import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, CirclePlus, FolderPlus, GripVertical, Pencil, Plus, Soup, Tags, Trash2 } from "lucide-react";
import type { V2Category, V2CategorySaveInput, V2Product, V2ProductSaveInput, V2SpecGroup } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState, PageError, PageLoading } from "../components/PageState";
import { formatMoney } from "../lib/format";
import { readResourceCache, writeResourceCache } from "../lib/resource-cache";
import { MerchantApiError } from "../lib/api";

const PRODUCTS_CACHE_KEY = "products";
const CATEGORIES_CACHE_KEY = "categories";

const blankProduct = (categoryId = ""): V2ProductSaveInput => ({
  categoryId: categoryId || undefined,
  name: "",
  description: "",
  imageUrl: "",
  basePrice: 1500,
  enabled: true,
  soldOut: false,
  sortOrder: 1,
  pointsEnabled: true,
  buyerPointsPerUnit: 10,
  inviterPointsPerUnit: 1,
  specGroups: []
});

function productInput(product: V2Product): V2ProductSaveInput {
  return {
    id: product._id,
    expectedVersion: product.version,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description ?? "",
    imageUrl: product.imageUrl ?? "",
    basePrice: product.basePrice,
    enabled: product.enabled,
    soldOut: product.soldOut,
    sortOrder: product.sortOrder,
    pointsEnabled: product.pointsEnabled,
    buyerPointsPerUnit: product.buyerPointsPerUnit,
    inviterPointsPerUnit: product.inviterPointsPerUnit,
    specGroups: structuredClone(product.specGroups)
  };
}

function newSpecGroup(index: number): V2SpecGroup {
  const id = `group-${crypto.randomUUID().slice(0, 8)}`;
  return { id, name: index === 0 ? "辣度" : "小料", mode: index === 0 ? "SINGLE" : "MULTIPLE", required: index === 0, maxSelect: index === 0 ? undefined : 3, choices: [] };
}

function validateProduct(form: V2ProductSaveInput): string {
  if (!form.categoryId) return "请选择商品分类";
  if (!form.name.trim()) return "请输入商品名称";
  if (!Number.isInteger(form.basePrice) || form.basePrice < 1) return "商品价格至少为 0.01 元";
  for (const group of form.specGroups) {
    if (!group.name.trim()) return "请填写规格组名称";
    if (!group.choices.length) return `${group.name}至少需要一个选项`;
    if (group.choices.some((choice) => !choice.name.trim())) return `${group.name}有未填写名称的选项`;
    if (group.mode === "SINGLE" && group.choices.filter((choice) => choice.isDefault).length > 1) return `${group.name}只能设置一个默认项`;
  }
  return "";
}

export function ProductsPage() {
  const { api, session, notify } = useMerchant();
  const [products, setProducts] = useState<V2Product[]>(() => readResourceCache<V2Product[]>(PRODUCTS_CACHE_KEY) ?? []);
  const [categories, setCategories] = useState<V2Category[]>(() => readResourceCache<V2Category[]>(CATEGORIES_CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => readResourceCache(PRODUCTS_CACHE_KEY) === undefined || readResourceCache(CATEGORIES_CACHE_KEY) === undefined);
  const [error, setError] = useState("");
  const [form, setForm] = useState<V2ProductSaveInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [categoryForm, setCategoryForm] = useState<V2CategorySaveInput | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  function productConflict(error: unknown): boolean {
    return error instanceof MerchantApiError && ["VERSION_CONFLICT", "PRODUCT_VERSION_CONFLICT"].includes(error.code);
  }

  const load = useCallback(async () => {
    if (!api || !session) return;
    setLoading(readResourceCache(PRODUCTS_CACHE_KEY) === undefined || readResourceCache(CATEGORIES_CACHE_KEY) === undefined); setError("");
    try {
      const results = await Promise.all([api.listProducts(session.token), api.listCategories(session.token)]);
      const nextProducts = results[0];
      const nextCategories = results[1];
      writeResourceCache(PRODUCTS_CACHE_KEY, nextProducts);
      writeResourceCache(CATEGORIES_CACHE_KEY, nextCategories);
      setProducts(nextProducts);
      setCategories(nextCategories);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "商品加载失败"); }
    finally { setLoading(false); }
  }, [api, session]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !api || !session) return;
    const validation = validateProduct(form);
    if (validation) { setFormError(validation); return; }
    setSaving(true); setFormError("");
    try {
      await api.saveProduct(session.token, form);
      notify(form.id ? "商品已保存" : "商品已创建", "success");
      setForm(null);
      await load();
    } catch (caught) {
      if (productConflict(caught)) {
        setFormError("商品内容刚刚有更新，请关闭编辑后重新打开");
        await load();
      } else {
        setFormError(caught instanceof Error ? caught.message : "保存失败");
      }
    }
    finally { setSaving(false); }
  }

  async function quickUpdate(product: V2Product, patch: Partial<V2ProductSaveInput>) {
    if (!api || !session) return;
    setUpdatingProductId(product._id);
    try {
      await api.saveProduct(session.token, { ...productInput(product), ...patch });
      await load();
      notify(patch.soldOut !== undefined ? (patch.soldOut ? "已标记售罄" : "已恢复销售") : patch.enabled ? "商品已上架" : "商品已下架", "success");
    } catch (caught) {
      if (productConflict(caught)) {
        await load();
        notify("商品状态已有更新，请重新操作", "error");
      } else {
        notify(caught instanceof Error ? caught.message : "操作失败", "error");
      }
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryForm || !api || !session) return;
    if (!categoryForm.name.trim()) { setCategoryError("请输入分类名称"); return; }
    setCategorySaving(true); setCategoryError("");
    try {
      await api.saveCategory(session.token, categoryForm);
      notify(categoryForm.id ? "分类已保存" : "分类已创建", "success");
      setCategoryForm(null);
      await load();
    } catch (caught) { setCategoryError(caught instanceof Error ? caught.message : "保存失败"); }
    finally { setCategorySaving(false); }
  }

  async function toggleCategory(category: V2Category) {
    if (!api || !session) return;
    try {
      await api.saveCategory(session.token, { id: category._id, name: category.name, enabled: !category.enabled, sortOrder: category.sortOrder });
      await load();
      notify(category.enabled ? "分类已停用" : "分类已启用", "success");
    } catch (caught) { notify(caught instanceof Error ? caught.message : "操作失败", "error"); }
  }

  if (loading && !products.length) return <PageLoading label="正在加载商品" />;
  if (error && !products.length) return <PageError message={error} onRetry={load} />;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">商品与规格</p><h1>商品</h1><p>设置价格、辣度、小料和每份积分。</p></div>
        <Button onClick={() => { setForm(blankProduct(categories.find((item) => item.enabled)?._id)); setFormError(""); }}><Plus size={17} />新增商品</Button>
      </header>
      {error && <div className="inline-alert">{error}</div>}

      <section className="category-manager">
        <div className="category-manager-head">
          <div><span className="section-icon"><Tags size={18} /></span><div><h2>点餐分类</h2><p>小程序会按这里的顺序显示在左侧。</p></div></div>
          <Button tone="secondary" onClick={() => { const last = categories[categories.length - 1]; setCategoryForm({ name: "", enabled: true, sortOrder: (last?.sortOrder ?? 0) + 10 }); setCategoryError(""); }}><FolderPlus size={16} />新增分类</Button>
        </div>
        <div className="category-list">
          {categories.map((category, index) => (
            <article className={`category-chip-card ${category.enabled ? "" : "is-disabled"}`} key={category._id}>
              <span className="category-order">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{category.name}</strong><small>{products.filter((product) => product.categoryId === category._id).length} 个商品 · 排序 {category.sortOrder}</small></div>
              <span className={`category-state ${category.enabled ? "is-enabled" : ""}`}>{category.enabled ? "显示中" : "已停用"}</span>
              <Button tone="quiet" onClick={() => { setCategoryForm({ id: category._id, name: category.name, enabled: category.enabled, sortOrder: category.sortOrder }); setCategoryError(""); }}><Pencil size={14} />编辑分类</Button>
              <Button tone="quiet" onClick={() => void toggleCategory(category)}>{category.enabled ? "停用" : "启用"}</Button>
            </article>
          ))}
        </div>
      </section>

      <div className="catalog-summary"><div><strong>商品列表</strong><span>{products.length} 个商品</span></div><span>上架与售罄状态会显示在小程序</span></div>
      <section className="product-grid">
        {products.map((product) => (
          <article className="product-card" key={product._id}>
            <div className="product-image">
              {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <div className="product-image-placeholder" aria-label={`${product.name}暂无图片`}><Soup size={30} /><span>{product.name}</span></div>}
              <span className={`availability-pill ${!product.enabled ? "is-off" : product.soldOut ? "is-sold-out" : ""}`}>{!product.enabled ? "已下架" : product.soldOut ? "已售罄" : "销售中"}</span>
            </div>
            <div className="product-card-body">
              <div className="product-title-row"><div><span className="product-category-label">{categories.find((category) => category._id === product.categoryId)?.name ?? "未分类"}</span><h2>{product.name}</h2><p>{product.description || "暂无商品说明"}</p></div><strong>{formatMoney(product.basePrice)}</strong></div>
              <div className="product-tags">
                {product.specGroups.map((group) => <span key={group.id}>{group.name} · {group.choices.length} 项</span>)}
                {!product.specGroups.length && <span>无规格</span>}
              </div>
              <div className="points-line"><span>顾客 +{product.buyerPointsPerUnit}/份</span><span>邀请奖励 +{product.inviterPointsPerUnit}/份</span></div>
              <div className="product-actions">
                <Button tone="secondary" disabled={updatingProductId === product._id} onClick={() => { setForm(productInput(product)); setFormError(""); }}><Pencil size={15} />编辑</Button>
                <Button tone="quiet" loading={updatingProductId === product._id} onClick={() => quickUpdate(product, { soldOut: !product.soldOut })}>{product.soldOut ? "恢复销售" : "标记售罄"}</Button>
                <Button tone="quiet" disabled={updatingProductId === product._id} onClick={() => quickUpdate(product, { enabled: !product.enabled })}>{product.enabled ? "下架" : "上架"}</Button>
              </div>
            </div>
          </article>
        ))}
        {!products.length && <EmptyState title="还没有商品" detail="新增商品后，可继续设置辣度和小料。" icon={<Soup size={26} />} action={<Button onClick={() => setForm(blankProduct(categories.find((item) => item.enabled)?._id))}>新增商品</Button>} />}
      </section>

      <Dialog open={Boolean(form)} title={form?.id ? "编辑商品" : "新增商品"} description="修改只影响之后创建的订单，历史订单不会变化。" onClose={() => !saving && setForm(null)} width="large">
        {form && <ProductForm form={form} categories={categories} setForm={setForm} error={formError} saving={saving} onSubmit={save} onCancel={() => setForm(null)} />}
      </Dialog>
      <Dialog open={Boolean(categoryForm)} title={categoryForm?.id ? "编辑分类" : "新增分类"} description="分类名称和排序会同步到小程序点餐页。" onClose={() => !categorySaving && setCategoryForm(null)} width="small">
        {categoryForm && <form className="editor-form" onSubmit={saveCategory}>
          <label className="field"><span>分类名称</span><input autoFocus value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="例如：招牌肉片" /></label>
          <label className="field"><span>显示顺序</span><input type="number" min="0" step="1" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: Math.max(0, Math.trunc(Number(event.target.value || 0))) })} /><small>数字越小越靠前</small></label>
          <label className="switch-row compact-switch"><input type="checkbox" checked={categoryForm.enabled} onChange={(event) => setCategoryForm({ ...categoryForm, enabled: event.target.checked })} /><span><strong>在小程序中显示</strong></span></label>
          {categoryError && <div className="form-error" role="alert">{categoryError}</div>}
          <div className="dialog-actions"><Button type="button" tone="secondary" onClick={() => setCategoryForm(null)} disabled={categorySaving}>取消</Button><Button type="submit" loading={categorySaving}>保存分类</Button></div>
        </form>}
      </Dialog>
    </div>
  );
}

function ProductForm({
  form,
  categories,
  setForm,
  error,
  saving,
  onSubmit,
  onCancel
}: {
  form: V2ProductSaveInput;
  categories: V2Category[];
  setForm(value: V2ProductSaveInput): void;
  error: string;
  saving: boolean;
  onSubmit(event: FormEvent): void;
  onCancel(): void;
}) {
  const warning = form.basePrice < 500 && form.buyerPointsPerUnit > 50;
  const updateGroup = (index: number, next: V2SpecGroup) => setForm({ ...form, specGroups: form.specGroups.map((group, groupIndex) => groupIndex === index ? next : group) });
  const moveGroup = (index: number, offset: number) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= form.specGroups.length) return;
    const groups = [...form.specGroups];
    [groups[index], groups[nextIndex]] = [groups[nextIndex], groups[index]];
    setForm({ ...form, specGroups: groups });
  };

  return (
    <form className="editor-form" onSubmit={onSubmit}>
      <section className="form-section">
        <div className="form-section-title"><h3>基本信息</h3><p>顾客会在点餐首页看到这些内容。</p></div>
        <div className="form-grid two-columns">
          <label className="field"><span>商品分类</span><select value={form.categoryId ?? ""} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="" disabled>请选择分类</option>{categories.filter((category) => category.enabled || category._id === form.categoryId).map((category) => <option key={category._id} value={category._id}>{category.name}{category.enabled ? "" : "（已停用）"}</option>)}</select></label>
          <label className="field"><span>商品名称</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：祯好七福鼎肉片" /></label>
          <label className="field"><span>基础价格（元）</span><input type="number" min="0.01" step="0.01" value={(form.basePrice / 100).toFixed(2)} onChange={(event) => setForm({ ...form, basePrice: Math.round(Number(event.target.value || 0) * 100) })} /></label>
          <label className="field field-span"><span>商品说明</span><textarea rows={2} value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="一句话说明口味或用料" /></label>
          <label className="field field-span"><span>图片地址</span><input value={form.imageUrl ?? ""} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." /></label>
        </div>
        <div className="switch-row-group">
          <label className="switch-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span><strong>上架商品</strong><small>关闭后顾客看不到该商品</small></span></label>
          <label className="switch-row"><input type="checkbox" checked={form.soldOut} onChange={(event) => setForm({ ...form, soldOut: event.target.checked })} /><span><strong>标记售罄</strong><small>保留展示，但暂时不能购买</small></span></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-title"><h3>积分</h3><p>按每购买 1 份计算，加价规格不额外发积分。</p></div>
        <label className="switch-row compact-switch"><input type="checkbox" checked={form.pointsEnabled} onChange={(event) => setForm({ ...form, pointsEnabled: event.target.checked })} /><span><strong>该商品发放积分</strong></span></label>
        <div className="form-grid two-columns">
          <label className="field"><span>顾客每份积分</span><input type="number" min="0" step="1" disabled={!form.pointsEnabled} value={form.buyerPointsPerUnit} onChange={(event) => setForm({ ...form, buyerPointsPerUnit: Math.max(0, Math.trunc(Number(event.target.value || 0))) })} /></label>
          <label className="field"><span>直接邀请人每份积分</span><input type="number" min="0" step="1" disabled={!form.pointsEnabled} value={form.inviterPointsPerUnit} onChange={(event) => setForm({ ...form, inviterPointsPerUnit: Math.max(0, Math.trunc(Number(event.target.value || 0))) })} /></label>
        </div>
        {warning && <div className="warning-note">这组价格和积分差距较大，请再核对一次。</div>}
      </section>

      <section className="form-section">
        <div className="form-section-title with-action"><div><h3>辣度与小料</h3><p>单选适合辣度，多选适合小料。</p></div><Button type="button" tone="secondary" onClick={() => setForm({ ...form, specGroups: [...form.specGroups, newSpecGroup(form.specGroups.length)] })}><CirclePlus size={16} />添加规格组</Button></div>
        <div className="spec-editor-list">
          {form.specGroups.map((group, index) => (
            <section className="spec-editor" key={group.id}>
              <header className="spec-editor-header">
                <GripVertical size={18} aria-hidden="true" />
                <input aria-label={`第 ${index + 1} 个规格组名称`} value={group.name} onChange={(event) => updateGroup(index, { ...group, name: event.target.value })} />
                <select aria-label={`${group.name}选择方式`} value={group.mode} onChange={(event) => updateGroup(index, { ...group, mode: event.target.value as V2SpecGroup["mode"], maxSelect: event.target.value === "SINGLE" ? undefined : group.maxSelect ?? 3 })}><option value="SINGLE">单选</option><option value="MULTIPLE">多选</option></select>
                <label className="inline-check"><input type="checkbox" checked={group.required} onChange={(event) => updateGroup(index, { ...group, required: event.target.checked })} />必选</label>
                {group.mode === "MULTIPLE" && <label className="max-select">最多<input aria-label={`${group.name}最多选择数量`} type="number" min="1" max="20" value={group.maxSelect ?? 3} onChange={(event) => updateGroup(index, { ...group, maxSelect: Math.max(1, Math.trunc(Number(event.target.value || 1))) })} />项</label>}
                <span className="spec-header-actions">
                  <button type="button" className="icon-button" aria-label="上移规格组" onClick={() => moveGroup(index, -1)} disabled={index === 0}><ChevronUp size={17} /></button>
                  <button type="button" className="icon-button" aria-label="下移规格组" onClick={() => moveGroup(index, 1)} disabled={index === form.specGroups.length - 1}><ChevronDown size={17} /></button>
                  <button type="button" className="icon-button danger-icon" aria-label="删除规格组" onClick={() => setForm({ ...form, specGroups: form.specGroups.filter((_, groupIndex) => groupIndex !== index) })}><Trash2 size={17} /></button>
                </span>
              </header>
              <div className="choice-list">
                {group.choices.map((choice, choiceIndex) => (
                  <div className="choice-row" key={choice.id}>
                    <input aria-label={`${group.name}选项 ${choiceIndex + 1} 名称`} value={choice.name} onChange={(event) => updateGroup(index, { ...group, choices: group.choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, name: event.target.value } : item) })} placeholder="选项名称" />
                    <label className="price-delta"><span>加价 ¥</span><input aria-label={`${choice.name || "选项"}加价`} type="number" min="0" step="0.01" value={(choice.priceDelta / 100).toFixed(2)} onChange={(event) => updateGroup(index, { ...group, choices: group.choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, priceDelta: Math.round(Number(event.target.value || 0) * 100) } : item) })} /></label>
                    <label className="inline-check"><input type="checkbox" checked={choice.enabled} onChange={(event) => updateGroup(index, { ...group, choices: group.choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, enabled: event.target.checked } : item) })} />可选</label>
                    {group.mode === "SINGLE" && <label className="inline-check"><input type="radio" name={`default-${group.id}`} checked={Boolean(choice.isDefault)} onChange={() => updateGroup(index, { ...group, choices: group.choices.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === choiceIndex })) })} />默认</label>}
                    <button type="button" className="icon-button danger-icon" aria-label={`删除${choice.name || "选项"}`} onClick={() => updateGroup(index, { ...group, choices: group.choices.filter((_, itemIndex) => itemIndex !== choiceIndex) })}><Trash2 size={16} /></button>
                  </div>
                ))}
                <button type="button" className="add-choice-button" onClick={() => updateGroup(index, { ...group, choices: [...group.choices, { id: `choice-${crypto.randomUUID().slice(0, 8)}`, name: "", priceDelta: 0, enabled: true }] })}><Plus size={15} />添加选项</button>
              </div>
            </section>
          ))}
          {!form.specGroups.length && <div className="quiet-empty">暂未添加规格，商品将按基础价格出售。</div>}
        </div>
      </section>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions sticky-dialog-actions"><Button type="button" tone="secondary" onClick={onCancel} disabled={saving}>取消</Button><Button type="submit" loading={saving}>保存商品</Button></div>
    </form>
  );
}
