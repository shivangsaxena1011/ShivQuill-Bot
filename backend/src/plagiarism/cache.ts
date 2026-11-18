/** Small in-memory TTL + LRU cache bounded by entry count and total weight (e.g. characters). */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number; weight: number }>();
  private totalWeight = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly maxWeight = Infinity,
    private readonly weigh: (v: V) => number = () => 1
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.ttlMs): void {
    this.delete(key);
    const weight = this.weigh(value);
    if (weight > this.maxWeight) return;
    this.map.set(key, { value, expires: Date.now() + ttlMs, weight });
    this.totalWeight += weight;
    for (const k of this.map.keys()) {
      if (this.map.size <= this.maxEntries && this.totalWeight <= this.maxWeight) break;
      this.delete(k);
    }
  }

  delete(key: string): void {
    const hit = this.map.get(key);
    if (!hit) return;
    this.totalWeight -= hit.weight;
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.totalWeight = 0;
  }
}
