/**
 * Dev-only timing helpers (Phase 19 instrumentation).
 *
 * The heavy lifting (fetch PerformanceNavigationTiming, server timing headers)
 * is already provided by the platform; this just makes targeted measurements
 * trivial. No-op outside development — zero production cost, no bundled code.
 */
export function perfTime(label: string): () => void {
  if (process.env.NODE_ENV !== "development") return () => {};
  const start = performance.now();
  return () => {
    console.log(`[PERF] ${label}: ${Math.round(performance.now() - start)}ms`);
  };
}

/** Wrap a function body with a timing probe: `const t = time("cart update"); … t();`. */
export async function measured<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const end = perfTime(label);
  try {
    return await fn();
  } finally {
    end();
  }
}