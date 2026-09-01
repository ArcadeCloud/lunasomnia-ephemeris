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

/*
 * Provera SKLOPLJENE karte, a ne samo sirovih poziva swisseph-a.
 *
 * Povod: `norm` je pri preuredjivanju ostao koriscen a neuvezen. Isporuka je prosla,
 * a /v1/chart je pukao uzivo - jer su testovi gadjali swe_calc_ut umesto computeChart.
 * Sirovi pozivi ne dokazuju da je ono sto servis STVARNO vraca ispravno.
 */
import { computeChart, HOUSE_SYSTEMS } from "../src/chart.ts";
import { setEngine } from "../src/engine.ts";

setEngine(eph);

test("computeChart vraca potpunu kartu", () => {
  const k = computeChart(JD, 51.4779, 0.0, "placidus");

  assert.equal(Object.keys(k.positions).length, 14, "ocekivano 14 tela");
  assert.ok(!k.unavailable, `neka tela nisu izracunata: ${JSON.stringify(k.unavailable)}`);
  assert.ok(k.positions.chiron, "Hiron nedostaje");

  assert.ok(sek(k.angles.asc, 24.266189) <= 0.5, `ASC ${k.angles.asc}`);
  assert.ok(sek(k.angles.mc, 279.611088) <= 0.5, `MC ${k.angles.mc}`);
  assert.equal(k.cusps.length, 12);

  // Svako telo mora imati sve popunjeno - prazan `sign` ili `degree` znaci da je
  // negde u sklapanju pukla funkcija koja se ne vidi u sirovom pozivu.
  for (const [ime, p] of Object.entries(k.positions)) {
    assert.ok(typeof p.sign === "string" && p.sign.length > 2, `${ime}: sign = ${p.sign}`);
    assert.match(p.degree, /^\d{1,2}°\d{2}'\d{2}"$/, `${ime}: degree = ${p.degree}`);
    assert.ok(p.house >= 1 && p.house <= 12, `${ime}: kuca = ${p.house}`);
  }

  assert.ok(["sun", "moon"].includes(k.sect.light));
});

test("svi sistemi kuca daju upotrebljivu kartu", () => {
  for (const sistem of Object.keys(HOUSE_SYSTEMS)) {
    const k = computeChart(JD, 51.4779, 0.0, sistem);
    assert.equal(k.cusps.length, 12, `${sistem}: kuspida ${k.cusps.length}`);
    assert.ok(k.cusps.every((c) => c >= 0 && c < 360), `${sistem}: kuspid van opsega`);
    assert.ok(Object.keys(k.positions).length === 14, `${sistem}: tela`);
  }
});
