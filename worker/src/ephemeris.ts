/**
 * Swiss Ephemeris u Cloudflare Worker-u.
 *
 * Dve stvari koje Workers ne dozvoljava, a obican `load()` iz paketa ih radi:
 *  1. prevodjenje WASM-a u toku rada (`new WebAssembly.Module(bytes)`) - zabranjeno,
 *  2. citanje sa fajl sistema - ne postoji.
 *
 * Zato se WASM UVOZI kao modul (Cloudflare ga prevede pri isporuci) i predaje direktno
 * konstruktoru `SwissEph`, a efemeridni fajlovi se ubacuju u memoriju preko `mount()`.
 */
import { SwissEph } from "../vendor/swisseph/bridge.js";
import wasmModule from "../vendor/libswephe.wasm";
import seas from "../vendor/seas_18.se1";
import sepl from "../vendor/sepl_18.se1";

/*
 * semo_18.se1 (Mesec, 1,24 MB) NAMERNO nije ukljucen. Bez njega Mesec ide na Moshier
 * i promasi 0,14 lucne sekunde - to je 0,001 sekunda vremena rodjenja, dakle daleko
 * ispod svake merljive nesigurnosti o tome kad je neko rodjen. Ustedjenih 1,24 MB je
 * trecina dozvoljene velicine Worker-a.
 *
 * seas_18.se1 (210 KB) je NEOPHODAN: bez njega Hirona nema uopste, jer Moshier ne
 * racuna asteroide. sepl_18.se1 (460 KB) daje planete na nulu umesto na 0,42".
 */

let eph: SwissEph | null = null;

/** Jedna instanca po izolatu; ubacivanje fajlova se radi samo prvi put. */
export function engine(): SwissEph {
  if (eph) return eph;
  const e = new SwissEph(wasmModule as WebAssembly.Module);
  e.mount("seas_18.se1", new Uint8Array(seas as ArrayBuffer));
  e.mount("sepl_18.se1", new Uint8Array(sepl as ArrayBuffer));
  e.set_ephe_path(".");
  eph = e;
  return e;
}

export const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"] as const;

export const norm = (x: number): number => ((x % 360) + 360) % 360;
export const signIndex = (lon: number): number => Math.floor(norm(lon) / 30);

export function dms(lon: number): string {
  const d = norm(lon) % 30;
  const deg = Math.floor(d);
  const m = (d - deg) * 60;
  const min = Math.floor(m);
  const sec = Math.round((m - min) * 60);
  return `${deg}°${String(min).padStart(2, "0")}'${String(sec).padStart(2, "0")}"`;
}

/** Imena kakva API vraca -> broj tela u Swiss Ephemeris-u. */
export const BODIES = {
  sun: 0, moon: 1, mercury: 2, venus: 3, mars: 4, jupiter: 5, saturn: 6,
  uranus: 7, neptune: 8, pluto: 9, true_node: 11, lilith: 12, chiron: 15,
} as const;
export type BodyName = keyof typeof BODIES;

export const HOUSE_SYSTEMS: Record<string, string> = {
  placidus: "P", whole_sign: "W", koch: "K", regiomontanus: "R",
  campanus: "C", equal: "A", porphyry: "O", alcabitius: "B",
};

export interface BodyPosition {
  longitude: number; latitude: number; speed: number;
  sign: string; degree: string; retrograde: boolean; house: number;
}

export interface Chart {
  julian_day: number;
  angles: { asc: number; mc: number; dsc: number; ic: number };
  cusps: number[];
  positions: Partial<Record<BodyName | "south_node", BodyPosition>>;
  sect: { diurnal: boolean; light: string; benefic: string; malefic: string };
  unavailable?: Record<string, string>;
}

/** Kuca po kvadrantnim kuspidima; whole-sign se racuna od znaka Ascendenta. */
function houseOf(lon: number, cusps: number[], asc: number, whole: boolean): number {
  if (whole) return ((signIndex(lon) - signIndex(asc)) % 12 + 12) % 12 + 1;
  const L = norm(lon);
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const span = norm(b - a) || 360;
    if (norm(L - a) < span) return i + 1;
  }
  return 12;
}

export function computeChart(
  jd: number, lat: number, lon: number, system: string,
): Chart {
  const e = engine();
  const hsys = (HOUSE_SYSTEMS[system] ?? "P").charCodeAt(0);
  const h = e.swe_houses(jd, lat, lon, hsys);
  const asc = norm(h.ascmc[0]), mc = norm(h.ascmc[1]);
  const cusps = Array.from({ length: 12 }, (_, i) => norm(h.cusps[i + 1] ?? h.cusps[i]));
  const whole = system === "whole_sign";

  const positions: Chart["positions"] = {};
  const unavailable: Record<string, string> = {};

  for (const [name, id] of Object.entries(BODIES) as [BodyName, number][]) {
    const r = e.swe_calc_ut(jd, id, 256 /* SEFLG_SPEED */);
    const v = r.xx?.[0];
    // Nula je vrednost koju swisseph vrati kad racun ne uspe; pravo telo na tacno
    // 0.000000 stepeni je toliko neverovatno da je ovo pouzdanija provera od `error`,
    // koji se puni i kad je rec o pukom upozorenju da se koristi Moshier.
    if (!Number.isFinite(v as number) || v === 0) {
      unavailable[name] = String(r.error ?? "calculation failed");
      continue;
    }
    const speed = r.xx?.[3] ?? 0;
    positions[name] = {
      longitude: Number(norm(v as number).toFixed(6)),
      latitude: Number((r.xx?.[1] ?? 0).toFixed(6)),
      speed: Number(speed.toFixed(6)),
      sign: SIGNS_EN[signIndex(v as number)],
      degree: dms(v as number),
      retrograde: speed < 0,
      house: houseOf(v as number, cusps, asc, whole),
    };
  }

  // Juzni cvor je uvek tacno naspram severnog; ne racuna se posebno.
  const nn = positions.true_node;
  if (nn) {
    const s = norm(nn.longitude + 180);
    positions.south_node = {
      ...nn, longitude: Number(s.toFixed(6)), sign: SIGNS_EN[signIndex(s)], degree: dms(s),
      house: houseOf(s, cusps, asc, whole),
    };
  }

  // Sekta: dan ako je Sunce iznad horizonta, tj. izmedju Descendenta i Ascendenta.
  const sun = positions.sun?.longitude ?? 0;
  const d = norm(sun - asc);
  const diurnal = d >= 180;

  const chart: Chart = {
    julian_day: Number(jd.toFixed(8)),
    angles: {
      asc: Number(asc.toFixed(6)), mc: Number(mc.toFixed(6)),
      dsc: Number(norm(asc + 180).toFixed(6)), ic: Number(norm(mc + 180).toFixed(6)),
    },
    cusps: cusps.map((c) => Number(c.toFixed(6))),
    positions,
    sect: {
      diurnal,
      light: diurnal ? "sun" : "moon",
      benefic: diurnal ? "jupiter" : "venus",
      malefic: diurnal ? "saturn" : "mars",
    },
  };
  if (Object.keys(unavailable).length) chart.unavailable = unavailable;
  return chart;
}
