# -*- coding: utf-8 -*-
"""
HTTP sloj.

Namerno na standardnoj biblioteci: servis ima tri adrese i racunanje mu je jedini
posao, pa svaki dodatni okvir donosi vise nacina da pukne nego koristi. Radi bilo gde
gde ima Python-a - kontejner, VPS, Fly, Railway.

AGPL: ovaj servis je namenski ODVOJEN od sajta koji ga zove. Sajt i servis se
sporazumevaju obicnim JSON-om preko HTTP-a, dakle na odstojanju, i ne dele proces.
Izvorni kod servisa je javan i svaki odgovor nosi vezu ka njemu, kako clan 13 trazi.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .api import BadRequest, chart_json, parse_request

SOURCE_URL = os.environ.get(
    "SOURCE_URL", "https://github.com/ArcadeCloud/lunasomnia-ephemeris")

# Prazno znaci: nijedan pregledac ne sme direktno da zove servis. To je namerno
# podrazumevano - kad sajt zove sa svog servera, podaci o rodjenju nikad ne prolaze
# kroz tudji pregledac. Postavlja se samo ako se svesno zeli poziv iz pregledaca.
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "")

MAX_BODY = 16 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "lunasomnia-ephemeris"
    protocol_version = "HTTP/1.1"

    # --- pomocne
    def _send(self, code: int, payload: dict, extra: dict | None = None) -> None:
        telo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(telo)))
        # AGPL clan 13 tarzi da ponuda izvornog koda bude vidljiva korisniku servisa.
        self.send_header("Link", f'<{SOURCE_URL}>; rel="source"')
        if ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Vary", "Origin")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(telo)

    def log_message(self, fmt, *args):
        # Podaci o rodjenju ne smeju u dnevnik. Zato se belezi samo metod i putanja,
        # nikad telo zahteva ni upitni deo adrese.
        sys.stderr.write("%s %s %s\n" % (self.command, self.path.split("?")[0], args[1]))

    # --- adrese
    def do_GET(self):
        put = self.path.split("?")[0].rstrip("/") or "/"
        if put == "/health":
            return self._send(200, {"ok": True})
        if put in ("/", "/source"):
            return self._send(200, {
                "service": "lunasomnia-ephemeris",
                "description": "Swiss Ephemeris behind a small JSON API.",
                "license": "AGPL-3.0",
                "source": SOURCE_URL,
                "endpoints": {"POST /v1/chart": "natal chart", "GET /health": "liveness"},
            })
        return self._send(404, {"error": "not found"})

    def do_HEAD(self):
        self.do_GET()

    def do_OPTIONS(self):
        if not ALLOWED_ORIGIN:
            return self._send(405, {"error": "cross-origin requests are not enabled"})
        self._send(204, {}, {"Access-Control-Allow-Methods": "POST, OPTIONS",
                             "Access-Control-Allow-Headers": "Content-Type",
                             "Access-Control-Max-Age": "86400"})

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/v1/chart":
            return self._send(404, {"error": "not found"})

        try:
            duzina = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._send(400, {"error": "bad Content-Length"})
        if duzina <= 0:
            return self._send(400, {"error": "empty body"})
        if duzina > MAX_BODY:
            return self._send(413, {"error": "body too large"})

        try:
            telo = json.loads(self.rfile.read(duzina).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            return self._send(400, {"error": f"invalid JSON: {e}"})

        try:
            zahtev = parse_request(telo)
            return self._send(200, chart_json(zahtev, SOURCE_URL))
        except BadRequest as e:
            return self._send(400, {"error": str(e)})
        except Exception as e:                      # noqa: BLE001
            # Poruka izuzetka moze da sadrzi ulaz, a ulaz su podaci o rodjenju, pa
            # klijent dobija samo vrstu greske. Ceo trag ide u dnevnik servera.
            sys.stderr.write("NEOCEKIVANA GRESKA: %r\n" % (e,))
            return self._send(500, {"error": "internal error"})


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    srv = ThreadingHTTPServer((host, port), Handler)
    sys.stderr.write(f"lunasomnia-ephemeris na {host}:{port}  izvor: {SOURCE_URL}\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
