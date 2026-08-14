/**
 * Uniform-grid spatial hash used once at start-up to find neural neighbours.
 *
 * Connecting every particle to every other particle is O(n^2) and impossible
 * at 20k nodes; bucketing into cells of the search radius reduces the search
 * to the 27 neighbouring cells.
 */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, number[]>();
  private readonly positions: Float32Array;

  constructor(positions: Float32Array, cellSize: number) {
    this.positions = positions;
    this.cellSize = cellSize;

    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const key = this.keyAt(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(i);
      else this.buckets.set(key, [i]);
    }
  }

  private hashCell(cx: number, cy: number, cz: number): number {
    // Large primes keep collisions rare for the coordinate ranges we use.
    return (((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0);
  }

  private keyAt(x: number, y: number, z: number): number {
    return this.hashCell(
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
      Math.floor(z / this.cellSize),
    );
  }

  /**
   * Builds a de-duplicated neighbour list.
   * @param radius     maximum connection length
   * @param maxPerNode maximum outgoing links from a single node
   * @param maxTotal   hard cap on the number of links produced
   */
  buildPairs(radius: number, maxPerNode: number, maxTotal: number): Uint32Array {
    const count = this.positions.length / 3;
    const radiusSq = radius * radius;
    const degree = new Uint8Array(count);
    const pairs: number[] = [];
    const seen = new Set<number>();
    const neighbours: number[] = [];

    for (let i = 0; i < count && pairs.length < maxTotal * 2; i++) {
      if (degree[i] >= maxPerNode) continue;

      const x = this.positions[i * 3];
      const y = this.positions[i * 3 + 1];
      const z = this.positions[i * 3 + 2];
      const cx = Math.floor(x / this.cellSize);
      const cy = Math.floor(y / this.cellSize);
      const cz = Math.floor(z / this.cellSize);

      neighbours.length = 0;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const bucket = this.buckets.get(this.hashCell(cx + ox, cy + oy, cz + oz));
            if (!bucket) continue;
            for (let b = 0; b < bucket.length; b++) {
              const j = bucket[b];
              if (j <= i) continue;
              if (degree[j] >= maxPerNode) continue;
              const dx = this.positions[j * 3] - x;
              const dy = this.positions[j * 3 + 1] - y;
              const dz = this.positions[j * 3 + 2] - z;
              const distSq = dx * dx + dy * dy + dz * dz;
              if (distSq > radiusSq) continue;
              neighbours.push(j);
            }
          }
        }
      }

      for (let n = 0; n < neighbours.length && degree[i] < maxPerNode; n++) {
        const j = neighbours[n];
        if (degree[j] >= maxPerNode) continue;
        // Symmetric key so an i-j link is never emitted twice.
        const key = i * count + j;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(i, j);
        degree[i]++;
        degree[j]++;
        if (pairs.length >= maxTotal * 2) break;
      }
    }

    return Uint32Array.from(pairs);
  }
}
