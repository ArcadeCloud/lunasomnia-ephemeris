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

test("1985: solsticij i mlad mesec istog kineskog dana", () => {
  // Ovo je promasivano za CEO MESEC i nijedan test to nije video, jer su svi poceli od
  // 2020. Uzrok: kineski kalendar se racuna po DANIMA u Kini, a kod je poredio trenutke.
  //
  // Solsticij 1984. je 21.12. u 16:23 UTC = 22.12. u 00:23 po kineskom vremenu.
  // Mlad mesec je 22.12. u 11:47 UTC = 22.12. u 19:47 po kineskom. Isti dan, pa taj mlad
  // mesec pocinje mesec 11. Po trenucima ispada kasniji od solsticija, pa se sidro
  // pomerilo lunaciju unazad i Nova godina je ispala 21.01. umesto 20.02.
  assert.equal(cstDate(chineseNewYear(1985)), "1985-02-20");
});

test("kineska Nova godina, sirok raspon 1960-2034", () => {
  // Raspon je vazniji od broja: greska iz 1985. trazi da solsticij i mlad mesec padnu na
  // isti kineski dan, sto je retko - jedna godina na 201. Uzak opseg je promasi.
  const POZNATO = {
    1960:"01-28",1961:"02-15",1962:"02-05",1963:"01-25",1964:"02-13",1965:"02-02",
    1966:"01-21",1967:"02-09",1968:"01-30",1969:"02-17",1970:"02-06",1971:"01-27",
    1972:"02-15",1973:"02-03",1974:"01-23",1975:"02-11",1976:"01-31",1977:"02-18",
    1978:"02-07",1979:"01-28",1980:"02-16",1981:"02-05",1982:"01-25",1983:"02-13",
    1984:"02-02",1985:"02-20",1986:"02-09",1987:"01-29",1988:"02-17",1989:"02-06",
    1990:"01-27",1991:"02-15",1992:"02-04",1993:"01-23",1994:"02-10",1995:"01-31",
    1996:"02-19",1997:"02-07",1998:"01-28",1999:"02-16",2000:"02-05",2001:"01-24",
    2002:"02-12",2003:"02-01",2004:"01-22",2005:"02-09",2006:"01-29",2007:"02-18",
    2008:"02-07",2009:"01-26",2010:"02-14",2011:"02-03",2012:"01-23",2013:"02-10",
    2014:"01-31",2015:"02-19",2016:"02-08",2017:"01-28",2018:"02-16",2019:"02-05",
    2029:"02-13",2031:"01-23",2032:"02-11",
  };
  const lose = [];
  for (const [g, mmdd] of Object.entries(POZNATO)) {
    const dobijeno = cstDate(chineseNewYear(Number(g)));
    if (dobijeno !== `${g}-${mmdd}`) lose.push(`${g}: ${dobijeno} umesto ${g}-${mmdd}`);
  }
  assert.equal(lose.length, 0, `\n  ${lose.join("\n  ")}`);
});

test("Nova godina uvek pada izmedju 21.01 i 21.02", () => {
  // Astronomska granica: van tog raspona rezultat je sigurno pogresan, bez obzira na to
  // da li za tu godinu imamo objavljen datum za poredjenje.
  for (let g = 1900; g <= 2100; g += 7) {
    const d = cstDate(chineseNewYear(g)).slice(5);
    assert.ok(d >= "01-21" && d <= "02-21", `${g}: ${d}`);
  }
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
