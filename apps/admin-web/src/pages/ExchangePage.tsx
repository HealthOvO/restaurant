import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, TicketPercent } from "lucide-react";
import type { V2ExchangeItem, V2ExchangeItemSaveInput, V2Product } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState, PageError, PageLoading } from "../components/PageState";
import { readResourceCache, writeResourceCache } from "../lib/resource-cache";

const EXCHANGE_CACHE_KEY = "exchange";

const blank = (productId = ""): V2ExchangeItemSaveInput => ({ name: "", productId, pointsCost: 100, validDays: 30, enabled: true, sortOrder: 1 });
const toInput = (item: V2ExchangeItem): V2ExchangeItemSaveInput => ({ id: item._id, name: item.name, productId: item.productId, pointsCost: item.pointsCost, validDays: item.validDays, enabled: item.enabled, sortOrder: item.sortOrder });

export function ExchangePage() {
  const { api, session, notify } = useMerchant();
  const [items, setItems] = useState<V2ExchangeItem[]>(() => readResourceCache<{ items: V2ExchangeItem[]; products: V2Product[] }>(EXCHANGE_CACHE_KEY)?.items ?? []);
  const [products, setProducts] = useState<V2Product[]>(() => readResourceCache<{ items: V2ExchangeItem[]; products: V2Product[] }>(EXCHANGE_CACHE_KEY)?.products ?? []);
  const [form, setForm] = useState<V2ExchangeItemSaveInput | null>(null);
  const [loading, setLoading] = useState(() => readResourceCache(EXCHANGE_CACHE_KEY) === undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!api || !session) return;
    setLoading(readResourceCache(EXCHANGE_CACHE_KEY) === undefined);
    try {
      const [nextItems, nextProducts] = await Promise.all([api.listExchangeItems(session.token), api.listProducts(session.token)]);
      writeResourceCache(EXCHANGE_CACHE_KEY, { items: nextItems, products: nextProducts });
      setItems(nextItems); setProducts(nextProducts); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "兑换项加载失败"); }
    finally { setLoading(false); }
  }, [api, session]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !api || !session) return;
    if (!form.name.trim() || !form.productId) { setFormError("请填写名称并选择指定商品"); return; }
    if (!Number.isInteger(form.pointsCost) || form.pointsCost < 1) { setFormError("兑换积分必须是正整数"); return; }
    setSaving(true); setFormError("");
    try { await api.saveExchangeItem(session.token, form); notify("兑换设置已保存", "success"); setForm(null); await load(); }
    catch (caught) { setFormError(caught instanceof Error ? caught.message : "保存失败"); }
    finally { setSaving(false); }
  }

  if (loading && !items.length) return <PageLoading label="正在加载兑换项" />;
  if (error && !items.length) return <PageError message={error} onRetry={load} />;
  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">指定商品券</p><h1>兑换项</h1><p>顾客兑换商品券后，可用券下单取餐。</p></div>
        <Button disabled={!products.length} onClick={() => setForm(blank(products[0]?._id))}><Plus size={17} />新增兑换项</Button>
      </header>
      <section className="exchange-grid">
        {items.map((item) => (
          <article className="exchange-card" key={item._id}>
            <div className="exchange-icon"><TicketPercent size={24} aria-hidden="true" /></div>
            <div className="exchange-main">
              <div><span className={`availability-pill ${item.enabled ? "" : "is-off"}`}>{item.enabled ? "可兑换" : "已下架"}</span><h2>{item.name}</h2><p className="exchange-product">兑换 {item.productName}</p></div>
              <strong className="points-cost">{item.pointsCost}<span>积分</span></strong>
            </div>
            <footer><span>领取后 {item.validDays} 天内有效</span><Button tone="secondary" onClick={() => { setForm(toInput(item)); setFormError(""); }}><Pencil size={15} />编辑</Button></footer>
          </article>
        ))}
        {!items.length && <EmptyState title="还没有兑换项" detail="新增后，顾客可用积分换取指定商品。" icon={<TicketPercent size={26} />} />}
      </section>
      <Dialog open={Boolean(form)} title={form?.id ? "编辑兑换项" : "新增兑换项"} description="修改只影响之后兑换的商品券，已发出的券不变。" onClose={() => !saving && setForm(null)}>
        {form && <form className="editor-form" onSubmit={save}>
          <label className="field"><span>兑换项名称</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：祯好七福鼎肉片兑换券" /></label>
          <label className="field"><span>指定商品</span><select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>{products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}</select></label>
          <div className="form-grid two-columns">
            <label className="field"><span>所需积分</span><input type="number" min="1" step="1" value={form.pointsCost} onChange={(event) => setForm({ ...form, pointsCost: Math.max(1, Math.trunc(Number(event.target.value || 1))) })} /></label>
            <label className="field"><span>有效期（天）</span><input type="number" min="1" max="3650" step="1" value={form.validDays} onChange={(event) => setForm({ ...form, validDays: Math.max(1, Math.trunc(Number(event.target.value || 1))) })} /></label>
          </div>
          <label className="switch-row compact-switch"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span><strong>允许顾客兑换</strong><small>关闭只影响新兑换，已发券仍可使用</small></span></label>
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <div className="dialog-actions"><Button type="button" tone="secondary" onClick={() => setForm(null)} disabled={saving}>取消</Button><Button type="submit" loading={saving}>保存设置</Button></div>
        </form>}
      </Dialog>
    </div>
  );
}
