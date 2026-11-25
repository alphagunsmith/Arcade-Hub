"""Leitor de mods: você entrega o arquivo do mod, ele descobre o jogo, acha a pasta e instala.

Como decide:
1. Abre o arquivo e olha a estrutura (pastas típicas de cada motor de jogo e ferramenta de mod).
2. Lê o leia-me que vem dentro do mod e, se o nome do arquivo tiver o número do Nexus,
   lê também a descrição da página do mod.
3. Procura os jogos instalados (Steam, Epic, GOG e pastas que você informou).
4. Monta um plano: regras conhecidas e instalador FOMOD; com a chave do Claude, a IA lê
   as instruções e ajusta o plano.
5. Mostra o plano. Só copia arquivos depois que você confirma — nunca executa programas do mod.
   Tudo o que é substituído fica em backup e volta quando você remove.
"""
import glob
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET

import nexus_mods as nm

LEIAME = re.compile(r"(read ?me|leia|install|instru|manual|guide|como)[^/]*\.(txt|md|html?|rtf)$|\.(txt|md)$", re.I)


# ----------------------------------------------------------------------------
# Jogos instalados
# ----------------------------------------------------------------------------
def _acf(caminho):
    try:
        txt = open(caminho, encoding="utf-8", errors="ignore").read()
    except OSError:
        return None
    nome = re.search(r'"name"\s+"(.+?)"', txt)
    pasta = re.search(r'"installdir"\s+"(.+?)"', txt)
    return (nome.group(1), pasta.group(1)) if nome and pasta else None


IGNORAR_STEAM = re.compile(r"redistributable|proton|steamworks|steam linux runtime|soundtrack|dedicated server|sdk", re.I)


def jogos_instalados(cfg=None):
    jogos, vistos = [], set()

    def add(nome, pasta, loja):
        if not pasta or not os.path.isdir(pasta):
            return
        k = os.path.normcase(os.path.abspath(pasta))
        if k in vistos:
            return
        vistos.add(k)
        jogos.append({"nome": nome, "pasta": pasta, "loja": loja})

    for lib in nm.bibliotecas_steam():
        for acf in glob.glob(os.path.join(lib, "steamapps", "appmanifest_*.acf")):
            r = _acf(acf)
            if r and not IGNORAR_STEAM.search(r[0]):
                add(r[0], os.path.join(lib, "steamapps", "common", r[1]), "Steam")
    for item in glob.glob(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item"):
        try:
            d = json.load(open(item, encoding="utf-8"))
            add(d.get("DisplayName"), d.get("InstallLocation"), "Epic")
        except Exception:
            pass
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\GOG.com\Games") as k:
                i = 0
                while True:
                    try:
                        sub = winreg.EnumKey(k, i)
                    except OSError:
                        break
                    i += 1
                    try:
                        with winreg.OpenKey(k, sub) as g:
                            add(winreg.QueryValueEx(g, "gameName")[0], winreg.QueryValueEx(g, "path")[0], "GOG")
                    except OSError:
                        pass
        except OSError:
            pass
    for dom, pasta in ((cfg or {}).get("pastas_jogos") or {}).items():
        add(nm.JOGOS.get(dom, {}).get("nome", dom), pasta, "informada por você")
    for p in ((cfg or {}).get("pastas_extras") or []):
        add(os.path.basename(p.rstrip("\\/")), p, "informada por você")
    return sorted(jogos, key=lambda j: j["nome"].lower())


def dominio_nexus(nome_jogo):
    n = (nome_jogo or "").lower()
    for dom, info in nm.JOGOS.items():
        if info["nome"].lower() == n or any(p.lower() == n for p in info.get("pastas", [])):
            return dom
    especiais = {"grand theft auto v": "gta5", "the elder scrolls v: skyrim special edition": "skyrimspecialedition",
                 "baldur's gate 3": "baldursgate3", "resident evil 4": "residentevil42023"}
    return especiais.get(n) or re.sub(r"[^a-z0-9]", "", n)


# ----------------------------------------------------------------------------
# Detecção da família do mod
# ----------------------------------------------------------------------------
FAMILIAS = {
    "cyberpunk":  {"jogos": ["cyberpunk 2077"], "nome": "mod de Cyberpunk 2077"},
    "skyrim":     {"jogos": ["skyrim"], "nome": "mod de Skyrim"},
    "fallout4":   {"jogos": ["fallout 4"], "nome": "mod de Fallout 4"},
    "starfield":  {"jogos": ["starfield"], "nome": "mod de Starfield"},
    "bethesda":   {"jogos": ["skyrim", "fallout", "starfield", "oblivion"], "nome": "mod de jogo da Bethesda"},
    "re_engine":  {"jogos": ["resident evil", "biohazard", "monster hunter", "devil may cry", "street fighter 6",
                             "dragon's dogma 2", "dragons dogma 2", "onimusha"], "nome": "mod de jogo da Capcom (RE Engine)"},
    "rdr2":       {"jogos": ["red dead redemption 2"], "nome": "mod de Red Dead Redemption 2"},
    "gta5":       {"jogos": ["grand theft auto v"], "nome": "mod de GTA V"},
    "scripthook": {"jogos": ["red dead redemption 2", "grand theft auto v"], "nome": "plugin .asi (GTA V / RDR2)"},
    "iw7":        {"jogos": ["infinite warfare"], "nome": "script do iw7-mod"},
    "dyinglight": {"jogos": ["dying light"], "nome": "mod de Dying Light"},
    "bepinex":    {"jogos": [], "nome": "plugin BepInEx (jogo Unity)"},
    "unreal":     {"jogos": [], "nome": "mod .pak de jogo Unreal"},
    "generico":   {"jogos": [], "nome": "mod"},
}


def detectar_familia(arvore, leia):
    a = [p.lower() for p in arvore]
    tem = lambda f: any(f(p) for p in a)  # noqa: E731
    seg = lambda nome: tem(lambda p: ("/" + p + "/").find("/" + nome + "/") >= 0)  # noqa: E731
    ext = lambda *e: tem(lambda p: p.endswith(e))  # noqa: E731
    texto = (leia or "").lower()
    if seg("r6") or seg("red4ext") or seg("cyber_engine_tweaks") or ext(".archive", ".reds", ".xl") \
            or "archive/pc/mod" in " ".join(a):
        return "cyberpunk"
    if tem(lambda p: p.endswith("fomod/moduleconfig.xml")) or ext(".esp", ".esm", ".esl", ".bsa", ".ba2") \
            or seg("skse") or seg("f4se") or seg("sfse"):
        if seg("f4se") or "fallout 4" in texto or ext(".ba2") and "starfield" not in texto:
            return "fallout4"
        if seg("sfse") or "starfield" in texto:
            return "starfield"
        if seg("skse") or "skyrim" in texto or ext(".bsa"):
            return "skyrim"
        return "bethesda"
    if seg("reframework") or seg("natives"):
        return "re_engine"
    if ext(".asi") or seg("lml") or tem(lambda p: "scripthook" in p):
        if seg("lml") or "rdr2" in texto or "red dead" in texto or tem(lambda p: "scripthookrdr2" in p):
            return "rdr2"
        if "gta" in texto or tem(lambda p: "scripthookv" in p):
            return "gta5"
        return "scripthook"
    if ext(".gsc"):
        return "iw7"
    if seg("ph_ft") or "dying light" in texto:
        return "dyinglight"
    if seg("bepinex"):
        return "bepinex"
    if ext(".utoc", ".ucas") or (ext(".pak") and ("~mods" in texto or "paks" in texto or tem(lambda p: p.endswith("_p.pak")))):
        return "unreal"
    return "generico"


def escolher_jogo(familia, leia, jogos, nome_arquivo=""):
    chaves = FAMILIAS.get(familia, {}).get("jogos", [])
    cands = [j for j in jogos if any(k in j["nome"].lower() for k in chaves)] if chaves else []
    texto = ((leia or "") + " " + (nome_arquivo or "")).lower()
    if len(cands) == 1:
        return cands[0], "estrutura do mod"
    pool = cands or jogos
    citados = [j for j in pool if len(j["nome"]) > 3 and j["nome"].lower() in texto]
    if citados:
        return max(citados, key=lambda j: len(j["nome"])), "leia-me do mod"
    if cands:
        return cands[0], "estrutura do mod (há mais de um jogo compatível)"
    return None, None


# ----------------------------------------------------------------------------
# Regras de instalação
# ----------------------------------------------------------------------------
def _arquivos_sob(raiz_abs, base_rel):
    base = os.path.join(raiz_abs, base_rel) if base_rel else raiz_abs
    for r, _, fs in os.walk(base):
        for f in fs:
            yield os.path.relpath(os.path.join(r, f), raiz_abs).replace("\\", "/")


def _mapear(raiz_abs, base_rel, destino_rel, filtro=None):
    ops = []
    for src in _arquivos_sob(raiz_abs, base_rel):
        rel = src[len(base_rel) + 1:] if base_rel else src
        if filtro and not filtro(rel):
            continue
        if _lixo(rel) or ("/" not in rel and not destino_rel and LEIAME.search(rel)):
            continue   # leia-me solto no topo não vai para a pasta do jogo
        ops.append((src, (destino_rel + "/" + rel).strip("/") if destino_rel else rel))
    return ops


def _lixo(rel):
    n = rel.lower()
    return n.startswith("__macosx") or n.endswith((".ds_store", "thumbs.db")) or "/fomod/" in "/" + n


def _base_com(raiz_abs, teste, max_prof=4):
    """Primeira pasta (de cima para baixo) que satisfaz teste(lista de nomes em minúsculas)."""
    for r, ds, fs in os.walk(raiz_abs):
        rel = os.path.relpath(r, raiz_abs)
        if rel != "." and rel.count(os.sep) >= max_prof:
            continue
        if teste([d.lower() for d in ds], [f.lower() for f in fs]):
            return "" if rel == "." else rel.replace("\\", "/")
    return None


def _achar_no_jogo(pasta_jogo, *partes_opcoes, max_prof=4):
    """Acha dentro do jogo uma subpasta que termina com um dos caminhos dados (ex.: Content/Paks)."""
    alvos = [p.lower().replace("\\", "/") for p in partes_opcoes]
    for r, ds, _ in os.walk(pasta_jogo):
        rel = os.path.relpath(r, pasta_jogo).replace("\\", "/")
        if rel != "." and rel.count("/") >= max_prof:
            ds[:] = []
            continue
        for a in alvos:
            if (rel.lower() + "/").endswith(a.rstrip("/") + "/") and rel != ".":
                return rel
    return None


def _fomod(raiz_abs, pasta_dest_base):
    cfgs = [p for p in _arquivos_sob(raiz_abs, "") if p.lower().endswith("fomod/moduleconfig.xml")]
    if not cfgs:
        return None, []
    cfg = cfgs[0]
    base = cfg[:-len("fomod/ModuleConfig.xml")].rstrip("/")
    try:
        bruto = open(os.path.join(raiz_abs, cfg), "rb").read()
        if bruto[:2] in (b"\xff\xfe", b"\xfe\xff"):
            txt = bruto.decode("utf-16")
        else:
            txt = bruto.decode("utf-8-sig", errors="ignore")
        txt = re.sub(r"<\?xml[^>]*\?>", "", txt)
        txt = re.sub(r'\s(xmlns(:\w+)?|\w+:\w+)="[^"]*"', "", txt)   # tira namespaces e atributos prefixados
        root = ET.fromstring(txt.strip())
    except Exception:
        return None, ["O instalador FOMOD deste mod não pôde ser lido."]
    ops, escolhas = [], []

    def add_files(el):
        for f in list(el):
            tag = f.tag.lower()
            if tag not in ("file", "folder"):
                continue
            src = (f.get("source") or "").replace("\\", "/").strip("/")
            dst = (f.get("destination") or "").replace("\\", "/").strip("/")
            src_rel = (base + "/" + src).strip("/")
            if tag == "folder":
                dst_base = (pasta_dest_base + "/" + dst).strip("/")
                if os.path.isdir(os.path.join(raiz_abs, src_rel)):
                    ops.extend(_mapear(raiz_abs, src_rel, dst_base))
            else:
                alvo = dst or os.path.basename(src)
                if f.get("destination") is not None and (dst == "" or dst.endswith("/")):
                    alvo = (dst + "/" + os.path.basename(src)).strip("/")
                ops.append((src_rel, (pasta_dest_base + "/" + alvo).strip("/")))

    req = root.find("requiredInstallFiles")
    if req is not None:
        add_files(req)
    for grupo in root.iter("group"):
        tipo = (grupo.get("type") or "").lower()
        plugins = grupo.findall("./plugins/plugin")
        escolhidos = [p for p in plugins
                      if (p.find("./typeDescriptor/type") is not None and
                          (p.find("./typeDescriptor/type").get("name") or "").lower() in ("required", "recommended"))]
        if not escolhidos and plugins and tipo in ("selectexactlyone", "selectatleastone"):
            escolhidos = [plugins[0]]
        for p in escolhidos:
            fe = p.find("files")
            if fe is not None:
                add_files(fe)
            escolhas.append(f"{grupo.get('name', 'Opção')}: {p.get('name', '?')}")
    avisos = ["Este mod tem instalador com opções (FOMOD). Escolhas usadas: " + "; ".join(escolhas)] if escolhas else []
    return ops, avisos


def plano_por_regra(familia, raiz_abs, pasta_jogo):
    """Devolve (ops, explicacao, avisos) ou (None, motivo, [])."""
    arvore = list(_arquivos_sob(raiz_abs, ""))
    lower = [p.lower() for p in arvore]

    if familia in ("skyrim", "fallout4", "starfield", "bethesda"):
        data_rel = "Data"
        for nome in os.listdir(pasta_jogo):
            if nome.lower() == "data" and os.path.isdir(os.path.join(pasta_jogo, nome)):
                data_rel = nome
        ops, avisos = _fomod(raiz_abs, data_rel)
        if ops:
            return ops, "Seguindo o instalador FOMOD do mod, dentro da pasta Data.", avisos
        loader = _base_com(raiz_abs, lambda ds, fs: any(f.endswith("_loader.exe") for f in fs))
        if loader is not None:
            return _mapear(raiz_abs, loader, ""), "Extensor de scripts (SKSE/F4SE): arquivos vão para a pasta do jogo.", []
        base = _base_com(raiz_abs, lambda ds, fs: "data" in ds)
        if base is not None:
            d = [x for x in os.listdir(os.path.join(raiz_abs, base)) if x.lower() == "data"][0]
            return _mapear(raiz_abs, (base + "/" + d).strip("/"), data_rel), "O mod já vem com a pasta Data.", []
        marcas = ("meshes", "textures", "scripts", "interface", "sound", "skse", "f4se", "sfse", "seq", "strings", "materials")
        base = _base_com(raiz_abs, lambda ds, fs: any(f.endswith((".esp", ".esm", ".esl", ".bsa", ".ba2")) for f in fs)
                         or any(d in marcas for d in ds))
        if base is not None:
            return _mapear(raiz_abs, base, data_rel), "Arquivos do mod vão para a pasta Data do jogo.", []

    if familia == "cyberpunk":
        raizes = set(nm.JOGOS["cyberpunk2077"]["raizes"])
        base = _base_com(raiz_abs, lambda ds, fs: any(d in raizes for d in ds))
        if base is not None:
            return _mapear(raiz_abs, base, ""), "O mod já vem na estrutura do jogo (bin, r6, archive...).", []
        ops = []
        for src in arvore:
            n = src.lower()
            if n.endswith((".archive", ".xl")):
                ops.append((src, "archive/pc/mod/" + os.path.basename(src)))
            elif n.endswith(".reds"):
                ops.append((src, "r6/scripts/" + src))
            elif n.endswith(".tweak") or n.endswith(".yaml"):
                ops.append((src, "r6/tweaks/" + src))
        luas = [p for p in arvore if p.lower().endswith("/init.lua") or p.lower() == "init.lua"]
        for ini in luas:
            pasta_mod = os.path.dirname(ini)
            nome = os.path.basename(pasta_mod) or "mod"
            ops += _mapear(raiz_abs, pasta_mod, f"bin/x64/plugins/cyber_engine_tweaks/mods/{nome}")
        if ops:
            return ops, "Arquivos soltos distribuídos nas pastas certas do Cyberpunk (archive, r6, CET).", []

    if familia == "re_engine":
        base = _base_com(raiz_abs, lambda ds, fs: "reframework" in ds or "natives" in ds or "dinput8.dll" in fs)
        if base is not None:
            return _mapear(raiz_abs, base, ""), "Mod do RE Engine: vai para a pasta do jogo (reframework/natives).", []

    if familia in ("rdr2", "gta5", "scripthook"):
        base = _base_com(raiz_abs, lambda ds, fs: any(f.endswith(".asi") for f in fs) or "lml" in ds or "scripts" in ds
                         or any("scripthook" in f for f in fs))
        if base is not None:
            return _mapear(raiz_abs, base, ""), "Plugin .asi/scripts: vai para a pasta do jogo, onde fica o executável.", []

    if familia == "bepinex":
        base = _base_com(raiz_abs, lambda ds, fs: "bepinex" in ds)
        if base is not None:
            return _mapear(raiz_abs, base, ""), "Mod com BepInEx: vai para a pasta do jogo.", []
        dlls = [p for p in arvore if p.lower().endswith(".dll")]
        if dlls:
            return [(p, "BepInEx/plugins/" + os.path.basename(p)) for p in dlls], "Plugin solto: vai para BepInEx/plugins.", []

    if familia == "iw7":
        ops = []
        for src in arvore:
            if src.lower().endswith(".gsc"):
                i = src.lower().find("custom_scripts/")
                ops.append((src, "iw7-mod/" + (src[i:] if i >= 0 else "custom_scripts/" + os.path.basename(src))))
        if ops:
            return ops, "Scripts GSC vão para iw7-mod/custom_scripts.", ["Abra o jogo pelo iw7-mod."]

    if familia == "dyinglight":
        destino = _achar_no_jogo(pasta_jogo, "ph_ft/source", "ph/source")
        paks = [p for p in arvore if p.lower().endswith(".pak")]
        if destino and paks:
            return [(p, destino + "/" + os.path.basename(p)) for p in paks], f"Arquivos .pak vão para {destino}.", []

    if familia == "unreal" or (familia == "generico" and any(p.endswith((".pak", ".utoc", ".ucas")) for p in lower)):
        paks_dir = _achar_no_jogo(pasta_jogo, "Content/Paks")
        arqs = [p for p in arvore if p.lower().endswith((".pak", ".utoc", ".ucas", ".sig"))]
        if paks_dir and arqs:
            return ([(p, paks_dir + "/~mods/" + os.path.basename(p)) for p in arqs],
                    f"Mod Unreal: arquivos .pak vão para {paks_dir}/~mods.", [])

    # genérico: o mod imita a estrutura da pasta do jogo?
    try:
        topo_jogo = {n.lower() for n in os.listdir(pasta_jogo)}
    except OSError:
        topo_jogo = set()
    melhor, pontos = None, 0
    for r, ds, fs in os.walk(raiz_abs):
        rel = os.path.relpath(r, raiz_abs)
        if rel != "." and rel.count(os.sep) >= 3:
            continue
        p = sum(1 for n in ds + fs if n.lower() in topo_jogo)
        if p > pontos:
            melhor, pontos = ("" if rel == "." else rel.replace("\\", "/")), p
    if melhor is not None and pontos > 0:
        return _mapear(raiz_abs, melhor, ""), "As pastas do mod batem com as pastas do jogo; copiando por cima.", []
    return None, "Não reconheci como este mod deve ser instalado.", []


# ----------------------------------------------------------------------------
# IA lendo as instruções
# ----------------------------------------------------------------------------
PROMPT_PLANO = """Você instala mods de jogos de PC copiando arquivos. Leia as instruções e monte o plano.

Jogo de destino: {jogo} (pasta do jogo, primeiros níveis):
{pasta_jogo}

Arquivos dentro do mod (caminhos relativos):
{arvore}

Leia-me que veio no mod:
{leia}

Descrição da página do mod no Nexus:
{site}

Sugestão das regras automáticas (pode corrigir): {regra}

Responda SOMENTE com JSON:
{{"copias": [{{"de": "caminho no mod (arquivo ou pasta)", "para": "caminho relativo dentro da pasta do jogo"}}],
 "requisitos": ["outros mods ou programas que o usuário precisa ter"],
 "avisos": ["passos que não são cópia de arquivos e o usuário precisa fazer, como rodar um instalador ou editar um .ini"],
 "explicacao": "uma frase dizendo onde os arquivos vão e por quê"}}
Regras: "de" pasta = o CONTEÚDO dela vai para "para". "de" arquivo com "para" terminando em "/" = vai para dentro dessa pasta.
Nunca use caminhos absolutos nem "..". Não inclua leia-me, imagens de divulgação ou a pasta fomod."""


def plano_por_ia(cfg, jogo, raiz_abs, leia, site, regra_ops):
    from cerebro import ClaudeAPI, extract_json
    arvore = list(_arquivos_sob(raiz_abs, ""))
    try:
        topo = []
        for r, ds, fs in os.walk(jogo["pasta"]):
            rel = os.path.relpath(r, jogo["pasta"])
            prof = 0 if rel == "." else rel.count(os.sep) + 1
            if prof >= 2:
                ds[:] = []
                continue
            topo += [(rel + "/" + d + "/").lstrip("./") for d in ds[:40]] + [(rel + "/" + f).lstrip("./") for f in fs[:20]]
    except OSError:
        topo = []
    regra = "; ".join(f"{a} -> {b}" for a, b in (regra_ops or [])[:25]) or "nenhuma"
    prompt = PROMPT_PLANO.format(jogo=jogo["nome"], pasta_jogo="\n".join(topo[:150]),
                                 arvore="\n".join(arvore[:400]) + ("\n..." if len(arvore) > 400 else ""),
                                 leia=(leia or "(nenhum)")[:7000], site=(site or "(não disponível)")[:7000], regra=regra)
    txt = ClaudeAPI(cfg["api_key"]).ask(cfg.get("modelo_pesquisa", "claude-sonnet-5-5"),
                                         [{"type": "text", "text": prompt}], max_tokens=4000, timeout=120)
    d = extract_json(txt)
    if not d or not isinstance(d.get("copias"), list):
        raise RuntimeError("A IA não devolveu um plano válido")
    ops = []
    for c in d["copias"]:
        de = str(c.get("de", "")).replace("\\", "/").strip("/")
        para = str(c.get("para", "")).replace("\\", "/")
        if ".." in de.split("/") or ".." in para.split("/") or para.startswith("/") or re.match(r"^[a-z]:", para, re.I):
            continue
        para_dir = para.endswith("/") or para == ""
        para = para.strip("/")
        abs_de = os.path.join(raiz_abs, de) if de else raiz_abs
        if os.path.isdir(abs_de):
            ops += _mapear(raiz_abs, de, para)
        elif os.path.isfile(abs_de):
            ops.append((de, (para + "/" + os.path.basename(de)).strip("/") if para_dir else para))
    if not ops:
        raise RuntimeError("O plano da IA não tinha nenhuma cópia válida")
    return ops, d.get("explicacao", ""), [str(x) for x in d.get("requisitos", [])], [str(x) for x in d.get("avisos", [])]


# ----------------------------------------------------------------------------
# Leitor (estado para o painel)
# ----------------------------------------------------------------------------
def ler_leiame(raiz_abs, limite=12000):
    partes = []
    for p in sorted(_arquivos_sob(raiz_abs, ""), key=lambda x: (x.count("/"), x)):
        if LEIAME.search(p) and os.path.getsize(os.path.join(raiz_abs, p)) < 400000:
            try:
                t = open(os.path.join(raiz_abs, p), encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            t = re.sub(r"<[^>]+>", " ", t)
            partes.append(f"--- {p} ---\n{t.strip()}")
        if sum(len(x) for x in partes) > limite:
            break
    return "\n\n".join(partes)[:limite]


def id_nexus_do_nome(nome):
    """'Mod Name-4156-4-30-1712345678.zip' -> 4156"""
    m = re.search(r"-(\d{2,7})-[\d-]*?-?(\d{9,11})\.(zip|7z|rar)$", nome or "", re.I)
    return int(m.group(1)) if m else None


def _limpa_bbcode(t):
    return re.sub(r"\[/?[a-z]+(=[^\]]*)?\]", " ", re.sub(r"<[^>]+>", " ", t or ""), flags=re.I)


class LeitorMods:
    def __init__(self, gestor, cfg):
        self.g = gestor
        self.cfg = cfg
        self.lock = threading.Lock()
        self.estado = {"fase": "vazio"}
        self.tmp = None
        self.ctx = {}

    def publico(self):
        with self.lock:
            e = dict(self.estado)
        instalados = [{"id": k, "nome": v.get("nome", k), "jogo": v.get("jogo", ""), "quando": v.get("quando", ""),
                       "arquivos": len(v.get("arquivos", []))}
                      for k, v in self.g.instalados.items() if v.get("origem") == "arquivo"]
        e["instalados"] = instalados
        e["jogos"] = [{"nome": j["nome"], "pasta": j["pasta"], "loja": j["loja"]} for j in self.lista_jogos()]
        return e

    def lista_jogos(self):
        if self.ctx.get("jogos"):
            return self.ctx["jogos"]
        agora = time.time()
        if not getattr(self, "_cache", None) or agora - self._cache[0] > 60:
            self._cache = (agora, jogos_instalados(self.cfg))
        return self._cache[1]

    def _set(self, **kw):
        with self.lock:
            self.estado = kw

    def limpar(self):
        if self.tmp:
            shutil.rmtree(self.tmp, ignore_errors=True)
        self.tmp = None
        self.ctx = {}
        self._set(fase="vazio")

    def receber(self, caminho):
        self.limpar()
        self._set(fase="analisando", msg="Abrindo o arquivo do mod", arquivo=os.path.basename(caminho))
        threading.Thread(target=self._analisar, args=(caminho,), daemon=True).start()

    def _analisar(self, caminho, jogo_forcado=None):
        nome = os.path.basename(caminho)
        try:
            if self.tmp is None:
                self.tmp = tempfile.mkdtemp(prefix="dsa_leitor_")
                nm.extrair(caminho, self.tmp)
            arvore = list(_arquivos_sob(self.tmp, ""))
            if not arvore:
                raise RuntimeError("O arquivo está vazio")
            self._set(fase="analisando", msg="Lendo o leia-me e procurando o jogo", arquivo=nome)
            leia = ler_leiame(self.tmp)
            familia = detectar_familia(arvore, leia)
            jogos = self.ctx.get("jogos") or jogos_instalados(self.cfg)
            self._cache = (time.time(), jogos)
            self.ctx.update(caminho=caminho, jogos=jogos, familia=familia, leia=leia, nome=nome)
            if jogo_forcado:
                jogo, como = jogo_forcado, "escolhido por você"
            else:
                jogo, como = escolher_jogo(familia, leia, jogos, nome)
            if not jogo:
                self._set(fase="sem_jogo", arquivo=nome, familia=FAMILIAS[familia]["nome"],
                          msg="Não consegui descobrir de qual jogo é este mod. Escolha o jogo abaixo.",
                          leia=leia[:3000], total=len(arvore))
                return
            # página do Nexus (instruções do site), se o nome do arquivo tiver o número do mod
            site = ""
            mod_id = id_nexus_do_nome(nome)
            if mod_id and self.cfg.get("nexus_key"):
                self._set(fase="analisando", msg="Lendo a página do mod no Nexus", arquivo=nome)
                try:
                    info = self.g.api().mod(dominio_nexus(jogo["nome"]), mod_id)
                    site = _limpa_bbcode(info.get("description") or info.get("summary") or "")
                except Exception:
                    site = ""
            ops, expl, avisos = plano_por_regra(familia, self.tmp, jogo["pasta"])
            requisitos, fonte = [], "regras do app"
            if ops and familia != "generico" and "FOMOD" in expl:
                fonte = "instalador FOMOD do mod"
            if self.cfg.get("api_key") and (leia or site or not ops):
                self._set(fase="analisando", msg="A IA está lendo as instruções do mod", arquivo=nome)
                try:
                    ops_ia, expl_ia, requisitos, avisos_ia = plano_por_ia(self.cfg, jogo, self.tmp, leia, site, ops)
                    ops, expl, avisos = ops_ia, expl_ia, avisos + avisos_ia
                    fonte = "IA lendo " + (" e ".join(x for x, ok in (("o leia-me", leia), ("a página do Nexus", site)) if ok) or "a estrutura do mod")
                except Exception as e:
                    avisos = avisos + [f"A IA não conseguiu ler as instruções ({e}); usando as regras do app."]
            if not ops:
                self._set(fase="erro", arquivo=nome, msg=expl + " Veja as instruções abaixo e instale manualmente.",
                          leia=leia[:3000], jogo=jogo["nome"])
                return
            ops = self._validar(ops, jogo["pasta"])
            self.ctx.update(ops=ops, jogo=jogo)
            substitui = sum(1 for _, d in ops if os.path.exists(os.path.join(jogo["pasta"], d)))
            exes = [s for s, _ in ops if s.lower().endswith((".exe", ".bat", ".cmd", ".msi"))]
            if exes:
                avisos.append("O mod traz programas (.exe/.bat). Eles serão só copiados, nunca executados pelo app.")
            self._set(fase="pronto", arquivo=nome, familia=FAMILIAS[familia]["nome"], jogo=jogo["nome"],
                      pasta=jogo["pasta"], loja=jogo["loja"], como_achou=como, fonte=fonte, explicacao=expl,
                      ops=[{"de": a, "para": b} for a, b in ops[:14]], total=len(ops), substitui=substitui,
                      requisitos=requisitos, avisos=avisos, leia=leia[:3000])
        except Exception as e:
            self._set(fase="erro", arquivo=nome, msg=str(e))

    @staticmethod
    def _validar(ops, pasta_jogo):
        base = os.path.realpath(pasta_jogo)
        bons, vistos = [], set()
        for src, dst in ops:
            alvo = os.path.realpath(os.path.join(pasta_jogo, dst))
            if not alvo.startswith(base + os.sep) or dst.lower() in vistos:
                continue
            vistos.add(dst.lower())
            bons.append((src, dst))
        return bons

    def trocar_jogo(self, pasta):
        jogo = next((j for j in self.lista_jogos() if j["pasta"] == pasta), None)
        if not jogo:
            if not os.path.isdir(pasta or ""):
                raise RuntimeError("Essa pasta não existe")
            jogo = {"nome": os.path.basename(pasta.rstrip("\\/")), "pasta": pasta, "loja": "informada por você"}
            extras = list(self.cfg.get("pastas_extras") or [])
            if pasta not in extras:
                self.cfg["pastas_extras"] = extras + [pasta]
                self.g.salvar_cfg()
            self.ctx.setdefault("jogos", []).append(jogo)
        if not self.ctx.get("caminho"):
            raise RuntimeError("Solte um mod primeiro")
        self._set(fase="analisando", msg="Refazendo o plano para " + jogo["nome"], arquivo=self.ctx.get("nome"))
        threading.Thread(target=self._analisar, args=(self.ctx["caminho"], jogo), daemon=True).start()

    def instalar(self):
        with self.lock:
            if self.estado.get("fase") != "pronto":
                raise RuntimeError("Não há plano pronto para instalar")
            self.estado = dict(self.estado, fase="instalando", msg="Copiando arquivos")
        jogo, ops = self.ctx["jogo"], self.ctx["ops"]
        cid = "arq_" + re.sub(r"[^a-z0-9]+", "_", os.path.splitext(self.ctx["nome"])[0].lower())[:40] + \
              "_" + str(int(time.time()))
        escritos = []
        base = os.path.realpath(jogo["pasta"])
        for src, dst in ops:
            de = os.path.join(self.tmp, src)
            para = os.path.join(jogo["pasta"], dst)
            if not os.path.realpath(para).startswith(base + os.sep):
                continue
            if os.path.exists(para):
                bk = os.path.join(nm.BACKUP_DIR, cid, dst)
                if not os.path.exists(bk):
                    os.makedirs(os.path.dirname(bk), exist_ok=True)
                    shutil.copy2(para, bk)
            os.makedirs(os.path.dirname(para), exist_ok=True)
            shutil.copy2(de, para)
            escritos.append(dst)
        self.g.instalados[cid] = {"pasta": jogo["pasta"], "arquivos": escritos, "nome": self.ctx["nome"],
                                  "jogo": jogo["nome"], "origem": "arquivo", "quando": time.strftime("%d/%m/%Y")}
        self.g._salvar_instalados()
        nomej = jogo["nome"]
        avisos = self.estado.get("avisos", [])
        self.limpar()
        self._set(fase="instalado", jogo=nomej, total=len(escritos), avisos=avisos,
                  msg=f"Instalado em {nomej}: {len(escritos)} arquivos.")
        return cid
