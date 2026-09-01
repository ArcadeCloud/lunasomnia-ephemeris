/**
 * Provera kineskog kalendara.
 *
 * Datumi kineske Nove godine su NEZAVISNO poznati i ovde su upisani rucno. To je jedina
 * provera koja vredi: racun koji se poredi sam sa sobom ne dokazuje nista, a prestupni
 * meseci su mesto gde pojednostavljena pravila promase za ceo mesec.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SwissEph } from "../vendor/swisseph/bridge.js";
import { setEngine } from "../src/engine.ts";
import { chineseNewYear, chineseYearFor, cstDate, liChun } from "../src/chinese.ts";

const V = new URL("../vendor/", import.meta.url);
const b = (n) => new Uint8Array(readFileSync(new URL(n, V)));
const e = new SwissEph(new WebAssembly.Module(b("libswephe.wasm")));
for (const f of ["seas_18.se1", "sepl_18.se1", "semo_18.se1"]) e.mount(f, b(f));
e.set_ephe_path(".");
setEngine(e);

test("kineska Nova godina se poklapa sa poznatim datumima", () => {
  // Zvanicni datumi. 2033. je poznat slucaj sa prestupnim mesecom.
  const POZNATO = {
    2020: "2020-01-25", 2021: "2021-02-12", 2022: "2022-02-01",
    2023: "2023-01-22", 2024: "2024-02-10", 2025: "2025-01-29",
    2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26",
    2030: "2030-02-03", 2033: "2033-01-31", 2034: "2034-02-19",
  };
  const lose = [];
  for (const [g, ocek] of Object.entries(POZNATO)) {
    const dobijeno = cstDate(chineseNewYear(Number(g)));
    if (dobijeno !== ocek) lose.push(`${g}: ${dobijeno} umesto ${ocek}`);
  }
  assert.equal(lose.length, 0, "\n  " + lose.join("\n  "));
});

test("Li Chun pada 3-5. februara", () => {
  for (let g = 2020; g <= 2030; g++) {
    const d = cstDate(liChun(g));
    assert.match(d, new RegExp(`^${g}-02-0[345]$`), `${g}: ${d}`);
  }
});

test("zivotinja i element za poznate godine", () => {
  const P = [
    ["2024-06-01", 2024, "Dragon", "Wood"],
    ["2025-06-01", 2025, "Snake", "Wood"],
    ["2026-06-01", 2026, "Horse", "Fire"],
    ["1984-06-01", 1984, "Rat", "Wood"],   // pocetak 60-godisnjeg ciklusa
  ];
  for (const [datum, g, zivotinja, element] of P) {
    const r = chineseYearFor(new Date(datum + "T12:00:00Z"));
    assert.equal(r.year, g, datum);
    assert.equal(r.animal, zivotinja, datum);
    assert.equal(r.element, element, datum);
  }
  assert.equal(chineseYearFor(new Date("1984-06-01T12:00:00Z")).sexagenary, 1,
               "1984 je prva godina ciklusa");
});

test("rodjeni u januaru pripadaju PRETHODNOJ kineskoj godini", () => {
  // 2024. je Nova godina 10. februara. Ko je rodjen 1. februara 2024. je Zec (2023),
  // ne Zmaj - a upravo tu grese sve prepisane tabele.
  const pre = chineseYearFor(new Date("2024-02-01T12:00:00Z"));
  assert.equal(pre.year, 2023, `dobijeno ${pre.year}`);
  assert.equal(pre.animal, "Rabbit", `dobijeno ${pre.animal}`);

  const posle = chineseYearFor(new Date("2024-02-11T12:00:00Z"));
  assert.equal(posle.animal, "Dragon");
});

test("dve skole daju razlicit odgovor izmedju granica", () => {
  // 2024: Nova godina 10.02, Li Chun 4.02. Ko je rodjen 6. februara je Zmaj po
  // Li Chun-u a Zec po Novoj godini - i to se posetiocu MORA reci, ne izabrati umesto njega.
  const d = new Date("2024-02-06T12:00:00Z");
  assert.equal(chineseYearFor(d, "li_chun").animal, "Dragon");
  assert.equal(chineseYearFor(d, "chinese_new_year").animal, "Rabbit");
});
