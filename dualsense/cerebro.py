"""O "cérebro" do app: olha a tela com IA (Claude) para entender o jogo, a arma na mão,
o clima, o terreno e de onde veio o dano. Também pesquisa cada arma nova e monta
um setup de gatilho para ela, salvando em armas.json."""
import base64
import json
import os
import queue
import struct
import sys
import threading
import time
import urllib.error
import urllib.request
import zlib

import numpy as np

from caminhos import DADOS as APP_DIR, CHAVES_SECRETAS, cifrar, decifrar  # noqa: E402
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
ARMAS_FILE = os.path.join(APP_DIR, "armas.json")

CONFIG_PADRAO = {
    "api_key": "",
    "modelo_visao": "claude-haiku-5-5",
    "modelo_pesquisa": "claude-sonnet-5-5",
    "intervalo_visao_s": 4,
    "largura_captura": 1024,
    "visao_ativa": True,
    "pesquisar_web": True,
    "emular_xbox": True,
    "xbox_so_no_jogo": True,     # o Xbox virtual só existe com um jogo na frente (no Windows ele vira setas/Enter)
    "porta_mods": 6969,
}

TIPOS_ARMA = ["pistola", "revolver", "smg", "fuzil", "metralhadora", "escopeta", "sniper",
              "arco", "lancador", "granada", "energia", "corpo_a_corpo", "nenhuma"]
SUPERFICIES = ["asfalto", "terra", "lama", "cascalho", "grama", "areia", "neve", "gelo",
               "agua", "zebra", "metal", "madeira", "desconhecido"]


# ----------------------------------------------------------------------------
# Setups padrão por tipo de arma (usados na hora, enquanto a pesquisa não chega)
# ----------------------------------------------------------------------------
def _e(efeito, inicio=0, fim=9, forca=0, forca_fim=None, frequencia=0):
    d = {"efeito": efeito, "inicio": inicio, "fim": fim, "forca": forca, "frequencia": frequencia}
    if forca_fim is not None:
        d["forca_fim"] = forca_fim
    return d


TEMPLATES = {
    "pistola":       dict(r2=_e("arma", 4, 6, 5), l2=_e("resistencia", 2, forca=2), automatica=False, cadencia_rpm=350, coice=0.5, vibra_gatilho=3),
    "revolver":      dict(r2=_e("arma", 5, 8, 7), l2=_e("resistencia", 2, forca=2), automatica=False, cadencia_rpm=120, coice=0.85, vibra_gatilho=5),
    "smg":           dict(r2=_e("resistencia", 3, forca=2), l2=_e("resistencia", 2, forca=1), automatica=True, cadencia_rpm=900, coice=0.3, vibra_gatilho=4),
    "fuzil":         dict(r2=_e("arma", 4, 6, 4), l2=_e("resistencia", 2, forca=2), automatica=True, cadencia_rpm=700, coice=0.5, vibra_gatilho=5),
    "metralhadora":  dict(r2=_e("rampa", 2, 9, 2, forca_fim=6), l2=_e("resistencia", 2, forca=3), automatica=True, cadencia_rpm=650, coice=0.65, vibra_gatilho=7),
    "escopeta":      dict(r2=_e("arma", 3, 7, 8), l2=_e("resistencia", 2, forca=2), automatica=False, cadencia_rpm=70, coice=1.0, vibra_gatilho=8),
    "sniper":        dict(r2=_e("arma", 5, 8, 8), l2=_e("resistencia", 2, forca=3), automatica=False, cadencia_rpm=45, coice=1.0, vibra_gatilho=8),
    "arco":          dict(r2=_e("rampa", 0, 9, 1, forca_fim=8), l2=_e("resistencia", 3, forca=1), automatica=False, cadencia_rpm=40, coice=0.6, vibra_gatilho=0),
    "lancador":      dict(r2=_e("arma", 4, 8, 8), l2=_e("resistencia", 2, forca=3), automatica=False, cadencia_rpm=30, coice=1.0, vibra_gatilho=8),
    "energia":       dict(r2=_e("resistencia", 2, forca=2), l2=_e("resistencia", 2, forca=1), automatica=True, cadencia_rpm=1500, coice=0.2, vibra_gatilho=4),
    "granada":       dict(r2=_e("resistencia", 6, forca=3), l2=_e("resistencia", 4, forca=1), automatica=False, cadencia_rpm=30, coice=0.2, vibra_gatilho=0),
    "corpo_a_corpo": dict(r2=_e("resistencia", 5, forca=3), l2=_e("resistencia", 4, forca=2), automatica=False, cadencia_rpm=90, coice=0.5, vibra_gatilho=0),
    "nenhuma":       dict(r2=_e("resistencia", 3, forca=1), l2=_e("resistencia", 3, forca=1), automatica=False, cadencia_rpm=0, coice=0.3, vibra_gatilho=0),
}


def template(tipo):
    t = TEMPLATES.get(tipo or "nenhuma", TEMPLATES["nenhuma"])
    d = json.loads(json.dumps(t))
    d["tipo"] = tipo if tipo in TEMPLATES else "nenhuma"
    d["fonte"] = "padrão do tipo"
    return d


# ----------------------------------------------------------------------------
# Configuração e arquivos
# ----------------------------------------------------------------------------
def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def load_config():
    c = dict(CONFIG_PADRAO)
    c.update(load_json(CONFIG_FILE, {}))
    for k in CHAVES_SECRETAS:
        if k in c:
            c[k] = decifrar(c[k])
    if not c.get("api_key"):
        c["api_key"] = os.environ.get("ANTHROPIC_API_KEY", "")
    return c


def save_config(cfg):
    """Grava o config.json com as chaves cifradas (a cópia em memória continua legível)."""
    disco = dict(cfg)
    for k in CHAVES_SECRETAS:
        if disco.get(k):
            disco[k] = cifrar(disco[k])
    save_json(CONFIG_FILE, disco)


def extract_json(text):
    """Pega o primeiro objeto JSON que aparecer no texto da IA."""
    if not text:
        return None
    s = text.find("{")
    e = text.rfind("}")
    if s < 0 or e <= s:
        return None
    try:
        return json.loads(text[s:e + 1])
    except Exception:
        return None


# ----------------------------------------------------------------------------
# Captura de tela -> PNG (sem Pillow)
# ----------------------------------------------------------------------------
def png_encode(rgb):
    h, w, _ = rgb.shape
    raw = np.hstack([np.zeros((h, 1), np.uint8), rgb.reshape(h, w * 3)]).tobytes()

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


class ScreenGrab:
    def __init__(self):
        self.sct = None

    def grab(self, max_w=1024):
        import mss
        if self.sct is None:
            self.sct = mss.mss()
        mon = self.sct.monitors[1]
        img = self.sct.grab(mon)
        a = np.frombuffer(img.bgra, np.uint8).reshape(img.height, img.width, 4)
        k = max(1, int(np.ceil(img.width / max_w)))
        rgb = np.ascontiguousarray(a[::k, ::k, 2::-1])
        return png_encode(rgb)


# ----------------------------------------------------------------------------
# Cliente da API do Claude (só biblioteca padrão)
# ----------------------------------------------------------------------------
class ClaudeAPI:
    URL = "https://api.anthropic.com/v1/messages"

    def __init__(self, key):
        self.key = key

    def ask(self, model, content, max_tokens=700, tools=None, system=None, timeout=90):
        body = {"model": model, "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": content}]}
        if system:
            body["system"] = system
        if tools:
            body["tools"] = tools
        req = urllib.request.Request(
            self.URL, data=json.dumps(body).encode(), method="POST",
            headers={"x-api-key": self.key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                msg = ""
            raise RuntimeError(f"API {e.code}: {msg}") from None
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")


PROMPT_VISAO = """Você é o sistema de percepção de um app que controla a vibração e os gatilhos adaptáveis de um DualSense.
Analise esta captura de tela de um jogo de PC. Dica do sistema: processo "{exe}", janela "{titulo}".
Responda SOMENTE com um JSON válido, sem texto fora dele, neste formato:
{{
 "jogo": "nome do jogo",
 "situacao": "a_pe" | "veiculo" | "menu" | "cutscene" | "outro",
 "arma": "nome exato da arma que o personagem está segurando, como aparece no HUD, ou null",
 "tipo_arma": one of {tipos},
 "modo_disparo": "auto" | "semi" | "rajada" | "ferrolho" | null,
 "mirando": true/false,
 "chuva": 0.0 a 1.0,
 "neve": 0.0 a 1.0,
 "veiculo": "carro" | "moto" | "aviao" | "barco" | "cavalo" | null,
 "superficie": one of {superficies},
 "dano_direcao": "frente" | "tras" | "esquerda" | "direita" | null,
 "vida_baixa": true/false
}}
Regras: "dano_direcao" só se houver um indicador de dano visível AGORA (setas/arcos vermelhos na tela ou bordas vermelhas de um lado).
"superficie" é o chão sob o personagem ou sob as rodas. Se não tiver certeza, use null, 0 ou "desconhecido"."""

PROMPT_ARMA = """Monte o setup de gatilhos adaptáveis do DualSense para a arma "{arma}" do jogo "{jogo}" (tipo provável: {tipo}).
{pesquisa}
Os gatilhos têm 10 zonas de curso (0 = solto, 9 = fundo) e força de 0 a 8.
Efeitos possíveis:
- "arma": resiste entre "inicio" (2-7) e "fim" (inicio+1 a 8) e depois cede com um clique (gatilho de arma);
- "resistencia": resistência constante a partir de "inicio";
- "rampa": resistência que cresce de "forca" (em "inicio") até "forca_fim" (em "fim"); bom para arcos e armas pesadas;
- "vibracao": gatilho vibrando a partir de "inicio" com "frequencia" em Hz;
- "nenhum".
Pense como a arma real se comporta: peso do gatilho, recuo, cadência (tiros por minuto), se é automática.
Responda SOMENTE com um JSON:
{{"tipo": one of {tipos},
 "r2": {{"efeito": "...", "inicio": 0-9, "fim": 0-9, "forca": 0-8, "forca_fim": 0-8, "frequencia": 0-255}},
 "l2": {{"efeito": "...", "inicio": 0-9, "fim": 0-9, "forca": 0-8}},
 "automatica": true/false,
 "cadencia_rpm": número,
 "coice": 0.0 a 1.0,
 "vibra_gatilho": 0-8,
 "resumo": "uma frase em português sobre a arma"}}"""


class Cerebro:
    def __init__(self, config, hint_fn):
        self.cfg = config
        self.hint_fn = hint_fn          # -> (exe, titulo, jogo_em_primeiro_plano: bool)
        self.estado = {}
        self.t_estado = 0.0
        self.seq = 0                    # incrementa a cada nova leitura
        self.status = "Visão IA: aguardando"
        self.pesquisa_status = ""
        self.armas = load_json(ARMAS_FILE, {})
        self.fila = queue.Queue()
        self.pendentes = set()
        self.lock = threading.Lock()
        self.grab = ScreenGrab()

    # ---------- banco de armas
    @staticmethod
    def chave(jogo, arma):
        return f"{(jogo or '?').strip().lower()}|{(arma or '').strip().lower()}"

    def perfil_arma(self, jogo, arma, tipo):
        """Setup da arma: do banco (pesquisado) ou, enquanto isso, o padrão do tipo."""
        if not arma:
            return template(tipo or "nenhuma")
        k = self.chave(jogo, arma)
        with self.lock:
            p = self.armas.get(k)
            if p:
                return p
            if k not in self.pendentes and self.cfg.get("api_key"):
                self.pendentes.add(k)
                self.fila.put((jogo, arma, tipo))
        return template(tipo)

    def salvar_arma(self, jogo, arma, perfil):
        with self.lock:
            self.armas[self.chave(jogo, arma)] = perfil
            save_json(ARMAS_FILE, self.armas)

    # ---------- laços
    def fresco(self, max_idade=None):
        idade = time.time() - self.t_estado
        lim = max_idade or (self.cfg.get("intervalo_visao_s", 4) * 3 + 5)
        return self.estado if idade < lim else {}

    def loop_visao(self, stop):
        while not stop.is_set():
            intervalo = max(1.0, float(self.cfg.get("intervalo_visao_s", 4)))
            if not self.cfg.get("visao_ativa"):
                self.status = "Visão IA: desligada"
                stop.wait(1)
                continue
            if not self.cfg.get("api_key"):
                self.status = "Visão IA: coloque sua chave da API para ativar"
                stop.wait(1)
                continue
            exe, titulo, em_jogo = self.hint_fn()
            if em_jogo == "mod":
                self.status = "Visão IA: pausada — este jogo está mandando dados exatos pelo mod"
                stop.wait(1)
                continue
            if not em_jogo:
                self.status = "Visão IA: esperando um jogo em primeiro plano"
                stop.wait(1)
                continue
            t0 = time.time()
            try:
                png = self.grab.grab(int(self.cfg.get("largura_captura", 1024)))
                api = ClaudeAPI(self.cfg["api_key"])
                prompt = PROMPT_VISAO.format(exe=exe, titulo=titulo, tipos=TIPOS_ARMA, superficies=SUPERFICIES)
                txt = api.ask(self.cfg["modelo_visao"], [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                                 "data": base64.b64encode(png).decode()}},
                    {"type": "text", "text": prompt}], max_tokens=400, timeout=30)
                est = extract_json(txt)
                if est is None:
                    raise RuntimeError("resposta da IA sem JSON")
                self.estado = est
                self.t_estado = time.time()
                self.seq += 1
                self.status = f"Visão IA: ok ({time.time() - t0:.1f} s por leitura)"
            except Exception as e:
                self.status = f"Visão IA: erro - {e}"
                stop.wait(5)
            stop.wait(max(0.0, intervalo - (time.time() - t0)))

    def loop_pesquisa(self, stop):
        while not stop.is_set():
            try:
                jogo, arma, tipo = self.fila.get(timeout=0.5)
            except queue.Empty:
                continue
            self.pesquisa_status = f"Pesquisando: {arma} ({jogo})..."
            api = ClaudeAPI(self.cfg["api_key"])
            web = bool(self.cfg.get("pesquisar_web"))
            prompt = PROMPT_ARMA.format(
                arma=arma, jogo=jogo, tipo=tipo, tipos=TIPOS_ARMA,
                pesquisa=("Pesquise na web as características da arma NESTE jogo (cadência, tipo, modo de disparo, "
                          "dano/recuo) antes de responder." if web else ""))
            perfil = None
            for usar_web in ([True, False] if web else [False]):
                try:
                    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}] if usar_web else None
                    txt = api.ask(self.cfg["modelo_pesquisa"], [{"type": "text", "text": prompt}],
                                  max_tokens=1500, tools=tools, timeout=120)
                    perfil = extract_json(txt)
                    if perfil:
                        perfil["fonte"] = "pesquisa na web" if usar_web else "conhecimento da IA"
                        break
                except Exception as e:
                    self.pesquisa_status = f"Pesquisa falhou ({e}), tentando de novo..."
            if perfil:
                base = template(perfil.get("tipo", tipo))
                base.update(perfil)
                self.salvar_arma(jogo, arma, base)
                self.pesquisa_status = f"Setup pronto: {arma} — {perfil.get('resumo', '')}"
            else:
                self.pesquisa_status = f"Não consegui pesquisar {arma}; usando o padrão do tipo"
            with self.lock:
                self.pendentes.discard(self.chave(jogo, arma))

    def start(self, stop):
        threading.Thread(target=self.loop_visao, args=(stop,), daemon=True).start()
        threading.Thread(target=self.loop_pesquisa, args=(stop,), daemon=True).start()
