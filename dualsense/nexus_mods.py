"""Baixar e instalar mods do Nexus Mods direto pelo app.

Regras do Nexus que este módulo segue:
- usa a SUA chave pessoal da API (permitida para uso pessoal);
- conta Premium: o download sai direto pela API;
- conta grátis: o Nexus exige que você clique em "Slow download" no site. O app abre a página
  certa, recebe o link nxm:// gerado pelo clique e continua o download e a instalação sozinho.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zipfile

from caminhos import DADOS as APP_DIR, RECURSOS  # noqa: E402
DOWNLOADS = os.path.join(APP_DIR, "downloads")
INSTALADOS_FILE = os.path.join(APP_DIR, "mods_instalados.json")
BACKUP_DIR = os.path.join(APP_DIR, "backup_mods")
API = "https://api.nexusmods.com/v1"
VERSAO_APP = "2.2"

# ----------------------------------------------------------------------------
# Jogos e catálogo de mods de DualSense
# ----------------------------------------------------------------------------
JOGOS = {
    "cyberpunk2077": {"nome": "Cyberpunk 2077", "pastas": ["Cyberpunk 2077"],
                      "raizes": ["bin", "r6", "red4ext", "archive", "engine", "mods", "tools"]},
    "iw7": {"nome": "Call of Duty: Infinite Warfare",
            "pastas": ["Call of Duty Infinite Warfare", "Call of Duty - Infinite Warfare"]},
    "titanfall2": {"nome": "Titanfall 2", "pastas": ["Titanfall2", "Titanfall 2"]},
    "gzdoom": {"nome": "Doom (GZDoom)", "pastas": ["GZDoom", "gzdoom"]},
    "bo2": {"nome": "Call of Duty: Black Ops II (Plutonium)", "pastas": [],
            "pasta_fixa": os.path.join("$LOCALAPPDATA", "Plutonium", "storage", "t6")},
    "reddeadredemption2": {"nome": "Red Dead Redemption 2", "pastas": ["Red Dead Redemption 2"]},
    "fallout4": {"nome": "Fallout 4", "pastas": ["Fallout 4"]},
    "skyrimspecialedition": {"nome": "Skyrim Special Edition", "pastas": ["Skyrim Special Edition"]},
    "residentevil42023": {"nome": "Resident Evil 4 (2023)", "pastas": ["RESIDENT EVIL 4  BIOHAZARD RE4"]},
    "residentevilrequiem": {"nome": "Resident Evil Requiem", "pastas": []},
    "control": {"nome": "Control", "pastas": ["Control"]},
    "riseofthetombraider": {"nome": "Rise of the Tomb Raider", "pastas": ["Rise of the Tomb Raider"]},
}

# instalar: "raiz" = extrai e copia para a pasta do jogo; "local" = arquivos que vêm com o app;
#           "manual" = só baixa (cada mod tem um jeito próprio de instalar).
CATALOGO = [
    {"id": "cp_dualsense", "dominio": "cyberpunk2077", "mod": 4156, "instalar": "raiz",
     "nome": "DualSense Adaptive Trigger Effects",
     "desc": "Mais de 60 efeitos feitos à mão para armas e veículos, troca de marcha, batidas e pneu furado. "
             "Conversa com o app pelo protocolo do DSX (porta 6969).",
     "requisitos": ["cp_red4ext", "cp_cet", "cp_redscript", "cp_nsui"], "destaque": True},
    {"id": "cp_red4ext", "dominio": "cyberpunk2077", "mod": 2380, "instalar": "raiz", "nome": "RED4ext",
     "desc": "Extensor de scripts, exigido pelo Cyber Engine Tweaks.", "requisito": True},
    {"id": "cp_cet", "dominio": "cyberpunk2077", "mod": 107, "instalar": "raiz", "nome": "Cyber Engine Tweaks",
     "desc": "Base de scripts usada pelo mod de gatilhos.", "requisito": True},
    {"id": "cp_redscript", "dominio": "cyberpunk2077", "mod": 1511, "instalar": "raiz", "nome": "redscript",
     "desc": "Compilador de scripts do jogo.", "requisito": True},
    {"id": "cp_nsui", "dominio": "cyberpunk2077", "mod": 3518, "instalar": "raiz", "nome": "Native Settings UI",
     "desc": "Menu de configurações dos mods dentro do jogo.", "requisito": True},
    {"id": "iw7_dualsense", "dominio": "iw7", "mod": 0, "instalar": "local", "nome": "Ponte DualSense Auto (nosso)",
     "desc": "Script para o iw7-mod: arma, cadência real, cada tiro e direção exata do dano. "
             "Precisa do iw7-mod instalado na pasta do jogo.",
     "pagina": "https://github.com/auroramod/iw7-mod", "destaque": True},
    {"id": "tf2_dualsense", "dominio": "titanfall2", "mod": 0, "instalar": "local", "origem": "titanfall2",
     "nome": "Ponte DualSense Auto (nosso)",
     "desc": "Mod do Northstar: cada arma de piloto e de titã com a sua configuração, cada tiro, pente e dano. "
             "Precisa do Northstar instalado na pasta do jogo. Abra o jogo pelo NorthstarLauncher.exe.",
     "confere": "NorthstarLauncher.exe", "falta": "Falta o Northstar nesta pasta (northstar.tf)",
     "pagina": "https://northstar.tf", "destaque": True},
    {"id": "gzdoom_dualsense", "dominio": "gzdoom", "mod": 0, "instalar": "local", "origem": "gzdoom",
     "nome": "Ponte DualSense Auto (nosso)",
     "desc": "Doom, Doom II, Final Doom, SIGIL, Doom 64 para GZDoom e WADs: cada arma com a sua configuração, "
             "cada tiro e a direção do dano. Informe a pasta do GZDoom e abra pelo \"Doom com DualSense.bat\".",
     "confere": "gzdoom.exe", "falta": "Não achei o gzdoom.exe nesta pasta",
     "pagina": "https://zdoom.org/downloads", "destaque": True},
    {"id": "bo2_dualsense", "dominio": "bo2", "mod": 0, "instalar": "local", "origem": "bo2_plutonium",
     "nome": "Ponte DualSense Auto (nosso)",
     "desc": "Script para o Plutonium (multiplayer e zumbis): cada arma com a sua configuração, inclusive as melhoradas, "
             "cada tiro, pente e direção do dano. Precisa do plugin t6-gsc-utils na pasta Plutonium/plugins.",
     "confere": os.path.join("..", "..", "plugins", "t6-gsc-utils.dll"),
     "falta": "Falta o plugin t6-gsc-utils.dll em Plutonium/plugins (página do t6-gsc-utils)",
     "pagina": "https://github.com/fedddddd/t6-gsc-utils", "destaque": True},
    {"id": "rdr2_dsx", "dominio": "reddeadredemption2", "mod": 2187, "instalar": "manual",
     "nome": "RDR2 DualSense 2.0 - DSX",
     "desc": "Gatilhos para armas, arco, laço, pesca e corpo a corpo; luz mostra vida e dead eye. "
             "Precisa do ScriptHookRDR2 (site dev-c.com)."},
    {"id": "fo4_dsx", "dominio": "fallout4", "mod": 62113, "instalar": "manual",
     "nome": "DualSense Adaptive Triggers (DSX)", "desc": "Gatilhos por tipo de arma, configuráveis. Precisa do F4SE."},
    {"id": "skyrim_dsx", "dominio": "skyrimspecialedition", "mod": 66165, "instalar": "manual",
     "nome": "Dual Sense Adaptive Trigger Mod", "desc": "Gatilhos conforme o tipo de arma. Precisa do SKSE."},
    {"id": "re4_dsx", "dominio": "residentevil42023", "mod": 5813, "instalar": "manual",
     "nome": "Immersive DualSense Adaptive Triggers (DSX)", "desc": "Cada arma com gatilho próprio. Precisa do REFramework."},
    {"id": "re9_dsx", "dominio": "residentevilrequiem", "mod": 42, "instalar": "manual",
     "nome": "Immersive DualSense Adaptive Triggers (DSX)", "desc": "Versão legítima do autor para RE Requiem."},
    {"id": "control_dsx", "dominio": "control", "mod": 108, "instalar": "manual",
     "nome": "DualSense Adaptive Triggers", "desc": "Um ajuste para cada forma da Service Weapon."},
    {"id": "rottr_dsx", "dominio": "riseofthetombraider", "mod": 240, "instalar": "manual",
     "nome": "DualSense Adaptive Triggers", "desc": "Resistência muda com a arma equipada."},
]


def pagina_mod(dominio, mod_id):
    return f"https://www.nexusmods.com/{dominio}/mods/{mod_id}"


def parse_link_nexus(url):
    """'https://www.nexusmods.com/cyberpunk2077/mods/4156?tab=files' -> ('cyberpunk2077', 4156)."""
    m = re.search(r"nexusmods\.com/([a-z0-9_]+)/mods/(\d+)", url or "", re.I)
    return (m.group(1).lower(), int(m.group(2))) if m else None


def parse_nxm(url):
    """nxm://cyberpunk2077/mods/4156/files/12345?key=..&expires=..&user_id=.."""
    u = urllib.parse.urlparse(url or "")
    if u.scheme.lower() != "nxm":
        return None
    partes = [p for p in u.path.split("/") if p]
    try:
        i = partes.index("mods")
        mod_id = int(partes[i + 1])
        file_id = int(partes[partes.index("files") + 1])
    except (ValueError, IndexError):
        return None
    q = urllib.parse.parse_qs(u.query)
    return {"dominio": u.netloc.lower(), "mod": mod_id, "file_id": file_id,
            "key": q.get("key", [None])[0], "expires": q.get("expires", [None])[0]}


# ----------------------------------------------------------------------------
# API
# ----------------------------------------------------------------------------
class NexusAPI:
    def __init__(self, chave):
        self.chave = chave

    def _get(self, caminho, params=None):
        url = API + caminho + ("?" + urllib.parse.urlencode(params) if params else "")
        req = urllib.request.Request(url, headers={
            "apikey": self.chave, "Accept": "application/json",
            "Application-Name": "DualSense Auto", "Application-Version": VERSAO_APP,
            "User-Agent": f"DualSenseAuto/{VERSAO_APP}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("message", "")
            except Exception:
                msg = ""
            if e.code == 401:
                raise RuntimeError("Chave do Nexus inválida") from None
            if e.code == 403 and "premium" in msg.lower():
                raise RuntimeError("PREMIUM") from None
            if e.code == 429:
                raise RuntimeError("Limite de pedidos do Nexus atingido; tente em alguns minutos") from None
            raise RuntimeError(f"Nexus respondeu {e.code}: {msg}") from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"Sem conexão com o Nexus ({e.reason})") from None

    def validar(self):
        d = self._get("/users/validate.json")
        return {"nome": d.get("name"), "premium": bool(d.get("is_premium") or d.get("is_premium?"))}

    def mod(self, dominio, mod_id):
        return self._get(f"/games/{dominio}/mods/{mod_id}.json")

    def arquivos(self, dominio, mod_id):
        return self._get(f"/games/{dominio}/mods/{mod_id}/files.json").get("files", [])

    def link(self, dominio, mod_id, file_id, key=None, expires=None):
        params = {"key": key, "expires": expires} if key and expires else None
        d = self._get(f"/games/{dominio}/mods/{mod_id}/files/{file_id}/download_link.json", params)
        if not d:
            raise RuntimeError("O Nexus não devolveu link de download")
        return d[0]["URI"]


def escolher_arquivo(arquivos):
    """Arquivo principal mais recente."""
    principais = [f for f in arquivos if (f.get("category_name") or "").upper() == "MAIN"]
    lista = principais or [f for f in arquivos if (f.get("category_name") or "").upper() not in ("OLD_VERSION", "ARCHIVED", "DELETED")]
    if not lista:
        return None
    return max(lista, key=lambda f: f.get("uploaded_timestamp", 0))


# ----------------------------------------------------------------------------
# Pastas dos jogos (Steam)
# ----------------------------------------------------------------------------
def bibliotecas_steam():
    pastas = []
    steam = None
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
                steam = winreg.QueryValueEx(k, "SteamPath")[0]
        except OSError:
            pass
    for cand in [steam, r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"]:
        if cand and os.path.isdir(cand):
            pastas.append(cand)
            vdf = os.path.join(cand, "steamapps", "libraryfolders.vdf")
            try:
                txt = open(vdf, encoding="utf-8", errors="ignore").read()
                for p in re.findall(r'"path"\s+"(.+?)"', txt):
                    pastas.append(p.replace("\\\\", "\\"))
            except OSError:
                pass
            break
    vistos, out = set(), []
    for p in pastas:
        n = os.path.normcase(os.path.abspath(p))
        if n not in vistos:
            vistos.add(n)
            out.append(p)
    return out


def _normal(t):
    return re.sub(r"[^a-z0-9]", "", (t or "").lower())


def achar_pasta_jogo(dominio):
    info = JOGOS.get(dominio, {})
    if info.get("pasta_fixa"):               # ex.: o Plutonium guarda os scripts em %LOCALAPPDATA%
        p = os.path.expandvars(info["pasta_fixa"])
        return p if os.path.isdir(os.path.dirname(p)) else None
    for lib in bibliotecas_steam():
        for nome in info.get("pastas", []):
            p = os.path.join(lib, "steamapps", "common", nome)
            if os.path.isdir(p):
                return p
    # jogos da biblioteca do Arcade Hub: qualquer loja ou pasta, pelo nome do jogo ou da pasta
    from caminhos import jogos_do_arcade
    alvos = {_normal(n) for n in [info.get("nome", "")] + list(info.get("pastas", [])) if _normal(n)}
    if not alvos:
        return None
    for j in jogos_do_arcade():
        if _normal(j["nome"]) in alvos or _normal(os.path.basename(j["pasta"].rstrip("\\/"))) in alvos:
            return j["pasta"]
    return None


# ----------------------------------------------------------------------------
# Arquivos: extrair e copiar com backup
# ----------------------------------------------------------------------------
def extrair(arquivo, destino):
    os.makedirs(destino, exist_ok=True)
    if zipfile.is_zipfile(arquivo):
        base = os.path.realpath(destino)
        with zipfile.ZipFile(arquivo) as z:
            for nome in z.namelist():
                alvo = os.path.realpath(os.path.join(destino, nome))
                if not (alvo == base or alvo.startswith(base + os.sep)):
                    raise RuntimeError("Arquivo do mod com caminho inválido; instalação cancelada")
            z.extractall(destino)
        return
    tar = shutil.which("tar")   # o tar do Windows 10/11 abre .7z e .rar
    if not tar:
        raise RuntimeError("Não consigo abrir este formato. Extraia o arquivo manualmente.")
    flags = 0x08000000 if sys.platform == "win32" else 0  # sem janela preta
    r = subprocess.run([tar, "-xf", arquivo, "-C", destino], capture_output=True, creationflags=flags)
    if r.returncode != 0:
        raise RuntimeError("Não consegui extrair este arquivo (.7z/.rar). Extraia manualmente pela pasta de downloads.")


def achar_raiz(pasta, raizes=None):
    """Tira pastas 'embrulho' e acha onde começam as pastas do jogo (bin, r6...)."""
    atual = pasta
    while True:
        itens = [i for i in os.listdir(atual) if not i.startswith("__MACOSX")]
        if len(itens) == 1 and os.path.isdir(os.path.join(atual, itens[0])) and \
                not (raizes and itens[0].lower() in raizes):
            atual = os.path.join(atual, itens[0])
        else:
            break
    if raizes:
        for root, dirs, _ in os.walk(atual):
            if root[len(atual):].count(os.sep) > 3:
                continue
            if any(d.lower() in raizes for d in dirs):
                return root
    return atual


def copiar_para_jogo(origem, pasta_jogo, chave_mod):
    escritos = []
    for root, _, files in os.walk(origem):
        for f in files:
            src = os.path.join(root, f)
            rel = os.path.relpath(src, origem)
            dst = os.path.join(pasta_jogo, rel)
            if os.path.exists(dst):
                bk = os.path.join(BACKUP_DIR, chave_mod, rel)
                if not os.path.exists(bk):
                    os.makedirs(os.path.dirname(bk), exist_ok=True)
                    shutil.copy2(dst, bk)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            escritos.append(rel)
    return escritos


def remover_do_jogo(pasta_jogo, escritos, chave_mod):
    base = os.path.realpath(pasta_jogo)
    for rel in escritos:
        dst = os.path.realpath(os.path.join(pasta_jogo, rel))
        if not dst.startswith(base + os.sep):
            continue
        bk = os.path.join(BACKUP_DIR, chave_mod, rel)
        try:
            if os.path.exists(bk):
                shutil.copy2(bk, dst)          # devolve o arquivo original do jogo
            elif os.path.exists(dst):
                os.remove(dst)
        except OSError:
            pass
        d = os.path.dirname(dst)               # apaga pastas que ficaram vazias
        while d.startswith(base + os.sep) and os.path.isdir(d) and not os.listdir(d):
            os.rmdir(d)
            d = os.path.dirname(d)
    shutil.rmtree(os.path.join(BACKUP_DIR, chave_mod), ignore_errors=True)


def baixar(url, destino, progresso=None):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": f"DualSenseAuto/{VERSAO_APP}"})
    with urllib.request.urlopen(req, timeout=60) as r, open(destino + ".parcial", "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        feito = 0
        while True:
            bloco = r.read(262144)
            if not bloco:
                break
            f.write(bloco)
            feito += len(bloco)
            if progresso and total:
                progresso(feito / total)
    os.replace(destino + ".parcial", destino)
    return destino


# ----------------------------------------------------------------------------
# Gerenciador
# ----------------------------------------------------------------------------
class GerenciadorMods:
    def __init__(self, cfg, salvar_cfg):
        self.cfg = cfg
        self.salvar_cfg = salvar_cfg
        self.lock = threading.Lock()
        self.catalogo = {c["id"]: dict(c) for c in CATALOGO}
        for x in cfg.get("mods_extras", []):
            self.catalogo[x["id"]] = x
        self.tarefas = {}
        self.esperando_nxm = {}      # (dominio, mod) -> [Event, dados]
        self.conta = {"nome": None, "premium": False, "erro": None}
        try:
            with open(INSTALADOS_FILE, encoding="utf-8") as f:
                self.instalados = json.load(f)
        except Exception:
            self.instalados = {}
        self.api_factory = NexusAPI

    # ---------- utilidades
    def api(self):
        chave = self.cfg.get("nexus_key")
        if not chave:
            raise RuntimeError("Coloque sua chave do Nexus Mods primeiro")
        return self.api_factory(chave)

    def _salvar_instalados(self):
        tmp = INSTALADOS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.instalados, f, ensure_ascii=False, indent=2)
        os.replace(tmp, INSTALADOS_FILE)

    def tarefa(self, cid, estado, progresso=None, erro=False):
        with self.lock:
            self.tarefas[cid] = {"estado": estado, "progresso": progresso, "erro": erro, "t": time.time()}

    def pasta_jogo(self, dominio):
        p = (self.cfg.get("pastas_jogos") or {}).get(dominio)
        return p if p and os.path.isdir(p) else achar_pasta_jogo(dominio)

    def definir_pasta(self, dominio, pasta):
        pasta = (pasta or "").strip().strip('"')
        if pasta and not os.path.isdir(pasta):
            raise RuntimeError("Essa pasta não existe")
        pj = dict(self.cfg.get("pastas_jogos") or {})
        if pasta:
            pj[dominio] = pasta
        else:
            pj.pop(dominio, None)
        self.cfg["pastas_jogos"] = pj
        self.salvar_cfg()

    def definir_chave(self, chave):
        self.cfg["nexus_key"] = (chave or "").strip()
        self.salvar_cfg()
        return self.verificar_conta()

    def verificar_conta(self):
        if not self.cfg.get("nexus_key"):
            self.conta = {"nome": None, "premium": False, "erro": None}
            return self.conta
        try:
            v = self.api().validar()
            self.conta = {"nome": v["nome"], "premium": v["premium"], "erro": None}
        except Exception as e:
            self.conta = {"nome": None, "premium": False, "erro": str(e)}
        return self.conta

    # ---------- estado para o painel
    def estado(self):
        jogos = {}
        for c in self.catalogo.values():
            d = c["dominio"]
            if d not in jogos:
                jogos[d] = {"dominio": d, "nome": JOGOS.get(d, {}).get("nome", c.get("jogo", d)),
                            "pasta": self.pasta_jogo(d), "mods": []}
            inst = self.instalados.get(c["id"])
            with self.lock:
                t = dict(self.tarefas.get(c["id"], {}))
            jogos[d]["mods"].append({
                "id": c["id"], "nome": c["nome"], "desc": c.get("desc", ""), "instalar": c["instalar"],
                "requisito": bool(c.get("requisito")), "destaque": bool(c.get("destaque")),
                "requisitos": [self.catalogo[r]["nome"] for r in c.get("requisitos", []) if r in self.catalogo],
                "pagina": c.get("pagina") or (pagina_mod(d, c["mod"]) if c.get("mod") else None),
                "instalado": bool(inst), "versao": (inst or {}).get("versao"),
                "baixado_em": (inst or {}).get("arquivo"), "tarefa": t or None,
            })
        for j in jogos.values():
            j["precisa_pasta"] = any(m["instalar"] in ("raiz", "local") for m in j["mods"]) and \
                not JOGOS.get(j["dominio"], {}).get("pasta_fixa")
            j["mods"].sort(key=lambda m: (not m["destaque"], m["requisito"], m["nome"]))
        return {"conta": dict(self.conta, tem_chave=bool(self.cfg.get("nexus_key"))),
                "nxm": nxm_status(), "jogos": list(jogos.values())}

    # ---------- instalar
    def instalar(self, cid):
        if cid not in self.catalogo:
            raise RuntimeError("Mod desconhecido")
        item = self.catalogo[cid]
        fila = [r for r in item.get("requisitos", []) if r not in self.instalados] + [cid]
        for x in fila:
            self.tarefa(x, "Na fila")
        threading.Thread(target=self._fila, args=(fila,), daemon=True).start()

    def _fila(self, fila):
        for x in fila:
            try:
                self._instalar_um(x)
            except Exception as e:
                self.tarefa(x, str(e), erro=True)
                for resto in fila[fila.index(x) + 1:]:
                    self.tarefa(resto, "Cancelado porque um requisito falhou", erro=True)
                return

    def _instalar_um(self, cid, nxm=None):
        item = self.catalogo[cid]
        dom = item["dominio"]
        pasta = self.pasta_jogo(dom)
        if item["instalar"] in ("raiz", "local") and not pasta:
            raise RuntimeError("Não achei a pasta do jogo. Informe a pasta acima e tente de novo.")

        if item["instalar"] == "local":
            origem = os.path.join(RECURSOS, "mods", item.get("origem", "cod_infinite_warfare"))
            self.tarefa(cid, "Copiando arquivos")
            os.makedirs(pasta, exist_ok=True)
            escritos = copiar_para_jogo(origem, pasta, cid)
            self.instalados[cid] = {"pasta": pasta, "arquivos": escritos, "versao": "incluído no app",
                                    "quando": time.strftime("%d/%m/%Y")}
            self._salvar_instalados()
            confere = item.get("confere", "iw7-mod.exe")
            falta = item.get("falta", "Falta o iw7-mod.exe nesta pasta (baixe no GitHub da AuroraMod)")
            aviso = "" if os.path.exists(os.path.normpath(os.path.join(pasta, confere))) else ". " + falta
            self.tarefa(cid, "Instalado" + aviso)
            return

        api = self.api()
        self.tarefa(cid, "Consultando o Nexus")
        info = api.mod(dom, item["mod"])
        if nxm:
            arq = {"file_id": nxm["file_id"], "file_name": f"{dom}_{item['mod']}_{nxm['file_id']}",
                   "version": info.get("version")}
            for f in api.arquivos(dom, item["mod"]):
                if f.get("file_id") == nxm["file_id"]:
                    arq = f
            url = api.link(dom, item["mod"], arq["file_id"], nxm["key"], nxm["expires"])
        else:
            arq = escolher_arquivo(api.arquivos(dom, item["mod"]))
            if not arq:
                raise RuntimeError("Esse mod não tem arquivo principal para baixar")
            url = None
            if self.conta.get("premium") or self.conta.get("nome") is None:
                try:
                    url = api.link(dom, item["mod"], arq["file_id"])
                except RuntimeError as e:
                    if str(e) != "PREMIUM":
                        raise
            if url is None:   # conta grátis: precisa do clique no site
                url = self._esperar_clique(cid, dom, item["mod"], arq["file_id"], api)

        nome_arq = arq.get("file_name") or f"{dom}_{item['mod']}.zip"
        destino = os.path.join(DOWNLOADS, dom, nome_arq)
        self.tarefa(cid, "Baixando", 0.0)
        baixar(url, destino, lambda p: self.tarefa(cid, "Baixando", p))
        versao = arq.get("version") or info.get("version")

        if item["instalar"] == "manual":
            self.instalados[cid] = {"arquivo": destino, "versao": versao, "manual": True,
                                    "quando": time.strftime("%d/%m/%Y")}
            self._salvar_instalados()
            self.tarefa(cid, "Baixado. Abra a pasta e siga as instruções da página do mod.")
            return

        self.tarefa(cid, "Instalando")
        tmp = tempfile.mkdtemp(prefix="dsa_mod_")
        try:
            extrair(destino, tmp)
            raiz = achar_raiz(tmp, set(JOGOS.get(dom, {}).get("raizes", [])) or None)
            escritos = copiar_para_jogo(raiz, pasta, cid)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        self.instalados[cid] = {"pasta": pasta, "arquivos": escritos, "versao": versao, "arquivo": destino,
                                "quando": time.strftime("%d/%m/%Y")}
        self._salvar_instalados()
        self.tarefa(cid, f"Instalado ({len(escritos)} arquivos)")

    def _esperar_clique(self, cid, dom, mod_id, file_id, api):
        if not nxm_status()["nosso"]:
            raise RuntimeError("Conta grátis: ligue 'Receber os links Mod Manager Download' e tente de novo")
        ev = threading.Event()
        self.esperando_nxm[(dom, mod_id)] = [ev, None]
        webbrowser.open(f"https://www.nexusmods.com/{dom}/mods/{mod_id}?tab=files&file_id={file_id}&nmm=1")
        self.tarefa(cid, "Na página que abriu, clique em 'Slow download'")
        if not ev.wait(600):
            self.esperando_nxm.pop((dom, mod_id), None)
            raise RuntimeError("Tempo esgotado esperando o clique em 'Slow download'")
        dados = self.esperando_nxm.pop((dom, mod_id))[1]
        return api.link(dom, mod_id, dados["file_id"], dados["key"], dados["expires"])

    def receber_nxm(self, url):
        dados = parse_nxm(url)
        if not dados:
            raise RuntimeError("Link nxm inválido")
        chave = (dados["dominio"], dados["mod"])
        if chave in self.esperando_nxm:              # um download nosso estava esperando este clique
            self.esperando_nxm[chave][1] = dados
            self.esperando_nxm[chave][0].set()
            return "Continuando o download"
        cid = next((c["id"] for c in self.catalogo.values()
                    if c["dominio"] == dados["dominio"] and c.get("mod") == dados["mod"]), None)
        if not cid:                                   # mod fora do catálogo: só baixa
            cid = f"x_{dados['dominio']}_{dados['mod']}"
            self._adicionar_extra(dados["dominio"], dados["mod"], f"Mod {dados['mod']}", "")
        self.tarefa(cid, "Recebido do site")

        def run():
            try:
                self._instalar_um(cid, nxm=dados)
            except Exception as e:
                self.tarefa(cid, str(e), erro=True)
        threading.Thread(target=run, daemon=True).start()
        return "Baixando o mod"

    def _adicionar_extra(self, dom, mod_id, nome, desc):
        cid = f"x_{dom}_{mod_id}"
        x = {"id": cid, "dominio": dom, "mod": mod_id, "instalar": "manual", "nome": nome, "desc": desc,
             "jogo": dom}
        self.catalogo[cid] = x
        extras = [e for e in self.cfg.get("mods_extras", []) if e["id"] != cid] + [x]
        self.cfg["mods_extras"] = extras
        self.salvar_cfg()
        return cid

    def adicionar_link(self, url):
        p = parse_link_nexus(url)
        if not p:
            raise RuntimeError("Cole um link de mod do Nexus, como nexusmods.com/jogo/mods/1234")
        dom, mid = p
        for c in self.catalogo.values():
            if c["dominio"] == dom and c.get("mod") == mid:
                return c["id"], c["nome"]
        info = self.api().mod(dom, mid)
        cid = self._adicionar_extra(dom, mid, info.get("name") or f"Mod {mid}",
                                    re.sub(r"<[^>]+>", "", info.get("summary") or "")[:220])
        return cid, info.get("name")

    def remover(self, cid):
        inst = self.instalados.get(cid)
        if not inst:
            raise RuntimeError("Esse mod não está instalado")
        if inst.get("arquivos"):
            remover_do_jogo(inst["pasta"], inst["arquivos"], cid)
        elif inst.get("manual") and inst.get("arquivo") and os.path.isfile(inst["arquivo"]):
            try:
                os.remove(inst["arquivo"])
            except OSError:
                pass
        self.instalados.pop(cid, None)
        self._salvar_instalados()
        with self.lock:
            self.tarefas.pop(cid, None)
        if cid.startswith("x_"):
            self.catalogo.pop(cid, None)
            self.cfg["mods_extras"] = [e for e in self.cfg.get("mods_extras", []) if e["id"] != cid]
            self.salvar_cfg()

    def abrir(self, cid, alvo):
        c = self.catalogo.get(cid)
        if not c:
            raise RuntimeError("Mod desconhecido")
        if alvo == "pagina":
            webbrowser.open(c.get("pagina") or pagina_mod(c["dominio"], c["mod"]))
            return
        inst = self.instalados.get(cid) or {}
        pasta = os.path.dirname(inst["arquivo"]) if inst.get("arquivo") else inst.get("pasta") or self.pasta_jogo(c["dominio"])
        if not pasta or not os.path.isdir(pasta):
            raise RuntimeError("Pasta não encontrada")
        if sys.platform == "win32":
            os.startfile(pasta)  # type: ignore[attr-defined]


# ----------------------------------------------------------------------------
# Links nxm:// (botão "Mod Manager Download" do site) — registro no Windows
# ----------------------------------------------------------------------------
def comando_nxm():
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --nxm "%1"'
    pyw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    exe = pyw if os.path.exists(pyw) else sys.executable
    script = os.path.join(RECURSOS, "dualsense_auto.py")
    return f'"{exe}" "{script}" --nxm "%1"'


def _ler_cmd_nxm():
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\nxm\shell\open\command") as k:
            return winreg.QueryValueEx(k, "")[0]
    except OSError:
        return None


def nxm_status():
    atual = _ler_cmd_nxm()
    return {"nosso": bool(atual and "--nxm" in atual and "dualsense_auto" in atual.lower()) or
            bool(atual and getattr(sys, "frozen", False) and sys.executable.lower() in atual.lower()),
            "outro": bool(atual) and not ("--nxm" in (atual or "")), "windows": sys.platform == "win32"}


def registrar_nxm(ligar, cfg, salvar_cfg):
    if sys.platform != "win32":
        raise RuntimeError("Só funciona no Windows")
    import winreg
    caminho = r"Software\Classes\nxm"
    if ligar:
        anterior = _ler_cmd_nxm()
        if anterior and "--nxm" not in anterior:
            cfg["nxm_anterior"] = anterior      # guarda o Vortex/MO2 para devolver depois
            salvar_cfg()
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, caminho) as k:
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, "URL:NXM Protocol")
            winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, caminho + r"\shell\open\command") as k:
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, comando_nxm())
        return "Links do Nexus agora abrem no DualSense Auto"
    anterior = cfg.get("nxm_anterior")
    if anterior:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, caminho + r"\shell\open\command") as k:
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, anterior)
    else:
        for sub in (r"\shell\open\command", r"\shell\open", r"\shell", ""):
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, caminho + sub)
            except OSError:
                pass
    return "Links do Nexus devolvidos ao programa anterior" if anterior else "Links do Nexus desligados"
