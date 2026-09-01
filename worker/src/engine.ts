/**
 * Drzac instance Swiss Ephemeris-a.
 *
 * Odvojen od ephemeris.ts zato sto taj uvozi WASM kao modul, sto radi SAMO u Workers-u.
 * Ovako moonsun.ts i testovi mogu do motora bez tog uvoza: u isporuci ga postavlja
 * ephemeris.ts, u testu ga postavlja sam test iz procitanih bajtova.
 */
import type { SwissEph } from "../vendor/swisseph/bridge.js";

let eph: SwissEph | null = null;

export function setEngine(e: SwissEph): void { eph = e; }

export function engine(): SwissEph {
  if (!eph) throw new Error("motor nije postavljen: pozovi setEngine() pre racunanja");
  return eph;
}

export const norm = (x: number): number => ((x % 360) + 360) % 360;
