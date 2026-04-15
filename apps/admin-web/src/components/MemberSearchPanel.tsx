import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PaginationMeta } from "@restaurant/shared";
import type { MemberSearchRow } from "../lib/api";

interface MemberSearchPanelProps {
  adjusting?: boolean;
  adjustingPoints?: boolean;
  hasSearched: boolean;
  query: string;
  rows: MemberSearchRow[];
  loading: boolean;
  pagination: PaginationMeta;
  onSearch: (query: string, page?: number) => Promise<void>;
  onAdjust: (inviteeMemberId: string, inviterMemberId: string, reason: string) => Promise<void>;
  onAdjustPoints: (memberId: string, delta: number, reason: string) => Promise<void>;
}

interface SelectionPreview {
  memberId: string;
  memberCode?: string;
  name: string;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "未完成";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatRelationStatus(status?: string | null) {
  if (!status) {
    return "未绑定邀请关系";
  }
  if (status === "ACTIVATED") {
    return "邀请已激活";
  }
  if (status === "PENDING") {
    return "邀请待激活";
  }
  if (status === "ADJUSTED") {
    return "邀请关系已人工调整";
  }
  return status;
}

function formatPointTransactionLabel(transaction: { type: string; note?: string; changeAmount: number }) {
  if (transaction.note?.trim()) {
    return transaction.note.trim();
  }

  if (transaction.type === "INVITE_REWARD") {
    return "邀请奖励";
  }
  if (transaction.type === "MANUAL_ADJUST") {
    return "人工调整";
  }
  if (transaction.type === "POINT_EXCHANGE") {
    return "积分兑换";
  }

  return "积分变动";
}

function maskPhone(phone?: string) {
  if (!phone || phone.length < 7) {
    return phone || "未留手机号";
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function buildVisiblePages(page: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function MemberSearchPanel({
  adjusting = false,
  adjustingPoints = false,
  hasSearched,
  query,
  rows,
  loading,
  pagination,
  onSearch,
  onAdjust,
  onAdjustPoints
}: MemberSearchPanelProps) {
  const [searchDraft, setSearchDraft] = useState(query);
  const [inviteeMemberId, setInviteeMemberId] = useState("");
  const [inviterMemberId, setInviterMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [pointMemberId, setPointMemberId] = useState("");
  const [pointDelta, setPointDelta] = useState("");
  const [pointReason, setPointReason] = useState("");
  const [inviteePreview, setInviteePreview] = useState<SelectionPreview | null>(null);
  const [inviterPreview, setInviterPreview] = useState<SelectionPreview | null>(null);
  const [pointPreview, setPointPreview] = useState<SelectionPreview | null>(null);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [highlightField, setHighlightField] = useState<"invitee" | "inviter" | null>(null);
  const [advancedToolsVisible, setAdvancedToolsVisible] = useState(false);
  const adjustFormRef = useRef<HTMLFormElement | null>(null);
  const inviteeInputRef = useRef<HTMLInputElement | null>(null);
  const inviterInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedInviteeMemberId = inviteeMemberId.trim();
  const normalizedInviterMemberId = inviterMemberId.trim();
  const isSelfRelationSelection =
    Boolean(normalizedInviteeMemberId) && normalizedInviteeMemberId === normalizedInviterMemberId;

  useEffect(() => {
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    if (!selectionNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSelectionNotice("");
      setHighlightField(null);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectionNotice]);

  const canAdjust = Boolean(normalizedInviteeMemberId && normalizedInviterMemberId && reason.trim() && !isSelfRelationSelection);
  const hasQuery = Boolean(searchDraft.trim());
  const activatedCount = rows.filter((row) => row.member.hasCompletedFirstVisit).length;
  const readyVoucherCount = rows.reduce(
    (total, row) => total + row.vouchers.filter((item) => item.status === "READY").length,
    0
  );
  const pointsTotal = rows.reduce((total, row) => total + (row.member.pointsBalance ?? 0), 0);
  const relationCount = rows.filter((row) => Boolean(row.relation)).length;
  const memberLookup = useMemo(() => {
    return rows.reduce<Record<string, MemberSearchRow>>((accumulator, row) => {
      accumulator[row.member._id] = row;
      return accumulator;
    }, {});
  }, [rows]);
  const pageButtons = useMemo(
    () => buildVisiblePages(pagination.page, pagination.totalPages),
    [pagination.page, pagination.totalPages]
  );

  function requestConfirm(message: string) {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return true;
    }
    return window.confirm(message);
  }

  function describeMember(memberId: string, preview?: SelectionPreview | null) {
    const row = memberLookup[memberId];
    if (row) {
      return `${getMemberDisplayName(row)}（${maskPhone(row.member.phone)}）`;
    }
    if (preview?.name) {
      return `${preview.name}（${preview.memberCode || memberId}）`;
    }
    return memberId;
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSearch(searchDraft.trim(), 1);
  }

  async function handleResetSearch() {
    setSearchDraft("");
    await onSearch("", 1);
  }

  async function handleAdjustSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSelfRelationSelection) {
      setSelectionNotice("邀请人和被邀请人不能是同一会员");
      setHighlightField("inviter");
      focusAdjustField("inviter");
      return;
    }

    if (!canAdjust) {
      return;
    }

    const confirmMessage = `确认把 ${describeMember(normalizedInviteeMemberId, inviteePreview)} 的邀请人改成 ${describeMember(normalizedInviterMemberId, inviterPreview)}？`;
    if (!requestConfirm(confirmMessage)) {
      return;
    }

    await onAdjust(inviteeMemberId.trim(), inviterMemberId.trim(), reason.trim());
    setInviteeMemberId("");
    setInviterMemberId("");
    setReason("");
    setInviteePreview(null);
    setInviterPreview(null);
    setSelectionNotice("邀请关系已提交，请看顶部提示。");
    setHighlightField(null);
  }

  async function handlePointAdjustSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const delta = Number(pointDelta);
    if (!pointMemberId.trim() || !pointReason.trim() || !Number.isInteger(delta) || delta === 0) {
      return;
    }

    const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
    const confirmMessage = `确认给 ${describeMember(pointMemberId.trim(), pointPreview)} 调整 ${deltaText} 积分？`;
    if (!requestConfirm(confirmMessage)) {
      return;
    }

    await onAdjustPoints(pointMemberId.trim(), delta, pointReason.trim());
    setPointMemberId("");
    setPointDelta("");
    setPointReason("");
    setPointPreview(null);
    setSelectionNotice("积分调整已提交，请看顶部提示。");
  }

  function getMemberDisplayName(row: MemberSearchRow) {
    return row.member.nickname || row.member.phone || row.member.memberCode || row.member._id;
  }

  function focusAdjustField(target: "invitee" | "inviter") {
    adjustFormRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "start"
    });

    if (target === "invitee") {
      inviteeInputRef.current?.focus();
      return;
    }

    inviterInputRef.current?.focus();
  }

  function handleSelectMember(target: "invitee" | "inviter", row: MemberSearchRow) {
    const memberId = row.member._id;
    const memberName = getMemberDisplayName(row);
    const oppositeTarget = target === "invitee" ? "inviter" : "invitee";
    const oppositeMemberId = target === "invitee" ? normalizedInviterMemberId : normalizedInviteeMemberId;

    if (oppositeMemberId && oppositeMemberId === memberId) {
      setSelectionNotice("邀请人和被邀请人不能是同一会员");
      setHighlightField(oppositeTarget);
      focusAdjustField(oppositeTarget);
      return;
    }

    const preview = {
      memberId,
      memberCode: row.member.memberCode,
      name: memberName
    };

    if (target === "invitee") {
      setInviteeMemberId(memberId);
      setInviteePreview(preview);
      setHighlightField("invitee");
      setSelectionNotice(`已带入被邀请会员：${memberName}`);
    } else {
      setInviterMemberId(memberId);
      setInviterPreview(preview);
      setHighlightField("inviter");
      setSelectionNotice(`已带入邀请人会员：${memberName}`);
    }

    setAdvancedToolsVisible(true);
    focusAdjustField(target);
  }

  function handleSelectPointMember(row: MemberSearchRow) {
    const memberName = getMemberDisplayName(row);
    setPointMemberId(row.member._id);
    setPointPreview({
      memberId: row.member._id,
      memberCode: row.member.memberCode,
      name: memberName
    });
    setAdvancedToolsVisible(true);
    setSelectionNotice(`已带入积分调整会员：${memberName}`);
  }

  return (
    <div className="section-stack">
      <div className="split member-query-grid">
        <form className="row-card stack" onSubmit={handleSearchSubmit}>
          <div className="card-title-block">
            <div className="section-eyebrow">会员列表</div>
            <h3 className="section-title">会员检索</h3>
            <p className="subtle">可搜手机号、会员号和昵称。</p>
          </div>

          <label className="field-label" htmlFor="member-search-input">
            手机号 / 会员号 / 昵称
            <input
              id="member-search-input"
              className="field"
              placeholder="输入手机号、会员号或昵称"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button className="button button-primary" disabled={loading} type="submit">
              {loading ? "加载中..." : hasQuery ? "搜索会员" : "加载最近会员"}
            </button>
            <button className="button button-secondary" disabled={loading || !hasQuery} onClick={() => void handleResetSearch()} type="button">
              重置筛选
            </button>
          </div>

          <div className="member-toolbar-strip">
            <div className="toolbar-pill">
              {pagination.total > 0 ? `显示 ${pagination.rangeStart}-${pagination.rangeEnd} / ${pagination.total}` : "暂无会员"}
            </div>
            <div className="toolbar-pill">{hasQuery ? `筛选：${searchDraft.trim()}` : "最近更新"}</div>
          </div>
        </form>

        <div className="section-stack member-action-stack">
          <div className="row-card stack">
            <div className="card-title-block">
              <div className="section-eyebrow">高级修正</div>
              <h3 className="section-title">人工调整</h3>
              <p className="subtle">平时先查会员。误绑邀请关系或需要补扣积分时，再展开这里处理。</p>
            </div>

            <div className="button-row">
              <button
                className="button button-secondary"
                onClick={() => setAdvancedToolsVisible((current) => !current)}
                type="button"
              >
                {advancedToolsVisible ? "收起高级修正" : "展开高级修正"}
              </button>
            </div>
          </div>

          {advancedToolsVisible ? (
            <form
              ref={adjustFormRef}
              className={`row-card stack member-adjust-card ${highlightField ? "member-adjust-card-active" : ""}`}
              onSubmit={handleAdjustSubmit}
            >
              <div className="card-title-block">
                <div className="section-eyebrow">邀请关系</div>
                <h3 className="section-title">邀请关系修正</h3>
                <p className="subtle">只在误绑时处理，可直接从列表带入。</p>
              </div>

              {selectionNotice ? (
                <div className="member-selection-notice" role="status">
                  {selectionNotice}
                </div>
              ) : null}
              {isSelfRelationSelection ? (
                <div className="error" role="alert">
                  邀请人和被邀请人不能是同一会员，请重新选择。
                </div>
              ) : null}

              <div className="selection-summary-grid">
                <div className={`summary-card selection-summary-card ${inviteeMemberId ? "selection-summary-card-active" : ""}`}>
                  <div className="summary-kicker">被邀请会员</div>
                  <div className="summary-value summary-value-text">
                    {inviteePreview?.name || (inviteeMemberId.trim() ? inviteeMemberId.trim() : "未选择")}
                  </div>
                  <div className="summary-footnote">
                    {inviteePreview
                      ? `${inviteePreview.memberCode || "无会员号"} · 已从列表带入`
                      : "可从下方带入，也可手动输入。"}
                  </div>
                </div>
                <div className={`summary-card selection-summary-card ${inviterMemberId ? "selection-summary-card-active" : ""}`}>
                  <div className="summary-kicker">邀请人会员</div>
                  <div className="summary-value summary-value-text">
                    {inviterPreview?.name || (inviterMemberId.trim() ? inviterMemberId.trim() : "未选择")}
                  </div>
                  <div className="summary-footnote">
                    {inviterPreview
                      ? `${inviterPreview.memberCode || "无会员号"} · 已从列表带入`
                      : "可从下方带入，也可手动输入。"}
                  </div>
                </div>
              </div>

              <div className="field-grid">
                <label
                  className={`field-label ${highlightField === "invitee" ? "field-label-active" : ""}`}
                  htmlFor="invitee-member-id"
                >
                  被邀请会员 ID
                  <input
                    id="invitee-member-id"
                    className="field"
                    disabled={adjusting}
                    placeholder="被邀请会员 ID"
                    ref={inviteeInputRef}
                    value={inviteeMemberId}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setInviteeMemberId(nextValue);
                      if (!inviteePreview || inviteePreview.memberId !== nextValue.trim()) {
                        setInviteePreview(null);
                      }
                    }}
                  />
                </label>

                <label
                  className={`field-label ${highlightField === "inviter" ? "field-label-active" : ""}`}
                  htmlFor="inviter-member-id"
                >
                  新邀请人会员 ID
                  <input
                    id="inviter-member-id"
                    className="field"
                    disabled={adjusting}
                    placeholder="新邀请人会员 ID"
                    ref={inviterInputRef}
                    value={inviterMemberId}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setInviterMemberId(nextValue);
                      if (!inviterPreview || inviterPreview.memberId !== nextValue.trim()) {
                        setInviterPreview(null);
                      }
                    }}
                  />
                </label>
              </div>

              <label className="field-label" htmlFor="adjust-reason">
                调整原因
                <textarea
                  id="adjust-reason"
                  className="textarea"
                  disabled={adjusting}
                  placeholder="例如：顾客提供了正确邀请人信息"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>

              <div className="button-row">
                <button className="button button-secondary" disabled={!canAdjust || adjusting} type="submit">
                  {adjusting ? "提交中..." : "保存关系修正"}
                </button>
              </div>
            </form>
          ) : null}

          {advancedToolsVisible ? (
            <form className="row-card stack" onSubmit={handlePointAdjustSubmit}>
            <div className="card-title-block">
              <div className="section-eyebrow">积分调整</div>
              <h3 className="section-title">积分补扣</h3>
              <p className="subtle">正数加分，负数扣分，都会进流水。</p>
            </div>

            <div className={`summary-card selection-summary-card ${pointMemberId ? "selection-summary-card-active" : ""}`}>
              <div className="summary-kicker">目标会员</div>
              <div className="summary-value summary-value-text">
                {pointPreview?.name || (pointMemberId.trim() ? pointMemberId.trim() : "未选择")}
              </div>
              <div className="summary-footnote">
                {pointPreview
                  ? `${pointPreview.memberCode || "无会员号"} · 已从列表带入`
                  : "可从下方带入，也可手动输入。"}
              </div>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="point-member-id">
                会员 ID
                <input
                  id="point-member-id"
                  className="field"
                  disabled={adjustingPoints}
                  placeholder="需要调整积分的会员 ID"
                  value={pointMemberId}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setPointMemberId(nextValue);
                    if (!pointPreview || pointPreview.memberId !== nextValue.trim()) {
                      setPointPreview(null);
                    }
                  }}
                />
              </label>

              <label className="field-label" htmlFor="point-delta">
                积分变动
                <input
                  id="point-delta"
                  className="field"
                  disabled={adjustingPoints}
                  placeholder="例如 20 或 -10"
                  value={pointDelta}
                  onChange={(event) => setPointDelta(event.target.value)}
                />
              </label>
            </div>

            <label className="field-label" htmlFor="point-reason">
              调整原因
              <textarea
                id="point-reason"
                className="textarea"
                disabled={adjustingPoints}
                placeholder="例如：到店补偿 20 积分"
                value={pointReason}
                onChange={(event) => setPointReason(event.target.value)}
              />
            </label>

            <div className="button-row">
              <button
                className="button button-secondary"
                disabled={
                  adjustingPoints ||
                  !pointMemberId.trim() ||
                  !pointReason.trim() ||
                  !Number.isInteger(Number(pointDelta)) ||
                  Number(pointDelta) === 0
                }
                type="submit"
              >
                {adjustingPoints ? "提交中..." : "保存积分调整"}
              </button>
            </div>
            </form>
          ) : null}
        </div>
      </div>

      {hasSearched ? (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-kicker">会员总数</div>
            <div className="summary-value">{pagination.total}</div>
            <div className="summary-footnote">当前结果</div>
          </div>
          <div className="summary-card">
            <div className="summary-kicker">当前页激活</div>
            <div className="summary-value">{activatedCount}</div>
            <div className="summary-footnote">已完成首单</div>
          </div>
          <div className="summary-card">
            <div className="summary-kicker">当前页可用券</div>
            <div className="summary-value">{readyVoucherCount}</div>
            <div className="summary-footnote">可继续核销</div>
          </div>
          <div className="summary-card">
            <div className="summary-kicker">当前页积分</div>
            <div className="summary-value">{pointsTotal}</div>
            <div className="summary-footnote">积分合计</div>
          </div>
          <div className="summary-card">
            <div className="summary-kicker">当前页已绑邀请</div>
            <div className="summary-value">{relationCount}</div>
            <div className="summary-footnote">已绑邀请</div>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="tag tag-navy">{hasSearched ? "没有匹配结果" : "准备加载会员"}</div>
          <h3 className="section-title">{hasSearched ? "当前条件下没有会员" : "会员列表还没加载"}</h3>
          <p className="subtle">
            {hasSearched
              ? "换个手机号、会员号或昵称再试。"
              : "可以直接搜，也可以先加载最近会员。"}
          </p>
        </div>
      ) : (
        <div className="section-stack">
          <div className="row-card member-results-shell">
            <div className="member-results-toolbar">
              <div className="card-title-block">
                <div className="section-eyebrow">当前结果</div>
                <h3 className="section-title">会员列表</h3>
                <p className="subtle">
                  {pagination.total > 0 ? `第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.total} 位` : "暂无会员"}
                </p>
              </div>

              <div className="pagination-bar">
                <button
                  className="button button-secondary"
                  disabled={loading || !pagination.hasPrevPage}
                  onClick={() => void onSearch(query, pagination.page - 1)}
                  type="button"
                >
                  上一页
                </button>

                <div className="pagination-group">
                  {pageButtons.map((pageNumber) => (
                    <button
                      className={`page-chip ${pageNumber === pagination.page ? "page-chip-active" : ""}`}
                      disabled={loading}
                      key={pageNumber}
                      onClick={() => void onSearch(query, pageNumber)}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>

                <button
                  className="button button-secondary"
                  disabled={loading || !pagination.hasNextPage}
                  onClick={() => void onSearch(query, pagination.page + 1)}
                  type="button"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>

          <div className="table-like member-result-grid">
            {rows.map((row) => {
              const latestVisit = row.visits
                .slice()
                .sort((left, right) => new Date(right.verifiedAt).getTime() - new Date(left.verifiedAt).getTime())[0];
              const readyCount = row.vouchers.filter((item) => item.status === "READY").length;
              const usedCount = row.vouchers.filter((item) => item.status === "USED").length;
              const expiredCount = row.vouchers.filter((item) => item.status === "EXPIRED" || item.status === "VOID").length;
              const recentPointTransactions = (row.pointTransactions || []).slice(0, 6);

              return (
                <div className="row-card member-result-card" key={row.member._id}>
                  <div className="card-header">
                    <div className="card-title-block">
                      <div className="inline-tags">
                        <div className="tag tag-navy">{row.member.memberCode}</div>
                        <div className={row.member.phoneVerifiedAt ? "tag tag-success" : "tag"}>
                          {row.member.phoneVerifiedAt ? "微信已验证" : "未验证手机号"}
                        </div>
                        <div className={row.member.hasCompletedFirstVisit ? "tag tag-success" : "tag tag-navy"}>
                          {row.member.hasCompletedFirstVisit ? "已激活" : "待首单"}
                        </div>
                      </div>
                      <h3 className="section-title">{row.member.nickname || row.member.phone || "未命名会员"}</h3>
                      <p className="subtle">
                        {row.member.phone || "未绑定手机号"} |{" "}
                        {row.member.hasCompletedFirstVisit
                          ? `首次有效消费：${formatDateTime(row.member.firstVisitAt)}`
                          : "首次有效消费尚未完成"}
                      </p>
                    </div>
                    <div className="inline-tags">
                      {advancedToolsVisible ? (
                        <>
                          <button
                            aria-pressed={inviteeMemberId === row.member._id}
                            className={`button button-secondary ${inviteeMemberId === row.member._id ? "button-selected" : ""}`}
                            onClick={() => handleSelectMember("invitee", row)}
                            type="button"
                          >
                            设为被邀请人
                          </button>
                          <button
                            aria-pressed={inviterMemberId === row.member._id}
                            className={`button button-secondary ${inviterMemberId === row.member._id ? "button-selected" : ""}`}
                            onClick={() => handleSelectMember("inviter", row)}
                            type="button"
                          >
                            设为邀请人
                          </button>
                          <button className="button button-secondary" onClick={() => handleSelectPointMember(row)} type="button">
                            调整积分
                          </button>
                        </>
                      ) : (
                        <button className="button button-secondary" onClick={() => setAdvancedToolsVisible(true)} type="button">
                          高级修正
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="member-stat-grid">
                    <div className="summary-card member-inline-card">
                      <div className="summary-kicker">当前积分</div>
                      <div className="summary-value summary-value-text">{row.member.pointsBalance ?? 0}</div>
                      <div className="summary-footnote">可兑换</div>
                    </div>
                    <div className="summary-card member-inline-card">
                      <div className="summary-kicker">邀请关系</div>
                      <div className="summary-value summary-value-text">{formatRelationStatus(row.relation?.status)}</div>
                      <div className="summary-footnote">当前状态</div>
                    </div>
                    <div className="summary-card member-inline-card">
                      <div className="summary-kicker">最近核销</div>
                      <div className="summary-value summary-value-text">
                        {latestVisit ? formatDateTime(latestVisit.verifiedAt) : "暂无记录"}
                      </div>
                      <div className="summary-footnote">{latestVisit ? `订单号：${latestVisit.externalOrderNo}` : "暂无消费记录"}</div>
                    </div>
                    <div className="summary-card member-inline-card">
                      <div className="summary-kicker">菜品券</div>
                      <div className="summary-value summary-value-text">
                        可用 {readyCount} / 已用 {usedCount} / 失效 {expiredCount}
                      </div>
                      <div className="summary-footnote">券状态</div>
                    </div>
                  </div>

                  <div className="data-points">
                    <div className="data-point">
                      <span className="data-label">消费核销记录</span>
                      <span className="data-value">{row.visits.length} 笔</span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">创建时间</span>
                      <span className="data-value">{formatDateTime(row.member.createdAt)}</span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">最近更新时间</span>
                      <span className="data-value">{formatDateTime(row.member.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="section-stack">
                    <div className="card-title-block">
                      <div className="section-eyebrow">积分流水</div>
                      <h3 className="section-title">最近变动</h3>
                      <p className="subtle">最近 20 条里展示前 6 条。</p>
                    </div>

                    {recentPointTransactions.length > 0 ? (
                      <div className="table-like order-log-list">
                        {recentPointTransactions.map((transaction) => (
                          <div className="order-log-row" key={transaction._id}>
                            <div className="inline-tags">
                              <div className={transaction.changeAmount >= 0 ? "tag tag-success" : "tag"}>
                                {transaction.changeAmount >= 0 ? `+${transaction.changeAmount}` : transaction.changeAmount}
                              </div>
                              <div className="tag tag-navy">余额 {transaction.balanceAfter}</div>
                            </div>
                            <div className="stack">
                              <strong>{formatPointTransactionLabel(transaction)}</strong>
                              <span className="subtle tiny">{formatDateTime(transaction.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state order-logs-empty">
                        <div className="tag">暂无流水</div>
                        <p className="subtle">这位会员还没有积分变动记录。</p>
                      </div>
                    )}
                  </div>

                  <div className="code-stack">
                    <div className="code-line">
                      <span className="data-label">会员 ID</span>
                      <code className="code-pill">{row.member._id}</code>
                    </div>
                    <div className="code-line">
                      <span className="data-label">邀请人会员 ID</span>
                      <code className="code-pill">{row.relation?.inviterMemberId ?? "未绑定"}</code>
                    </div>
                    <div className="code-line">
                      <span className="data-label">被邀请会员 ID</span>
                      <code className="code-pill">{row.relation?.inviteeMemberId ?? row.member._id}</code>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
