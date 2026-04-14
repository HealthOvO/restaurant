import cloud from "wx-server-sdk";

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

export { cloud };
