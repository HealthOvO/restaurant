import { DomainError } from "../errors";
import type { PointExchangeItem, RewardRule } from "../types";

type RewardRuleDraft = Pick<
  RewardRule,
  "_id" | "name" | "type" | "threshold" | "rewardMode" | "isEnabled" | "sortOrder" | "voucherTemplate" | "pointsReward"
>;

type PointExchangeItemDraft = Pick<
  PointExchangeItem,
  "_id" | "name" | "pointsCost" | "isEnabled" | "sortOrder" | "voucherTemplate"
>;

export interface RewardRuleSaveSummary {
  enabledWelcomeRuleCount: number;
  enabledMilestoneRuleCount: number;
  repeatableMilestoneRuleCount: number;
  enabledExchangeItemCount: number;
}

function assertDishTemplateValid(
  template: RewardRuleDraft["voucherTemplate"] | PointExchangeItemDraft["voucherTemplate"],
  message: string
) {
  if (!template || !template.dishId.trim() || !template.dishName.trim()) {
    throw new DomainError("INVALID_RULE_CONFIG", message);
  }
}

export function assertRewardRulesConfigValid(rules: RewardRuleDraft[]): void {
  const enabledWelcomeRules = rules.filter((rule) => rule.type === "WELCOME" && rule.isEnabled);
  if (enabledWelcomeRules.length > 1) {
    throw new DomainError("INVALID_RULE_CONFIG", "新客礼最多只能启用 1 条规则");
  }

  rules.forEach((rule) => {
    if (!rule.name.trim()) {
      throw new DomainError("INVALID_RULE_CONFIG", "规则名称不能为空");
    }

    if (rule.type === "WELCOME") {
      assertDishTemplateValid(rule.voucherTemplate, "新客礼必须配置菜品信息");

      if (rule.threshold !== undefined) {
        throw new DomainError("INVALID_RULE_CONFIG", "新客礼规则不应填写邀请人数门槛");
      }

      if (rule.rewardMode !== undefined) {
        throw new DomainError("INVALID_RULE_CONFIG", "新客礼规则不应配置循环奖励方式");
      }

      if (rule.pointsReward !== undefined) {
        throw new DomainError("INVALID_RULE_CONFIG", "新客礼规则不应配置邀请积分");
      }

      return;
    }

    if (!rule.threshold || rule.threshold < 1) {
      throw new DomainError("INVALID_RULE_CONFIG", "邀请积分规则必须配置大于 0 的人数门槛");
    }

    if (!rule.pointsReward || rule.pointsReward < 1) {
      throw new DomainError("INVALID_RULE_CONFIG", "邀请积分规则必须配置大于 0 的积分值");
    }
  });
}

export function assertPointExchangeItemsValid(items: PointExchangeItemDraft[]): void {
  items.forEach((item) => {
    if (!item.name.trim()) {
      throw new DomainError("INVALID_RULE_CONFIG", "兑换菜品名称不能为空");
    }

    if (!item.pointsCost || item.pointsCost < 1) {
      throw new DomainError("INVALID_RULE_CONFIG", "兑换菜品必须配置大于 0 的积分成本");
    }

    assertDishTemplateValid(item.voucherTemplate, "兑换菜品必须配置菜品信息");
  });
}

export function buildRewardRuleSaveSummary(
  rules: RewardRuleDraft[],
  exchangeItems: PointExchangeItemDraft[] = []
): RewardRuleSaveSummary {
  const enabledRules = rules.filter((rule) => rule.isEnabled);

  return {
    enabledWelcomeRuleCount: enabledRules.filter((rule) => rule.type === "WELCOME").length,
    enabledMilestoneRuleCount: enabledRules.filter((rule) => rule.type === "INVITE_MILESTONE").length,
    repeatableMilestoneRuleCount: enabledRules.filter(
      (rule) => rule.type === "INVITE_MILESTONE" && rule.rewardMode === "REPEATABLE"
    ).length,
    enabledExchangeItemCount: exchangeItems.filter((item) => item.isEnabled).length
  };
}
