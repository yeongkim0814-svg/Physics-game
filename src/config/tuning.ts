// 단일 튜닝 파일. 단위: m, s, kg. 임의 시작값.
export const TUNING = {
  world: { gravity: 20 }, // 점프감을 위해 9.8 보다 크게
  player: {
    mass: 70, moveSpeed: 6, sprintMul: 1.5, jumpSpeed: 7, maxHp: 100, // sprintMul: 전력질주 속도 배율(전진 입력일 때만)
    radius: 0.35, height: 1.8, eyeHeight: 1.6,
    groundAccel: 60,   // 지상: 목표속도로 수렴하는 가속도 (m/s^2)
    groundFriction: 12, // 지상 입력 없을 때 감속
    airAccel: 6,       // 공중 조작력. 낮을수록 반동으로 얻은 운동량이 보존됨
    mouseSensitivity: 0.0022,
    stepSmoothing: 10, // 계단 오를 때 카메라가 따라오는 속도 (클수록 빠름, 초당 지수 감쇠)
    stepHeight: 0.5, stepProbe: 0.3, // 계단 오르기: 한계 높이(m) / 단 모서리를 넘는지 보려고 앞으로 탐색하는 거리(m)
    // 반동을 받으면 일정 시간 지면 마찰/입력 가속을 약화 → 지상에서도 반동 가속이 이어짐
    recoilSlideTime: 0.45, slideFrictionMul: 0.08,
    chargeSlowMul: 0.35, // 코일 충전 중 이동속도 배율
    fallSafeSpeed: 12, fallDamagePerSpeed: 6,
  },
  /**
   * 던지는 돌 (M1a). 낙하 가속은 질량과 무관해야 하므로 공기저항(linearDamping)은 0.
   * 반지름은 충돌/표시 공용. 무거운 돌이 더 크다.
   */
  throwable: {
    stoneMass: 1, heavyMass: 8,        // kg (가벼운 돌 / 무거운 돌)
    stoneRadius: 0.12, heavyRadius: 0.2, // m
    throwSpeed: 14,                    // 시선 방향 초속 (m/s)
    inheritPlayerVelocity: 1,          // 플레이어 속도를 얼마나 물려받는가 (0~1)
    linearDamping: 0,                  // 공기저항 끔: 질량과 무관한 낙하
    angularDamping: 0.4,
    restitution: 0.15, friction: 0.8,
    cooldown: 0.35,                    // 던지기 간격 (s)
    maxActive: 12,                     // 동시 활성 돌 상한. 넘으면 가장 오래된 돌부터 치운다
    maxAge: 30,                        // 던진 뒤 이 시간이 지나면 치움 (s)
    settledLife: 8,                    // 착지 후 이 시간이 지나면 치움 (s)
    voidY: -40,                        // 이보다 아래로 떨어지면 치움 (협곡 바닥 -14 보다 충분히 아래)
    muzzleOffset: 0.6,                 // 눈에서 시선 방향으로 띄워 생성하는 거리 (m)
    contactTolerance: 0.02,            // 착지 판정: 접촉점 거리 허용치 (m)
  },
  launcher: {
    projectileSpeed: 40,   // 사출 속도 (m/s)
    // 임펄스 J = m·v·recoil·recoilScale (N·s), Δv = J / 플레이어질량.
    // recoilScale 은 "게임 감각용 증폭" — 1.0 이면 현실 운동량 보존(체감 거의 없음). 조작감 튜닝 최우선 수치
    recoilScale: 7.5,
    fireInterval: 0.4,     // 연사 간격 (s)
    projectileMass: 2,     // 투사체 질량 (kg). 탄약은 무제한, 연사 간격(fireInterval)이 유일한 제한
    projectileColor: 0x59603f,
    recoil: 1,             // 반동 배율 (절대 세기는 recoilScale)
    stability: 0,          // 퍼짐 안정성 (currentSpread 의 분모 보정)
    projectileGravity: 12, // 투사체 중력 (m/s^2) — 플레이어 중력보다 낮아 탄도가 완만
    projectileLife: 4,     // 투사체 수명 (s)
    damagePerJoule: 0.02,  // 물리 피해 = 0.5·m·v² · 이 값
    spread: { base: 0.01, perShot: 0.02, recover: 0.12, max: 0.25 }, // rad. 연사하면 퍼짐이 쌓임
    cameraKick: 0.018,     // 발사 시 시점 위로 튐 (rad)
    muzzleOffset: 0.6,     // 총구 위치 (눈에서 조준 방향으로 m)
  },
  coil: {
    chargeTime: 1.5,       // 충전 1.0(=최대 위력)까지 걸리는 시간 (s)
    minCharge: 0.15,       // 이보다 적게 충전하고 놓으면 불발
    overchargeAt: 1.0, overchargeMax: 1.5, // 이 이상 계속 쥐면 과충전(위력 ↑), 최대치에서 자동 방출
    maxDamage: 60, arcRange: 25, spread: 0.03,
    cooldown: 0.25,        // 방출 후 재충전까지 대기 (s)
    // 전도체 연쇄: 구조물/물/금속 몹끼리는 chainRadius, 플레이어·절연·일반 몹은 contactRadius 안이어야 닿는다
    chainRadius: 6, contactRadius: 2.5, snapRadius: 3, // snapRadius: 빔이 벽/바닥에 맞았을 때 근처 전도체로 이어붙이는 거리
    chainFalloff: 0.7, chainMaxHops: 8,
    insulatorDamageMul: 0.25, // 절연 몹 전기 피해 배율 (data/mobs.ts 가 사용)
    leakDamageMul: 1,      // 누전(자기 피해) 배율
    waterLeakDps: 15,      // 물웅덩이 위에서 충전 중일 때 초당 누전 피해 (충전량에 비례)
  },
  mobs: {
    radius: 0.4, height: 1.6,
    hitRadius: 0.8,        // 투사체/빔 판정 구 반경 (몸통 중심). 캡슐 반경보다 커야 투사체가 먼저 맞는다
    aggroRange: 28, loseRange: 50, // 추적 시작/포기 거리
    stopDistance: 1.3,     // 이 거리 안에서는 더 다가가지 않음
    meleeReach: 1.7,       // 근접 공격 사거리 (중심 간 수평 거리)
    windup: 0.35, meleeCooldown: 1.0, // 예고 동작 시간(이 동안 벗어나면 헛스윙) / 공격 후 쿨다운
    separation: 1.2, turnSpeed: 10,
    // 종류별 능력치: 금속은 튼튼하고 느림, 절연은 빠르고 약함
    kinds: {
      metal:     { hp: 60, speed: 2.6, damage: 10 },
      insulator: { hp: 40, speed: 3.6, damage: 8 },
      normal:    { hp: 50, speed: 3.0, damage: 9 },
    },
    metalElectricMul: 2.0, insulatorPhysicalMul: 2.0, // 약점 배율
  },
} as const;
