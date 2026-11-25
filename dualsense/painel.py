"""Painel do DualSense Auto: servidor local (só 127.0.0.1) + janela no Edge em modo app."""
import json
import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from ds_hid import trig_info

from caminhos import DADOS as APP_DIR, RECURSOS  # noqa: E402
PORTA = 47823
HTML_FILE = os.path.join(RECURSOS, "painel.html")


def estado_ui(eng):
    now = time.time()
    left, right, rgb = eng.trig_out
    gl, gs = eng.xbox.game_rumble(now)
    inf = dict(eng.info)
    d_dir, d_t = eng.ultimo_dano
    cfg = eng.cfg
    dev = eng.dev
    return {
        "controle": {"conectado": dev.connected, "nome": dev.name, "via": "Bluetooth" if dev.bt else "USB",
                     "status": eng.status},
        "xbox": {"ligado": bool(cfg.get("emular_xbox")), "ativo": bool(eng.xbox.pad), "status": eng.xbox.status},
        "mods": {"dsx": eng.fonte_dsx.status, "pacotes": eng.fonte_dsx.pacotes,
                 "arquivos": [f.status for f in eng.fontes_arq if f.status], "ativo": eng.mod_ativo()},
        "ia": {"status": eng.cerebro.status, "pesquisa": eng.cerebro.pesquisa_status,
               "armas": len(eng.cerebro.armas), "tem_chave": bool(cfg.get("api_key"))},
        "jogo": {"exe": eng.game_exe, "titulo": eng.game_title, "perfil_auto": eng.perfil_auto,
                 "motivo": eng.motivo},
        "info": inf,
        "gatilhos": {"l2": trig_info(left), "r2": trig_info(right),
                     "l2_pos": dev.l2 / 255, "r2_pos": dev.r2 / 255},
        "motores": {"esq": eng.out[0] / 255, "dir": eng.out[1] / 255, "jogo": max(gl, gs) / 255},
        "luz": list(rgb),
        "dano": {"dir": d_dir, "idade": now - d_t},
        "ajustes": {"rumble": eng.settings["rumble"], "gatilhos": eng.settings["gatilhos"],
                    "perfil": eng.settings["perfil"]},
        "config": {"visao_ativa": bool(cfg.get("visao_ativa")), "pesquisar_web": bool(cfg.get("pesquisar_web")),
                   "emular_xbox": bool(cfg.get("emular_xbox")),
                   "intervalo_visao_s": cfg.get("intervalo_visao_s", 4)},
    }


def make_handler(eng, token, desligar):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _json(self, obj, code=200):
            b = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def _ok_token(self):
            q = parse_qs(urlparse(self.path).query)
            return self.headers.get("X-Token") == token or q.get("t", [""])[0] == token

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/":
                if not self._ok_token():
                    self.send_error(403)
                    return
                with open(HTML_FILE, "rb") as f:
                    html = f.read().replace(b"__TOKEN__", token.encode())
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)
            elif path == "/api/leitor":
                if not self._ok_token():
                    self.send_error(403)
                    return
                self._json(eng.leitor.publico())
            elif path == "/api/mods":
                if not self._ok_token():
                    self.send_error(403)
                    return
                self._json(eng.mods.estado())
            elif path == "/api/estado":
                if not self._ok_token():
                    self.send_error(403)
                    return
                self._json(estado_ui(eng))
            else:
                self.send_error(404)

        def _mods(self, path, dados):
            from nexus_mods import registrar_nxm
            g = eng.mods
            try:
                if path == "/api/mods/chave":
                    c = g.definir_chave(dados.get("chave", ""))
                    if c.get("erro"):
                        self._json({"ok": False, "msg": c["erro"]})
                    elif c.get("nome"):
                        tipo = "Premium" if c["premium"] else "grátis"
                        self._json({"ok": True, "msg": f"Conectado como {c['nome']} (conta {tipo})"})
                    else:
                        self._json({"ok": True, "msg": "Chave removida"})
                elif path == "/api/mods/instalar":
                    g.instalar(dados.get("id"))
                    self._json({"ok": True, "msg": "Instalação iniciada"})
                elif path == "/api/mods/remover":
                    g.remover(dados.get("id"))
                    self._json({"ok": True, "msg": "Mod removido e arquivos originais devolvidos"})
                elif path == "/api/mods/pasta":
                    g.definir_pasta(dados.get("dominio"), dados.get("pasta"))
                    self._json({"ok": True, "msg": "Pasta salva"})
                elif path == "/api/mods/nxm":
                    self._json({"ok": True, "msg": registrar_nxm(bool(dados.get("ligar")), eng.cfg, eng.salvar_config)})
                elif path == "/api/mods/link":
                    cid, nome = g.adicionar_link(dados.get("url", ""))
                    self._json({"ok": True, "msg": f"{nome} adicionado à lista", "id": cid})
                elif path == "/api/mods/abrir":
                    g.abrir(dados.get("id"), dados.get("alvo"))
                    self._json({"ok": True})
                elif path == "/api/nxm":
                    self._json({"ok": True, "msg": g.receber_nxm(dados.get("url", ""))})
                else:
                    self._json({"ok": False, "msg": "Ação desconhecida"}, 404)
            except Exception as e:
                self._json({"ok": False, "msg": str(e)})

        def do_POST(self):
            if not self._ok_token():
                self.send_error(403)
                return
            n = int(self.headers.get("Content-Length", "0") or 0)
            if urlparse(self.path).path == "/api/leitor/enviar":   # arquivo do mod (binário)
                from urllib.parse import unquote
                import re as _re
                nome = os.path.basename(unquote(self.headers.get("X-Nome", "mod.zip")))
                nome = _re.sub(r'[<>:"/\\|?*]', "_", nome) or "mod.zip"
                pasta = os.path.join(APP_DIR, "downloads", "arquivos")
                os.makedirs(pasta, exist_ok=True)
                destino = os.path.join(pasta, nome)
                falta = n
                with open(destino, "wb") as f:
                    while falta > 0:
                        bloco = self.rfile.read(min(1048576, falta))
                        if not bloco:
                            break
                        f.write(bloco)
                        falta -= len(bloco)
                eng.leitor.receber(destino)
                self._json({"ok": True})
                return
            try:
                dados = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                self._json({"ok": False, "msg": "Pedido inválido"}, 400)
                return
            path = urlparse(self.path).path
            cfg = eng.cfg
            if path == "/api/ajuste":
                k, v = dados.get("chave"), dados.get("valor")
                if k in ("rumble", "gatilhos"):
                    eng.settings[k] = max(0.0, min(2.0, float(v)))
                elif k == "perfil":
                    eng.settings["perfil"] = str(v)
                elif k in ("visao_ativa", "pesquisar_web", "emular_xbox"):
                    cfg[k] = bool(v)
                    eng.salvar_config()
                elif k == "intervalo_visao_s":
                    cfg[k] = max(2, min(30, int(v)))
                    eng.salvar_config()
                else:
                    self._json({"ok": False, "msg": "Ajuste desconhecido"}, 400)
                    return
                self._json({"ok": True})
            elif path == "/api/chave":
                cfg["api_key"] = str(dados.get("chave", "")).strip()
                eng.salvar_config()
                self._json({"ok": True, "msg": "Chave salva" if cfg["api_key"] else "Chave removida"})
            elif path == "/api/ensinar":
                ok = eng.salvar_jogo(str(dados.get("perfil", "generico")))
                self._json({"ok": ok, "msg": f"Salvo para {eng.game_exe}" if ok else "Abra o jogo primeiro"})
            elif path == "/api/driver":
                from xbox import vigem_installer
                msi = vigem_installer()
                if msi:
                    subprocess.Popen(["msiexec", "/i", msi])
                    self._json({"ok": True, "msg": "Instalador do driver aberto"})
                else:
                    webbrowser.open("https://github.com/nefarius/ViGEmBus/releases")
                    self._json({"ok": True, "msg": "Página do driver aberta no navegador"})
            elif path == "/api/guia":
                guia = os.path.join(RECURSOS, "mods", "LEIA-ME-MODS.md")
                try:
                    os.startfile(guia)  # type: ignore[attr-defined]
                    self._json({"ok": True, "msg": "Guia aberto"})
                except Exception:
                    self._json({"ok": False, "msg": f"Abra manualmente: {guia}"})
            elif path.startswith("/api/leitor/"):
                try:
                    if path == "/api/leitor/jogo":
                        eng.leitor.trocar_jogo(dados.get("pasta", ""))
                        self._json({"ok": True})
                    elif path == "/api/leitor/instalar":
                        eng.leitor.instalar()
                        self._json({"ok": True, "msg": "Mod instalado"})
                    elif path == "/api/leitor/cancelar":
                        eng.leitor.limpar()
                        self._json({"ok": True})
                    else:
                        self._json({"ok": False, "msg": "Ação desconhecida"}, 404)
                except Exception as e:
                    self._json({"ok": False, "msg": str(e)})
            elif path.startswith("/api/mods/") or path == "/api/nxm":
                self._mods(path, dados)
            elif path == "/api/desligar":
                self._json({"ok": True, "msg": "Desligando"})
                threading.Thread(target=desligar, daemon=True).start()
            else:
                self._json({"ok": False, "msg": "Ação desconhecida"}, 404)

    return H


def abrir_janela(url):
    """Abre o painel como janela própria (Edge/Chrome em modo app); senão, no navegador padrão."""
    candidatos = [shutil.which("msedge"), shutil.which("chrome")]
    for base in (os.environ.get("ProgramFiles(x86)", ""), os.environ.get("ProgramFiles", ""),
                 os.environ.get("LocalAppData", "")):
        if base:
            candidatos += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                           os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")]
    perfil = os.path.join(APP_DIR, ".janela")
    for exe in candidatos:
        if exe and os.path.exists(exe):
            try:
                subprocess.Popen([exe, f"--app={url}", "--window-size=1240,860",
                                  f"--user-data-dir={perfil}", "--no-first-run"])
                return
            except OSError:
                pass
    webbrowser.open(url)


def ja_rodando():
    """Se já existe um DualSense Auto aberto, só abre a janela dele."""
    info = os.path.join(APP_DIR, ".painel.json")
    try:
        with open(info, encoding="utf-8") as f:
            url = json.load(f)["url"]
        import urllib.request
        tok = parse_qs(urlparse(url).query)["t"][0]
        req = urllib.request.Request(url.split("?")[0] + "api/estado", headers={"X-Token": tok})
        urllib.request.urlopen(req, timeout=1).read()
        return url
    except Exception:
        return None


def avisar_arcade(sessao, **dados):
    """Conta ao Arcade Hub como esta execução está (ele lê o .painel.json da pasta de dados)."""
    dados.update(sessao=sessao, pid=os.getpid())
    tmp = os.path.join(APP_DIR, ".painel.json.tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(dados, f)
        os.replace(tmp, os.path.join(APP_DIR, ".painel.json"))
    except OSError:
        pass


def outro_aberto():
    """Outro DualSense Auto (fora do Arcade Hub) já aberto? -> descrição dele, ou None.
    Dois ao mesmo tempo brigariam pelo controle e criariam dois controles de Xbox."""
    try:
        import psutil
    except ImportError:
        return None
    eu = os.getpid()
    meu_exe = os.path.normcase(os.path.abspath(sys.executable))
    for p in psutil.process_iter(["pid", "name", "exe", "cmdline"]):
        try:
            if p.info["pid"] == eu:
                continue
            nome = (p.info["name"] or "").lower()
            cmd = p.info["cmdline"] or []
            juntos = " ".join(cmd).lower()
            if "--embutido" in juntos or "--nxm" in juntos:
                continue
            exe = os.path.normcase(os.path.abspath(p.info["exe"] or "")) if p.info["exe"] else ""
            if nome == "dualsenseauto.exe" and exe != meu_exe:
                return p.info["exe"] or nome
            if nome.startswith("python") and any(c.lower().endswith("dualsense_auto.py") for c in cmd) \
                    and "--teste" not in juntos:
                return juntos[:200]
        except Exception:
            continue
    return None


def vigiar_pai(pid, quando_sumir):
    """Fecha junto com o Arcade Hub, mesmo se ele travar ou for encerrado à força."""
    if not pid:
        return
    try:
        import psutil
    except ImportError:
        return

    def laco():
        while True:
            time.sleep(2)
            try:
                if not psutil.pid_exists(pid):
                    break
            except Exception:
                break
        quando_sumir()
    threading.Thread(target=laco, daemon=True).start()


def rodar_painel(eng, abrir=True, porta=PORTA, token=None, sessao=None, pai=0):
    token = token or secrets.token_urlsafe(16)
    fim = threading.Event()

    def desligar():
        eng.stop.set()
        time.sleep(0.3)
        fim.set()

    try:
        srv = ThreadingHTTPServer(("127.0.0.1", porta), make_handler(eng, token, desligar))
    except OSError:
        srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(eng, token, desligar))
    url = f"http://127.0.0.1:{srv.server_address[1]}/?t={token}"
    if sessao is None:
        try:
            with open(os.path.join(APP_DIR, ".painel.json"), "w", encoding="utf-8") as f:
                json.dump({"url": url}, f)
        except OSError:
            pass
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    if sessao is not None:         # Arcade Hub: o token ele já tem; aqui vai só a porta
        avisar_arcade(sessao, porta=srv.server_address[1], pronto=True,
                      url=url)   # com o token: o link nxm:// do Nexus chega nesta mesma execução
        vigiar_pai(pai, desligar)
    if abrir:
        abrir_janela(url)
    try:
        while not fim.is_set():
            fim.wait(0.5)
    except KeyboardInterrupt:
        desligar()
    srv.shutdown()
    return url


def enviar_nxm(link):
    """Repassa um link nxm:// para o app aberto (abrindo o app se precisar)."""
    import urllib.request
    url = ja_rodando()
    if not url:
        exe = sys.executable
        pyw = os.path.join(os.path.dirname(exe), "pythonw.exe")
        cmd = [exe] if getattr(sys, "frozen", False) else [pyw if os.path.exists(pyw) else exe,
                                                             os.path.join(RECURSOS, "dualsense_auto.py")]
        subprocess.Popen(cmd)
        for _ in range(40):
            time.sleep(0.5)
            url = ja_rodando()
            if url:
                break
    if not url:
        return False
    tok = parse_qs(urlparse(url).query)["t"][0]
    req = urllib.request.Request(url.split("?")[0] + "api/nxm", data=json.dumps({"url": link}).encode(),
                                 method="POST", headers={"X-Token": tok, "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10).read()
    return True
