/**
 * Provera racunanja: preneti Swiss Ephemeris + WASM + ubacivanje efemeridnih fajlova.
 *
 * Ovo je moglo da se testira tek kad je paket prenet u repozitorijum - dok je zavisio
 * od Deno-shim sloja, van Worker-a se nije ni ucitavao.
 *
 * Etalon: J2000 - 1.1.2000. u 12:00 UT na Grinicu, JD tacno 2451545,0. Kanonski
 * astronomski trenutak; namerno NIJE nicija natalna karta, jer datum i mesto rodjenja
 * su licni podatak i ne pripadaju javnom repozitorijumu.
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

const JD = 2451545.0;                      // J2000: 2000-01-01 12:00 UT
const sek = (a, b) => Math.abs(((a - b + 540) % 360) - 180) * 3600;

test("planete se poklapaju sa etalonom", () => {
  const ETALON = { 0: 280.368919, 1: 223.323751, 2: 271.889277, 3: 241.565788,
    4: 327.963303, 5: 25.253087, 6: 40.395663, 7: 314.809188, 8: 303.193013, 9: 251.454779 };
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
  assert.ok(sek(r.xx[0], 251.617626) <= 0.5, `Hiron promasen za ${sek(r.xx[0], 251.617626).toFixed(3)}"`);
});

test("ASC i MC se poklapaju", () => {
  const h = eph.swe_houses(JD, 51.4779, 0.0, "P".charCodeAt(0));
  assert.ok(sek(h.ascmc[0], 24.266189) <= 0.5, `ASC ${h.ascmc[0]}`);
  assert.ok(sek(h.ascmc[1], 279.611088) <= 0.5, `MC ${h.ascmc[1]}`);
  assert.equal(h.cusps.length >= 12, true);
});

test("whole-sign daje Mesec u 8. kuci", () => {
  const h = eph.swe_houses(JD, 51.4779, 0.0, "W".charCodeAt(0));
  const asc = h.ascmc[0], mesec = eph.swe_calc_ut(JD, 1, 256).xx[0];
  const kuca = ((Math.floor(mesec / 30) - Math.floor(asc / 30)) % 12 + 12) % 12 + 1;
  assert.equal(kuca, 8);
});
