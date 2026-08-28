# lunasomnia-ephemeris

Swiss Ephemeris iza malog JSON API-ja. Racuna natalne karte: pozicije, kuce, uglove,
lotove i sektu, ukljucujuci **Hirona, Lilit i prave cvorove** i osam sistema kuca.

**Licenca: AGPL-3.0.** Ovo je namerno zaseban projekat. Objasnjenje je nize.

## Zasto je ovo odvojeno

Swiss Ephemeris se dobija pod **AGPL-3.0 ili uz placenu licencu** (CHF 750 jednokratno).
AGPL trazi da ceo program koji ga koristi bude otvorenog koda.

Sajt koji ovo zove je zatvoren. Zato:

- **ovaj servis** je zaseban program, javan i pod AGPL-3.0;
- **sajt** je zaseban program i sa servisom razgovara obicnim JSON-om preko HTTP-a,
  dakle na odstojanju i bez deljenja procesa;
- **Swiss Ephemeris se ne menja** - koristi se kakav jeste, kroz `pyswisseph`.

Svaki odgovor nosi vezu ka izvornom kodu, u polju `engine.source` i u `Link` zaglavlju,
kako AGPL clan 13 trazi.

> Ovo je uobicajen i branjiv nacin razdvajanja, ali nije pravni savet. Ko zeli da pitanje
> skine sa dnevnog reda zauvek, kupuje profesionalnu licencu od Astrodienst-a; tada ni
> ovo razdvajanje nije potrebno.

## Pokretanje

    pip install -r requirements.txt
    python -m app.server            # slusa na 8080

    docker build -t lunasomnia-ephemeris .
    docker run -p 8080:8080 lunasomnia-ephemeris

Podesavanja preko okruzenja:

| promenljiva      | podrazumevano                        | znacenje |
|------------------|--------------------------------------|----------|
| `PORT`           | `8080`                               | port |
| `HOST`           | `0.0.0.0`                            | adresa |
| `SOURCE_URL`     | adresa ovog repozitorijuma           | ide u svaki odgovor (AGPL) |
| `ALLOWED_ORIGIN` | prazno                               | dozvoljen izvor za CORS |
| `SE_EPHE_PATH`   | `./ephe`                             | efemeridni fajlovi |

`ALLOWED_ORIGIN` je namerno prazan. Dok je prazan, pregledac ne moze direktno da zove
servis, pa podaci o rodjenju idu samo server-serveru i ne prolaze kroz tudji pregledac.

## API

`POST /v1/chart`

```json
{ "local": "2002-08-14T14:50", "tz": "Europe/Belgrade",
  "lat": 44.8667, "lon": 20.65, "house_system": "placidus" }
```

Trenutak se zadaje ili kao `utc` (ISO 8601), ili kao `local` + `tz` (IANA ime zone;
skracenice tipa "CET" su viseznacne i ne primaju se). Sistemi kuca: `placidus`,
`whole_sign`, `koch`, `regiomontanus`, `campanus`, `equal`, `porphyry`, `alcabitius`.

Odgovor nosi `positions`, `angles`, `cusps`, `lots`, `sect` i `engine`. Ako neko telo
nije moglo da se izracuna, pojavice se u `unavailable` - **nikad se ne izostavlja tiho**.

`GET /health` - provera zivota. `GET /source` - opis i ponuda izvornog koda.

## Testovi

    python -m tests.test_service

Testovi idu **preko HTTP-a**, ne pozivaju funkcije direktno. Prva ozbiljna greska ovde
bila je upravo takva: `pyswisseph` cuva putanju do efemerida **po niti**, pa je Hiron
radio u direktnom pozivu a tiho izostajao iz karte koju vrati visenitni server. Karta je
izgledala savrseno ispravno, samo bez jednog tela. Direktan test to ne bi nikada uhvatio.

## Tacnost

Etalon je natalna karta potvrdjena naspram Astrodienst-a do 0,5 lucne sekunde. Testovi
traze poklapanje do 1 lucne sekunde za Ascendent, Medium Coeli, Sunce, Mesec i Hirona.

## Efemeridni fajlovi

`ephe/` sadrzi `sepl_18.se1` (planete), `semo_18.se1` (Mesec) i `seas_18.se1` (asteroidi,
ukljucujuci Hirona). Pokrivaju **1800-2399**; datumi van tog opsega se odbijaju sa 400.
