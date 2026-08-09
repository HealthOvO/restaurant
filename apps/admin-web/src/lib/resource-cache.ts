const resources = new Map<string, unknown>();

export function readResourceCache<T>(key: string): T | undefined {
  return resources.get(key) as T | undefined;
}

export function writeResourceCache<T>(key: string, value: T): T {
  resources.set(key, value);
  return value;
}

export function invalidateResourceCache(...keys: string[]): void {
  keys.forEach((key) => resources.delete(key));
}

export function clearResourceCache(): void {
  resources.clear();
}
