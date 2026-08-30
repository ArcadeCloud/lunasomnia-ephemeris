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
import { computeChart, HOUSE_SYSTEMS } from "./ephemeris.ts";
import { julianDay, zonedToUtc } from "./time.ts";

const SOURCE_URL = "https://github.com/ArcadeCloud/lunasomnia-ephemeris";

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
      throw new BadRequest("utc: expected ISO 8601, e.g. 2002-08-14T12:50:00Z");
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
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/health") return json({ ok: true });
      if (path === "/" || path === "/source") {
        return json({
          service: "lunasomnia-ephemeris",
          description: "Swiss Ephemeris behind a small JSON API.",
          license: "AGPL-3.0",
          source: SOURCE_URL,
          endpoints: { "POST /v1/chart": "natal chart", "GET /health": "liveness" },
        });
      }
      return json({ error: "not found" }, 404);
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    if (path !== "/v1/chart") return json({ error: "not found" }, 404);

    let body: Body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
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
      });
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400);
      // Poruka izuzetka moze da sadrzi ulaz, a ulaz su podaci o rodjenju.
      console.error("neocekivana greska", e);
      return json({ error: "internal error" }, 500);
    }
  },
};
