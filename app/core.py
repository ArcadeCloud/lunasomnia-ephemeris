# -*- coding: utf-8 -*-
"""
core.py - Astroloski motor nad Swiss Ephemeris.
Helenisticka + tradicionalna osnova (sekta, dostojanstva, lotovi) + moderni dodaci.
"""
import math, json, os, datetime as dt
from zoneinfo import ZoneInfo
import swisseph as swe

# Efemeridni fajlovi stoje u korenu projekta, ne pored ovog modula.
EPHE = os.environ.get('SE_EPHE_PATH') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ephe')
swe.set_ephe_path(EPHE)


def ensure_ephe_path():
    """
    Ponovo postavlja putanju do efemerida za TEKUCU nit.

    pyswisseph cuva tu putanju po niti (thread-local). Postavljanje pri uvozu modula
    vazi samo za nit koja je uvezla modul, pa u visenitnom serveru radna nit krece od
    podrazumevanog '.:/users/ephe2/:/users/ephe/' i ne nalazi fajlove.

    Posledica je podmukla: Sunce, Mesec i planete se i dalje racunaju jer im fajl ne
    treba, a Hiron tiho izostane iz karte. Zato se poziva pre svakog racunanja - poziv
    je jeftin i idempotentan.
    """
    swe.set_ephe_path(EPHE)

FLG = swe.FLG_SWIEPH | swe.FLG_SPEED

SIGNS = ['Ovan','Bik','Blizanci','Rak','Lav','Devica','Vaga','Skorpija','Strelac','Jarac','Vodolija','Ribe']
SIGNS_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']
GLYPH = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓']
ELEMENT = ['Vatra','Zemlja','Vazduh','Voda']*3
MODE    = ['Kardinalni','Fiksni','Promenljivi']*4

PLANETS = [
    ('Sunce',   swe.SUN),     ('Mesec',   swe.MOON),   ('Merkur', swe.MERCURY),
    ('Venera',  swe.VENUS),   ('Mars',    swe.MARS),   ('Jupiter',swe.JUPITER),
    ('Saturn',  swe.SATURN),  ('Uran',    swe.URANUS), ('Neptun', swe.NEPTUNE),
    ('Pluton',  swe.PLUTO),
]
EXTRA = [('Cvor', swe.TRUE_NODE), ('Lilit', swe.MEAN_APOG), ('Hiron', swe.CHIRON)]
TRAD = ['Sunce','Mesec','Merkur','Venera','Mars','Jupiter','Saturn']
BENEFIC = ['Jupiter','Venera']; MALEFIC = ['Mars','Saturn']

# ---------------------------------------------------------------- dostojanstva
DOMICILE = {'Ovan':'Mars','Bik':'Venera','Blizanci':'Merkur','Rak':'Mesec','Lav':'Sunce',
            'Devica':'Merkur','Vaga':'Venera','Skorpija':'Mars','Strelac':'Jupiter',
            'Jarac':'Saturn','Vodolija':'Saturn','Ribe':'Jupiter'}
MODERN_RULER = {'Skorpija':'Pluton','Vodolija':'Uran','Ribe':'Neptun'}
EXALT = {'Sunce':('Ovan',19),'Mesec':('Bik',3),'Merkur':('Devica',15),'Venera':('Ribe',27),
         'Mars':('Jarac',28),'Jupiter':('Rak',15),'Saturn':('Vaga',21)}
def _opp(sign): return SIGNS[(SIGNS.index(sign)+6)%12]
DETRIMENT = {p:[_opp(s) for s,r in DOMICILE.items() if r==p] for p in TRAD}
FALL = {p:_opp(s) for p,(s,d) in EXALT.items()}

# Dorotejeve triplicitetne vladavine: (dnevni, nocni, participirajuci)
TRIPLICITY = {'Vatra':('Sunce','Jupiter','Saturn'), 'Zemlja':('Venera','Mesec','Mars'),
              'Vazduh':('Saturn','Merkur','Jupiter'), 'Voda':('Venera','Mars','Mesec')}

# Egipatski termini: (granica_do, vladar)
TERMS = {
 'Ovan':[(6,'Jupiter'),(12,'Venera'),(20,'Merkur'),(25,'Mars'),(30,'Saturn')],
 'Bik':[(8,'Venera'),(14,'Merkur'),(22,'Jupiter'),(27,'Saturn'),(30,'Mars')],
 'Blizanci':[(6,'Merkur'),(12,'Jupiter'),(17,'Venera'),(24,'Mars'),(30,'Saturn')],
 'Rak':[(7,'Mars'),(13,'Venera'),(19,'Merkur'),(26,'Jupiter'),(30,'Saturn')],
 'Lav':[(6,'Jupiter'),(11,'Venera'),(18,'Saturn'),(24,'Merkur'),(30,'Mars')],
 'Devica':[(7,'Merkur'),(17,'Venera'),(21,'Jupiter'),(28,'Mars'),(30,'Saturn')],
 'Vaga':[(6,'Saturn'),(14,'Merkur'),(21,'Jupiter'),(28,'Venera'),(30,'Mars')],
 'Skorpija':[(7,'Mars'),(11,'Venera'),(19,'Merkur'),(24,'Jupiter'),(30,'Saturn')],
 'Strelac':[(12,'Jupiter'),(17,'Venera'),(21,'Merkur'),(26,'Saturn'),(30,'Mars')],
 'Jarac':[(7,'Merkur'),(14,'Jupiter'),(22,'Venera'),(26,'Saturn'),(30,'Mars')],
 'Vodolija':[(7,'Merkur'),(13,'Venera'),(20,'Jupiter'),(25,'Mars'),(30,'Saturn')],
 'Ribe':[(12,'Venera'),(16,'Jupiter'),(19,'Merkur'),(28,'Mars'),(30,'Saturn')]}

_CHALD = ['Mars','Sunce','Venera','Merkur','Mesec','Saturn','Jupiter']
FACES = {}
for _i, _s in enumerate(SIGNS):
    FACES[_s] = [_CHALD[(_i*3+k) % 7] for k in range(3)]

JOY = {'Merkur':1,'Mesec':3,'Venera':5,'Mars':6,'Sunce':9,'Jupiter':11,'Saturn':12}
ZR_YEARS = {'Ovan':15,'Bik':8,'Blizanci':20,'Rak':25,'Lav':19,'Devica':20,'Vaga':8,
            'Skorpija':15,'Strelac':12,'Jarac':27,'Vodolija':30,'Ribe':12}

# ---------------------------------------------------------------- pomocne
def norm(x): return x % 360.0
def sign_of(lon): return SIGNS[int(norm(lon)//30)]
def sign_idx(lon): return int(norm(lon)//30)
def deg_in_sign(lon): return norm(lon) % 30.0

def dms(lon):
    d = deg_in_sign(lon); dd = int(d); mm = int((d-dd)*60); ss = int(round((((d-dd)*60)-mm)*60))
    if ss == 60: ss = 0; mm += 1
    if mm == 60: mm = 0; dd += 1
    return f"{dd:2d}°{mm:02d}'{ss:02d}\""

def fmt(lon):
    i = sign_idx(lon)
    return f"{dms(lon)} {GLYPH[i]} {SIGNS[i]}"

def arc(a, b):
    """Najkraci ugao izmedju dve tacke (0..180)."""
    d = abs(norm(a) - norm(b)) % 360.0
    return 360.0 - d if d > 180 else d

# ---------------------------------------------------------------- vreme
def to_jd(y, mo, d, h, mi, tz='Europe/Belgrade', utc_offset=None):
    """Lokalno vreme -> Julijanski dan (UT). tz se resava automatski (letnje/zimsko)."""
    if utc_offset is not None:
        ut = dt.datetime(y, mo, d, h, mi) - dt.timedelta(hours=utc_offset)
    else:
        loc = dt.datetime(y, mo, d, h, mi, tzinfo=ZoneInfo(tz))
        ut = loc.astimezone(dt.timezone.utc).replace(tzinfo=None)
    jd = swe.julday(ut.year, ut.month, ut.day, ut.hour + ut.minute/60 + ut.second/3600)
    return jd, ut

def jd_to_dt(jd):
    y, m, d, h = swe.revjul(jd)
    hh = int(h); mi = int(round((h-hh)*60))
    if mi == 60: mi = 0; hh += 1
    if hh == 24: hh = 23; mi = 59
    return dt.datetime(y, m, d, hh, mi)

# ---------------------------------------------------------------- karta
class Chart:
    def __init__(self, jd, lat, lon, hsys='P', name='', local=None, tzname='', place=''):
        ensure_ephe_path()
        self.jd, self.lat, self.lon, self.hsys = jd, lat, lon, hsys
        self.name, self.local, self.tzname, self.place = name, local, tzname, place
        self.pos, self.speed, self.lat_ecl = {}, {}, {}
        # Tela koja se ne mogu izracunati beleze se u self.failed umesto da tiho
        # nestanu. Hiron trazi efemeridni fajl seas_18.se1 i jedini je koji stvarno
        # moze da otkaze; kad otkaze, moramo znati ZASTO, a ne otkriti mu odsustvo
        # tek kad se neko zali da mu karta nema Hirona.
        self.failed = {}
        for nm, pid in PLANETS + EXTRA:
            try:
                x, _ = swe.calc_ut(jd, pid, FLG)
                self.pos[nm], self.lat_ecl[nm], self.speed[nm] = norm(x[0]), x[1], x[3]
            except Exception as e:
                self.failed[nm] = repr(e)
        self.pos['J.Cvor'] = norm(self.pos['Cvor'] + 180)
        self.speed['J.Cvor'] = self.speed['Cvor']

        cusps, ascmc = swe.houses(jd, lat, lon, hsys.encode())
        self.cusps = list(cusps)                       # 1..12
        self.asc, self.mc = ascmc[0], ascmc[1]
        self.pos['ASC'], self.pos['MC'] = self.asc, self.mc
        self.pos['DSC'], self.pos['IC'] = norm(self.asc+180), norm(self.mc+180)
        self.vertex = ascmc[3]

        # sekta: dan ako je Sunce iznad horizonta (kuce 7-12)
        self.day = self._above_horizon(self.pos['Sunce'])
        self.sect_light  = 'Sunce' if self.day else 'Mesec'
        self.sect_benefic = 'Jupiter' if self.day else 'Venera'
        self.sect_malefic = 'Saturn'  if self.day else 'Mars'
        self.out_benefic  = 'Venera'  if self.day else 'Jupiter'
        self.out_malefic  = 'Mars'    if self.day else 'Saturn'
        self.lots = self._lots()
        self.pos.update(self.lots)

    def _above_horizon(self, lon):
        d = norm(lon - self.asc)
        return 180.0 <= d < 360.0    # iznad horizonta = od DSC do ASC

    # --- kuce
    def whole(self, lon):
        """Whole-sign kuca (helenisticki standard)."""
        return (sign_idx(lon) - sign_idx(self.asc)) % 12 + 1

    def quad(self, lon):
        """Kvadrantna kuca (Placidus i sl.)."""
        L = norm(lon)
        for i in range(12):
            a, b = self.cusps[i], self.cusps[(i+1) % 12]
            span = norm(b - a) or 360.0
            if norm(L - a) < span:
                return i + 1
        return 12

    def house(self, lon, system='whole'):
        return self.whole(lon) if system == 'whole' else self.quad(lon)

    def ruler(self, sign, modern=False):
        return MODERN_RULER.get(sign, DOMICILE[sign]) if modern else DOMICILE[sign]

    def house_sign(self, n):
        """Znak n-te whole-sign kuce."""
        return SIGNS[(sign_idx(self.asc) + n - 1) % 12]

    def house_ruler(self, n, modern=False):
        return self.ruler(self.house_sign(n), modern)

    def in_house(self, n, system='whole'):
        return [p for p in TRAD + ['Uran','Neptun','Pluton'] if self.house(self.pos[p], system) == n]

    # --- lotovi
    def _lots(self):
        A, S, M = self.asc, self.pos['Sunce'], self.pos['Mesec']
        V, Ma, J, Sa, Me = (self.pos[k] for k in ('Venera','Mars','Jupiter','Saturn','Merkur'))
        d = self.day
        F = norm(A + (M - S)) if d else norm(A + (S - M))          # Fortuna - telo, materija
        SP= norm(A + (S - M)) if d else norm(A + (M - S))          # Duh - karijera, delanje
        L = {'Fortuna': F, 'Duh': SP}
        L['Eros']     = norm(A + (V - SP)) if d else norm(A + (SP - V))
        L['Nuznost']  = norm(A + (F - Me)) if d else norm(A + (Me - F))
        L['Hrabrost'] = norm(A + (F - Ma)) if d else norm(A + (Ma - F))
        L['Pobeda']   = norm(A + (J - SP)) if d else norm(A + (SP - J))
        L['Nemeza']   = norm(A + (F - Sa)) if d else norm(A + (Sa - F))
        b = norm(SP - F)
        L['Baza'] = norm(A + b) if b <= 180 else norm(A + (F - SP))
        # egzaltacija (cast, ugled)
        L['Egzaltacija'] = norm(A + (0 + 19) - S) if d else norm(A + (30 + 3) - M)
        # novac / posao (srednjovekovni)
        r2 = self.house_ruler(2)
        L['Imovina']    = norm(A + self.pos[r2] - self.cusps[1])   # Bonati: ASC + vladar 2. - kuspid 2.
        L['Trgovina']   = norm(A + SP - F)
        L['Profesija']  = norm(self.mc + M - S)
        return L

    # --- stanje planete
    def dignity(self, p):
        if p not in TRAD: return {}
        lonp = self.pos[p]; sg = sign_of(lonp); dg = deg_in_sign(lonp)
        out = {'sign': sg, 'deg': dg, 'scores': [], 'total': 0}
        def add(k, v, why): out['scores'].append((k, v, why)); out['total'] += v
        if DOMICILE[sg] == p: add('domicil', 5, f'{p} vlada znakom {sg}')
        if p in EXALT and EXALT[p][0] == sg: add('egzaltacija', 4, f'egzaltiran u {sg}')
        trip = TRIPLICITY[ELEMENT[SIGNS.index(sg)]]
        tr = trip[0] if self.day else trip[1]
        if tr == p: add('triplicitet', 3, f'{"dnevni" if self.day else "nocni"} vladar {ELEMENT[SIGNS.index(sg)]}')
        elif trip[2] == p: add('triplicitet(uc.)', 1, 'participirajuci vladar')
        prev = 0
        for lim, rl in TERMS[sg]:
            if dg < lim:
                if rl == p: add('termin', 2, f'egipatski termin {prev}-{lim}°')
                break
            prev = lim
        if FACES[sg][int(dg // 10)] == p: add('lice', 1, f'{int(dg//10)+1}. dekan')
        if sg in DETRIMENT.get(p, []): add('progonstvo', -5, f'{sg} je suprotan domicilu')
        if FALL.get(p) == sg: add('pad', -4, f'pad u {sg}')
        out['peregrin'] = out['total'] == 0
        return out

    def accidental(self, p):
        """Akcidentalno stanje: uglovi, brzina, retro, sagorevanje, radost, sekta."""
        f = []
        h = self.whole(self.pos[p]); hq = self.quad(self.pos[p])
        if h in (1,4,7,10): f.append(('ugaona kuca', +3, f'{h}. kuca (whole)'))
        elif h in (2,5,8,11): f.append(('naslednja', +1, f'{h}. kuca'))
        else: f.append(('padajuca', -2, f'{h}. kuca'))
        if hq in (1,4,7,10) and hq != h: f.append(('ugaona (kvadr.)', +2, f'{hq}. Placidus'))
        if JOY.get(p) == h: f.append(('radost', +2, f'planetarna radost u {h}. kuci'))
        if p in TRAD and p not in ('Sunce','Mesec'):
            sp = self.speed[p]
            if sp < 0: f.append(('retrogradan', -3, 'kretanje unazad'))
            sep = arc(self.pos[p], self.pos['Sunce'])
            if sep <= 0.28: f.append(('kazimi', +5, f'srce Sunca ({sep*60:.0f}′)'))
            elif sep < 8.5: f.append(('sagoreo', -4, f'{sep:.1f}° od Sunca'))
            elif sep < 15: f.append(('pod zracima', -2, f'{sep:.1f}° od Sunca'))
            orient = norm(self.pos[p] - self.pos['Sunce']) > 180
            f.append(('istocna' if orient else 'zapadna', 0, 'izlazi pre Sunca' if orient else 'zalazi posle Sunca'))
        if p == self.sect_benefic: f.append(('benefik sekte', +3, 'najkorisnija planeta u karti'))
        if p == self.out_malefic:  f.append(('malefik van sekte', -3, 'najproblematicnija planeta'))
        if p == self.sect_malefic: f.append(('malefik sekte', +1, 'ublazen, radi za tebe'))
        return f

    def cond(self, p):
        d = self.dignity(p)
        return {'planeta': p, 'lon': self.pos[p], 'znak': sign_of(self.pos[p]),
                'kuca': self.whole(self.pos[p]), 'kuca_q': self.quad(self.pos[p]),
                'retro': self.speed.get(p,0) < 0, 'brzina': self.speed.get(p,0),
                'esencijalno': d, 'akcidentalno': self.accidental(p),
                'ukupno': d.get('total',0) + sum(x[1] for x in self.accidental(p))}

    # --- aspekti
    ASPECTS = [(0,'konjunkcija','☌'),(60,'sekstil','⚹'),(90,'kvadrat','□'),
               (120,'trigon','△'),(180,'opozicija','☍')]
    MINOR = [(30,'polusekstil'),(45,'poluvadrat'),(135,'seskvikvadrat'),(150,'kvinkunks'),(72,'kvintil')]

    def aspects(self, orb_lum=8.0, orb=6.0, minor=False, pts=None):
        pts = pts or TRAD + ['Uran','Neptun','Pluton','ASC','MC']
        res = []
        for i in range(len(pts)):
            for j in range(i+1, len(pts)):
                a, b = pts[i], pts[j]
                if a not in self.pos or b not in self.pos: continue
                sep = arc(self.pos[a], self.pos[b])
                lim = orb_lum if ('Sunce' in (a,b) or 'Mesec' in (a,b)) else orb
                if 'ASC' in (a,b) or 'MC' in (a,b): lim = max(lim, 7.0)
                lst = self.ASPECTS + ([(d,n,'') for d,n in self.MINOR] if minor else [])
                for ang, nm, gl in lst:
                    ol = lim if ang in (0,60,90,120,180) else 2.5
                    if abs(sep - ang) <= ol:
                        exact = abs(sep - ang)
                        sa, sb = self.speed.get(a,0), self.speed.get(b,0)
                        applying = None
                        if a in self.speed and b in self.speed:
                            rel = norm(self.pos[b]-self.pos[a])
                            applying = ((sb - sa) * (1 if rel < 180 else -1)) < 0 if ang else (sb-sa)*(1 if rel<180 else -1) < 0
                        res.append({'a':a,'b':b,'ugao':ang,'ime':nm,'glif':gl,'orb':exact,
                                    'sep':sep,'primenjuje': applying,
                                    'znakovni': (sign_idx(self.pos[a])-sign_idx(self.pos[b]))%12 in
                                                {0:[0],60:[2,10],90:[3,9],120:[4,8],180:[6]}.get(ang,[])})
                        break
        return sorted(res, key=lambda r: r['orb'])

    def aspects_to(self, p, **kw):
        return [a for a in self.aspects(**kw) if p in (a['a'], a['b'])]

def build(y, mo, d, h, mi, lat, lon, tz='Europe/Belgrade', utc_offset=None,
          hsys='P', name='', place=''):
    jd, ut = to_jd(y, mo, d, h, mi, tz, utc_offset)
    c = Chart(jd, lat, lon, hsys, name, local=dt.datetime(y,mo,d,h,mi), tzname=tz, place=place)
    c.ut = ut
    return c

def load(path):
    if not os.path.isabs(path) and not os.path.exists(path):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'charts', path)
    if not path.endswith('.json'): path += '.json'
    with open(path) as f: j = json.load(f)
    return build(j['year'], j['month'], j['day'], j['hour'], j['minute'],
                 j['lat'], j['lon'], j.get('tz','Europe/Belgrade'),
                 j.get('utc_offset'), j.get('hsys','P'), j.get('name',''), j.get('place',''))

# ---------------------------------------------------------------- rucni unos (sa slike)
def parse_pos(s):
    """Citanje pozicije u bilo kom uobicajenom formatu:
    '21LE33' · '21 Lav 33' · "21°33' Leo" · '21Le33\'45"' · 'Lav 21.55' · '141.566'"""
    import re
    if isinstance(s, (int, float)): return norm(float(s))
    t = s.strip()
    if re.fullmatch(r'[-+]?\d+(\.\d+)?', t): return norm(float(t))
    low = t.lower()
    CODES = ['ari','tau','gem','can','cnc','leo','vir','lib','sco','sag','cap','aqu','psc','pis']
    CIDX  = [0,1,2,3,3,4,5,6,7,8,9,10,11,11]
    SHORT = ['ar','ta','ge','cn','ca','le','vi','li','sc','sg','cp','aq','pi']
    SIDX  = [0,1,2,3,3,4,5,6,7,8,9,10,11]
    si, span = None, None
    for lst in (SIGNS, SIGNS_EN):                      # puna imena (srpski, engleski)
        for i, full in enumerate(lst):
            j = low.find(full.lower())
            if j >= 0: si, span = i, (j, j+len(full)); break
        if si is not None: break
    if si is None:                                     # troslovne oznake
        for k, cd in enumerate(CODES):
            j = low.find(cd)
            if j >= 0: si, span = CIDX[k], (j, j+3); break
    if si is None:                                     # dvoslovne oznake
        for k, cd in enumerate(SHORT):          # format DDxxMM: '21LE33'
            j = re.search(r'(?<=\d)' + cd + r'(?=\d)', low) or re.search(r'\b' + cd + r'\b', low)
            if j: si, span = SIDX[k], j.span(); break
    if si is None: raise ValueError(f'ne prepoznajem znak u {s!r}')
    rest = t[:span[0]] + ' ' + t[span[1]:]
    nums = re.findall(r'\d+(?:\.\d+)?', rest)
    if not nums: raise ValueError(f'nema stepena u {s!r}')
    d = float(nums[0]); mi = float(nums[1]) if len(nums) > 1 else 0.0
    sec = float(nums[2]) if len(nums) > 2 else 0.0
    if d != int(d): mi, sec = 0.0, 0.0                 # '21.55' = decimalni stepen
    return norm(si*30 + d + mi/60 + sec/3600)

def from_positions(pos, asc=None, mc=None, cusps=None, day=None, retro=(),
                   name='', place='', birth=None, lat=51.4779, lon=0.0, tz='Europe/London'):
    """Karta iz procitanih pozicija (npr. sa slike), bez efemeride.
    pos: {'Sunce':'21LE33', ...}; asc/mc isto. birth: (y,m,d,h,mi) ako je poznato -> omogucava tajming."""
    c = object.__new__(Chart)
    c.name, c.place, c.hsys, c.lat, c.lon, c.tzname = name, place, 'P', lat, lon, tz
    c.pos = {k: (v if isinstance(v, (int, float)) else parse_pos(v)) for k, v in pos.items()}
    c.speed = {k: (-1.0 if k in retro else 1.0) for k in c.pos}
    c.lat_ecl = {k: 0.0 for k in c.pos}
    c.asc = parse_pos(asc) if isinstance(asc, str) else (asc if asc is not None else c.pos.get('ASC'))
    c.mc  = parse_pos(mc)  if isinstance(mc, str)  else (mc  if mc  is not None else c.pos.get('MC'))
    if c.mc is None: c.mc = norm(c.asc - 90)
    c.pos['ASC'], c.pos['MC'] = c.asc, c.mc
    c.pos['DSC'], c.pos['IC'] = norm(c.asc+180), norm(c.mc+180)
    if 'Cvor' in c.pos and 'J.Cvor' not in c.pos:
        c.pos['J.Cvor'] = norm(c.pos['Cvor']+180); c.speed['J.Cvor'] = -1.0
    if cusps:
        c.cusps = [parse_pos(x) if isinstance(x, str) else x for x in cusps]
    else:                                    # bez kuspida -> whole sign
        b = sign_idx(c.asc)*30
        c.cusps = [norm(b + 30*i) for i in range(12)]
    c.vertex = None
    c.day = day if day is not None else c._above_horizon(c.pos['Sunce'])
    c.sect_light   = 'Sunce' if c.day else 'Mesec'
    c.sect_benefic = 'Jupiter' if c.day else 'Venera'
    c.sect_malefic = 'Saturn'  if c.day else 'Mars'
    c.out_benefic  = 'Venera'  if c.day else 'Jupiter'
    c.out_malefic  = 'Mars'    if c.day else 'Saturn'
    if birth:
        c.jd, c.ut = to_jd(*birth, tz=tz)
        c.local = dt.datetime(*birth)
    else:
        c.jd, c.local = None, None
    c.lots = c._lots(); c.pos.update(c.lots)
    return c
