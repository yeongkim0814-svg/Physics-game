#!/usr/bin/env python3
"""주인공 복셀 카빙 (M1j): 3면 도면(정면·오른쪽 측면·후면) -> 부위 분할 복셀 데이터 JSON.

사용자 제공 도면(약 1536x1024 PNG, 가로 3컷)에서
  1) 컷별 전경 마스크 (어두운 비네팅 + 주황/흰 글로우 후광 제거: 윤곽선 폐곡선 + 경계 flood fill)
  2) 같은 키(VOXEL_HEIGHT 칸)로 정규화
  3) 부위별 카빙 (정면 마스크로 좌우 x 범위, 측면 마스크로 깊이 z 범위, 슈퍼엘립스 단면)
  4) 색칠 (정면 -> 앞면, 후면 -> 뒷면, 측면 -> 옆면, 미관측은 최근접 표면색), 팔레트 양자화
  5) RLE + 팔레트 JSON (src/assets/protagonist_voxels.json)
을 수행한다. 입력 없는 난수 없음(k-means 시드 고정) -> 결정적.

사용법:
  python3 scripts/carve_character.py <도면.png> [--out src/assets/protagonist_voxels.json] [--debug DIR]

모든 수치는 아래 상수 (docs/CHARACTER_ASSETS.md 에 같은 값을 기록). 높이 비율 h 는 발바닥 0 ~ 머리 꼭대기 1.
"""
import argparse
import base64
import json
import os
import sys

import cv2
import numpy as np

# ───────────────────────── 상수 ─────────────────────────
VOXEL_HEIGHT = 72            # 키(머리 꼭대기~발바닥)의 복셀 수. 낮추면 삼각형 감소
HEIGHT_M = 1.8               # 키 (m). 복셀 한 변 = HEIGHT_M / VOXEL_HEIGHT
PALETTE_COLORS = 14          # 몸 k-means 색 수
HEAD_COLORS = 5              # 머리 전용 k-means 색 수 (피부·머리카락·안경테·그늘)
# (+ 발광 청록 최대 EMISSIVE_COLORS 색)
EXTENT_MEDIAN = 5            # 부위 좌우/앞뒤 범위의 행 방향 중앙값 필터 길이 (1 = 끔). 계단 잡음 제거 -> 삼각형 감소
COLOR_MEDIAN = 3             # 컷 색(복셀 해상도)에 먹이는 중앙값 필터 커널 (0 = 끔). 외톨이 색 제거 -> 병합 증가
SMOOTH_PASSES = 3            # 외톨이 색 복셀을 이웃 다수색으로 바꾸는 횟수 (삼각형 감소)
SMOOTH_MIN_SAME = 3          # 이웃(6방향+자기) 중 같은 색이 이 값 미만이면 외톨이
NUM_CUTS = 3                 # 가로 3등분

# --- 분할(마스크) ---
EDGE_T = 2.5                 # 경계 판정 그래디언트 임계 (채널 최대 Sobel/8)
EDGE_BLUR = 1.2              # 그래디언트 전 가우시안 시그마 (px)
EDGE_DILATE = 7              # 경계선 팽창 커널 (윤곽 틈 메우기)
MASK_CLOSE = 13              # 전경 닫힘 커널 (머리카락 등 어두운 틈)
MASK_ERODE = 5               # flood 후 전경 침식 커널 (경계선 팽창분 보상)
HEAD_DARK_GAIN = 0.7         # 얼굴 칸 색에 블록 최소 휘도 비율을 섞는 정도 (0 = 평균색만). 안경테·눈이 보이게
COLOR_ERODE_PX = 3           # 색 샘플용 마스크 침식 (후광 번짐 제외, 원본 px)

# --- 높이 비율 랜드마크 (정면 도면 측정, 발바닥 0 ~ 정수리 1) ---
HEAD_BOTTOM_H = 0.865        # 머리 그룹 하단 = 목 피벗 (턱 아래)
SHOULDER_H = 0.795           # 어깨 피벗
ELBOW_H = 0.652              # 팔꿈치 피벗 (소매 끝)
ARM_BOTTOM_H = 0.385         # 이 아래에는 팔 없음 (손끝/장치 아래)
WAIST_H = 0.583              # 허리 피벗 (벨트 아래). 위 = 가슴(torso), 아래 = 골반(pelvis)
HIP_H = 0.500                # 고관절 피벗. 아래 = 실험복 자락(skirt)
HEM_LO_H = 0.285             # 자락 아래 경계. 아래 = 다리
KNEE_H = 0.245               # 무릎 피벗. 위 = 허벅지, 아래 = 정강이
ANKLE_H = 0.085              # 발목 피벗. 아래 = 발(부츠 앞쪽)
SASH_TAIL_TOP_H = 0.575      # 어깨 천 자락 시작(벨트 아래)
# 몸통 반폭 앵커 (h, 반폭/키): |x| 가 이보다 크면 팔로 분류 (ARM_BOTTOM_H 이상에서만)
TORSO_HALF = [(0.88, 0.06), (0.84, 0.10), (0.815, 0.118), (0.78, 0.108), (0.70, 0.100),
              (0.62, 0.100), (0.55, 0.105), (0.50, 0.115), (0.45, 0.135), (0.385, 0.15)]
# 팔 z 중심 = 같은 높이 몸통 z 중심 + 오프셋 (h, 오프셋/키): 측면 도면에서 측정 (팔이 몸 중심면 근처에 늘어짐)
ARM_Z_ANCHORS = [(0.80, -0.012), (0.65, -0.005), (0.55, 0.0), (0.44, 0.012)]
ARM_DEPTH_RATIO = 0.85       # 팔 두께(z) = 정면 폭 x 이 값 (팔이 몸통 두께로 두꺼워지는 문제 방지)
ARM_DEPTH_MIN, ARM_DEPTH_MAX = 3, 8
LEG_DEPTH_RATIO = 1.25       # 다리 두께 상한 = 정면 폭 x 이 값 (발은 제외: 앞코가 길다)
# 슈퍼엘립스 지수 (2 = 타원, 클수록 직사각형). 단면 |dx/hx|^n + |dz/hz|^n <= 1
SUPER_N = {'head': 2.3, 'torso': 2.8, 'pelvis': 2.8, 'skirt': 3.0, 'arm': 2.3, 'leg': 2.6, 'foot': 3.0, 'device': 6.0}
# --- 장치 ---
DEVICE_HAND_H = (0.36, 0.53)         # 장치를 찾는 오른손 높이 구간
DEVICE_DARK_LUM = 80                 # 이보다 어두운(휘도) 칸 = 장치 본체
DEVICE_DEPTH = 4                     # 장치 두께 (복셀)
DEVICE_BODY_RGB = (30, 30, 38)
CYAN_MIN_G, CYAN_MIN_B, CYAN_MAX_R = 140, 140, 150   # 발광 청록 판정 (복셀 평균색)
CYAN_PX_MIN, CYAN_PX_MAX_R = 170, 130                # 발광 청록 판정 (원본 픽셀: 화면의 밝은 청록만, 후광 제외)
CYAN_COVERAGE = 0.12                                 # 복셀 칸에서 청록 픽셀이 이 비율 이상이면 화면 복셀
# --- 색 판정 ---
COAT_LUM = 150               # 이 이상 밝은 칸 = 실험복(톱니 자락 판정)
SASH_B_MINUS_R, SASH_G_MINUS_R = 5, 3   # 천(어두운 청록회색 ≈ #3C4344): b-r, g-r 이 이 이상
SASH_MIN_LUM, SASH_MAX_LUM = 45, 125
EMISSIVE_COLORS = 2
KMEANS_SEED = 7

PARTS = ['none', 'head', 'torso', 'pelvis', 'armR_upper', 'armR_fore', 'armL_upper', 'armL_fore',
         'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL', 'skirtF', 'skirtB',
         'sashF', 'sashB', 'device']
P = {n: i for i, n in enumerate(PARTS)}
# 정합용 거친 라벨
L_NONE, L_HEAD, L_CENTER, L_ARM_R, L_ARM_L, L_LEG_R, L_LEG_L, L_DEVICE = range(8)


def ellipse(k):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))


# ───────────────────────── 1. 분할 ─────────────────────────
def segment(cut_bgr):
    """윤곽선(그래디언트)으로 닫힌 영역을 만들고 경계에서 flood fill 한 배경의 보집합 = 전경.
    후광은 매끄러운 그라디언트라 경계로 잡히지 않고, 인물은 도트 윤곽선이 있어 닫힌다."""
    g = cv2.GaussianBlur(cut_bgr, (0, 0), EDGE_BLUR).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.sqrt(gx ** 2 + gy ** 2).max(axis=2) / 8
    edge = cv2.dilate((mag > EDGE_T).astype(np.uint8), ellipse(EDGE_DILATE))
    ff = (1 - edge).astype(np.uint8)
    h, w = ff.shape
    mk = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]:
        if ff[sy, sx] == 1:
            cv2.floodFill(ff, mk, (sx, sy), 2)
    fg = cv2.erode((ff != 2).astype(np.uint8), ellipse(MASK_ERODE))
    c = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, ellipse(MASK_CLOSE))
    ff2 = (1 - c).astype(np.uint8)
    mk2 = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff2, mk2, (0, 0), 2)
    c = (ff2 != 2).astype(np.uint8)
    c = cv2.morphologyEx(c, cv2.MORPH_OPEN, ellipse(5))
    n, lab, st, _ = cv2.connectedComponentsWithStats(c)
    return (lab == 1 + int(np.argmax(st[1:, 4]))).astype(np.uint8)


# ───────────────────────── 2. 정규화 ─────────────────────────
class Cut:
    """복셀 해상도로 정규화된 컷. 배열 행 0 = 발바닥(위로 증가), 열 = 이미지 열."""
    pass


def nearest_fill(color, valid):
    inv = (~valid).astype(np.uint8)
    if inv.sum() == 0:
        return color
    _, labels = cv2.distanceTransformWithLabels(inv, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.where(valid)
    table = {}
    lv = labels[ys, xs]
    out = color.copy()
    lut_y = np.zeros(labels.max() + 1, np.int32)
    lut_x = np.zeros(labels.max() + 1, np.int32)
    lut_y[lv] = ys
    lut_x[lv] = xs
    iy, ix = np.where(~valid)
    out[iy, ix] = color[lut_y[labels[iy, ix]], lut_x[labels[iy, ix]]]
    return out


def normalize(cut_bgr, mask):
    ys, xs = np.where(mask > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    scale = VOXEL_HEIGHT / (y1 - y0)
    w = int(round((x1 - x0) * scale))
    m = mask[y0:y1, x0:x1].astype(np.float32)
    core = cv2.erode(mask, ellipse(2 * COLOR_ERODE_PX + 1))[y0:y1, x0:x1].astype(np.float32)
    img = cv2.cvtColor(cut_bgr, cv2.COLOR_BGR2RGB)[y0:y1, x0:x1].astype(np.float32)
    size = (w, VOXEL_HEIGHT)
    cov = cv2.resize(m, size, interpolation=cv2.INTER_AREA)
    ccov = cv2.resize(core, size, interpolation=cv2.INTER_AREA)
    col = cv2.resize(img * core[..., None], size, interpolation=cv2.INTER_AREA) / np.maximum(ccov[..., None], 1e-6)
    # 얼굴(머리 행): 칸 평균은 안경테·눈 같은 가는 어두운 선을 피부색에 묻어버리므로, 블록 최소값(어두운 쪽)을 섞어 대비를 살린다
    head_rows_px = int(round((1 - HEAD_BOTTOM_H) * (y1 - y0)))
    if HEAD_DARK_GAIN > 0 and head_rows_px > 0:
        k = max(3, int(round(1 / scale)) | 1)
        img_head = img[:head_rows_px].copy()
        lum = img_head @ np.array([0.299, 0.587, 0.114], np.float32)
        core_head = core[:head_rows_px] > 0
        lum_m = np.where(core_head, lum, 255.0).astype(np.float32)
        lmin = cv2.erode(lum_m, np.ones((k, k), np.uint8))
        # 최소 휘도 위치의 색 대신, 휘도 비율로 평균색을 어둡게 한다 (색조 유지)
        ratio = np.clip(lmin / np.maximum(lum, 1.0), 0.0, 1.0)
        dark = img_head * np.where(core_head, ratio, 1.0)[..., None]
        hr = int(round(VOXEL_HEIGHT * (1 - HEAD_BOTTOM_H)))
        dsmall = cv2.resize(dark * core_head[..., None], (w, hr), interpolation=cv2.INTER_AREA)
        csmall = cv2.resize(core_head.astype(np.float32), (w, hr), interpolation=cv2.INTER_AREA)
        dcol = dsmall / np.maximum(csmall[..., None], 1e-6)
        col[:hr] = col[:hr] + HEAD_DARK_GAIN * (dcol - col[:hr])
    cy = ((img[..., 1] > CYAN_PX_MIN) & (img[..., 2] > CYAN_PX_MIN) & (img[..., 0] < CYAN_PX_MAX_R)).astype(np.float32)
    c = Cut()
    c.cyan = (cv2.resize(cy, size, interpolation=cv2.INTER_AREA) >= CYAN_COVERAGE)[::-1].copy()
    c.cyan_rgb = tuple(img[cy > 0].mean(axis=0)) if (cy > 0).any() else (110, 230, 220)
    c.occ = (cov >= 0.5)[::-1].copy()
    valid = (ccov >= 0.25)[::-1].copy()
    c.color = nearest_fill(col[::-1].copy(), valid & c.occ)
    if COLOR_MEDIAN:
        med = cv2.medianBlur(np.clip(c.color, 0, 255).astype(np.uint8), COLOR_MEDIAN).astype(np.float32)
        head_rows = int(round(HEAD_BOTTOM_H * VOXEL_HEIGHT))
        med[head_rows:] = c.color[head_rows:]       # 얼굴(안경·눈)은 중앙값 필터에서 제외
        c.color = med
    c.scale, c.bbox, c.w = scale, (x0, y0, x1, y1), w
    return c


def axis_of(occ, lo=0.62, hi=0.78):
    """몸 중심축(열 좌표, 연속): 어깨~가슴 행들의 마스크 좌우 끝 중점의 중앙값"""
    ny = occ.shape[0]
    cs = []
    for y in range(int(lo * ny), int(hi * ny)):
        xs = np.where(occ[y])[0]
        if len(xs):
            cs.append((xs.min() + xs.max() + 1) / 2)
    return float(np.median(cs))


def axis_side(occ, lo=0.45, hi=0.78):
    return axis_of(occ, lo, hi)


# ───────────────────────── 3. 카빙 ─────────────────────────
class Grid:
    pass


def interp(anchors, h):
    hs = [a[0] for a in anchors]
    vs = [a[1] for a in anchors]
    order = np.argsort(hs)
    return float(np.interp(h, np.array(hs)[order], np.array(vs)[order]))


def to_grid_x(arr, axis, GX, NX, flip):
    """컷 배열(열 = 이미지 열)을 캐릭터 x(오른쪽 +) 격자 인덱스 열로 재배열. flip: 정면(이미지 왼쪽 = 캐릭터 오른쪽)"""
    ny, w = arr.shape[:2]
    out = np.zeros((ny, NX) + arr.shape[2:], arr.dtype)
    cols = np.zeros(NX, np.int32)
    ok = np.zeros(NX, bool)
    for i in range(NX):
        xc = i - GX
        c = int(round(axis - xc - 0.5)) if flip else int(round(xc + axis - 0.5))
        cols[i] = c
        ok[i] = 0 <= c < w
    out[:, ok] = arr[:, cols[ok]]
    return out


def coarse_labels(M, GX, NY, device=None):
    """정면/후면 마스크(격자 x 정렬)에서 거친 부위 라벨"""
    NX = M.shape[1]
    L = np.zeros(M.shape, np.uint8)
    xs = np.arange(NX) - GX
    for y in range(NY):
        h = (y + 0.5) / NY
        tw = interp(TORSO_HALF, h) * NY
        for i in np.where(M[y])[0]:
            x = xs[i]
            if h >= HEAD_BOTTOM_H:
                L[y, i] = L_HEAD
            elif h >= ARM_BOTTOM_H and abs(x) > tw:
                L[y, i] = L_ARM_R if x > 0 else L_ARM_L
            elif h >= HEM_LO_H:
                L[y, i] = L_CENTER
            else:
                L[y, i] = L_LEG_R if x > 0 else L_LEG_L
    if device is not None:
        L[device] = L_DEVICE
    return L


def find_device(M, L, color, GX, NY):
    """오른손(x>0) 높이 구간의 어두운/청록 칸 중 최대 연결 성분 = 장치. 반환: bool 격자"""
    lum = color @ np.array([0.299, 0.587, 0.114])
    r, g, b = color[..., 0], color[..., 1], color[..., 2]
    cyan = (g > CYAN_MIN_G) & (b > CYAN_MIN_B) & (r < CYAN_MAX_R)
    cand = M & (L == L_ARM_R) & ((lum < DEVICE_DARK_LUM) | cyan)
    ys = np.arange(NY)
    hh = (ys + 0.5) / NY
    cand &= ((hh >= DEVICE_HAND_H[0]) & (hh <= DEVICE_HAND_H[1]))[:, None]
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), connectivity=8)
    if n <= 1:
        return np.zeros_like(M)
    best = 1 + int(np.argmax(st[1:, 4]))
    dev = lab == best
    # 구멍(청록 화면 사이 칸) 메우기: 행별 좌우 끝 사이
    out = np.zeros_like(dev)
    for y in range(NY):
        xs = np.where(dev[y])[0]
        if len(xs):
            out[y, xs.min():xs.max() + 1] = True
    return out & M


def super_mask(nx, nz, x0, x1, z0, z1, n):
    """셀 x0..x1, z0..z1 (포함) 범위에 내접하는 슈퍼엘립스 안의 셀 목록"""
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    hx, hz = (x1 - x0 + 1) / 2, (z1 - z0 + 1) / 2
    cells = []
    for k in range(z0, z1 + 1):
        for i in range(x0, x1 + 1):
            if (abs(i - cx) / hx) ** n + (abs(k - cz) / hz) ** n <= 1.0 + 1e-9:
                cells.append((i, k))
    return cells


def median_series(vals):
    """None 을 건너뛰는 길이 EXTENT_MEDIAN 중앙값 필터 (구간 끝은 그대로)"""
    n = len(vals)
    r = EXTENT_MEDIAN // 2
    out = list(vals)
    if r == 0:
        return out
    for y in range(n):
        if vals[y] is None:
            continue
        win = [vals[j] for j in range(max(0, y - r), min(n, y + r + 1)) if vals[j] is not None]
        if len(win) == 2 * r + 1:
            out[y] = int(sorted(win)[len(win) // 2])
    return out


def carve(F, side, NY, NX, NZ, GX, GZ, F_lab, device_cells):
    """정면 격자 F(bool,[NY,NX]), 측면 격자 side(bool,[NY,NZ]) -> 부위 id 복셀 [NY,NZ,NX] (uint8)"""
    vox = np.zeros((NY, NZ, NX), np.uint8)
    zext = []
    for y in range(NY):
        ks = np.where(side[y])[0]
        zext.append((int(ks.min()), int(ks.max())) if len(ks) else None)
    # 가장 가까운 유효 행으로 보간
    for y in range(NY):
        if zext[y] is None:
            for d in range(1, NY):
                for yy in (y - d, y + d):
                    if 0 <= yy < NY and zext[yy] is not None:
                        zext[y] = zext[yy]
                        break
                if zext[y] is not None:
                    break
    # 윤곽 잡음 제거: 행 방향 중앙값 필터 (한 행짜리 튀어나옴/들어감 제거 -> 계단 면 감소)
    zlo_s = median_series([z[0] for z in zext])
    zhi_s = median_series([z[1] for z in zext])
    ext = {}
    for key in (L_HEAD, L_CENTER, L_ARM_R, L_ARM_L, L_LEG_R, L_LEG_L):
        x0s, x1s = [], []
        for y in range(NY):
            xs = np.where(F_lab[y] == key)[0]
            x0s.append(int(xs.min()) if len(xs) else None)
            x1s.append(int(xs.max()) if len(xs) else None)
        ext[key] = (median_series(x0s), median_series(x1s))
    center_z = {}
    for y in range(NY):
        h = (y + 0.5) / NY
        pieces = {}
        for key in ext:
            if ext[key][0][y] is not None:
                pieces[key] = (ext[key][0][y], ext[key][1][y])
        zlo, zhi = zlo_s[y], zhi_s[y]
        zc_body = (zlo + zhi) / 2
        center_z[y] = zc_body
        for key, (x0, x1) in pieces.items():
            width = x1 - x0 + 1
            if key == L_HEAD:
                part, n, z0, z1 = P['head'], SUPER_N['head'], zlo, zhi
            elif key == L_CENTER:
                if h >= WAIST_H:
                    part, n = P['torso'], SUPER_N['torso']
                elif h >= HIP_H:
                    part, n = P['pelvis'], SUPER_N['pelvis']
                else:
                    part, n = P['skirt' + 'F'], SUPER_N['skirt']   # F/B 는 나중에 z 로 나눈다
                z0, z1 = zlo, zhi
            elif key in (L_ARM_R, L_ARM_L):
                side_sgn = 1 if key == L_ARM_R else -1
                part = P[('armR' if side_sgn == 1 else 'armL') + ('_upper' if h >= ELBOW_H else '_fore')]
                n = SUPER_N['arm']
                depth = int(np.clip(round(width * ARM_DEPTH_RATIO), ARM_DEPTH_MIN, ARM_DEPTH_MAX))
                zc = zc_body + interp(ARM_Z_ANCHORS, h) * NY
                z0 = int(round(zc - (depth - 1) / 2))
                z1 = z0 + depth - 1
            else:
                is_r = key == L_LEG_R
                if h >= KNEE_H:
                    nm = 'thigh'
                elif h >= ANKLE_H:
                    nm = 'shin'
                else:
                    nm = 'foot'
                part = P[nm + ('R' if is_r else 'L')]
                n = SUPER_N['foot' if nm == 'foot' else 'leg']
                z0, z1 = zlo, zhi
                if nm != 'foot':
                    cap = int(round(width * LEG_DEPTH_RATIO))
                    if z1 - z0 + 1 > cap:
                        mid = (z0 + z1) / 2
                        z0 = int(round(mid - (cap - 1) / 2))
                        z1 = z0 + cap - 1
            for (i, k) in super_mask(NX, NZ, x0, x1, z0, z1, n):
                if 0 <= k < NZ:
                    vox[y, k, i] = part
    # 장치
    dev_ys = sorted({y for y, _ in device_cells})
    for y in dev_ys:
        h = (y + 0.5) / NY
        xs = [i for yy, i in device_cells if yy == y]
        x0, x1 = min(xs), max(xs)
        zc = center_z[y] + interp(ARM_Z_ANCHORS, h) * NY
        z0 = int(round(zc - (DEVICE_DEPTH - 1) / 2))
        z1 = z0 + DEVICE_DEPTH - 1
        for (i, k) in super_mask(NX, NZ, x0, x1, z0, z1, SUPER_N['device']):
            vox[y, k, i] = P['device']
    return vox


# ───────────────────────── 4. 색칠 ─────────────────────────
def register_map(Ldst, Lsrc, NY, NX):
    """dst(정면) 라벨 행/부위 범위 -> src(후면) 범위로 선형 정합하는 열 매핑 [NY,NX] (float, src 격자 열)"""
    mp = np.tile(np.arange(NX, dtype=np.float32), (NY, 1))
    for y in range(NY):
        for key in range(1, 8):
            d = np.where(Ldst[y] == key)[0]
            s = np.where(Lsrc[y] == key)[0]
            if len(d) == 0 or len(s) == 0:
                continue
            a, b = d.min(), d.max()
            a2, b2 = s.min(), s.max()
            for i in range(a, b + 1):
                mp[y, i] = a2 + (i - a + 0.5) / (b - a + 1) * (b2 - a2 + 1) - 0.5
    return mp


def paint(vox, front, back, side, regmap_back, NY, NX, NZ, GZ, az):
    """표면 복셀에 도면 색 투영. 반환: rgb [NY,NZ,NX,3], painted(0 없음/1 측면/2 후면/3 정면)"""
    rgb = np.zeros(vox.shape + (3,), np.float32)
    painted = np.zeros(vox.shape, np.uint8)
    occ = vox > 0
    dev = vox == P['device']
    # 측면: +x 쪽 첫 복셀 / -x 쪽 첫 복셀 (왼쪽은 오른쪽 미러)
    for y in range(NY):
        for k in range(NZ):
            xs = np.where(occ[y, k] & ~dev[y, k])[0]
            if len(xs) == 0:
                continue
            col = int(round(az - (k - GZ) - 0.5))
            if not (0 <= col < side.shape[1]):
                continue
            c = side[y, col]
            for i in (xs.max(), xs.min()):
                rgb[y, k, i] = c
                painted[y, k, i] = 1
    for y in range(NY):
        for i in range(NX):
            ks = np.where(occ[y, :, i])[0]
            if len(ks) == 0:
                continue
            # 후면: 마지막 복셀
            k = ks.max()
            j = int(round(regmap_back[y, i]))
            j = min(max(j, 0), back.shape[1] - 1)
            rgb[y, k, i] = back[y, j]
            painted[y, k, i] = 2
            # 정면: 첫 복셀
            k = ks.min()
            rgb[y, k, i] = front[y, i]
            painted[y, k, i] = 3
    return rgb, painted


def fill_unpainted(rgb, painted, occ):
    """미칠한 복셀을 3D 최근접(6방향 BFS) 칠한 복셀 색으로 채움 (결정적: 방향 순서 고정)"""
    known = painted > 0
    dirs = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    while True:
        need = occ & ~known
        if not need.any():
            break
        new_rgb = rgb.copy()
        new_known = known.copy()
        cnt = np.zeros(known.shape, np.float32)
        acc = np.zeros(rgb.shape, np.float32)
        for d in dirs:
            sk = np.roll(known, d, axis=(0, 1, 2))
            sr = np.roll(rgb, d, axis=(0, 1, 2))
            # roll 의 가장자리 순환 방지
            for ax, s in enumerate(d):
                if s == 1:
                    sk[(slice(None),) * ax + (0,)] = False
                elif s == -1:
                    sk[(slice(None),) * ax + (-1,)] = False
            m = sk & need
            acc[m] += sr[m]
            cnt[m] += 1
        got = cnt > 0
        new_rgb[got] = acc[got] / cnt[got][:, None]
        new_known |= got
        if (new_known == known).all():
            break
        rgb, known = new_rgb, new_known
    return rgb


def is_sash(rgb):
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    return ((rgb[..., 2] - rgb[..., 0] >= SASH_B_MINUS_R) & (rgb[..., 1] - rgb[..., 0] >= SASH_G_MINUS_R)
            & (lum < SASH_MAX_LUM) & (lum > SASH_MIN_LUM))


def is_cyan(rgb):
    return (rgb[..., 1] > CYAN_MIN_G) & (rgb[..., 2] > CYAN_MIN_B) & (rgb[..., 0] < CYAN_MAX_R)


def kmeans_palette(pts, k):
    """k-means(시드 고정). 휘도 순으로 정렬한 (중심 목록, 점별 라벨)"""
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.5)
    k = max(1, min(k, len(np.unique(pts.round(0), axis=0))))
    _, lab, cen = cv2.kmeans(pts, k, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    lum = cen @ np.array([0.299, 0.587, 0.114])
    order = np.argsort(lum, kind='stable')
    remap = np.zeros(len(cen), np.int32)
    remap[order] = np.arange(len(cen))
    return [tuple(int(round(v)) for v in cen[j]) for j in order], remap[lab.ravel()]


def quantize(rgb, occ, emissive_mask, head_mask):
    """k-means 로 몸 PALETTE_COLORS 색 + 머리 HEAD_COLORS 색(피부·머리카락·안경 구분용 전용 팔레트) + 발광 청록.
    반환: idx [NY,NZ,NX] (0 = 빈칸, 1.. = 팔레트 번호), palette, emissive_idx"""
    cv2.setRNGSeed(KMEANS_SEED)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.5)
    idx = np.zeros(occ.shape, np.int32)
    body = occ & ~emissive_mask & ~head_mask
    palette, lab = kmeans_palette(rgb[body].astype(np.float32), PALETTE_COLORS)
    idx[body] = lab + 1
    head = occ & ~emissive_mask & head_mask
    if head.any():
        hp, hl = kmeans_palette(rgb[head].astype(np.float32), HEAD_COLORS)
        idx[head] = hl + 1 + len(palette)
        palette = palette + hp
    emissive_idx = []
    if emissive_mask.any():
        ep = rgb[emissive_mask].astype(np.float32)
        k = min(EMISSIVE_COLORS, max(1, len(np.unique(ep.round(-1), axis=0))))
        if k > 1:
            _, el, ec = cv2.kmeans(ep, k, None, crit, 5, cv2.KMEANS_PP_CENTERS)
            el = el.ravel()
            elum = ec @ np.array([0.299, 0.587, 0.114])
            eo = np.argsort(elum, kind='stable')
            er = np.zeros(k, np.int32)
            er[eo] = np.arange(k)
            for j in eo:
                palette.append(tuple(int(round(v)) for v in ec[j]))
                emissive_idx.append(len(palette))
            idx[emissive_mask] = len(palette) - k + er[el] + 1
        else:
            palette.append(tuple(int(round(v)) for v in ep.mean(axis=0)))
            emissive_idx.append(len(palette))
            idx[emissive_mask] = len(palette)
    return idx, palette, emissive_idx


def smooth(idx, part, occ, protected):
    """외톨이 색 복셀을 이웃 다수색으로 교체 (같은 부위 이웃만, 발광/보호 제외)"""
    dirs = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    ys, ks, xs = np.where(occ & ~protected)
    out = idx.copy()
    sh = idx.shape
    for y, k, x in zip(ys, ks, xs):
        me = idx[y, k, x]
        cnt = {me: 1}
        for dy, dk, dx in dirs:
            yy, kk, xx = y + dy, k + dk, x + dx
            if 0 <= yy < sh[0] and 0 <= kk < sh[1] and 0 <= xx < sh[2] and occ[yy, kk, xx] and part[yy, kk, xx] == part[y, k, x]:
                c = idx[yy, kk, xx]
                cnt[c] = cnt.get(c, 0) + 1
        if cnt[me] < SMOOTH_MIN_SAME:
            best = max(sorted(cnt), key=lambda c: cnt[c])
            if cnt[best] > cnt[me] and not protected[y, k, x]:
                out[y, k, x] = best
    return out


# ───────────────────────── 5. 코덱 (런타임 src/player/voxelCodec.ts 와 동일 규약) ─────────────────────────
def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def encode_rle(sym, size_xyz):
    """sym: [NY,NZ,NX] int (part<<6 | colorIdx). 순서: y(아래→위) 바깥, z(앞→뒤), x(왼쪽→오른쪽) 안쪽. (심볼, 길이) varint 쌍을 base64"""
    flat = sym.reshape(-1)
    out = bytearray()
    i = 0
    n = len(flat)
    while i < n:
        j = i
        while j < n and flat[j] == flat[i]:
            j += 1
        out += varint(int(flat[i])) + varint(j - i)
        i = j
    return base64.b64encode(bytes(out)).decode('ascii')


# ───────────────────────── 시각화 ─────────────────────────
PART_COLORS = np.array([
    (0, 0, 0), (230, 80, 80), (80, 160, 230), (230, 200, 60), (90, 220, 120), (40, 150, 70), (220, 120, 220), (150, 60, 160),
    (240, 150, 60), (200, 100, 30), (120, 60, 20), (60, 220, 220), (30, 150, 150), (20, 90, 100), (250, 250, 130), (190, 190, 80),
    (255, 90, 160), (170, 50, 100), (255, 255, 255)], np.uint8)


def project(vox_rgb, occ, axis_name, background=(40, 40, 48)):
    """직교 투영 (첫 복셀). axis: 'front'(-z에서), 'back', 'right'(+x에서)"""
    NY, NZ, NX = occ.shape
    if axis_name in ('front', 'back'):
        img = np.zeros((NY, NX, 3), np.uint8)
        img[:] = background
        for y in range(NY):
            for i in range(NX):
                ks = np.where(occ[y, :, i])[0]
                if len(ks):
                    k = ks.min() if axis_name == 'front' else ks.max()
                    img[y, i] = vox_rgb[y, k, i]
        if axis_name == 'front':
            img = img[:, ::-1]      # 캐릭터 오른쪽(+x)이 이미지 왼쪽
        img = img[::-1]
    else:
        img = np.zeros((NY, NZ, 3), np.uint8)
        img[:] = background
        for y in range(NY):
            for k in range(NZ):
                xs = np.where(occ[y, k])[0]
                if len(xs):
                    img[y, k] = vox_rgb[y, k, xs.max()]
        img = img[:, ::-1][::-1]    # 앞(-z)이 이미지 오른쪽
    return img


def save_up(path, img, up=6):
    cv2.imwrite(path, cv2.cvtColor(cv2.resize(img, None, fx=up, fy=up, interpolation=cv2.INTER_NEAREST), cv2.COLOR_RGB2BGR))


# ───────────────────────── 메인 ─────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('--out', default='src/assets/protagonist_voxels.json')
    ap.add_argument('--height', type=int, default=None)
    ap.add_argument('--colors', type=int, default=None)
    ap.add_argument('--median', type=int, default=None)
    ap.add_argument('--smooth', type=int, default=None)
    ap.add_argument('--debug', default=None, help='중간 산출물(마스크 오버레이·부위 분할·투영) 저장 폴더')
    a = ap.parse_args()
    global VOXEL_HEIGHT, PALETTE_COLORS, COLOR_MEDIAN, SMOOTH_PASSES
    if a.height: VOXEL_HEIGHT = a.height
    if a.colors: PALETTE_COLORS = a.colors
    if a.median is not None: COLOR_MEDIAN = a.median
    if a.smooth is not None: SMOOTH_PASSES = a.smooth
    dbg = a.debug
    if dbg:
        os.makedirs(dbg, exist_ok=True)

    im = cv2.imread(a.input)
    if im is None:
        sys.exit('입력 이미지를 읽을 수 없음: ' + a.input)
    H, W = im.shape[:2]
    cuts_bgr = [im[:, i * W // NUM_CUTS:(i + 1) * W // NUM_CUTS] for i in range(NUM_CUTS)]
    masks = [segment(c) for c in cuts_bgr]
    if dbg:
        for name, c, m in zip(('front', 'side', 'back'), cuts_bgr, masks):
            ov = c.copy()
            bgm = m == 0
            ov[bgm] = (ov[bgm] * 0.25 + np.array([255, 0, 255]) * 0.75).astype(np.uint8)
            cnt, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(ov, cnt, -1, (0, 255, 255), 1)
            cv2.imwrite(os.path.join(dbg, f'mask_{name}.png'), ov)

    cf, cs, cb = (normalize(c, m) for c, m in zip(cuts_bgr, masks))
    NY = VOXEL_HEIGHT
    ax_f, ax_b, az = axis_of(cf.occ), axis_of(cb.occ), axis_side(cs.occ)
    half = max(ax_f, cf.w - ax_f, ax_b, cb.w - ax_b)
    GX = int(np.ceil(half)) + 1
    NX = 2 * GX + 1
    zhalf = max(az, cs.w - az)
    GZ = int(np.ceil(zhalf)) + 1
    NZ = 2 * GZ + 1
    print(f'cuts: front {cf.w}x{NY} axis {ax_f:.1f}, side {cs.w}x{NY} axis {az:.1f}, back {cb.w}x{NY} axis {ax_b:.1f}; grid {NX}x{NY}x{NZ}')

    F = to_grid_x(cf.occ, ax_f, GX, NX, True)
    B = to_grid_x(cb.occ, ax_b, GX, NX, False)
    Fc = to_grid_x(cf.color, ax_f, GX, NX, True)
    Fcy = to_grid_x(cf.cyan, ax_f, GX, NX, True)
    Bc = to_grid_x(cb.color, ax_b, GX, NX, False)
    S = np.zeros((NY, NZ), bool)
    for k in range(NZ):
        col = int(round(az - (k - GZ) - 0.5))
        if 0 <= col < cs.w:
            S[:, k] = cs.occ[:, col]

    # 장치 + 거친 라벨
    Lf0 = coarse_labels(F, GX, NY)
    Lb0 = coarse_labels(B, GX, NY)
    devF = find_device(F, Lf0, Fc, GX, NY)
    devB = find_device(B, Lb0, Bc, GX, NY)
    Lf = coarse_labels(F, GX, NY, devF)
    Lb = coarse_labels(B, GX, NY, devB)
    device_cells = [(int(y), int(i)) for y, i in zip(*np.where(devF))]

    vox = carve(F, S, NY, NX, NZ, GX, GZ, Lf, device_cells)
    occ = vox > 0
    print('voxels after carve:', int(occ.sum()))

    reg = register_map(Lf, Lb, NY, NX)
    # 측면 색: 이미지 열 인덱스는 paint 안에서 계산
    rgb, painted = paint(vox, Fc, Bc, cs.color, reg, NY, NX, NZ, GZ, az)

    # 장치 비표면 복셀은 본체색, 발광은 정면 청록
    dev = vox == P['device']
    raw = rgb.copy()
    rgb[dev & (painted != 3)] = DEVICE_BODY_RGB
    painted[dev & (painted != 3)] = 3
    # 화면(발광): 정면 첫 층 장치 복셀 중 청록 픽셀이 있는 칸 (색은 청록 평균색으로 통일)
    emissive = np.zeros(vox.shape, bool)
    for y in range(NY):
        for i in range(NX):
            ks = np.where(dev[y, :, i])[0]
            if len(ks) and Fcy[y, i]:
                emissive[y, ks.min(), i] = True
    rgb[emissive] = cf.cyan_rgb

    # 톱니 자락: 자락 높이 아래 허벅지/정강이 중 실험복색(밝음)인 표면 복셀은 자락으로
    hh = (np.arange(NY) + 0.5) / NY
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    rows_tooth = ((hh >= KNEE_H - 0.02) & (hh < HEM_LO_H))[:, None, None]
    tooth_parts = np.isin(vox, [P['thighR'], P['thighL'], P['shinR'], P['shinL']])
    tooth = tooth_parts & rows_tooth & (painted >= 2) & (lum > COAT_LUM)
    vox[tooth] = P['skirtF']

    # 자락 앞/뒤: 자락 복셀 z 범위 중앙
    sk = np.isin(vox, [P['skirtF'], P['skirtB']])
    kk = np.where(sk.any(axis=(0, 2)))[0]
    kmid = (kk.min() + kk.max()) / 2
    kgrid = np.arange(NZ)[None, :, None]
    vox[sk & (kgrid > kmid)] = P['skirtB']

    # 어깨 천 자락: 벨트 아래 천색 표면(정면/후면 직접 칠) 복셀
    tail_rows = (hh < SASH_TAIL_TOP_H)[:, None, None]
    tail_ok = np.isin(vox, [P['torso'], P['pelvis'], P['skirtF'], P['skirtB']])
    sash = is_sash(rgb)
    front_tail = tail_ok & tail_rows & (painted == 3) & sash
    back_tail = tail_ok & tail_rows & (painted == 2) & sash
    vox[front_tail] = P['sashF']
    vox[back_tail] = P['sashB']

    occ = vox > 0
    rgb = fill_unpainted(rgb, painted, occ)
    emissive &= occ

    # 내부(6방향 모두 이웃이 찬) 복셀은 팔레트 학습에서 제외하고 부위 최빈색으로 채운다 (분할면 단면이 큰 단색 면으로 병합되게)
    empty_pad = np.pad(~occ, 1, constant_values=True)
    exposed = np.zeros(occ.shape, bool)
    for ax in range(3):
        for sgn in (-1, 1):
            sl = [slice(1, -1)] * 3
            sl[ax] = slice(1 + sgn, occ.shape[ax] + 1 + sgn)
            exposed |= empty_pad[tuple(sl)]
    interior = occ & ~exposed
    idx, palette, emissive_idx = quantize(rgb, occ & ~interior, emissive, vox == P['head'])
    for pid in range(1, len(PARTS)):
        m = (vox == pid) & interior
        if m.any():
            vals = idx[(vox == pid) & ~interior & (idx > 0)]
            if len(vals):
                idx[m] = np.bincount(vals).argmax()
    protected = emissive | (vox == P['device']) | is_sash(rgb)
    for _ in range(SMOOTH_PASSES):
        idx = smooth(idx, vox, occ, protected | interior)

    sym = np.where(occ, (vox.astype(np.int32) << 6) | idx, 0)
    if idx.max() >= 64:
        sys.exit('팔레트가 63색을 넘음')

    vs = HEIGHT_M / NY

    def wx(i): return (i - GX) * vs
    def wy(y): return (y + 0.5) * vs
    def wz(k): return (k - GZ) * vs

    def bbox(part_ids):
        m = np.isin(vox, part_ids)
        ys, ks, xs = np.where(m)
        return (xs.min(), xs.max(), ys.min(), ys.max(), ks.min(), ks.max()) if len(ys) else None

    def row_center(part_ids, y):
        m = np.isin(vox[y], part_ids)
        ks, xs = np.where(m)
        if len(ks) == 0:
            return None
        return (xs.mean(), ks.mean())

    def row_of(hv): return int(round(hv * NY))  # 경계 행(아래쪽 모서리)

    def edge_y(hv): return row_of(hv) * vs      # 경계의 월드 y

    pivots = {}
    tc = row_center([P['torso']], min(NY - 1, row_of(WAIST_H) + 1))
    pivots['waist'] = [0.0, edge_y(WAIST_H), wz(tc[1])]
    hc = row_center([P['head']], row_of(HEAD_BOTTOM_H))
    pivots['neck'] = [0.0, edge_y(HEAD_BOTTOM_H), wz(hc[1])]
    for s, nm, sgn in (('R', 'R', 1), ('L', 'L', -1)):
        up, fo = P['arm' + nm + '_upper'], P['arm' + nm + '_fore']
        ab = bbox([up])
        c = row_center([up], min(row_of(SHOULDER_H), int(ab[3])))
        pivots['shoulder' + s] = [wx(c[0]), edge_y(SHOULDER_H), wz(c[1])]
        c = row_center([up, fo], row_of(ELBOW_H))
        pivots['elbow' + s] = [wx(c[0]), edge_y(ELBOW_H), wz(c[1])]
        th, sh, ft = P['thigh' + nm], P['shin' + nm], P['foot' + nm]
        c = row_center([th, sh], row_of(KNEE_H))
        pivots['hip' + s] = [wx(c[0]), edge_y(HIP_H), wz(c[1])]
        pivots['knee' + s] = [wx(c[0]), edge_y(KNEE_H), wz(c[1])]
        c = row_center([sh, ft], row_of(ANKLE_H))
        pivots['ankle' + s] = [wx(c[0]), edge_y(ANKLE_H), wz(c[1])]
    sb = bbox([P['skirtF'], P['skirtB']])
    pivots['skirt'] = [0.0, edge_y(HIP_H), wz((sb[4] + sb[5]) / 2)]
    for nm in ('sashF', 'sashB'):
        bb = bbox([P[nm]])
        if bb:
            pivots[nm] = [wx((bb[0] + bb[1]) / 2), (bb[3] + 1) * vs, wz((bb[4] + bb[5]) / 2)]
    db = bbox([P['device']])
    # 장치: muzzle = 아래 끝(길이 방향 -y) 앞면 중앙, hand = 위쪽 1/4 지점(잡는 위치) 중앙
    pivots['deviceMuzzle'] = [wx((db[0] + db[1]) / 2), db[2] * vs, (db[4] - 0.5 - GZ) * vs]
    pivots['deviceHand'] = [wx((db[0] + db[1]) / 2), (db[3] + 1 - (db[3] - db[2] + 1) * 0.25) * vs, wz((db[4] + db[5]) / 2)]

    data = {
        'version': 1,
        'size': [int(NX), int(NY), int(NZ)],
        'voxelSize': vs,
        'origin': [GX, -0.5, GZ],
        'parts': PARTS,
        'palette': ['%02x%02x%02x' % c for c in palette],
        'emissive': [int(i) for i in emissive_idx],
        'pivots': {k: [round(float(v), 5) for v in p] for k, p in pivots.items()},
        'rle': encode_rle(sym, (NX, NY, NZ)),
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    cnts = {PARTS[p]: int((vox == p).sum()) for p in range(1, len(PARTS))}
    print('palette colors:', len(palette), 'emissive idx:', emissive_idx)
    print('voxels:', int(occ.sum()), 'by part:', cnts)
    print('json bytes:', os.path.getsize(a.out))

    if dbg:
        pal = np.array([(0, 0, 0)] + palette, np.uint8)
        qrgb = pal[idx]
        for nm in ('front', 'back', 'right'):
            save_up(os.path.join(dbg, f'carve_{nm}.png'), project(qrgb, occ, nm))
            save_up(os.path.join(dbg, f'parts_{nm}.png'), project(PART_COLORS[vox], occ, nm))
        # 도면 컷(정규화)과 나란히: 정면/측면/후면
        np.save(os.path.join(dbg, 'grid_info.npy'), np.array([NX, NY, NZ, GX, GZ]))


if __name__ == '__main__':
    main()
