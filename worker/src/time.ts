/**
 * Vreme: zidni sat u zoni -> UTC -> julijanski dan.
 *
 * Odvojeno od index.ts jer taj uvozi WASM, koji van Worker-a ne postoji - a ove dve
 * funkcije su upravo one koje mogu tiho da omanu: rezultat i dalje izgleda kao ispravan
 * datum, a karta ispadne sasvim druga. Ovako se testiraju obicnim Node-om.
 */
/**
 * Zidni sat u zoni -> UTC, preko Intl (u Workers-u postoji cela IANA baza).
 * Dva prolaza jer se pomak menja tacno oko granice letnjeg racunanja, gde prva
 * procena promasi za sat.
 */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const offset = (instant: Date): number => {
    const p: Record<string, number> = {};
    for (const { type, value } of new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(instant)) {
      if (type !== "literal") p[type] = Number(value);
    }
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
            - Math.floor(instant.getTime() / 1000) * 1000) / 60000;
  };
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  let off = offset(new Date(naive));
  let t = naive - off * 60000;
  const second = offset(new Date(t));
  if (second !== off) { off = second; t = naive - off * 60000; }
  return new Date(t);
}

/** Gregorijanski kalendar -> Julijanski dan (UT). */
export function julianDay(d: Date): number {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const frac = (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) / 24;
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1))
       + day + B - 1524.5 + frac;
}
