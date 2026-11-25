"""Comunicação com o DualSense: gatilhos adaptáveis, vibração, luz e leitura de botões.
Windows: API HID nativa via ctypes (não precisa compilar nada)."""
import sys
import threading
import time
import zlib

SONY_VID = 0x054C
DS_PIDS = {0x0CE6: "DualSense", 0x0DF2: "DualSense Edge"}


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


# ----------------------------------------------------------------------------
# Efeitos dos gatilhos adaptáveis (formato de 11 bytes do firmware do DualSense)
# ----------------------------------------------------------------------------
class Trig:
    @staticmethod
    def off():
        return (0x05,) + (0,) * 10

    @staticmethod
    def _zones(strengths):
        """strengths: 10 valores 0..8 (uma força por zona do curso do gatilho)."""
        active = forces = 0
        for i, s in enumerate(strengths):
            s = int(clamp(round(s), 0, 8))
            if s > 0:
                active |= 1 << i
                forces |= (s - 1) << (3 * i)
        return active, forces

    @staticmethod
    def feedback_zones(strengths):
        a, f = Trig._zones(strengths)
        if a == 0:
            return Trig.off()
        return (0x21, a & 0xFF, a >> 8, f & 0xFF, (f >> 8) & 0xFF, (f >> 16) & 0xFF, (f >> 24) & 0xFF, 0, 0, 0, 0)

    @staticmethod
    def feedback(start, strength):
        """Resistência constante a partir da zona `start` (0-9), força 0-8."""
        return Trig.feedback_zones([strength if i >= start else 0 for i in range(10)])

    @staticmethod
    def slope(start, end, s0, s1):
        """Resistência que vai aumentando (ótimo para freio)."""
        z = []
        for i in range(10):
            if i < start:
                z.append(0)
            elif i >= end:
                z.append(s1)
            else:
                z.append(s0 + (s1 - s0) * (i - start) / max(1, end - start))
        return Trig.feedback_zones(z)

    @staticmethod
    def weapon(start, end, strength):
        """'Clique' de gatilho de arma: resiste entre start e end e depois cede."""
        start = int(clamp(start, 2, 7))
        end = int(clamp(end, start + 1, 8))
        strength = int(clamp(round(strength), 0, 8))
        if strength == 0:
            return Trig.off()
        sz = (1 << start) | (1 << end)
        return (0x25, sz & 0xFF, sz >> 8, strength - 1, 0, 0, 0, 0, 0, 0, 0)

    @staticmethod
    def bow(start, end, strength, snap):
        """Arco: resiste até 'end' e depois dá um tranco (snap) ao soltar."""
        start = int(clamp(start, 0, 8))
        end = int(clamp(end, start + 1, 8))
        strength = int(clamp(round(strength), 0, 8))
        snap = int(clamp(round(snap), 1, 8))
        if strength == 0:
            return Trig.off()
        sz = (1 << start) | (1 << end)
        fp = ((strength - 1) & 7) | (((snap - 1) & 7) << 3)
        return (0x22, sz & 0xFF, sz >> 8, fp & 0xFF, fp >> 8, 0, 0, 0, 0, 0, 0)

    @staticmethod
    def vibration(position, amplitude, freq):
        """Gatilho vibrando a partir de `position`, amplitude 0-8, frequência em Hz."""
        amplitude = clamp(round(amplitude), 0, 8)
        freq = int(clamp(freq, 1, 255))
        if amplitude == 0:
            return Trig.off()
        a, f = Trig._zones([amplitude if i >= position else 0 for i in range(10)])
        return (0x26, a & 0xFF, a >> 8, f & 0xFF, (f >> 8) & 0xFF, (f >> 16) & 0xFF, (f >> 24) & 0xFF, 0, 0, freq, 0)


# ----------------------------------------------------------------------------
# Comunicação com o controle (HID, USB e Bluetooth)
# ----------------------------------------------------------------------------
def build_output_report(bt, seq, motor_l, motor_r, left, right, rgb,
                        hd_mode=False, rumble_v2=False, first=False):
    c = bytearray(47)
    c[0] = 0x04 | 0x08  # permitir efeito no gatilho direito e esquerdo
    if not hd_mode:
        c[0] |= 0x02  # haptics select
        if rumble_v2:
            c[38] |= 0x04
        else:
            c[0] |= 0x01  # vibração compatível (rumble)
        c[2] = int(clamp(motor_r, 0, 255))
        c[3] = int(clamp(motor_l, 0, 255))
    c[1] = 0x04  # controlar a barra de luz
    c[10:21] = bytes(right)
    c[21:32] = bytes(left)
    if first:
        c[38] |= 0x02
        c[41] = 0x02  # apaga a animação azul padrão
    c[44:47] = bytes(int(clamp(v, 0, 255)) for v in rgb)

    if not bt:
        return bytes([0x02]) + bytes(c)  # 48 bytes

    r = bytearray(78)
    r[0] = 0x31
    r[1] = (seq << 4) & 0xF0
    r[2] = 0x10
    r[3:50] = c
    crc = zlib.crc32(bytes([0xA2]) + bytes(r[:74])) & 0xFFFFFFFF
    r[74:78] = crc.to_bytes(4, "little")
    return bytes(r)


class WinHid:
    """Acesso HID direto pela API do Windows (ctypes), sem bibliotecas compiladas."""

    _api = None

    @classmethod
    def api(cls):
        if cls._api:
            return cls._api
        import ctypes
        from ctypes import wintypes as wt

        class GUID(ctypes.Structure):
            _fields_ = [("Data1", wt.DWORD), ("Data2", wt.WORD), ("Data3", wt.WORD), ("Data4", ctypes.c_ubyte * 8)]

        class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
            _fields_ = [("cbSize", wt.DWORD), ("InterfaceClassGuid", GUID),
                        ("Flags", wt.DWORD), ("Reserved", ctypes.c_size_t)]

        class HIDD_ATTRIBUTES(ctypes.Structure):
            _fields_ = [("Size", wt.ULONG), ("VendorID", wt.USHORT),
                        ("ProductID", wt.USHORT), ("VersionNumber", wt.USHORT)]

        class HIDP_CAPS(ctypes.Structure):
            _fields_ = [("Usage", wt.USHORT), ("UsagePage", wt.USHORT),
                        ("InputReportByteLength", wt.USHORT), ("OutputReportByteLength", wt.USHORT),
                        ("FeatureReportByteLength", wt.USHORT), ("Reserved", wt.USHORT * 17),
                        ("Counts", wt.USHORT * 10)]

        class OVERLAPPED(ctypes.Structure):
            _fields_ = [("Internal", ctypes.c_size_t), ("InternalHigh", ctypes.c_size_t),
                        ("Offset", wt.DWORD), ("OffsetHigh", wt.DWORD), ("hEvent", wt.HANDLE)]

        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        sapi = ctypes.WinDLL("setupapi", use_last_error=True)
        hid = ctypes.WinDLL("hid", use_last_error=True)
        P = ctypes.POINTER
        k32.CreateFileW.argtypes = [wt.LPCWSTR, wt.DWORD, wt.DWORD, ctypes.c_void_p, wt.DWORD, wt.DWORD, wt.HANDLE]
        k32.CreateFileW.restype = wt.HANDLE
        k32.CloseHandle.argtypes = [wt.HANDLE]
        k32.CreateEventW.argtypes = [ctypes.c_void_p, wt.BOOL, wt.BOOL, wt.LPCWSTR]
        k32.CreateEventW.restype = wt.HANDLE
        k32.ResetEvent.argtypes = [wt.HANDLE]
        k32.ReadFile.argtypes = [wt.HANDLE, ctypes.c_void_p, wt.DWORD, ctypes.c_void_p, P(OVERLAPPED)]
        k32.WriteFile.argtypes = [wt.HANDLE, ctypes.c_void_p, wt.DWORD, ctypes.c_void_p, P(OVERLAPPED)]
        k32.GetOverlappedResult.argtypes = [wt.HANDLE, P(OVERLAPPED), P(wt.DWORD), wt.BOOL]
        k32.WaitForSingleObject.argtypes = [wt.HANDLE, wt.DWORD]
        k32.WaitForSingleObject.restype = wt.DWORD
        k32.CancelIoEx.argtypes = [wt.HANDLE, ctypes.c_void_p]
        sapi.SetupDiGetClassDevsW.argtypes = [P(GUID), wt.LPCWSTR, wt.HWND, wt.DWORD]
        sapi.SetupDiGetClassDevsW.restype = wt.HANDLE
        sapi.SetupDiEnumDeviceInterfaces.argtypes = [wt.HANDLE, ctypes.c_void_p, P(GUID), wt.DWORD,
                                                     P(SP_DEVICE_INTERFACE_DATA)]
        sapi.SetupDiGetDeviceInterfaceDetailW.argtypes = [wt.HANDLE, P(SP_DEVICE_INTERFACE_DATA), ctypes.c_void_p,
                                                          wt.DWORD, P(wt.DWORD), ctypes.c_void_p]
        sapi.SetupDiDestroyDeviceInfoList.argtypes = [wt.HANDLE]
        hid.HidD_GetHidGuid.argtypes = [P(GUID)]
        hid.HidD_GetAttributes.argtypes = [wt.HANDLE, P(HIDD_ATTRIBUTES)]
        hid.HidD_GetPreparsedData.argtypes = [wt.HANDLE, P(ctypes.c_void_p)]
        hid.HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
        hid.HidP_GetCaps.argtypes = [ctypes.c_void_p, P(HIDP_CAPS)]
        hid.HidP_GetCaps.restype = ctypes.c_long
        hid.HidD_GetFeature.argtypes = [wt.HANDLE, ctypes.c_void_p, wt.ULONG]
        cls._api = dict(ct=ctypes, wt=wt, k32=k32, sapi=sapi, hid=hid, GUID=GUID,
                        IFD=SP_DEVICE_INTERFACE_DATA, ATTR=HIDD_ATTRIBUTES, CAPS=HIDP_CAPS, OV=OVERLAPPED)
        return cls._api

    @classmethod
    def _paths(cls):
        A = cls.api()
        ct, sapi = A["ct"], A["sapi"]
        guid = A["GUID"]()
        A["hid"].HidD_GetHidGuid(ct.byref(guid))
        info = sapi.SetupDiGetClassDevsW(ct.byref(guid), None, None, 0x02 | 0x10)  # PRESENT | DEVICEINTERFACE
        if not info or info == ct.c_void_p(-1).value:
            return []
        out = []
        try:
            i = 0
            while True:
                ifd = A["IFD"]()
                ifd.cbSize = ct.sizeof(ifd)
                if not sapi.SetupDiEnumDeviceInterfaces(info, None, ct.byref(guid), i, ct.byref(ifd)):
                    break
                i += 1
                need = A["wt"].DWORD()
                sapi.SetupDiGetDeviceInterfaceDetailW(info, ct.byref(ifd), None, 0, ct.byref(need), None)
                buf = ct.create_string_buffer(need.value + 8)
                ct.cast(buf, ct.POINTER(A["wt"].DWORD))[0] = 8 if ct.sizeof(ct.c_void_p) == 8 else 6
                if sapi.SetupDiGetDeviceInterfaceDetailW(info, ct.byref(ifd), buf, need.value, None, None):
                    out.append(ct.wstring_at(ct.addressof(buf) + 4))
        finally:
            sapi.SetupDiDestroyDeviceInfoList(info)
        return out

    @classmethod
    def find(cls, vid, pids):
        """Devolve (WinHid, pid, tamanho_relatorio_entrada) do primeiro DualSense encontrado."""
        A = cls.api()
        ct, k32, hid = A["ct"], A["k32"], A["hid"]
        INVALID = ct.c_void_p(-1).value
        for path in cls._paths():
            h = k32.CreateFileW(path, 0, 3, None, 3, 0, None)  # só consulta
            if not h or h == INVALID:
                continue
            try:
                attr = A["ATTR"]()
                attr.Size = ct.sizeof(attr)
                if not hid.HidD_GetAttributes(h, ct.byref(attr)):
                    continue
                if attr.VendorID != vid or attr.ProductID not in pids:
                    continue
                pp = ct.c_void_p()
                if not hid.HidD_GetPreparsedData(h, ct.byref(pp)):
                    continue
                caps = A["CAPS"]()
                hid.HidP_GetCaps(pp, ct.byref(caps))
                hid.HidD_FreePreparsedData(pp)
                if caps.UsagePage != 1 or caps.Usage != 5:
                    continue
            finally:
                k32.CloseHandle(h)
            dev = cls(path, caps.InputReportByteLength, caps.OutputReportByteLength)
            return dev, attr.ProductID, caps.InputReportByteLength
        return None

    def __init__(self, path, in_len, out_len):
        A = self.api()
        ct, k32 = A["ct"], A["k32"]
        self.A = A
        h = k32.CreateFileW(path, 0xC0000000, 3, None, 3, 0x40000000, None)  # RW, compartilhado, overlapped
        if not h or h == ct.c_void_p(-1).value:
            raise OSError(f"não consegui abrir o controle (erro {ct.get_last_error()})")
        self.h = h
        self.in_len = max(in_len, 1)
        self.out_len = max(out_len, 1)
        self.rbuf = ct.create_string_buffer(self.in_len)
        self.rov = A["OV"]()
        self.rov.hEvent = k32.CreateEventW(None, True, False, None)
        self.wov = A["OV"]()
        self.wov.hEvent = k32.CreateEventW(None, True, False, None)
        self.pending = False

    def read(self, n=None):
        A = self.A
        ct, k32 = A["ct"], A["k32"]
        if not self.pending:
            k32.ResetEvent(self.rov.hEvent)
            ok = k32.ReadFile(self.h, self.rbuf, self.in_len, None, ct.byref(self.rov))
            if not ok:
                err = ct.get_last_error()
                if err != 997:  # ERROR_IO_PENDING
                    raise OSError(f"erro de leitura {err}")
            self.pending = True
        if k32.WaitForSingleObject(self.rov.hEvent, 0) != 0:
            return []
        got = A["wt"].DWORD()
        self.pending = False
        if not k32.GetOverlappedResult(self.h, ct.byref(self.rov), ct.byref(got), False):
            raise OSError(f"erro de leitura {ct.get_last_error()}")
        return list(self.rbuf.raw[:got.value])

    def read_wait(self, timeout_ms):
        r = self.read()
        if r:
            return r
        self.A["k32"].WaitForSingleObject(self.rov.hEvent, int(timeout_ms))
        return self.read()

    def write(self, data):
        A = self.A
        ct, k32 = A["ct"], A["k32"]
        data = bytes(data)[:self.out_len].ljust(self.out_len, b"\0")
        buf = ct.create_string_buffer(data, len(data))
        k32.ResetEvent(self.wov.hEvent)
        ok = k32.WriteFile(self.h, buf, len(data), None, ct.byref(self.wov))
        if not ok and ct.get_last_error() != 997:
            raise OSError(f"erro de escrita {ct.get_last_error()}")
        if k32.WaitForSingleObject(self.wov.hEvent, 250) != 0:
            k32.CancelIoEx(self.h, ct.byref(self.wov))
        got = A["wt"].DWORD()
        k32.GetOverlappedResult(self.h, ct.byref(self.wov), ct.byref(got), True)
        return got.value

    def get_feature_report(self, report_id, length):
        ct = self.A["ct"]
        buf = ct.create_string_buffer(length)
        buf[0] = report_id
        if not self.A["hid"].HidD_GetFeature(self.h, buf, length):
            raise OSError("falha ao ler feature report")
        return list(buf.raw)

    def close(self):
        k32 = self.A["k32"]
        try:
            k32.CancelIoEx(self.h, None)
        except Exception:
            pass
        for hd in (self.h, self.rov.hEvent, self.wov.hEvent):
            try:
                k32.CloseHandle(hd)
            except Exception:
                pass


# ----------------------------------------------------------------------------
# Estado de entrada (botões, analógicos, gatilhos)
# ----------------------------------------------------------------------------
class PadState:
    __slots__ = ("lx", "ly", "rx", "ry", "l2", "r2", "b0", "b1", "b2", "t")

    def __init__(self):
        self.lx = self.ly = self.rx = self.ry = 128
        self.l2 = self.r2 = 0
        self.b0 = 0x08  # direcional solto
        self.b1 = self.b2 = 0
        self.t = 0.0


def parse_input(r, st):
    """Preenche PadState a partir de um relatório de entrada. Devolve True se reconheceu."""
    n = len(r)
    if r[0] == 0x01 and n >= 64:      # USB
        base = 1
    elif r[0] == 0x31 and n >= 12:    # Bluetooth completo
        base = 2
    elif r[0] == 0x01 and n >= 10:    # Bluetooth simplificado
        st.lx, st.ly, st.rx, st.ry = r[1], r[2], r[3], r[4]
        st.b0, st.b1, st.b2 = r[5], r[6], r[7]
        st.l2, st.r2 = r[8], r[9]
        st.t = time.time()
        return True
    else:
        return False
    st.lx, st.ly, st.rx, st.ry = r[base], r[base + 1], r[base + 2], r[base + 3]
    st.l2, st.r2 = r[base + 4], r[base + 5]
    st.b0, st.b1, st.b2 = r[base + 7], r[base + 8], r[base + 9]
    st.t = time.time()
    return True


class DualSense:
    def __init__(self, rumble_v2=False):
        self.dev = None
        self.bt = False
        self.seq = 0
        self.name = ""
        self.rumble_v2 = rumble_v2
        self.hd_mode = False
        self.first = True
        self.state = PadState()
        self.on_input = None  # callback(PadState) a cada relatório recebido
        self.wlock = threading.Lock()

    @property
    def connected(self):
        return self.dev is not None

    @property
    def l2(self):
        return self.state.l2

    @property
    def r2(self):
        return self.state.r2

    def connect(self):
        if sys.platform == "win32":
            found = WinHid.find(SONY_VID, set(DS_PIDS))
            if not found:
                return False
            dev, pid, in_len = found
            self.bt = in_len >= 78  # USB = 64 bytes, Bluetooth = 78
            name = DS_PIDS[pid]
        else:
            try:
                import hid
            except ImportError:
                raise RuntimeError("Biblioteca 'hidapi' não instalada (pip install hidapi)")
            cands = [d for d in hid.enumerate(SONY_VID) if d.get("product_id") in DS_PIDS]
            if not cands:
                return False
            d = cands[0]
            dev = hid.device()
            dev.open_path(d["path"])
            dev.set_nonblocking(1)
            self.bt = d.get("bus_type") == 2
            name = DS_PIDS[d["product_id"]]
        if self.bt:
            try:  # faz o controle mandar os relatórios completos pelo Bluetooth
                dev.get_feature_report(0x05, 41)
            except Exception:
                pass
        self.name = name
        self.first = True
        self.dev = dev
        return True

    def close(self):
        dev, self.dev = self.dev, None
        if dev:
            try:
                dev.close()
            except Exception:
                pass

    def read_once(self, timeout_ms=8):
        dev = self.dev
        if not dev:
            time.sleep(timeout_ms / 1000)
            return False
        try:
            if hasattr(dev, "read_wait"):
                r = dev.read_wait(timeout_ms)
            else:
                r = dev.read(80)
                if not r:
                    time.sleep(0.002)
            if r and parse_input(r, self.state):
                if r[0] == 0x31:
                    self.bt = True
                if self.on_input:
                    self.on_input(self.state)
                return True
        except Exception:
            self.close()
        return False

    def send(self, motor_l, motor_r, left, right, rgb):
        dev = self.dev
        if not dev:
            return
        with self.wlock:
            rep = build_output_report(self.bt, self.seq, motor_l, motor_r, left, right, rgb,
                                      self.hd_mode, self.rumble_v2, self.first)
            self.seq = (self.seq + 1) & 0x0F
            self.first = False
            try:
                dev.write(rep)
            except Exception:
                self.close()

    def reset(self):
        self.send(0, 0, Trig.off(), Trig.off(), (0, 0, 255))


class FakeDualSense(DualSense):
    """Controle simulado, usado no modo --teste."""

    def __init__(self):
        super().__init__()
        self.name = "Simulado"
        self.sent = []

    def connect(self):
        self.dev = object()
        return True

    def read_once(self, timeout_ms=8):
        time.sleep(timeout_ms / 1000)
        return False

    def send(self, motor_l, motor_r, left, right, rgb):
        rep = build_output_report(self.bt, self.seq, motor_l, motor_r, left, right, rgb, self.hd_mode)
        self.seq = (self.seq + 1) & 0x0F
        self.sent.append((motor_l, motor_r, left, right, rep))


def trig_info(t):
    """Descreve um efeito de gatilho para a interface: nome, força por zona (0-8) e frequência."""
    m = t[0]
    z = [0] * 10
    if m in (0x21, 0x26):
        active = t[1] | (t[2] << 8)
        forces = t[3] | (t[4] << 8) | (t[5] << 16) | (t[6] << 24)
        z = [((forces >> (3 * i)) & 7) + 1 if (active >> i) & 1 else 0 for i in range(10)]
        if m == 0x21:
            return {"nome": "Resistência", "zonas": z, "freq": 0}
        return {"nome": "Vibração", "zonas": z, "freq": t[9]}
    if m in (0x25, 0x22):
        sz = t[1] | (t[2] << 8)
        bits = [i for i in range(10) if (sz >> i) & 1]
        ini, fim = (bits[0], bits[-1]) if bits else (0, 0)
        forca = (t[3] + 1) if m == 0x25 else ((t[3] & 7) + 1)
        z = [forca if ini <= i < fim else 0 for i in range(10)]
        return {"nome": "Gatilho de arma" if m == 0x25 else "Arco", "zonas": z, "freq": 0, "clique": fim}
    return {"nome": "Livre", "zonas": z, "freq": 0}
