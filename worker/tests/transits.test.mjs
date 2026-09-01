/**
 * Provera tranzita.
 *
 * Najjaca kontrolna tacka: ulazak Sunca u Ovna MORA biti isti trenutak kao prolecna
 * ravnodnevica, jer je to ista pojava racunata drugim putem - jedan preko granice znaka,
 * drugi preko eklipticke duzine. Ako se te dve brojke poklope, ceo lanac radi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SwissEph } from "../vendor/swisseph/bridge.js";
import { setEngine } from "../src/engine.ts";
import { aspects, ingresses, jdFromDate, positions, stations } from "../src/transits.ts";
import { sunEvents } from "../src/moonsun.ts";

const V = new URL("../vendor/", import.meta.url);
const b = (n) => new Uint8Array(readFileSync(new URL(n, V)));
const e = new SwissEph(new WebAssembly.Module(b("libswephe.wasm")));
for (const f of ["seas_18.se1", "sepl_18.se1", "semo_18.se1"]) e.mount(f, b(f));
e.set_ephe_path(".");
setEngine(e);

const minuta = (a, b) => Math.abs(new Date(a) - new Date(b)) / 60000;

test("ulazak Sunca u Ovna je prolecna ravnodnevica", () => {
  const od = jdFromDate(new Date("2026-03-15T00:00:00Z"));
  const doo = jdFromDate(new Date("2026-03-25T00:00:00Z"));
  const ulaz = ingresses(od, doo).find((i) => i.planet === "sun" && i.sign === "Aries");
  assert.ok(ulaz, "ulazak Sunca u Ovna nije nadjen");
  const ravnodnevica = sunEvents(2026).find((x) => x.event === "march_equinox").utc;
  const d = minuta(ulaz.utc, ravnodnevica);
  assert.ok(d <= 2, `razlika ${d.toFixed(1)} min: ${ulaz.utc} prema ${ravnodnevica}`);
});

test("Mesec menja znak svaka dva i po dana", () => {
  const od = jdFromDate(new Date("2026-09-01T00:00:00Z"));
  // Kratko razdoblje: Mesec se racuna. Za 10 dana ocekuju se 4 ili 5 ulazaka.
  const ulasci = ingresses(od, od + 10).filter((i) => i.planet === "moon");
  assert.ok(ulasci.length >= 4 && ulasci.length <= 5, `dobijeno ${ulasci.length}`);
  assert.equal(new Set(ulasci.map((i) => i.sign)).size, ulasci.length, "isti znak dvaput");
});

test("duga razdoblja NAMERNO izostavljaju Mesec", () => {
  const od = jdFromDate(new Date("2026-09-01T00:00:00Z"));
  // Mesec bi za 90 dana dao 39 od 49 ulazaka, svaki uz prepolovljavanje - to je bio
  // glavni trosak zbog kog je servis vracao 503. Gde je Mesec bio pre dva meseca
  // ionako nije podatak nego sum.
  const dugo = ingresses(od, od + 90);
  assert.equal(dugo.filter((i) => i.planet === "moon").length, 0, "Mesec je usao u dugo razdoblje");
  assert.ok(dugo.length >= 6, `sporih ulazaka ${dugo.length}`);
  // Granica je 10 dana: ispod nje Mesec mora biti tu.
  assert.ok(ingresses(od, od + 9).some((i) => i.planet === "moon"), "Mesec izostao iz kratkog razdoblja");
});

test("Merkur ima tri retrogradna razdoblja godisnje", () => {
  const od = jdFromDate(new Date("2026-01-01T00:00:00Z"));
  const sve = stations(od, od + 365).filter((s) => s.planet === "mercury");
  // Tri okretanja unazad i tri natrag = sest stajanja.
  assert.equal(sve.length, 6, `dobijeno ${sve.length}: ${sve.map((s) => s.direction + " " + s.utc.slice(0,10)).join(", ")}`);
  // Smerovi se moraju smenjivati.
  for (let i = 1; i < sve.length; i++) {
    assert.notEqual(sve[i].direction, sve[i - 1].direction, "dva ista smera zaredom");
  }
});

test("aspekti postuju orbis i imaju tacan trenutak", () => {
  const jd = jdFromDate(new Date("2026-09-01T12:00:00Z"));
  const lista = aspects(jd);
  assert.ok(lista.length > 0, "nijedan aspekt");
  const ORBIS = { conjunction: 6, sextile: 4, square: 6, trine: 5, opposition: 6 };
  for (const a of lista) {
    assert.ok(a.orb <= ORBIS[a.aspect], `${a.a}-${a.b} ${a.aspect} orbis ${a.orb}`);
    assert.notEqual(a.a, a.b, "planeta u aspektu sa sobom");
  }
  // Jedan par ne sme dati dva aspekta.
  const parovi = lista.map((a) => [a.a, a.b].sort().join("-"));
  assert.equal(new Set(parovi).size, parovi.length, "isti par dva puta");
});

test("pozicije se slazu sa znakom i stepenom", () => {
  const jd = jdFromDate(new Date("2026-09-01T12:00:00Z"));
  const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo",
                 "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  for (const p of positions(jd)) {
    assert.equal(p.sign, SIGNS[Math.floor(p.longitude / 30)], p.planet);
    assert.ok(Math.abs(p.degree - (p.longitude % 30)) < 0.02, p.planet);
  }
  // Sunce i Mesec nikad nisu retrogradni.
  const s = positions(jd).filter((p) => p.planet === "sun" || p.planet === "moon");
  assert.ok(s.every((p) => !p.retrograde), "Sunce ili Mesec prijavljeni kao retrogradni");
});
