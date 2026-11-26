"""Uma configuração para cada arma: Titanfall 2, Doom clássico (GZDoom) e CoD Black Ops II.

Os três têm um mod nosso que conversa com o app (mods/): o próprio jogo informa a arma na
mão, cada disparo, o pente, o dano e a vida. Cada jogo tem aqui uma tabela com as armas dele
(o nome interno que o mod informa), o tipo e o "jeito" de cada uma:
  rpm       tiros por minuto (aproximado, quando o jogo não informa)
  peso      0..1, gatilho mais duro
  recuo     0..1, tranco no disparo
  energia   arma de energia/plasma: estalo leve, vibração fina
  rajada    tiros por rajada
  ferrolho  ferrolho/alavanca: ponto de disparo fundo
  carga     arma que carrega antes de atirar: o R2 fica mais duro conforme você aperta
  giro      cano que gira antes de atirar: resistência crescendo
  auto      força automática (True) ou semiautomática (False)


As configurações vão para o banco de armas (armas.json) assim que o jogo é aberto; o que
você ajustar na aba Armas fica salvo e não é mais sobrescrito.
"""
import re

GERADOR = 2


def A(apelidos, nome, tipo, **tr):
    return (tuple(apelidos.split()), nome, tipo, tr)


# ----------------------------------------------------------------------------
# Titanfall 2 — nomes internos (mp_weapon_*, mp_titanweapon_*)
# ----------------------------------------------------------------------------
TITANFALL2 = [
    A("rspn101 r201", "R-201", "fuzil", rpm=810, peso=.35, recuo=.35),
    A("rspn101og r101", "R-101", "fuzil", rpm=810, peso=.35, recuo=.3),
    A("hemlok", "Hemlok BF-R", "fuzil", rpm=600, peso=.45, recuo=.5, rajada=3),
    A("g2 g2a5", "G2A5", "fuzil", rpm=450, peso=.55, recuo=.55, auto=False),
    A("vinson flatline", "V-47 Flatline", "fuzil", rpm=600, peso=.5, recuo=.55),
    A("car", "CAR", "smg", rpm=930, peso=.25, recuo=.3),
    A("alternatorsmg alternator", "Alternator", "smg", rpm=750, peso=.3, recuo=.4),
    A("r97", "R-97", "smg", rpm=1080, peso=.2, recuo=.25),
    A("hemloksmg volt", "Volt", "smg", rpm=720, peso=.25, recuo=.2, energia=True),
    A("lmg spitfire", "Spitfire", "metralhadora", rpm=540, peso=.7, recuo=.55),
    A("lstar", "L-STAR", "metralhadora", rpm=600, peso=.6, recuo=.3, energia=True),
    A("esaw devotion", "X-55 Devotion", "metralhadora", rpm=900, peso=.65, recuo=.5, giro=True),
    A("sniper kraber", "Kraber-AP Sniper", "sniper", rpm=45, peso=.95, recuo=1.0, ferrolho=True),
    A("doubletake", "D-2 Double Take", "sniper", rpm=100, peso=.75, recuo=.75, rajada=3),
    A("dmr longbow", "Longbow-DMR", "sniper", rpm=170, peso=.7, recuo=.7),
    A("shotgun eva8", "EVA-8 Auto", "escopeta", rpm=200, peso=.6, recuo=.75, auto=True),
    A("mastiff", "Mastiff", "escopeta", rpm=80, peso=.8, recuo=.9),
    A("smr sidewinder", "Sidewinder SMR", "lancador", rpm=500, peso=.45, recuo=.4),
    A("epg", "EPG-1", "lancador", rpm=80, peso=.7, recuo=.7, energia=True),
    A("softball", "R-6P Softball", "lancador", rpm=140, peso=.65, recuo=.7),
    A("pulselmg coldwar", "Cold War", "lancador", rpm=90, peso=.7, recuo=.7),
    A("shotgunpistol mozambique", "Mozambique", "escopeta", rpm=210, peso=.55, recuo=.7),
    A("wingmann wingmanelite", "Wingman Elite", "revolver", rpm=220, peso=.65, recuo=.75),
    A("wingman", "B3 Wingman", "revolver", rpm=200, peso=.75, recuo=.9),
    A("autopistol re45", "RE-45 Auto", "pistola", rpm=840, peso=.25, recuo=.3, auto=True),
    A("semipistol p2016", "P2016", "pistola", rpm=400, peso=.35, recuo=.35),
    A("smartpistol", "Smart Pistol MK6", "pistola", rpm=400, peso=.3, recuo=.25),
    A("defender chargerifle", "Charge Rifle", "energia", rpm=50, peso=.6, recuo=.8, energia=True, carga=True),
    A("mgl", "MGL Mag Launcher", "lancador", rpm=150, peso=.6, recuo=.6),
    A("arclauncher thunderbolt", "LG-97 Thunderbolt", "lancador", rpm=50, peso=.75, recuo=.8, energia=True),
    A("rocketlauncher archer", "Archer", "lancador", rpm=30, peso=.85, recuo=.95),
    # Titãs
    A("particleaccelerator splitter", "Ion: Splitter Rifle", "energia", rpm=400, peso=.55, recuo=.45, energia=True, auto=True),
    A("meteor", "Scorch: T-203 Thermite Launcher", "lancador", rpm=90, peso=.85, recuo=.85),
    A("sniper2 titansniper railgun", "Northstar: Plasma Railgun", "energia", rpm=40, peso=.8, recuo=.95, energia=True, carga=True),
    A("leadwall", "Ronin: Leadwall", "escopeta", rpm=110, peso=.85, recuo=.95),
    A("sticky40mm 40mm", "Tone: 40mm Tracker Cannon", "lancador", rpm=200, peso=.75, recuo=.8),
    A("predatorcannon", "Legion: Predator Cannon", "metralhadora", rpm=1000, peso=.9, recuo=.75, giro=True),
    A("xo16shorty xo16vanguard xo16", "Monarch: XO-16", "metralhadora", rpm=550, peso=.75, recuo=.65),
    A("emptyhanded melee", "Melee", "corpo_a_corpo"),
]

# ----------------------------------------------------------------------------
# Doom clássico (GZDoom): nomes das classes; também vale para mods com nomes parecidos
# ----------------------------------------------------------------------------
DOOM_CLASSICO = [
    A("fist punho", "Fist", "corpo_a_corpo", rpm=150),
    A("chainsaw motosserra", "Chainsaw", "corpo_a_corpo", rpm=520, giro=True, auto=True),
    A("pistol", "Pistol", "pistola", rpm=150, peso=.35, recuo=.35, auto=True),
    A("shotgun", "Shotgun", "escopeta", rpm=57, peso=.65, recuo=.8),
    A("supershotgun ssg", "Super Shotgun", "escopeta", rpm=63, peso=.85, recuo=1.0),
    A("chaingun", "Chaingun", "metralhadora", rpm=525, peso=.55, recuo=.45),
    A("rocketlauncher", "Rocket Launcher", "lancador", rpm=105, peso=.8, recuo=.85, auto=True),
    A("plasmarifle plasmagun", "Plasma Rifle", "energia", rpm=700, peso=.35, recuo=.2, energia=True),
    A("bfg9000 bfg", "BFG 9000", "energia", rpm=35, peso=.9, recuo=1.0, energia=True, carga=True),
    A("unmaker laser", "Unmaker", "energia", rpm=420, peso=.5, recuo=.35, energia=True),
]

# ----------------------------------------------------------------------------
# CoD Black Ops II — nomes internos (sem _mp/_zm e anexos)
# ----------------------------------------------------------------------------
BO2 = [
    A("tar21", "MTAR", "fuzil", rpm=850, peso=.35, recuo=.35),
    A("type95", "Type 25", "fuzil", rpm=780, peso=.35, recuo=.35, rajada=3),
    A("sig556", "SWAT-556", "fuzil", rpm=800, peso=.35, recuo=.3, rajada=3),
    A("sa58 fnfal fal", "FAL OSW", "fuzil", rpm=600, peso=.6, recuo=.6, auto=False),
    A("hk416 m27", "M27", "fuzil", rpm=700, peso=.4, recuo=.4),
    A("scar", "SCAR-H", "fuzil", rpm=600, peso=.5, recuo=.5),
    A("saritch smr", "SMR", "fuzil", rpm=500, peso=.65, recuo=.7, auto=False),
    A("xm8 m8a1", "M8A1", "fuzil", rpm=750, peso=.4, recuo=.35, rajada=4),
    A("an94", "AN-94", "fuzil", rpm=600, peso=.45, recuo=.35),
    A("mp7", "MP7", "smg", rpm=900, peso=.25, recuo=.3),
    A("pdw57", "PDW-57", "smg", rpm=800, peso=.25, recuo=.25),
    A("vector", "Vector K10", "smg", rpm=1000, peso=.2, recuo=.25),
    A("insas msmc", "MSMC", "smg", rpm=800, peso=.3, recuo=.4),
    A("qcw05 chicom", "Chicom CQB", "smg", rpm=700, peso=.3, recuo=.3, rajada=3),
    A("evoskorpion skorpion", "Skorpion EVO", "smg", rpm=1100, peso=.2, recuo=.25),
    A("peacekeeper", "Peacekeeper", "smg", rpm=750, peso=.35, recuo=.35),
    A("mk48", "Mk 48", "metralhadora", rpm=750, peso=.75, recuo=.65),
    A("qbb95 qbblsw", "QBB LSW", "metralhadora", rpm=750, peso=.65, recuo=.55),
    A("lsat", "LSAT", "metralhadora", rpm=750, peso=.7, recuo=.55),
    A("hamr", "HAMR", "metralhadora", rpm=650, peso=.65, recuo=.55, giro=True),
    A("svu", "SVU-AS", "sniper", rpm=300, peso=.65, recuo=.6),
    A("dsr50", "DSR 50", "sniper", rpm=45, peso=.95, recuo=1.0, ferrolho=True),
    A("ballista", "Ballista", "sniper", rpm=60, peso=.85, recuo=.9, ferrolho=True),
    A("as50 xpr50", "XPR-50", "sniper", rpm=200, peso=.75, recuo=.8),
    A("barretm82 barrett", "Barrett .50cal", "sniper", rpm=150, peso=.85, recuo=.95),
    A("870mcs r870", "R870 MCS", "escopeta", rpm=70, peso=.75, recuo=.9),
    A("saiga12 s12", "S12", "escopeta", rpm=300, peso=.6, recuo=.75, auto=False),
    A("ksg", "KSG", "escopeta", rpm=70, peso=.75, recuo=.85),
    A("srm1216 m1216", "M1216", "escopeta", rpm=350, peso=.6, recuo=.75),
    A("olympia rottweil72", "Olympia", "escopeta", rpm=120, peso=.8, recuo=.95),
    A("fiveseven fivesevendw", "Five-seven", "pistola", rpm=500, peso=.35, recuo=.35),
    A("fnp45 tac45", "Tac-45", "pistola", rpm=450, peso=.4, recuo=.45),
    A("beretta93r b23r", "B23R", "pistola", rpm=750, peso=.3, recuo=.35, rajada=3),
    A("judge executioner", "Executioner", "revolver", rpm=180, peso=.75, recuo=.9),
    A("kard kap40", "KAP-40", "pistola", rpm=900, peso=.25, recuo=.3, auto=True),
    A("m1911 colt", "M1911", "pistola", rpm=400, peso=.45, recuo=.5),
    A("python", "Python", "revolver", rpm=180, peso=.75, recuo=.9),
    A("rnma remington", "Remington New Model Army", "revolver", rpm=180, peso=.7, recuo=.85),
    A("c96 mauser", "Mauser C96", "pistola", rpm=400, peso=.4, recuo=.45),
    A("smaw", "SMAW", "lancador", rpm=40, peso=.85, recuo=.95),
    A("fhj18", "FHJ-18 AA", "lancador", rpm=40, peso=.85, recuo=.95),
    A("usrpg rpg", "RPG", "lancador", rpm=40, peso=.85, recuo=.95),
    A("m32 warmachine", "War Machine", "lancador", rpm=150, peso=.7, recuo=.75),
    A("crossbow", "Crossbow", "arco", rpm=60, peso=.7, recuo=.5),
    A("knifeballistic", "Ballistic Knife", "arco", rpm=60, peso=.55, recuo=.4),
    A("riotshield", "Assault Shield", "corpo_a_corpo"),
    A("raygunmark2 raygun2", "Ray Gun Mark II", "energia", rpm=600, peso=.35, recuo=.25, energia=True, rajada=3),
    A("raygun", "Ray Gun", "energia", rpm=180, peso=.4, recuo=.35, energia=True),
    A("slipgun sliquifier", "Sliquifier", "energia", rpm=120, peso=.5, recuo=.4, energia=True),
    A("blundergat", "Blundergat", "escopeta", rpm=120, peso=.8, recuo=.95),
    A("blundersplat", "Acidgat", "lancador", rpm=120, peso=.7, recuo=.7),
    A("jetgun", "Jet Gun", "energia", rpm=900, peso=.7, recuo=.5, giro=True),
    A("staff", "Elemental Staff", "energia", rpm=150, peso=.5, recuo=.4, energia=True),
    A("galil", "Galil", "fuzil", rpm=750, peso=.4, recuo=.4),
    A("ak74u", "AK-74u", "smg", rpm=750, peso=.3, recuo=.35),
    A("m14", "M14", "fuzil", rpm=400, peso=.6, recuo=.6, auto=False),
    A("mp5k", "MP5", "smg", rpm=800, peso=.25, recuo=.25),
    A("m16", "M16", "fuzil", rpm=750, peso=.4, recuo=.35, rajada=3),
    A("thompson", "M1927", "smg", rpm=750, peso=.4, recuo=.45),
    A("uzi", "Uzi", "smg", rpm=900, peso=.25, recuo=.3),
    A("mp40", "MP40", "smg", rpm=550, peso=.35, recuo=.35),
    A("stg44", "STG-44", "fuzil", rpm=550, peso=.5, recuo=.5),
    A("rpd", "RPD", "metralhadora", rpm=700, peso=.7, recuo=.6),
    A("mg08", "MG08/15", "metralhadora", rpm=500, peso=.8, recuo=.6),
    A("minigun deathmachine", "Death Machine", "metralhadora", rpm=1500, peso=.85, recuo=.5, giro=True),
    A("knife faca", "Knife", "corpo_a_corpo"),
]

# id -> dados do jogo. "exes": processos que identificam o jogo (em minúsculas).
JOGOS = {
    "titanfall2": {"nome": "Titanfall 2", "modo": "mod", "armas": TITANFALL2, "exes": ["titanfall2.exe"],
                   "prefixos": {"mp_titanweapon_": "titan", "mp_weapon_": "", "melee_pilot_": ""}},
    "doom_gzdoom": {"nome": "Doom (GZDoom)", "modo": "mod", "armas": DOOM_CLASSICO,
                    "exes": ["gzdoom.exe", "lzdoom.exe", "vkdoom.exe", "uzdoom.exe", "qzdoom.exe", "zandronum.exe"]},
    "bo2": {"nome": "Call of Duty: Black Ops II", "modo": "mod", "armas": BO2,
            "exes": ["plutonium-bootstrapper-win32.exe", "t6mp.exe", "t6zm.exe", "t6sp.exe"]},
}

_POR_EXE = {e: jid for jid, j in JOGOS.items() for e in j["exes"]}


def jogo_por_exe(exe):
    return _POR_EXE.get((exe or "").lower())


def _limpo(texto):
    return re.sub(r"[^a-z0-9]", "", (texto or "").lower())


def nucleo(jogo_id, nome):
    """Nome cru (do mod ou da tela) -> forma comparável."""
    n = (nome or "").lower().split("+")[0].strip()
    for p, troca in JOGOS.get(jogo_id, {}).get("prefixos", {}).items():
        if n.startswith(p):
            n = troca + n[len(p):]
            break
    n = re.sub(r"(_upgraded)?(_zm|_mp|_sp)$", "", n)
    n = re.sub(r"_(dw|lh)$", "", n)
    return _limpo(n)


def identificar(jogo_id, nome):
    """-> (nome na tela, tipo, traços) ou None."""
    j = JOGOS.get(jogo_id)
    n = nucleo(jogo_id, nome)
    if not j or not n:
        return None
    melhor = None
    for apelidos, exibe, tipo, tr in j["armas"]:
        chaves = [_limpo(a) for a in apelidos] + [_limpo(exibe)]
        if n in chaves:
            return exibe, tipo, tr
        # "plasmarifleupgrade", "doom64plasmarifle", "brutepistol"…: o apelido mais longo contido no nome
        for c in chaves:
            if len(c) >= 3 and c in n and (melhor is None or len(c) > melhor[0]):
                melhor = (len(c), (exibe, tipo, tr))
    return melhor[1] if melhor else None


def nomes(jogo_id):
    return [a[1] for a in JOGOS.get(jogo_id, {}).get("armas", [])]


def _num(x, padrao=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return padrao


def _e(efeito, inicio=0, fim=9, forca=0, forca_fim=None, frequencia=0):
    d = {"efeito": efeito, "inicio": int(inicio), "fim": int(fim), "forca": int(round(forca)), "frequencia": int(frequencia)}
    if forca_fim is not None:
        d["forca_fim"] = int(round(forca_fim))
    return d


PESO_PADRAO = {"sniper": 0.75, "escopeta": 0.75, "metralhadora": 0.7, "lancador": 0.85, "smg": 0.3, "pistola": 0.4,
               "revolver": 0.75, "arco": 0.6, "energia": 0.4, "corpo_a_corpo": 0.5}


def montar(exibe, tipo, tr, rpm=0, pente=0):
    """O setup dos gatilhos a partir do tipo e do jeito da arma."""
    tr = dict(tr or {})
    rpm = int(rpm or tr.get("rpm") or 0)
    peso = _num(tr.get("peso"), PESO_PADRAO.get(tipo, 0.45))
    recuo = _num(tr.get("recuo"), peso)
    energia = bool(tr.get("energia"))
    rajada = int(tr.get("rajada") or 0)
    ferrolho = bool(tr.get("ferrolho"))
    carga = bool(tr.get("carga"))
    giro = bool(tr.get("giro"))
    if "auto" in tr:
        automatica = bool(tr["auto"])
    else:
        automatica = (tipo in ("smg", "metralhadora") or (tipo in ("fuzil", "energia") and rpm >= 450) or rajada > 1 or giro)
    forca = 2 + 6 * peso
    if tipo == "corpo_a_corpo" and not giro:
        r2 = _e("arma", 2, 4, 3)
        automatica = False
    elif tipo == "arco":
        r2 = _e("rampa", 1, 9, 1, forca_fim=min(8, forca + 1))       # corda: fica mais dura até o fundo
    elif carga:
        r2 = _e("rampa", 1, 9, 1, forca_fim=min(8, forca))           # carregando o disparo
    elif giro:
        r2 = _e("rampa", 2, 9, max(1, forca - 3), forca_fim=min(8, forca))
    elif automatica:
        if tipo == "metralhadora":
            r2 = _e("rampa", 2, 9, max(2, forca - 3), forca_fim=min(8, forca))
        else:
            r2 = _e("resistencia", 2 if energia else 3, forca=max(1, forca - (3 if energia else 2)))
    else:
        # a resistência começa logo no início do curso (zona 2, o mínimo do DualSense) e o clique
        # vem mais fundo nas armas pesadas; o jogo só recebe o tiro depois do clique (controle.py)
        ini = 2
        fim = 6 if (ferrolho or tipo in ("sniper", "lancador")) else 5 if tipo in ("escopeta", "revolver") else 4
        r2 = _e("arma", ini, fim, min(8, forca + (1 if ferrolho else 0)))
        if energia:
            r2["forca"] = max(2, r2["forca"] - 1)
    l2 = _e("resistencia", 2, forca=3 if tipo == "sniper" else 2 if peso >= 0.5 else 1)
    if tipo == "corpo_a_corpo":
        l2 = _e("nenhum")
    vibra = 2 + 6 * recuo
    if energia:
        vibra = max(1, vibra - 2)
    if rpm > 900:
        vibra = max(1, vibra - 1)
    if tipo == "corpo_a_corpo" and not giro:
        vibra = 3
    partes = [exibe, "energia" if energia else "balística"]
    if rajada:
        partes.append(f"rajada de {rajada}")
    elif ferrolho:
        partes.append("ferrolho")
    elif carga:
        partes.append("carrega o disparo")
    elif giro:
        partes.append("cano giratório")
    else:
        partes.append("automática" if automatica else "semiautomática")
    if rpm:
        partes.append(f"{rpm} tiros/min")
    return {
        "tipo": tipo, "nome": exibe, "r2": r2, "l2": l2,
        "automatica": bool(automatica), "cadencia_rpm": rpm, "pente": int(_num(pente)),
        "coice": round(min(1.0, 0.2 + 0.8 * recuo), 2), "vibra_gatilho": int(round(vibra)),
        "energia": energia, "rajada": rajada, "ferrolho": ferrolho, "carga": carga, "giro": giro,
        "resumo": ", ".join(partes) if tipo != "corpo_a_corpo" else exibe,
    }


CLASSES = {"rifle": "fuzil", "smg": "smg", "mg": "metralhadora", "spread": "escopeta", "sniper": "sniper",
           "pistol": "pistola", "rocketlauncher": "lancador", "grenade": "granada", "melee": "corpo_a_corpo"}


def perfil(jogo_id, nome, classe="", firetime=0, clip=0):
    """Configuração da arma: tabela do jogo + o que o jogo informar (cadência, pente)."""
    achada = identificar(jogo_id, nome)
    if achada:
        exibe, tipo, tr = achada
    else:
        exibe, tipo, tr = (nome or "Arma").replace("_", " ").strip().title(), CLASSES.get((classe or "").lower(), "fuzil"), {}
    ft = _num(firetime)
    rpm = int(round(60.0 / ft)) if ft > 0.001 else int(tr.get("rpm") or 0)
    p = montar(exibe, tipo, tr, rpm, clip)
    p.update(tabela=jogo_id, nome_jogo=nome, gerador=GERADOR, jogo=JOGOS.get(jogo_id, {}).get("nome", ""),
             fonte="perfil da arma" + (" + dados do jogo" if ft > 0.001 else "") if achada else "classe da arma")
    return p


def precisa_refazer(salvo):
    if not salvo:
        return True
    if salvo.get("editado"):
        return False
    return int(salvo.get("gerador") or 0) < GERADOR or not salvo.get("tabela")


def semear(cerebro, jogo_id):
    """Põe todas as armas do jogo no banco (aparecem na aba Armas antes de você usar cada uma)."""
    j = JOGOS.get(jogo_id)
    if not j:
        return 0
    n = 0
    for _, exibe, _, _ in j["armas"]:
        if not armas_salvas_precisam(cerebro, j["nome"], exibe):
            continue
        cerebro.salvar_arma(j["nome"], exibe, perfil(jogo_id, exibe))
        n += 1
    return n


def armas_salvas_precisam(cerebro, jogo, arma):
    return precisa_refazer(cerebro.armas.get(cerebro.chave(jogo, arma)))
