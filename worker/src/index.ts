/**
 * lunasomnia-ephemeris kao Cloudflare Worker.
 *
 * Isti API kao Python servis u korenu ovog repozitorijuma; Python ostaje kao
 * referentna izvedba i merilo tacnosti, ovo je ono sto se stvarno isporucuje.
 *
 * AGPL: ovo je ZASEBAN Worker, isporucen iz ovog javnog repozitorijuma. Sajt koji ga
 * zove je drugi Worker, iz drugog repozitorijuma, i sa ovim razgovara obicnim JSON-om
 * preko HTTP-a. Pakovanje Swiss Ephemeris-a u Worker SAJTA napravilo bi od njih jedan
 * program i AGPL bi obuhvatio i sajt - zato se to ne sme raditi.
 */
import { boot } from "./ephemeris.ts";
import { computeChart, HOUSE_SYSTEMS } from "./chart.ts";
import { eclipses, phases, sunEvents } from "./moonsun.ts";
import { chineseNewYear, chineseYearFor, cstDate, liChun } from "./chinese.ts";
import { julianDay, zonedToUtc } from "./time.ts";

const SOURCE_URL = "https://github.com/ArcadeCloud/lunasomnia-ephemeris";

/**
 * Poreklo kojima je dozvoljen poziv iz pregledaca.
 *
 * Spisak je zatvoren, ne "*": posetilac koji trazi prosirenu kartu salje datum, vreme i
 * mesto rodjenja, pa nema razloga da bilo koja tudja stranica moze da otvori ovaj put.
 */
const ALLOWED_ORIGINS = new Set([
  "https://lunasomnia.com",
  "https://www.lunasomnia.com",
  "http://localhost:4321",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  // Vary je obavezan: bez njega bi kes mogao da posluzi odgovor sa jednim
  // Access-Control-Allow-Origin posetiocu sa drugog porekla.
  return { "access-control-allow-origin": origin, vary: "Origin" };
}

class BadRequest extends Error {}

const json = (data: unknown, status = 200, extra: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // AGPL clan 13: ponuda izvornog koda mora biti vidljiva korisniku servisa.
      link: `<${SOURCE_URL}>; rel="source"`,
      ...extra,
    },
  });

function num(v: unknown, name: string, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new BadRequest(`${name}: expected a number`);
  if (n < lo || n > hi) throw new BadRequest(`${name}: must be between ${lo} and ${hi}`);
  return n;
}

interface Body { utc?: string; local?: string; tz?: string; lat?: unknown; lon?: unknown;
                 house_system?: string; }

function parse(body: Body) {
  if (typeof body !== "object" || body === null) throw new BadRequest("body must be a JSON object");

  const system = String(body.house_system ?? "placidus").toLowerCase();
  if (!(system in HOUSE_SYSTEMS)) {
    throw new BadRequest(`house_system: expected one of ${Object.keys(HOUSE_SYSTEMS).join(", ")}`);
  }
  const lat = num(body.lat, "lat", -90, 90);
  const lon = num(body.lon, "lon", -180, 180);

  let when: Date;
  if (body.utc) {
    when = new Date(String(body.utc).replace(/Z$/, "") + "Z");
    if (Number.isNaN(when.getTime())) {
      throw new BadRequest("utc: expected ISO 8601, e.g. 2000-01-01T12:00:00Z");
    }
  } else {
    if (!body.tz) throw new BadRequest("provide either 'utc', or 'local' plus 'tz'");
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(body.local ?? ""));
    if (!m) throw new BadRequest("local: expected 'YYYY-MM-DDTHH:MM'");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: String(body.tz) }).format(new Date());
    } catch {
      throw new BadRequest(`tz: unknown IANA time zone ${body.tz}`);
    }
    when = zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], String(body.tz));
  }

  // Efemeridni fajlovi pokrivaju 1800-2399; van toga tacnost tiho pada.
  const year = when.getUTCFullYear();
  if (year < 1800 || year > 2399) {
    throw new BadRequest(`date out of range: ephemeris covers 1800-2399, got ${year}`);
  }
  return { jd: julianDay(when), when, lat, lon, system };
}

export default {
  async fetch(request: Request): Promise<Response> {
    boot();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      // Bez dozvoljenog porekla se ne odgovara sa 204: pregledac tada uredno odbije
      // zahtev, umesto da izgleda kao da je put otvoren pa da pukne kasnije.
      if (!Object.keys(cors).length) return json({ error: "origin not allowed" }, 403);
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/health") return json({ ok: true }, 200, cors);

      // Mesec, pomracenja i Sunce su GET jer za sve posetioce daju ISTI odgovor:
      // nebo ne zavisi od toga ko pita. Zato se i mogu kesirati na ivici.
      if (path === "/v1/chinese") {
        try {
          const kes = { "cache-control": "public, max-age=86400" };
          const granica = url.searchParams.get("boundary") ?? "chinese_new_year";
          if (granica !== "chinese_new_year" && granica !== "li_chun") {
            return json({ error: "boundary: expected chinese_new_year or li_chun" }, 400, cors);
          }
          const d = url.searchParams.get("date");
          if (d) {
            const kada = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T12:00:00Z" : d);
            if (Number.isNaN(kada.getTime())) {
              return json({ error: "date: expected YYYY-MM-DD" }, 400, cors);
            }
            const g = kada.getUTCFullYear();
            if (g < 1800 || g > 2399) {
              return json({ error: "date out of range: 1800-2399" }, 400, cors);
            }
            return json(chineseYearFor(kada, granica), 200, { ...cors, ...kes });
          }
          // Bez datuma: granice za zadatu godinu, za kalendar na stranici.
          const g = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
          if (!Number.isInteger(g) || g < 1800 || g > 2399) {
            return json({ error: "year: expected an integer between 1800 and 2399" }, 400, cors);
          }
          return json({
            year: g,
            chinese_new_year: cstDate(chineseNewYear(g)),
            li_chun: cstDate(liChun(g)),
            zodiac: chineseYearFor(new Date(Date.UTC(g, 5, 1)), granica),
          }, 200, { ...cors, ...kes });
        } catch (e) {
          console.error("neocekivana greska:", (e as Error)?.name, (e as Error)?.message);
          return json({ error: "internal error" }, 500, cors);
        }
      }

      if (path === "/v1/moon" || path === "/v1/eclipses" || path === "/v1/sun") {
        try {
          const kes = { "cache-control": "public, max-age=3600" };
          if (path === "/v1/sun") {
            const g = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
            if (!Number.isInteger(g) || g < 1800 || g > 2399) {
              return json({ error: "year: expected an integer between 1800 and 2399" }, 400, cors);
            }
            return json({ year: g, events: sunEvents(g) }, 200, { ...cors, ...kes });
          }

          const od = url.searchParams.get("from");
          const kada = od ? new Date(od) : new Date();
          if (Number.isNaN(kada.getTime())) {
            return json({ error: "from: expected ISO 8601, e.g. 2026-09-01" }, 400, cors);
          }
          const koliko = Number(url.searchParams.get("count") ?? 12);
          if (!Number.isInteger(koliko) || koliko < 1 || koliko > 60) {
            return json({ error: "count: expected an integer between 1 and 60" }, 400, cors);
          }
          return path === "/v1/moon"
            ? json({ from: kada.toISOString(), phases: phases(kada, koliko) }, 200, { ...cors, ...kes })
            : json({ from: kada.toISOString(), eclipses: eclipses(kada, koliko) }, 200, { ...cors, ...kes });
        } catch (e) {
          console.error("neocekivana greska:", (e as Error)?.name, (e as Error)?.message);
          return json({ error: "internal error" }, 500, cors);
        }
      }
      if (path === "/" || path === "/source") {
        return json({
          service: "lunasomnia-ephemeris",
          description: "Swiss Ephemeris behind a small JSON API.",
          license: "AGPL-3.0",
          source: SOURCE_URL,
          endpoints: {
            "POST /v1/chart": "natal chart",
            "GET /v1/moon": "moon phases (from, count)",
            "GET /v1/eclipses": "solar and lunar eclipses (from, count)",
            "GET /v1/sun": "equinoxes and solstices (year)",
            "GET /v1/chinese": "Chinese zodiac year (date, boundary)",
            "GET /health": "liveness",
          },
        }, 200, cors);
      }
      return json({ error: "not found" }, 404, cors);
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);
    if (path !== "/v1/chart") return json({ error: "not found" }, 404, cors);

    let body: Body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400, cors);
    }

    try {
      const req = parse(body);
      const chart = computeChart(req.jd, req.lat, req.lon, req.system);
      return json({
        ut: req.when.toISOString().replace(/\.\d{3}Z$/, "Z"),
        location: { lat: req.lat, lon: req.lon },
        house_system: req.system,
        ...chart,
        engine: { ephemeris: "Swiss Ephemeris (WASM)", license: "AGPL-3.0", source: SOURCE_URL },
      }, 200, cors);
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400, cors);
      // Belezi se SAMO vrsta i poruka greske. Ceo objekat izuzetka moze kroz `cause`
      // da nosi ulaz, a ulaz su datum, vreme i mesto necijeg rodjenja - to ne sme u
      // dnevnik ni u kom obliku.
      console.error("neocekivana greska:", (e as Error)?.name, (e as Error)?.message);
      return json({ error: "internal error" }, 500, cors);
    }
  },
};
