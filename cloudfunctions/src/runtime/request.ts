import { DomainError, type Member } from "@restaurant/shared";
import { RestaurantRepository } from "./repository";

export function requireMiniProgramOpenId(openId?: string): string {
  if (!openId) {
    throw new DomainError("MINI_PROGRAM_IDENTITY_REQUIRED", "当前请求缺少微信身份");
  }

  return openId;
}

export async function requireMemberByOpenId(
  repository: RestaurantRepository,
  openId: string
): Promise<Member> {
  const member = await repository.getMemberByOpenId(openId);
  if (!member) {
    throw new DomainError("MEMBER_NOT_INITIALIZED", "请先完成会员初始化");
  }

  return member;
}
