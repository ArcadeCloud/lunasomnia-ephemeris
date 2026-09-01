/**
 * Pokretanje Swiss Ephemeris-a u Cloudflare Worker-u.
 *
 * Dve stvari koje Workers ne dozvoljava, a obican `load()` iz paketa ih radi:
 *  1. prevodjenje WASM-a u toku rada - zabranjeno,
 *  2. citanje sa fajl sistema - ne postoji.
 *
 * Zato se WASM UVOZI kao modul (Cloudflare ga prevede pri isporuci) i predaje direktno
 * konstruktoru `SwissEph`, a efemeridni fajlovi se ubacuju u memoriju preko `mount()`.
 *
 * Ovaj fajl NE sme da sadrzi nista osim toga: sve sto se moze testirati van Worker-a
 * stoji u chart.ts i moonsun.ts.
 */
import { SwissEph } from "../vendor/swisseph/bridge.js";
import { setEngine } from "./engine.ts";
import wasmModule from "../vendor/libswephe.wasm";
import seas from "../vendor/seas_18.se1";
import sepl from "../vendor/sepl_18.se1";
import semo from "../vendor/semo_18.se1";

/*
 * Sva tri fajla su ukljucena, ukupno 1,92 MB uz 1,22 MB WASM-a. Izmereno: prevodjenje
 * i ubacivanje traju 22 ms, pa hladan start nije trosak.
 *
 * semo_18.se1 (Mesec) je isprva bio izostavljen radi velicine, ali se pokazalo da bez
 * njega i SUNCE pada na Moshier: njegov prividni geocentricni polozaj trazi popravku za
 * baricentar sistema Zemlja-Mesec, pa su se ravnodnevice pomerale za desetak sekundi.
 *
 * seas_18.se1 je NEOPHODAN za Hirona: Moshier ne racuna asteroide uopste.
 */
let sagradjen = false;

export function boot(): void {
  if (sagradjen) return;
  const e = new SwissEph(wasmModule as WebAssembly.Module);
  e.mount("seas_18.se1", new Uint8Array(seas as ArrayBuffer));
  e.mount("sepl_18.se1", new Uint8Array(sepl as ArrayBuffer));
  e.mount("semo_18.se1", new Uint8Array(semo as ArrayBuffer));
  e.set_ephe_path(".");
  setEngine(e);
  sagradjen = true;
}
