import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Coins, Search, TicketPercent, UserRound, Users } from "lucide-react";
import type { V2Member, V2MemberDetail } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState, PageError, PageLoading } from "../components/PageState";
import { formatDateTime, pointTypeLabel } from "../lib/format";

export function MembersPage() {
  const { api, session } = useMerchant();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<V2Member[]>([]);
  const [detail, setDetail] = useState<V2MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(async (value = "") => {
    if (!api || !session) return;
    setLoading(true); setError("");
    try { setMembers(await api.searchMembers(session.token, value)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "用户查询失败"); }
    finally { setLoading(false); }
  }, [api, session]);
  useEffect(() => { void search(); }, [search]);

  async function submit(event: FormEvent) { event.preventDefault(); await search(query); }
  async function openDetail(memberId: string) {
    if (!api || !session) return;
    setDetailLoading(true);
    try { setDetail(await api.getMemberDetail(session.token, memberId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "用户详情加载失败"); }
    finally { setDetailLoading(false); }
  }

  if (loading && !members.length) return <PageLoading label="正在加载用户" />;
  if (error && !members.length) return <PageError message={error} onRetry={() => search()} />;
  return (
    <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">会员与邀请</p><h1>用户</h1><p>只查看积分、上下级、商品券和最近订单，不提供人工改分。</p></div></header>
      <form className="search-bar" onSubmit={submit} role="search">
        <Search size={18} aria-hidden="true" />
        <input aria-label="搜索用户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入用户编号、邀请码或昵称" />
        <Button type="submit" loading={loading}>查询</Button>
      </form>
      {error && <div className="inline-alert">{error}</div>}
      <section className="member-list panel">
        <header className="table-header"><span>用户</span><span>邀请码</span><span>当前积分</span><span>加入时间</span><span /></header>
        {members.map((member) => (
          <article className="member-row" key={member._id}>
            <div className="member-identity"><span className="avatar">{(member.nickname || member.memberCode).slice(0, 1)}</span><div><strong>{member.nickname || "微信用户"}</strong><span>{member.memberCode}</span></div></div>
            <span data-label="邀请码">{member.inviteCode}</span>
            <strong data-label="当前积分">{member.pointsBalance}</strong>
            <span data-label="加入时间">{formatDateTime(member.createdAt)}</span>
            <Button tone="quiet" onClick={() => openDetail(member._id)}>查看</Button>
          </article>
        ))}
        {!members.length && <EmptyState title="没有找到用户" detail="换个用户编号、邀请码或昵称试试。" />}
      </section>

      <Dialog open={Boolean(detail) || detailLoading} title={detail ? (detail.nickname || detail.memberCode) : "用户详情"} description={detail ? `${detail.memberCode} · 邀请码 ${detail.inviteCode}` : undefined} onClose={() => !detailLoading && setDetail(null)} width="large">
        {detailLoading && !detail ? <PageLoading /> : detail && <div className="member-detail">
          <section className="member-stat-grid">
            <div><Coins size={18} /><span>当前积分</span><strong>{detail.pointsBalance}</strong></div>
            <div><Users size={18} /><span>直接下级</span><strong>{detail.invitees.length}</strong></div>
            <div><TicketPercent size={18} /><span>可见商品券</span><strong>{detail.coupons.length}</strong></div>
          </section>
          <section className="detail-section"><h3>邀请关系</h3><dl className="detail-list"><div><dt>直接上级</dt><dd>{detail.inviter ? `${detail.inviter.nickname || "微信用户"} · ${detail.inviter.memberCode}` : "未绑定"}</dd></div>{detail.invitees.map((invitee) => <div key={invitee._id}><dt>{invitee.nickname || invitee.memberCode}</dt><dd>累计贡献 {invitee.contributedPoints} 积分</dd></div>)}</dl></section>
          <section className="detail-section"><h3>最近积分明细</h3><div className="ledger-list">{detail.pointLedger.slice(0, 8).map((row) => <div key={row._id}><span>{pointTypeLabel[row.type]}<small>{formatDateTime(row.createdAt)}</small></span><strong className={row.amount >= 0 ? "positive" : "negative"}>{row.amount >= 0 ? "+" : ""}{row.amount}</strong></div>)}{!detail.pointLedger.length && <p className="quiet-empty">暂无积分明细</p>}</div></section>
        </div>}
      </Dialog>
    </div>
  );
}
