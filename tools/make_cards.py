#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 raw/ 里的照片裁成方形牌面（人脸居中），供消消乐使用。

用法：
  python tools/make_cards.py

输出：
  assets/cards/card_1.png ... card_N.png   方形牌面
  assets/cards/cards.json                  牌面清单
  tools/cards_preview.png                  拼贴预览（检查裁切效果）
"""
import os
import sys
import glob
import json
import numpy as np
import cv2

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'raw')
OUT = os.path.join(ROOT, 'assets', 'cards')
CARD_SIZE = 256

CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


def imread_u(path, flags=cv2.IMREAD_COLOR):
    """cv2.imread 在 Windows 中文路径下会失败，用 imdecode 代替。"""
    try:
        return cv2.imdecode(np.fromfile(path, dtype=np.uint8), flags)
    except Exception:
        return None


def imwrite_u(path, img):
    ext = os.path.splitext(path)[1] or '.png'
    ok, buf = cv2.imencode(ext, img)
    if ok:
        buf.tofile(path)
    return ok


def square_around_face(img):
    """返回人脸居中的正方形裁剪框 (left, top, side)。"""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = CASCADE.detectMultiScale(gray, 1.1, 5,
                                     minSize=(int(w * 0.06), int(h * 0.06)))
    if len(faces):
        fx, fy, fw, fh = max(faces, key=lambda f: int(f[2]) * int(f[3]))
        cx, cy = fx + fw / 2.0, fy + fh / 2.0
        side = fw * 2.5                       # 正方形边长 ≈ 脸宽的 2.5 倍（脸占牌面主体）
        # 脸放在偏上位置：上方留 40%，下方留 60%
        top = cy - side * 0.40
        left = cx - side / 2.0
        return left, top, side
    # 没检测到脸：取中心区域
    side = min(w, h) * 0.92
    return (w - side) / 2.0, (h - side) / 2.0, side


def crop_square(img, left, top, side):
    """按框裁剪正方形，越界部分用边缘像素补齐。"""
    h, w = img.shape[:2]
    side = int(round(side))
    l, t = int(round(left)), int(round(top))

    pad_l = max(0, -l)
    pad_t = max(0, -t)
    pad_r = max(0, l + side - w)
    pad_b = max(0, t + side - h)
    if pad_l or pad_t or pad_r or pad_b:
        img = cv2.copyMakeBorder(img, pad_t, pad_b, pad_l, pad_r,
                                 cv2.BORDER_REPLICATE)
        l += pad_l
        t += pad_t
    crop = img[t:t + side, l:l + side]
    if crop.size == 0:
        return None
    return cv2.resize(crop, (CARD_SIZE, CARD_SIZE), interpolation=cv2.INTER_AREA)


def main():
    os.makedirs(OUT, exist_ok=True)
    files = []
    for ext in ('*.jpg', '*.jpeg', '*.png', '*.webp', '*.bmp'):
        files += glob.glob(os.path.join(RAW, ext))
    files = sorted(set(f for f in files if '_预览' not in f))

    if not files:
        print(f'assets/raw/ 里没有照片。把照片放进去：{RAW}')
        return

    cards = []
    for i, f in enumerate(files, 1):
        img = imread_u(f)
        if img is None:
            print(f'  [跳过] 读不到：{f}')
            continue
        h, w = img.shape[:2]
        if max(h, w) > 1600:                  # 大图先缩，加速人脸检测
            s = 1600.0 / max(h, w)
            img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        left, top, side = square_around_face(img)
        card = crop_square(img, left, top, side)
        if card is None:
            print(f'  [跳过] 裁剪失败：{f}')
            continue
        name = f'card_{i}.png'
        imwrite_u(os.path.join(OUT, name), card)
        cards.append(name)
        print(f'  [{i}/{len(files)}] {os.path.basename(f)} -> {name}')

    with open(os.path.join(OUT, 'cards.json'), 'w', encoding='utf-8') as fp:
        json.dump({'count': len(cards), 'size': CARD_SIZE, 'cards': cards},
                  fp, ensure_ascii=False, indent=2)

    # 同时生成一个 JS 文件：file:// 协议下 fetch 会被拦截，用 <script> 加载最稳
    with open(os.path.join(OUT, 'cards.js'), 'w', encoding='utf-8') as fp:
        fp.write('window.CARDS = ' +
                 json.dumps(cards, ensure_ascii=False) +
                 ';\n')

    print(f'\n共生成 {len(cards)} 张牌面 -> {OUT}')

    # 拼贴预览
    if cards:
        cols = 4
        rows = (len(cards) + cols - 1) // cols
        cell = CARD_SIZE + 16
        canvas = np.full((cell * rows, cell * cols, 3), 30, np.uint8)
        for i, name in enumerate(cards):
            im = imread_u(os.path.join(OUT, name))
            if im is None:
                continue
            r, c = divmod(i, cols)
            y = r * cell + 8
            x = c * cell + 8
            canvas[y:y + CARD_SIZE, x:x + CARD_SIZE] = im
        prev = os.path.join(ROOT, 'tools', 'cards_preview.png')
        imwrite_u(prev, canvas)
        print(f'拼贴预览 -> {prev}   （打开看看每张牌脸有没有居中）')


if __name__ == '__main__':
    main()
