const env = import.meta.env.VITE_TCB_ENV_ID || "replace-with-your-cloud-env-id";

let signedIn = false;
let appPromise: Promise<any> | null = null;

export class CloudFunctionError extends Error {
  code?: string;
  functionName: string;

  constructor(functionName: string, message: string, code?: string) {
    super(message);
    this.name = "CloudFunctionError";
    this.functionName = functionName;
    this.code = code;
  }
}

export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof CloudFunctionError) {
    return error.code;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

async function getCloudbaseApp() {
  if (!appPromise) {
    appPromise = import("@cloudbase/js-sdk").then(({ default: cloudbase }) =>
      cloudbase.init({
        env
      })
    );
  }

  return appPromise;
}

async function ensureAnonymousSession() {
  const app = await getCloudbaseApp();
  if (signedIn) {
    return app;
  }

  const auth = (app as any).auth?.({
    persistence: "local"
  });

  if (auth?.getLoginState) {
    const loginState = await auth.getLoginState();
    if (loginState) {
      signedIn = true;
      return app;
    }
  }

  if (auth?.anonymousAuthProvider) {
    await auth.anonymousAuthProvider().signIn();
  }
  signedIn = true;
  return app;
}

export async function callFunction<T = unknown>(name: string, data: Record<string, unknown>) {
  try {
    const app = await ensureAnonymousSession();
    const response = await app.callFunction({
      name,
      data
    });
    const result = (response as { result?: T & { ok?: boolean; code?: string; message?: string } }).result;
    if (!result) {
      throw new CloudFunctionError(name, "云函数无返回结果", "EMPTY_RESPONSE");
    }
    if ((result as { ok?: boolean }).ok === false) {
      throw new CloudFunctionError(
        name,
        (result as { message?: string }).message || "云函数执行失败",
        (result as { code?: string }).code
      );
    }
    return result;
  } catch (error) {
    if (error instanceof CloudFunctionError) {
      throw error;
    }

    throw new CloudFunctionError(name, error instanceof Error ? error.message : `调用云函数 ${name} 失败`);
  }
}
