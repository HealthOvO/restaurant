const test = require("node:test");
const assert = require("node:assert/strict");

const cache = require("../miniprogram/utils/v2-cache");

test("an invalidation prevents an older request from repopulating fresh cache", () => {
  cache.clearCache();
  const generation = cache.cacheGeneration("home");
  cache.writeCache("home", { value: "old" });
  cache.invalidateCache("home");
  cache.writeCacheIfCurrent("home", { value: "stale-response" }, generation);
  assert.deepEqual(cache.readCache("home"), { value: "old" });
  assert.equal(cache.isCacheFresh("home", 15_000), false);
});

test("the next request can populate cache using the current generation", () => {
  const generation = cache.cacheGeneration("home");
  cache.writeCacheIfCurrent("home", { value: "fresh-response" }, generation);
  assert.deepEqual(cache.readCache("home"), { value: "fresh-response" });
  assert.equal(cache.isCacheFresh("home", 15_000), true);
});
