"""DualSense -> controle de Xbox virtual, com os botões trocáveis.

Cada entrada do DualSense vai para uma saída do Xbox (ou para nada). O mapa padrão é o
de sempre (✕ = A, ○ = B, □ = X, △ = Y…); no painel, aba Botões, dá para trocar qualquer um,
para todos os jogos ou só para um jogo.

O botão PS é especial: o Guide do Xbox abre o overlay da Steam e a Xbox Game Bar, então por
padrão ele só vira Guide segurando 0,8 s (toque rápido não faz nada).
"""
from xbox import (UP, DOWN, LEFT, RIGHT, START, BACK, LTHUMB, RTHUMB, LB, RB, GUIDE, A, B, X, Y,
                  HAT, _stick, _axis, FiltroBotaoPS)

# entradas do DualSense: id -> (nome na tela, byte, bit)  (byte 0/1/2 = b0/b1/b2 do relatório)
ENTRADAS = {
    "cruz": ("✕ Cruz", 0, 0x20), "circulo": ("○ Círculo", 0, 0x40), "quadrado": ("□ Quadrado", 0, 0x10),
    "triangulo": ("△ Triângulo", 0, 0x80),
    "l1": ("L1", 1, 0x01), "r1": ("R1", 1, 0x02), "l2": ("L2 (gatilho)", None, None), "r2": ("R2 (gatilho)", None, None),
    "create": ("Create", 1, 0x10), "options": ("Options", 1, 0x20), "l3": ("L3 (analógico esquerdo)", 1, 0x40),
    "r3": ("R3 (analógico direito)", 1, 0x80), "ps": ("Botão PS", 2, 0x01), "touchpad": ("Touchpad (clique)", 2, 0x02),
    "mute": ("Botão de microfone", 2, 0x04),
    "cima": ("Direcional ↑", None, None), "baixo": ("Direcional ↓", None, None),
    "esquerda": ("Direcional ←", None, None), "direita": ("Direcional →", None, None),
}
# saídas do Xbox: id -> (nome na tela, bit XInput ou gatilho)
SAIDAS = {
    "a": ("A", A), "b": ("B", B), "x": ("X", X), "y": ("Y", Y), "lb": ("LB", LB), "rb": ("RB", RB),
    "lt": ("LT (gatilho)", "lt"), "rt": ("RT (gatilho)", "rt"), "back": ("View / Back", BACK), "start": ("Menu / Start", START),
    "ls": ("LS (clique do analógico esquerdo)", LTHUMB), "rs": ("RS (clique do analógico direito)", RTHUMB),
    "guide": ("Guide (abre overlays)", GUIDE), "cima": ("Direcional ↑", UP), "baixo": ("Direcional ↓", DOWN),
    "esquerda": ("Direcional ←", LEFT), "direita": ("Direcional →", RIGHT), "nada": ("Nada", 0),
}
PADRAO = {"cruz": "a", "circulo": "b", "quadrado": "x", "triangulo": "y", "l1": "lb", "r1": "rb", "l2": "lt", "r2": "rt",
          "create": "back", "options": "start", "l3": "ls", "r3": "rs", "ps": "guide", "touchpad": "back", "mute": "nada",
          "cima": "cima", "baixo": "baixo", "esquerda": "esquerda", "direita": "direita"}
# analógicos: trocar esquerdo/direito e inverter o eixo vertical
OPCOES_PADRAO = {"trocar_analogicos": False, "inverter_y_esq": False, "inverter_y_dir": False}

_DIR_HAT = {UP: "cima", DOWN: "baixo", LEFT: "esquerda", RIGHT: "direita"}


def trava_do_efeito(efeito):
    """Efeito de arma do DualSense (0x25, zonas início/fim) -> (abre, fecha) no curso 0-255.
    O clique acontece na zona `fim`; o tiro sai logo depois dele e volta a armar quando o dedo
    sobe de novo para dentro da resistência."""
    if not efeito or efeito[0] != 0x25:
        return None
    zonas = efeito[1] | (efeito[2] << 8)
    if not zonas:
        return None
    ini = (zonas & -zonas).bit_length() - 1
    fim = zonas.bit_length() - 1
    abre = min(240, int((fim + 1) * 25.5))
    fecha = max(int(ini * 25.5), abre - 50, 20)
    return abre, fecha


def limpar_mapa(m):
    """Só entradas e saídas conhecidas; o que faltar fica no padrão."""
    m = m if isinstance(m, dict) else {}
    out = dict(PADRAO)
    for k, v in m.items():
        if k in ENTRADAS and v in SAIDAS:
            out[k] = v
    return out


def limpar_opcoes(o):
    o = o if isinstance(o, dict) else {}
    return {k: bool(o.get(k, v)) for k, v in OPCOES_PADRAO.items()}


def apertados(st):
    """Entradas do DualSense apertadas agora (ids de ENTRADAS)."""
    out = []
    for k, (_, byte, bit) in ENTRADAS.items():
        if byte is None:
            continue
        if (st.b0, st.b1, st.b2)[byte] & bit:
            out.append(k)
    hat = HAT.get(st.b0 & 0x0F, 0)
    out += [nome for bit, nome in _DIR_HAT.items() if hat & bit]
    if st.l2 > 20:
        out.append("l2")
    if st.r2 > 20:
        out.append("r2")
    return out


class Mapeador:
    """Converte o estado do DualSense no relatório do Xbox, com o mapa escolhido."""

    def __init__(self):
        self.mapa = dict(PADRAO)
        self.opcoes = dict(OPCOES_PADRAO)
        self.filtro_ps = FiltroBotaoPS()
        self.ultimo = {"entrada": [], "saida": []}
        # gatilho com efeito de arma (tiro único): (abre, fecha) no curso 0-255, ou None
        self.trava = {"l2": None, "r2": None}
        self._aberto = {"l2": False, "r2": False}

    def configurar(self, mapa=None, opcoes=None, modo_ps=None):
        self.mapa = limpar_mapa(mapa)
        self.opcoes = limpar_opcoes(opcoes)
        if modo_ps:
            self.filtro_ps.modo = modo_ps

    def travar(self, e, efeito):
        """Recebe o efeito de 11 bytes do gatilho `e`. Se for o de arma (clique), o jogo só recebe o
        gatilho depois do clique: antes disso, por mais que o dedo desça, vai 0."""
        self.trava[e] = trava_do_efeito(efeito)

    def _gatilho(self, e, valor):
        t = self.trava.get(e)
        if not t:
            self._aberto[e] = valor >= 40
            return valor
        abre, fecha = t
        if self._aberto[e]:
            if valor < fecha:
                self._aberto[e] = False
        elif valor >= abre:
            self._aberto[e] = True
        return 255 if self._aberto[e] else 0

    def converter(self, st, now):
        """-> (botões, LT, RT, LX, LY, RX, RY) do Xbox."""
        entradas = apertados(st)
        w, lt, rt = 0, 0, 0
        # gatilhos: o curso inteiro passa (sem zona morta), virem eles LT/RT ou um botão
        for e, valor in (("l2", st.l2), ("r2", st.r2)):
            valor = self._gatilho(e, valor)
            alvo = SAIDAS[self.mapa.get(e, "nada")][1]
            if alvo == "lt":
                lt = max(lt, valor)
            elif alvo == "rt":
                rt = max(rt, valor)
            elif alvo and valor >= 64:                                # gatilho como botão: meio curso
                w |= alvo
        for e in entradas:
            if e in ("l2", "r2"):
                continue
            alvo = SAIDAS[self.mapa.get(e, "nada")][1]
            if alvo == "lt":
                lt = 255
            elif alvo == "rt":
                rt = 255
            elif alvo == GUIDE:
                # o PS (ou o que estiver no Guide) passa pelo filtro do toque/segurar
                w |= self.filtro_ps.filtrar(GUIDE, now) if e == "ps" else GUIDE
            elif alvo:
                w |= alvo
        if "ps" not in entradas or SAIDAS[self.mapa.get("ps")][1] != GUIDE:
            self.filtro_ps.filtrar(0, now)                         # soltou: zera o tempo de segurar
        esq, dir_ = (st.lx, st.ly), (st.rx, st.ry)
        if self.opcoes["trocar_analogicos"]:
            esq, dir_ = dir_, esq
        lx, ly = _stick(*esq)
        rx, ry = _stick(*dir_)
        saida = (w, lt, rt, _axis(lx), _axis(ly, not self.opcoes["inverter_y_esq"]),
                 _axis(rx), _axis(ry, not self.opcoes["inverter_y_dir"]))
        self.ultimo = {"entrada": entradas, "saida": [k for k, (_, b) in SAIDAS.items()
                                                       if isinstance(b, int) and b and w & b] +
                       (["lt"] if lt > 20 else []) + (["rt"] if rt > 20 else [])}
        return saida
