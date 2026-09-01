/**
 * Mesec i Sunce: mene, pomracenja, ravnodnevice i solsticiji.
 *
 * Sve preko Swiss Ephemeris-a. Mene se NE dobijaju gotove: swisseph nudi prelaz preko
 * zadate duzine, a mena je ugao IZMEDJU Meseca i Sunca. Zato se trazi prepolovljavanjem
 * po razlici duzina - postupak je pouzdan jer ta razlika raste jednosmerno, oko 12,19
 * stepeni dnevno, i nikad ne stoji.
 */
import { engine, norm } from "./engine.ts";

const SEFLG = 2; // SEFLG_SWIEPH
const SUN = 0, MOON = 1;

/** Julijanski dan -> ISO trenutak. */
export function jdToIso(jd: number): string {
  // JD 2440587.5 je 1970-01-01T00:00:00Z.
  return new Date((jd - 2440587.5) * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isoToJd(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

/** Ugao Mesec - Sunce: 0 mlad, 90 prva cetvrt, 180 pun, 270 poslednja cetvrt. */
function elongation(jd: number): number {
  const e = engine();
  const m = e.swe_calc_ut(jd, MOON, SEFLG);
  const s = e.swe_calc_ut(jd, SUN, SEFLG);
  return norm((m.xx?.[0] ?? 0) - (s.xx?.[0] ?? 0));
}

/**
 * Prvi trenutak posle `from` kad ugao Mesec-Sunce dostigne `target`.
 *
 * Grubo trazenje ide korakom od pola dana - ugao za to vreme predje oko 6 stepeni, pa
 * se nijedna mena ne moze preskociti. Zatim 40 prepolovljavanja, sto spusta gresku
 * ispod milisekunde.
 */
function nextAngle(from: number, target: number): number {
  const razlika = (jd: number) => {
    const d = norm(elongation(jd) - target);
    return d > 180 ? d - 360 : d;   // -180..180, nula tacno u meni
  };
  const KORAK = 0.5;
  let a = from, fa = razlika(a);
  for (let i = 0; i < 80; i++) {
    const b = a + KORAK, fb = razlika(b);
    // Trazi se prelaz iz negativnog u pozitivno: ugao raste kroz metu.
    if (fa < 0 && fb >= 0) {
      let lo = a, hi = b;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (razlika(mid) < 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    a = b; fa = fb;
  }
  throw new Error(`mena ${target} nije nadjena u 40 dana od JD ${from}`);
}

export type PhaseName = "new" | "first_quarter" | "full" | "last_quarter";
const MENE: { name: PhaseName; angle: number }[] = [
  { name: "new", angle: 0 },
  { name: "first_quarter", angle: 90 },
  { name: "full", angle: 180 },
  { name: "last_quarter", angle: 270 },
];

export interface Phase {
  phase: PhaseName;
  utc: string;
  /** Osvetljeni deo ploce, 0-1. */
  illumination: number;
  /** Eklipticka duzina Meseca u tom trenutku. */
  moon_longitude: number;
  /**
   * Drugi pun mesec u istom kalendarskom mesecu (UTC). Racuna se, ne pretpostavlja -
   * "plavi mesec" je kalendarska pojava, ne astronomska.
   */
  blue_moon?: true;
}

/** Sledecih `count` glavnih mena posle datog trenutka. */
export function phases(from: Date, count: number): Phase[] {
  const e = engine();
  let jd = isoToJd(from);
  const out: Phase[] = [];
  const punihPoMesecu = new Map<string, number>();

  while (out.length < count) {
    // Za svaku od cetiri mene nadji prvu sledecu, pa uzmi najranju.
    let najbliza: { name: PhaseName; jd: number } | null = null;
    for (const m of MENE) {
      const t = nextAngle(jd, m.angle);
      if (!najbliza || t < najbliza.jd) najbliza = { name: m.name, jd: t };
    }
    if (!najbliza) break;

    const ph = e.swe_pheno_ut(najbliza.jd, MOON, SEFLG);
    const moon = e.swe_calc_ut(najbliza.jd, MOON, SEFLG);
    const utc = jdToIso(najbliza.jd);

    const stavka: Phase = {
      phase: najbliza.name,
      utc,
      // attr[1] je osvetljeni deo ploce.
      illumination: Number((ph.attr?.[1] ?? 0).toFixed(4)),
      moon_longitude: Number(norm(moon.xx?.[0] ?? 0).toFixed(6)),
    };

    if (najbliza.name === "full") {
      const kljuc = utc.slice(0, 7);
      const koliko = (punihPoMesecu.get(kljuc) ?? 0) + 1;
      punihPoMesecu.set(kljuc, koliko);
      if (koliko === 2) stavka.blue_moon = true;
    }

    out.push(stavka);
    jd = najbliza.jd + 0.5;   // pomeri se preko nadjene mene
  }
  return out;
}

/* ------------------------------------------------------------------ pomracenja */

// Vrednosti iz swephexp.h. Vracaju se kao bitovi u povratnom kodu.
const ECL_TOTAL = 4, ECL_ANNULAR = 8, ECL_PARTIAL = 16,
      ECL_ANNULAR_TOTAL = 32, ECL_PENUMBRAL = 64;

function lunarType(flags: number): string {
  if (flags & ECL_TOTAL) return "total";
  if (flags & ECL_PARTIAL) return "partial";
  if (flags & ECL_PENUMBRAL) return "penumbral";
  return "unknown";
}

function solarType(flags: number): string {
  if (flags & ECL_ANNULAR_TOTAL) return "hybrid";
  if (flags & ECL_TOTAL) return "total";
  if (flags & ECL_ANNULAR) return "annular";
  if (flags & ECL_PARTIAL) return "partial";
  return "unknown";
}

export interface Eclipse {
  kind: "lunar" | "solar";
  type: string;
  utc: string;
  /**
   * Samo potpuno pomracenje Meseca daje "krvavi mesec": tada Zemljina senka potpuno
   * prekrije plocu i do nje stize samo svetlo prelomljeno kroz atmosferu. Delimicno i
   * polusenkasto NE daju tu boju, pa se tako ni ne prijavljuju.
   */
  blood_moon?: true;
}

/** Sledecih `count` pomracenja svake vrste, spojenih i poredjanih po vremenu. */
export function eclipses(from: Date, count: number): Eclipse[] {
  const e = engine();
  const out: Eclipse[] = [];

  let jd = isoToJd(from);
  for (let i = 0; i < count; i++) {
    const r = e.swe_lun_eclipse_when(jd, SEFLG, 0, false);
    const t = r.tret?.[0];
    if (!Number.isFinite(t)) break;
    const type = lunarType(r.returnCode ?? 0);
    const stavka: Eclipse = { kind: "lunar", type, utc: jdToIso(t as number) };
    if (type === "total") stavka.blood_moon = true;
    out.push(stavka);
    jd = (t as number) + 1;
  }

  jd = isoToJd(from);
  for (let i = 0; i < count; i++) {
    const r = e.swe_sol_eclipse_when_glob(jd, SEFLG, 0, false);
    const t = r.tret?.[0];
    if (!Number.isFinite(t)) break;
    out.push({ kind: "solar", type: solarType(r.returnCode ?? 0), utc: jdToIso(t as number) });
    jd = (t as number) + 1;
  }

  return out.sort((a, b) => a.utc.localeCompare(b.utc)).slice(0, count * 2);
}

/* ------------------------------------------------- ravnodnevice i solsticiji */

export interface SunEvent { event: string; utc: string; }

/**
 * Trenuci kad Sunce predje 0, 90, 180 i 270 stepeni eklipticke duzine.
 * To su po definiciji prolecna ravnodnevica, letnji solsticij, jesenja ravnodnevica
 * i zimski solsticij - na severnoj hemisferi.
 */
export function sunEvents(year: number): SunEvent[] {
  const e = engine();
  const pocetak = isoToJd(new Date(Date.UTC(year, 0, 1)));
  const TACKE: [number, string][] = [
    [0, "march_equinox"], [90, "june_solstice"],
    [180, "september_equinox"], [270, "december_solstice"],
  ];
  return TACKE.map(([stepen, ime]) => {
    // swe_solcross_ut vraca trazeni julijanski dan u polju `returnCode` - ne u `tret`,
    // kao sto rade funkcije za pomracenja. Provereno, ne pretpostavljeno.
    const r = e.swe_solcross_ut(stepen, pocetak, SEFLG) as { returnCode: number };
    return { event: ime, utc: jdToIso(r.returnCode) };
  });
}
