/** Process independent hosts concurrently, keeping aliases of each host serial. */
export async function scanByHost<T extends { website: string | null }>(
  rows: T[], concurrency: number, process: (row: T) => Promise<void>, signal?: AbortSignal,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('INVALID_CONCURRENCY');
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    let key = '';
    try { key = new URL(row.website ?? '').hostname.replace(/^www\./, ''); } catch { /* Invalid URLs use one serial queue. */ }
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  const pending = [...groups.values()];
  let next = 0;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (!signal?.aborted) {
      const group = pending[next++];
      if (!group) return;
      for (const row of group) {
        if (signal?.aborted) return;
        await process(row);
      }
    }
  }));
  const failure = outcomes.find((outcome) => outcome.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
