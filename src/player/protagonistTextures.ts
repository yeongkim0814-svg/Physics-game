import type * as THREE from 'three';
import { pixelTexture } from '../render/textures';
import { PCOL, type TexId } from '../data/protagonist';

/**
 * 주인공 얼굴·옷의 작은 절차 텍스처 (nearest 확대). 면 크기에 비례: 얼굴 32×32 ≈ 1px/cm, 가슴·골반 32×16.
 * 안경: 가는 테 + 렌즈 안쪽 약간 밝게 + 대각 흰 반사선 1개씩. 표정: 눈 두 점, 눈썹 선, 코 그늘, 평평한 입.
 */
const C = PCOL;

function face(): THREE.Texture {
  return pixelTexture('pro_face', 32, 32, (put) => {
    put(0, 0, 32, 32, C.skin);
    // 머리선 / 옆머리
    put(0, 0, 32, 4, C.ink);
    put(0, 4, 3, 8, C.ink); put(29, 4, 3, 8, C.ink);
    put(3, 4, 4, 1, C.ink); put(25, 4, 4, 1, C.ink);
    // 눈썹 (평온·집중: 거의 수평, 바깥쪽이 아주 살짝 낮음)
    put(6, 10, 7, 1, C.ink); put(19, 10, 7, 1, C.ink);
    // 안경: 렌즈 안쪽 → 테 (모서리를 비워 둥글게) → 코받침 다리
    for (const x0 of [4, 18]) {
      put(x0 + 1, 13, 8, 6, C.lens);
      put(x0 + 1, 12, 8, 1, C.ink); put(x0 + 1, 19, 8, 1, C.ink);
      put(x0, 13, 1, 6, C.ink); put(x0 + 9, 13, 1, 6, C.ink);
    }
    put(14, 14, 4, 1, C.ink);
    // 눈 (렌즈 안 2×2 점)
    put(8, 15, 2, 2, C.ink); put(22, 15, 2, 2, C.ink);
    // 렌즈 반사선 (흰색 대각 3px)
    for (const x0 of [4, 18]) { put(x0 + 8, 13, 1, 1, C.glint); put(x0 + 7, 14, 1, 1, C.glint); put(x0 + 6, 15, 1, 1, C.glint); }
    // 코 그늘, 입 (평평 = 평온)
    put(15, 20, 2, 3, C.skinShade, 0.7);
    put(13, 26, 6, 1, C.skinShade);
  });
}

function shirtFront(): THREE.Texture {
  return pixelTexture('pro_shirtFront', 32, 16, (put) => {
    put(0, 0, 32, 16, C.shirt);
    put(15, 3, 2, 13, C.shirtLine, 0.55);                         // 앞섶
    for (const y of [5, 8, 11, 14]) put(15, y, 2, 1, C.shirtLine); // 단추
    // 칼라 V: 목 양옆에서 가슴 위로
    for (let i = 0; i < 4; i++) { put(11 + i, i, 1, 1, C.shirtLine); put(20 - i, i, 1, 1, C.shirtLine); }
    // 왼쪽 가슴 주머니 (보는 쪽 오른쪽)
    put(21, 6, 5, 1, C.shirtLine); put(21, 6, 1, 5, C.shirtLine); put(25, 6, 1, 5, C.shirtLine); put(21, 10, 5, 1, C.shirtLine);
  });
}

function shirtBack(): THREE.Texture {
  return pixelTexture('pro_shirtBack', 32, 16, (put) => {
    put(0, 0, 32, 16, C.shirt);
    put(0, 4, 32, 1, C.shirtLine, 0.6);       // 요크 이음
    put(15, 5, 2, 11, C.shirtLine, 0.3);      // 등 주름
    for (let i = 0; i < 4; i++) { put(11 + i, 3 - i, 1, 1, C.shirtLine); put(20 - i, 3 - i, 1, 1, C.shirtLine); } // 뒷칼라
  });
}

function pelvisFront(): THREE.Texture {
  return pixelTexture('pro_pelvisFront', 32, 16, (put) => {
    put(0, 0, 32, 16, C.slacks);
    put(15, 4, 1, 6, C.slacksLine, 0.8);                        // 지퍼 선
    // 옆 주머니 사선 (양쪽 대칭)
    for (let i = 0; i < 7; i++) { put(3 + i, 3 + i, 1, 1, C.slacksLine); put(28 - i, 3 + i, 1, 1, C.slacksLine); }
  });
}

function pelvisBack(): THREE.Texture {
  return pixelTexture('pro_pelvisBack', 32, 16, (put) => {
    put(0, 0, 32, 16, C.slacks);
    for (const x0 of [4, 19]) { // 뒷주머니 두 개 (테두리 + 단추)
      put(x0, 4, 9, 1, C.slacksLine); put(x0, 4, 1, 8, C.slacksLine); put(x0 + 8, 4, 1, 8, C.slacksLine); put(x0, 11, 9, 1, C.slacksLine);
      put(x0 + 4, 6, 1, 1, C.skinShade);
    }
  });
}

const MAKERS: Record<TexId, () => THREE.Texture> = { face, shirtFront, shirtBack, pelvisFront, pelvisBack };
export const protagonistTexture = (id: TexId): THREE.Texture => MAKERS[id]();
