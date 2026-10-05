// 단일 튜닝 파일. 단위: m, s, kg. 임의 시작값.
export const TUNING = {
  world: { gravity: 20 }, // 점프감을 위해 9.8 보다 크게
  player: {
    mass: 70, moveSpeed: 6, jumpSpeed: 7, maxHp: 100,
    radius: 0.35, height: 1.8, eyeHeight: 1.6,
    groundAccel: 60,   // 지상: 목표속도로 수렴하는 가속도 (m/s^2)
    groundFriction: 12, // 지상 입력 없을 때 감속
    airAccel: 6,       // 공중 조작력. 낮을수록 반동으로 얻은 운동량이 보존됨
    mouseSensitivity: 0.0022,
    // 반동을 받으면 일정 시간 지면 마찰/입력 가속을 약화 → 지상에서도 반동 가속이 이어짐
    recoilSlideTime: 0.45, slideFrictionMul: 0.08,
    chargeSlowMul: 0.35, // 코일 충전 중 이동속도 배율
    fallSafeSpeed: 12, fallDamagePerSpeed: 6,
  },
  launcher: {
    projectileSpeed: 40,   // 사출 속도 (m/s)
    // 임펄스 J = m·v·recoil·recoilScale (N·s), Δv = J / 플레이어질량.
    // recoilScale 은 "게임 감각용 증폭" — 1.0 이면 현실 운동량 보존(체감 거의 없음). 조작감 튜닝 최우선 수치
    recoilScale: 7.5,
    fireInterval: 0.4,     // 연사 간격 (s)
    materialsPerShot: 1,   // 발당 소모 덩어리 수 (남용 방지 비용 ①)
    durabilityCostPerShot: 1, // 발당 베이스 내구도 소모 (남용 방지 비용 ②)
    wearPerRecoil: 0.004,  // 후방 슬롯 마모 = 반동 임펄스 * 이 값 * 부품 wearRate
    projectileGravity: 12, // 투사체 중력 (m/s^2) — 플레이어 중력보다 낮아 탄도가 완만
    projectileLife: 4,     // 투사체 수명 (s)
    damagePerJoule: 0.03,  // 물리 피해 = 0.5·m·v² · 이 값
    spread: { base: 0.01, perShot: 0.02, recover: 0.12, max: 0.25 }, // rad. 연사하면 퍼짐이 쌓임
    cameraKick: 0.018,     // 발사 시 시점 위로 튐 (rad)
    muzzleOffset: 0.6,     // 총구 위치 (눈에서 조준 방향으로 m)
  },
  coil: {
    chargeTime: 1.5, overchargeAt: 1.0,
    maxDamage: 60, arcRange: 25,
    spread: 0.03, leakDamageMul: 1, // 누전 피해 배율(부품이 줄임)
    chainRadius: 6, chainFalloff: 0.7, chainMaxHops: 8,
    insulatorDamageMul: 0.25,
    waterLeakDps: 15, // 물웅덩이 위 서 있을 때 누전
    wearOvercharge: 8, // 전방 슬롯 과충전 마모
  },
  mobs: { speed: 3, meleeDamage: 8, meleeRange: 1.6, meleeCooldown: 1, hp: 40, metalElectricMul: 2.0, insulatorPhysicalMul: 2.0 },
} as const;
