# -*- coding: utf-8 -*-
"""
Provera servisa PREKO HTTP-a, u posebnoj niti.

Kljucno je da testovi idu kroz mrezu, a ne da zovu funkcije direktno. Prva ozbiljna
greska u ovom servisu bila je upravo takva: pyswisseph cuva putanju do efemerida po
niti, pa je Hiron radio u direktnom pozivu a tiho izostajao iz karte koju vrati
visenitni server. Direktan test to nikad ne bi uhvatio.

Pokretanje: python -m tests.test_service

Direktorijum se zove `tests`, a ne `test`, jer je `test` ime paketa iz standardne
biblioteke Pythona. Sa imenom `test` stdlib zaseni lokalni direktorijum i uvoz pukne
na svakoj urednoj instalaciji - lokalno je prolazilo samo zato sto Termux taj paket
ne isporucuje.
"""
from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from app.server import Handler

HOST, PORT = "127.0.0.1", 8477
BASE = f"http://{HOST}:{PORT}"

# Etalon: Jovanova karta, potvrdjena naspram Astrodienst-a do 0,5 lucne sekunde.
ETALON = {
    "local": "2002-08-14T14:50", "tz": "Europe/Belgrade",
    "lat": 44.8667, "lon": 20.65,
}
OCEKIVANO = {
    "ut": "2002-08-14T12:50:00Z",
    "asc": 245.184624, "mc": 175.554199,
    "sun": 141.565233, "moon": 219.970554, "chiron": 273.617330,
}

_pali = 0


def proveri(uslov: bool, opis: str) -> None:
    global _pali
    if uslov:
        print(f"  ok   {opis}")
    else:
        _pali += 1
        print(f"  PAO  {opis}")


def post(putanja: str, telo, ocekivan_kod: int = 200):
    podaci = json.dumps(telo).encode() if not isinstance(telo, bytes) else telo
    req = urllib.request.Request(BASE + putanja, data=podaci,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.load(r), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e), dict(e.headers)


def get(putanja: str):
    try:
        with urllib.request.urlopen(BASE + putanja, timeout=10) as r:
            return r.status, json.load(r), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e), dict(e.headers)


def main() -> int:
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        # --- osnovno
        kod, telo, _ = get("/health")
        proveri(kod == 200 and telo.get("ok") is True, "GET /health vraca 200")

        kod, telo, zagl = get("/source")
        proveri(kod == 200 and telo.get("license") == "AGPL-3.0", "GET /source navodi AGPL-3.0")
        proveri('rel="source"' in zagl.get("Link", ""),
                "Link zaglavlje nudi izvorni kod (AGPL clan 13)")

        # --- tacnost
        kod, d, _ = post("/v1/chart", ETALON)
        proveri(kod == 200, "POST /v1/chart vraca 200")
        proveri(d["ut"] == OCEKIVANO["ut"], f"UT je {OCEKIVANO['ut']}")

        def blizu(dobijeno, ocek, granica_sek=1.0):
            return abs(((dobijeno - ocek + 540) % 360) - 180) * 3600 <= granica_sek

        proveri(blizu(d["angles"]["asc"], OCEKIVANO["asc"]), "ASC se poklapa sa etalonom")
        proveri(blizu(d["angles"]["mc"], OCEKIVANO["mc"]), "MC se poklapa sa etalonom")
        proveri(blizu(d["positions"]["sun"]["longitude"], OCEKIVANO["sun"]), "Sunce se poklapa")
        proveri(blizu(d["positions"]["moon"]["longitude"], OCEKIVANO["moon"]), "Mesec se poklapa")

        # REGRESIJA: Hiron trazi seas_18.se1, a putanja do efemerida je thread-local.
        # Ovo je jedina provera koja hvata da radna nit servera ne vidi fajlove.
        proveri("chiron" in d["positions"], "Hiron je PRISUTAN (regresija: thread-local putanja)")
        proveri(blizu(d["positions"]["chiron"]["longitude"], OCEKIVANO["chiron"]),
                "Hiron se poklapa sa etalonom")
        proveri(not d.get("unavailable"), "nijedno telo nije izostalo")
        proveri(len(d["positions"]) == 14, f"14 tela u karti (dobijeno {len(d['positions'])})")

        # --- Placidus kuspidi
        proveri(len(d["cusps"]) == 12, "12 kuspida")
        proveri(blizu(d["cusps"][0], OCEKIVANO["asc"]), "prvi kuspid je Ascendent")

        # --- oba nacina zadavanja trenutka daju isti rezultat
        _, d2, _ = post("/v1/chart", {"utc": "2002-08-14T12:50:00Z", "lat": 44.8667, "lon": 20.65})
        proveri(blizu(d2["angles"]["asc"], d["angles"]["asc"], 0.01),
                "'utc' i 'local'+'tz' daju istu kartu")

        # --- sistemi kuca
        _, dw, _ = post("/v1/chart", {**ETALON, "house_system": "whole_sign"})
        proveri(dw["house_system"] == "whole_sign", "whole_sign se prihvata")
        proveri(dw["positions"]["moon"]["house"] == 12, "Mesec je u 12. kuci (whole sign)")

        # --- odbijanje neispravnog ulaza
        for opis, telo, kod_ocek in [
            ("nedostaje mesto",        {"utc": "2002-08-14T12:50:00Z"}, 400),
            ("sirina van opsega",      {**ETALON, "lat": 91}, 400),
            ("nepoznata zona",         {**ETALON, "tz": "Europe/Atlantis"}, 400),
            ("nepoznat sistem kuca",   {**ETALON, "house_system": "izmisljen"}, 400),
            ("godina van efemeride",   {"utc": "1500-01-01T00:00:00Z", "lat": 44, "lon": 20}, 400),
            ("neispravan datum",       {**ETALON, "local": "ovo nije datum"}, 400),
        ]:
            kod, telo_odg, _ = post("/v1/chart", telo)
            proveri(kod == kod_ocek and "error" in telo_odg, f"400 za: {opis}")

        kod, _, _ = post("/v1/chart", b"{ ovo nije json")
        proveri(kod == 400, "400 za neispravan JSON")

        kod, _, _ = get("/nepostojece")
        proveri(kod == 404, "404 za nepoznatu adresu")

        # --- istovremeni zahtevi: thread-local putanja mora vaziti u SVAKOJ niti
        rezultati: list[bool] = []
        def radnik():
            _, dd, _ = post("/v1/chart", ETALON)
            rezultati.append("chiron" in dd.get("positions", {}))
        niti = [threading.Thread(target=radnik) for _ in range(8)]
        for t in niti: t.start()
        for t in niti: t.join()
        proveri(len(rezultati) == 8 and all(rezultati),
                "8 istovremenih zahteva, svaki sa Hironom")
    finally:
        srv.shutdown()

    print()
    if _pali:
        print(f"NEUSPEH: {_pali} provera palo")
        return 1
    print("PROLAZ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
