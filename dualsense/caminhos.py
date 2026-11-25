"""Onde ficam os arquivos do DualSense Auto.

RECURSOS: arquivos que vêm com o app (painel.html, perfis.json padrão, mods/). Só leitura.
DADOS: o que o app grava (config.json, armas.json, perfis salvos, downloads, backup_mods).

Dentro do Arcade Hub, a pasta do app é substituída a cada atualização, então os dados
ficam fora dela: o Arcade Hub passa a pasta em DUALSENSE_AUTO_DADOS e, sem ela, o .exe
empacotado usa %APPDATA%\\Arcade Hub\\dualsense (a mesma pasta de dados do Arcade Hub).
Rodando direto do código-fonte, sem a variável, tudo fica na pasta do código, como antes.
"""
import os
import sys

_CONGELADO = getattr(sys, "frozen", False)

RECURSOS = getattr(sys, "_MEIPASS", None) if _CONGELADO else None
RECURSOS = RECURSOS or os.path.dirname(os.path.abspath(__file__))


def _dados():
    d = os.environ.get("DUALSENSE_AUTO_DADOS")
    if not d and _CONGELADO:
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        d = os.path.join(base, "Arcade Hub", "dualsense")
    if not d:
        d = os.path.dirname(os.path.abspath(__file__))
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return d


DADOS = _dados()


# ----------------------------------------------------------------------------
# Chaves (Claude e Nexus) cifradas no disco com a proteção do Windows (DPAPI):
# o config.json copiado para outro PC ou outro usuário não revela as chaves.
# ----------------------------------------------------------------------------
CHAVES_SECRETAS = ("api_key", "nexus_key")
_PREFIXO = "dpapi:"


def _dpapi(dados, cifrar):
    import ctypes
    from ctypes import wintypes as wt

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    fn = crypt32.CryptProtectData if cifrar else crypt32.CryptUnprotectData
    fn.argtypes = [ctypes.POINTER(BLOB), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                   ctypes.c_void_p, wt.DWORD, ctypes.POINTER(BLOB)]
    fn.restype = wt.BOOL
    k32.LocalFree.argtypes = [ctypes.c_void_p]
    buf = ctypes.create_string_buffer(dados, len(dados))
    entrada = BLOB(len(dados), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    saida = BLOB()
    # 0x1 = CRYPTPROTECT_UI_FORBIDDEN
    if not fn(ctypes.byref(entrada), None, None, None, None, 0x1, ctypes.byref(saida)):
        raise OSError(ctypes.get_last_error(), "DPAPI falhou")
    try:
        return ctypes.string_at(saida.pbData, saida.cbData)
    finally:
        k32.LocalFree(saida.pbData)


def cifrar(texto):
    if not texto or sys.platform != "win32":
        return texto
    import base64
    try:
        return _PREFIXO + base64.b64encode(_dpapi(texto.encode("utf-8"), True)).decode()
    except Exception:
        return texto


def decifrar(texto):
    if not isinstance(texto, str) or not texto.startswith(_PREFIXO):
        return texto
    if sys.platform != "win32":
        return ""
    import base64
    try:
        return _dpapi(base64.b64decode(texto[len(_PREFIXO):]), False).decode("utf-8")
    except Exception:
        return ""      # de outro PC/usuário: a chave precisa ser colada de novo
