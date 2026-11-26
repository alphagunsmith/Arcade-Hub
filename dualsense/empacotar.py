"""Gera o DualSenseAuto.exe que vai junto no instalador do Arcade Hub (roda no CI, no Windows).

    python dualsense/empacotar.py

Resultado: build/dualsense/DualSenseAuto/ (o .exe e a pasta _internal), que o electron-builder
copia para resources/dualsense.

O vgamepad (controle de Xbox virtual) não é instalado com pip aqui: o setup.py dele abre o
instalador do driver ViGEmBus, o que travaria o CI. Em vez disso, o código-fonte publicado no
PyPI é baixado, conferido pelo SHA-256 que o próprio PyPI informa e usado direto. O instalador
do driver vai junto no .exe; no PC, o botão "Instalar driver Xbox" do painel o abre.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request

VGAMEPAD = "0.1.0"
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
BUILD = os.path.join(RAIZ, "build")
FONTE = os.path.join(BUILD, "py")
SAIDA = os.path.join(BUILD, "dualsense")


def baixar_vgamepad():
    info = json.loads(urllib.request.urlopen(f"https://pypi.org/pypi/vgamepad/{VGAMEPAD}/json", timeout=60).read())
    sdist = next(u for u in info["urls"] if u["packagetype"] == "sdist")
    dados = urllib.request.urlopen(sdist["url"], timeout=120).read()
    if hashlib.sha256(dados).hexdigest() != sdist["digests"]["sha256"]:
        raise SystemExit("vgamepad baixado não confere com o SHA-256 do PyPI")
    pasta = os.path.join(BUILD, "vgamepad-src")
    shutil.rmtree(pasta, ignore_errors=True)
    os.makedirs(pasta)
    arq = os.path.join(pasta, "vgamepad.tar.gz")
    with open(arq, "wb") as f:
        f.write(dados)
    with tarfile.open(arq) as t:
        t.extractall(pasta, filter="data")          # nada fora da pasta
    for raiz, dirs, arqs in os.walk(pasta):
        if os.path.basename(raiz) == "vgamepad" and "__init__.py" in arqs:
            return raiz
    raise SystemExit("pacote vgamepad não encontrado no código-fonte baixado")


def main():
    if sys.platform != "win32":
        raise SystemExit("o .exe só é gerado no Windows")
    shutil.rmtree(FONTE, ignore_errors=True)
    shutil.rmtree(SAIDA, ignore_errors=True)
    os.makedirs(FONTE)
    for nome in os.listdir(AQUI):
        if nome.endswith(".py") and nome != "empacotar.py":
            shutil.copy2(os.path.join(AQUI, nome), FONTE)
    vg = os.path.join(FONTE, "vgamepad")
    shutil.copytree(baixar_vgamepad(), vg)
    for raiz, _d, arqs in os.walk(vg):
        for a in arqs:
            print("vgamepad:", os.path.relpath(os.path.join(raiz, a), FONTE))

    sep = ";"
    dados = [(os.path.join(AQUI, "painel.html"), "."), (os.path.join(AQUI, "perfis.json"), "."),
             (os.path.join(AQUI, "LEIA-ME.md"), "."), (os.path.join(AQUI, "mods"), "mods"), (os.path.join(AQUI, "i18n"), "i18n"),
             # o vgamepad inteiro (o ViGEmClient.dll e o instalador do driver ficam ao lado do código dele)
             (os.path.join(FONTE, "vgamepad"), "vgamepad")]
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--windowed",
           "--name", "DualSenseAuto", "--icon", os.path.join(RAIZ, "assets", "icon.ico"),
           "--distpath", SAIDA, "--workpath", os.path.join(BUILD, "pyinstaller"), "--specpath", BUILD,
           "--paths", FONTE, "--collect-submodules", "vgamepad",
           "--hidden-import", "psutil", "--hidden-import", "mss",
           "--hidden-import", "armas_iw7", "--hidden-import", "armas_jogos",
           "--hidden-import", "controle", "--hidden-import", "hidhide"]
    for origem, destino in dados:
        cmd += ["--add-data", f"{origem}{sep}{destino}"]
    cmd.append(os.path.join(FONTE, "dualsense_auto.py"))
    env = dict(os.environ, PYTHONPATH=FONTE + os.pathsep + os.environ.get("PYTHONPATH", ""))
    subprocess.run(cmd, check=True, env=env)

    final = os.path.join(SAIDA, "DualSenseAuto")
    interno = os.path.join(final, "_internal")
    precisa = [os.path.join(final, "DualSenseAuto.exe"), os.path.join(interno, "painel.html"),
               os.path.join(interno, "perfis.json"), os.path.join(interno, "i18n", "runtime.js"),
               os.path.join(interno, "i18n", "ja.json"),
               os.path.join(interno, "mods", "cod_infinite_warfare", "iw7-mod", "custom_scripts", "dualsense_auto.gsc"),
               os.path.join(interno, "mods", "titanfall2", "R2Northstar", "mods", "DualSenseAuto", "mod.json"),
               os.path.join(interno, "mods", "gzdoom", "dualsense_auto", "zscript.zs"),
               os.path.join(interno, "mods", "bo2_plutonium", "scripts", "zm", "dualsense_auto.gsc")]
    for p in precisa:
        if not os.path.exists(p):
            raise SystemExit(f"faltou no pacote: {p}")
    achados = {"dll": False, "msi": False}
    for raiz, _d, arqs in os.walk(os.path.join(interno, "vgamepad")):
        for a in arqs:
            if a.lower() == "vigemclient.dll":
                achados["dll"] = True
            if a.lower().endswith(".msi"):
                achados["msi"] = True
    if not all(achados.values()):
        raise SystemExit(f"vgamepad incompleto no pacote: {achados}")
    print("DualSenseAuto pronto em", final)


if __name__ == "__main__":
    main()
