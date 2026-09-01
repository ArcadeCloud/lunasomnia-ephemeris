/**
 * Provera mena, pomracenja i ravnodnevica.
 *
 * Vrednosti se porede sa NEZAVISNIM izvorima, ne sa samima sobom: mene sa onim sto je
 * dao astronomy-engine (druga biblioteka, drugi autor), a ravnodnevice sa zvanicnim
 * datumima. Test koji proverava racun sopstvenim racunom ne dokazuje nista.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SwissEph } from "../vendor/swisseph/bridge.js";
import { setEngine } from "../src/engine.ts";
import { phases, eclipses, sunEvents } from "../src/moonsun.ts";

const V = new URL("../vendor/", import.meta.url);
const b = (n) => new Uint8Array(readFileSync(new URL(n, V)));
const e = new SwissEph(new WebAssembly.Module(b("libswephe.wasm")));
for (const f of ["seas_18.se1", "sepl_18.se1", "semo_18.se1"]) e.mount(f, b(f));
e.set_ephe_path(".");
setEngine(e);

const OD = new Date("2026-09-01T00:00:00Z");
const minuta = (a, b) => Math.abs(new Date(a) - new Date(b)) / 60000;

test("mene se poklapaju sa astronomy-engine-om", () => {
  // Nezavisno izracunato drugom bibliotekom (MIT, drugi autor, drugi algoritam).
  const OCEKIVANO = [
    ["last_quarter", "2026-09-04T07:51:42Z"],
    ["new",          "2026-09-11T03:27:00Z"],
    ["first_quarter","2026-09-18T20:44:00Z"],
    ["full",         "2026-09-26T16:49:32Z"],
  ];
  const dobijeno = phases(OD, 4);
  assert.equal(dobijeno.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.equal(dobijeno[i].phase, OCEKIVANO[i][0], `mena ${i}`);
    const d = minuta(dobijeno[i].utc, OCEKIVANO[i][1]);
    assert.ok(d <= 2, `${OCEKIVANO[i][0]}: razlika ${d.toFixed(1)} min (${dobijeno[i].utc})`);
  }
});

test("pun mesec je stvarno pun, mlad je stvarno mlad", () => {
  for (const p of phases(OD, 8)) {
    if (p.phase === "full") assert.ok(p.illumination > 0.98, `pun ali osvetljen ${p.illumination}`);
    if (p.phase === "new") assert.ok(p.illumination < 0.02, `mlad ali osvetljen ${p.illumination}`);
    if (p.phase.endsWith("quarter")) {
      assert.ok(Math.abs(p.illumination - 0.5) < 0.02, `cetvrt osvetljena ${p.illumination}`);
    }
  }
});

test("ravnodnevice i solsticiji 2026", () => {
  const d = Object.fromEntries(sunEvents(2026).map((x) => [x.event, x.utc]));
  // Zvanicni trenuci za 2026.
  const OCEK = {
    march_equinox:      "2026-03-20T14:46Z",
    june_solstice:      "2026-06-21T08:24Z",
    september_equinox:  "2026-09-23T00:05Z",
    december_solstice:  "2026-12-21T20:50Z",
  };
  for (const [k, v] of Object.entries(OCEK)) {
    const r = minuta(d[k], v.replace("Z", ":00Z"));
    assert.ok(r <= 3, `${k}: dobijeno ${d[k]}, ocekivano ${v}, razlika ${r.toFixed(1)} min`);
  }
});

test("pomracenja imaju vrstu, i krvavi mesec samo kad je potpuno", () => {
  const lista = eclipses(OD, 3);
  assert.ok(lista.length >= 4, `dobijeno ${lista.length}`);
  for (const p of lista) {
    assert.ok(["lunar", "solar"].includes(p.kind));
    assert.notEqual(p.type, "unknown", `nepoznata vrsta: ${JSON.stringify(p)}`);
    if (p.blood_moon) {
      assert.equal(p.kind, "lunar");
      assert.equal(p.type, "total", "krvavi mesec prijavljen a pomracenje nije potpuno");
    }
  }
});
