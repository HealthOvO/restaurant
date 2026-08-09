import { clearV2OwnerLoginAttempts, hashV2OwnerPassword } from "./owner-auth";
import { DomainError, v2OwnerLoginSchema, type V2Category, type V2ExchangeItem, type V2OwnerAccount, type V2Product, type V2StoreConfig } from "@restaurant/shared";
import { z } from "zod";
import type { V2Repository } from "./repository";

const initializeSchema = z.object({
  storeName: z.string().trim().min(1).max(40),
  announcement: z.string().trim().max(200).default("新鲜现做，叫号取餐"),
  username: z.string().trim().min(3).max(32),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(24).default("老板")
});

const resetOwnerSchema = v2OwnerLoginSchema.extend({
  displayName: z.string().trim().min(1).max(24).default("老板")
});

function ids(storeId: string) {
  return {
    owner: `${storeId}:owner`,
    config: `${storeId}:config`,
    category: `${storeId}:category-main`,
    product: `${storeId}:product-fuding`,
    exchange: `${storeId}:exchange-fuding`
  };
}

export async function initializeV2Store(repository: V2Repository, rawInput: unknown, now = new Date()) {
  const input = initializeSchema.parse(rawInput);
  if (await repository.getStoreConfig()) {
    throw new DomainError("STORE_ALREADY_INITIALIZED", "摊位已经初始化，不能重复执行");
  }
  const id = ids(repository.storeId);
  const timestamp = now.toISOString();
  const owner: V2OwnerAccount = {
    _id: id.owner,
    storeId: repository.storeId,
    username: input.username,
    displayName: input.displayName,
    passwordHash: await hashV2OwnerPassword(input.password),
    enabled: true,
    sessionVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const category: V2Category = {
    _id: id.category,
    storeId: repository.storeId,
    name: "招牌肉片",
    enabled: true,
    sortOrder: 10,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const product: V2Product = {
    _id: id.product,
    storeId: repository.storeId,
    categoryId: category._id,
    name: "雄飞肉片",
    description: "新鲜现打，现点现煮",
    basePrice: 1500,
    enabled: true,
    soldOut: false,
    sortOrder: 10,
    pointsEnabled: true,
    buyerPointsPerUnit: 10,
    inviterPointsPerUnit: 1,
    specGroups: [
      {
        id: "spice",
        name: "辣度",
        mode: "SINGLE",
        required: true,
        choices: [
          { id: "none", name: "不辣", priceDelta: 0, enabled: true },
          { id: "mild", name: "微辣", priceDelta: 0, enabled: true, isDefault: true },
          { id: "medium", name: "中辣", priceDelta: 0, enabled: true },
          { id: "hot", name: "重辣", priceDelta: 0, enabled: true }
        ]
      },
      {
        id: "toppings",
        name: "小料",
        mode: "MULTIPLE",
        required: false,
        maxSelect: 4,
        choices: [
          { id: "coriander", name: "香菜", priceDelta: 0, enabled: true },
          { id: "scallion", name: "葱花", priceDelta: 0, enabled: true },
          { id: "seaweed", name: "紫菜", priceDelta: 0, enabled: true },
          { id: "pickle", name: "榨菜", priceDelta: 0, enabled: true }
        ]
      }
    ],
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const exchange: V2ExchangeItem = {
    _id: id.exchange,
    storeId: repository.storeId,
    name: "雄飞肉片商品券",
    productId: product._id,
    productName: product.name,
    pointsCost: 100,
    validDays: 30,
    enabled: true,
    sortOrder: 10,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const config: V2StoreConfig = {
    _id: id.config,
    storeId: repository.storeId,
    storeName: input.storeName,
    announcement: input.announcement,
    businessOpen: false,
    dayBoundaryTime: "04:00",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  // Store config is written last and acts as the initialization marker. A retry can repair a partial setup.
  await repository.saveOwner(owner);
  await clearV2OwnerLoginAttempts(repository, owner.username, now);
  await repository.saveCategory(category);
  await repository.saveProduct(product);
  await repository.saveExchangeItem(exchange);
  await repository.saveStoreConfig(config);
  return { store: config, category, product, exchange, owner: { username: owner.username, displayName: owner.displayName } };
}

export async function resetV2Owner(repository: V2Repository, rawInput: unknown, now = new Date()) {
  const input = resetOwnerSchema.parse(rawInput);
  const id = ids(repository.storeId);
  const existing = await repository.getOwnerById(id.owner);
  if (!existing) throw new DomainError("OWNER_NOT_FOUND", "老板账号尚未初始化");
  const updated: V2OwnerAccount = {
    ...existing,
    username: input.username,
    displayName: input.displayName,
    passwordHash: await hashV2OwnerPassword(input.password),
    enabled: true,
    sessionVersion: existing.sessionVersion + 1,
    updatedAt: now.toISOString()
  };
  await repository.saveOwner(updated);
  await clearV2OwnerLoginAttempts(repository, existing.username, now);
  if (updated.username !== existing.username) await clearV2OwnerLoginAttempts(repository, updated.username, now);
  return { username: updated.username, displayName: updated.displayName };
}
