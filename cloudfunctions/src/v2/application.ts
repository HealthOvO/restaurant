import { createHash, randomUUID } from "node:crypto";
import {
  businessDateAt,
  DomainError,
  formatPickupNumber,
  quoteV2CouponProduct,
  quoteV2Order,
  transitionV2Coupon,
  transitionV2Order,
  transitionV2Payment,
  transitionV2Refund,
  v2CategorySaveSchema,
  v2CouponExchangeSchema,
  v2CouponUseSchema,
  v2ExchangeItemSaveSchema,
  v2InviteBindSchema,
  v2OrderCreateSchema,
  v2ProductSaveSchema,
  v2StoreConfigSaveSchema,
  type V2Coupon,
  type V2CouponApplication,
  type V2Category,
  type V2ExchangeItem,
  type V2Member,
  type V2MemberDetail,
  type V2Order,
  type V2Payment,
  type V2PointLedger,
  type V2Product,
  type V2Refund,
  type V2StoreConfig
} from "@restaurant/shared";
import {
  classifyV2RefundSubmissionError,
  type V2PaymentProvider,
  type V2RefundSubmissionFailure
} from "./payment";
import type { V2OwnerOrderPageQuery, V2Repository, V2Transaction } from "./repository";

export interface V2Clock { now(): Date; }
const SYSTEM_CLOCK: V2Clock = { now: () => new Date() };

function stableHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${stableHash(prefix, ...parts).slice(0, 28)}`;
}

function orderNumber(orderId: string): string {
  return `V2${stableHash(orderId).slice(0, 26).toUpperCase()}`;
}

function memberCode(openId: string): string {
  return `M${stableHash("member-code", openId).slice(0, 8).toUpperCase()}`;
}

function inviteCode(openId: string): string {
  return stableHash("invite", openId).slice(0, 8).toUpperCase();
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

function nextQueryAt(now: Date, seconds = 30): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

const REFUND_WECHAT_ABNORMAL_MESSAGE = "退款异常，请到微信支付商户平台处理";

function shouldResubmitRefund(refund: V2Refund): boolean {
  return refund.status === "PROCESSING" && refund.recoveryAction === "RESUBMIT";
}

function couponProductSnapshot(product: V2Product): V2Product {
  const snapshot = structuredClone(product);
  const selections = snapshot.specGroups.map((group) => {
    const freeChoices = group.choices.filter((choice) => choice.enabled && choice.priceDelta === 0);
    if (group.required && freeChoices.length === 0) {
      throw new DomainError("COUPON_PRODUCT_UNAVAILABLE", `${group.name}没有可用于商品券的免费选项`);
    }
    return { groupId: group.id, choiceIds: group.required ? [freeChoices[0].id] : [] };
  });
  quoteV2CouponProduct(snapshot, selections);
  return snapshot;
}

function orderCouponApplications(order: V2Order): V2CouponApplication[] {
  if (order.couponApplications?.length) return order.couponApplications;
  if (!order.couponId) return [];
  const line = order.lineItems.find((item) => item.couponId === order.couponId) ?? order.lineItems[0];
  return [{
    couponId: order.couponId,
    couponName: order.couponName ?? "商品券",
    productId: line?.productId ?? "",
    productName: line?.productName ?? "指定商品",
    pointsCost: order.couponPointsCost ?? 0,
    lineId: line?.lineId ?? "line-1"
  }];
}

export class V2Application {
  constructor(
    private readonly repository: V2Repository,
    private readonly payments: V2PaymentProvider,
    private readonly clock: V2Clock = SYSTEM_CLOCK
  ) {}

  private async requireMember(openId: string): Promise<V2Member> {
    const member = await this.repository.getMemberByOpenId(openId);
    if (!member) throw new DomainError("MEMBER_NOT_FOUND", "会员信息不存在，请重新进入小程序");
    return member;
  }

  private async requireStoreConfig(): Promise<V2StoreConfig> {
    const config = await this.repository.getStoreConfig();
    if (!config) throw new DomainError("STORE_NOT_READY", "摊位尚未完成配置");
    return config;
  }

  private async requireBusinessOpen(): Promise<V2StoreConfig> {
    const config = await this.requireStoreConfig();
    if (!config.businessOpen) throw new DomainError("STORE_CLOSED", "当前暂停接单");
    return config;
  }

  private async enrichLegacyCoupons(coupons: V2Coupon[]) {
    const missingProductIds = Array.from(new Set(coupons.filter((coupon) => !coupon.productSnapshot).map((coupon) => coupon.productId)));
    const fallbackProducts = await Promise.all(missingProductIds.map(async (productId) => [productId, await this.repository.getProduct(productId)] as const));
    const byId = new Map(fallbackProducts);
    return coupons.map((coupon) => {
      if (coupon.productSnapshot) return coupon;
      const product = byId.get(coupon.productId);
      return product
        ? { ...coupon, product: { ...product, enabled: true, soldOut: false } }
        : { ...coupon, unavailableReason: "关联商品已下架，请联系商家" };
    });
  }

  private async ensureCategories(): Promise<V2Category[]> {
    const existing = await this.repository.listCategories(true);
    if (existing.length) return existing;
    const now = this.clock.now().toISOString();
    const category: V2Category = {
      _id: `${this.repository.storeId}:category-main`,
      storeId: this.repository.storeId,
      name: "招牌肉片",
      enabled: true,
      sortOrder: 10,
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    await this.repository.saveCategory(category);
    return [category];
  }

  private async releaseOrderCoupons(tx: V2Transaction, order: V2Order, now: string): Promise<void> {
    for (const application of orderCouponApplications(order)) {
      const coupon = await tx.getCoupon(application.couponId);
      if (!coupon || coupon.reservedOrderId !== order._id || coupon.status !== "RESERVED") continue;
      const nextStatus = coupon.expiresAt > now ? "AVAILABLE" : "EXPIRED";
      await tx.saveCoupon({
        ...coupon,
        status: transitionV2Coupon(coupon.status, nextStatus),
        reservedOrderId: undefined,
        reservedAt: undefined,
        updatedAt: now
      });
    }
  }

  private async recordPendingPaymentQuery(paymentId: string, observedAt: Date): Promise<void> {
    const now = observedAt.toISOString();
    await this.repository.runTransaction(async (tx) => {
      const payment = await tx.getPayment(paymentId);
      if (!payment || !(payment.status === "INIT" || payment.status === "NOTPAY")) return;
      const queryCount = payment.queryCount + 1;
      const delaySeconds = Math.min(300, 30 * Math.max(1, queryCount));
      await tx.savePayment({
        ...payment,
        status: transitionV2Payment(payment.status, "NOTPAY"),
        queryCount,
        nextQueryAt: nextQueryAt(observedAt, delaySeconds),
        updatedAt: now
      });
    });
  }

  private async recordPendingRefundQuery(
    refundId: string,
    observedAt: Date,
    recovery?: { action: "QUERY" | "RESUBMIT" | "MANUAL"; code?: string; message?: string }
  ): Promise<void> {
    const now = observedAt.toISOString();
    await this.repository.runTransaction(async (tx) => {
      const refund = await tx.getRefund(refundId);
      if (!refund || !(refund.status === "PROCESSING" || refund.status === "ABNORMAL")) return;
      const queryCount = refund.queryCount + 1;
      const delaySeconds = refund.status === "ABNORMAL"
        ? 30 * 60
        : Math.min(30 * 60, 60 * (2 ** Math.min(4, Math.max(0, queryCount - 1))));
      await tx.saveRefund({
        ...refund,
        queryCount,
        nextQueryAt: nextQueryAt(observedAt, delaySeconds),
        recoveryAction: recovery?.action ?? refund.recoveryAction,
        providerErrorCode: recovery?.code ?? refund.providerErrorCode,
        providerErrorMessage: recovery?.message ?? refund.providerErrorMessage,
        updatedAt: now
      });
    });
  }

  private async closeRejectedRefundIntent(
    orderId: string,
    refundId: string,
    failure: V2RefundSubmissionFailure
  ): Promise<V2Order> {
    const now = this.clock.now().toISOString();
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      const refund = await tx.getRefund(refundId);
      if (!order || !refund) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
      if (order.status === "REFUNDED" || order.activeRefundId !== refund._id) return order;
      const restoredStatus: V2Order["status"] = order.completedAt ? "COMPLETED" : "WAITING_FULFILLMENT";
      await tx.saveRefund({
        ...refund,
        status: transitionV2Refund(refund.status, "CLOSED"),
        providerErrorCode: failure.code,
        providerErrorMessage: failure.message,
        recoveryAction: failure.kind === "REJECTED_RETRY_AFTER_FIX" ? "MANUAL" : undefined,
        updatedAt: now
      });
      const restoredOrder: V2Order = {
        ...order,
        status: transitionV2Order(order.status, restoredStatus),
        refundStatus: "CLOSED",
        updatedAt: now
      };
      await tx.saveOrder(restoredOrder);
      return restoredOrder;
    });
  }

  private async submitRefundIntent(
    order: V2Order,
    refund: V2Refund,
    source: V2Refund["confirmedBy"],
    throwOnRejected: boolean
  ): Promise<V2Order> {
    let providerResult;
    try {
      providerResult = await this.payments.refund(order, refund.outRefundNo);
    } catch (error) {
      const failure = classifyV2RefundSubmissionError(error);
      if (failure.kind === "RETRYABLE") {
        console.error("refund submission awaiting reconciliation", {
          orderId: order._id,
          refundId: refund._id,
          outRefundNo: refund.outRefundNo,
          providerCode: failure.code,
          error
        });
        await this.recordPendingRefundQuery(
          refund._id,
          this.clock.now(),
          { action: "QUERY", code: failure.code, message: failure.message }
        );
        return (await this.repository.getOrder(order._id)) ?? order;
      }
      const restored = await this.closeRejectedRefundIntent(order._id, refund._id, failure);
      if (throwOnRejected) {
        throw new DomainError("REFUND_REJECTED", failure.message, {
          providerCode: failure.code,
          failureKind: failure.kind
        });
      }
      return restored;
    }
    if (providerResult.status === "NOT_FOUND") {
      await this.recordPendingRefundQuery(
        refund._id,
        this.clock.now(),
        { action: "RESUBMIT", code: "RESOURCE_NOT_EXISTS", message: "微信未查询到退款单，将使用原退款单号重试" }
      );
      return (await this.repository.getOrder(order._id)) ?? order;
    }
    if (providerResult.status === "SUCCESS") {
      return this.confirmRefund(order._id, source, providerResult.refundId, refund._id);
    }
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const providerRefundStatus: V2Refund["status"] = providerResult.status;
    return this.repository.runTransaction(async (tx) => {
      const current = await tx.getOrder(order._id);
      const currentRefund = await tx.getRefund(refund._id);
      if (!current || !currentRefund) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
      if (current.status === "REFUNDED" || current.activeRefundId !== currentRefund._id) return current;
      const refundStatus = transitionV2Refund(currentRefund.status, providerRefundStatus);
      await tx.saveRefund({
        ...currentRefund,
        status: refundStatus,
        wechatRefundId: providerResult.refundId ?? currentRefund.wechatRefundId,
        nextQueryAt: nextQueryAt(nowDate, refundStatus === "ABNORMAL" ? 30 * 60 : 60),
        providerErrorCode: refundStatus === "ABNORMAL" ? "ABNORMAL" : undefined,
        providerErrorMessage: refundStatus === "ABNORMAL"
          ? REFUND_WECHAT_ABNORMAL_MESSAGE
          : refundStatus === "CLOSED"
            ? "微信退款已关闭，处理原因后可重新发起"
            : undefined,
        recoveryAction: refundStatus === "ABNORMAL" ? "MANUAL" : undefined,
        updatedAt: now
      });
      const updatedOrder: V2Order = {
        ...current,
        refundStatus,
        updatedAt: now
      };
      await tx.saveOrder(updatedOrder);
      return updatedOrder;
    });
  }

  private async closeUnpaidOrder(orderId: string): Promise<V2Order | null> {
    const now = this.clock.now().toISOString();
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      const payment = await tx.getPayment(orderId);
      if (!order || !payment) return order;
      if (order.status !== "PENDING_PAYMENT") return order;
      await this.releaseOrderCoupons(tx, order, now);
      const closed = {
        ...order,
        status: transitionV2Order(order.status, "CANCELLED"),
        paymentStatus: "CLOSED" as const,
        cancelledAt: now,
        updatedAt: now
      };
      await tx.saveOrder(closed);
      if (payment.status !== "CLOSED") {
        await tx.savePayment({ ...payment, status: transitionV2Payment(payment.status, "CLOSED"), updatedAt: now });
      }
      return closed;
    });
  }

  async bootstrapMember(openId: string): Promise<V2Member> {
    const normalized = openId.trim();
    if (!normalized) throw new DomainError("UNAUTHORIZED", "无法识别微信账号");
    const existing = await this.repository.getMemberByOpenId(normalized);
    if (existing) return existing;
    const now = this.clock.now().toISOString();
    const id = stableId("member", this.repository.storeId, normalized);
    const member: V2Member = {
      _id: id,
      storeId: this.repository.storeId,
      openId: normalized,
      memberCode: memberCode(normalized),
      inviteCode: inviteCode(normalized),
      pointsBalance: 0,
      createdAt: now,
      updatedAt: now
    };
    const initialized = await this.repository.runTransaction(async (tx) => {
      const current = await tx.getMember(id);
      if (current) {
        if (current.openId !== normalized) throw new DomainError("MEMBER_ID_CONFLICT", "会员账号初始化失败，请稍后重试");
        return current;
      }
      await tx.saveMember(member);
      return member;
    });
    return (await this.repository.getMemberByOpenId(normalized)) ?? initialized;
  }

  async home(openId: string) {
    const [member, config, products, exchangeItems, allCategories] = await Promise.all([
      this.bootstrapMember(openId),
      this.requireStoreConfig(),
      this.repository.listProducts(false),
      this.repository.listExchangeItems(false),
      this.ensureCategories()
    ]);
    const coupons = await this.repository.listCouponsByMember(member._id);
    const categories = allCategories.filter((category) => category.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
    const fallbackCategoryId = categories[0]?._id;
    const categorizedProducts = products
      .map((product) => ({ ...product, categoryId: product.categoryId ?? fallbackCategoryId }))
      .filter((product) => Boolean(product.categoryId && categories.some((category) => category._id === product.categoryId)));
    const sellableProductIds = new Set(categorizedProducts.filter((product) => !product.soldOut).map((product) => product._id));
    const now = this.clock.now().toISOString();
    const availableCoupons = await this.enrichLegacyCoupons(coupons.filter((coupon) => coupon.status === "AVAILABLE" && coupon.expiresAt > now));
    return {
      member: { memberCode: member.memberCode, pointsBalance: member.pointsBalance, inviteCode: member.inviteCode },
      config,
      categories,
      products: categorizedProducts,
      exchangeItems: exchangeItems.filter((item) => sellableProductIds.has(item.productId)),
      coupons: availableCoupons,
      availableCouponCount: availableCoupons.length
    };
  }

  async createPaymentOrder(openId: string, rawInput: unknown) {
    const input = v2OrderCreateSchema.parse(rawInput);
    const member = await this.requireMember(openId);
    const orderId = stableId("order", member._id, input.requestId);
    const existing = await this.repository.getOrder(orderId);
    if (existing) {
      const existingPayment = existing.status === "PENDING_PAYMENT" ? await this.repository.getPayment(existing._id) : null;
      const payParams = existing.status === "PENDING_PAYMENT"
        ? await this.payments.prepare(existing, existingPayment?.expiresAt)
        : undefined;
      return { order: existing, payParams };
    }

    const paidQuote = input.lineItems.length
      ? quoteV2Order(await this.repository.listProducts(true), input.lineItems)
      : { lineItems: [], itemCount: 0, payableAmount: 0, buyerPoints: 0, inviterPoints: 0 };
    if (input.lineItems.length > 0 && paidQuote.payableAmount <= 0) {
      throw new DomainError("ZERO_AMOUNT_ORDER", "普通商品订单金额必须大于 0");
    }
    if (paidQuote.payableAmount > 0) await this.requireBusinessOpen();
    else await this.requireStoreConfig();

    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const couponRows: V2Coupon[] = [];
    const couponLineItems: V2Order["lineItems"] = [];
    const couponApplications: V2CouponApplication[] = [];
    for (let index = 0; index < input.couponItems.length; index += 1) {
      const item = input.couponItems[index];
      const coupon = await this.repository.getCoupon(item.couponId);
      if (!coupon || coupon.memberId !== member._id) throw new DomainError("COUPON_NOT_FOUND", "商品券不存在");
      if (coupon.status !== "AVAILABLE") throw new DomainError("COUPON_UNAVAILABLE", "商品券已经使用或被其他订单占用");
      if (coupon.expiresAt <= now) throw new DomainError("COUPON_EXPIRED", "商品券已过期");
      const currentProduct = coupon.productSnapshot ? null : await this.repository.getProduct(coupon.productId);
      if (!coupon.productSnapshot && !currentProduct) throw new DomainError("PRODUCT_NOT_FOUND", "关联商品不存在");
      const product = { ...(coupon.productSnapshot ?? currentProduct!), enabled: true, soldOut: false };
      const quoted = quoteV2CouponProduct(product, item.selections).lineItems[0];
      const lineId = `line-${paidQuote.lineItems.length + index + 1}`;
      couponRows.push(coupon);
      couponLineItems.push({ ...quoted, lineId, couponId: coupon._id, pricingSource: "COUPON" });
      couponApplications.push({
        couponId: coupon._id,
        couponName: coupon.name,
        productId: coupon.productId,
        productName: coupon.productName,
        pointsCost: coupon.pointsCost,
        lineId
      });
    }

    if (paidQuote.payableAmount !== input.expectedPayableAmount || paidQuote.buyerPoints !== input.expectedBuyerPoints) {
      throw new DomainError("ORDER_QUOTE_CHANGED", "商品价格或积分已更新，请重新确认");
    }
    const source: V2Order["source"] = couponApplications.length
      ? (paidQuote.payableAmount > 0 ? "MIXED" : "COUPON")
      : "WECHAT_PAY";

    const order: V2Order = {
      _id: orderId,
      storeId: this.repository.storeId,
      orderNo: orderNumber(orderId),
      requestKey: input.requestId,
      memberId: member._id,
      memberOpenId: member.openId,
      inviterMemberId: member.inviterMemberId,
      source,
      status: paidQuote.payableAmount > 0 ? "PENDING_PAYMENT" : "WAITING_FULFILLMENT",
      paymentStatus: paidQuote.payableAmount > 0 ? "INIT" : undefined,
      payableAmount: paidQuote.payableAmount,
      paidAmount: 0,
      itemCount: paidQuote.itemCount + couponApplications.length,
      buyerPoints: paidQuote.buyerPoints,
      inviterPoints: member.inviterMemberId ? paidQuote.inviterPoints : 0,
      lineItems: [...paidQuote.lineItems, ...couponLineItems],
      couponApplications,
      couponId: couponApplications.length === 1 ? couponApplications[0].couponId : undefined,
      couponName: couponApplications.length === 1 ? couponApplications[0].couponName : undefined,
      couponPointsCost: couponApplications.length === 1 ? couponApplications[0].pointsCost : undefined,
      createdAt: now,
      updatedAt: now
    };
    if (paidQuote.payableAmount === 0) {
      const config = await this.requireStoreConfig();
      order.businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
      order.settledAt = now;
    }
    const payment: V2Payment = {
      _id: orderId,
      storeId: this.repository.storeId,
      orderId,
      outTradeNo: order.orderNo,
      amount: paidQuote.payableAmount,
      status: "INIT",
      expiresAt: new Date(nowDate.getTime() + 15 * 60_000).toISOString(),
      nextQueryAt: nextQueryAt(nowDate),
      queryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const created = await this.repository.runTransaction(async (tx) => {
      const duplicate = await tx.getOrder(orderId);
      if (duplicate) {
        return {
          order: duplicate,
          payment: duplicate.status === "PENDING_PAYMENT" ? await tx.getPayment(duplicate._id) : null
        };
      }
      const lockedCoupons: V2Coupon[] = [];
      for (const coupon of couponRows) {
        const current = await tx.getCoupon(coupon._id);
        if (!current || current.memberId !== member._id) throw new DomainError("COUPON_NOT_FOUND", "商品券不存在");
        if (current.status !== "AVAILABLE") throw new DomainError("COUPON_UNAVAILABLE", "商品券已经使用或被其他订单占用");
        if (current.expiresAt <= now) throw new DomainError("COUPON_EXPIRED", "商品券已过期");
        lockedCoupons.push(current);
      }
      if (paidQuote.payableAmount === 0) {
        const sequence = await tx.nextPickupNumber(order.businessDate!, now);
        order.pickupSequence = sequence;
        order.pickupNumber = formatPickupNumber(sequence);
        for (const coupon of lockedCoupons) {
          await tx.saveCoupon({
            ...coupon,
            status: transitionV2Coupon(coupon.status, "USED"),
            usedOrderId: orderId,
            usedAt: now,
            reservedOrderId: undefined,
            reservedAt: undefined,
            updatedAt: now
          });
        }
      } else {
        for (const coupon of lockedCoupons) {
          await tx.saveCoupon({
            ...coupon,
            status: transitionV2Coupon(coupon.status, "RESERVED"),
            reservedOrderId: orderId,
            reservedAt: now,
            updatedAt: now
          });
        }
      }
      await tx.saveOrder(order);
      if (paidQuote.payableAmount > 0) await tx.savePayment(payment);
      return { order, payment: paidQuote.payableAmount > 0 ? payment : null };
    });
    return {
      order: created.order,
      payParams: created.order.status === "PENDING_PAYMENT"
        ? await this.payments.prepare(
            created.order,
            created.payment?.expiresAt ?? (await this.repository.getPayment(created.order._id))?.expiresAt
          )
        : undefined
    };
  }

  async confirmPaidOrder(orderId: string, source: V2Payment["confirmedBy"], transactionId?: string): Promise<V2Order> {
    const config = await this.requireStoreConfig();
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
    return this.repository.runTransaction(async (tx) => {
      const [order, payment] = await Promise.all([tx.getOrder(orderId), tx.getPayment(orderId)]);
      if (!order || !payment || !(["WECHAT_PAY", "MIXED"] as V2Order["source"][]).includes(order.source)) {
        throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
      }
      if (order.settledAt) return order;
      if (order.status !== "PENDING_PAYMENT") throw new DomainError("ORDER_NOT_PAYABLE", "订单当前不能结算");
      const applications = orderCouponApplications(order);
      const [member, inviter, coupons] = await Promise.all([
        tx.getMember(order.memberId),
        order.inviterMemberId && order.inviterPoints > 0 ? tx.getMember(order.inviterMemberId) : Promise.resolve(null),
        Promise.all(applications.map((application) => tx.getCoupon(application.couponId)))
      ]);
      if (!member) throw new DomainError("MEMBER_NOT_FOUND", "会员信息不存在");
      for (let index = 0; index < applications.length; index += 1) {
        const coupon = coupons[index];
        if (!coupon || coupon.status !== "RESERVED" || coupon.reservedOrderId !== order._id) {
          throw new DomainError("COUPON_STATE_INVALID", "商品券占用状态异常，请联系客服处理");
        }
        await tx.saveCoupon({
          ...coupon,
          status: transitionV2Coupon(coupon.status, "USED"),
          reservedOrderId: undefined,
          reservedAt: undefined,
          usedOrderId: order._id,
          usedAt: now,
          updatedAt: now
        });
      }
      const sequence = await tx.nextPickupNumber(businessDate, now);

      if (order.buyerPoints > 0) {
        member.pointsBalance += order.buyerPoints;
        member.updatedAt = now;
        await tx.saveMember(member);
        await tx.savePointLedger({
          _id: stableId("points", order._id, "buyer"), storeId: this.repository.storeId,
          memberId: member._id, type: "PURCHASE", amount: order.buyerPoints, balanceAfter: member.pointsBalance,
          orderId: order._id, businessDate, note: `订单 ${order.orderNo} 消费积分`, createdAt: now, updatedAt: now
        });
      }

      if (order.inviterMemberId && order.inviterPoints > 0) {
        if (!inviter) throw new DomainError("INVITER_NOT_FOUND", "邀请人信息不存在");
        inviter.pointsBalance += order.inviterPoints;
        inviter.updatedAt = now;
        await tx.saveMember(inviter);
        await tx.savePointLedger({
          _id: stableId("points", order._id, "inviter"), storeId: this.repository.storeId,
          memberId: inviter._id, type: "INVITE_REWARD", amount: order.inviterPoints, balanceAfter: inviter.pointsBalance,
          orderId: order._id, relatedMemberId: member._id, businessDate, note: `下级订单 ${order.orderNo} 邀请奖励`, createdAt: now, updatedAt: now
        });
      }

      const settledOrder: V2Order = {
        ...order,
        status: transitionV2Order(order.status, "WAITING_FULFILLMENT"),
        paymentStatus: "SUCCESS",
        paidAmount: order.payableAmount,
        businessDate,
        pickupSequence: sequence,
        pickupNumber: formatPickupNumber(sequence),
        settledAt: now,
        updatedAt: now
      };
      await tx.saveOrder(settledOrder);
      await tx.savePayment({
        ...payment,
        status: transitionV2Payment(payment.status, "SUCCESS"),
        wechatTransactionId: transactionId ?? payment.wechatTransactionId,
        confirmedBy: source,
        updatedAt: now
      });
      return settledOrder;
    });
  }

  async queryPayment(openId: string, orderId: string): Promise<V2Order> {
    const order = await this.repository.getOrder(orderId);
    if (!order || order.memberOpenId !== openId) throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
    if (order.settledAt || order.status !== "PENDING_PAYMENT") return order;
    const payment = await this.repository.getPayment(orderId);
    if (!payment) throw new DomainError("PAYMENT_NOT_FOUND", "支付记录不存在");
    const result = await this.payments.query(payment.outTradeNo);
    if (result.status === "SUCCESS") return this.confirmPaidOrder(orderId, "CUSTOMER_QUERY", result.transactionId);
    if (result.status === "CLOSED") {
      return (await this.closeUnpaidOrder(orderId)) ?? order;
    }
    if (result.status === "NOT_FOUND" && payment.expiresAt <= this.clock.now().toISOString()) {
      return (await this.closeUnpaidOrder(orderId)) ?? order;
    }
    await this.recordPendingPaymentQuery(payment._id, this.clock.now());
    return order;
  }

  async mockPay(openId: string, orderId: string): Promise<V2Order> {
    if (process.env.NODE_ENV === "production" || this.payments.mode !== "MOCK" || !this.payments.markMockPaid) {
      throw new DomainError("MOCK_PAYMENT_DISABLED", "当前环境不能使用模拟支付");
    }
    const order = await this.repository.getOrder(orderId);
    if (!order || order.memberOpenId !== openId || !(["WECHAT_PAY", "MIXED"] as V2Order["source"][]).includes(order.source)) {
      throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
    }
    if (order.settledAt) return order;
    if (order.status !== "PENDING_PAYMENT") throw new DomainError("ORDER_NOT_PAYABLE", "订单当前不能支付");
    const payment = await this.repository.getPayment(orderId);
    if (!payment) throw new DomainError("PAYMENT_NOT_FOUND", "支付记录不存在");
    const transactionId = this.payments.markMockPaid(payment.outTradeNo);
    return this.confirmPaidOrder(orderId, "MOCK", transactionId);
  }

  async confirmWeChatPayment(input: {
    outTradeNo: string;
    transactionId: string;
    openId: string;
    amount: number;
  }): Promise<V2Order> {
    const payment = await this.repository.getPaymentByOutTradeNo(input.outTradeNo);
    if (!payment) throw new DomainError("PAYMENT_NOT_FOUND", "支付记录不存在");
    const order = await this.repository.getOrder(payment.orderId);
    if (!order || order.orderNo !== input.outTradeNo) throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
    if (payment.amount !== input.amount || order.payableAmount !== input.amount) {
      throw new DomainError("PAYMENT_AMOUNT_MISMATCH", "微信支付金额与订单不一致");
    }
    if (order.memberOpenId !== input.openId) {
      throw new DomainError("PAYMENT_PAYER_MISMATCH", "微信支付用户与订单不一致");
    }
    return this.confirmPaidOrder(order._id, "CALLBACK", input.transactionId);
  }

  async cancelPendingPayment(openId: string, orderId: string): Promise<V2Order> {
    const order = await this.repository.getOrder(orderId);
    if (!order || order.memberOpenId !== openId) throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
    if (order.status !== "PENDING_PAYMENT") return order;
    const payment = await this.repository.getPayment(orderId);
    if (!payment) throw new DomainError("PAYMENT_NOT_FOUND", "支付记录不存在");
    const beforeClose = await this.payments.query(payment.outTradeNo);
    if (beforeClose.status === "SUCCESS") return this.confirmPaidOrder(orderId, "CUSTOMER_QUERY", beforeClose.transactionId);
    if (beforeClose.status === "NOT_FOUND") return (await this.closeUnpaidOrder(orderId)) ?? order;
    if (beforeClose.status !== "CLOSED") await this.payments.close(payment.outTradeNo);
    const result = await this.payments.query(payment.outTradeNo);
    if (result.status === "SUCCESS") return this.confirmPaidOrder(orderId, "CUSTOMER_QUERY", result.transactionId);
    if (result.status === "CLOSED") return (await this.closeUnpaidOrder(orderId)) ?? order;
    if (result.status === "NOT_FOUND") return (await this.closeUnpaidOrder(orderId)) ?? order;
    await this.recordPendingPaymentQuery(payment._id, this.clock.now());
    return order;
  }

  async exchangeCoupon(openId: string, rawInput: unknown): Promise<V2Coupon> {
    const input = v2CouponExchangeSchema.parse(rawInput);
    const member = await this.requireMember(openId);
    const couponId = stableId("coupon", member._id, input.requestId);
    const existing = await this.repository.getCoupon(couponId);
    if (existing) return existing;
    const config = await this.requireStoreConfig();
    const item = await this.repository.getExchangeItem(input.exchangeItemId);
    if (!item || !item.enabled) throw new DomainError("EXCHANGE_UNAVAILABLE", "该兑换项当前不可用");
    if (item.version !== input.expectedVersion || item.pointsCost !== input.expectedPointsCost) {
      throw new DomainError("EXCHANGE_ITEM_CHANGED", "兑换所需积分已更新，请重新确认");
    }
    const product = await this.repository.getProduct(item.productId);
    if (!product || !product.enabled || product.soldOut) throw new DomainError("PRODUCT_UNAVAILABLE", "指定商品暂时不可兑换");
    const productSnapshot = couponProductSnapshot(product);
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
    return this.repository.runTransaction(async (tx) => {
      const duplicate = await tx.getCoupon(couponId);
      if (duplicate) return duplicate;
      const currentMember = await tx.getMember(member._id);
      if (!currentMember) throw new DomainError("MEMBER_NOT_FOUND", "会员信息不存在");
      if (currentMember.pointsBalance < item.pointsCost) throw new DomainError("INSUFFICIENT_POINTS", "积分不足");
      currentMember.pointsBalance -= item.pointsCost;
      currentMember.updatedAt = now;
      const coupon: V2Coupon = {
        _id: couponId, storeId: this.repository.storeId, memberId: member._id,
        exchangeItemId: item._id, exchangeItemVersion: item.version, name: item.name,
        productId: product._id, productName: product.name, productSnapshot, pointsCost: item.pointsCost,
        status: "AVAILABLE", expiresAt: addDays(nowDate, item.validDays), createdAt: now, updatedAt: now
      };
      const ledger: V2PointLedger = {
        _id: stableId("points", couponId, "exchange"), storeId: this.repository.storeId,
        memberId: member._id, type: "COUPON_EXCHANGE", amount: -item.pointsCost,
        balanceAfter: currentMember.pointsBalance, couponId, businessDate,
        note: `兑换${item.name}`, createdAt: now, updatedAt: now
      };
      await tx.saveMember(currentMember);
      await tx.saveCoupon(coupon);
      await tx.savePointLedger(ledger);
      return coupon;
    });
  }

  async useCoupon(openId: string, rawInput: unknown): Promise<V2Order> {
    const input = v2CouponUseSchema.parse(rawInput);
    const result = await this.createPaymentOrder(openId, {
      requestId: input.requestId,
      expectedPayableAmount: 0,
      expectedBuyerPoints: 0,
      lineItems: [],
      couponItems: [{ couponId: input.couponId, selections: input.selections }]
    });
    return result.order;
  }

  async resolveInvite(openId: string, rawInput: unknown) {
    const { inviteCode: code } = v2InviteBindSchema.parse(rawInput);
    const member = await this.bootstrapMember(openId);
    if (await this.repository.getInviteRelation(member._id)) throw new DomainError("INVITE_ALREADY_BOUND", "已经绑定过邀请人");
    const inviter = await this.repository.getMemberByInviteCode(code);
    if (!inviter) throw new DomainError("INVITE_CODE_NOT_FOUND", "邀请码不存在");
    if (inviter._id === member._id) throw new DomainError("SELF_INVITE", "不能绑定自己的邀请码");
    return { memberCode: inviter.memberCode, nickname: inviter.nickname };
  }

  async bindInvite(openId: string, rawInput: unknown) {
    const { inviteCode: code } = v2InviteBindSchema.parse(rawInput);
    const member = await this.requireMember(openId);
    const inviter = await this.repository.getMemberByInviteCode(code);
    if (!inviter) throw new DomainError("INVITE_CODE_NOT_FOUND", "邀请码不存在");
    if (inviter._id === member._id) throw new DomainError("SELF_INVITE", "不能绑定自己的邀请码");
    return this.repository.withInviteLock(randomUUID(), async () => {
      if (await this.repository.getInviteRelation(member._id)) throw new DomainError("INVITE_ALREADY_BOUND", "已经绑定过邀请人");
      let cursor: V2Member | null = inviter;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor._id === member._id) throw new DomainError("INVITE_CYCLE", "不能形成循环邀请关系");
        if (seen.has(cursor._id)) throw new DomainError("INVITE_GRAPH_INVALID", "邀请关系异常，请联系商家");
        seen.add(cursor._id);
        const relation = await this.repository.getInviteRelation(cursor._id);
        cursor = relation ? await this.repository.getMemberById(relation.inviterMemberId) : null;
      }
      const now = this.clock.now().toISOString();
      return this.repository.runTransaction(async (tx) => {
        if (await tx.getInviteRelation(member._id)) throw new DomainError("INVITE_ALREADY_BOUND", "已经绑定过邀请人");
        const currentMember = await tx.getMember(member._id);
        if (!currentMember) throw new DomainError("MEMBER_NOT_FOUND", "会员信息不存在");
        currentMember.inviterMemberId = inviter._id;
        currentMember.updatedAt = now;
        await tx.saveMember(currentMember);
        await tx.saveInviteRelation({
          _id: member._id, storeId: this.repository.storeId, inviterMemberId: inviter._id,
          inviteeMemberId: member._id, boundAt: now, createdAt: now, updatedAt: now
        });
        return { inviter: { memberCode: inviter.memberCode, nickname: inviter.nickname }, boundAt: now };
      });
    });
  }

  async inviteOverview(openId: string) {
    const member = await this.bootstrapMember(openId);
    const [relation, inviteRelations, contributionTotals] = await Promise.all([
      this.repository.getInviteRelation(member._id),
      this.repository.listInviteRelationsByInviter(member._id),
      this.repository.inviteContributionTotals(member._id)
    ]);
    const inviter = relation ? await this.repository.getMemberById(relation.inviterMemberId) : null;
    const invitees = await Promise.all(inviteRelations.map(async (item) => {
      const invitee = await this.repository.getMemberById(item.inviteeMemberId);
      const contributedPoints = contributionTotals[item.inviteeMemberId] ?? 0;
      return invitee ? { memberCode: invitee.memberCode, nickname: invitee.nickname, boundAt: item.boundAt, contributedPoints } : null;
    }));
    return {
      inviteCode: member.inviteCode,
      inviter: inviter ? { memberCode: inviter.memberCode, nickname: inviter.nickname } : null,
      invitees: invitees.filter(Boolean)
    };
  }

  async memberOrders(openId: string) { const member = await this.bootstrapMember(openId); return this.repository.listOrdersByMember(member._id); }
  async memberCoupons(openId: string) {
    const member = await this.bootstrapMember(openId);
    return this.enrichLegacyCoupons(await this.repository.listCouponsByMember(member._id));
  }
  async memberPoints(openId: string) { const member = await this.bootstrapMember(openId); return { balance: member.pointsBalance, rows: await this.repository.listPointLedgerByMember(member._id) }; }

  async saveProduct(rawInput: unknown): Promise<V2Product> {
    const input = v2ProductSaveSchema.parse(rawInput);
    const now = this.clock.now().toISOString();
    const categories = await this.ensureCategories();
    const fallbackCategoryId = categories.find((category) => category.enabled)?._id;
    const categoryId = input.categoryId ?? fallbackCategoryId;
    if (!categoryId || !(await this.repository.getCategory(categoryId))) {
      throw new DomainError("CATEGORY_NOT_FOUND", "请选择有效的商品分类");
    }
    const id = input.id ?? stableId("product", this.repository.storeId, randomUUID());
    return this.repository.runTransaction(async (tx) => {
      const existing = input.id ? await tx.getProduct(input.id) : null;
      if (input.id && !existing) throw new DomainError("PRODUCT_NOT_FOUND", "商品不存在，请刷新后重试");
      if (existing && input.expectedVersion !== existing.version) {
        throw new DomainError("PRODUCT_VERSION_CONFLICT", "商品已被更新，请刷新后再编辑");
      }
      const product: V2Product = {
        _id: existing?._id ?? id,
        storeId: this.repository.storeId,
        categoryId: input.categoryId ?? existing?.categoryId ?? fallbackCategoryId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        basePrice: input.basePrice,
        enabled: input.enabled,
        soldOut: input.soldOut,
        sortOrder: input.sortOrder,
        pointsEnabled: input.pointsEnabled,
        buyerPointsPerUnit: input.pointsEnabled ? input.buyerPointsPerUnit : 0,
        inviterPointsPerUnit: input.pointsEnabled ? input.inviterPointsPerUnit : 0,
        specGroups: input.specGroups,
        version: (existing?.version ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      await tx.saveProduct(product);
      return product;
    });
  }

  async saveCategory(rawInput: unknown): Promise<V2Category> {
    const input = v2CategorySaveSchema.parse(rawInput);
    const existing = input.id ? await this.repository.getCategory(input.id) : null;
    const categories = await this.ensureCategories();
    if (existing?.enabled && !input.enabled && categories.filter((category) => category.enabled).length <= 1) {
      throw new DomainError("CATEGORY_REQUIRED", "至少保留一个启用中的分类");
    }
    const now = this.clock.now().toISOString();
    const category: V2Category = {
      _id: existing?._id ?? stableId("category", this.repository.storeId, randomUUID()),
      storeId: this.repository.storeId,
      name: input.name,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.repository.saveCategory(category);
    return category;
  }

  async saveExchangeItem(rawInput: unknown): Promise<V2ExchangeItem> {
    const input = v2ExchangeItemSaveSchema.parse(rawInput);
    const product = await this.repository.getProduct(input.productId);
    if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "指定商品不存在");
    const now = this.clock.now().toISOString();
    const existing = input.id ? await this.repository.getExchangeItem(input.id) : null;
    const item: V2ExchangeItem = {
      _id: existing?._id ?? stableId("exchange", this.repository.storeId, randomUUID()),
      storeId: this.repository.storeId,
      name: input.name,
      productId: product._id,
      productName: product.name,
      pointsCost: input.pointsCost,
      validDays: input.validDays,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.repository.saveExchangeItem(item);
    return item;
  }

  async saveStoreConfig(rawInput: unknown): Promise<V2StoreConfig> {
    const input = v2StoreConfigSaveSchema.parse(rawInput);
    const existing = await this.repository.getStoreConfig();
    const now = this.clock.now().toISOString();
    const config: V2StoreConfig = {
      _id: existing?._id ?? `${this.repository.storeId}:config`,
      storeId: this.repository.storeId,
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.repository.saveStoreConfig(config);
    return config;
  }

  async ownerDashboard() { const config = await this.requireStoreConfig(); return this.repository.dashboard(this.clock.now(), config.dayBoundaryTime); }
  async ownerOrders(query: V2OwnerOrderPageQuery = {}) { return this.repository.listOwnerOrders(query); }
  async ownerProducts() {
    const categories = await this.ensureCategories();
    const fallbackCategoryId = categories.find((category) => category.enabled)?._id ?? categories[0]?._id;
    return (await this.repository.listProducts(true)).map((product) => ({ ...product, categoryId: product.categoryId ?? fallbackCategoryId }));
  }
  async ownerCategories() { return this.ensureCategories(); }
  async ownerExchangeItems() { return this.repository.listExchangeItems(true); }
  async ownerStoreConfig() { return this.requireStoreConfig(); }

  async ownerMemberDetail(memberId: string): Promise<V2MemberDetail> {
    const member = await this.repository.getMemberById(memberId);
    if (!member) throw new DomainError("MEMBER_NOT_FOUND", "用户不存在");
    const relation = await this.repository.getInviteRelation(member._id);
    const inviteRelations = await this.repository.listInviteRelationsByInviter(member._id);
    const [inviter, coupons, pointLedger, recentOrders, contributionTotals] = await Promise.all([
      relation ? this.repository.getMemberById(relation.inviterMemberId) : null,
      this.repository.listCouponsByMember(member._id),
      this.repository.listPointLedgerByMember(member._id),
      this.repository.listOrdersByMember(member._id),
      this.repository.inviteContributionTotals(member._id)
    ]);
    const invitees = await Promise.all(inviteRelations.map(async (row) => {
      const invitee = await this.repository.getMemberById(row.inviteeMemberId);
      if (!invitee) return null;
      const contributedPoints = contributionTotals[invitee._id] ?? 0;
      return { _id: invitee._id, memberCode: invitee.memberCode, nickname: invitee.nickname, createdAt: row.boundAt, contributedPoints };
    }));
    return {
      ...member,
      inviter: inviter ? { _id: inviter._id, memberCode: inviter.memberCode, nickname: inviter.nickname } : undefined,
      invitees: invitees.filter((row): row is NonNullable<typeof row> => Boolean(row)),
      coupons,
      pointLedger,
      recentOrders: recentOrders.slice(0, 20)
    };
  }

  async searchMembers(query: string) { return this.repository.searchMembers(query); }

  async completeOrder(orderId: string): Promise<V2Order> {
    const now = this.clock.now().toISOString();
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      if (!order) throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
      if (order.status === "COMPLETED") return order;
      if (order.status !== "WAITING_FULFILLMENT") throw new DomainError("ORDER_NOT_COMPLETABLE", "订单当前不能完成");
      const updated = { ...order, status: transitionV2Order(order.status, "COMPLETED"), completedAt: now, updatedAt: now };
      await tx.saveOrder(updated);
      return updated;
    });
  }

  async cancelCouponOrder(orderId: string): Promise<V2Order> {
    const now = this.clock.now().toISOString();
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      const applications = order ? orderCouponApplications(order) : [];
      if (!order || order.source !== "COUPON" || applications.length === 0) throw new DomainError("ORDER_NOT_FOUND", "券订单不存在");
      if (order.status === "CANCELLED") return order;
      if (order.status !== "WAITING_FULFILLMENT") throw new DomainError("ORDER_NOT_CANCELLABLE", "订单当前不能取消");
      for (const application of applications) {
        const coupon = await tx.getCoupon(application.couponId);
        if (!coupon || coupon.status !== "USED" || coupon.usedOrderId !== order._id) {
          throw new DomainError("COUPON_STATE_INVALID", "商品券状态异常");
        }
        const nextStatus = coupon.expiresAt > now ? "AVAILABLE" : "EXPIRED";
        await tx.saveCoupon({
          ...coupon,
          status: transitionV2Coupon(coupon.status, nextStatus),
          usedOrderId: undefined,
          usedAt: undefined,
          reservedOrderId: undefined,
          reservedAt: undefined,
          updatedAt: now
        });
      }
      const updated = { ...order, status: transitionV2Order(order.status, "CANCELLED"), cancelledAt: now, updatedAt: now };
      await tx.saveOrder(updated);
      return updated;
    });
  }

  async refundOrder(orderId: string): Promise<V2Order> {
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const intent = await this.repository.runTransaction(async (tx) => {
      const current = await tx.getOrder(orderId);
      if (!current || current.paidAmount <= 0 || !current.settledAt) {
        throw new DomainError("ORDER_NOT_REFUNDABLE", "订单不能退款");
      }
      if (current.status === "REFUNDED") return { order: current, refund: null };

      if (current.status === "REFUNDING") {
        if (!current.activeRefundId) throw new DomainError("REFUND_STATE_INVALID", "退款状态异常，请稍后重试");
        const active = await tx.getRefund(current.activeRefundId);
        if (!active) throw new DomainError("REFUND_STATE_INVALID", "退款记录缺失，请联系管理员");
        if (active.status !== "CLOSED") return { order: current, refund: active };
      } else if (!(["WAITING_FULFILLMENT", "COMPLETED"] as V2Order["status"][]).includes(current.status)) {
        throw new DomainError("ORDER_NOT_REFUNDABLE", "订单不能退款");
      }

      const attempt = (current.refundAttempt ?? 0) + 1;
      const refundId = stableId("refund", current._id, String(attempt));
      const refund: V2Refund = {
        _id: refundId,
        storeId: this.repository.storeId,
        orderId: current._id,
        outRefundNo: `R${stableHash(refundId).slice(0, 27).toUpperCase()}`,
        amount: current.paidAmount,
        status: "PROCESSING",
        nextQueryAt: nextQueryAt(nowDate, 60),
        queryCount: 0,
        createdAt: now,
        updatedAt: now
      };
      const status = current.status === "REFUNDING" ? current.status : transitionV2Order(current.status, "REFUNDING");
      const refundingOrder: V2Order = {
        ...current,
        status,
        refundStatus: "PROCESSING",
        activeRefundId: refundId,
        refundAttempt: attempt,
        updatedAt: now
      };
      await tx.saveRefund(refund);
      await tx.saveOrder(refundingOrder);
      return { order: refundingOrder, refund };
    });
    if (!intent.refund) return intent.order;
    if (intent.refund.status === "ABNORMAL") {
      throw new DomainError("REFUND_MANUAL_ACTION_REQUIRED", "退款异常，请到微信支付商户平台处理");
    }
    return this.submitRefundIntent(
      intent.order,
      intent.refund,
      this.payments.mode === "MOCK" ? "MOCK" : "OWNER_QUERY",
      true
    );
  }

  async confirmRefund(orderId: string, source: V2Refund["confirmedBy"], refundProviderId?: string, targetRefundId?: string): Promise<V2Order> {
    const config = await this.requireStoreConfig();
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      if (!order) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
      const payment = await tx.getPayment(orderId);
      if (order.status === "REFUNDED") {
        if (payment?.status === "SUCCESS") {
          await tx.savePayment({ ...payment, status: transitionV2Payment(payment.status, "REFUND"), updatedAt: now });
        }
        return order;
      }
      if (!payment) throw new DomainError("PAYMENT_NOT_FOUND", "支付记录不存在");
      const refundId = targetRefundId ?? order.activeRefundId ?? stableId("refund", orderId);
      if (order.activeRefundId && order.activeRefundId !== refundId) return order;
      const refund = await tx.getRefund(refundId);
      if (!refund) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
      if (order.status !== "REFUNDING") throw new DomainError("ORDER_NOT_REFUNDING", "订单不在退款中");
      const member = await tx.getMember(order.memberId);
      if (!member) throw new DomainError("MEMBER_NOT_FOUND", "会员信息不存在");
      if (order.buyerPoints > 0) {
        member.pointsBalance -= order.buyerPoints;
        member.updatedAt = now;
        await tx.saveMember(member);
        await tx.savePointLedger({
          _id: stableId("points", order._id, "buyer-refund"), storeId: this.repository.storeId,
          memberId: member._id, type: "PURCHASE_REFUND", amount: -order.buyerPoints, balanceAfter: member.pointsBalance,
          orderId, businessDate, note: `订单 ${order.orderNo} 退款回收积分`, createdAt: now, updatedAt: now
        });
      }
      if (order.inviterMemberId && order.inviterPoints > 0) {
        const inviter = await tx.getMember(order.inviterMemberId);
        if (!inviter) throw new DomainError("INVITER_NOT_FOUND", "邀请人信息不存在");
        inviter.pointsBalance -= order.inviterPoints;
        inviter.updatedAt = now;
        await tx.saveMember(inviter);
        await tx.savePointLedger({
          _id: stableId("points", order._id, "inviter-refund"), storeId: this.repository.storeId,
          memberId: inviter._id, type: "INVITE_REWARD_REFUND", amount: -order.inviterPoints, balanceAfter: inviter.pointsBalance,
          orderId, relatedMemberId: member._id, businessDate, note: `下级订单 ${order.orderNo} 退款回收奖励`, createdAt: now, updatedAt: now
        });
      }
      for (const application of orderCouponApplications(order)) {
        const coupon = await tx.getCoupon(application.couponId);
        if (!coupon || coupon.usedOrderId !== order._id || coupon.status !== "USED") continue;
        const nextStatus = coupon.expiresAt > now ? "AVAILABLE" : "EXPIRED";
        await tx.saveCoupon({
          ...coupon,
          status: transitionV2Coupon(coupon.status, nextStatus),
          usedOrderId: undefined,
          usedAt: undefined,
          reservedOrderId: undefined,
          reservedAt: undefined,
          updatedAt: now
        });
      }
      const updatedOrder: V2Order = {
        ...order, status: transitionV2Order(order.status, "REFUNDED"), paymentStatus: "REFUND",
        refundStatus: "SUCCESS", refundedAt: now, updatedAt: now
      };
      await tx.saveOrder(updatedOrder);
      if (payment.status !== "REFUND") {
        await tx.savePayment({ ...payment, status: transitionV2Payment(payment.status, "REFUND"), updatedAt: now });
      }
      await tx.saveRefund({
        ...refund, status: transitionV2Refund(refund.status, "SUCCESS"),
        wechatRefundId: refundProviderId ?? refund.wechatRefundId, confirmedBy: source, updatedAt: now
      });
      return updatedOrder;
    });
  }

  async recordWeChatRefund(input: { outRefundNo: string; status: V2Refund["status"]; refundId?: string; amount?: number }): Promise<V2Order> {
    const refund = await this.repository.getRefundByOutRefundNo(input.outRefundNo);
    if (!refund) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
    if (input.amount !== undefined && input.amount !== refund.amount) {
      throw new DomainError("REFUND_AMOUNT_MISMATCH", "微信退款金额与退款单不一致");
    }
    if (input.status === "SUCCESS") return this.confirmRefund(refund.orderId, "CALLBACK", input.refundId, refund._id);
    const now = this.clock.now();
    const nowIso = now.toISOString();
    return this.repository.runTransaction(async (tx) => {
      const currentRefund = await tx.getRefund(refund._id);
      const order = await tx.getOrder(refund.orderId);
      if (!currentRefund || !order) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
      if (order.status === "REFUNDED") return order;
      const status = transitionV2Refund(currentRefund.status, input.status);
      await tx.saveRefund({
        ...currentRefund,
        status,
        wechatRefundId: input.refundId ?? currentRefund.wechatRefundId,
        queryCount: currentRefund.queryCount + 1,
        nextQueryAt: nextQueryAt(now, status === "ABNORMAL" ? 30 * 60 : 60),
        providerErrorCode: status === "ABNORMAL" ? "ABNORMAL" : undefined,
        providerErrorMessage: status === "ABNORMAL"
          ? REFUND_WECHAT_ABNORMAL_MESSAGE
          : status === "CLOSED"
            ? "微信退款已关闭，处理原因后可重新发起"
            : undefined,
        recoveryAction: status === "ABNORMAL" ? "MANUAL" : undefined,
        updatedAt: nowIso
      });
      if (order.activeRefundId && order.activeRefundId !== currentRefund._id) return order;
      const updated = { ...order, refundStatus: status, updatedAt: nowIso };
      await tx.saveOrder(updated);
      return updated;
    });
  }

  async reconcilePayments(limit = 50) {
    const now = this.clock.now();
    const due = await this.repository.listPaymentsDue(now.toISOString(), limit);
    const results: V2Order[] = [];
    for (const payment of due) {
      try {
        let result = await this.payments.query(payment.outTradeNo);
        if (result.status === "SUCCESS") {
          results.push(await this.confirmPaidOrder(payment.orderId, "JOB", result.transactionId));
          continue;
        }
        if (result.status === "CLOSED") {
          const closed = await this.closeUnpaidOrder(payment.orderId);
          if (closed) results.push(closed);
          continue;
        }
        if (result.status === "NOT_FOUND") {
          if (payment.expiresAt <= now.toISOString()) {
            const closed = await this.closeUnpaidOrder(payment.orderId);
            if (closed) results.push(closed);
          } else {
            await this.recordPendingPaymentQuery(payment._id, now);
          }
          continue;
        }
        if (payment.expiresAt <= now.toISOString()) {
          await this.payments.close(payment.outTradeNo);
          result = await this.payments.query(payment.outTradeNo);
          if (result.status === "SUCCESS") {
            results.push(await this.confirmPaidOrder(payment.orderId, "JOB", result.transactionId));
          } else if (result.status === "CLOSED") {
            const closed = await this.closeUnpaidOrder(payment.orderId);
            if (closed) results.push(closed);
          } else if (result.status === "NOT_FOUND") {
            const closed = await this.closeUnpaidOrder(payment.orderId);
            if (closed) results.push(closed);
          } else {
            await this.recordPendingPaymentQuery(payment._id, now);
          }
          continue;
        }
        await this.recordPendingPaymentQuery(payment._id, now);
      } catch (error) {
        console.error("payment reconciliation failed", { paymentId: payment._id, outTradeNo: payment.outTradeNo, error });
        try { await this.recordPendingPaymentQuery(payment._id, now); } catch (recordError) {
          console.error("payment reconciliation retry scheduling failed", { paymentId: payment._id, error: recordError });
        }
      }
    }
    return results;
  }

  async reconcileRefunds(limit = 50) {
    const now = this.clock.now();
    const due = await this.repository.listRefundsDue(now.toISOString(), limit);
    const results: V2Order[] = [];
    for (const refund of due) {
      try {
        if (shouldResubmitRefund(refund)) {
          const order = await this.repository.getOrder(refund.orderId);
          if (!order || order.status !== "REFUNDING" || order.activeRefundId !== refund._id) continue;
          results.push(await this.submitRefundIntent(order, refund, "JOB", false));
          continue;
        }
        const queried = await this.payments.queryRefund(refund.outRefundNo);
        if (queried.status === "SUCCESS") {
          results.push(await this.confirmRefund(refund.orderId, "JOB", queried.refundId, refund._id));
        } else if (queried.status === "NOT_FOUND") {
          if (refund.status === "ABNORMAL") {
            await this.recordPendingRefundQuery(refund._id, now);
          } else {
            await this.recordPendingRefundQuery(
              refund._id,
              now,
              { action: "RESUBMIT", code: "RESOURCE_NOT_EXISTS", message: "微信未查询到退款单，将使用原退款单号重试" }
            );
          }
        } else {
          results.push(await this.recordWeChatRefund({ outRefundNo: refund.outRefundNo, status: queried.status, refundId: queried.refundId }));
        }
      } catch (error) {
        console.error("refund reconciliation failed", { refundId: refund._id, outRefundNo: refund.outRefundNo, error });
        try { await this.recordPendingRefundQuery(refund._id, now); } catch (recordError) {
          console.error("refund reconciliation retry scheduling failed", { refundId: refund._id, error: recordError });
        }
      }
    }
    return results;
  }
}
