import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  assertPointExchangeItemsValid,
  assertRewardRulesConfigValid,
  type PointExchangeItem,
  type RewardRule
} from "@restaurant/shared";

interface RulesEditorProps {
  initialRules: RewardRule[];
  initialExchangeItems: PointExchangeItem[];
  saving: boolean;
  onSave: (rules: RewardRule[], exchangeItems: PointExchangeItem[]) => Promise<void>;
}

const DEFAULT_STORE_ID = "default-store";

function nowIso() {
  return new Date().toISOString();
}

function createRuleId(type: RewardRule["type"]) {
  return `${type === "WELCOME" ? "rule-welcome" : "rule-invite"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createExchangeItemId() {
  return `exchange-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createRuleDraft(type: RewardRule["type"], sortOrder: number): RewardRule {
  const now = nowIso();
  if (type === "WELCOME") {
    return {
      _id: createRuleId(type),
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
      name: "新客首单礼",
      type,
      isEnabled: true,
      sortOrder,
      voucherTemplate: {
        dishId: "welcome-dish",
        dishName: "欢迎菜品 1 份",
        validDays: 30
      }
    };
  }

  return {
    _id: createRuleId(type),
    storeId: DEFAULT_STORE_ID,
    createdAt: now,
    updatedAt: now,
    name: "邀请积分规则",
    type,
    threshold: 1,
    rewardMode: "ONCE",
    pointsReward: 10,
    isEnabled: true,
    sortOrder
  };
}

function createExchangeItemDraft(sortOrder: number): PointExchangeItem {
  const now = nowIso();
  return {
    _id: createExchangeItemId(),
    storeId: DEFAULT_STORE_ID,
    createdAt: now,
    updatedAt: now,
    name: "积分兑换菜品",
    pointsCost: 30,
    isEnabled: true,
    sortOrder,
    voucherTemplate: {
      dishId: "exchange-dish",
      dishName: "招牌菜 1 份",
      validDays: 30
    }
  };
}

function createDefaultRules(): RewardRule[] {
  const now = nowIso();
  return [
    {
      _id: "rule-welcome-default",
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
      name: "新客首单礼",
      type: "WELCOME",
      isEnabled: true,
      sortOrder: 0,
      voucherTemplate: {
        dishId: "welcome-drink",
        dishName: "欢迎饮品 1 份",
        validDays: 30
      }
    },
    {
      _id: "rule-invite-1",
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
      name: "邀请 1 人得积分",
      type: "INVITE_MILESTONE",
      threshold: 1,
      rewardMode: "ONCE",
      pointsReward: 10,
      isEnabled: true,
      sortOrder: 0
    },
    {
      _id: "rule-invite-3",
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
      name: "邀请 3 人得积分",
      type: "INVITE_MILESTONE",
      threshold: 3,
      rewardMode: "ONCE",
      pointsReward: 35,
      isEnabled: true,
      sortOrder: 1
    }
  ];
}

function createDefaultExchangeItems(): PointExchangeItem[] {
  const now = nowIso();
  return [
    {
      _id: "exchange-drink-default",
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
      name: "积分兑饮品",
      pointsCost: 20,
      isEnabled: true,
      sortOrder: 0,
      voucherTemplate: {
        dishId: "exchange-drink",
        dishName: "特调饮品 1 份",
        validDays: 30
      }
    },
    {
      _id: "exchange-signature-default",
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
      name: "积分兑招牌菜",
      pointsCost: 60,
      isEnabled: true,
      sortOrder: 1,
      voucherTemplate: {
        dishId: "exchange-signature",
        dishName: "招牌热菜 1 份",
        validDays: 30
      }
    }
  ];
}

function normalizeRules(rules: RewardRule[]): RewardRule[] {
  const welcomeRules = rules
    .filter((rule) => rule.type === "WELCOME")
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
    .map((rule, index) => ({
      ...rule,
      sortOrder: index,
      threshold: undefined,
      rewardMode: undefined,
      pointsReward: undefined,
      name: rule.name.trim(),
      voucherTemplate: {
        dishId: rule.voucherTemplate?.dishId?.trim() ?? "",
        dishName: rule.voucherTemplate?.dishName?.trim() ?? "",
        validDays: Math.max(1, Number(rule.voucherTemplate?.validDays) || 1),
        dishImageUrl: rule.voucherTemplate?.dishImageUrl
      }
    }));

  const inviteRules = rules
    .filter((rule) => rule.type === "INVITE_MILESTONE")
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
    .map((rule, index) => ({
      ...rule,
      sortOrder: index,
      name: rule.name.trim(),
      threshold: Math.max(1, Number(rule.threshold) || 1),
      rewardMode: rule.rewardMode ?? "ONCE",
      pointsReward: Math.max(1, Number(rule.pointsReward) || 1),
      voucherTemplate: undefined
    }));

  return [...welcomeRules, ...inviteRules];
}

function normalizeExchangeItems(items: PointExchangeItem[]): PointExchangeItem[] {
  return items
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
    .map((item, index) => ({
      ...item,
      sortOrder: index,
      name: item.name.trim(),
      pointsCost: Math.max(1, Number(item.pointsCost) || 1),
      voucherTemplate: {
        ...item.voucherTemplate,
        dishId: item.voucherTemplate.dishId.trim(),
        dishName: item.voucherTemplate.dishName.trim(),
        validDays: Math.max(1, Number(item.voucherTemplate.validDays) || 1)
      }
    }));
}

function serializeRules(rules: RewardRule[]) {
  return JSON.stringify(
    normalizeRules(rules).map((rule) => ({
      _id: rule._id,
      name: rule.name,
      type: rule.type,
      threshold: rule.threshold,
      rewardMode: rule.rewardMode,
      pointsReward: rule.pointsReward,
      isEnabled: rule.isEnabled,
      sortOrder: rule.sortOrder,
      voucherTemplate: rule.voucherTemplate
    }))
  );
}

function serializeExchangeItems(items: PointExchangeItem[]) {
  return JSON.stringify(
    normalizeExchangeItems(items).map((item) => ({
      _id: item._id,
      name: item.name,
      pointsCost: item.pointsCost,
      isEnabled: item.isEnabled,
      sortOrder: item.sortOrder,
      voucherTemplate: item.voucherTemplate
    }))
  );
}

function resequence<T extends { sortOrder: number }>(items: T[]) {
  return items.map((item, index) => ({
    ...item,
    sortOrder: index
  }));
}

function buildRuleLabel(rule: RewardRule) {
  if (rule.type === "WELCOME") {
    return "新客首单礼";
  }

  return rule.rewardMode === "REPEATABLE" ? `每满 ${rule.threshold ?? "-"} 人` : `达标 ${rule.threshold ?? "-"} 人`;
}

function EditorCardActions(props: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="button-row">
      <button className="button button-secondary" disabled={!props.canMoveUp} type="button" onClick={props.onMoveUp}>
        上移一位
      </button>
      <button className="button button-secondary" disabled={!props.canMoveDown} type="button" onClick={props.onMoveDown}>
        下移一位
      </button>
      <button className="button button-secondary" type="button" onClick={props.onDuplicate}>
        复制
      </button>
      <button className="button button-danger" type="button" onClick={props.onDelete}>
        删除
      </button>
    </div>
  );
}

export function RulesEditor({ initialRules, initialExchangeItems, saving, onSave }: RulesEditorProps) {
  const [rules, setRules] = useState<RewardRule[]>(() => normalizeRules(initialRules));
  const [exchangeItems, setExchangeItems] = useState<PointExchangeItem[]>(() => normalizeExchangeItems(initialExchangeItems));
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    setRules(normalizeRules(initialRules));
    setExchangeItems(normalizeExchangeItems(initialExchangeItems));
    setValidationMessage("");
  }, [initialExchangeItems, initialRules]);

  const normalizedRules = useMemo(() => normalizeRules(rules), [rules]);
  const normalizedExchangeItems = useMemo(() => normalizeExchangeItems(exchangeItems), [exchangeItems]);
  const welcomeRules = normalizedRules.filter((rule) => rule.type === "WELCOME");
  const inviteRules = normalizedRules.filter((rule) => rule.type === "INVITE_MILESTONE");
  const enabledRuleCount = normalizedRules.filter((rule) => rule.isEnabled).length;
  const repeatableCount = inviteRules.filter((rule) => rule.rewardMode === "REPEATABLE" && rule.isEnabled).length;
  const enabledExchangeCount = normalizedExchangeItems.filter((item) => item.isEnabled).length;
  const hasUnsavedChanges = useMemo(
    () =>
      serializeRules(normalizedRules) !== serializeRules(initialRules) ||
      serializeExchangeItems(normalizedExchangeItems) !== serializeExchangeItems(initialExchangeItems),
    [initialExchangeItems, initialRules, normalizedExchangeItems, normalizedRules]
  );

  function updateRules(nextRules: RewardRule[]) {
    setValidationMessage("");
    setRules(normalizeRules(nextRules));
  }

  function updateExchangeItems(nextItems: PointExchangeItem[]) {
    setValidationMessage("");
    setExchangeItems(normalizeExchangeItems(nextItems));
  }

  function updateRule(ruleId: string, patch: Partial<RewardRule>) {
    updateRules(rules.map((rule) => (rule._id === ruleId ? { ...rule, ...patch } : rule)));
  }

  function updateRuleVoucher(ruleId: string, patch: Partial<NonNullable<RewardRule["voucherTemplate"]>>) {
    updateRules(
      rules.map((rule) =>
        rule._id === ruleId
          ? {
              ...rule,
              voucherTemplate: {
                dishId: rule.voucherTemplate?.dishId ?? "",
                dishName: rule.voucherTemplate?.dishName ?? "",
                validDays: rule.voucherTemplate?.validDays ?? 30,
                dishImageUrl: rule.voucherTemplate?.dishImageUrl,
                ...patch
              }
            }
          : rule
      )
    );
  }

  function addRule(type: RewardRule["type"]) {
    updateRules([...rules, createRuleDraft(type, rules.filter((rule) => rule.type === type).length)]);
  }

  function duplicateRule(ruleId: string) {
    const source = rules.find((rule) => rule._id === ruleId);
    if (!source) {
      return;
    }

    const now = nowIso();
    updateRules([
      ...rules,
      {
        ...source,
        _id: createRuleId(source.type),
        name: `${source.name}（副本）`,
        createdAt: now,
        updatedAt: now,
        sortOrder: rules.filter((rule) => rule.type === source.type).length
      }
    ]);
  }

  function removeRule(ruleId: string) {
    updateRules(rules.filter((rule) => rule._id !== ruleId));
  }

  function moveRule(ruleId: string, direction: "up" | "down") {
    const ordered = normalizeRules(rules);
    const source = ordered.find((rule) => rule._id === ruleId);
    if (!source) {
      return;
    }

    const group = ordered.filter((rule) => rule.type === source.type);
    const currentIndex = group.findIndex((rule) => rule._id === ruleId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= group.length) {
      return;
    }

    const nextGroup = group.slice();
    const [item] = nextGroup.splice(currentIndex, 1);
    nextGroup.splice(targetIndex, 0, item);
    const otherGroup = ordered.filter((rule) => rule.type !== source.type);
    updateRules(source.type === "WELCOME" ? [...resequence(nextGroup), ...otherGroup] : [...otherGroup, ...resequence(nextGroup)]);
  }

  function updateExchangeItem(itemId: string, patch: Partial<PointExchangeItem>) {
    updateExchangeItems(exchangeItems.map((item) => (item._id === itemId ? { ...item, ...patch } : item)));
  }

  function updateExchangeVoucher(itemId: string, patch: Partial<PointExchangeItem["voucherTemplate"]>) {
    updateExchangeItems(
      exchangeItems.map((item) =>
        item._id === itemId
          ? {
              ...item,
              voucherTemplate: {
                ...item.voucherTemplate,
                ...patch
              }
            }
          : item
      )
    );
  }

  function addExchangeItem() {
    updateExchangeItems([...exchangeItems, createExchangeItemDraft(exchangeItems.length)]);
  }

  function duplicateExchangeItem(itemId: string) {
    const source = exchangeItems.find((item) => item._id === itemId);
    if (!source) {
      return;
    }

    const now = nowIso();
    updateExchangeItems([
      ...exchangeItems,
      {
        ...source,
        _id: createExchangeItemId(),
        name: `${source.name}（副本）`,
        createdAt: now,
        updatedAt: now,
        sortOrder: exchangeItems.length
      }
    ]);
  }

  function removeExchangeItem(itemId: string) {
    updateExchangeItems(exchangeItems.filter((item) => item._id !== itemId));
  }

  function moveExchangeItem(itemId: string, direction: "up" | "down") {
    const ordered = normalizeExchangeItems(exchangeItems);
    const currentIndex = ordered.findIndex((item) => item._id === itemId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
      return;
    }

    const nextItems = ordered.slice();
    const [item] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, item);
    updateExchangeItems(resequence(nextItems));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRules = normalizeRules(rules);
    const nextExchangeItems = normalizeExchangeItems(exchangeItems);

    try {
      assertRewardRulesConfigValid(nextRules);
      assertPointExchangeItemsValid(nextExchangeItems);
      setValidationMessage("");
      setRules(nextRules);
      setExchangeItems(nextExchangeItems);
      await onSave(nextRules, nextExchangeItems);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : "配置校验失败，请检查后重试。");
    }
  }

  function loadTemplate() {
    updateRules(createDefaultRules());
    updateExchangeItems(createDefaultExchangeItems());
  }

  function renderWelcomeRule(rule: RewardRule, index: number, total: number) {
    return (
      <div className={`row-card rule-card ${!rule.isEnabled ? "rule-card-disabled" : ""}`} key={rule._id}>
        <div className="card-header">
          <div className="card-title-block">
            <div className="rule-meta">
              <div className="tag">{buildRuleLabel(rule)}</div>
              <div className={rule.isEnabled ? "tag tag-success" : "tag tag-navy"}>{rule.isEnabled ? "已启用" : "已停用"}</div>
            </div>
            <h3 className="section-title">{rule.name || "未命名规则"}</h3>
            <p className="subtle tiny">
              当前顺序 {index + 1} / {total}
            </p>
          </div>
          <EditorCardActions
            canMoveUp={index > 0}
            canMoveDown={index < total - 1}
            onMoveUp={() => moveRule(rule._id, "up")}
            onMoveDown={() => moveRule(rule._id, "down")}
            onDuplicate={() => duplicateRule(rule._id)}
            onDelete={() => removeRule(rule._id)}
          />
        </div>

        <label className="field-label">
          规则名称
          <input aria-label={`rule-name-${rule._id}`} className="field" value={rule.name} onChange={(event) => updateRule(rule._id, { name: event.target.value })} />
        </label>

        <div className="field-grid">
          <label className="field-label">
            是否启用
            <select
              aria-label={`rule-enabled-${rule._id}`}
              className="field"
              value={rule.isEnabled ? "YES" : "NO"}
              onChange={(event) => updateRule(rule._id, { isEnabled: event.target.value === "YES" })}
            >
              <option value="YES">启用</option>
              <option value="NO">停用</option>
            </select>
          </label>
          <label className="field-label">
            券有效期（天）
            <input
              aria-label={`rule-valid-days-${rule._id}`}
              className="field"
              min={1}
              type="number"
              value={rule.voucherTemplate?.validDays ?? 30}
              onChange={(event) => updateRuleVoucher(rule._id, { validDays: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="toolbar-pill">新会员完成首次有效消费后，系统自动发放这张菜品券。</div>

        <label className="field-label">
          菜品名称
          <input
            aria-label={`rule-dish-${rule._id}`}
            className="field"
            value={rule.voucherTemplate?.dishName ?? ""}
            onChange={(event) => updateRuleVoucher(rule._id, { dishName: event.target.value })}
          />
        </label>
        <label className="field-label">
          菜品编码
          <input
            aria-label={`rule-dish-id-${rule._id}`}
            className="field"
            value={rule.voucherTemplate?.dishId ?? ""}
            onChange={(event) => updateRuleVoucher(rule._id, { dishId: event.target.value })}
          />
        </label>
      </div>
    );
  }

  function renderInviteRule(rule: RewardRule, index: number, total: number) {
    return (
      <div className={`row-card rule-card ${rule.rewardMode === "REPEATABLE" ? "rule-card-repeatable" : ""} ${!rule.isEnabled ? "rule-card-disabled" : ""}`} key={rule._id}>
        <div className="card-header">
          <div className="card-title-block">
            <div className="rule-meta">
              <div className="tag">{buildRuleLabel(rule)}</div>
              <div className={rule.isEnabled ? "tag tag-success" : "tag tag-navy"}>{rule.isEnabled ? "已启用" : "已停用"}</div>
              {rule.rewardMode === "REPEATABLE" ? <div className="tag tag-navy">循环积分</div> : null}
            </div>
            <h3 className="section-title">{rule.name || "未命名规则"}</h3>
            <p className="subtle tiny">
              当前顺序 {index + 1} / {total}
            </p>
          </div>
          <EditorCardActions
            canMoveUp={index > 0}
            canMoveDown={index < total - 1}
            onMoveUp={() => moveRule(rule._id, "up")}
            onMoveDown={() => moveRule(rule._id, "down")}
            onDuplicate={() => duplicateRule(rule._id)}
            onDelete={() => removeRule(rule._id)}
          />
        </div>

        <label className="field-label">
          规则名称
          <input aria-label={`rule-name-${rule._id}`} className="field" value={rule.name} onChange={(event) => updateRule(rule._id, { name: event.target.value })} />
        </label>

        <div className="field-grid">
          <label className="field-label">
            达标人数
            <input
              aria-label={`rule-threshold-${rule._id}`}
              className="field"
              min={1}
              type="number"
              value={rule.threshold ?? 1}
              onChange={(event) => updateRule(rule._id, { threshold: Number(event.target.value) })}
            />
          </label>
          <label className="field-label">
            奖励积分
            <input
              aria-label={`rule-points-${rule._id}`}
              className="field"
              min={1}
              type="number"
              value={rule.pointsReward ?? 1}
              onChange={(event) => updateRule(rule._id, { pointsReward: Number(event.target.value) })}
            />
          </label>
          <label className="field-label">
            发放方式
            <select
              aria-label={`rule-mode-${rule._id}`}
              className="field"
              value={rule.rewardMode ?? "ONCE"}
              onChange={(event) => updateRule(rule._id, { rewardMode: event.target.value === "REPEATABLE" ? "REPEATABLE" : "ONCE" })}
            >
              <option value="ONCE">达标后只送一次</option>
              <option value="REPEATABLE">每满 N 人循环送</option>
            </select>
          </label>
          <label className="field-label">
            是否启用
            <select
              aria-label={`rule-enabled-${rule._id}`}
              className="field"
              value={rule.isEnabled ? "YES" : "NO"}
              onChange={(event) => updateRule(rule._id, { isEnabled: event.target.value === "YES" })}
            >
              <option value="YES">启用</option>
              <option value="NO">停用</option>
            </select>
          </label>
        </div>

        <div className="toolbar-pill">
          {rule.rewardMode === "REPEATABLE"
            ? `每满 ${rule.threshold ?? 1} 位有效邀请，就继续给邀请人发 ${rule.pointsReward ?? 1} 积分。`
            : `达到 ${rule.threshold ?? 1} 位有效邀请后，只发一次 ${rule.pointsReward ?? 1} 积分。`}
        </div>
      </div>
    );
  }

  function renderExchangeItem(item: PointExchangeItem, index: number, total: number) {
    return (
      <div className={`row-card rule-card ${!item.isEnabled ? "rule-card-disabled" : ""}`} key={item._id}>
        <div className="card-header">
          <div className="card-title-block">
            <div className="rule-meta">
              <div className="tag">兑换项</div>
              <div className={item.isEnabled ? "tag tag-success" : "tag tag-navy"}>{item.isEnabled ? "已上架" : "已下架"}</div>
            </div>
            <h3 className="section-title">{item.name || "未命名兑换项"}</h3>
            <p className="subtle tiny">
              当前顺序 {index + 1} / {total}
            </p>
          </div>
          <EditorCardActions
            canMoveUp={index > 0}
            canMoveDown={index < total - 1}
            onMoveUp={() => moveExchangeItem(item._id, "up")}
            onMoveDown={() => moveExchangeItem(item._id, "down")}
            onDuplicate={() => duplicateExchangeItem(item._id)}
            onDelete={() => removeExchangeItem(item._id)}
          />
        </div>

        <label className="field-label">
          兑换项名称
          <input aria-label={`exchange-name-${item._id}`} className="field" value={item.name} onChange={(event) => updateExchangeItem(item._id, { name: event.target.value })} />
        </label>

        <div className="field-grid">
          <label className="field-label">
            所需积分
            <input
              aria-label={`exchange-points-${item._id}`}
              className="field"
              min={1}
              type="number"
              value={item.pointsCost}
              onChange={(event) => updateExchangeItem(item._id, { pointsCost: Number(event.target.value) })}
            />
          </label>
          <label className="field-label">
            券有效期（天）
            <input
              aria-label={`exchange-valid-days-${item._id}`}
              className="field"
              min={1}
              type="number"
              value={item.voucherTemplate.validDays}
              onChange={(event) => updateExchangeVoucher(item._id, { validDays: Number(event.target.value) })}
            />
          </label>
          <label className="field-label">
            是否上架
            <select
              aria-label={`exchange-enabled-${item._id}`}
              className="field"
              value={item.isEnabled ? "YES" : "NO"}
              onChange={(event) => updateExchangeItem(item._id, { isEnabled: event.target.value === "YES" })}
            >
              <option value="YES">上架</option>
              <option value="NO">下架</option>
            </select>
          </label>
        </div>

        <div className="toolbar-pill">会员积分足够时，会自动兑换成菜品券，后续仍由店员扫码核销。</div>

        <label className="field-label">
          菜品名称
          <input
            aria-label={`exchange-dish-${item._id}`}
            className="field"
            value={item.voucherTemplate.dishName}
            onChange={(event) => updateExchangeVoucher(item._id, { dishName: event.target.value })}
          />
        </label>
        <label className="field-label">
          菜品编码
          <input
            aria-label={`exchange-dish-id-${item._id}`}
            className="field"
            value={item.voucherTemplate.dishId}
            onChange={(event) => updateExchangeVoucher(item._id, { dishId: event.target.value })}
          />
        </label>
      </div>
    );
  }

  return (
    <form className="content-section" onSubmit={handleSubmit}>
      {validationMessage ? (
        <div className="error" role="alert">
          {validationMessage}
        </div>
      ) : null}

      {hasUnsavedChanges ? <div className="notice">当前有未保存变更，点击右上角“保存全部配置”后才会正式生效。</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-kicker">规则总数</div>
          <div className="summary-value">{normalizedRules.length}</div>
          <div className="summary-footnote">首单礼和邀请积分合计条数。</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">已启用规则</div>
          <div className="summary-value">{enabledRuleCount}</div>
          <div className="summary-footnote">保存后实际参与结算的规则。</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">循环积分</div>
          <div className="summary-value">{repeatableCount}</div>
          <div className="summary-footnote">每满 N 人可重复送积分的规则数量。</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">上架兑换项</div>
          <div className="summary-value">{enabledExchangeCount}</div>
          <div className="summary-footnote">会员当前可见的积分兑换菜品。</div>
        </div>
      </div>

      <div className="section-stack">
        <div className="section-banner rules-section-banner">
          <div className="panel-toolbar">
            <div className="stack">
              <div className="section-eyebrow">新客首单礼</div>
              <h3 className="section-title">首次有效消费后发券</h3>
              <p className="subtle">通常只保留 1 条启用规则，避免首单礼重复叠加。</p>
            </div>
            <div className="button-row">
              <button className="button button-secondary" type="button" onClick={() => addRule("WELCOME")}>
                新增首单礼
              </button>
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving ? "保存中..." : "保存全部配置"}
              </button>
            </div>
          </div>
          {welcomeRules.length === 0 ? (
            <div className="empty-state rules-empty-state">
              <div className="tag tag-navy">尚未配置首单礼</div>
              <p className="subtle">如果门店希望新会员首单后立即送菜品券，这里至少新增 1 条首单礼规则。</p>
            </div>
          ) : (
            <div className="rules-grid">{welcomeRules.map((rule, index) => renderWelcomeRule(rule, index, welcomeRules.length))}</div>
          )}
        </div>

        <div className="section-banner rules-section-banner">
          <div className="panel-toolbar">
            <div className="stack">
              <div className="section-eyebrow">邀请积分</div>
              <h3 className="section-title">邀请达标后自动送积分</h3>
              <p className="subtle">支持达标送一次，也支持“每满 N 人循环送积分”的长期玩法。</p>
            </div>
            <div className="button-row">
              <button className="button button-secondary" type="button" onClick={() => addRule("INVITE_MILESTONE")}>
                新增邀请积分
              </button>
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving ? "保存中..." : "保存全部配置"}
              </button>
            </div>
          </div>
          {inviteRules.length === 0 ? (
            <div className="empty-state rules-empty-state">
              <div className="tag tag-navy">尚未配置邀请积分</div>
              <p className="subtle">建议至少配 1 条邀请规则，让拉新人数和积分到账形成闭环。</p>
            </div>
          ) : (
            <div className="rules-grid">{inviteRules.map((rule, index) => renderInviteRule(rule, index, inviteRules.length))}</div>
          )}
        </div>

        <div className="section-banner rules-section-banner">
          <div className="panel-toolbar">
            <div className="stack">
              <div className="section-eyebrow">积分兑换</div>
              <h3 className="section-title">会员积分换菜品</h3>
              <p className="subtle">兑换成功后自动生成菜品券，店员核销方式不变。</p>
            </div>
            <div className="button-row">
              <button className="button button-secondary" type="button" onClick={addExchangeItem}>
                新增兑换菜品
              </button>
              <button className="button button-secondary" type="button" onClick={loadTemplate}>
                载入模板
              </button>
            </div>
          </div>
          {normalizedExchangeItems.length === 0 ? (
            <div className="empty-state rules-empty-state">
              <div className="tag tag-navy">尚未配置兑换菜品</div>
              <p className="subtle">会员有了积分也需要可兑换的菜品，否则积分无法形成完整闭环。</p>
            </div>
          ) : (
            <div className="rules-grid">
              {normalizedExchangeItems.map((item, index) => renderExchangeItem(item, index, normalizedExchangeItems.length))}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
