#!/usr/bin/env python3
"""
TFG round-2 audio: theme ambiences + one-shots for the new interiors, synthesised here (CC0, made for
this game) plus processed CC-BY water recordings (Gregor Quendel) for the sewer.

  -> public/assets/ext/sounds/tfg-custom/*.ogg, public/assets/ext/sounds/quendel-water/*.ogg
  -> tools/assets/_frag_sounds_tfg.json (merged by manifest.py)

Deterministic (fixed seeds). Mono OGG Vorbis via python-soundfile (tools/raw/.pydeps).
Usage: python tfg_audio.py
"""
import glob
import json
import os
import sys
import zipfile

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from audio import to_mono, resample, normalize, loopify, write_ogg, fade  # noqa: E402  (also puts .pydeps on sys.path)
import soundfile as sf  # noqa: E402

PUB = os.path.join(ROOT, "public")
OUT = os.path.join(PUB, "assets", "ext", "sounds", "tfg-custom")
OUT_Q = os.path.join(PUB, "assets", "ext", "sounds", "quendel-water")
QZIP = glob.glob(os.path.join(ROOT, "tools", "raw", "gregor-quendel__free-water-stream-sounds", "*.zip"))
FRAG = os.path.join(HERE, "_frag_sounds_tfg.json")
CUSTOM = "TFG Custom (made for this game)"
QPACK = "Free Water Stream Sounds"

SR = 32000


# ------------------------------------------------------------------------------------ dsp helpers
def R(seed):
    return np.random.default_rng(seed)


def t_(dur, sr=SR):
    return np.arange(int(dur * sr)) / sr


def lp(x, hz, sr=SR, order=2):
    b, a = signal.butter(order, min(hz / (sr / 2), 0.99), "low")
    return signal.lfilter(b, a, x)


def hp(x, hz, sr=SR, order=2):
    b, a = signal.butter(order, min(hz / (sr / 2), 0.99), "high")
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, sr=SR, order=2):
    b, a = signal.butter(order, [lo / (sr / 2), min(hi / (sr / 2), 0.99)], "band")
    return signal.lfilter(b, a, x)


def pink(r, n):
    w = r.standard_normal(n)
    f = np.fft.rfft(w)
    k = np.arange(len(f)); k[0] = 1
    x = np.fft.irfft(f / np.sqrt(k), n)
    return x / (x.std() + 1e-12)


def brown(r, n):
    x = np.cumsum(r.standard_normal(n))
    return hp(x, 20)


def reverb(x, sr=SR, size=0.6, wet=0.35, damp=3500, seed=7):
    """Cheap convolution reverb with a synthetic exponentially-decaying noise IR."""
    r = R(seed)
    n = int(sr * (0.4 + size * 2.2))
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / (sr * (0.08 + size * 0.5)))
    ir = lp(ir, damp, sr)
    ir /= np.abs(ir).sum() ** 0.5 * 4
    y = signal.fftconvolve(x, ir)[:len(x) + n]
    out = np.zeros(len(y))
    out[:len(x)] += x * (1 - wet)
    out += y * wet
    return out


def env_adsr(n, a, d, s, rl, sr=SR):
    a, d, rl = int(a * sr), int(d * sr), int(rl * sr)
    e = np.ones(n) * s
    e[:a] = np.linspace(0, 1, a) if a else e[:a]
    e[a:a + d] = np.linspace(1, s, len(e[a:a + d]))
    if rl:
        e[-rl:] *= np.linspace(1, 0, rl)
    return e


def place(buf, snd, at):
    i = int(at)
    j = min(len(buf), i + len(snd))
    if i < len(buf):
        buf[i:j] += snd[:j - i]


def seamless(x, xfade=2.0, sr=SR):
    """Make a loop: crossfade the tail into the head so the seam is inaudible."""
    f = int(xfade * sr)
    n = len(x) - f
    y = x[:n].copy()
    t = np.linspace(0, 1, f)
    y[:f] = x[n:] * np.cos(t * np.pi / 2) + x[:f] * np.sin(t * np.pi / 2)
    return y


# ------------------------------------------------------------------------------------ one-shot parts
def drip(r, sr=SR):
    d = 0.09
    t = t_(d, sr)
    f0 = r.uniform(700, 1300)
    f = f0 * (1 + 2.2 * (t / d) ** 0.6)
    ph = 2 * np.pi * np.cumsum(f) / sr
    x = np.sin(ph) * np.exp(-t * r.uniform(40, 70))
    x[:int(0.002 * sr)] *= np.linspace(0, 1, int(0.002 * sr))
    return x


def click(r, sr=SR, dur=0.006, hz=3000):
    n = int(dur * sr)
    x = r.standard_normal(n) * np.exp(-np.arange(n) / (n / 5))
    return bp(x, hz * 0.5, hz * 1.8, sr)


def tone(hz, dur, sr=SR, shape="sine"):
    t = t_(dur, sr)
    if shape == "square":
        return np.sign(np.sin(2 * np.pi * hz * t)) * 0.6
    return np.sin(2 * np.pi * hz * t)


def bell(freqs, dur, decay, sr=SR):
    t = t_(dur, sr)
    x = np.zeros(len(t))
    for i, (f, a) in enumerate(freqs):
        x += a * np.sin(2 * np.pi * f * t) * np.exp(-t * decay * (1 + i * 0.35))
    return x


# ------------------------------------------------------------------------------------ ambiences
def amb_backrooms_hum():
    """Fluorescent ballast drone: 120 Hz + harmonics, bandpassed buzz AM'd at 120 Hz, slow swell,
    rare flicker stutters; faint carpeted room tone."""
    r = R(1)
    dur = 32
    t = t_(dur)
    wob = 1 + 0.004 * np.sin(2 * np.pi * 0.07 * t)
    x = np.zeros(len(t))
    for h, a in [(1, 1.0), (2, 0.55), (3, 0.35), (4, 0.2), (5, 0.12), (7, 0.08), (9, 0.05)]:
        x += a * np.sin(2 * np.pi * 120 * h * t * wob + r.uniform(0, 6))
    buzz = lp(bp(r.standard_normal(len(t)), 2200, 5000), 4500) * (0.5 + 0.5 * np.sin(2 * np.pi * 120 * t)) ** 4
    swell = 0.8 + 0.2 * np.sin(2 * np.pi * t / 11.0) + 0.08 * lp(r.standard_normal(len(t)), 0.6) * 20
    y = (x * 0.22 + buzz * 0.12) * swell
    # flicker stutters (a tube struggling)
    for at in (6.3, 17.8, 25.1):
        n = int(0.6 * SR)
        g = np.ones(n)
        k = 0
        while k < n:
            ln = int(r.uniform(0.02, 0.08) * SR)
            if r.random() < 0.5:
                g[k:k + ln] = 0.15
            k += ln
        s = int(at * SR)
        y[s:s + n] *= lp(g, 80)[:len(y[s:s + n])]
        place(y, click(r, hz=4000) * 0.6, s)
    room = lp(pink(r, len(t)), 900) * 0.08
    return seamless(normalize(reverb(y + room, size=0.3, wet=0.2)[:len(t)], -4))


def amb_office_hvac():
    r = R(2)
    dur = 32
    t = t_(dur)
    air = lp(pink(r, len(t)), 700) * 0.3 + bp(r.standard_normal(len(t)), 900, 2400) * 0.01
    air *= 0.85 + 0.15 * np.sin(2 * np.pi * t / 9.0)
    hum = 0.06 * np.sin(2 * np.pi * 60 * t) + 0.03 * np.sin(2 * np.pi * 180 * t)
    fridge = 0.035 * np.sin(2 * np.pi * 98 * t + 0.3 * np.sin(2 * np.pi * 0.3 * t))
    y = air + hum + fridge
    # a distant, muffled keyboard burst and a chair creak, heavily reverbed (empty office)
    for at in (9.0, 21.5):
        k = at
        for _ in range(int(r.integers(10, 22))):
            place(y, lp(click(r, hz=2200), 1800) * 0.25, k * SR)
            k += r.uniform(0.06, 0.2)
    return seamless(normalize(reverb(y, size=0.7, wet=0.3)[:len(t)], -5))


def amb_server_room():
    r = R(3)
    dur = 30
    t = t_(dur)
    fans = lp(pink(r, len(t)), 4000) * 0.35 + bp(r.standard_normal(len(t)), 3000, 8000) * 0.02
    tonal = np.zeros(len(t))
    for f, a in [(183, 0.1), (241, 0.08), (317, 0.05), (366, 0.04), (1460, 0.012)]:
        tonal += a * np.sin(2 * np.pi * f * t + 0.5 * np.sin(2 * np.pi * 0.13 * t))
    whine = 0.008 * np.sin(2 * np.pi * 9100 * t)
    y = fans + tonal + whine
    # HDD seek chatter
    k = 0.3
    while k < dur - 1:
        burst = int(r.integers(3, 14))
        for _ in range(burst):
            place(y, click(r, hz=r.uniform(1800, 4200), dur=0.004) * 0.35, k * SR)
            k += r.uniform(0.012, 0.05)
        k += r.uniform(0.4, 2.2)
    return seamless(normalize(reverb(y, size=0.35, wet=0.15)[:len(t)], -4))


def amb_sewer_tunnel():
    r = R(4)
    dur = 34
    t = t_(dur)
    rumble = lp(brown(r, len(t)), 140) * 1.0
    rumble /= np.abs(rumble).max() + 1e-9
    trickle = bp(r.standard_normal(len(t)), 500, 2500) * (0.4 + 0.6 * np.abs(lp(r.standard_normal(len(t)), 6) * 8)) * 0.08
    y = rumble * 0.5 + trickle
    k = 0.5
    while k < dur - 0.5:
        place(y, drip(r) * r.uniform(0.25, 0.6), k * SR)
        k += r.exponential(0.9) + 0.15
    # one distant pipe groan
    g = pipe_groan(R(44), 3.5) * 0.25
    place(y, g, 14 * SR)
    return seamless(normalize(reverb(y, size=1.0, wet=0.45, damp=2500)[:len(t)], -4))


def amb_hospital_ward():
    r = R(5)
    dur = 30
    t = t_(dur)
    vent = lp(pink(r, len(t)), 1100) * 0.25
    hum = 0.04 * np.sin(2 * np.pi * 120 * t) + 0.02 * np.sin(2 * np.pi * 240 * t)
    y = vent + hum
    beep = heart_beep() * 0.18
    k = 0.4
    while k < dur - 0.5:   # 70 bpm, slightly irregular, far down the hall
        place(y, lp(beep, 2500), k * SR)
        k += 60 / 70 * r.uniform(0.96, 1.05)
    # a gurney wheel squeak far away
    sq = np.sin(2 * np.pi * np.cumsum(1900 + 300 * np.sin(2 * np.pi * 7 * t_(0.5))) / SR) * env_adsr(int(0.5 * SR), 0.05, 0.1, 0.6, 0.2)
    place(y, sq * 0.03, 17.3 * SR)
    return seamless(normalize(reverb(y, size=0.8, wet=0.35)[:len(t)], -5))


# ------------------------------------------------------------------------------------ one-shots
def heart_beep():
    d = 0.13
    x = tone(960, d) * env_adsr(int(d * SR), 0.004, 0.02, 0.8, 0.03)
    return x


def sfx_heart_beep():
    return normalize(reverb(heart_beep(), size=0.2, wet=0.15), -3)


def sfx_flatline():
    d = 3.2
    x = tone(960, d) * env_adsr(int(d * SR), 0.005, 0.0, 1.0, 0.6)
    return normalize(reverb(x, size=0.3, wet=0.2), -3)


def sfx_phone_ring():
    r = R(6)
    ring = bell([(1150, 1.0), (1720, 0.6), (2410, 0.35), (3330, 0.2)], 1.0, 1.5)
    am = (np.sin(2 * np.pi * 20 * t_(1.0)) > 0).astype(float) * 0.8 + 0.2
    one = ring * am * env_adsr(int(SR), 0.01, 0.0, 1.0, 0.1)
    y = np.zeros(int(4.2 * SR))
    for at in (0.0, 0.45, 2.2, 2.65):
        place(y, one[:int(0.4 * SR)], at * SR)
    return normalize(reverb(y, size=0.6, wet=0.3), -3)


def sfx_dialup_modem():
    """Dial-up handshake: DTMF dial, ring-back, 2100 Hz answer tone w/ phase flips, warbles, scramble."""
    r = R(7)
    dtmf = {"5": (770, 1336), "5b": (770, 1336), "1": (697, 1209), "2": (697, 1336), "9": (852, 1477), "0": (941, 1336)}
    y = []
    for k in ["5", "5", "1", "2", "9", "0", "5"]:
        a, b = dtmf[k]
        y.append((tone(a, 0.09) + tone(b, 0.09)) * 0.45)
        y.append(np.zeros(int(0.05 * SR)))
    y.append(np.zeros(int(0.35 * SR)))
    y.append((tone(440, 0.9) + tone(480, 0.9)) * 0.3)
    y.append(np.zeros(int(0.25 * SR)))
    ans = tone(2100, 1.6)
    for k in range(1, 4):
        i = int(k * 0.45 * SR)
        ans[i:] *= -1
    y.append(ans * 0.5)
    t = t_(0.9)
    y.append(np.sin(2 * np.pi * np.cumsum(1650 + 550 * np.sign(np.sin(2 * np.pi * 30 * t))) / SR) * 0.45)
    y.append((tone(1200, 0.5) + tone(2400, 0.5)) * 0.3 * (np.sin(2 * np.pi * 50 * t_(0.5)) > 0))
    scr = bp(r.standard_normal(int(2.2 * SR)), 600, 3400) * 0.6
    scr *= 0.7 + 0.3 * np.sign(np.sin(2 * np.pi * 12 * t_(2.2)))
    y.append(scr)
    x = np.concatenate(y)
    return normalize(lp(hp(x, 300), 3600), -3)


def sfx_hdd_click():
    r = R(8)
    y = np.zeros(int(2.4 * SR))
    for k, at in enumerate([0.05, 0.28, 0.9, 1.13, 1.75, 1.98]):
        c = click(r, hz=2500, dur=0.012) * (1.0 if k % 2 == 0 else 0.7)
        c = np.concatenate([c, lp(r.standard_normal(int(0.03 * SR)), 300) * 0.3 * np.exp(-np.arange(int(0.03 * SR)) / 200)])
        place(y, c, at * SR)
    spin = 0.05 * np.sin(2 * np.pi * 120 * t_(2.4)) * np.linspace(1, 0.3, int(2.4 * SR))
    return normalize(y + spin, -3)


def sfx_drip(seed):
    r = R(100 + seed)
    y = np.zeros(int(1.2 * SR))
    place(y, drip(r), 0.01 * SR)
    return normalize(reverb(y, size=0.9, wet=0.5, damp=3000)[:len(y)], -3)


def pipe_groan(r, dur=3.0):
    t = t_(dur)
    f = 55 * (1 + 0.25 * np.sin(2 * np.pi * t / dur * 0.8) + 0.1 * r.standard_normal() )
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.zeros(len(t))
    for h, a in [(1, 1.0), (2.76, 0.5), (5.4, 0.3), (8.9, 0.15)]:
        x += a * np.sin(ph * h)
    fr = bp(r.standard_normal(len(t)), 150, 900) * 0.6
    x = (x * 0.5 + fr) * (np.abs(lp(r.standard_normal(len(t)), 3)) * 10 + 0.3)
    return x * env_adsr(len(t), 0.4, 0.3, 0.8, 1.0)


def sfx_pipe_groan(seed):
    return normalize(reverb(pipe_groan(R(200 + seed), 3.5), size=1.0, wet=0.5, damp=2000), -3)


def sfx_crt_on():
    r = R(9)
    thunk = lp(r.standard_normal(int(0.25 * SR)), 180) * np.exp(-np.arange(int(0.25 * SR)) / (0.05 * SR)) * 6
    t = t_(1.8)
    whine = 0.12 * np.sin(2 * np.pi * (9000 + 1200 * np.minimum(t / 0.4, 1)) * t) * env_adsr(len(t), 0.2, 0.2, 0.7, 0.6)
    stat = bp(r.standard_normal(len(t)), 1500, 8000) * 0.25 * np.exp(-t * 2.5)
    y = np.zeros(len(t))
    place(y, thunk, 0)
    y += whine + stat
    return normalize(y, -3)


def sfx_crt_off():
    r = R(10)
    t = t_(0.7)
    zap = np.sin(2 * np.pi * np.cumsum(3000 * np.exp(-t * 7) + 60) / SR) * np.exp(-t * 5)
    return normalize(zap * 0.7 + bp(r.standard_normal(len(t)), 800, 6000) * 0.3 * np.exp(-t * 12), -3)


def sfx_fluoro_flicker():
    r = R(11)
    y = np.zeros(int(1.3 * SR))
    k = 0.02
    for _ in range(5):
        ln = r.uniform(0.04, 0.16)
        t = t_(ln)
        seg = (0.5 * np.sin(2 * np.pi * 120 * t) + bp(r.standard_normal(len(t)), 2000, 7000) * 0.8) * np.hanning(len(t))
        place(y, seg, k * SR)
        place(y, click(r, hz=5000) * 0.8, k * SR)
        k += ln + r.uniform(0.03, 0.2)
    return normalize(y, -3)


def sfx_elevator_ding():
    y = np.zeros(int(2.4 * SR))
    place(y, bell([(1318, 1.0), (2636, 0.3), (3950, 0.1)], 1.6, 2.2), 0)
    place(y, bell([(1046, 1.0), (2092, 0.3), (3140, 0.1)], 1.6, 2.2), 0.42 * SR)
    return normalize(reverb(y, size=0.5, wet=0.25)[:len(y)], -3)


def sfx_printer_jam():
    r = R(12)
    t = t_(2.6)
    step = np.sign(np.sin(2 * np.pi * 380 * t)) * 0.2 * (np.sin(2 * np.pi * 3 * t) > -0.3)
    grind = bp(r.standard_normal(len(t)), 300, 2400) * (t > 1.6) * 0.8 * np.abs(np.sin(2 * np.pi * 9 * t))
    y = lp(step, 3000) + grind
    for at in (1.6, 1.9, 2.3):
        place(y, click(r, hz=1200, dur=0.02) * 1.5, at * SR)
    y *= env_adsr(len(t), 0.02, 0.0, 1.0, 0.1)
    return normalize(reverb(y, size=0.3, wet=0.15)[:len(t)], -3)


def sfx_typing():
    r = R(13)
    y = np.zeros(int(3.0 * SR))
    k = 0.02
    while k < 2.8:
        place(y, click(r, hz=r.uniform(1800, 3200), dur=0.01) * r.uniform(0.5, 1.0), k * SR)
        k += r.uniform(0.06, 0.18) if r.random() > 0.08 else r.uniform(0.3, 0.6)
    return normalize(reverb(y, size=0.4, wet=0.2)[:len(y)], -4)


def sfx_bios_beep():
    y = np.zeros(int(2.0 * SR))
    place(y, tone(880, 0.6, shape="square") * 0.5, 0)
    for k in range(3):
        place(y, tone(880, 0.12, shape="square") * 0.5, (0.85 + k * 0.25) * SR)
    return normalize(lp(y, 5000), -4)


# ------------------------------------------------------------------------------------ recordings
def quendel_loops():
    if not QZIP:
        # the 184 MB source zip is not kept in the repo (download_all.sh r2 fetches it again): reuse the
        # already processed loops so re-running this script never drops them from the manifest
        old = [e for e in (json.load(open(FRAG, encoding="utf-8")) if os.path.exists(FRAG) else [])
               if e.get("pack") == QPACK and os.path.exists(os.path.join(PUB, *e["path"].split("/")))]
        print("Quendel zip missing - keeping", len(old), "processed loops")
        return old
    z = zipfile.ZipFile(QZIP[0])
    picks = [("amb_sewer_water_1", "- 01.wav"), ("amb_sewer_water_2", "- 05.wav")]
    out = []
    import io
    for sid, suffix in picks:
        name = next(n for n in z.namelist() if n.endswith(suffix))
        x, sr = sf.read(io.BytesIO(z.read(name)), dtype="float32", always_2d=False)
        x = to_mono(x)
        x = x[int(sr * 5):int(sr * 5) + int(sr * 36)]            # skip the head, 36 s window
        x = resample(x, sr, SR)
        x = lp(hp(x, 60), 3200)                                   # darker, less "outdoor"
        x = reverb(x, size=0.9, wet=0.35, damp=2200)[:len(x)]     # tunnel
        x = seamless(normalize(x, -3), 2.5)
        p = os.path.join(OUT_Q, sid + ".ogg")
        write_ogg(p, x.astype(np.float32), SR)
        out.append(dict(id=sid, path=os.path.relpath(p, PUB).replace("\\", "/"), pack=QPACK, license="CC-BY 4.0",
                        credit="Free Water Stream Sounds by Gregor Quendel (CC-BY 4.0)", duration=round(len(x) / SR, 2),
                        tags=["ambience", "sewer", "water", "loop"]))
    return out


SOUNDS = [
    ("amb_backrooms_hum", amb_backrooms_hum, ["ambience", "backrooms", "fluorescent", "hum", "loop"]),
    ("amb_office_hvac", amb_office_hvac, ["ambience", "office", "hvac", "loop"]),
    ("amb_server_room", amb_server_room, ["ambience", "serverfarm", "fans", "loop"]),
    ("amb_sewer_tunnel", amb_sewer_tunnel, ["ambience", "sewer", "drips", "loop"]),
    ("amb_hospital_ward", amb_hospital_ward, ["ambience", "hospital", "heart_monitor", "loop"]),
    ("sfx_heart_beep", sfx_heart_beep, ["hospital", "beep", "heart_monitor"]),
    ("sfx_flatline", sfx_flatline, ["hospital", "flatline", "heart_monitor", "stinger"]),
    ("sfx_phone_ring", sfx_phone_ring, ["office", "phone", "ring", "bell"]),
    ("sfx_dialup_modem", sfx_dialup_modem, ["internet", "modem", "dialup", "stinger", "retro"]),
    ("sfx_hdd_click", sfx_hdd_click, ["serverfarm", "hdd", "click", "computer"]),
    ("sfx_drip_1", lambda: sfx_drip(1), ["sewer", "water", "drip"]),
    ("sfx_drip_2", lambda: sfx_drip(2), ["sewer", "water", "drip"]),
    ("sfx_drip_3", lambda: sfx_drip(3), ["sewer", "water", "drip"]),
    ("sfx_drip_4", lambda: sfx_drip(4), ["sewer", "water", "drip"]),
    ("sfx_pipe_groan_1", lambda: sfx_pipe_groan(1), ["sewer", "pipe", "metal", "groan"]),
    ("sfx_pipe_groan_2", lambda: sfx_pipe_groan(2), ["sewer", "pipe", "metal", "groan"]),
    ("sfx_crt_on", sfx_crt_on, ["crt", "tv", "monitor", "power"]),
    ("sfx_crt_off", sfx_crt_off, ["crt", "tv", "monitor", "power"]),
    ("sfx_fluoro_flicker", sfx_fluoro_flicker, ["backrooms", "office", "light", "flicker", "electric"]),
    ("sfx_elevator_ding", sfx_elevator_ding, ["office", "elevator", "bell"]),
    ("sfx_printer_jam", sfx_printer_jam, ["office", "printer", "machine"]),
    ("sfx_typing", sfx_typing, ["office", "keyboard", "typing"]),
    ("sfx_bios_beep", sfx_bios_beep, ["serverfarm", "computer", "beep", "error"]),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    entries = []
    for sid, fn, tags in SOUNDS:
        x = np.asarray(fn(), dtype=np.float64)
        if not sid.startswith("amb_"):
            x = fade(x, SR, 0.002, 0.03)
        p = os.path.join(OUT, sid + ".ogg")
        write_ogg(p, x.astype(np.float32), SR)
        entries.append(dict(id=sid, path=os.path.relpath(p, PUB).replace("\\", "/"), pack=CUSTOM, license="CC0",
                            duration=round(len(x) / SR, 2), tags=tags + ["tfg"]))
        print(sid, round(len(x) / SR, 2), "s", os.path.getsize(p) // 1024, "KB")
    entries += quendel_loops()
    json.dump(entries, open(FRAG, "w", encoding="utf-8"), indent=1)
    print("sounds:", len(entries))


if __name__ == "__main__":
    main()
