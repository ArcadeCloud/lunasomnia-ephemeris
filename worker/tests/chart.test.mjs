/**
 * Provera racunanja: preneti Swiss Ephemeris + WASM + ubacivanje efemeridnih fajlova.
 *
 * Ovo je moglo da se testira tek kad je paket prenet u repozitorijum - dok je zavisio
 * od Deno-shim sloja, van Worker-a se nije ni ucitavao.
 *
 * Etalon: /root/astro (Swiss Ephemeris sa .se1 fajlovima, potvrdjen naspram Astrodienst-a).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SwissEph } from "../vendor/swisseph/bridge.js";

const V = new URL("../vendor/", import.meta.url);
const bajtovi = (ime) => new Uint8Array(readFileSync(new URL(ime, V)));

const eph = new SwissEph(new WebAssembly.Module(bajtovi("libswephe.wasm")));
eph.mount("seas_18.se1", bajtovi("seas_18.se1"));
eph.mount("sepl_18.se1", bajtovi("sepl_18.se1"));
eph.set_ephe_path(".");

const JD = 2452501.034722;                 // 2002-08-14 12:50 UT
const sek = (a, b) => Math.abs(((a - b + 540) % 360) - 180) * 3600;

test("planete se poklapaju sa etalonom", () => {
  const ETALON = { 0: 141.565233, 1: 219.970554, 2: 163.252023, 3: 187.349561,
    4: 140.402076, 5: 122.811552, 6: 86.209470, 7: 327.074322, 8: 309.246797, 9: 254.938216 };
  for (const [id, ocek] of Object.entries(ETALON)) {
    const r = eph.swe_calc_ut(JD, Number(id), 256);
    const d = sek(r.xx[0], ocek);
    // Mesec ide na Moshier jer semo_18.se1 namerno nije ukljucen; 0,14" je granica
    // koju to daje. Ostali imaju svoj fajl i moraju biti tacni.
    assert.ok(d <= (id === "1" ? 1 : 0.5), `telo ${id}: odstupanje ${d.toFixed(3)}"`);
  }
});

test("HIRON je prisutan i tacan", () => {
  const r = eph.swe_calc_ut(JD, 15, 256);
  assert.ok(Number.isFinite(r.xx?.[0]) && r.xx[0] !== 0,
    "Hiron nije izracunat - seas_18.se1 nije ubacen u WASM");
  assert.ok(sek(r.xx[0], 273.617330) <= 0.5, `Hiron promasen za ${sek(r.xx[0], 273.617330).toFixed(3)}"`);
});

test("ASC i MC se poklapaju", () => {
  const h = eph.swe_houses(JD, 44.8667, 20.65, "P".charCodeAt(0));
  assert.ok(sek(h.ascmc[0], 245.184624) <= 0.5, `ASC ${h.ascmc[0]}`);
  assert.ok(sek(h.ascmc[1], 175.554199) <= 0.5, `MC ${h.ascmc[1]}`);
  assert.equal(h.cusps.length >= 12, true);
});

test("whole-sign daje Mesec u 12. kuci", () => {
  const h = eph.swe_houses(JD, 44.8667, 20.65, "W".charCodeAt(0));
  const asc = h.ascmc[0], mesec = eph.swe_calc_ut(JD, 1, 256).xx[0];
  const kuca = ((Math.floor(mesec / 30) - Math.floor(asc / 30)) % 12 + 12) % 12 + 1;
  assert.equal(kuca, 12);
});
