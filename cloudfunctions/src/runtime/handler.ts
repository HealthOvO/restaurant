import { DEFAULT_STORE_ID } from "@restaurant/shared";
import { cloud } from "./cloud";
import { toErrorResponse } from "./errors";
import { RestaurantRepository } from "./repository";

interface CloudContext {
  OPENID?: string;
  APPID?: string;
  UNIONID?: string;
}

export function defineHandler<TEvent, TResult>(
  implementation: (args: {
    event: TEvent;
    context: CloudContext;
    repository: RestaurantRepository;
  }) => Promise<TResult>
) {
  return async (event: TEvent, context: CloudContext) => {
    try {
      const wxContext = cloud.getWXContext();
      const mergedContext: CloudContext = {
        ...context,
        OPENID: context?.OPENID || wxContext.OPENID,
        APPID: context?.APPID || wxContext.APPID,
        UNIONID: context?.UNIONID || wxContext.UNIONID
      };
      const storeId = (event as { storeId?: string } | undefined)?.storeId ?? DEFAULT_STORE_ID;
      const repository = new RestaurantRepository(storeId);
      return await implementation({
        event,
        context: mergedContext,
        repository
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
