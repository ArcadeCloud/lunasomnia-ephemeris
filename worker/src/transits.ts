/**
 * Tranziti: aspekti, ulasci u znak i stajanja.
 *
 * Ovo je ono sto dnevni horoskop treba da bi imao STA da kaze. Bez toga tekst moze samo
 * da laska; sa ovim svaka recenica ima izracunat povod - koja planeta, u kom znaku, pod
 * kojim uglom i kad tacno.
 */
import { engine, norm } from "./engine.ts";

const SEFLG = 2 | 256;   // SWIEPH | SPEED
const DAN = 86400000;

export const PLANETS: Record<string, number> = {
  sun: 0, moon: 1, mercury: 2, venus: 3, mars: 4,
  jupiter: 5, saturn: 6, uranus: 7, neptune: 8, pluto: 9,
};

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;

/**
 * Klasicnih pet aspekata (Ptolemejevi). Orbis je uzi nego u popularnoj astrologiji
 * namerno: sirok orbis znaci da je uvek nesto "u aspektu", pa tekst prestaje da bude
 * vezan za trenutak i postaje opsti - a to je tacno ono sto ne zelimo.
 */
export const ASPECTS = [
  { name: "conjunction", angle: 0, orb: 6, nature: "intensifying" },
  { name: "sextile", angle: 60, orb: 4, nature: "easy" },
  { name: "square", angle: 90, orb: 6, nature: "tense" },
  { name: "trine", angle: 120, orb: 5, nature: "easy" },
  { name: "opposition", angle: 180, orb: 6, nature: "tense" },
] as const;

export const jdFromDate = (d: Date): number => d.getTime() / DAN + 2440587.5;
export const jdToIso = (jd: number): string =>
  new Date((jd - 2440587.5) * DAN).toISOString().replace(/\.\d{3}Z$/, "Z");

interface Pozicija { lon: number; speed: number }

function pozicija(planeta: number, jd: number): Pozicija {
  const r = engine().swe_calc_ut(jd, planeta, SEFLG);
  return { lon: norm(r.xx?.[0] ?? 0), speed: r.xx?.[3] ?? 0 };
}

export interface Position {
  planet: string;
  longitude: number;
  sign: string;
  degree: number;
  retrograde: boolean;
}

export function positions(jd: number): Position[] {
  return Object.entries(PLANETS).map(([ime, id]) => {
    const p = pozicija(id, jd);
    return {
      planet: ime,
      longitude: Number(p.lon.toFixed(4)),
      sign: SIGNS[Math.floor(p.lon / 30)],
      degree: Number((p.lon % 30).toFixed(2)),
      retrograde: p.speed < 0,
    };
  });
}

export interface Aspect {
  a: string; b: string;
  aspect: string;
  nature: string;
  /** Odstupanje od tacnog ugla, u stepenima. */
  orb: number;
  /** Da li se aspekt jos zatvara (applying) ili se vec razilazi. */
  applying: boolean;
  /** Trenutak kad je tacan, ako pada u trazenom razdoblju. */
  exact?: string;
}

/** Razlika dva ugla svedena na -180..180. */
const razlika = (a: number, b: number): number => {
  const d = norm(a - b);
  return d > 180 ? d - 360 : d;
};

/**
 * Aspekti u datom trenutku.
 *
 * `applying` se odredjuje poredjenjem odstupanja sada i za sat vremena - to je
 * pouzdanije od racunanja sa brzinama, jer obuhvata i slucaj kad je jedna planeta
 * retrogradna.
 */
export function aspects(jd: number, exactWithinDays = 1): Aspect[] {
  const imena = Object.keys(PLANETS);
  const sada = new Map(imena.map((n) => [n, pozicija(PLANETS[n], jd)]));
  const kasnije = new Map(imena.map((n) => [n, pozicija(PLANETS[n], jd + 1 / 24)]));
  const out: Aspect[] = [];

  for (let i = 0; i < imena.length; i++) {
    for (let j = i + 1; j < imena.length; j++) {
      const a = imena[i], b = imena[j];
      const sep = Math.abs(razlika(sada.get(a)!.lon, sada.get(b)!.lon));
      const sepK = Math.abs(razlika(kasnije.get(a)!.lon, kasnije.get(b)!.lon));

      for (const asp of ASPECTS) {
        const odstupanje = Math.abs(sep - asp.angle);
        if (odstupanje > asp.orb) continue;
        const zatvara = Math.abs(sepK - asp.angle) < odstupanje;

        const stavka: Aspect = {
          a, b, aspect: asp.name, nature: asp.nature,
          orb: Number(odstupanje.toFixed(2)),
          applying: zatvara,
        };
        const t = tacanTrenutak(a, b, asp.angle, jd, exactWithinDays);
        if (t !== null) stavka.exact = jdToIso(t);
        out.push(stavka);
        break;   // jedan par daje najvise jedan aspekt
      }
    }
  }
  // Najuzi orbis prvi: to je aspekt koji se stvarno oseca.
  return out.sort((x, y) => x.orb - y.orb);
}

/** Trenutak kad par dostigne tacan ugao, ako pada unutar +/- `dana`. */
function tacanTrenutak(a: string, b: string, ugao: number, jd: number, dana: number): number | null {
  const f = (t: number) =>
    Math.abs(razlika(pozicija(PLANETS[a], t).lon, pozicija(PLANETS[b], t).lon)) - ugao;
  const korak = 1 / 8;
  let prosli = f(jd - dana);
  for (let t = jd - dana + korak; t <= jd + dana; t += korak) {
    const sad = f(t);
    if (prosli === 0) return t - korak;
    if ((prosli < 0) !== (sad < 0)) {
      let lo = t - korak, hi = t;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) < 0) === (f(mid) < 0)) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prosli = sad;
  }
  return null;
}

export interface Ingress { planet: string; sign: string; utc: string }

/**
 * Korak trazenja po planeti, u danima.
 *
 * Bira se tako da planeta izmedju dva merenja NE MOZE preci ceo znak (30 stepeni) - inace
 * bi se ulazak preskocio. Mesec ide 13,2 stepena dnevno pa mu treba dan; Saturn ide 0,03
 * pa mu je i deset dana previse gusto.
 *
 * Ovo nije sitna optimizacija: jedinstven korak od dva sata za sve planete znacio je
 * 10.800 racunanja polozaja za 90 dana i obarao Worker sa 503.
 */
const KORAK: Record<string, number> = {
  moon: 1, sun: 5, mercury: 4, venus: 5, mars: 8,
  jupiter: 20, saturn: 20, uranus: 20, neptune: 20, pluto: 20,
};

/**
 * Ulasci planeta u novi znak unutar razdoblja.
 *
 * Mesec ih pravi svaka dva i po dana, spore planete jednom u nekoliko godina - i upravo
 * su te retke ono sto se u horoskopu stvarno oseti.
 */
export function ingresses(odJd: number, doJd: number): Ingress[] {
  const out: Ingress[] = [];
  for (const [ime, id] of Object.entries(PLANETS)) {
    const korak = KORAK[ime] ?? 5;
    let prosla = Math.floor(pozicija(id, odJd).lon / 30);
    // Kraj opsega se meri izricito. Raniji pokusaj da se poslednji korak skrati na tacan
    // kraj ("if (t > doJd) t = doJd" unutar for-a) napravio je BESKONACNU petlju: t se
    // vracao na doJd i odmah opet povecavao.
    let t = odJd + korak;
    for (;;) {
      const kraj = t >= doJd;
      if (kraj) t = doJd;
      const znak = Math.floor(pozicija(id, t).lon / 30);
      if (znak === prosla) {
        if (kraj) break;
        t += korak;
        continue;
      }
      // Nadji granicu prepolovljavanjem. 24 koraka spusta gresku ispod sekunde.
      let lo = t - korak, hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (Math.floor(pozicija(id, mid).lon / 30) === prosla) lo = mid; else hi = mid;
      }
      out.push({ planet: ime, sign: SIGNS[znak], utc: jdToIso(hi) });
      prosla = znak;
      if (kraj) break;
      t += korak;
    }
  }
  return out.sort((a, b) => a.utc.localeCompare(b.utc));
}

export interface Station { planet: string; direction: "retrograde" | "direct"; utc: string }

/** Stajanja: trenuci kad planeta menja smer. Mesec i Sunce ih nemaju. */
export function stations(odJd: number, doJd: number): Station[] {
  const out: Station[] = [];
  // Dva dana: brzina planete se menja sporo, pa se stajanje ne moze preskociti.
  const korak = 2;
  for (const [ime, id] of Object.entries(PLANETS)) {
    if (ime === "sun" || ime === "moon") continue;
    let prosla = pozicija(id, odJd).speed;
    for (let t = odJd + korak; t <= doJd; t += korak) {
      const v = pozicija(id, t).speed;
      if ((prosla < 0) === (v < 0)) { prosla = v; continue; }
      let lo = t - korak, hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if ((pozicija(id, mid).speed < 0) === (prosla < 0)) lo = mid; else hi = mid;
      }
      out.push({ planet: ime, direction: v < 0 ? "retrograde" : "direct", utc: jdToIso(hi) });
      prosla = v;
    }
  }
  return out.sort((a, b) => a.utc.localeCompare(b.utc));
}
