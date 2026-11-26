"""Controle de Xbox 360 virtual (ViGEmBus + vgamepad).

O jogo enxerga um controle de Xbox. Tudo que você aperta no DualSense é repassado para ele,
e a vibração que o jogo manda para o "Xbox" é capturada e usada no DualSense."""
import glob
import os
import time

from ds_hid import clamp

# Botões XInput
UP, DOWN, LEFT, RIGHT = 0x0001, 0x0002, 0x0004, 0x0008
START, BACK, LTHUMB, RTHUMB = 0x0010, 0x0020, 0x0040, 0x0080
LB, RB, GUIDE = 0x0100, 0x0200, 0x0400
A, B, X, Y = 0x1000, 0x2000, 0x4000, 0x8000

HAT = {0: UP, 1: UP | RIGHT, 2: RIGHT, 3: DOWN | RIGHT, 4: DOWN, 5: DOWN | LEFT, 6: LEFT, 7: UP | LEFT}


def _axis(v, invert=False):
    a = (v - 128) * 256
    if invert:
        a = -a - 1
    return int(clamp(a, -32768, 32767))


ZONA_MORTA = 0.10     # analógico parado com um pouco de folga não mexe nada (nem setas no Windows)


def _stick(x, y, zona=ZONA_MORTA):
    """Zona morta radial: abaixo dela, centro exato; acima, reescala para não perder o curso."""
    fx, fy = (x - 128) / 127.5, (y - 128) / 127.5
    mag = (fx * fx + fy * fy) ** 0.5
    if mag < zona:
        return 128, 128
    k = ((mag - zona) / (1 - zona)) / mag
    return (max(0, min(255, int(round(128 + fx * k * 127.5)))),
            max(0, min(255, int(round(128 + fy * k * 127.5)))))


def to_xusb(st):
    """PadState do DualSense -> (botões, LT, RT, LX, LY, RX, RY) do Xbox."""
    b0, b1, b2 = st.b0, st.b1, st.b2
    w = HAT.get(b0 & 0x0F, 0)
    if b0 & 0x10: w |= X   # quadrado
    if b0 & 0x20: w |= A   # xis
    if b0 & 0x40: w |= B   # círculo
    if b0 & 0x80: w |= Y   # triângulo
    if b1 & 0x01: w |= LB
    if b1 & 0x02: w |= RB
    if b1 & 0x10: w |= BACK    # Create
    if b1 & 0x20: w |= START   # Options
    if b1 & 0x40: w |= LTHUMB
    if b1 & 0x80: w |= RTHUMB
    if b2 & 0x01: w |= GUIDE   # PS
    if b2 & 0x02: w |= BACK    # touchpad
    lx, ly = _stick(st.lx, st.ly)
    rx, ry = _stick(st.rx, st.ry)
    return (w, st.l2, st.r2, _axis(lx), _axis(ly, True), _axis(rx), _axis(ry, True))


class FiltroBotaoPS:
    """O botão PS vira o Guide do Xbox, e o Guide abre o overlay da Steam, a Xbox Game Bar e
    (pelos atalhos da Steam) o do Discord. Para isso não acontecer sem querer:
      "segurar" (padrão): toque rápido no PS não faz nada; segurando 0,8 s vira um Guide;
      "guide":  sempre manda o Guide;
      "nada":   nunca manda."""
    SEGURAR_S = 0.8
    PULSO_S = 0.25

    def __init__(self, modo="segurar"):
        self.modo = modo
        self.desde = None
        self.enviado_em = None

    def filtrar(self, w, now):
        apertado = bool(w & GUIDE)
        w &= ~GUIDE
        if self.modo == "guide":
            return w | GUIDE if apertado else w
        if self.modo != "segurar" or not apertado:
            self.desde = self.enviado_em = None
            return w
        if self.desde is None:
            self.desde = now
        if self.enviado_em is None and now - self.desde >= self.SEGURAR_S:
            self.enviado_em = now
        if self.enviado_em is not None and now - self.enviado_em < self.PULSO_S:
            return w | GUIDE
        return w


def vigem_installer():
    try:
        import vgamepad
        base = os.path.dirname(vgamepad.__file__)
        m = glob.glob(os.path.join(base, "win", "vigem", "install", "x64", "*.msi"))
        return m[0] if m else None
    except Exception:
        return None


class XboxVirtual:
    def __init__(self):
        self.pad = None
        self.status = "desligado"
        self.filtro_ps = FiltroBotaoPS()
        self.big = 0      # motor pesado pedido pelo jogo (0-255)
        self.small = 0    # motor leve pedido pelo jogo
        self.rumble_t = 0.0
        self.big_prev = 0
        self.spike_t = 0.0  # último "tranco" súbito vindo do jogo

    def start(self):
        if self.pad:
            return True
        try:
            import vgamepad as vg
        except Exception as e:
            self.status = f"vgamepad não instalado ({e})"
            return False
        try:
            self.pad = vg.VX360Gamepad()
        except Exception as e:
            self.pad = None
            self.status = ("Driver ViGEmBus não encontrado. Instale-o (botão 'Instalar driver Xbox') "
                           f"e reinicie o PC. Detalhe: {e}")
            return False

        def cb(client, target, large_motor, small_motor, led_number, user_data):
            now = time.time()
            if large_motor - self.big > 90 or small_motor - self.small > 90:
                self.spike_t = now
            self.big, self.small, self.rumble_t = large_motor, small_motor, now

        try:
            self.pad.register_notification(callback_function=cb)
        except Exception:
            pass
        self._cb = cb
        self.status = "Controle de Xbox virtual ativo"
        return True

    def stop(self):
        if self.pad:
            try:
                self.pad.reset()
                self.pad.update()
                self.pad.unregister_notification()
            except Exception:
                pass
        self.pad = None
        self.status = "desligado"

    def update(self, st):
        p = self.pad
        if not p:
            return
        w, lt, rt, lx, ly, rx, ry = to_xusb(st)
        w = self.filtro_ps.filtrar(w, time.time())
        r = p.report
        r.wButtons = w
        r.bLeftTrigger = lt - 256 if lt > 127 else lt   # campo é c_byte (com sinal)
        r.bRightTrigger = rt - 256 if rt > 127 else rt
        r.sThumbLX, r.sThumbLY, r.sThumbRX, r.sThumbRY = lx, ly, rx, ry
        try:
            p.update()
        except Exception as e:
            self.status = f"erro no Xbox virtual: {e}"

    def game_rumble(self, now):
        """Vibração que o jogo está pedindo agora (some se o jogo parar de mandar por 2 s)."""
        if now - self.rumble_t > 2.0:
            return 0, 0
        return self.big, self.small
