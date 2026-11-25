"""Fontes de dados exatos vindos de mods de jogos.

1) FonteDSX: servidor UDP compatível com o protocolo do DSX (DualSenseX).
   Qualquer mod feito para o DSX passa a funcionar com este app — por exemplo
   o "DualSense Adaptive Trigger Effects" do Cyberpunk 2077 (Nexus Mods #4156),
   e também mods de RDR2, GTA V, Resident Evil, Fallout 4, Skyrim, Forza, Assetto Corsa...

2) FonteArquivo: lê, em tempo real, um arquivo de eventos escrito por um mod
   (usado pelo nosso mod de Call of Duty: Infinite Warfare via iw7-mod).
"""
import json
import os
import socket
import threading
import time

from ds_hid import Trig, clamp

PORTA_DSX = 6969


# ----------------------------------------------------------------------------
# Modos de gatilho do DSX -> efeitos nativos do DualSense
# ----------------------------------------------------------------------------
def _i(args, n, padrao=0):
    try:
        return int(float(args[n]))
    except (IndexError, TypeError, ValueError):
        return padrao


def _zonas_alternadas(forca):
    return Trig.feedback_zones([forca if i % 2 else 0 for i in range(10)])


def dsx_para_trig(modo, args):
    """Converte (TriggerMode do DSX, parâmetros) no efeito de 11 bytes do DualSense."""
    m = _i([modo], 0, 0)
    a = list(args)
    if m == 0 or m == 19:                     # Normal / OFF
        return Trig.off()
    if m == 1:                                # GameCube: clique no fim do curso
        return Trig.weapon(7, 8, 8)
    fixos = {2: 1, 3: 2, 10: 4, 4: 5, 5: 6, 6: 7, 7: 8}  # VerySoft..Rigid
    if m in fixos:
        return Trig.feedback(0, fixos[m])
    if m == 8:                                # VibrateTrigger [frequência]
        return Trig.vibration(0, 8, _i(a, 0, 40) or 40)
    if m == 9:                                # Choppy
        return _zonas_alternadas(6)
    if m == 11:                               # VibrateTriggerPulse
        return Trig.vibration(0, 6, 10)
    if m == 12:                               # CustomTriggerValue [modo, f1..f7] (aproximação)
        sub, f1, f2 = _i(a, 0), _i(a, 1), _i(a, 2)
        ini = clamp(f1 * 10 // 256, 0, 9)
        forca = clamp(max(1, f2 * 8 // 255), 1, 8)
        if 1 <= sub <= 4:
            return Trig.feedback(ini, forca)
        if 5 <= sub <= 8:
            return Trig.weapon(max(2, ini), min(8, max(ini + 2, 4)), forca)
        if sub >= 9:
            return Trig.vibration(ini, forca, max(5, _i(a, 3, 30)))
        return Trig.off()
    if m == 13:                               # Resistance [início 0-9, força 0-8]
        return Trig.feedback(_i(a, 0), _i(a, 1))
    if m == 14:                               # Bow [início, fim, força, tranco]
        return Trig.bow(_i(a, 0), _i(a, 1), _i(a, 2), _i(a, 3, 1))
    if m == 15:                               # Galloping [início, fim, pé1, pé2, freq]
        return Trig.vibration(_i(a, 0), 6, max(1, _i(a, 4, 5)))
    if m in (16, 21):                         # SemiAutomaticGun / WEAPON [início, fim, força]
        return Trig.weapon(_i(a, 0, 2), _i(a, 1, 5), _i(a, 2, 8))
    if m == 17:                               # AutomaticGun [início, força, freq]
        return Trig.vibration(_i(a, 0), _i(a, 1, 8), _i(a, 2, 10))
    if m == 18:                               # Machine [início, fim, fA, fB, freq, período]
        return Trig.vibration(_i(a, 0), max(_i(a, 2), _i(a, 3)), max(1, _i(a, 4, 10)))
    if m == 20:                               # FEEDBACK [posição, força]
        return Trig.feedback(_i(a, 0), _i(a, 1))
    if m == 22:                               # VIBRATION [posição, amplitude, freq]
        return Trig.vibration(_i(a, 0), _i(a, 1), _i(a, 2, 20))
    if m == 23:                               # SLOPE_FEEDBACK [início, fim, f0, f1]
        return Trig.slope(_i(a, 0), _i(a, 1, 9), _i(a, 2), _i(a, 3))
    if m == 24:                               # MULTIPLE_POSITION_FEEDBACK [10 forças]
        return Trig.feedback_zones([_i(a, k) for k in range(10)])
    if m == 25:                               # MULTIPLE_POSITION_VIBRATION [freq, 10 amplitudes]
        amps = [_i(a, k + 1) for k in range(10)]
        ini = next((k for k, v in enumerate(amps) if v > 0), 0)
        return Trig.vibration(ini, max(amps) if amps else 0, _i(a, 0, 20))
    if m == 26:                               # VIBRATE_TRIGGER_10Hz
        return Trig.vibration(0, 8, 10)
    return Trig.off()


class FonteDSX:
    """Recebe os comandos dos mods (JSON por UDP) e guarda o estado pedido."""

    def __init__(self, porta=PORTA_DSX):
        self.porta = porta
        self.lock = threading.Lock()
        self.left = None      # efeito pedido pelo mod para L2 (None = mod não está controlando)
        self.right = None
        self.rgb = None
        self.rumble = (0, 0)
        self.t_rumble = 0.0
        self.t_ultimo = 0.0
        self.pacotes = 0
        self.status = "Receptor de mods: iniciando"
        self.sock = None

    def ativo(self, max_idade=600):
        return self.pacotes > 0 and time.time() - self.t_ultimo < max_idade and \
            (self.left is not None or self.right is not None)

    def limpar(self):
        with self.lock:
            self.left = self.right = self.rgb = None

    def processar(self, dados):
        try:
            pkt = json.loads(dados.decode("utf-8", "replace"))
        except Exception:
            return False
        inst = pkt.get("instructions") or pkt.get("Instructions") or []
        with self.lock:
            for it in inst:
                tipo = _i([it.get("type", it.get("Type", 0))], 0)
                p = it.get("parameters") or it.get("Parameters") or []
                if tipo == 1 and len(p) >= 3:                 # TriggerUpdate [ctrl, gatilho, modo, ...]
                    efeito = dsx_para_trig(p[2], p[3:])
                    if _i(p, 1) == 1:
                        self.left = efeito
                    elif _i(p, 1) == 2:
                        self.right = efeito
                elif tipo == 2 and len(p) >= 4:               # RGBUpdate [ctrl, r, g, b]
                    self.rgb = (clamp(_i(p, 1), 0, 255), clamp(_i(p, 2), 0, 255), clamp(_i(p, 3), 0, 255))
                elif tipo == 5 and len(p) >= 3:               # Rumble [ctrl, leve, pesado]
                    self.rumble = (clamp(_i(p, 2), 0, 255), clamp(_i(p, 1), 0, 255))
                    self.t_rumble = time.time()
                elif tipo == 7:                               # ResetToUserSettings
                    self.left = self.right = self.rgb = None
            self.t_ultimo = time.time()
            self.pacotes += 1
        return True

    @staticmethod
    def resposta():
        return json.dumps({
            "Status": "DSX Received UDP Instructions",
            "TimeReceived": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "isControllerConnected": True,
            "BatteryLevel": 100,
            "Devices": [{"Index": 0, "MacAddress": "", "DeviceType": 0, "ConnectionType": 0,
                         "BatteryLevel": 100, "IsSupportAT": True, "IsSupportLightBar": True,
                         "IsSupportPlayerLED": True, "IsSupportMicLED": True}],
        }).encode()

    def loop(self, stop):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.bind(("127.0.0.1", self.porta))
            s.settimeout(0.5)
            self.sock = s
            self.status = f"Receptor de mods (protocolo DSX) ouvindo na porta {self.porta}"
        except OSError as e:
            self.status = (f"Receptor de mods: porta {self.porta} ocupada ({e}). "
                           "Feche o DSX se estiver aberto.")
            return
        while not stop.is_set():
            try:
                dados, end = s.recvfrom(65535)
            except socket.timeout:
                continue
            except OSError:
                continue
            if self.processar(dados):
                try:
                    s.sendto(self.resposta(), end)
                except OSError:
                    pass
        s.close()

    def start(self, stop):
        threading.Thread(target=self.loop, args=(stop,), daemon=True).start()


# ----------------------------------------------------------------------------
# Arquivo de eventos escrito por um mod (CoD Infinite Warfare)
# ----------------------------------------------------------------------------
CLASSE_IW7 = {"rifle": "fuzil", "smg": "smg", "mg": "metralhadora", "spread": "escopeta",
              "sniper": "sniper", "pistol": "pistola", "rocketlauncher": "lancador",
              "grenade": "granada", "beam": "energia", "melee": "corpo_a_corpo",
              "item": "nenhuma", "none": "nenhuma"}


class FonteArquivo:
    def __init__(self, jogo, exes, relativo):
        self.jogo = jogo
        self.exes = {e.lower() for e in exes}
        self.relativo = relativo
        self.caminho = None
        self.pos = 0
        self.t_ultimo = 0.0
        self.status = ""

    def serve(self, exe):
        return (exe or "").lower() in self.exes

    def ativo(self, max_idade=900):
        return self.t_ultimo > 0 and time.time() - self.t_ultimo < max_idade

    def ler(self, pasta_jogo):
        """Devolve as linhas novas do arquivo de eventos."""
        if not pasta_jogo:
            return []
        caminho = os.path.join(pasta_jogo, self.relativo)
        if caminho != self.caminho:
            self.caminho = caminho
            try:
                self.pos = os.path.getsize(caminho)  # ignora eventos antigos
            except OSError:
                self.pos = 0
        try:
            tam = os.path.getsize(caminho)
        except OSError:
            self.status = f"{self.jogo}: aguardando o mod ({self.relativo})"
            return []
        if tam < self.pos:      # arquivo recriado
            self.pos = 0
        if tam == self.pos:
            return []
        try:
            with open(caminho, "rb") as f:
                f.seek(self.pos)
                bruto = f.read(tam - self.pos)
        except OSError:
            return []
        fim = bruto.rfind(b"\n")
        if fim < 0:
            return []
        self.pos += fim + 1
        self.t_ultimo = time.time()
        self.status = f"{self.jogo}: recebendo dados do mod"
        return [ln.strip() for ln in bruto[:fim].decode("utf-8", "replace").split("\n") if ln.strip()]


def evento_iw7(linha):
    """'1234|tiro' -> ('tiro', []) ; '1234|arma|iw7_ar57_mp|rifle|0.08|30' -> ('arma', [...])."""
    partes = linha.split("|")
    if len(partes) >= 2 and partes[0].lstrip("-").isdigit():
        partes = partes[1:]
    return partes[0], partes[1:]


def perfil_iw7(nome, classe, firetime, clip):
    """Monta os dados da arma a partir do que o próprio jogo informa."""
    tipo = CLASSE_IW7.get((classe or "").lower(), "fuzil")
    try:
        ft = float(firetime)
    except ValueError:
        ft = 0.0
    rpm = int(round(60.0 / ft)) if ft > 0.001 else 0
    automatica = tipo in ("smg", "metralhadora", "energia") or (tipo == "fuzil" and 0 < ft < 0.13)
    return tipo, rpm, automatica
