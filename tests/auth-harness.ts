/* eslint-disable @typescript-eslint/no-explicit-any */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(resolve("package.json"));
export async function load(entry: string, mocks: Record<string, any>, globals: Record<string, any>) {
  const result = await build({ entryPoints: [resolve(entry)], tsconfig: resolve("tsconfig.json"), bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", packages: "external", plugins: [{ name: "boundaries", setup(b) {
    b.onResolve({ filter: /.*/ }, a => a.path in mocks ? { path: a.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: `module.exports = mocks[${JSON.stringify(a.path)}];`, loader: "js" }));
  } }] });
  const loaded = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require, mocks, console, process, URL, URLSearchParams, AbortSignal, ...globals });
  return loaded.exports;
}

// Run real component effects with controlled Firebase callbacks and network responses.
export function hooks() {
  const slots: any[] = [], pending: (() => void)[] = [];
  let index = 0;
  const same = (a: any[], b: any[]) => a?.length === b.length && a.every((v, i) => v === b[i]);
  return {
    render: (component: () => any) => { index = 0; return component(); },
    flush: async () => { pending.splice(0).forEach(f => f()); await new Promise(resolve => setImmediate(resolve)); },
    react: {
      createContext: () => ({ Provider: "provider" }),
      useState: (initial: any) => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
      useRef: (initial: any) => { const i = index++; return slots[i] ??= { current: initial }; },
      useMemo: (fn: () => any) => { index++; return fn(); },
      useCallback: (fn: any, deps: any[]) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
      useEffect: (fn: () => any, deps: any[]) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) { const prev = slots[i]; slots[i] = { deps }; pending.push(() => { prev?.cleanup?.(); slots[i].cleanup = fn(); }); } }
    }
  };
}
export function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
