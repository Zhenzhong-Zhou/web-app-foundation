/**
 * A seeded random source, so the same seed writes the same year every time.
 *
 * Math.random cannot be seeded, and two reports are only comparable if they
 * ran against the same data. Mulberry32: tiny, fast, and well enough
 * distributed for picking products and quantities. Nothing here is a secret.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** In [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** A whole number from min to max, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Nothing to pick from');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Up to `count` distinct items, in random order. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const taken: T[] = [];

    while (taken.length < count && pool.length > 0) {
      const index = Math.floor(this.next() * pool.length);
      taken.push(pool[index]);
      pool[index] = pool[pool.length - 1];
      pool.pop();
    }

    return taken;
  }
}
