/**
 * Provera vremenskih funkcija Worker-a, bez WASM-a i bez workerd-a.
 *
 * Julijanski dan i pretvaranje zone su jedini delovi koji mogu tiho da omanu:
 * rezultat i dalje izgleda kao ispravan datum, a karta ispadne sasvim druga.
 * Datumi su neutralni: licni podaci ne pripadaju javnom repozitorijumu.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { julianDay, zonedToUtc } from "../src/time.ts";

test("julijanski dan se poklapa sa etalonom", () => {
  const jd = julianDay(new Date("1975-07-01T11:00:00Z"));
  assert.ok(Math.abs(jd - 2442594.958333) < 1e-6, `dobijeno ${jd}`);
});

test("julijanski dan: J2000 je po definiciji 2451545.0", () => {
  assert.ok(Math.abs(julianDay(new Date("2000-01-01T12:00:00Z")) - 2451545.0) < 1e-9);
});

test("zone, ukljucujuci granicne slucajeve", () => {
  const sl = [
    // Jugoslavija je letnje racunanje uvela tek 1983 - jul 1975. je +1, ne +2.
    [1975, 7, 1, 12, 0, "Europe/Belgrade", "1975-07-01T11:00:00.000Z"],
    [2002, 1, 14, 9, 15, "Europe/Belgrade", "2002-01-14T08:15:00.000Z"],
    [2010, 7, 20, 18, 30, "Europe/Belgrade", "2010-07-20T16:30:00.000Z"],
    [1975, 1, 1, 12, 0, "Europe/London", "1975-01-01T12:00:00.000Z"],
    [2026, 8, 28, 12, 0, "America/New_York", "2026-08-28T16:00:00.000Z"],
    [2000, 3, 15, 9, 30, "Asia/Kolkata", "2000-03-15T04:00:00.000Z"],
    // granica prelaska na letnje vreme u Berlinu
    [2000, 3, 26, 1, 30, "Europe/Berlin", "2000-03-26T00:30:00.000Z"],
    [2000, 3, 26, 3, 30, "Europe/Berlin", "2000-03-26T01:30:00.000Z"],
  ];
  for (const [y, mo, d, h, mi, tz, ocek] of sl) {
    assert.equal(zonedToUtc(y, mo, d, h, mi, tz).toISOString(), ocek, `${tz} ${y}-${mo}-${d} ${h}:${mi}`);
  }
});
