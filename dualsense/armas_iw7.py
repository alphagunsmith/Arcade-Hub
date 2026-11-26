"""Uma configuração para cada arma do Call of Duty: Infinite Warfare (mod iw7).

O script do jogo (dualsense_auto.gsc) informa, a cada troca de arma, o nome interno
(ex.: iw7_ar57_mp), a classe, o tempo entre tiros e o tamanho do pente. Isso já dá a
cadência real de cada arma. Esta tabela acrescenta o "jeito" de cada uma:
  - energia x balística (energia: gatilho mais leve e vibração fina e rápida;
    balística: gatilho com ponto de disparo e tranco mais seco);
  - rajada (R-VN), ferrolho (sniper KBS), recuo e peso de cada arma.
Cada arma vista no jogo ganha a sua configuração no banco de armas (armas.json); o que
você ajustar na aba Armas do painel fica salvo e não é mais sobrescrito.

Os nomes internos confirmados (página da arma na wiki de CoD): ar57 = KBAR-32,
ake = Volk, fmg = Type-2, rvn = R-VN, vr = X-Eon, fhr = FHR-40, unsalmg = Atlas,
devastator = Reaver, thunderstorm = Hailstorm. Os outros também são reconhecidos pelo
nome final da arma (nv4, erad, karma, kbs, banshee...). Arma que não estiver na tabela
usa a classe e a cadência que o próprio jogo informou.
"""
import json
import re

GERADOR = 3          # sobe quando a tabela mudar: perfis automáticos antigos são refeitos

# apelidos (nome interno sem "iw7_" e "_mp") -> (nome na tela, tipo, traços)
#   peso: 0..1 (gatilho mais duro), recuo: 0..1 (tranco no disparo), energia, rajada, ferrolho
_T = [
    # fuzis de assalto
    (("ar57", "kbar", "kbar32"), "KBAR-32", "fuzil", dict(peso=0.35, recuo=0.35)),
    (("nv4", "m4"), "NV4", "fuzil", dict(peso=0.45, recuo=0.45)),
    (("r3k", "rk3", "arclassic"), "R3K", "fuzil", dict(peso=0.6, recuo=0.6)),
    (("ake", "volk"), "Volk", "fuzil", dict(peso=0.55, recuo=0.8, energia=True)),
    (("fmg", "type2", "mod2"), "Type-2", "fuzil", dict(peso=0.3, recuo=0.3, energia=True)),
    (("rvn",), "R-VN", "fuzil", dict(peso=0.4, recuo=0.25, energia=True, rajada=2)),
    (("vr", "xeon"), "X-Eon", "fuzil", dict(peso=0.4, recuo=0.4, energia=True)),
    (("grail", "railgun"), "G-Rail", "fuzil", dict(peso=0.6, recuo=0.6, energia=True)),
    (("osa",), "OSA", "fuzil", dict(peso=0.5, recuo=0.5)),
    # submetralhadoras
    (("fhr", "fhr40"), "FHR-40", "smg", dict(peso=0.25, recuo=0.55)),
    (("erad",), "Erad", "smg", dict(peso=0.2, recuo=0.25, energia=True)),
    (("karma", "karma45", "crb"), "Karma-45", "smg", dict(peso=0.3, recuo=0.35)),
    (("rpr", "rprevo", "ripper"), "RPR Evo", "smg", dict(peso=0.35, recuo=0.4)),
    (("hvr",), "HVR", "smg", dict(peso=0.35, recuo=0.45)),
    (("vpr",), "VPR", "smg", dict(peso=0.25, recuo=0.3, energia=True)),
    (("trencher",), "Trencher", "smg", dict(peso=0.3, recuo=0.35)),
    (("raijin", "raijinemx"), "Raijin-EMX", "smg", dict(peso=0.25, recuo=0.3, energia=True)),
    (("mactav", "mactav45"), "MacTav-45", "smg", dict(peso=0.4, recuo=0.5)),
    # metralhadoras
    (("unsalmg", "atlas"), "Atlas", "metralhadora", dict(peso=0.75, recuo=0.6)),
    (("raw", "sdflmg"), "R.A.W.", "metralhadora", dict(peso=0.65, recuo=0.55)),
    (("mauler",), "Mauler", "metralhadora", dict(peso=0.7, recuo=0.6, energia=True)),
    (("titan",), "Titan", "metralhadora", dict(peso=0.85, recuo=0.75)),
    # snipers e de precisão
    (("kbs", "longbow", "kbslongbow"), "KBS Longbow", "sniper", dict(peso=0.9, recuo=0.95, ferrolho=True)),
    (("ebr", "ebr800"), "EBR-800", "sniper", dict(peso=0.75, recuo=0.8, energia=True)),
    (("dmr", "dmr1"), "DMR-1", "sniper", dict(peso=0.7, recuo=0.7)),
    (("widowmaker", "widow"), "Widowmaker", "sniper", dict(peso=0.75, recuo=0.7, energia=True)),
    (("tf141",), "TF-141", "sniper", dict(peso=0.8, recuo=0.8)),
    (("m1",), "M1", "sniper", dict(peso=0.7, recuo=0.75)),
    # escopetas
    (("devastator", "reaver"), "Reaver", "escopeta", dict(peso=0.8, recuo=0.95)),
    (("banshee",), "Banshee", "escopeta", dict(peso=0.75, recuo=0.85, energia=True)),
    (("dcm", "dcm8"), "DCM-8", "escopeta", dict(peso=0.7, recuo=0.8)),
    (("rack", "rack9"), "Rack-9", "escopeta", dict(peso=0.6, recuo=0.7)),
    (("m2187", "mod2187"), "M.2187", "escopeta", dict(peso=0.75, recuo=0.85)),
    (("sravage", "ravage"), "S-Ravage", "escopeta", dict(peso=0.75, recuo=0.9)),
    # pistolas
    (("emc",), "EMC", "pistola", dict(peso=0.45, recuo=0.45, energia=True)),
    (("oni",), "Oni", "pistola", dict(peso=0.3, recuo=0.3, energia=True)),
    (("kendall", "kendall44"), "Kendall 44", "pistola", dict(peso=0.4, recuo=0.4)),
    (("thunderstorm", "hailstorm"), "Hailstorm", "pistola", dict(peso=0.35, recuo=0.35)),
    (("udm",), "UDM", "revolver", dict(peso=0.7, recuo=0.85)),
    (("stallion", "stallion44"), "Stallion .44", "revolver", dict(peso=0.75, recuo=0.9)),
    (("hornet",), "Hornet", "pistola", dict(peso=0.35, recuo=0.35)),
    # lançadores e corpo a corpo
    (("spartan", "spartansa3", "lockon"), "Spartan SA3", "lancador", dict(peso=0.85, recuo=0.9)),
    (("plaw", "glprox"), "P-LAW", "lancador", dict(peso=0.85, recuo=0.95)),
    (("howitzer", "chargeshot"), "Howitzer", "lancador", dict(peso=0.9, recuo=1.0, energia=True)),
    (("knife", "fists", "melee", "axe", "katana"), "Corpo a corpo", "corpo_a_corpo", dict(peso=0.5, recuo=0.5)),
]
_APELIDO = {a: (nome, tipo, tr) for aps, nome, tipo, tr in _T for a in aps}

CLASSE = {"rifle": "fuzil", "smg": "smg", "mg": "metralhadora", "spread": "escopeta",
          "sniper": "sniper", "pistol": "pistola", "rocketlauncher": "lancador",
          "grenade": "granada", "beam": "energia", "melee": "corpo_a_corpo",
          "item": "nenhuma", "none": "nenhuma"}


def nucleo(nome):
    """'alt_iw7_ar57_mp+reflex' -> 'ar57' ; 'iw7_kbs_mpr' -> 'kbs'."""
    n = (nome or "").lower().split("+")[0]
    n = re.sub(r"^(alt_)+", "", n)
    n = re.sub(r"^iw7_", "", n)
    n = re.sub(r"_(mp|mpr|mpl|zm|sp|cp)(_.*)?$", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


def identificar(nome):
    """-> (nome na tela, tipo, traços) ou None se a arma não está na tabela."""
    n = nucleo(nome)
    if not n:
        return None
    if n in _APELIDO:
        return _APELIDO[n]
    for a in sorted(_APELIDO, key=len, reverse=True):     # "ar57akimbo", "fmgpistol"...
        if len(a) >= 3 and n.startswith(a):
            return _APELIDO[a]
    return None


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


def perfil(nome, classe, firetime, clip):
    """Configuração da arma a partir dos dados do jogo + o jeito dela (tabela acima)."""
    achada = identificar(nome)
    tipo = achada[1] if achada else CLASSE.get((classe or "").lower(), "fuzil")
    tr = dict(achada[2]) if achada else {}
    exibe = achada[0] if achada else (nucleo(nome) or "arma").upper()
    ft = _num(firetime)
    rpm = int(round(60.0 / ft)) if ft > 0.001 else 0
    pente = int(_num(clip))
    peso = _num(tr.get("peso"), {"sniper": 0.75, "escopeta": 0.75, "metralhadora": 0.7, "lancador": 0.85,
                                 "smg": 0.3, "pistola": 0.4, "revolver": 0.75}.get(tipo, 0.45))
    recuo = _num(tr.get("recuo"), peso)
    energia = bool(tr.get("energia")) or tipo == "energia"
    rajada = int(tr.get("rajada") or 0)
    ferrolho = bool(tr.get("ferrolho"))
    automatica = tipo in ("smg", "metralhadora", "energia") or (tipo == "fuzil" and 0 < ft < 0.13) or rajada > 1
    if tipo in ("sniper", "escopeta", "lancador", "revolver") and not rajada:
        automatica = automatica and 0 < ft < 0.12

    forca = 2 + 6 * peso                      # 2..8
    if automatica:
        # contínua: resistência que segura o dedo; a rajada vibra na cadência real (no app)
        if tipo == "metralhadora":
            r2 = _e("rampa", 2, 9, max(2, forca - 3), forca_fim=min(8, forca))
        else:
            r2 = _e("resistencia", 2 if energia else 3, forca=max(1, forca - (3 if energia else 2)))
    else:
        # semiautomática: "ponto" de disparo; ferrolho/escopeta mais fundo e duro
        # a resistência começa logo no início do curso (zona 2, o mínimo do DualSense) e o clique
        # vem mais fundo nas armas pesadas; o jogo só recebe o tiro depois do clique (controle.py)
        ini = 2
        fim = 6 if (ferrolho or tipo in ("sniper", "lancador")) else 5 if tipo in ("escopeta", "revolver") else 4
        r2 = _e("arma", ini, fim, min(8, forca + (1 if ferrolho else 0)))
    if energia and not automatica:
        r2["forca"] = max(2, r2["forca"] - 1)        # energia: estalo mais leve
    l2 = _e("resistencia", 2, forca=3 if tipo == "sniper" else 2 if peso >= 0.5 else 1)
    vibra = 2 + 6 * recuo                     # 2..8 (tranco no R2 a cada disparo)
    if energia:
        vibra = max(1, vibra - 2)
    if rpm > 900:
        vibra = max(1, vibra - 1)               # cadência alta: vibração mais fina para não "embolar"
    return {
        "tipo": tipo, "nome": exibe, "r2": r2, "l2": l2,
        "automatica": bool(automatica), "cadencia_rpm": rpm, "pente": pente,
        "coice": round(min(1.0, 0.2 + 0.8 * recuo), 2), "vibra_gatilho": int(round(vibra)),
        "energia": energia, "rajada": rajada, "ferrolho": ferrolho,
        "dados_jogo": [nome, classe, str(firetime), str(clip)],
        "gerador": GERADOR, "fonte": "dados do jogo + perfil da arma" if achada else "dados do jogo (classe)",
        "resumo": _resumo(exibe, tipo, rpm, automatica, energia, rajada, ferrolho),
    }


def _resumo(nome, tipo, rpm, auto, energia, rajada, ferrolho):
    partes = [nome, "energia" if energia else "balística"]
    if rajada:
        partes.append(f"rajada de {rajada}")
    elif ferrolho:
        partes.append("ferrolho")
    else:
        partes.append("automática" if auto else "semiautomática")
    if rpm:
        partes.append(f"{rpm} tiros/min")
    return ", ".join(partes)


def precisa_refazer(salvo):
    """Perfil automático de uma versão antiga da tabela (ou pesquisado pela IA): refaz.
    O que o usuário editou fica."""
    if not salvo:
        return True
    if salvo.get("editado"):
        return False
    return int(salvo.get("gerador") or 0) < GERADOR


if __name__ == "__main__":
    print(json.dumps(perfil("iw7_ar57_mp", "rifle", "0.075", "30"), ensure_ascii=False, indent=1))
