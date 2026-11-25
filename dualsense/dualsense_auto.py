#!/usr/bin/env python3
"""
DualSense Auto - vibração e gatilhos adaptáveis inteligentes para qualquer jogo de PC (Windows).

Camada rápida (100x por segundo):
  - vibração que o próprio jogo manda para o controle de Xbox virtual;
  - posição dos seus gatilhos L2/R2.
Camada de visão (a cada poucos segundos, opcional, usa a API do Claude):
  - qual jogo, situação (a pé, veículo, menu), arma na mão, chuva/neve,
    terreno sob as rodas, indicador de dano (frente/trás/lados), vida baixa;
  - cada arma nova é pesquisada e ganha um setup próprio, salvo em armas.json.
"""
import argparse
import json
import math
import os
import sys
import threading
import time
import traceback


def _fatal(msg):
    try:
        from caminhos import DADOS as base
        with open(os.path.join(base, "erro.log"), "w", encoding="utf-8") as f:
            f.write(msg)
    except Exception:
        pass
    print(msg, file=sys.stderr)
    if sys.platform == "win32" and not ({"--embutido", "--teste"} & set(sys.argv)):   # no Arcade Hub, o erro aparece lá
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, msg[-1500:], "DualSense Auto - erro", 0x10)
        except Exception:
            pass
    sys.exit(1)


try:
    import numpy as np
except ImportError:
    _fatal("Faltam bibliotecas (numpy).\n\nNão abra o dualsense_auto.py direto: "
           "dê dois cliques no iniciar.bat, que instala tudo automaticamente.\n\n"
           f"Python em uso: {sys.executable}")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ds_hid import DualSense, FakeDualSense, PadState, Trig, build_output_report, clamp, parse_input  # noqa: E402
from xbox import XboxVirtual, to_xusb  # noqa: E402
from cerebro import (Cerebro, load_config, save_config, template, extract_json,  # noqa: E402
                     png_encode)
from fontes import FonteDSX, FonteArquivo, FonteEstado, evento_iw7, perfil_iw7  # noqa: E402
import armas_iw7  # noqa: E402
import armas_jogos  # noqa: E402
from efeitos import (Terreno, Pulsos, Chuva, coracao, padrao_dano, padrao_coice,  # noqa: E402
                     spec_to_trig)

APP_NAME = "DualSense Auto"
from caminhos import DADOS as APP_DIR, RECURSOS  # noqa: E402
PROFILES_FILE = os.path.join(APP_DIR, "perfis.json")          # perfis que você salvou
PROFILES_PADRAO = os.path.join(RECURSOS, "perfis.json")       # os que vêm com o app

PERFIS = ["generico", "tiro", "corrida", "acao", "desligado"]
NOMES_PERFIS = {"generico": "Genérico", "tiro": "Tiro (FPS/TPS)", "corrida": "Corrida",
                "acao": "Ação / Aventura", "desligado": "Gatilhos desligados"}
TIPO_POR_GENERO = {"tiro": "fuzil", "acao": "corpo_a_corpo", "generico": "nenhuma", "corrida": "nenhuma",
                   "desligado": "nenhuma"}


# ----------------------------------------------------------------------------
# Detecção do jogo em primeiro plano
# ----------------------------------------------------------------------------
IGNORAR = {"python.exe", "pythonw.exe", "dualsenseauto.exe", "explorer.exe",
           "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe", "discord.exe",
           "searchhost.exe", "shellexperiencehost.exe", "startmenuexperiencehost.exe",
           "taskmgr.exe", "applicationframehost.exe", "textinputhost.exe",
           "arcade hub.exe", "electron.exe", "msedge.exe"}
# O Arcade Hub informa o próprio .exe: a janela dele não é um jogo (a visão IA não tira print dela)
IGNORAR |= {n.strip().lower() for n in os.environ.get("DSA_IGNORAR", "").split("|") if n.strip()}


def foreground_process():
    """-> (nome do .exe, título da janela, pasta do .exe)"""
    if sys.platform != "win32":
        return None, None, None
    try:
        import ctypes
        import ctypes.wintypes as wt
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return None, None, None
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        import psutil
        proc = psutil.Process(pid.value)
        try:
            pasta = os.path.dirname(proc.exe())
        except Exception:
            pasta = None
        return proc.name(), buf.value, pasta
    except Exception:
        return None, None, None


def load_profiles():
    p = {}
    for arq in (PROFILES_FILE, PROFILES_PADRAO):
        try:
            with open(arq, "r", encoding="utf-8") as f:
                p = json.load(f)
            break
        except Exception:
            continue
    p.setdefault("padrao", "generico")
    p.setdefault("jogos", {})
    p.setdefault("palavras_chave", {})
    p["jogos"] = {k.lower(): v for k, v in p["jogos"].items()}
    return p


def save_profiles(p):
    tmp = PROFILES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PROFILES_FILE)


def classify(exe, title, profiles):
    exe_l = (exe or "").lower()
    if exe_l in profiles["jogos"]:
        return profiles["jogos"][exe_l], "salvo"
    text = exe_l + " " + (title or "").lower()
    for genero, kws in profiles["palavras_chave"].items():
        for k in kws:
            if k.lower() in text:
                return genero, f"palavra '{k}'"
    return profiles["padrao"], "padrão"




# ----------------------------------------------------------------------------
# Motor principal
# ----------------------------------------------------------------------------
class Engine:
    def __init__(self, device, test=False):
        self.dev = device
        self.test = test
        self.cfg = load_config()
        if test:
            self.cfg.update(visao_ativa=True, api_key="", emular_xbox=False)
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.profiles = load_profiles()
        self.xbox = XboxVirtual()
        self.cerebro = Cerebro(self.cfg, self.hint)
        from nexus_mods import GerenciadorMods
        self.mods = GerenciadorMods(self.cfg, self.salvar_config)
        from leitor_mods import LeitorMods
        self.leitor = LeitorMods(self.mods, self.cfg)
        self.ev_time = 0.0   # último tranco forte vindo do jogo
        self.ev_str = 0.0
        self.pulsos = Pulsos()
        self.chuva = Chuva()
        self.terreno = Terreno()
        self.last_shot = 0.0
        self.last_hit = 0.0
        self.spike_visto = 0.0
        self.vis_visto = 0
        self.last_tick = time.time()
        self.desconectou = 0.0
        self.settings = {"rumble": 1.0, "gatilhos": 1.0, "perfil": "auto"}
        self.game_exe = None
        self.game_title = ""
        self.fg_jogo = False
        self.jogo_visto = 0.0
        self.perfil_auto = self.profiles["padrao"]
        self.motivo = ""
        self.status = "Iniciando..."
        self.out = (0, 0)
        self.info = {}
        self._arma_cache = (None, None)
        self.dev.on_input = self._on_input
        # dados exatos vindos de mods
        self.game_dir = None
        self.fonte_dsx = FonteDSX(int(self.cfg.get("porta_mods", 6969)))
        J = armas_jogos.JOGOS
        self.fontes_arq = [
            FonteArquivo("Call of Duty: Infinite Warfare", ["iw7-mod.exe", "iw7_ship.exe"],
                         os.path.join("dualsense", "eventos.txt")),
            # Titanfall 2 + Northstar: o mod regrava R2Northstar/saves/DualSenseAuto/estado.txt
            FonteEstado(J["titanfall2"]["nome"], J["titanfall2"]["exes"],
                        os.path.join("R2Northstar", "saves", "DualSenseAuto", "estado.txt"), tabela="titanfall2"),
            # Doom clássico no GZDoom: o mod escreve no log (+logfile dualsense_eventos.txt)
            FonteArquivo(J["doom_gzdoom"]["nome"], J["doom_gzdoom"]["exes"], "dualsense_eventos.txt",
                         filtro="DSA|", tabela="doom_gzdoom"),
            # BO2 no Plutonium: o script grava em %LOCALAPPDATA%/Plutonium/storage/t6/dualsense
            FonteArquivo(J["bo2"]["nome"], J["bo2"]["exes"],
                         os.path.join("$LOCALAPPDATA", "Plutonium", "storage", "t6", "dualsense", "eventos.txt"), tabela="bo2"),
        ]
        self.semeados = set()
        self.ext = {}
        self.ext_fonte = None
        self.morte_t = 0.0
        self.trig_out = (Trig.off(), Trig.off(), (0, 0, 0))
        self.ultimo_dano = (None, 0.0)
        self.dsx_visto = 0
        self.dsx_exe = None

    # ---------- utilidades
    def mod_ativo(self):
        """Algum mod está mandando dados exatos do jogo atual?"""
        if self.dsx_do_jogo_atual(60):
            return "DSX"
        if self.ext_fonte and self.ext_fonte.serve(self.game_exe) and self.ext_fonte.ativo(600):
            return self.ext_fonte.jogo
        return None

    def dsx_do_jogo_atual(self, max_idade=600):
        d = self.fonte_dsx
        if d.pacotes != self.dsx_visto:      # guarda de qual jogo vieram os comandos
            self.dsx_visto = d.pacotes
            self.dsx_exe = self.game_exe
        return d.ativo(max_idade) and self.dsx_exe == self.game_exe

    def hint(self):
        em_jogo = "mod" if (self.fg_jogo and self.mod_ativo()) else self.fg_jogo
        return self.game_exe or "", self.game_title or "", em_jogo

    # ---------- eventos do mod de arquivo (CoD IW)
    def ler_fontes_arquivo(self, now):
        for fonte in self.fontes_arq:
            if not fonte.serve(self.game_exe):
                continue
            for linha in fonte.ler(self.game_dir):
                self.ext_fonte = fonte
                self.evento_mod(linha, now)

    def evento_mod(self, linha, now):
        ev, a = evento_iw7(linha)
        e = self.ext
        e["t"] = now
        if ev == "inicio":
            self.ext = {"t": now}
        elif ev == "arma" and len(a) >= 4:
            nome = None if a[0].lower() in ("none", "", "nenhuma") else a[0]
            tabela = getattr(self.ext_fonte, "tabela", None)
            if tabela:
                # Titanfall 2, Doom (GZDoom), BO2: tabela de armas de cada jogo
                jogo = self.ext_fonte.jogo
                if not nome:
                    e.update(arma=None, tipo="nenhuma", rpm=0, automatica=False, classe=a[1], municao=-1)
                    return
                p = armas_jogos.perfil(tabela, a[0], a[1], a[2], a[3])
                chave = p["nome"] if armas_jogos.identificar(tabela, a[0]) else a[0]
                salvo = self.cerebro.armas.get(self.cerebro.chave(jogo, chave))
                if armas_jogos.precisa_refazer(salvo):
                    self.cerebro.salvar_arma(jogo, chave, p)
                e.update(arma=chave, tipo=p["tipo"], rpm=p["cadencia_rpm"], automatica=p["automatica"], classe=a[1], municao=-1)
                return
            tipo, rpm, auto = perfil_iw7(a[0], a[1], a[2], a[3])
            e.update(arma=nome, tipo=tipo if nome else "nenhuma", rpm=rpm, automatica=auto, classe=a[1], municao=-1)
            if nome:   # cada arma com a sua configuração, salva no banco de armas
                p = armas_iw7.perfil(a[0], a[1], a[2], a[3])
                e["tipo"] = p["tipo"]
                jogo = self.ext_fonte.jogo if self.ext_fonte else "Call of Duty: Infinite Warfare"
                salvo = self.cerebro.armas.get(self.cerebro.chave(jogo, nome))
                if armas_iw7.precisa_refazer(salvo):
                    p["jogo"] = jogo
                    self.cerebro.salvar_arma(jogo, nome, p)
        elif ev == "municao" and a:
            try:
                e["municao"] = int(float(a[0]))
            except ValueError:
                e["municao"] = -1
        elif ev == "tiro":
            self.last_shot = now
            coice = float(self.info.get("coice", 0.5))
            with self.lock:
                self.pulsos.add(padrao_coice(coice), now)
        elif ev == "dano" and len(a) >= 2:
            try:
                qtd = float(a[0])
            except ValueError:
                qtd = 20.0
            self.last_hit = now
            self.ultimo_dano = (a[1], now)
            with self.lock:
                self.pulsos.add(padrao_dano(a[1], clamp(0.45 + qtd / 60.0, 0.45, 1.0)), now)
            if len(a) >= 4:
                try:
                    e["vida"] = 100.0 * float(a[2]) / max(1.0, float(a[3]))
                except ValueError:
                    pass
        elif ev == "estado" and len(a) >= 2:
            e["ads"] = a[0] == "1"
            try:
                e["vida"] = float(a[1])
            except ValueError:
                pass
        elif ev == "recarga":
            def tic(dt):
                if dt > 0.2:
                    return None
                return (0.0, 0.4) if dt < 0.04 or 0.13 < dt < 0.17 else (0.0, 0.0)
            with self.lock:
                self.pulsos.add(tic, now)
        elif ev == "granada":
            with self.lock:
                self.pulsos.add(padrao_coice(0.35), now)
        elif ev == "morte":
            self.morte_t = now
            e["vida"] = 0

    def salvar_config(self):
        save_config(self.cfg)

    def perfil_atual(self):
        p = self.settings["perfil"]
        return self.perfil_auto if p == "auto" else p

    def update_game(self):
        exe, title, pasta = foreground_process()
        if not exe:
            return
        if exe.lower() in IGNORAR:
            self.fg_jogo = False
            return
        self.fg_jogo = True
        self.jogo_visto = time.time()
        self.game_dir = pasta
        if exe != self.game_exe or title != self.game_title:
            self.game_exe, self.game_title = exe, title
            self.perfil_auto, self.motivo = classify(exe, title, self.profiles)
        jid = armas_jogos.jogo_por_exe(exe)
        if jid and jid not in self.semeados:      # todas as armas do jogo aparecem na aba Armas
            self.semeados.add(jid)
            try:
                armas_jogos.semear(self.cerebro, jid)
            except Exception:
                pass

    def precisa_xbox(self, now):
        """O controle de Xbox virtual só existe enquanto um jogo está na frente.
        No desktop, o Steam (configuração de área de trabalho) e alguns programas transformam
        qualquer controle em setas, Enter e cliques: com o Xbox virtual sempre ligado, os botões
        do DualSense viravam teclas apertando "sozinhas" no Windows."""
        if not (self.cfg.get("emular_xbox") and self.dev.connected):
            return False
        if not self.cfg.get("xbox_so_no_jogo", True):
            return True
        return now - self.jogo_visto < 4.0      # tolerância: alt-tab rápido e telas de carregamento

    def salvar_jogo(self, perfil):
        if not self.game_exe:
            return False
        self.profiles["jogos"][self.game_exe.lower()] = perfil
        save_profiles(self.profiles)
        self.perfil_auto, self.motivo = perfil, "salvo"
        return True

    # ---------- entradas
    def _on_input(self, st):
        if self.cfg.get("emular_xbox") and self.xbox.pad:
            self.xbox.update(st)

    def _evento_tiro_ou_dano(self, forca, lado, now, veic):
        """Algo forte aconteceu. Se você está atirando é o seu tiro; senão, provavelmente te acertaram."""
        atirando = self.dev.r2 > 100
        if atirando:
            self.last_shot = now
            coice = float(self.info.get("coice", 0.5))
            if not veic:
                with self.lock:
                    self.pulsos.add(padrao_coice(coice * clamp(forca + 0.3, 0, 1)), now)
        elif forca >= 0.55 and now - self.last_hit > 0.3 and not veic:
            self.last_hit = now
            direcao = "esquerda" if lado < -0.3 else "direita" if lado > 0.3 else "frente"
            self.ultimo_dano = (direcao, now)
            with self.lock:
                self.pulsos.add(padrao_dano(direcao, forca), now)

    # ---------- arma
    def _perfil_arma(self, jogo, arma, tipo):
        chave = (jogo, arma, tipo, len(self.cerebro.armas))
        if self._arma_cache[0] != chave:
            self._arma_cache = (chave, self.cerebro.perfil_arma(jogo, arma, tipo))
        return self._arma_cache[1]

    # ---------- decisão dos efeitos
    def compute(self, now, l2, r2):
        dt_tick = clamp(now - self.last_tick, 0.001, 0.1)
        self.last_tick = now
        genero = self.perfil_atual()
        vis = self.cerebro.fresco() if self.cfg.get("visao_ativa") else {}
        ext = None
        if self.ext_fonte and self.ext_fonte.serve(self.game_exe) and now - self.ext.get("t", 0) < 600:
            ext = self.ext
            vis = {"jogo": self.ext_fonte.jogo, "situacao": "a_pe", "arma": ext.get("arma"),
                   "tipo_arma": ext.get("tipo", "nenhuma"), "vida_baixa": 0 < ext.get("vida", 100) < 35,
                   "chuva": 0, "superficie": "desconhecido"}

        # nova leitura da visão com indicador de dano -> efeito direcional (inclui "nas costas")
        if self.cerebro.seq != self.vis_visto:
            self.vis_visto = self.cerebro.seq
            d = (vis or {}).get("dano_direcao")
            if d in ("frente", "tras", "esquerda", "direita"):
                self.ultimo_dano = (d, now)
                with self.lock:
                    self.pulsos.add(padrao_dano(d, 1.0), now)

        situacao = vis.get("situacao") or ("veiculo" if genero == "corrida" else "a_pe")
        veic = situacao == "veiculo"
        menu = situacao in ("menu", "cutscene")
        superficie = vis.get("superficie") or "desconhecido"
        chuva = clamp(float(vis.get("chuva") or 0) + 0.6 * float(vis.get("neve") or 0), 0, 1)
        vida_baixa = bool(vis.get("vida_baixa"))
        jogo = vis.get("jogo") or self.game_exe or "?"
        if vis:
            arma, tipo = vis.get("arma"), vis.get("tipo_arma") or "nenhuma"
        else:
            arma, tipo = None, TIPO_POR_GENERO.get(genero, "nenhuma")
        pa = self._perfil_arma(jogo, arma, tipo)
        if ext is not None and not pa.get("editado"):   # dados exatos do jogo valem mais que pesquisa/padrão
            pa = dict(pa)
            if ext.get("rpm"):
                pa["cadencia_rpm"] = ext["rpm"]
            pa["automatica"] = bool(ext.get("automatica"))
            pa["fonte"] = (pa.get("fonte", "") + " + dados do jogo").strip(" +")
        if now - self.morte_t < 2.5:
            menu_morte = True
        else:
            menu_morte = False

        R = self.settings["rumble"]
        G = self.settings["gatilhos"]

        # vibração que o jogo pediu ao "Xbox" -> sinal de tiro/dano também
        gl, gs = self.xbox.game_rumble(now)
        game_ativo = now - self.xbox.rumble_t < 3
        if self.xbox.spike_t > self.spike_visto:
            self.spike_visto = self.xbox.spike_t
            self.ev_time, self.ev_str = now, max(gl, gs) / 255
            if ext is None:   # sem mod, adivinha se foi tiro seu ou dano
                self._evento_tiro_ou_dano(self.ev_str, 0.0, now, veic)

        # ---- motores
        dt = now - self.ev_time
        boom = self.ev_str * math.exp(-dt / 0.18) if self.ev_str > 0.8 else 0.0  # tranco muito forte = explosão
        L = [gl / 255]
        Rr = [gs / 255]
        if veic and not menu:
            vel = clamp(0.25 + 0.75 * r2 / 255, 0, 1)
            tl, tr = self.terreno.rumble(superficie, vel, now)
            L.append(tl)
            Rr.append(tr)
        if not menu:
            cl, cr = self.chuva.rumble(chuva, veic, dt_tick)
            L.append(cl)
            Rr.append(cr)
        if vida_baixa:
            L.append(coracao(now))
        with self.lock:
            pl, pr = self.pulsos.valor(now)
        L.append(pl)
        Rr.append(pr)
        motor_l = int(clamp(max(L) * R, 0, 1) * 255)
        motor_r = int(clamp(max(Rr) * R, 0, 1) * 255)

        # ---- gatilhos
        if genero == "desligado" or G <= 0.01 or menu or menu_morte:
            left = right = Trig.off()
        elif veic:
            left, right = Terreno.gatilhos(superficie, l2, G)
            if now - self.last_hit < 0.25:  # batida
                left = Trig.vibration(0, clamp(6 * G, 0, 8), 30)
        else:
            left = spec_to_trig(pa.get("l2"), G)
            right = spec_to_trig(pa.get("r2"), G)
            vib = float(pa.get("vibra_gatilho", 0) or 0)
            desde_tiro = now - self.last_shot
            if ext is not None and ext.get("municao") == 0:   # pente vazio: gatilho solto, sem tranco
                right = spec_to_trig({"efeito": "resistencia", "inicio": 0, "forca": 1}, G)
                vib = 0
            if pa.get("automatica") and r2 > 150 and desde_tiro < 0.25 and vib > 0:
                hz = clamp(float(pa.get("cadencia_rpm", 600) or 600) / 60.0, 4, 40)
                ini = int((pa.get("r2") or {}).get("inicio", 0) or 0)
                right = Trig.vibration(clamp(ini, 0, 9), clamp(vib * G, 0, 8), hz)  # rajada na cadência da arma
            elif desde_tiro < 0.08 and vib > 0:
                right = Trig.vibration(0, clamp(vib * G, 0, 8), 30)                 # tranco do disparo
            if ext is not None and ext.get("ads"):   # mirando: L2 firma um pouco mais
                l2s = dict(pa.get("l2") or {})
                l2s["forca"] = min(8, (l2s.get("forca", 1) or 1) + 1)
                left = spec_to_trig(l2s, G)
            if dt < 0.2 and boom > 0.3:
                left = Trig.vibration(0, clamp((3 + 5 * boom) * G, 0, 8), 25)

        # ---- luz
        if vida_baixa:
            rgb = (int(255 * (0.3 + 0.7 * coracao(now) / 0.75)), 0, 0)
        else:
            base = (40, 40, 40) if menu else (255, 120, 0) if veic else (0, 80, 255) if tipo == "nenhuma" else (255, 0, 40)
            if chuva > 0.3:
                base = (base[0] // 3, base[1] // 2 + 40, 255)
            k = 0.25 + 0.75 * clamp(max(gl, gs) / 255 + pl, 0, 1)
            rgb = tuple(int(c * k) for c in base)

        # ---- mod no protocolo DSX (ex.: Cyberpunk) manda nos gatilhos e na luz
        fonte = "visão IA" if (vis and ext is None) else ("mod: " + self.ext_fonte.jogo if ext is not None else "som do jogo + tipo")
        if self.dsx_do_jogo_atual() and not menu:
            d = self.fonte_dsx
            with d.lock:
                if d.left is not None:
                    left = d.left
                if d.right is not None:
                    right = d.right
                if d.rgb is not None:
                    rgb = d.rgb
                if now - d.t_rumble < 5:
                    motor_l = max(motor_l, int(d.rumble[0] * R))
                    motor_r = max(motor_r, int(d.rumble[1] * R))
            fonte = "mod (protocolo DSX)"

        self.info = {"fonte_dados": fonte, "jogo": jogo, "situacao": situacao, "arma": arma, "tipo": pa.get("tipo", tipo),
                     "fonte": pa.get("fonte", ""), "resumo": pa.get("resumo", ""), "coice": pa.get("coice", 0.5),
                     "automatica": pa.get("automatica"), "cadencia": pa.get("cadencia_rpm"),
                     "superficie": superficie, "chuva": chuva, "vida_baixa": vida_baixa,
                     "dano": vis.get("dano_direcao"), "visao": bool(vis), "jogo_vibra": game_ativo}
        return motor_l, motor_r, left, right, rgb

    # ---------- laços
    def control_loop(self):
        last_game = last_try = last_xbox = 0.0
        while not self.stop.is_set():
            now = time.time()
            if self.precisa_xbox(now):
                if not self.xbox.pad and now - last_xbox > 2:
                    last_xbox = now
                    self.xbox.start()
            elif self.xbox.pad:
                self.xbox.update(PadState())    # solta tudo antes de sumir (nada fica "apertado")
                self.xbox.stop()
                if self.cfg.get("emular_xbox") and self.dev.connected:
                    self.xbox.status = 'esperando um jogo na frente'
            if not self.dev.connected:
                self.status = "Controle não encontrado - conecte o DualSense (USB ou Bluetooth)"
                if self.xbox.pad:
                    self.xbox.update(PadState())
                    if now - self.desconectou > 5:   # some de vez depois de 5 s (reconexão rápida não pisca)
                        self.xbox.stop()
                if now - last_try > 2:
                    last_try = now
                    try:
                        self.dev.connect()
                    except Exception as e:
                        self.status = f"Erro ao abrir o controle: {e}"
                time.sleep(0.1)
                continue
            self.desconectou = now
            self.status = f"{self.dev.name} conectado via {'Bluetooth' if self.dev.bt else 'USB'}"
            if now - last_game > 1.0:
                last_game = now
                self.update_game()
            self.ler_fontes_arquivo(now)
            ml, mr, left, right, rgb = self.compute(now, self.dev.l2, self.dev.r2)
            self.out = (ml, mr)
            self.trig_out = (left, right, rgb)
            self.dev.send(ml, mr, left, right, rgb)
            time.sleep(1 / 100 if not self.dev.bt else 1 / 70)
        try:
            self.dev.reset()
        except Exception:
            pass
        self.xbox.stop()

    def input_loop(self):
        while not self.stop.is_set():
            self.dev.read_once(8)

    def start(self):
        for fn in (self.control_loop, self.input_loop):
            threading.Thread(target=fn, daemon=True).start()
        self.cerebro.start(self.stop)
        self.fonte_dsx.start(self.stop)
        threading.Thread(target=self.mods.verificar_conta, daemon=True).start()


# ----------------------------------------------------------------------------
# Auto-teste (sem controle, sem Windows, sem internet)
# ----------------------------------------------------------------------------
def self_test():
    import zlib
    # gatilhos e relatórios
    assert Trig.weapon(4, 7, 6) == (0x25, 0x90, 0x00, 5, 0, 0, 0, 0, 0, 0, 0)
    usb = build_output_report(False, 0, 10, 20, Trig.off(), Trig.weapon(4, 7, 6), (1, 2, 3))
    assert len(usb) == 48 and usb[3] == 20 and usb[4] == 10 and usb[11] == 0x25
    bt = build_output_report(True, 3, 10, 20, Trig.off(), Trig.off(), (1, 2, 3))
    assert len(bt) == 78 and int.from_bytes(bt[74:], "little") == zlib.crc32(bytes([0xA2]) + bt[:74]) & 0xFFFFFFFF

    # leitura de botões e conversão para Xbox
    r = [0] * 64
    r[0] = 0x01
    r[1], r[2], r[3], r[4], r[5], r[6] = 255, 0, 128, 128, 10, 250
    r[8] = 0x20 | 0x02          # xis + direcional direita
    r[9] = 0x02 | 0x20          # R1 + Options
    st = PadState()
    assert parse_input(r, st) and st.r2 == 250 and st.l2 == 10
    w, lt, rt, lx, ly, rx, ry = to_xusb(st)
    assert w == (0x1000 | 0x0008 | 0x0200 | 0x0010), hex(w)
    assert lx == 32512 and ly == 32767 and rt == 250
    from xbox import _stick
    assert _stick(133, 122) == (128, 128) and _stick(128, 255) == (128, 255) and _stick(0, 128)[0] == 0
    st.lx, st.ly = 131, 125                     # analógico com folga: Xbox recebe centro exato
    assert to_xusb(st)[3] == 0 and to_xusb(st)[4] == -1
    bt_r = [0] * 78
    bt_r[0] = 0x31
    bt_r[6], bt_r[7], bt_r[9] = 33, 44, 0x80
    assert parse_input(bt_r, st) and st.l2 == 33 and st.r2 == 44 and to_xusb(st)[0] & 0x8000
    print("botões -> Xbox: ok")

    # PNG e JSON da IA
    img = (np.random.rand(20, 30, 3) * 255).astype(np.uint8)
    png = png_encode(img)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    idat = png[png.find(b"IDAT") + 4:png.find(b"IEND") - 8]
    assert len(zlib.decompress(idat)) == 20 * (30 * 3 + 1)
    assert extract_json('Claro! {"arma": "AK-47", "x": {"y": 1}} fim')["arma"] == "AK-47"
    print("PNG / JSON: ok")

    # motor com visão simulada
    dev = FakeDualSense()
    dev.connect()
    eng = Engine(dev, test=True)
    cer = eng.cerebro
    cer.armas = {}

    def visao(**kw):
        base = {"jogo": "Teste", "situacao": "a_pe", "arma": None, "tipo_arma": "nenhuma", "chuva": 0,
                "superficie": "desconhecido", "dano_direcao": None, "vida_baixa": False}
        base.update(kw)
        cer.estado, cer.t_estado = base, time.time()
        cer.seq += 1

    t = time.time()
    # 1) fuzil automático: segurando R2 e atirando -> gatilho vibra na cadência
    cer.armas[cer.chave("Teste", "AK-47")] = dict(template("fuzil"), cadencia_rpm=600, fonte="teste")
    visao(arma="AK-47", tipo_arma="fuzil")
    dev.state.r2 = 255
    eng.last_shot = t
    ml, mr, left, right, rgb = eng.compute(t + 0.05, 0, 255)
    assert right[0] == 0x26 and right[9] == 10, right   # 600 tpm = 10 Hz
    # 2) escopeta: gatilho duro, sem rajada
    visao(arma="Pump", tipo_arma="escopeta")
    eng.last_shot = 0
    _, _, _, right, _ = eng.compute(t + 1, 0, 0)
    assert right[0] == 0x25 and right[3] == 7, right
    print("armas diferentes -> gatilhos diferentes: ok")
    # 3) veículo: lama x asfalto
    visao(situacao="veiculo", superficie="asfalto")
    _, _, l_asf, r_asf, _ = eng.compute(t + 2, 0, 200)
    visao(situacao="veiculo", superficie="lama")
    ml_lama, _, l_lama, r_lama, _ = eng.compute(t + 2.01, 0, 200)
    assert r_asf != r_lama and l_asf != l_lama and r_lama[0] == 0x26
    print("terreno (lama muda gatilho e vibração): ok")
    # 4) chuva gera vibração mesmo em silêncio
    visao(chuva=1.0)
    picos = max(eng.compute(t + 3 + i * 0.01, 0, 0)[1] for i in range(200))
    assert picos > 40, picos
    print("chuva: ok")
    # 5) dano pelas costas: duas batidas
    visao(dano_direcao="tras")
    t5 = t + 10
    seq = [eng.compute(t5 + i * 0.01, 0, 0)[0] for i in range(35)]
    assert seq[0] > 150 and min(seq[10:14]) < 30 and max(seq[16:28]) > 100, seq
    print("dano nas costas (duas batidas): ok")
    # 6) padrão de dano pela esquerda
    eng.last_hit = 0
    dev.state.r2 = 0
    visao()
    eng._evento_tiro_ou_dano(0.9, -0.8, t + 20, False)
    ml, mr, *_ = eng.compute(t + 20.02, 0, 0)
    assert ml > 200 and mr < 100, (ml, mr)
    print("dano pela esquerda: ok")
    # 7) vida baixa -> coração
    visao(vida_baixa=True)
    bat = [eng.compute(t + 30 + i * 0.01, 0, 0)[0] for i in range(100)]
    assert max(bat) > 150 and min(bat) == 0
    print("coração com vida baixa: ok")
    # 8) menu desliga gatilhos
    visao(situacao="menu")
    assert eng.compute(t + 40, 0, 0)[3] == Trig.off()
    # 9) sem IA: volta para análise de som + tipo do jogo
    cer.t_estado = 0
    eng.settings["perfil"] = "tiro"
    _, _, _, right, _ = eng.compute(t + 50, 0, 0)
    assert right[0] == 0x25
    # 9b) mod no protocolo DSX (ex.: Cyberpunk) manda nos gatilhos
    import json as _json
    import socket as _socket
    import tempfile as _tempfile
    from fontes import dsx_para_trig
    assert dsx_para_trig(16, [2, 6, 8]) == Trig.weapon(2, 6, 8)
    assert dsx_para_trig(13, [3, 5]) == Trig.feedback(3, 5)
    assert dsx_para_trig(17, [0, 8, 12])[0] == 0x26 and dsx_para_trig(0, [])[0] == 0x05
    assert dsx_para_trig(14, [1, 6, 7, 8])[0] == 0x22
    eng.game_exe = "Cyberpunk2077.exe"
    eng.settings["perfil"] = "auto"
    pacote = {"instructions": [{"type": 1, "parameters": [0, 2, 16, 3, 7, 8]},
                               {"type": 1, "parameters": [0, 1, 13, 2, 4]},
                               {"type": 2, "parameters": [0, 10, 200, 30]}]}
    eng.fonte_dsx.porta = 0   # porta livre qualquer, só para o teste
    stop2 = threading.Event()
    sk = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
    sk.bind(("127.0.0.1", 0))
    porta = sk.getsockname()[1]
    sk.close()
    eng.fonte_dsx.porta = porta
    eng.fonte_dsx.start(stop2)
    time.sleep(0.3)
    cli = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
    cli.settimeout(2)
    cli.sendto(_json.dumps(pacote).encode(), ("127.0.0.1", porta))
    resp = _json.loads(cli.recvfrom(4096)[0])
    assert resp["isControllerConnected"] is True
    _, _, left, right, rgb = eng.compute(t + 60, 0, 0)
    assert right == Trig.weapon(3, 7, 8) and left == Trig.feedback(2, 4) and rgb == (10, 200, 30), (left, right, rgb)
    assert eng.info["fonte_dados"] == "mod (protocolo DSX)"
    eng.game_exe = "OutroJogo.exe"           # trocou de jogo: comandos do Cyberpunk não valem mais
    _, _, left, right, _ = eng.compute(t + 61, 0, 0)
    assert right != Trig.weapon(3, 7, 8)
    stop2.set()
    print("receptor de mods DSX (Cyberpunk): ok")

    # 9c) mod do CoD Infinite Warfare (arquivo de eventos)
    pasta = _tempfile.mkdtemp()
    os.makedirs(os.path.join(pasta, "dualsense"))
    arq = os.path.join(pasta, "dualsense", "eventos.txt")
    open(arq, "w").write("1|inicio\n")
    eng.game_exe, eng.game_dir = "iw7-mod.exe", pasta
    eng.ler_fontes_arquivo(t + 70)
    with open(arq, "a") as f:
        f.write("100|arma|iw7_ar57|rifle|0.075|30\n200|estado|1|100\n")
    eng.ler_fontes_arquivo(t + 70.1)
    assert eng.ext.get("arma") == "iw7_ar57" and eng.ext.get("rpm") == 800 and eng.ext.get("automatica")
    assert eng.hint()[2] == "mod" or not eng.fg_jogo
    with open(arq, "a") as f:
        f.write("300|tiro\n")
    eng.ler_fontes_arquivo(t + 70.2)
    _, _, left, right, _ = eng.compute(t + 70.25, 0, 255)
    assert right[0] == 0x26 and abs(right[9] - 13) <= 1, right       # 800 tpm ~ 13 Hz
    assert eng.info["fonte_dados"].startswith("mod:")
    with open(arq, "a") as f:
        f.write("400|dano|45|tras|55|100\n")
    eng.ler_fontes_arquivo(t + 72)
    seq = [eng.compute(t + 72 + i * 0.01, 0, 0)[0] for i in range(35)]
    assert seq[0] > 150 and min(seq[10:14]) < 30 and max(seq[16:28]) > 90, seq
    with open(arq, "a") as f:
        f.write("500|arma|iw7_spas|spread|0.9|8\n")
    eng.ler_fontes_arquivo(t + 75)
    eng.last_shot = 0
    _, _, _, right, _ = eng.compute(t + 75.1, 0, 0)
    assert right[0] == 0x25, right   # escopeta: gatilho de arma duro
    jogo_iw = "Call of Duty: Infinite Warfare"
    pk = eng.cerebro.armas.get(eng.cerebro.chave(jogo_iw, "iw7_ar57"))
    assert pk and pk["nome"] == "KBAR-32" and pk["cadencia_rpm"] == 800 and pk["gerador"] == armas_iw7.GERADOR, pk
    with open(arq, "a") as f:
        f.write("510|arma|iw7_rvn_mp|rifle|0.06|36\n520|arma|iw7_kbs_mp|sniper|1.1|5\n")
    eng.ler_fontes_arquivo(t + 76)
    rv = eng.cerebro.armas[eng.cerebro.chave(jogo_iw, "iw7_rvn_mp")]
    kb = eng.cerebro.armas[eng.cerebro.chave(jogo_iw, "iw7_kbs_mp")]
    assert rv["energia"] and rv["rajada"] == 2 and kb["ferrolho"] and kb["r2"]["efeito"] == "arma", (rv, kb)
    assert kb["r2"]["inicio"] > pk["r2"]["inicio"] and kb["vibra_gatilho"] > rv["vibra_gatilho"]
    # o que o usuário editou não é sobrescrito, nem pelos dados do jogo
    ed = dict(kb, editado=True, automatica=True, cadencia_rpm=300)
    eng.cerebro.salvar_arma(jogo_iw, "iw7_kbs_mp", ed)
    with open(arq, "a") as f:
        f.write("530|arma|none|none|0|0\n540|arma|iw7_kbs_mp|sniper|1.1|5\n")
    eng.ler_fontes_arquivo(t + 77)
    assert eng.cerebro.armas[eng.cerebro.chave(jogo_iw, "iw7_kbs_mp")]["cadencia_rpm"] == 300
    assert eng._perfil_arma(jogo_iw, "iw7_kbs_mp", "sniper")["automatica"] is True
    # pente vazio: gatilho leve e sem tranco
    with open(arq, "a") as f:
        f.write("550|municao|0\n560|tiro\n")
    eng.ler_fontes_arquivo(t + 78)
    _, _, _, right, _ = eng.compute(t + 78.01, 0, 0)
    assert right[0] == 0x21 and eng.ext.get("municao") == 0, right
    assert armas_iw7.identificar("alt_iw7_fmg_mp+akimbo")[0] == "Type-2" and armas_iw7.identificar("iw7_zzz") is None
    # teclado "apertando sozinho": o Xbox virtual só existe com um jogo na frente
    dev_real = eng.dev
    eng.dev = type("D", (), {"connected": True})()
    eng.cfg["emular_xbox"], eng.cfg["xbox_so_no_jogo"] = True, True
    eng.jogo_visto = 100.0
    assert eng.precisa_xbox(102.0) and not eng.precisa_xbox(105.0)
    eng.cfg["xbox_so_no_jogo"] = False
    assert eng.precisa_xbox(500.0)
    eng.cfg["emular_xbox"] = False
    assert not eng.precisa_xbox(100.5)
    eng.dev = dev_real
    # aba Armas do painel: editar, validar faixas e voltar ao automático
    import painel as _painel
    ch = eng.cerebro.chave(jogo_iw, "iw7_ar57")
    assert any(a["chave"] == ch and a["nome"] == "KBAR-32" for a in _painel.lista_armas(eng))
    assert _painel.salvar_arma_painel(eng, ch, {"cadencia_rpm": 99999, "r2": {"efeito": "x", "forca": 20, "inicio": 7, "fim": 2},
                                                "automatica": False, "tipo": "inventado"})
    sv = eng.cerebro.armas[ch]
    assert sv["editado"] and sv["cadencia_rpm"] == 2000 and sv["r2"] == {"efeito": "nenhum", "inicio": 7, "fim": 7, "forca": 8, "frequencia": 0}
    assert sv["tipo"] == "fuzil" and sv["automatica"] is False
    assert _painel.restaurar_arma(eng, ch) and not eng.cerebro.armas[ch].get("editado")
    assert eng.cerebro.armas[ch]["cadencia_rpm"] == 800
    assert not _painel.salvar_arma_painel(eng, "nada|nada", {})
    print("CoD IW: cada arma com a sua configuração (KBAR-32, R-VN, KBS, editada, pente vazio): ok")
    print("mod do CoD Infinite Warfare (arma, cadência, dano nas costas): ok")
    teste_mods_novos(eng, t)
    teste_mods()
    teste_leitor()
    print("AUTO-TESTE OK")


def teste_mods_novos(eng, t):
    """Titanfall 2 (Northstar), Doom (GZDoom) e BO2 (Plutonium): o mod de cada um até o gatilho."""
    import tempfile as _tempfile
    J = armas_jogos.JOGOS

    # --- Titanfall 2: arquivo de estado regravado pelo Northstar
    pasta = _tempfile.mkdtemp()
    dest = os.path.join(pasta, "R2Northstar", "saves", "DualSenseAuto")
    os.makedirs(dest)
    arq = os.path.join(dest, "estado.txt")

    def grava(txt):
        with open(arq, "w") as f:
            f.write(txt)
        st = os.stat(arq)
        os.utime(arq, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))

    eng.game_exe, eng.game_dir = "Titanfall2.exe", pasta
    grava("1|mp_weapon_rspn101|24|0|0|0|100|100|0|0|1")
    eng.ler_fontes_arquivo(t + 100)
    jtf = J["titanfall2"]["nome"]
    assert eng.ext.get("arma") == "R-201" and eng.ext.get("rpm") == 810 and eng.ext.get("automatica"), eng.ext
    assert eng.cerebro.armas[eng.cerebro.chave(jtf, "R-201")]["tabela"] == "titanfall2"
    eng.last_shot = 0
    grava("2|mp_weapon_rspn101|21|3|0|0|100|100|1|0|1")
    eng.ler_fontes_arquivo(t + 100.1)
    assert eng.last_shot == t + 100.1 and eng.ext.get("ads") and eng.ext.get("municao") == 21
    grava("3|mp_titanweapon_predator_cannon|100|3|1|40|60|100|0|1|1")
    eng.ler_fontes_arquivo(t + 101)
    pc = eng.cerebro.armas[eng.cerebro.chave(jtf, "Legion: Predator Cannon")]
    assert eng.ext.get("arma") == "Legion: Predator Cannon" and pc["giro"] and pc["r2"]["efeito"] == "rampa", pc
    assert eng.last_hit == t + 101 and abs(eng.ext.get("vida") - 60) < 1
    grava("4|mp_titanweapon_predator_cannon|100|3|1|40|0|100|0|1|0")
    eng.ler_fontes_arquivo(t + 102)
    assert eng.morte_t == t + 102
    grava("4|meio")                                       # gravação pela metade: ignora sem erro
    assert eng.fontes_arq[1].ler(pasta) == []
    print("mod do Titanfall 2 (Northstar): arma de piloto e de titã, tiros, mira, dano e morte: ok")

    # --- Doom no GZDoom: linhas DSA| no meio do log do jogo
    pasta = _tempfile.mkdtemp()
    log = os.path.join(pasta, "dualsense_eventos.txt")
    open(log, "w").write("GZDoom g4.12 - abrindo\n")
    eng.game_exe, eng.game_dir = "gzdoom.exe", pasta
    eng.ler_fontes_arquivo(t + 110)
    with open(log, "a") as f:
        f.write("W_Init: Init WADfiles.\nDSA|inicio\nDSA|arma|SuperShotgun|?|0|20\nDSA|municao|20\nPlayer 1 entered\n")
    eng.ler_fontes_arquivo(t + 110.1)
    jd = J["doom_gzdoom"]["nome"]
    assert eng.ext_fonte.jogo == jd and eng.ext.get("arma") == "Super Shotgun", eng.ext
    ss = eng.cerebro.armas[eng.cerebro.chave(jd, "Super Shotgun")]
    assert not ss["automatica"] and ss["r2"]["efeito"] == "arma" and ss["vibra_gatilho"] >= 7
    eng.last_shot = 0
    with open(log, "a") as f:
        f.write("DSA|tiro\nDSA|municao|18\nDSA|dano|30|esquerda|70|100\n")
    eng.ler_fontes_arquivo(t + 111)
    assert eng.last_shot == t + 111 and eng.ultimo_dano[0] == "esquerda"
    with open(log, "a") as f:
        f.write("DSA|arma|BrutalPlasmaRifle|?|0|200\n")
    eng.ler_fontes_arquivo(t + 112)
    assert eng.ext.get("arma") == "Plasma Rifle" and eng.ext.get("automatica")
    print("mod do Doom (GZDoom): log do jogo, arma de mod, tiros e dano pela esquerda: ok")

    # --- BO2 no Plutonium: arquivo em %LOCALAPPDATA%
    local = _tempfile.mkdtemp()
    antes = os.environ.get("LOCALAPPDATA")
    os.environ["LOCALAPPDATA"] = local
    try:
        pasta_ev = os.path.join(local, "Plutonium", "storage", "t6", "dualsense")
        os.makedirs(pasta_ev)
        ev = os.path.join(pasta_ev, "eventos.txt")
        open(ev, "w").write("1|inicio\n")
        eng.game_exe, eng.game_dir = "plutonium-bootstrapper-win32.exe", None
        eng.ler_fontes_arquivo(t + 120)
        with open(ev, "a") as f:
            f.write("50|arma|raygun_mark2_upgraded_zm|?|0|0\n60|municao|0\n")
        eng.ler_fontes_arquivo(t + 120.1)
        jb = J["bo2"]["nome"]
        assert eng.ext.get("arma") == "Ray Gun Mark II" and eng.ext.get("municao") == 0, eng.ext
        rg = eng.cerebro.armas[eng.cerebro.chave(jb, "Ray Gun Mark II")]
        assert rg["energia"] and rg["rajada"] == 3
        _, _, _, right, _ = eng.compute(t + 120.2, 0, 0)
        assert right[0] == 0x21, right                    # pente vazio: gatilho solto
        # o que você editou na aba Armas não é desfeito quando a arma aparece de novo
        ed = dict(rg, editado=True, cadencia_rpm=123)
        eng.cerebro.salvar_arma(jb, "Ray Gun Mark II", ed)
        with open(ev, "a") as f:
            f.write("70|arma|knife_zm|?|0|0\n80|arma|raygun_mark2_zm|?|0|0\n")
        eng.ler_fontes_arquivo(t + 121)
        assert eng.cerebro.armas[eng.cerebro.chave(jb, "Ray Gun Mark II")]["cadencia_rpm"] == 123
    finally:
        if antes is None:
            os.environ.pop("LOCALAPPDATA", None)
        else:
            os.environ["LOCALAPPDATA"] = antes
    # todas as armas do jogo já aparecem na aba Armas ao abrir o jogo
    n = armas_jogos.semear(eng.cerebro, "bo2")
    assert n == len(J["bo2"]["armas"]) - 2, n           # Ray Gun Mark II (editada) e Knife já estavam
    assert eng.cerebro.armas[eng.cerebro.chave(jb, "Ray Gun Mark II")]["cadencia_rpm"] == 123
    import painel as _painel
    ch = eng.cerebro.chave(jb, "DSR 50")
    assert _painel.restaurar_arma(eng, ch) and eng.cerebro.armas[ch]["ferrolho"]
    print("mod do BO2 (Plutonium): zumbis, arma melhorada, pente vazio, edição e lista completa: ok")


def teste_mods():
    """Gerenciador do Nexus com API simulada e servidor de download local."""
    import io
    import tempfile
    import zipfile
    import http.server
    import nexus_mods as nm

    raiz = tempfile.mkdtemp()
    nm.DOWNLOADS = os.path.join(raiz, "downloads")
    nm.INSTALADOS_FILE = os.path.join(raiz, "inst.json")
    nm.BACKUP_DIR = os.path.join(raiz, "backup")
    jogo = os.path.join(raiz, "Cyberpunk 2077")
    os.makedirs(os.path.join(jogo, "bin", "x64", "plugins"))
    open(os.path.join(jogo, "bin", "x64", "plugins", "original.asi"), "w").write("ORIGINAL")

    def zip_mod(nome):
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            z.writestr(f"{nome}-1.0/bin/x64/plugins/{nome}.asi", nome)
            z.writestr(f"{nome}-1.0/r6/scripts/{nome}.reds", nome)
            if nome == "m4156":
                z.writestr("m4156-1.0/bin/x64/plugins/original.asi", "SUBSTITUIDO")
        return b.getvalue()

    class Srv(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            nome = self.path.strip("/")
            dados = zip_mod(nome)
            self.send_response(200)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Srv)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    porta = srv.server_address[1]
    chamadas = []

    class FakeAPI:
        premium = True

        def __init__(self, chave):
            pass

        def validar(self):
            return {"nome": "jogador", "premium": FakeAPI.premium}

        def mod(self, d, m):
            return {"name": f"Mod {m}", "version": "1.0", "summary": "<b>resumo</b>"}

        def arquivos(self, d, m):
            return [{"file_id": m * 10, "category_name": "OLD_VERSION", "file_name": "velho.zip", "uploaded_timestamp": 1},
                    {"file_id": m * 10 + 1, "category_name": "MAIN", "file_name": f"m{m}.zip", "version": "1.0",
                     "uploaded_timestamp": 5}]

        def link(self, d, m, f, key=None, expires=None):
            chamadas.append((m, f, key))
            if not FakeAPI.premium and not key:
                raise RuntimeError("PREMIUM")
            return f"http://127.0.0.1:{porta}/m{m}"

    cfg = {"nexus_key": "x", "pastas_jogos": {"cyberpunk2077": jogo}}
    g = nm.GerenciadorMods(cfg, lambda: None)
    g.api_factory = FakeAPI
    g.verificar_conta()
    assert g.conta["premium"]

    def esperar(ids, seg=10):
        t0 = time.time()
        while time.time() - t0 < seg:
            if all(i in g.instalados for i in ids):
                return
            erros = [g.tarefas[i]["estado"] for i in ids if g.tarefas.get(i, {}).get("erro")]
            assert not erros, erros
            time.sleep(0.05)
        raise AssertionError(("demorou", g.tarefas))

    # 1) Premium: instala o mod de gatilhos do Cyberpunk e os 4 requisitos, na ordem
    g.instalar("cp_dualsense")
    todos = ["cp_red4ext", "cp_cet", "cp_redscript", "cp_nsui", "cp_dualsense"]
    esperar(todos)
    assert [c[0] for c in chamadas] == [2380, 107, 1511, 3518, 4156], chamadas
    assert all(c[1] % 10 == 1 for c in chamadas)            # escolheu o arquivo MAIN
    asi = os.path.join(jogo, "bin", "x64", "plugins", "m4156.asi")
    assert os.path.exists(asi) and os.path.exists(os.path.join(jogo, "r6", "scripts", "m107.reds"))
    orig = os.path.join(jogo, "bin", "x64", "plugins", "original.asi")
    assert open(orig).read() == "SUBSTITUIDO"
    est = g.estado()
    cp = next(j for j in est["jogos"] if j["dominio"] == "cyberpunk2077")
    assert cp["pasta"] == jogo and all(m["instalado"] for m in cp["mods"])
    # remover devolve o arquivo original e apaga o resto
    g.remover("cp_dualsense")
    assert not os.path.exists(asi) and open(orig).read() == "ORIGINAL"
    print("Nexus Premium: baixa e instala com requisitos; remover devolve originais: ok")

    # 2) conta grátis: espera o clique no site (link nxm) e continua sozinho
    FakeAPI.premium = False
    g.verificar_conta()
    nm.nxm_status = lambda: {"nosso": True, "outro": False, "windows": True}
    nm.webbrowser.open = lambda u: chamadas.append(("abriu", u))
    g.instalar("cp_dualsense")
    for _ in range(100):
        if ("cyberpunk2077", 4156) in g.esperando_nxm:
            break
        time.sleep(0.05)
    assert "Slow download" in g.tarefas["cp_dualsense"]["estado"]
    assert any(c[0] == "abriu" and "nmm=1" in c[1] for c in chamadas)
    msg = g.receber_nxm("nxm://cyberpunk2077/mods/4156/files/41561?key=abc&expires=999&user_id=1")
    assert msg == "Continuando o download"
    esperar(["cp_dualsense"])
    assert chamadas[-1] == (4156, 41561, "abc")
    print("Nexus grátis: abre a página, recebe o clique (nxm) e instala: ok")

    # 3) clique em "Mod Manager Download" sem pedido do app: baixa mesmo assim
    g.receber_nxm("nxm://fallout4/mods/62113/files/621131?key=k&expires=1")
    esperar(["fo4_dsx"])
    assert g.instalados["fo4_dsx"].get("manual") and os.path.exists(g.instalados["fo4_dsx"]["arquivo"])
    # 4) links
    assert nm.parse_link_nexus("https://www.nexusmods.com/skyrimspecialedition/mods/66165?tab=files") == ("skyrimspecialedition", 66165)
    assert nm.parse_nxm("https://x") is None
    cid, nome = g.adicionar_link("https://www.nexusmods.com/eldenring/mods/999")
    assert cid == "x_eldenring_999" and cfg["mods_extras"][0]["desc"] == "resumo"
    # 5) nosso mod do CoD IW é copiado da pasta do app
    iw = os.path.join(raiz, "IW")
    os.makedirs(iw)
    cfg["pastas_jogos"]["iw7"] = iw
    g.instalar("iw7_dualsense")
    esperar(["iw7_dualsense"])
    assert os.path.exists(os.path.join(iw, "iw7-mod", "custom_scripts", "dualsense_auto.gsc"))
    assert "iw7-mod.exe" in g.tarefas["iw7_dualsense"]["estado"]
    # mods nossos de Titanfall 2, GZDoom e BO2 (este vai para a pasta do Plutonium)
    tf = os.path.join(raiz, "Titanfall2")
    gz = os.path.join(raiz, "gzdoom")
    os.makedirs(tf)
    os.makedirs(gz)
    open(os.path.join(gz, "gzdoom.exe"), "w").close()
    cfg["pastas_jogos"]["titanfall2"] = tf
    cfg["pastas_jogos"]["gzdoom"] = gz
    antes_la = os.environ.get("LOCALAPPDATA")
    os.environ["LOCALAPPDATA"] = os.path.join(raiz, "AppDataLocal")
    os.makedirs(os.path.join(raiz, "AppDataLocal", "Plutonium", "storage"))
    try:
        for cid in ("tf2_dualsense", "gzdoom_dualsense", "bo2_dualsense"):
            g.instalar(cid)
            esperar([cid])
        assert os.path.exists(os.path.join(tf, "R2Northstar", "mods", "DualSenseAuto", "mod", "scripts", "vscripts", "dualsense_auto.nut"))
        assert "Northstar" in g.tarefas["tf2_dualsense"]["estado"]          # falta o Northstar: avisa
        assert os.path.exists(os.path.join(gz, "dualsense_auto", "zscript.zs")) and os.path.exists(os.path.join(gz, "Doom com DualSense.bat"))
        assert g.tarefas["gzdoom_dualsense"]["estado"] == "Instalado"
        t6 = os.path.join(raiz, "AppDataLocal", "Plutonium", "storage", "t6")
        assert os.path.exists(os.path.join(t6, "scripts", "zm", "dualsense_auto.gsc"))
        assert "t6-gsc-utils" in g.tarefas["bo2_dualsense"]["estado"]
        assert not any(j["precisa_pasta"] for j in g.estado()["jogos"] if j["dominio"] == "bo2")
        g.remover("gzdoom_dualsense")
        assert not os.path.exists(os.path.join(gz, "dualsense_auto")) and os.path.exists(os.path.join(gz, "gzdoom.exe"))
    finally:
        if antes_la is None:
            os.environ.pop("LOCALAPPDATA", None)
        else:
            os.environ["LOCALAPPDATA"] = antes_la
    # 6) zip malicioso é recusado
    ruim = os.path.join(raiz, "ruim.zip")
    with zipfile.ZipFile(ruim, "w") as z:
        z.writestr("../../fora.txt", "x")
    try:
        nm.extrair(ruim, os.path.join(raiz, "ext"))
        raise AssertionError("deveria recusar")
    except RuntimeError:
        pass
    srv.shutdown()
    print("Nexus: links, mods fora da lista, mod do CoD e proteção de zip: ok")


def teste_leitor():
    """Leitor de mods: detecta o jogo, monta o plano e instala/remove."""
    import tempfile
    import zipfile
    import nexus_mods as nm
    import leitor_mods as lm
    import cerebro

    raiz = tempfile.mkdtemp()
    nm.BACKUP_DIR = os.path.join(raiz, "backup")
    nm.INSTALADOS_FILE = os.path.join(raiz, "inst2.json")

    def pasta(*p):
        d = os.path.join(raiz, *p)
        os.makedirs(d, exist_ok=True)
        return d
    cp = pasta("Cyberpunk 2077")
    pasta("Cyberpunk 2077", "bin", "x64")
    sk = pasta("Skyrim Special Edition")
    pasta("Skyrim Special Edition", "Data")
    open(os.path.join(sk, "Data", "textures_a.txt"), "w").write("x")
    re8 = pasta("Resident Evil Village")
    sb = pasta("Stellar Blade")
    pasta("Stellar Blade", "SB", "Content", "Paks")
    cfg = {"pastas_jogos": {"cyberpunk2077": cp}, "pastas_extras": [sk, re8, sb]}
    g = nm.GerenciadorMods(cfg, lambda: None)
    g.instalados = {}
    leitor = lm.LeitorMods(g, cfg)

    def mod_zip(nome, arquivos):
        caminho = os.path.join(raiz, nome)
        with zipfile.ZipFile(caminho, "w") as z:
            for k, v in arquivos.items():
                z.writestr(k, v)
        return caminho

    def analisar(caminho):
        leitor.receber(caminho)
        for _ in range(200):
            e = leitor.publico()
            if e["fase"] not in ("analisando",):
                return e
            time.sleep(0.03)
        raise AssertionError("análise travou")

    # 1) Cyberpunk já na estrutura do jogo, embrulhado numa pasta
    e = analisar(mod_zip("Gatilhos-4156-4-30-1712345678.zip", {
        "Gatilhos/bin/x64/plugins/cyber_engine_tweaks/mods/DualsenseTriggerEffects/init.lua": "x",
        "Gatilhos/r6/scripts/ds.reds": "y", "Gatilhos/readme.txt": "Cyberpunk 2077 mod. Extract to game root."}))
    assert e["fase"] == "pronto" and e["jogo"] == "Cyberpunk 2077", e
    assert {"de": "Gatilhos/r6/scripts/ds.reds", "para": "r6/scripts/ds.reds"} in e["ops"]
    assert not any("readme" in o["para"].lower() for o in e["ops"])
    cid = leitor.instalar()
    assert os.path.exists(os.path.join(cp, "bin", "x64", "plugins", "cyber_engine_tweaks", "mods",
                                       "DualsenseTriggerEffects", "init.lua"))
    assert leitor.publico()["instalados"][0]["id"] == cid
    # 2) Cyberpunk com arquivos soltos
    e = analisar(mod_zip("roupa.zip", {"CoolJacket.archive": "a", "CoolJacket.xl": "b"}))
    assert e["fase"] == "pronto" and {"de": "CoolJacket.archive", "para": "archive/pc/mod/CoolJacket.archive"} in e["ops"]
    leitor.limpar()
    print("leitor: Cyberpunk estruturado e solto: ok")

    # 3) Skyrim com instalador FOMOD em UTF-16 e namespaces
    fomod = ('<?xml version="1.0" encoding="UTF-16"?>'
             '<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
             'xsi:noNamespaceSchemaLocation="http://qconsulting.ca/fo3/ModConfig5.0.xsd">'
             '<moduleName>Teste</moduleName><requiredInstallFiles><folder source="Core" destination="" /></requiredInstallFiles>'
             '<installSteps order="Explicit"><installStep name="Texturas"><optionalFileGroups order="Explicit">'
             '<group name="Resolução" type="SelectExactlyOne"><plugins order="Explicit">'
             '<plugin name="2K"><files><folder source="OptA" destination="" /></files>'
             '<typeDescriptor><type name="Optional"/></typeDescriptor></plugin>'
             '<plugin name="4K"><files><folder source="OptB" destination="" /></files>'
             '<typeDescriptor><type name="Recommended"/></typeDescriptor></plugin>'
             '</plugins></group></optionalFileGroups></installStep></installSteps></config>').encode("utf-16")
    e = analisar(mod_zip("Texturas HD.zip", {"fomod/ModuleConfig.xml": fomod, "Core/Mod.esp": "e",
                                              "OptA/textures/a.dds": "2k", "OptB/textures/b.dds": "4k"}))
    assert e["fase"] == "pronto" and e["jogo"] == "Skyrim Special Edition", e
    paras = {o["para"] for o in e["ops"]}
    assert paras == {"Data/Mod.esp", "Data/textures/b.dds"}, paras
    assert e["fonte"] == "instalador FOMOD do mod" and any("4K" in a for a in e["avisos"])
    leitor.limpar()
    print("leitor: Skyrim com FOMOD (opção recomendada): ok")

    # 4) RE Engine e 5) Unreal descoberto pelo leia-me
    e = analisar(mod_zip("fov.zip", {"fov/reframework/autorun/fov.lua": "x"}))
    assert e["fase"] == "pronto" and e["jogo"] == "Resident Evil Village" and \
        e["ops"][0]["para"] == "reframework/autorun/fov.lua", e
    leitor.limpar()
    e = analisar(mod_zip("roupa_eve.zip", {"Roupa_P.pak": "p", "Roupa_P.utoc": "u",
                                            "LEIAME.txt": "Mod para Stellar Blade. Coloque em ~mods."}))
    assert e["fase"] == "pronto" and e["jogo"] == "Stellar Blade" and \
        {"de": "Roupa_P.pak", "para": "SB/Content/Paks/~mods/Roupa_P.pak"} in e["ops"], e
    leitor.limpar()
    print("leitor: RE Engine e Unreal (jogo pelo leia-me): ok")

    # 6) sem pista nenhuma: pede o jogo
    e = analisar(mod_zip("misterio.zip", {"coisa/arquivo.bin": "x"}))
    assert e["fase"] == "sem_jogo" and len(e["jogos"]) >= 4, e
    leitor.limpar()

    # 7) IA lendo o leia-me (simulada) + caminhos perigosos ignorados
    cfg["api_key"] = "teste"
    resposta = json.dumps({"copias": [{"de": "Files", "para": "bin/x64/"}, {"de": "Files/a.dll", "para": "../../fora.dll"}],
                           "requisitos": ["RED4ext"], "avisos": ["Edite o arquivo config.ini"],
                           "explicacao": "O leia-me manda copiar Files para bin/x64."})
    original = cerebro.ClaudeAPI.ask
    cerebro.ClaudeAPI.ask = lambda self, *a, **k: "Plano: " + resposta
    try:
        e = analisar(mod_zip("ferramenta.zip", {"Files/a.dll": "x", "Files/sub/b.dll": "y",
                                                 "README.md": "Cyberpunk 2077: copy Files into bin/x64"}))
    finally:
        cerebro.ClaudeAPI.ask = original
        cfg["api_key"] = ""
    assert e["fase"] == "pronto" and e["fonte"].startswith("IA lendo"), e
    assert {o["para"] for o in e["ops"]} == {"bin/x64/a.dll", "bin/x64/sub/b.dll"}, e["ops"]
    assert e["requisitos"] == ["RED4ext"] and "Edite o arquivo config.ini" in e["avisos"]
    leitor.instalar()
    assert os.path.exists(os.path.join(cp, "bin", "x64", "sub", "b.dll"))
    assert not os.path.exists(os.path.join(raiz, "fora.dll"))
    # 8) remover devolve tudo
    g.remover(cid)
    assert not os.path.exists(os.path.join(cp, "r6"))
    print("leitor: plano da IA, proteção de caminhos e remoção: ok")


def main():
    ap = argparse.ArgumentParser(description=APP_NAME)
    ap.add_argument("--teste", action="store_true", help="roda o auto-teste sem controle")
    ap.add_argument("--sem-janela", action="store_true", help="roda só no terminal")
    ap.add_argument("--nxm", help="link nxm:// vindo do site do Nexus Mods")
    ap.add_argument("--rumble-v2", action="store_true",
                    help="use se a vibração não funcionar (firmware novo do controle)")
    ap.add_argument("--embutido", action="store_true", help="aberto pelo Arcade Hub (painel sem janela própria)")
    ap.add_argument("--pai", type=int, default=0, help="PID do Arcade Hub: se ele fechar, este também fecha")
    ap.add_argument("--sessao", default="", help="identifica esta execução no .painel.json")
    args = ap.parse_args()
    if args.teste:
        self_test()
        return
    from painel import ja_rodando, abrir_janela, rodar_painel, enviar_nxm, outro_aberto, avisar_arcade
    if args.embutido:
        outro = outro_aberto()
        if outro:                # o DualSense Auto avulso já está usando o controle
            avisar_arcade(args.sessao, erro="ja-aberto", detalhe=outro)
            return
        eng = Engine(DualSense(rumble_v2=args.rumble_v2))
        eng.start()
        rodar_painel(eng, abrir=False, token=os.environ.get("DSA_TOKEN") or None,
                     sessao=args.sessao, pai=args.pai)
        return
    if args.nxm:                 # clique em "Mod Manager Download" no site
        enviar_nxm(args.nxm)
        return
    url = ja_rodando()
    if url:                      # já está aberto: só mostra a janela
        abrir_janela(url)
        return
    eng = Engine(DualSense(rumble_v2=args.rumble_v2))
    eng.start()
    if args.sem_janela:
        try:
            while True:
                i = eng.info
                print(f"\r{eng.status} | {i.get('jogo')} | {i.get('arma')} | {i.get('superficie')} | "
                      f"motores {eng.out}   ", end="", flush=True)
                time.sleep(0.5)
        except KeyboardInterrupt:
            eng.stop.set()
            time.sleep(0.3)
    else:
        rodar_painel(eng)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        _fatal("O app encontrou um erro:\n\n" + traceback.format_exc())
