#!/usr/bin/env python3
"""
황혼 원경 백드롭 파노라마 생성 (M1i). 입력 없이 시드 고정으로 결정적으로 만든다 (PIL + numpy).

출력: src/assets/backdrop_dusk.png  (2048x512 RGBA, 좌우 이음새 없음)
 - 알파가 있는 "물체 층"만 담는다: 하늘 그라디언트는 런타임 하늘 돔이 그리고, 이 이미지는 그 위에 겹친다.
 - 내용(뒤→앞): 가로 구름 띠 / 하늘의 거대한 고리 + 떠 있는 파편 + 부유섬 / 산·메사 실루엣 3~4겹(블록·계단 윤곽, 멀수록 보라·밝은 헤이즈)
   / 성(첨탑군) 실루엣 + 그 위로 솟는 가는 빛기둥 / 계곡 안개 띠 / 맨 아래 안개색 채움(런타임 안개색과 일치)
 - 규약: 이미지 x 는 화면 왼→오 (원통 안쪽에서 바깥을 볼 때). 방위 θ = atan2(dx, dz), x = (1 - θ/2π)·W.
   원통 반지름 R, 이미지 가로 W → 한 픽셀 = 2πR/W (m). 눈높이(지평선) 행 = HORIZON_V·H, 고도각 e 의 행 = HOR - tan(e)·W/(2π).
 - 아래 상수는 src/config/settings.ts (VISUAL.lowpoly.backdrop, presets.dusk) 와 같은 값으로 유지한다.

사용: python3 scripts/make_backdrop.py [--out PATH] [--preview PATH]
의존: pip install pillow numpy
"""
import argparse
import math
import os

import numpy as np
from PIL import Image

W, H = 2048, 512
HORIZON_V = 0.62
SUN_AZ_DEG = 143.0        # settings: backdrop.sunAzimuthDeg
BEACON_AZ_DEG = 170.0     # settings: backdrop.beaconAzimuthDeg
SUN_ELEV_DEG = 8.6        # settings: presets.dusk.sky.sun.dir 의 고도 (asin(0.15/|dir|))
FOG = 0x7360a2            # settings: presets.dusk.fog.color
SEED = 20261006

HOR = int(round(HORIZON_V * H))
PX_PER_RAD = W / (2 * math.pi)


def hexc(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], dtype=np.float32) / 255.0


def az_to_x(deg):
    return (1.0 - (deg % 360.0) / 360.0) * W


def elev_to_row(deg):
    return HOR - math.tan(math.radians(deg)) * PX_PER_RAD


SUN_X = az_to_x(SUN_AZ_DEG)
BEACON_X = az_to_x(BEACON_AZ_DEG)
SUN_ROW = elev_to_row(SUN_ELEV_DEG)

rng = np.random.default_rng(SEED)
X = np.arange(W, dtype=np.float32)[None, :]
Y = np.arange(H, dtype=np.float32)[:, None]


def wrapdx(x, cx):
    """가로 방향 최소 거리 (이음새 없는 래핑)"""
    return (x - cx + W / 2) % W - W / 2


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def cellnoise(cw, ch, seed):
    """cw x ch 픽셀 셀마다 상수인 0~1 노이즈 (cw 는 W 의 약수 → 좌우 이음새 없음)"""
    r = np.random.default_rng(seed)
    gw, gh = W // cw, -(-H // ch)
    g = r.random((gh, gw)).astype(np.float32)
    return np.repeat(np.repeat(g, ch, axis=0), cw, axis=1)[:H, :W]


def periodic_profile(seed, kmin=2, kmax=48, power=1.15):
    """가로로 이음새 없는 1D 값 (0~1): 정수 주기 코사인 합"""
    r = np.random.default_rng(seed)
    x = np.arange(W, dtype=np.float64)
    v = np.zeros(W)
    for k in range(kmin, kmax):
        v += (1.0 / k ** power) * np.cos(2 * np.pi * k * x / W + r.random() * 2 * np.pi)
    v = (v - v.min()) / (v.max() - v.min())
    return v.astype(np.float32)


class Canvas:
    """RGBA(float, 비곱셈 알파) 캔버스. over() 로 색+알파 마스크를 합성"""
    def __init__(self):
        self.rgb = np.zeros((H, W, 3), np.float32)
        self.a = np.zeros((H, W), np.float32)

    def over(self, color, alpha):
        """color: (H,W,3) 또는 (3,), alpha: (H,W) 0~1"""
        col = np.broadcast_to(color, (H, W, 3))
        a_new = alpha + self.a * (1 - alpha)
        w_src = np.where(a_new > 1e-6, alpha / np.maximum(a_new, 1e-6), 0)[..., None]
        self.rgb = col * w_src + self.rgb * (1 - w_src)
        self.a = a_new


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def sun_glow_at(x, sigma_px=380.0):
    """해 방위 근처 0~1 (가우시안, 이음새 없음)"""
    d = wrapdx(x, SUN_X)
    return np.exp(-(d / sigma_px) ** 2)


# ------------------------------------------------------------------ 구름 띠
def clouds(cv):
    pal_hi = [hexc(0x6a5aa0), hexc(0x7d64a8), hexc(0x8a6aae)]
    pal_mid = [hexc(0xb2709e), hexc(0xc4789e)]
    pal_lo = [hexc(0xe8879c), hexc(0xf6a070), hexc(0xf4b07a)]
    n = cellnoise(8, 4, 11)
    n2 = cellnoise(16, 4, 12)
    bands = []
    r = np.random.default_rng(SEED + 1)
    for i in range(16):
        row = elev_to_row(r.uniform(3.5, 36))
        length = r.uniform(240, 640)
        thick = r.uniform(5, 15) * (0.6 + 0.4 * (row / HOR))
        cx = r.uniform(0, W)
        bands.append((row, length, thick, cx))
    # 해 쪽에 낮고 긴 호박 띠를 더한다
    for off in (-260, -90, 120, 300):
        bands.append((elev_to_row(r.uniform(4, 9)), r.uniform(260, 420), r.uniform(5, 9), (SUN_X + off) % W))
    for row, length, thick, cx in bands:
        dx = wrapdx(X, cx) / length
        # 위아래로 살짝 휘어지는 중심선 (이음새 없음: 주기 코사인)
        wob = 3.0 * np.cos(2 * np.pi * 3 * X / W + cx * 0.01)
        dy = (Y - row - wob) / thick
        d = dx ** 2 + dy ** 2
        alpha = np.clip(1.0 - d, 0, 1) ** 0.8 * (0.55 + 0.9 * n) * (0.7 + 0.6 * n2)
        # 3단 포스터라이즈로 픽셀아트 느낌
        alpha = np.where(alpha > 0.62, 0.9, np.where(alpha > 0.34, 0.6, np.where(alpha > 0.16, 0.3, 0.0))).astype(np.float32)
        elev = (HOR - row) / PX_PER_RAD
        warm = np.clip(sun_glow_at(X) * 1.4 + (1 - np.clip(elev / 0.6, 0, 1)) * 0.5, 0, 1)
        base = mix(mix(pal_hi[int(cx) % 3], pal_mid[int(cx) % 2], np.clip(1 - elev / 0.45, 0, 1)),
                   pal_lo[int(cx) % 3], warm)
        # 셀마다 명도 변화 (모자이크)
        shade = (0.88 + 0.24 * cellnoise(8, 4, int(cx) + 5))[..., None]
        cv.over(base * shade, alpha)


# ------------------------------------------------------------------ 거대한 고리 + 파편
def ring(cv):
    cx0, cy0 = (BEACON_X - 80) % W, elev_to_row(40)
    rx, ry, tilt = 215.0, 70.0, math.radians(-14)
    mask = np.zeros((H, W), np.float32)
    shade = np.zeros((H, W), np.float32)   # 0 = 뒤쪽(어둡게), 1 = 앞쪽(밝게)
    r = np.random.default_rng(SEED + 2)
    steps = 1700
    gap = []
    for _ in range(3):
        gap.append((r.uniform(0, 2 * math.pi), r.uniform(0.05, 0.12)))
    for s in range(steps):
        t = 2 * math.pi * s / steps
        if any(abs(((t - g + math.pi) % (2 * math.pi)) - math.pi) < w for g, w in gap):
            continue
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        px = cx0 + ex * math.cos(tilt) - ey * math.sin(tilt)
        py = cy0 + ex * math.sin(tilt) + ey * math.cos(tilt)
        thick = 8 + 17 * (0.5 + 0.5 * math.cos(t - 2.4)) + 3 * r.random()   # 한쪽이 두껍다
        half = thick / 2
        x0, x1 = int(px - half), int(px + half) + 1
        y0, y1 = int(py - half * 0.7), int(py + half * 0.7) + 1
        for xx in range(x0, x1):
            xi = xx % W
            ya, yb = max(0, y0), min(H, y1)
            if ya < yb:
                mask[ya:yb, xi] = 1.0
                shade[ya:yb, xi] = 0.5 + 0.5 * math.sin(t)   # sin>0 = 아래쪽(앞쪽)
    # 블록 모자이크: 셀 단위로 이진화
    cw, ch = 8, 6
    m = mask
    pad = (-H) % ch
    mm = np.pad(m, ((0, pad), (0, 0)))
    cell = mm.reshape(mm.shape[0] // ch, ch, W // cw, cw).mean(axis=(1, 3))
    solid = (cell > 0.42).astype(np.float32)
    sh = np.pad(shade, ((0, pad), (0, 0))).reshape(mm.shape[0] // ch, ch, W // cw, cw).mean(axis=(1, 3))
    solid_px = np.repeat(np.repeat(solid, ch, axis=0), cw, axis=1)[:H, :W]
    shade_px = np.repeat(np.repeat(sh, ch, axis=0), cw, axis=1)[:H, :W]
    n = cellnoise(8, 6, 21)
    dark, light, warm = hexc(0x4e4286), hexc(0x7a5e92), hexc(0xd88a82)
    col = mix(dark, light, np.clip(shade_px * 0.9 + (n - 0.5) * 0.5, 0, 1))
    # 아래쪽(해를 마주한 면)과 해 쪽으로 호박 림
    below = np.roll(solid_px, -ch, axis=0)
    rim = solid_px * (1 - below) * 1.0
    col = mix(col, warm, np.clip(rim * (0.4 + 0.6 * sun_glow_at(X, 600)), 0, 1))
    col = mix(col, warm, np.clip(sun_glow_at(X, 450) * 0.35 * shade_px, 0, 1))
    cv.over(col, solid_px)

    # 부유섬 (고리 아래, 아래로 뾰족)
    ix, iy = (BEACON_X + 35) % W, elev_to_row(33)
    w_i = 56
    isl = np.zeros((H, W), np.float32)
    for k in range(40):
        yy = int(iy + k)
        half = w_i * (1 - k / 40.0) ** 0.8 * (0.8 + 0.2 * r.random()) / 2 + 2
        for xx in range(int(ix - half), int(ix + half) + 1):
            if 0 <= yy < H:
                isl[yy, xx % W] = 1.0
    for yy in range(int(iy - 5), int(iy)):   # 윗면 (이끼 평지)
        for xx in range(int(ix - w_i / 2 - 3), int(ix + w_i / 2 + 4)):
            isl[yy, xx % W] = 1.0
    solid = (np.repeat(np.repeat(isl[: (H // 4) * 4].reshape(H // 4, 4, W // 4, 4).mean(axis=(1, 3)) > 0.4, 4, axis=0), 4, axis=1)).astype(np.float32)
    solid = np.pad(solid, ((0, H - solid.shape[0]), (0, 0)))
    col = mix(hexc(0x4a4078), hexc(0x7a5e8c), cellnoise(4, 4, 31))
    col = mix(col, hexc(0x6b7a2e), np.clip((solid - np.roll(solid, 1, axis=0)) * 0.8 + 0.0, 0, 1))
    col = mix(col, hexc(0xd88a82), np.clip(solid * (1 - np.roll(solid, -4, axis=0)) * 0.7, 0, 1))
    cv.over(col, solid)

    # 떠 있는 파편 (작은 블록)
    for i in range(70):
        near_ring = i < 45
        if near_ring:
            px = cx0 + r.normal(0, 260)
            py = cy0 + r.normal(0, 70)
        else:
            px = r.uniform(0, W)
            py = r.uniform(10, elev_to_row(10))
        s = int(r.choice([4, 4, 8, 8, 12]))
        w, h = s, max(4, int(s * r.uniform(0.6, 1.3)) // 4 * 4)
        px, py = int(px) // 4 * 4, int(py) // 4 * 4
        base = hexc(int(r.choice([0x4e4270, 0x5e4a72, 0x6e5060, 0x463c68])))
        sq = np.zeros((H, W), np.float32)
        for xx in range(px, px + w):
            if 0 <= py < H:
                sq[max(0, py):min(H, py + h), xx % W] = 1.0
        rimc = np.roll(sq, h // 2 if h > 4 else 1, axis=0)
        col = base + 0.0 * sq[..., None]
        low = sq * (1 - np.roll(sq, -4, axis=0))
        col = mix(col, hexc(0xd88a82), low * 0.85 * (0.4 + 0.6 * sun_glow_at(X, 700)))
        cv.over(col, sq)
        _ = rimc


# ------------------------------------------------------------------ 산·메사 층
def mountain_layer(cv, seed, base_row, amp, qx, qh, color_top, color_bot, haze_h, cw, ch, plateau, sun_warm, stripes):
    prof = periodic_profile(seed, kmin=2, kmax=40, power=1.0)
    x = np.arange(W)
    # 평탄한 정상(메사)을 만든다: 프로파일을 문턱으로 눌러 평평하게
    if plateau > 0:
        p = np.clip((prof - 0.5) * (1.0 + plateau) + 0.5, 0, 1)
        prof = prof * (1 - plateau * 0.6) + p * plateau * 0.6
    qprof = np.empty(W, np.float32)
    for i in range(0, W, qx):
        qprof[i:i + qx] = prof[i:i + qx].mean()
    top = base_row - np.round(qprof * amp / qh) * qh      # 행 단위 계단
    top = top[None, :]
    inside = (Y >= top).astype(np.float32)
    n = cellnoise(cw, ch, seed + 7)
    n2 = cellnoise(cw * 2, ch * 2, seed + 8)
    depth = np.clip((Y - top) / max(8.0, amp * 0.9), 0, 1)       # 정상에서 아래로
    col = mix(color_top, color_bot, depth)
    col = col * (0.82 + 0.36 * (0.6 * n + 0.4 * n2))[..., None]
    if stripes > 0:   # 층리: 일정 간격의 어두운 가로줄 (모자이크 위 얇은 띠)
        lines = ((np.floor((Y - top) / (qh * 2.0)) % 3) == 0).astype(np.float32) * inside
        col = mix(col, col * 0.78, lines * stripes)
    # 해 쪽 가장자리 림 (정상 윗면 2~4행)
    edge = inside * (1 - np.roll(inside, 3, axis=0))
    warm = hexc(0xf6a85e)
    col = mix(col, warm, np.clip(edge * sun_warm * (0.25 + 0.9 * sun_glow_at(X, 520)), 0, 1))
    # 해 방위일수록 전체가 따뜻하게 (역광 헤이즈)
    col = mix(col, hexc(0xd98a8c), np.clip(sun_glow_at(X, 420) * sun_warm * 0.45 * (1 - depth), 0, 1))
    cv.over(col, inside)
    # 밑동 안개: 정상 아래 haze_h 아래에서 안개색으로 점점 잠긴다
    fogc = hexc(0x8a74b4)
    hz = np.clip((Y - (top + haze_h * 0.3)) / haze_h, 0, 1) * inside
    cv.over(fogc, hz * 0.9)
    return top[0]


# ------------------------------------------------------------------ 성 + 빛기둥
def castle(cv, ground_row):
    sil = hexc(0x4a3b78)
    sil2 = hexc(0x5a4886)
    warm = hexc(0xe89a80)
    win = hexc(0x6fc4c0)
    r = np.random.default_rng(SEED + 5)
    mask = np.zeros((H, W), np.float32)
    cx = int(BEACON_X)

    def rect(x0, x1, y0, y1):
        mask[max(0, y0):min(H, y1), [(x % W) for x in range(x0, x1)]] = 1.0

    def spire(c, w, h, base, steps_at=0.55, tip=14):
        # 몸통(층층 줄어드는 블록) + 뾰족한 첨탑
        y = base
        cur = w
        body_h = int(h * steps_at)
        rect(c - cur // 2, c - cur // 2 + cur, y - body_h, y)
        y -= body_h
        cur = max(4, int(w * 0.72))
        mid = int(h * 0.2)
        rect(c - cur // 2, c - cur // 2 + cur, y - mid, y)
        y -= mid
        rem = h - body_h - mid
        # 삼각 첨탑: 1행마다 폭이 줄어든다 (픽셀 단위)
        for k in range(rem):
            half = max(0.5, (cur / 2) * (1 - k / max(1, rem)) ** 1.15)
            rect(int(c - half), int(c + half) + 1, y - 1, y)
            y -= 1
        return y   # 꼭대기 행

    # 기단 (섬 같은 절벽 위): 계단형
    base = ground_row
    for i, (hw, hh) in enumerate([(120, 7), (96, 7), (74, 6)]):
        rect(cx - hw, cx + hw, base - hh * (i + 1), base - hh * i)
    top_row = base - 20
    base = top_row
    # 주변 첨탑들
    cfg = [(-82, 16, 54), (-62, 12, 62), (-40, 14, 50), (-22, 10, 74), (20, 11, 70), (42, 14, 52), (66, 12, 60), (84, 16, 40), (-98, 10, 26), (98, 10, 28)]
    for off, w, h in cfg:
        spire(cx + off, w, h + int(r.integers(-4, 8)), base)
    # 중앙 큰 첨탑 + 보조
    spire(cx - 8, 22, 112, base, steps_at=0.5)
    tip_row = spire(cx + 6, 16, 150, base, steps_at=0.48)
    spire(cx, 26, 70, base, steps_at=0.7)
    # 성벽
    rect(cx - 100, cx + 100, base - 12, base)
    # 블록 모자이크화 (셀 4x4)
    pad = (-H) % 4
    mm = np.pad(mask, ((0, pad), (0, 0)))
    cell = mm.reshape(mm.shape[0] // 4, 4, W // 4, 4).mean(axis=(1, 3))
    solid = np.repeat(np.repeat((cell > 0.45).astype(np.float32), 4, axis=0), 4, axis=1)[:H, :W]
    n = cellnoise(4, 4, 55)
    col = mix(sil, sil2, n)
    # 오른쪽(해 쪽) 가장자리 림, 위쪽 윤곽에 호박빛
    rimr = solid * (1 - np.roll(solid, -4, axis=1))
    rimt = solid * (1 - np.roll(solid, 4, axis=0))
    col = mix(col, warm, np.clip((rimr * 0.9 + rimt * 0.5) * (0.5 + 0.5 * sun_glow_at(X, 900)), 0, 1))
    # 창 몇 개 (청록 발광)
    wmask = (cellnoise(4, 8, 66) > 0.965).astype(np.float32) * solid * (1 - rimr)
    col = mix(col, win, wmask * 0.9)
    cv.over(col, solid)
    # 성 아래쪽 안개
    hz = np.clip((Y - (base - 6)) / 30.0, 0, 1)
    cv.over(hexc(0x8a74b4), hz * np.clip(np.abs(wrapdx(X, cx)) < 160, 0, 1).astype(np.float32) * 0.9)
    return int(tip_row), cx


def beam(cv, tip_row, cx):
    # 빛기둥: 첨탑 끝에서 맨 위(행 0)까지. 코어 2~3 px + 바깥 번짐. 위로 갈수록 옅어진다
    d = np.abs(wrapdx(X, cx + 0.5))
    height = np.clip((tip_row - Y) / max(1, tip_row), 0, 1)     # 팁 0 → 맨 위 1
    on = (Y < tip_row).astype(np.float32)
    core = (d < 1.6).astype(np.float32) * on
    mid = (d < 4.5).astype(np.float32) * on
    outer = np.exp(-(d / 9.0) ** 2) * on
    flick = 0.8 + 0.2 * cellnoise(2, 8, 77)
    a_core = core * (0.95 - 0.5 * height) * flick
    a_mid = mid * (0.35 - 0.25 * height) * flick
    a_out = outer * (0.18 - 0.12 * height)
    cv.over(hexc(0x8c7cff), np.clip(a_out, 0, 1))
    cv.over(hexc(0xb9adff), np.clip(a_mid, 0, 1))
    cv.over(hexc(0xeee9ff), np.clip(a_core, 0, 1))


# ------------------------------------------------------------------ 안개 띠 / 하단 채움
def valley_haze(cv):
    fogc = hexc(0x8a74b4)
    for i, (row, thick, a, seed) in enumerate([(HOR - 24, 14, 0.32, 91), (HOR - 6, 18, 0.45, 92), (HOR + 12, 22, 0.55, 93)]):
        n = cellnoise(16, 4, seed)
        prof = periodic_profile(seed, 2, 14, 1.0)[None, :]
        c = row + (prof - 0.5) * 10
        dy = (Y - c) / thick
        alpha = np.clip(1.0 - dy ** 2, 0, 1) * (0.5 + 0.7 * n) * a
        alpha = np.round(alpha * 5) / 5.0   # 단계화
        cv.over(mix(fogc, hexc(0xb89ac8), np.clip(sun_glow_at(X, 500) * 0.8, 0, 1) * np.ones((H, 1), np.float32)), alpha.astype(np.float32))


def bottom_fill(cv):
    # 눈높이 아래는 런타임 안개색으로 서서히 채워 지형 끝 안개와 매끈하게 이어진다
    a = smooth(HOR + 4, HOR + 56, Y) * np.ones((1, W), np.float32)
    cv.over(hexc(FOG), a.astype(np.float32))


def top_fade(cv):
    # 위쪽 가장자리는 알파로 페이드: 하늘 돔과 자연스럽게 이어진다 (돔 위 고도 40도 이상)
    fade = smooth(0, 70, Y) * np.ones((1, W), np.float32)
    cv.a = cv.a * fade


def build():
    cv = Canvas()
    clouds(cv)
    ring(cv)
    # 산·메사: 가장 먼 것부터. 멀수록 밝은 보라 헤이즈, 가까울수록 어둡고 블록이 크고 층리가 뚜렷
    mountain_layer(cv, 101, HOR - 6, 120, 8, 4, hexc(0x8a6cb0), hexc(0x7a62a6), 40, 4, 4, 0.0, 1.0, 0.0)
    mountain_layer(cv, 202, HOR + 2, 95, 12, 4, hexc(0x6e5698), hexc(0x5c4c8a), 44, 8, 4, 0.35, 0.8, 0.12)
    tops = mountain_layer(cv, 303, HOR + 6, 70, 16, 6, hexc(0x4e4080), hexc(0x40366c), 40, 8, 6, 0.6, 0.55, 0.2)
    ground = int(np.median(tops))
    tip_row, cx = castle(cv, HOR - 4)
    beam(cv, tip_row, cx)
    valley_haze(cv)
    mountain_layer(cv, 404, HOR + 22, 48, 16, 6, hexc(0x433a6c), hexc(0x362f5a), 36, 8, 6, 0.7, 0.4, 0.28)
    bottom_fill(cv)
    top_fade(cv)
    _ = ground
    return cv


def to_image(cv):
    rgba = np.concatenate([np.clip(cv.rgb, 0, 1), np.clip(cv.a, 0, 1)[..., None]], axis=2)
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')


def preview(img):
    """하늘 그라디언트(런타임 돔과 같은 4단)를 깔아 합성한 미리보기"""
    zen, mid, low, hor = hexc(0x4a3f8f), hexc(0x8a6bb5), hexc(0xdc7f9a), hexc(0xf6a85e)
    elev = np.clip(np.tan(np.clip((HOR - Y) / PX_PER_RAD, -1.5, 1.5)) / np.sqrt(1 + np.tan(np.clip((HOR - Y) / PX_PER_RAD, -1.5, 1.5)) ** 2), 0, 1)
    u = np.power(np.clip(elev, 0, 1), 0.6) * np.ones((1, W), np.float32)
    bg = np.where((u < 1 / 3)[..., None], mix(hor, low, u * 3), np.where((u < 2 / 3)[..., None], mix(low, mid, u * 3 - 1), mix(mid, zen, u * 3 - 2)))
    sun = np.exp(-(wrapdx(X, SUN_X) ** 2 + (Y - SUN_ROW) ** 2) / (2 * 60.0 ** 2))
    bg = mix(bg, hexc(0xffd27a), np.clip(sun * 0.9, 0, 1))
    disc = (np.hypot(wrapdx(X, SUN_X), Y - SUN_ROW) < 13).astype(np.float32)
    bg = mix(bg, hexc(0xfff0a8), disc)
    a = np.array(img.convert('RGBA'), np.float32) / 255.0
    out = bg * (1 - a[..., 3:4]) + a[..., :3] * a[..., 3:4]
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(here, '..', 'src', 'assets', 'backdrop_dusk.png'))
    ap.add_argument('--preview', default=None, help='하늘 그라디언트를 깔아 합성한 미리보기 PNG 경로')
    args = ap.parse_args()
    img = to_image(build())
    img.save(args.out, optimize=True)
    a = np.array(img, np.float32)
    seam = float(np.abs(a[:, 0] - a[:, -1]).mean())
    print(f'wrote {args.out} {img.size} seam_diff={seam:.2f}')
    if args.preview:
        preview(img).save(args.preview)
        print('preview', args.preview)


if __name__ == '__main__':
    main()
