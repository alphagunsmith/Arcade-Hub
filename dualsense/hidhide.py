"""Esconde o DualSense de outros programas com o HidHide, enquanto o DualSense Auto está aberto.

Por que: a Steam (e outros programas) também leem o DualSense direto. Fora dos jogos da
Steam, ela aplica a "configuração da área de trabalho" e transforma os botões em teclas,
Enter, cliques e atalhos (o X abria o overlay da Steam e o do Discord). Com o DualSense
escondido, os outros programas só veem o controle de Xbox virtual, que o DualSense Auto
controla.

Usa o HidHideCLI.exe (HidHide, da Nefarius), que não precisa de administrador:
  --app-reg "<exe>"   o DualSense Auto continua enxergando o controle
  --dev-hide "<id>"   esconde o DualSense
  --cloak-on/off      liga/desliga o esconderijo (ao fechar o DualSense Auto, volta ao normal)
"""
import json
import os
import subprocess
import sys

IDS_DUALSENSE = ("VID_054C&PID_0CE6", "VID_054C&PID_0DF2")      # DualSense e DualSense Edge
_SEM_JANELA = 0x08000000


def achar_cli():
    if os.name != "nt":
        return None
    bases = [os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramW6432", r"C:\Program Files")]
    for b in bases:
        for sub in ("", "x64"):
            p = os.path.join(b, "Nefarius Software Solutions", "HidHide", sub, "HidHideCLI.exe")
            if os.path.isfile(p):
                return p
    return None


def _rodar(cli, *args, timeout=15):
    r = subprocess.run([cli, *args], capture_output=True, text=True, timeout=timeout,
                       creationflags=_SEM_JANELA if os.name == "nt" else 0)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def dualsenses(texto_json):
    """Saída do --dev-gaming -> caminhos de instância dos DualSense."""
    try:
        dados = json.loads(texto_json)
    except ValueError:
        return []
    out = []
    for cont in dados if isinstance(dados, list) else []:
        for d in cont.get("devices", []) if isinstance(cont, dict) else []:
            caminho = str(d.get("deviceInstancePath") or "")
            if any(i in caminho.upper() for i in IDS_DUALSENSE) and caminho not in out:
                out.append(caminho)
    return out


def exe_atual():
    """O executável deste processo (o .exe empacotado, ou o python que roda o código)."""
    return os.path.abspath(sys.executable)


class Esconderijo:
    def __init__(self):
        self.cli = achar_cli()
        self.ativo = False
        self.status = "HidHide não instalado" if not self.cli else "pronto"

    def instalado(self):
        self.cli = self.cli or achar_cli()
        return bool(self.cli)

    def esconder(self):
        """Registra o DualSense Auto, esconde os DualSense e liga o esconderijo."""
        if not self.instalado():
            self.status = "HidHide não instalado"
            return False
        try:
            _rodar(self.cli, "--app-reg", exe_atual())
            arcade = os.environ.get("DSA_ARCADE_EXE")          # o Arcade Hub navega com o controle
            if arcade and os.path.isfile(arcade):
                _rodar(self.cli, "--app-reg", os.path.abspath(arcade))
            cod, saida = _rodar(self.cli, "--dev-gaming")
            ids = dualsenses(saida[saida.find("["):] if "[" in saida else saida)
            for i in ids:
                _rodar(self.cli, "--dev-hide", i)
            cod, _ = _rodar(self.cli, "--cloak-on")
            self.ativo = cod == 0
            self.status = (f"DualSense escondido de outros programas ({len(ids)} controle(s))" if ids
                           else "Esconderijo ligado (nenhum DualSense conectado agora)") if self.ativo else "o HidHide recusou"
            return self.ativo
        except Exception as e:
            self.status = f"HidHide: {e}"
            return False

    def mostrar(self):
        """Desliga o esconderijo: o DualSense volta a aparecer para todos."""
        if not self.cli:
            return False
        try:
            cod, _ = _rodar(self.cli, "--cloak-off")
            self.ativo = False
            self.status = "DualSense visível para todos os programas"
            return cod == 0
        except Exception as e:
            self.status = f"HidHide: {e}"
            return False


# programas que também transformam o controle em teclado/mouse ou em outro controle
CONFLITOS = {
    "ds4windows.exe": "DS4Windows", "dsx.exe": "DSX", "dualsensex.exe": "DSX", "rewasd.exe": "reWASD",
    "rewasdengine.exe": "reWASD", "joytokey.exe": "JoyToKey", "antimicrox.exe": "AntiMicroX", "antimicro.exe": "AntiMicro",
    "inputmapper.exe": "InputMapper", "x360ce.exe": "x360ce", "xpadder.exe": "Xpadder", "padstick.exe": "PadStick",
    "gopher360.exe": "Gopher360", "controllercompanion.exe": "Controller Companion",
}


def conflitos(nomes_processos):
    """Nomes dos processos abertos -> programas que brigam pelo controle."""
    vistos = []
    for n in nomes_processos:
        p = CONFLITOS.get((n or "").lower())
        if p and p not in vistos:
            vistos.append(p)
    return vistos
