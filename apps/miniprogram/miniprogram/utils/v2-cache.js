const entries = new Map();
const generations = new Map();

function readCache(key) {
  const entry = entries.get(key);
  return entry ? entry.value : undefined;
}

function writeCache(key, value) {
  entries.set(key, { value, updatedAt: Date.now() });
  return value;
}

function cacheGeneration(key) {
  return generations.get(key) || 0;
}

function writeCacheIfCurrent(key, value, generation) {
  if (cacheGeneration(key) !== generation) return value;
  return writeCache(key, value);
}

function isCacheFresh(key, maxAgeMs) {
  const entry = entries.get(key);
  return Boolean(entry && Date.now() - entry.updatedAt < maxAgeMs);
}

function invalidateCache(...keys) {
  keys.forEach((key) => {
    generations.set(key, cacheGeneration(key) + 1);
    const entry = entries.get(key);
    if (entry) entry.updatedAt = 0;
  });
}

function clearCache() {
  entries.clear();
  generations.clear();
}

module.exports = { readCache, writeCache, writeCacheIfCurrent, cacheGeneration, isCacheFresh, invalidateCache, clearCache };
