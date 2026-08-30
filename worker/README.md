# Worker

Swiss Ephemeris kao Cloudflare Worker. Isti API kao Python servis u korenu; Python
ostaje referentna izvedba i merilo tacnosti, ovo je ono sto se isporucuje.

    npm install
    npm test          # racunanje + vreme, bez workerd-a
    npx wrangler deploy

## Sta je u paketu i zasto

| fajl                    | velicina | zasto |
|-------------------------|----------|-------|
| `libswephe.wasm`        | 1,22 MB  | sam Swiss Ephemeris |
| `seas_18.se1`           | 0,21 MB  | **Hiron**; bez njega ga nema uopste |
| `sepl_18.se1`           | 0,46 MB  | planete tacno umesto 0,42" |

`semo_18.se1` (Mesec, 1,24 MB) je **namerno izostavljen**. Bez njega Mesec ide na
Moshier i promasi 0,14 lucne sekunde, sto je 0,001 sekunda vremena rodjenja - daleko
ispod nesigurnosti o tome kad je neko uopste rodjen. Ustedjenih 1,24 MB je trecina
dozvoljene velicine Worker-a.

## Dve prepreke Workers-a

Workers ne dozvoljava prevodjenje WASM-a u toku rada i nema fajl sistem. Zato se WASM
**uvozi kao modul** (Cloudflare ga prevede pri isporuci) i predaje direktno konstruktoru
`SwissEph`, a efemeridni fajlovi se ubacuju u memoriju kroz `mount()`.

## Razvoj na Termux-u

`workerd` nema Android verziju, pa `wrangler dev` lokalno ne radi. Testovi rade, jer je
posle prenosenja koda sve cist JavaScript: `npm install --ignore-scripts && npm test`.
