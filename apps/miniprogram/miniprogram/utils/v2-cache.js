const entries = new Map();

function readCache(key) {
  const entry = entries.get(key);
  return entry ? entry.value : undefined;
}

function writeCache(key, value) {
  entries.set(key, { value, updatedAt: Date.now() });
  return value;
}

function isCacheFresh(key, maxAgeMs) {
  const entry = entries.get(key);
  return Boolean(entry && Date.now() - entry.updatedAt < maxAgeMs);
}

function invalidateCache(...keys) {
  keys.forEach((key) => {
    const entry = entries.get(key);
    if (entry) entry.updatedAt = 0;
  });
}

function clearCache() {
  entries.clear();
}

module.exports = { readCache, writeCache, isCacheFresh, invalidateCache, clearCache };
