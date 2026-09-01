import { readFileSync } from "node:fs";
import { SwissEph } from "./vendor/swisseph/bridge.js";
import { setEngine } from "./src/engine.ts";
import { aspects, ingresses, jdFromDate, positions, stations } from "./src/transits.ts";
const V = new URL("./vendor/", import.meta.url);
const b = (n) => new Uint8Array(readFileSync(new URL(n, V)));
const e = new SwissEph(new WebAssembly.Module(b("libswephe.wasm")));
for (const f of ["seas_18.se1","sepl_18.se1","semo_18.se1"]) e.mount(f, b(f));
e.set_ephe_path("."); setEngine(e);
const jd = jdFromDate(new Date("2026-09-01T12:00:00Z"));
for (const dana of [1, 7, 30, 90]) {
  const t = performance.now();
  const r = { p: positions(jd).length, a: aspects(jd).length,
              i: ingresses(jd, jd + dana).length, s: stations(jd, jd + dana).length };
  console.log("  %3d dana: %5d ms   polozaja %d, aspekata %d, ulazaka %d, stajanja %d",
    dana, Math.round(performance.now() - t), r.p, r.a, r.i, r.s);
}
