"""Geradores de efeitos (chuva, terreno, dano, coração, armas)."""
import math
import random

from ds_hid import Trig, clamp

# ----------------------------------------------------------------------------
# Setup de gatilho descrito em JSON -> efeito do DualSense
# ----------------------------------------------------------------------------
def spec_to_trig(spec, g=1.0):
    if not spec:
        return Trig.off()
    ef = spec.get("efeito", "nenhum")
    ini = int(clamp(spec.get("inicio", 0) or 0, 0, 9))
    fim = int(clamp(spec.get("fim", 9) or 9, 0, 9))
    f = clamp((spec.get("forca", 0) or 0) * g, 0, 8)
    if ef == "arma":
        return Trig.weapon(max(2, ini), max(fim, ini + 1), f)
    if ef == "resistencia":
        return Trig.feedback(ini, f)
    if ef == "rampa":
        return Trig.slope(ini, max(fim, ini + 1), f, clamp((spec.get("forca_fim", f) or f) * g, 0, 8))
    if ef == "vibracao":
        return Trig.vibration(ini, f, spec.get("frequencia", 20) or 20)
    return Trig.off()


def _s(efeito, inicio=0, fim=9, forca=0, forca_fim=None, frequencia=0):
    return {"efeito": efeito, "inicio": inicio, "fim": fim, "forca": forca,
            "forca_fim": forca if forca_fim is None else forca_fim, "frequencia": frequencia}


# Terrenos (para veículos). base = (motor pesado, motor leve), ruido = aspereza,
# ondula = (Hz, força) de balanço lento, r2 = acelerador, l2 = freio
TERRENOS = {
    "asfalto":  dict(base=(0.05, 0.04), ruido=0.03, ondula=(0, 0), r2=_s("resistencia", 2, forca=1), l2=_s("rampa", 1, 9, 1, 7)),
    "terra":    dict(base=(0.20, 0.15), ruido=0.15, ondula=(2.0, 0.1), r2=_s("vibracao", 3, forca=2, frequencia=18), l2=_s("rampa", 1, 9, 1, 5)),
    "lama":     dict(base=(0.35, 0.08), ruido=0.18, ondula=(3.0, 0.25), r2=_s("vibracao", 2, forca=3, frequencia=8), l2=_s("rampa", 1, 9, 1, 3)),
    "cascalho": dict(base=(0.10, 0.35), ruido=0.35, ondula=(0, 0), r2=_s("vibracao", 3, forca=2, frequencia=45), l2=_s("rampa", 1, 9, 1, 5)),
    "grama":    dict(base=(0.15, 0.10), ruido=0.10, ondula=(1.5, 0.08), r2=_s("resistencia", 2, forca=1), l2=_s("rampa", 1, 9, 1, 5)),
    "areia":    dict(base=(0.30, 0.15), ruido=0.15, ondula=(1.0, 0.1), r2=_s("resistencia", 1, forca=5), l2=_s("rampa", 1, 9, 1, 4)),
    "neve":     dict(base=(0.15, 0.06), ruido=0.08, ondula=(1.0, 0.05), r2=_s("resistencia", 2, forca=1), l2=_s("rampa", 1, 9, 0, 3)),
    "gelo":     dict(base=(0.03, 0.03), ruido=0.02, ondula=(0, 0), r2=_s("nenhum"), l2=_s("resistencia", 5, forca=1), abs=True),
    "agua":     dict(base=(0.30, 0.10), ruido=0.05, ondula=(1.2, 0.3), r2=_s("resistencia", 1, forca=4), l2=_s("rampa", 1, 9, 1, 3)),
    "zebra":    dict(base=(0.20, 0.20), ruido=0.05, ondula=(14.0, 0.5), r2=_s("vibracao", 2, forca=4, frequencia=14), l2=_s("vibracao", 2, forca=4, frequencia=14)),
    "metal":    dict(base=(0.10, 0.25), ruido=0.20, ondula=(0, 0), r2=_s("vibracao", 3, forca=1, frequencia=60), l2=_s("rampa", 1, 9, 1, 6)),
    "madeira":  dict(base=(0.15, 0.20), ruido=0.20, ondula=(6.0, 0.15), r2=_s("resistencia", 2, forca=1), l2=_s("rampa", 1, 9, 1, 6)),
}
TERRENOS["desconhecido"] = TERRENOS["asfalto"]


class Terreno:
    def __init__(self):
        self.ruido = 0.0

    def rumble(self, nome, vel, now):
        t = TERRENOS.get(nome or "desconhecido", TERRENOS["asfalto"])
        self.ruido = self.ruido * 0.6 + random.random() * 0.4
        hz, amp = t["ondula"]
        ond = amp * (0.5 + 0.5 * math.sin(2 * math.pi * hz * now)) if hz else 0.0
        l = (t["base"][0] + ond + t["ruido"] * self.ruido * 0.6) * vel
        r = (t["base"][1] + t["ruido"] * self.ruido) * vel
        return l, r

    @staticmethod
    def gatilhos(nome, l2_pos, g):
        t = TERRENOS.get(nome or "desconhecido", TERRENOS["asfalto"])
        left = spec_to_trig(t["l2"], g)
        if t.get("abs") and l2_pos > 150:  # freio travando no gelo -> ABS
            left = Trig.vibration(4, clamp(4 * g, 0, 8), 25)
        return left, spec_to_trig(t["r2"], g)


# ----------------------------------------------------------------------------
# Padrões temporários (dano por direção, coice...)
# ----------------------------------------------------------------------------
def padrao_dano(direcao, forca=1.0):
    s = clamp(forca, 0.3, 1.0)

    def f(dt):
        if direcao == "esquerda":
            return (s, 0.25 * s) if dt < 0.16 else None
        if direcao == "direita":
            return (0.25 * s, s) if dt < 0.16 else None
        if direcao == "tras":  # duas batidas graves e largas = "nas costas"
            if dt < 0.09:
                return (0.85 * s, 0.6 * s)
            if dt < 0.15:
                return (0.0, 0.0)
            if dt < 0.30:
                return (0.65 * s, 0.45 * s)
            return None
        # frente: tranco seco e agudo
        return (0.7 * s, s) if dt < 0.12 else None
    return f


def padrao_coice(coice):
    def f(dt):
        if dt > 0.18:
            return None
        k = math.exp(-dt / 0.06)
        return (coice * k, coice * 0.7 * k)
    return f


class Pulsos:
    def __init__(self):
        self.ativos = []

    def add(self, fn, now):
        self.ativos.append((now, fn))
        if len(self.ativos) > 12:
            self.ativos.pop(0)

    def valor(self, now):
        l = r = 0.0
        vivos = []
        for t0, fn in self.ativos:
            v = fn(now - t0)
            if v is None:
                continue
            vivos.append((t0, fn))
            l, r = max(l, v[0]), max(r, v[1])
        self.ativos = vivos
        return l, r


# ----------------------------------------------------------------------------
# Clima e corpo
# ----------------------------------------------------------------------------
class Chuva:
    """Gotas aleatórias no motor leve + leve rumor no pesado."""
    def __init__(self):
        self.gota = 0.0

    def rumble(self, intensidade, dentro_veiculo, dt):
        if intensidade <= 0.02:
            self.gota = 0.0
            return 0.0, 0.0
        taxa = 6 + 40 * intensidade          # gotas por segundo
        if random.random() < taxa * dt:
            self.gota = max(self.gota, 0.25 + 0.45 * random.random() * intensidade)
        self.gota *= 0.55
        teto = 1.4 if dentro_veiculo else 1.0  # no teto do carro a chuva "batuca" mais
        return 0.10 * intensidade * teto, self.gota * teto


def coracao(now, bpm=75):
    fase = (now * bpm / 60.0) % 1.0
    if fase < 0.07:
        return 0.75
    if 0.18 < fase < 0.25:
        return 0.5
    return 0.0
