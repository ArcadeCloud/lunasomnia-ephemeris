/**
 * Pravi tabelu granica kineske godine za sajt.
 *
 * Racun traje ~28 ms po godini, pa 200 godina ne staje u Worker. Ali ti datumi se ne
 * menjaju - astronomija je ista - pa se racunaju JEDNOM i tabela se commit-uje u sajt.
 * Posetilac tako dobija odgovor trenutno i ne salje datum rodjenja nikome.
 *
 * Tabela je IZLAZ programa, ne njegov deo: AGPL na nju ne dopire.
 *
 * Pokretanje: node scripts-gen-chinese.mjs > ../../Lunasomnia/src/data/chinese-years.json
 */
import { readFileSync } from "node:fs";
import { SwissEph } from "./vendor/swisseph/bridge.js";
import { setEngine } from "./src/engine.ts";
import { chineseNewYear, liChun, cstDate } from "./src/chinese.ts";

const V = new URL("./vendor/", import.meta.url);
const b = (n) => new Uint8Array(readFileSync(new URL(n, V)));
const e = new SwissEph(new WebAssembly.Module(b("libswephe.wasm")));
for (const f of ["seas_18.se1", "sepl_18.se1", "semo_18.se1"]) e.mount(f, b(f));
e.set_ephe_path(".");
setEngine(e);

const OD = 1900, DO = 2100;
const godine = {};
for (let g = OD; g <= DO; g++) {
  // Cuva se samo "MM-DD" - godina je vec kljuc.
  godine[g] = [cstDate(chineseNewYear(g)).slice(5), cstDate(liChun(g)).slice(5)];
}
process.stdout.write(JSON.stringify({
  note: "Chinese new year and Li Chun dates in China Standard Time (UTC+8), computed " +
        "with the Swiss Ephemeris. Format: year -> [new_year, li_chun] as MM-DD.",
  source: "https://github.com/ArcadeCloud/lunasomnia-ephemeris",
  from: OD, to: DO,
  years: godine,
}) + "\n");
