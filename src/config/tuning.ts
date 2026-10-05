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
    chargeSlowMul: 0.35, // 코일 충전 중 이동속도 배율
    fallSafeSpeed: 12, fallDamagePerSpeed: 6,
  },
  launcher: {
    projectileSpeed: 40, // 사출 속도 (m/s)
    recoilScale: 1.0,    // 임펄스 = 질량*속도*recoilScale. 체감 튜닝 최우선
    materialMassPerShot: 1, // 소모 재료 질량 (kg)
    durabilityCostPerShot: 1, // 남용 방지: 재료/내구도 비용
    wearPerRecoil: 0.02,  // 후방 슬롯 마모 = 반동 임펄스 * 이 값
    spread: { base: 0.01, perShot: 0.02, recover: 0.1 },
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
