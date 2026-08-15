export async function parallelMap<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (concurrency < 1) throw new Error('concurrency must be at least 1');

  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx]!, idx);
    }
  }

  const count = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}
