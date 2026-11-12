/** Tiny WGSL "linker": modules declare dependencies and are concatenated once, deps first. */
export type WgslModule = {
  readonly name: string;
  readonly code: string;
  readonly deps?: readonly WgslModule[];
};

export const defineModule = (name: string, code: string, deps: readonly WgslModule[] = []): WgslModule => ({
  name,
  code,
  deps,
});

/** Topologically ordered, de-duplicated concatenation of the given modules and their deps. */
export const linkWgsl = (...roots: readonly WgslModule[]): string => {
  const done = new Set<string>();
  const visiting = new Set<string>();
  const parts: string[] = [];
  const visit = (m: WgslModule) => {
    if (done.has(m.name)) return;
    if (visiting.has(m.name)) throw new Error(`cyclic WGSL dependency at ${m.name}`);
    visiting.add(m.name);
    for (const d of m.deps ?? []) visit(d);
    visiting.delete(m.name);
    done.add(m.name);
    parts.push(`// ---- ${m.name} ----\n${m.code}`);
  };
  roots.forEach(visit);
  return parts.join('\n');
};
