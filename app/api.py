# -*- coding: utf-8 -*-
"""
Oblikovanje odgovora: Chart -> JSON.

Kljucevi su na engleskom jer je ovo javan API; motor iznutra koristi srpska imena,
pa se ovde prevodi na jednom mestu.
"""
from __future__ import annotations

import datetime as dt

from . import core

# --- prevod imena motora u imena API-ja
BODY_EN = {
    "Sunce": "sun", "Mesec": "moon", "Merkur": "mercury", "Venera": "venus",
    "Mars": "mars", "Jupiter": "jupiter", "Saturn": "saturn", "Uran": "uranus",
    "Neptun": "neptune", "Pluton": "pluto",
    "Cvor": "true_node", "J.Cvor": "south_node", "Lilit": "lilith", "Hiron": "chiron",
}
LOT_EN = {
    "Fortuna": "fortune", "Duh": "spirit", "Baza": "basis", "Eros": "eros",
    "Nuznost": "necessity", "Hrabrost": "courage", "Pobeda": "victory",
    "Nemeza": "nemesis", "Egzaltacija": "exaltation", "Imovina": "property",
    "Trgovina": "trade", "Profesija": "profession",
}
HOUSE_SYSTEMS = {
    "placidus": b"P", "whole_sign": b"W", "koch": b"K", "regiomontanus": b"R",
    "campanus": b"C", "equal": b"A", "porphyry": b"O", "alcabitius": b"B",
}


class BadRequest(ValueError):
    """Neispravan zahtev - server ga pretvara u 400, ne u 500."""


def _num(value, name, lo, hi):
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise BadRequest(f"{name}: expected a number, got {value!r}")
    if not lo <= v <= hi:
        raise BadRequest(f"{name}: must be between {lo} and {hi}, got {v}")
    return v


def _int(value, name, lo, hi):
    v = _num(value, name, lo, hi)
    if v != int(v):
        raise BadRequest(f"{name}: must be a whole number, got {value!r}")
    return int(v)


def parse_request(body: dict) -> dict:
    """Proverava ulaz pre nego sto isti dodje do motora."""
    if not isinstance(body, dict):
        raise BadRequest("body must be a JSON object")

    system = str(body.get("house_system", "placidus")).lower()
    if system not in HOUSE_SYSTEMS:
        raise BadRequest(f"house_system: expected one of {sorted(HOUSE_SYSTEMS)}, got {system!r}")

    lat = _num(body.get("lat"), "lat", -90, 90)
    lon = _num(body.get("lon"), "lon", -180, 180)

    # Dva nacina zadavanja trenutka. "utc" je jednoznacan i preporucen; lokalno vreme
    # sa zonom postoji jer ga ljudi tako i znaju, ali trazi IANA ime - skraceniсe
    # tipa "CET" su viseznacne i namerno se ne primaju.
    if "utc" in body:
        raw = str(body["utc"]).replace("Z", "+00:00")
        try:
            when = dt.datetime.fromisoformat(raw)
        except ValueError:
            raise BadRequest("utc: expected ISO 8601, e.g. 2002-08-14T12:50:00Z")
        if when.tzinfo is None:
            when = when.replace(tzinfo=dt.timezone.utc)
        when = when.astimezone(dt.timezone.utc)
        jd = core.swe.julday(when.year, when.month, when.day,
                             when.hour + when.minute / 60 + when.second / 3600)
        ut = when.replace(tzinfo=None)
    else:
        tz = body.get("tz")
        if not tz:
            raise BadRequest("provide either 'utc', or 'local' plus 'tz'")
        local = body.get("local")
        if not local:
            raise BadRequest("local: expected 'YYYY-MM-DDTHH:MM'")
        try:
            naive = dt.datetime.fromisoformat(str(local))
        except ValueError:
            raise BadRequest("local: expected 'YYYY-MM-DDTHH:MM'")
        try:
            jd, ut = core.to_jd(naive.year, naive.month, naive.day,
                                naive.hour, naive.minute, str(tz))
        except Exception:
            raise BadRequest(f"tz: unknown IANA time zone {tz!r}")

    # Efemeridni fajlovi pokrivaju 1800-2400; van toga swisseph tiho gubi tacnost.
    year = core.jd_to_dt(jd).year
    if not 1800 <= year <= 2399:
        raise BadRequest(f"date out of range: ephemeris covers 1800-2399, got {year}")

    return {"jd": jd, "ut": ut, "lat": lat, "lon": lon,
            "system": system, "hsys": HOUSE_SYSTEMS[system]}


def _body_entry(ch: core.Chart, name: str, system: str) -> dict:
    lon = ch.pos[name]
    speed = ch.speed.get(name)
    return {
        "longitude": round(lon, 6),
        "latitude": round(ch.lat_ecl.get(name, 0.0), 6),
        "speed": None if speed is None else round(speed, 6),
        "sign": core.SIGNS_EN[core.sign_idx(lon)],
        "degree": core.dms(lon),
        "retrograde": bool(speed is not None and speed < 0),
        "house": ch.house(lon, "whole" if system == "whole_sign" else "quad"),
    }


def chart_json(req: dict, source_url: str) -> dict:
    ch = core.Chart(req["jd"], req["lat"], req["lon"], req["hsys"].decode())
    system = req["system"]

    positions = {}
    for srp, eng in BODY_EN.items():
        if srp in ch.pos:
            positions[eng] = _body_entry(ch, srp, system)

    lots = {}
    for srp, eng in LOT_EN.items():
        if srp in ch.pos:
            lots[eng] = {"longitude": round(ch.pos[srp], 6),
                         "sign": core.SIGNS_EN[core.sign_idx(ch.pos[srp])]}

    out = {
        "ut": req["ut"].isoformat() + "Z",
        "julian_day": round(req["jd"], 8),
        "location": {"lat": req["lat"], "lon": req["lon"]},
        "house_system": system,
        "angles": {
            "asc": round(ch.asc, 6), "mc": round(ch.mc, 6),
            "dsc": round(core.norm(ch.asc + 180), 6),
            "ic": round(core.norm(ch.mc + 180), 6),
            "vertex": round(ch.vertex, 6),
        },
        "cusps": [round(c, 6) for c in ch.cusps],
        "positions": positions,
        "lots": lots,
        "sect": {
            "diurnal": bool(ch.day),
            "light": BODY_EN[ch.sect_light],
            "benefic": BODY_EN[ch.sect_benefic],
            "malefic": BODY_EN[ch.sect_malefic],
        },
        "engine": {
            "ephemeris": "Swiss Ephemeris %s" % core.swe.version,
            "license": "AGPL-3.0",
            # AGPL clan 13: ko koristi servis preko mreze mora dobiti ponudu izvornog
            # koda. Zato stoji u SVAKOM odgovoru, ne samo na posebnoj adresi.
            "source": source_url,
        },
    }
    # Ako neko telo nije moglo da se izracuna, to se KAZE. Tiho izostavljanje bi
    # znacilo da korisnik dobije kartu bez Hirona i ne sazna da nesto fali.
    if ch.failed:
        out["unavailable"] = ch.failed
    return out
