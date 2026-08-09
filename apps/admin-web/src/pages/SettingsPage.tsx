import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock3, Power, Store } from "lucide-react";
import type { V2StoreConfigSaveInput } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { PageError, PageLoading } from "../components/PageState";

export function SettingsPage() {
  const { api, session, notify } = useMerchant();
  const [form, setForm] = useState<V2StoreConfigSaveInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!api || !session) return;
    setLoading(true);
    try {
      const config = await api.getStoreConfig(session.token);
      setForm({ storeName: config.storeName, announcement: config.announcement, businessOpen: config.businessOpen, dayBoundaryTime: config.dayBoundaryTime });
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "营业设置加载失败"); }
    finally { setLoading(false); }
  }, [api, session]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !api || !session) return;
    if (!form.storeName.trim()) { setError("请输入摊位名称"); return; }
    setSaving(true); setError("");
    try { setForm(await api.saveStoreConfig(session.token, form)); notify("设置已保存", "success"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败"); }
    finally { setSaving(false); }
  }

  if (loading) return <PageLoading label="正在加载营业设置" />;
  if (!form) return <PageError message={error || "营业设置不存在"} onRetry={load} />;
  return (
    <div className="page-stack settings-page">
      <header className="page-header"><div><p className="eyebrow">摊位信息</p><h1>营业设置</h1><p>设置摊位信息、接单状态和营业日。</p></div></header>
      <form className="settings-grid" onSubmit={save}>
        <section className="panel settings-section">
          <header><span className="settings-icon"><Store size={20} /></span><div><h2>基本信息</h2><p>顾客会在小程序首页看到。</p></div></header>
          <label className="field"><span>摊位名称</span><input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} /></label>
          <label className="field"><span>今日公告</span><textarea rows={3} value={form.announcement ?? ""} onChange={(event) => setForm({ ...form, announcement: event.target.value })} placeholder="例如：每日现打，售完即止" /></label>
        </section>
        <section className="panel settings-section">
          <header><span className="settings-icon"><Power size={20} /></span><div><h2>接单状态</h2><p>关闭后不能新下单、换券或用券。</p></div></header>
          <label className={`business-toggle ${form.businessOpen ? "is-open" : ""}`}>
            <input type="checkbox" checked={form.businessOpen} onChange={(event) => setForm({ ...form, businessOpen: event.target.checked })} />
            <span className="business-toggle-track"><i /></span>
            <span><strong>{form.businessOpen ? "营业中" : "暂停接单"}</strong><small>{form.businessOpen ? "顾客可以正常下单" : "历史订单仍可继续处理"}</small></span>
          </label>
        </section>
        <section className="panel settings-section">
          <header><span className="settings-icon"><Clock3 size={20} /></span><div><h2>营业日切换</h2><p>用于今日统计和取餐号重新从 001 开始。</p></div></header>
          <label className="field"><span>切换时间</span><input type="time" value={form.dayBoundaryTime} onChange={(event) => setForm({ ...form, dayBoundaryTime: event.target.value })} /></label>
          <p className="field-help">设置为 04:00 时，凌晨 1 点的订单仍计入前一营业日。</p>
        </section>
        {error && <div className="form-error settings-error" role="alert">{error}</div>}
        <div className="settings-save"><Button type="submit" loading={saving}>保存设置</Button></div>
      </form>
    </div>
  );
}
