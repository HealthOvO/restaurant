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
  v2CouponExchangeSchema,
  v2CouponUseSchema,
  v2ExchangeItemSaveSchema,
  v2InviteBindSchema,
  v2OrderCreateSchema,
  v2ProductSaveSchema,
  v2StoreConfigSaveSchema,
  type V2Coupon,
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
import type { V2PaymentProvider } from "./payment";
import type { V2Repository } from "./repository";

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

  async bootstrapMember(openId: string): Promise<V2Member> {
    const normalized = openId.trim();
    if (!normalized) throw new DomainError("UNAUTHORIZED", "无法识别微信账号");
    const existing = await this.repository.getMemberByOpenId(normalized);
    if (existing) return existing;
    const now = this.clock.now().toISOString();
    const member: V2Member = {
      _id: stableId("member", this.repository.storeId, normalized),
      storeId: this.repository.storeId,
      openId: normalized,
      memberCode: memberCode(normalized),
      inviteCode: inviteCode(normalized),
      pointsBalance: 0,
      createdAt: now,
      updatedAt: now
    };
    await this.repository.saveMember(member);
    return (await this.repository.getMemberByOpenId(normalized)) ?? member;
  }

  async home(openId: string) {
    const [member, config, products, exchangeItems] = await Promise.all([
      this.bootstrapMember(openId),
      this.requireStoreConfig(),
      this.repository.listProducts(false),
      this.repository.listExchangeItems(false)
    ]);
    const coupons = await this.repository.listCouponsByMember(member._id);
    const sellableProductIds = new Set(products.filter((product) => !product.soldOut).map((product) => product._id));
    const now = this.clock.now().toISOString();
    return {
      member: { memberCode: member.memberCode, pointsBalance: member.pointsBalance, inviteCode: member.inviteCode },
      config,
      products: products.filter((product) => !product.soldOut),
      exchangeItems: exchangeItems.filter((item) => sellableProductIds.has(item.productId)),
      availableCouponCount: coupons.filter((coupon) => coupon.status === "AVAILABLE" && coupon.expiresAt > now).length
    };
  }

  async createPaymentOrder(openId: string, rawInput: unknown) {
    const input = v2OrderCreateSchema.parse(rawInput);
    await this.requireBusinessOpen();
    const member = await this.requireMember(openId);
    const quote = quoteV2Order(await this.repository.listProducts(true), input.lineItems);
    if (quote.payableAmount <= 0) throw new DomainError("ZERO_AMOUNT_ORDER", "普通订单金额必须大于 0");
    const orderId = stableId("order", member._id, input.requestId);
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const existing = await this.repository.getOrder(orderId);
    if (existing) {
      const payParams = existing.status === "PENDING_PAYMENT" ? await this.payments.prepare(existing) : undefined;
      return { order: existing, payParams };
    }

    const order: V2Order = {
      _id: orderId,
      storeId: this.repository.storeId,
      orderNo: orderNumber(orderId),
      requestKey: input.requestId,
      memberId: member._id,
      memberOpenId: member.openId,
      inviterMemberId: member.inviterMemberId,
      source: "WECHAT_PAY",
      status: "PENDING_PAYMENT",
      paymentStatus: "INIT",
      payableAmount: quote.payableAmount,
      paidAmount: 0,
      itemCount: quote.itemCount,
      buyerPoints: quote.buyerPoints,
      inviterPoints: member.inviterMemberId ? quote.inviterPoints : 0,
      lineItems: quote.lineItems,
      createdAt: now,
      updatedAt: now
    };
    const payment: V2Payment = {
      _id: orderId,
      storeId: this.repository.storeId,
      orderId,
      outTradeNo: order.orderNo,
      amount: quote.payableAmount,
      status: "INIT",
      expiresAt: new Date(nowDate.getTime() + 15 * 60_000).toISOString(),
      nextQueryAt: nextQueryAt(nowDate),
      queryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const created = await this.repository.runTransaction(async (tx) => {
      const duplicate = await tx.getOrder(orderId);
      if (duplicate) return duplicate;
      await tx.saveOrder(order);
      await tx.savePayment(payment);
      return order;
    });
    return { order: created, payParams: await this.payments.prepare(created) };
  }

  async confirmPaidOrder(orderId: string, source: V2Payment["confirmedBy"], transactionId?: string): Promise<V2Order> {
    const config = await this.requireStoreConfig();
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      const payment = await tx.getPayment(orderId);
      if (!order || !payment || order.source !== "WECHAT_PAY") throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
      if (order.settledAt) return order;
      if (order.status !== "PENDING_PAYMENT") throw new DomainError("ORDER_NOT_PAYABLE", "订单当前不能结算");
      const member = await tx.getMember(order.memberId);
      if (!member) throw new DomainError("MEMBER_NOT_FOUND", "会员信息不存在");
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
        const inviter = await tx.getMember(order.inviterMemberId);
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
      const now = this.clock.now().toISOString();
      return this.repository.runTransaction(async (tx) => {
        const current = await tx.getOrder(orderId);
        const currentPayment = await tx.getPayment(orderId);
        if (!current || !currentPayment || current.status !== "PENDING_PAYMENT") return current ?? order;
        const closed = { ...current, status: transitionV2Order(current.status, "CANCELLED"), paymentStatus: "CLOSED" as const, cancelledAt: now, updatedAt: now };
        await tx.saveOrder(closed);
        await tx.savePayment({ ...currentPayment, status: transitionV2Payment(currentPayment.status, "CLOSED"), updatedAt: now });
        return closed;
      });
    }
    return order;
  }

  async mockPay(openId: string, orderId: string): Promise<V2Order> {
    if (process.env.NODE_ENV === "production" || this.payments.mode !== "MOCK" || !this.payments.markMockPaid) {
      throw new DomainError("MOCK_PAYMENT_DISABLED", "当前环境不能使用模拟支付");
    }
    const order = await this.repository.getOrder(orderId);
    if (!order || order.memberOpenId !== openId || order.source !== "WECHAT_PAY") {
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

  async exchangeCoupon(openId: string, rawInput: unknown): Promise<V2Coupon> {
    const input = v2CouponExchangeSchema.parse(rawInput);
    const config = await this.requireBusinessOpen();
    const member = await this.requireMember(openId);
    const item = await this.repository.getExchangeItem(input.exchangeItemId);
    if (!item || !item.enabled) throw new DomainError("EXCHANGE_UNAVAILABLE", "该兑换项当前不可用");
    const product = await this.repository.getProduct(item.productId);
    if (!product || !product.enabled || product.soldOut) throw new DomainError("PRODUCT_UNAVAILABLE", "指定商品暂时不可兑换");
    const couponId = stableId("coupon", member._id, input.requestId);
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
        productId: product._id, productName: product.name, pointsCost: item.pointsCost,
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
    const config = await this.requireBusinessOpen();
    const member = await this.requireMember(openId);
    const coupon = await this.repository.getCoupon(input.couponId);
    if (!coupon || coupon.memberId !== member._id) throw new DomainError("COUPON_NOT_FOUND", "商品券不存在");
    const product = await this.repository.getProduct(coupon.productId);
    if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "关联商品不存在");
    const quote = quoteV2CouponProduct(product, input.selections);
    const orderId = stableId("coupon-order", coupon._id, input.requestId);
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
    return this.repository.runTransaction(async (tx) => {
      const duplicate = await tx.getOrder(orderId);
      if (duplicate) return duplicate;
      const currentCoupon = await tx.getCoupon(coupon._id);
      if (!currentCoupon || currentCoupon.memberId !== member._id) throw new DomainError("COUPON_NOT_FOUND", "商品券不存在");
      if (currentCoupon.status !== "AVAILABLE") throw new DomainError("COUPON_UNAVAILABLE", "商品券已经使用或失效");
      if (currentCoupon.expiresAt <= now) throw new DomainError("COUPON_EXPIRED", "商品券已过期");
      const sequence = await tx.nextPickupNumber(businessDate, now);
      const order: V2Order = {
        _id: orderId, storeId: this.repository.storeId, orderNo: orderNumber(orderId),
        requestKey: input.requestId, memberId: member._id, memberOpenId: member.openId,
        source: "COUPON", status: "WAITING_FULFILLMENT", payableAmount: 0, paidAmount: 0,
        itemCount: 1, buyerPoints: 0, inviterPoints: 0, lineItems: quote.lineItems,
        couponId: currentCoupon._id, couponName: currentCoupon.name, couponPointsCost: currentCoupon.pointsCost,
        businessDate, pickupSequence: sequence, pickupNumber: formatPickupNumber(sequence), settledAt: now,
        createdAt: now, updatedAt: now
      };
      await tx.saveCoupon({
        ...currentCoupon, status: transitionV2Coupon(currentCoupon.status, "USED"),
        usedOrderId: orderId, usedAt: now, updatedAt: now
      });
      await tx.saveOrder(order);
      return order;
    });
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
    const member = await this.requireMember(openId);
    const [relation, inviteRelations, ledger] = await Promise.all([
      this.repository.getInviteRelation(member._id),
      this.repository.listInviteRelationsByInviter(member._id),
      this.repository.listPointLedgerByMember(member._id)
    ]);
    const inviter = relation ? await this.repository.getMemberById(relation.inviterMemberId) : null;
    const invitees = await Promise.all(inviteRelations.map(async (item) => {
      const invitee = await this.repository.getMemberById(item.inviteeMemberId);
      const contributedPoints = ledger.filter((row) => row.type === "INVITE_REWARD" && row.relatedMemberId === item.inviteeMemberId).reduce((sum, row) => sum + row.amount, 0);
      return invitee ? { memberCode: invitee.memberCode, nickname: invitee.nickname, boundAt: item.boundAt, contributedPoints } : null;
    }));
    return {
      inviteCode: member.inviteCode,
      inviter: inviter ? { memberCode: inviter.memberCode, nickname: inviter.nickname } : null,
      invitees: invitees.filter(Boolean)
    };
  }

  async memberOrders(openId: string) { const member = await this.requireMember(openId); return this.repository.listOrdersByMember(member._id); }
  async memberCoupons(openId: string) { const member = await this.requireMember(openId); return this.repository.listCouponsByMember(member._id); }
  async memberPoints(openId: string) { const member = await this.requireMember(openId); return { balance: member.pointsBalance, rows: await this.repository.listPointLedgerByMember(member._id) }; }

  async saveProduct(rawInput: unknown): Promise<V2Product> {
    const input = v2ProductSaveSchema.parse(rawInput);
    const now = this.clock.now().toISOString();
    const existing = input.id ? await this.repository.getProduct(input.id) : null;
    const product: V2Product = {
      _id: existing?._id ?? stableId("product", this.repository.storeId, randomUUID()),
      storeId: this.repository.storeId,
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
    await this.repository.saveProduct(product);
    return product;
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
  async ownerOrders(status?: V2Order["status"]) {
    const orders = await this.repository.listOwnerOrders(status);
    return orders.filter((order) => order.status !== "PENDING_PAYMENT");
  }
  async ownerProducts() { return this.repository.listProducts(true); }
  async ownerExchangeItems() { return this.repository.listExchangeItems(true); }
  async ownerStoreConfig() { return this.requireStoreConfig(); }

  async ownerMemberDetail(memberId: string): Promise<V2MemberDetail> {
    const member = await this.repository.getMemberById(memberId);
    if (!member) throw new DomainError("MEMBER_NOT_FOUND", "用户不存在");
    const relation = await this.repository.getInviteRelation(member._id);
    const inviteRelations = await this.repository.listInviteRelationsByInviter(member._id);
    const [inviter, coupons, pointLedger, recentOrders] = await Promise.all([
      relation ? this.repository.getMemberById(relation.inviterMemberId) : null,
      this.repository.listCouponsByMember(member._id),
      this.repository.listPointLedgerByMember(member._id),
      this.repository.listOrdersByMember(member._id)
    ]);
    const invitees = await Promise.all(inviteRelations.map(async (row) => {
      const invitee = await this.repository.getMemberById(row.inviteeMemberId);
      if (!invitee) return null;
      const contributedPoints = pointLedger.filter((item) => item.type === "INVITE_REWARD" && item.relatedMemberId === invitee._id).reduce((sum, item) => sum + item.amount, 0);
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
      if (!order || order.source !== "COUPON" || !order.couponId) throw new DomainError("ORDER_NOT_FOUND", "券订单不存在");
      if (order.status === "CANCELLED") return order;
      if (order.status !== "WAITING_FULFILLMENT") throw new DomainError("ORDER_NOT_CANCELLABLE", "订单当前不能取消");
      const coupon = await tx.getCoupon(order.couponId);
      if (!coupon || coupon.status !== "USED") throw new DomainError("COUPON_STATE_INVALID", "商品券状态异常");
      const nextStatus = coupon.expiresAt > now ? "AVAILABLE" : "EXPIRED";
      await tx.saveCoupon({
        ...coupon, status: transitionV2Coupon(coupon.status, nextStatus),
        usedOrderId: undefined, usedAt: undefined, updatedAt: now
      });
      const updated = { ...order, status: transitionV2Order(order.status, "CANCELLED"), cancelledAt: now, updatedAt: now };
      await tx.saveOrder(updated);
      return updated;
    });
  }

  async refundOrder(orderId: string): Promise<V2Order> {
    const order = await this.repository.getOrder(orderId);
    if (!order || order.source !== "WECHAT_PAY" || !order.settledAt) throw new DomainError("ORDER_NOT_REFUNDABLE", "订单不能退款");
    if (order.status === "REFUNDED" || order.status === "REFUNDING") return order;
    if (!(["WAITING_FULFILLMENT", "COMPLETED"] as V2Order["status"][]).includes(order.status)) throw new DomainError("ORDER_NOT_REFUNDABLE", "订单不能退款");
    const refundId = stableId("refund", order._id);
    const outRefundNo = `R${stableHash(refundId).slice(0, 27).toUpperCase()}`;
    const providerResult = await this.payments.refund(order, outRefundNo);
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const refund: V2Refund = {
      _id: refundId, storeId: this.repository.storeId, orderId: order._id,
      outRefundNo, wechatRefundId: providerResult.refundId, amount: order.paidAmount,
      status: providerResult.status, nextQueryAt: nextQueryAt(nowDate, 60), queryCount: 0,
      confirmedBy: providerResult.status === "SUCCESS" ? "MOCK" : undefined,
      createdAt: now, updatedAt: now
    };
    await this.repository.runTransaction(async (tx) => {
      const current = await tx.getOrder(order._id);
      if (!current || current.status === "REFUNDED" || current.status === "REFUNDING") return;
      await tx.saveOrder({ ...current, status: transitionV2Order(current.status, "REFUNDING"), refundStatus: providerResult.status, updatedAt: now });
      await tx.saveRefund(refund);
    });
    return providerResult.status === "SUCCESS" ? this.confirmRefund(order._id, "MOCK", providerResult.refundId) : (await this.repository.getOrder(order._id))!;
  }

  async confirmRefund(orderId: string, source: V2Refund["confirmedBy"], refundProviderId?: string): Promise<V2Order> {
    const config = await this.requireStoreConfig();
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const businessDate = businessDateAt(nowDate, config.dayBoundaryTime);
    const refundId = stableId("refund", orderId);
    return this.repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(orderId);
      const refund = await tx.getRefund(refundId);
      if (!order || !refund) throw new DomainError("REFUND_NOT_FOUND", "退款记录不存在");
      if (order.status === "REFUNDED") return order;
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
      const updatedOrder: V2Order = {
        ...order, status: transitionV2Order(order.status, "REFUNDED"), paymentStatus: "REFUND",
        refundStatus: "SUCCESS", refundedAt: now, updatedAt: now
      };
      await tx.saveOrder(updatedOrder);
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
    if (input.status === "SUCCESS") return this.confirmRefund(refund.orderId, "CALLBACK", input.refundId);
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
        nextQueryAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        updatedAt: nowIso
      });
      const updated = { ...order, refundStatus: status, updatedAt: nowIso };
      await tx.saveOrder(updated);
      return updated;
    });
  }

  async reconcilePayments(limit = 50) {
    const now = this.clock.now();
    const due = await this.repository.listPaymentsDue(now.toISOString(), limit);
    const results = [];
    for (const payment of due) {
      const result = await this.payments.query(payment.outTradeNo);
      if (result.status === "SUCCESS") {
        results.push(await this.confirmPaidOrder(payment.orderId, "JOB", result.transactionId));
      } else if (payment.expiresAt <= now.toISOString() && result.status === "NOTPAY") {
        await this.payments.close(payment.outTradeNo);
        const order = await this.repository.getOrder(payment.orderId);
        if (order) results.push(await this.queryPayment(order.memberOpenId, order._id));
      }
    }
    return results;
  }

  async reconcileRefunds(limit = 50) {
    const due = await this.repository.listRefundsDue(this.clock.now().toISOString(), limit);
    const results = [];
    for (const refund of due) {
      const result = await this.payments.queryRefund(refund.outRefundNo);
      if (result.status === "SUCCESS") results.push(await this.confirmRefund(refund.orderId, "JOB", result.refundId));
      else results.push(await this.recordWeChatRefund({ outRefundNo: refund.outRefundNo, status: result.status, refundId: result.refundId }));
    }
    return results;
  }
}
