export function createCloudbaseCommands(envId, region) {
  const regional = (...args) => ["-r", region, ...args];
  return {
    envList: regional("env", "list", "--json"),
    functionList: regional("fn", "list", "-e", envId, "--limit", "100", "--json"),
    deployFunction: (name) => regional(
      "--yes", "fn", "deploy", name,
      "-e", envId,
      "--force",
      "--deployMode", "zip"
    ),
    updateFunctionTimeout: (name, timeout) => regional(
      "api", "scf", "UpdateFunctionConfiguration",
      "--body", JSON.stringify({ FunctionName: name, Namespace: envId, Timeout: timeout }),
      "--json"
    )
  };
}

export function isFunctionDeploymentComplete(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "active" || normalized === "deployment completed" || normalized === "部署完成";
}
