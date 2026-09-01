/**
 * Kineski kalendar: Li Chun i kineska Nova godina.
 *
 * Zasto se ovo racuna a ne prepisuje: kineska godina NE pocinje 1. januara, pa svaka
 * tabela koja zivotinju vezuje za gregorijansku godinu gresi za sve rodjene u januaru i
 * prvoj polovini februara. To je oko 12% ljudi.
 *
 * Dve skole, obe se ovde daju:
 *  - ZODIJACKA GRANICA po kineskoj Novoj godini (lunisolarna, 21.01-20.02)
 *  - GRANICA PO LI CHUN-u, prvom od 24 solarna termina (Sunce na 315 stepeni, oko 4.02),
 *    koju koristi bazi/ba zi astrologija
 *
 * Sve granice se racunaju u KINESKOM standardnom vremenu (UTC+8). Racun u UTC-u pomeri
 * datum za jedan dan kad mena padne uvece po Grinicu - a to je cest slucaj.
 */
import { engine } from "./engine.ts";

const SEFLG = 2;
const SUN = 0, MOON = 1;
const CST = 8 / 24;            // UTC+8 izrazen u danima
const SINODICKI = 29.530588;   // prosecna duzina lunacije

const norm360 = (x: number): number => ((x % 360) + 360) % 360;

export const jdToIso = (jd: number): string =>
  new Date((jd - 2440587.5) * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Datum u Kini (UTC+8) kao "YYYY-MM-DD" - granice se broje po njemu, ne po UTC-u. */
export function cstDate(jd: number): string {
  return new Date((jd + CST - 2440587.5) * 86400000).toISOString().slice(0, 10);
}

/** Ugao Mesec - Sunce; nula je mlad mesec. */
function elongacija(jd: number): number {
  const e = engine();
  return norm360((e.swe_calc_ut(jd, MOON, SEFLG).xx?.[0] ?? 0)
               - (e.swe_calc_ut(jd, SUN, SEFLG).xx?.[0] ?? 0));
}

/** Prvi mlad mesec posle `od`. Prepolovljavanje po razlici duzina. */
export function nextNewMoon(od: number): number {
  const f = (jd: number) => {
    const d = elongacija(jd);
    return d > 180 ? d - 360 : d;      // -180..180, nula u meni
  };
  let a = od, fa = f(a);
  for (let i = 0; i < 80; i++) {
    const b = a + 0.5, fb = f(b);
    if (fa < 0 && fb >= 0) {
      let lo = a, hi = b;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    a = b; fa = fb;
  }
  throw new Error("mlad mesec nije nadjen u 40 dana");
}

/** Poslednji mlad mesec na dan `do` ili pre njega. */
export function newMoonOnOrBefore(doJd: number): number {
  let t = nextNewMoon(doJd - SINODICKI - 2);
  // Ako je nadjeni vec posle cilja, vrati se jednu lunaciju unazad.
  while (t > doJd) t = nextNewMoon(t - SINODICKI - 2);
  let sledeci = nextNewMoon(t + 1);
  while (sledeci <= doJd) { t = sledeci; sledeci = nextNewMoon(t + 1); }
  return t;
}

/** Trenutak kad Sunce predje zadatu eklipticku duzinu, prvi put posle `od`. */
function solCross(stepen: number, od: number): number {
  const r = engine().swe_solcross_ut(stepen, od, SEFLG) as { returnCode: number };
  return r.returnCode;
}

/** Zimski solsticij (Sunce na 270 stepeni) u datoj gregorijanskoj godini. */
export function decemberSolstice(godina: number): number {
  const pocetak = (Date.UTC(godina, 10, 1) / 86400000) + 2440587.5;   // 1. novembar
  return solCross(270, pocetak);
}

/** Li Chun: Sunce na 315 stepeni, oko 4. februara. */
export function liChun(godina: number): number {
  const pocetak = (Date.UTC(godina, 0, 1) / 86400000) + 2440587.5;
  return solCross(315, pocetak);
}

/**
 * Kineska Nova godina za datu gregorijansku godinu.
 *
 * Pravilo: mesec 11 je onaj koji SADRZI decembarski solsticij. Prva kineska godina
 * pocinje dva meseca posle njega - osim kad se izmedju umetne prestupni mesec, pa tri.
 *
 * Prestupni mesec je prvi koji NE sadrzi glavni solarni termin (zhongqi - Sunce na
 * umnosku od 30 stepeni). Bez te provere kalendar odluta i CNY promasi za mesec dana
 * otprilike jednom u tri godine.
 */
export function chineseNewYear(godina: number): number {
  const m11a = newMoonOnOrBefore(decemberSolstice(godina - 1) + CST);
  const m11b = newMoonOnOrBefore(decemberSolstice(godina) + CST);
  const brojMeseci = Math.round((m11b - m11a) / SINODICKI);

  // Sakupi pocetke meseci od m11a nadalje.
  const pocetci: number[] = [m11a];
  for (let i = 0; i < brojMeseci; i++) pocetci.push(nextNewMoon(pocetci[i] + 1));

  if (brojMeseci !== 13) return pocetci[2];   // bez prestupnog: treci po redu

  // Sa prestupnim: nadji prvi mesec bez glavnog termina.
  let prestupni = -1;
  for (let i = 0; i < pocetci.length - 1; i++) {
    const od = pocetci[i], doo = pocetci[i + 1];
    let ima = false;
    for (let k = 0; k < 12; k++) {
      const t = solCross(k * 30, od - 1);
      if (t >= od && t < doo) { ima = true; break; }
    }
    if (!ima) { prestupni = i; break; }
  }
  // Ako prestupni pada pre prvog meseca, sve se pomera za jedan.
  return prestupni >= 0 && prestupni <= 2 ? pocetci[3] : pocetci[2];
}

/* ------------------------------------------------------- zivotinja i element */

export const ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake",
  "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"] as const;
export const ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"] as const;
export const STEMS = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"];
export const BRANCHES = ["Zi", "Chou", "Yin", "Mao", "Chen", "Si",
                         "Wu", "Wei", "Shen", "You", "Xu", "Hai"];

export interface ChineseYear {
  /** Kineska godina kojoj datum pripada, po izabranoj granici. */
  year: number;
  animal: string;
  element: string;
  yin_yang: "yang" | "yin";
  /** Nebeska grana i zemaljska grana, npr. "Bing-Wu". */
  stem_branch: string;
  /** Redni broj u 60-godisnjem ciklusu, 1-60. */
  sexagenary: number;
  boundary: "chinese_new_year" | "li_chun";
  boundary_date: string;
}

/**
 * Ciklus grana za gregorijansku godinu. 1984 je Jia-Zi, pocetak ciklusa - odatle
 * sve ostalo.
 */
function stemBranch(godina: number) {
  const s = ((godina - 4) % 10 + 10) % 10;
  const b = ((godina - 4) % 12 + 12) % 12;
  return {
    animal: ANIMALS[b],
    element: ELEMENTS[Math.floor(s / 2)],
    yin_yang: (s % 2 === 0 ? "yang" : "yin") as "yang" | "yin",
    stem_branch: `${STEMS[s]}-${BRANCHES[b]}`,
    sexagenary: (((godina - 4) % 60) + 60) % 60 + 1,
  };
}

/** Kojoj kineskoj godini pripada dati datum, po izabranoj granici. */
export function chineseYearFor(
  date: Date, boundary: "chinese_new_year" | "li_chun" = "chinese_new_year",
): ChineseYear {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const g = date.getUTCFullYear();
  const granica = boundary === "li_chun" ? liChun(g) : chineseNewYear(g);
  // Ako je datum PRE granice, pripada prethodnoj kineskoj godini.
  const godina = jd < granica ? g - 1 : g;
  const stvarnaGranica = godina === g ? granica
    : (boundary === "li_chun" ? liChun(godina) : chineseNewYear(godina));
  return {
    year: godina,
    ...stemBranch(godina),
    boundary,
    boundary_date: cstDate(stvarnaGranica),
  };
}
