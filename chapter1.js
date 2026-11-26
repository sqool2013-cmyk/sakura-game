/**
 * ============================================================================
 * 카드캡터 3부작 — 제1부 고유 컨트롤러 (chapter1.js) — v.0.1.4
 * - 통합 단일 스토리 앱(index.html)과 연동되는 제1부(크로우 카드 편) 모듈
 * - 초등학교 교복 시작 -> 플라이 봉인 직후 토모요(지수) 정식 합류 & 첫 배틀 의상 선물
 * - 제1부 4막(Act) 단계 개방형 스토리:
 *     1막(플라이) -> 2막(마을·집·학교 6장) -> 3막(샤오랑 합류·호수/신사 8장)
 *     -> 4막(학예회 강당 다크·라이트 -> 최후의 원소 어시 -> 시계탑 유에 심판)
 * - 토모요 합류 전 안전망: 집 1층 거실 식탁에서 무료 HP·MP 완전 회복 지원
 * - 샤오랑 친밀도 이중 가산 버그 수정 & 제1부 상한(최대 5) 보정
 * - 4종 마법 피니시(수렴 마법진 · 최종 보스 X연타 마력 충돌) & 연속 성장 곡선 연동
 * - 유에 격파 시 제2부(별빛의 토모에다) 막간 시네마틱으로 자연 직결
 * ============================================================================
 */

export function createChapter(host, DATA) {
  const { engines, world, vn, battle, keys } = host;
  const { Timers, Utils, Locale, Art, SoundFX, Rules } = engines;
  const { $, toArr, clamp, cardName, cardRuby } = Utils;

  // --------------------------------------------------------------------------
  // 1. 제1부 데이터 바인딩 & 의상·4막 규칙 정규화
  // --------------------------------------------------------------------------
  const CARDS = DATA.cards || {};
  const CARD_ORDER = toArr(DATA.cardOrder);
  const MAPS = DATA.maps || {};
  const ZONES = toArr(DATA.zones);
  const NPCS = toArr(DATA.npcs);
  const BOSS_YUE = DATA.bossYue;
  const QUICK_SLOTS = toArr(DATA.fieldQuickSlots);

  const COSTUME_ICONS = {
    school_uniform: '🎒',
    sakura_dress: '🌸',
    frog_rain: '🐸',
    cat_thunder: '🐱',
    sky_wing: '🪽',
    alice_maid: '🎀',
    pierrot_magic: '🃏',
    star_royal: '👑',
    pure_angel: '🕊'
  };

  const ACTS = Rules?.PART1_ACTS || {
    act1: ['fly'],
    act2: ['wood', 'jump', 'shield', 'flower', 'illusion', 'shadow'],
    act3: ['watery', 'thunder', 'mirror', 'sword', 'maze', 'erase', 'glow', 'firey'],
    act4Pair: ['dark', 'light'],
    act4Final: ['earthy']
  };

  const FALLBACK_COSTUMES = [
    {
      id: 'sakura_dress',
      name: '🌸 벚꽃 배틀 드레스',
      icon: '🌸',
      unlockType: 'card',
      unlockCard: 'fly',
      unlockHint: '플라이 봉인 후 토모요 합류 시 선물',
      dressColor: '#f472b6',
      accentColor: '#fff1f2',
      hatType: 'beret',
      hatColor: '#f43f5e',
      passive: '최대 MP +5',
      tomoyoQuote: '사쿠라의 첫 비행을 기념해 정성껏 지은 분홍빛 첫 배틀 의상이에요!'
    }
  ];

  const uniformDef = Rules?.SCHOOL_UNIFORM || {
    id: 'school_uniform',
    name: '🎒 초등학교 교복',
    icon: '🎒',
    unlockType: 'default',
    unlockHint: '기본 복장',
    dressColor: '#1e293b',
    accentColor: '#ffffff',
    hatType: 'uniform',
    hatColor: '#1e293b',
    passive: '단정한 평상복 (마법 보정 없음)',
    tomoyoQuote: '평소 입는 교복도 정말 귀엽지만, 카드 봉인 때는 역시 제가 정성껏 지어 드린 배틀 의상이 최고랍니다!'
  };

  const dataCostumes = toArr(DATA.costumes);
  const defaultP1 = toArr(Rules?.DEFAULT_COSTUMES_P1);
  const rawCostumes = dataCostumes.length >= 8
    ? dataCostumes
    : (defaultP1.length ? defaultP1 : (dataCostumes.length ? dataCostumes : FALLBACK_COSTUMES));

  // 교복을 기본 복장으로 최상단 배치하고, 벚꽃 배틀 드레스는 플라이 봉인 후 토모요 합류 보상으로 정규화
  const normalizedCostumes = rawCostumes.map((cos) => (
    cos.id === 'sakura_dress'
      ? { ...cos, unlockType: 'card', unlockCard: 'fly', unlockHint: '플라이 봉인 후 토모요 합류 시 선물' }
      : cos
  ));
  const COSTUMES = normalizedCostumes.some((c) => c.id === 'school_uniform')
    ? normalizedCostumes
    : [uniformDef, ...normalizedCostumes];

  const MAP_GROUPS = {
    house: ['house', 'house_f1', 'house_b1', 'house_f2'],
    house_f1: ['house_f1', 'house_b1', 'house_f2'],
    school: ['school', 'school_f1', 'school_f2', 'school_hall'],
    school_f1: ['school_f1', 'school_f2', 'school_hall'],
    shrine: ['shrine', 'shrine_gate', 'shrine_main', 'shrine_cave'],
    shrine_gate: ['shrine_gate', 'shrine_main', 'shrine_cave']
  };

  // --------------------------------------------------------------------------
  // 2. 제1부 상태 변수
  // --------------------------------------------------------------------------
  let mode = 'explore'; // explore | dialogue | battle | ending
  let ownedCards = new Set(['windy']);
  let yueDefeated = false;
  let shownActs = new Set();
  let currentMapId = 'town';
  let portalCd = 0;
  let encCd = 0;
  let nearbyTarget = null;
  let pendingTarget = null;
  let lastHudSig = '';
  let inPrologue = false;
  let memoryMode = { active: false, cardId: null, snapshot: null };

  const story = {
    metSyaoran: false,
    syaoranTrust: 0,
    seenEncounters: new Set(),
    sealedOrder: [],
    costumeId: 'school_uniform',
    unlockedCostumes: new Set(['school_uniform']),
    tomoyoFollowing: false
  };

  const tomoyoPos = { x: 455, y: 485 };

  const player = {
    x: 385,
    y: 465,
    dir: 'down',
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    lv: 1,
    mult: 1.0,
    walk: 0,
    targetPos: null
  };

  const kero = { x: 355, y: 445, bob: 0 };

  const buffs = {
    fly: 0,
    flyLand: false,
    light: 0,
    glow: 0,
    glowCd: 0,
    glowAcc: 0,
    wind: 0,
    shield: false,
    snackBuff: false,
    cocoaBuff: false
  };

  const anomaly = {
    jumpX: CARDS.jump?.x || 365,
    jumpY: CARDS.jump?.y || 830,
    jumpHop: 0,
    jumpBind: 0,
    glowX: CARDS.glow?.x || 790,
    glowY: CARDS.glow?.y || 530,
    mirrorTrail: [],
    // 학교 1층 도서실(illusion 위치 225, 225 주변) 가짜 환영 분신
    illusionDecoys: [
      { x: 145, y: 205, name: '토모요?', hair: '#3b0764', dress: '#c084fc', popped: false },
      { x: 315, y: 215, name: '케로?', hair: '#facc15', dress: '#fde047', popped: false }
    ]
  };

  // --------------------------------------------------------------------------
  // 3. 핵심 헬퍼 · 4막 단계 개방 · 토모요 촬영 동행 AI · 성장 곡선
  // --------------------------------------------------------------------------
  const getMap = () => MAPS[currentMapId] || MAPS.town;

  /**
   * 제1부 4막(Act) 현재 진행 단계 계산
   * 1: 플라이 고정 / 2: 마을·집·학교 6장 / 3: 샤오랑 합류 & 분수대·신사 8장
   * 4: 학예회 강당 다크·라이트 / 4.5: 최후의 원소 어시 / 5: 달의 심판자 유에
   */
  function getCurrentStoryAct() {
    if (!ownedCards.has('fly')) return 1;
    if (!ACTS.act2.every((id) => ownedCards.has(id))) return 2;
    if (!ACTS.act3.every((id) => ownedCards.has(id))) return 3;
    if (!ACTS.act4Pair.every((id) => ownedCards.has(id))) return 4;
    if (!ACTS.act4Final.every((id) => ownedCards.has(id))) return 4.5;
    return 5;
  }

  function isCardUnlockedByAct(id) {
    if (memoryMode.active) return memoryMode.cardId === id;
    if (id === 'windy' || ownedCards.has(id)) return false;
    const act = getCurrentStoryAct();
    if (ACTS.act1.includes(id)) return true;
    if (ACTS.act2.includes(id)) return act >= 2;
    if (ACTS.act3.includes(id)) return act >= 3;
    if (ACTS.act4Pair.includes(id)) return act >= 4;
    if (ACTS.act4Final.includes(id)) return act >= 4.5;
    return false;
  }

  const isCardActiveOnMap = (id) => isCardUnlockedByAct(id);
  const getUnsealed = () => CARD_ORDER.filter(isCardActiveOnMap).map((id) => CARDS[id]);
  const getCardPos = (c) => (
    c.id === 'jump'
      ? { x: anomaly.jumpX, y: anomaly.jumpY }
      : c.id === 'glow'
      ? { x: anomaly.glowX, y: anomaly.glowY }
      : { x: c.x, y: c.y }
  );

  function countUnsealedInMap(mid) {
    if (currentMapId === 'town' && MAP_GROUPS[mid]) {
      const grp = MAP_GROUPS[mid];
      return CARD_ORDER.filter((id) => isCardActiveOnMap(id) && grp.includes(CARDS[id]?.map)).length;
    }
    return CARD_ORDER.filter((id) => isCardActiveOnMap(id) && CARDS[id]?.map === mid).length;
  }

  /** 토모요(지수) 촬영 동행 활성화 여부 (플라이 봉인 후 정식 합류 이후 전 맵 동행) */
  const isTomoyoFollowing = () => !!(story.tomoyoFollowing && ownedCards.has('fly') && !inPrologue);

  /** 동행 중인 토모요의 실시간 좌표 반환 */
  function getNpcPos(n) {
    if (n.id === 'tomoyo' && isTomoyoFollowing()) {
      return { x: tomoyoPos.x, y: tomoyoPos.y };
    }
    return { x: n.x, y: n.y };
  }

  /** 맵 진입·합류 직후 토모요를 사쿠라 뒤쪽 촬영 위치에 자연스럽게 배치 */
  function placeTomoyoNearPlayer() {
    const cur = getMap();
    const ox = player.dir === 'right' ? -64 : 64;
    const oy = player.dir === 'down' ? -46 : 46;
    tomoyoPos.x = clamp(player.x + ox, 44, (cur?.w || 800) - 44);
    tomoyoPos.y = clamp(player.y + oy, 44, (cur?.h || 600) - 44);
  }

  /** 토모요 촬영 동행 AI: 일정 거리(약 64~78px)를 유지하며 모든 실내·야외 맵 동행 */
  function updateTomoyoFollow(dt) {
    if (!isTomoyoFollowing()) return;
    const desiredX = player.x + (player.dir === 'right' ? -68 : player.dir === 'left' ? 68 : -54);
    const desiredY = player.y + (player.dir === 'down' ? -48 : player.dir === 'up' ? 54 : -34);
    const distToPlayer = Math.hypot(player.x - tomoyoPos.x, player.y - tomoyoPos.y);
    const dx = desiredX - tomoyoPos.x;
    const dy = desiredY - tomoyoPos.y;
    const distToSpot = Math.hypot(dx, dy);
    const cur = getMap();

    if (distToPlayer > 76 && distToSpot > 6) {
      const spd = Math.min(getMoveSpeed() * 0.94, Math.max(125, distToSpot * 3.4));
      tomoyoPos.x = clamp(tomoyoPos.x + (dx / distToSpot) * spd * dt, 36, (cur?.w || 800) - 36);
      tomoyoPos.y = clamp(tomoyoPos.y + (dy / distToSpot) * spd * dt, 36, (cur?.h || 600) - 36);
    } else if (distToPlayer < 46 && distToPlayer > 1) {
      const push = 42 * dt;
      tomoyoPos.x = clamp(tomoyoPos.x - ((player.x - tomoyoPos.x) / distToPlayer) * push, 36, (cur?.w || 800) - 36);
      tomoyoPos.y = clamp(tomoyoPos.y - ((player.y - tomoyoPos.y) / distToPlayer) * push, 36, (cur?.h || 600) - 36);
    }
  }

  /**
   * 원작 고증 가시성 규칙:
   * - 토모요: 플라이 봉인 직후 정식 합류 시점부터 등장 & 전 맵 동행
   * - 샤오랑: 제3막(홍콩 전학) 개방 시점부터 등장
   * - 유키토: 시계탑에 유에가 강림한 동안 동일체 고증으로 숨김
   */
  function isNpcVisible(n) {
    if (n.id === 'tomoyo') {
      return isTomoyoFollowing();
    }
    if (n.map !== currentMapId) return false;
    if (n.id === 'syaoran' && getCurrentStoryAct() < 3) return false;
    const yueSummoned = ownedCards.size === CARD_ORDER.length && !yueDefeated && !memoryMode.active;
    if (n.id === 'yukito' && yueSummoned) return false;
    return true;
  }

  const getCostumeObj = () => COSTUMES.find((c) => c.id === story.costumeId) || COSTUMES[0];
  const getCostumeIcon = (cos) => cos?.icon || COSTUME_ICONS[cos?.id] || '🌸';

  function recalcPower(healBonus = false) {
    const prevMaxHp = player.maxHp;
    const prevMaxMp = player.maxMp;
    const stats = Rules.calcStats({
      part: 1,
      progressCount: Math.max(0, ownedCards.size - 1),
      total: CARD_ORDER.length || 19,
      costumeId: story.costumeId,
      progCfg: DATA?.progression
    });
    player.lv = stats.lv;
    player.maxHp = stats.maxHp;
    player.maxMp = stats.maxMp;
    player.mult = stats.mult;
    if (healBonus) {
      if (player.maxHp > prevMaxHp) player.hp += (player.maxHp - prevMaxHp);
      if (player.maxMp > prevMaxMp) player.mp += (player.maxMp - prevMaxMp);
    }
    player.hp = clamp(player.hp, 1, player.maxHp);
    player.mp = clamp(player.mp, 0, player.maxMp);
  }

  function getMoveSpeed() {
    let s = 215 + (ownedCards.has('fly') ? 28 : 0) + (ownedCards.has('jump') ? 20 : 0);
    s *= Rules.getCostumeBonuses(story.costumeId).speedMult || 1;
    if (buffs.fly > 0 || buffs.flyLand) s *= 1.55;
    return s;
  }

  function resetAnomalyState() {
    anomaly.jumpX = CARDS.jump?.x || 365;
    anomaly.jumpY = CARDS.jump?.y || 830;
    anomaly.jumpHop = 0;
    anomaly.jumpBind = 0;
    anomaly.glowX = CARDS.glow?.x || 790;
    anomaly.glowY = CARDS.glow?.y || 530;
    anomaly.mirrorTrail = [];
    anomaly.illusionDecoys.forEach((d) => { d.popped = false; });
  }

  function getZoneName() {
    if (currentMapId !== 'town') return getMap()?.name || '황혼의 토모에다';
    for (const z of ZONES) {
      if (player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h) {
        return z.name;
      }
    }
    return '황혼의 토모에다';
  }

  function findPortalToward(targetMap) {
    const portals = toArr(getMap()?.portals);
    return portals.find((p) => p.targetMap === targetMap)
      || portals.find((p) => MAP_GROUPS[p.targetMap]?.includes(targetMap))
      || portals.find((p) => p.targetMap === 'town')
      || portals[0];
  }

  function getNextObjective() {
    const rem = getUnsealed();
    if (rem.length > 0) {
      const here = rem.filter((c) => c.map === currentMapId);
      if (here.length > 0) {
        let best = here[0];
        let bestD = Infinity;
        for (const c of here) {
          const p = getCardPos(c);
          const d = Math.hypot(p.x - player.x, p.y - player.y);
          if (d < bestD) { bestD = d; best = { ...c, x: p.x, y: p.y }; }
        }
        return best;
      }
      const tc = rem[0];
      const pt = findPortalToward(tc.map);
      return pt ? { isPortal: true, x: pt.x, y: pt.y, zone: tc.zone, targetCard: tc } : tc;
    }
    if (!yueDefeated && !memoryMode.active && BOSS_YUE) {
      if (currentMapId !== 'town') {
        const pt = findPortalToward('town');
        return pt ? { isPortal: true, isBoss: true, x: pt.x, y: pt.y, zone: BOSS_YUE.zone, targetCard: BOSS_YUE } : BOSS_YUE;
      }
      return BOSS_YUE;
    }
    return null;
  }

  function showChapterOnce(sub, title) {
    if (shownActs.has(sub)) return;
    shownActs.add(sub);
    host.showChapterBanner(sub, title);
  }

  // --------------------------------------------------------------------------
  // 4. 멀티 세이브 슬롯 페이로드 · 공유 상태 계승 · 자동 저장
  // --------------------------------------------------------------------------
  function getUnlockedCostumeList() {
    const unlocked = new Set(story.unlockedCostumes);
    COSTUMES.forEach((cos) => {
      if (Rules.isCostumeUnlocked(cos, { ownedCards, bossCleared: yueDefeated, unlockedCostumes: unlocked })) {
        unlocked.add(cos.id);
      }
    });
    return Array.from(unlocked);
  }

  function getSharedState() {
    const carryCostume = story.costumeId === 'school_uniform' ? 'sakura_dress' : story.costumeId;
    return {
      costumeId: carryCostume,
      unlockedCostumes: getUnlockedCostumeList().filter((id) => id !== 'school_uniform'),
      syaoranTrust: Rules.clampTrust(story.syaoranTrust, 1),
      part1Cleared: yueDefeated,
      firstSealedCard: story.sealedOrder[0] || '',
      lastSealedCard: story.sealedOrder[story.sealedOrder.length - 1] || '',
      hadMirror: ownedCards.has('mirror') || yueDefeated
    };
  }

  function getSlotMeta() {
    return {
      zoneName: getZoneName(),
      summary: yueDefeated
        ? `유에 심판 돌파 · 봉인 ${ownedCards.size}/${CARD_ORDER.length} · Lv.${player.lv}`
        : `봉인 ${ownedCards.size}/${CARD_ORDER.length} · 마력 Lv.${player.lv}`
    };
  }

  function getSavePayload() {
    const s = memoryMode.active && memoryMode.snapshot ? memoryMode.snapshot : null;
    return {
      version: 5,
      part: 1,
      yueDefeated: s ? s.yueDefeated : yueDefeated,
      currentMapId: s ? s.currentMapId : currentMapId,
      ownedCards: Array.from(s ? s.ownedCards : ownedCards),
      shownActs: Array.from(shownActs),
      story: {
        metSyaoran: story.metSyaoran,
        syaoranTrust: Rules.clampTrust(story.syaoranTrust, 1),
        seenEncounters: Array.from(story.seenEncounters),
        sealedOrder: story.sealedOrder.slice(),
        costumeId: story.costumeId,
        unlockedCostumes: getUnlockedCostumeList(),
        tomoyoFollowing: story.tomoyoFollowing
      },
      player: {
        x: Math.round(s ? s.px : player.x),
        y: Math.round(s ? s.py : player.y),
        hp: Math.ceil(player.hp),
        mp: Math.ceil(player.mp)
      },
      shield: !!buffs.shield
    };
  }

  function autoSave(reason = '') {
    if (memoryMode.active) return;
    host.autoSave(reason);
  }

  function applySavePayload(saved, shared = null) {
    Timers.clearAll();
    vn.finish(true);
    battle.forceClose();
    memoryMode = { active: false, cardId: null, snapshot: null };
    inPrologue = false;
    $('memoryBanner')?.classList.add('hidden');
    $('endingBox')?.classList.add('hidden');

    ownedCards = new Set(toArr(saved.ownedCards).length ? toArr(saved.ownedCards) : ['windy']);
    yueDefeated = !!saved.yueDefeated;
    shownActs = new Set(toArr(saved.shownActs));

    const st = saved.story || saved.storyState || {};
    story.metSyaoran = !!st.metSyaoran;
    story.syaoranTrust = Rules.clampTrust(Number(st.syaoranTrust) || 0, 1);
    story.seenEncounters = new Set(toArr(st.seenEncounters));
    story.sealedOrder = toArr(st.sealedOrder);

    const hasFly = ownedCards.has('fly');
    story.costumeId = st.costumeId || shared?.costumeId || (hasFly ? 'sakura_dress' : 'school_uniform');
    story.unlockedCostumes = new Set([
      'school_uniform',
      ...(hasFly ? ['sakura_dress'] : []),
      ...toArr(st.unlockedCostumes),
      ...toArr(shared?.unlockedCostumes)
    ]);

    currentMapId = MAPS[saved.currentMapId] ? saved.currentMapId : 'town';
    story.tomoyoFollowing = hasFly && (typeof st.tomoyoFollowing === 'boolean' ? st.tomoyoFollowing : true);

    recalcPower(false);
    const p = saved.player || {};
    const cur = getMap();
    player.x = clamp(Number(p.x) || 385, 40, cur.w - 40);
    player.y = clamp(Number(p.y) || 465, 40, cur.h - 40);
    player.hp = clamp(Number(p.hp) || player.maxHp, 1, player.maxHp);
    player.mp = clamp(Number(p.mp) || player.maxMp, 0, player.maxMp);
    player.targetPos = null;
    pendingTarget = null;
    kero.x = player.x - 28;
    kero.y = player.y - 20;
    if (isTomoyoFollowing()) placeTomoyoNearPlayer();

    Object.assign(buffs, {
      fly: 0, flyLand: false, light: 0, glow: 0, glowCd: 0, glowAcc: 0,
      wind: 0, shield: !!saved.shield, snackBuff: false, cocoaBuff: false
    });
    resetAnomalyState();

    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
  }

  // --------------------------------------------------------------------------
  // 5. HUD & 필드 마법 퀵바
  // --------------------------------------------------------------------------
  function updateHUD(force = false) {
    const zn = getZoneName();
    const curCos = getCostumeObj();
    const sig = `${Locale.getMode()}|${player.lv}|${Math.ceil(player.hp)}|${player.maxHp}|${Math.ceil(player.mp)}|${player.maxMp}|${ownedCards.size}|${story.syaoranTrust}|${curCos.id}|${zn}|${yueDefeated}|${memoryMode.active}`;
    if (!force && sig === lastHudSig) return;
    lastHudSig = sig;

    if ($('hudCostumeBadge')) $('hudCostumeBadge').textContent = getCostumeIcon(curCos);
    if ($('hudMagicLv')) $('hudMagicLv').textContent = `마력 Lv.${player.lv}`;
    if ($('hudTrustBadge')) $('hudTrustBadge').textContent = `⚡친밀 ${story.syaoranTrust}/5`;
    if ($('hudHpBar')) $('hudHpBar').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    if ($('hudMpBar')) $('hudMpBar').style.width = `${Math.max(0, (player.mp / player.maxMp) * 100)}%`;
    if ($('hudHpNum')) $('hudHpNum').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    if ($('hudMpNum')) $('hudMpNum').textContent = `${Math.ceil(player.mp)}/${player.maxMp}`;
    if ($('hudCardCount')) $('hudCardCount').textContent = `${ownedCards.size}/${CARD_ORDER.length}`;
    if ($('hudZone')) $('hudZone').textContent = Locale.t(zn);

    const rem = getUnsealed().length;
    const act = getCurrentStoryAct();
    if (memoryMode.active) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'MEMORY REPLAY';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${cardName(CARDS[memoryMode.cardId])}]의 그날의 이상 현상을 다시 체험 중`);
    } else if (act === 1) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'ACT I · 첫 번째 날개';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t('초등학교 앞마당에서 날뛰는 [플라이] 카드를 봉인하라');
    } else if (act === 2) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'ACT II · 황혼의 마을과 학교';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`마을·집·학교의 이상 현상을 조사하라 (제2막 남은 기운 ${rem}곳)`);
    } else if (act === 3) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'ACT III · 전학생과 신사의 시련';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`분수대와 츠키미네 신사의 카드를 봉인하라 (제3막 남은 기운 ${rem}곳)`);
    } else if (act === 4) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'ACT IV · 빛과 어둠의 무대';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`초등학교 학예회 강당에서 [다크]와 [라이트]를 봉인하라 (남은 기운 ${rem}곳)`);
    } else if (act === 4.5) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'ACT IV · 최후의 원소';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t('펭귄 공원 남쪽 언덕에서 마지막 카드 [어시]를 봉인하라');
    } else if (!yueDefeated && BOSS_YUE) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART I · FINAL ACT · JUDGMENT';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${BOSS_YUE.zone}]에서 달의 심판자 유에에게 맞서라`);
    } else {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART I · EPILOGUE';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t('모든 크로우 카드를 봉인하고 새로운 주인으로 인정받았다');
    }
  }

  function updateFieldBar() {
    const bar = $('fieldMagicBar');
    const slots = $('fieldMagicSlots');
    if (!bar || !slots) return;
    if (mode !== 'explore') {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    slots.innerHTML = '';

    for (const s of QUICK_SLOTS) {
      const unlocked = ownedCards.has(s.id);
      const onCd = s.id === 'glow' && buffs.glowCd > 0 && buffs.glow <= 0;
      const active = (s.id === 'fly' && (buffs.fly > 0 || buffs.flyLand))
        || (s.id === 'light' && buffs.light > 0)
        || (s.id === 'glow' && buffs.glow > 0)
        || (s.id === 'windy' && buffs.wind > 0)
        || (s.id === 'shield' && buffs.shield);

      const btn = document.createElement('button');
      btn.disabled = !unlocked || onCd;
      btn.title = unlocked ? (onCd ? `대기 중 (${Math.ceil(buffs.glowCd)}s)` : `${Locale.t(s.desc)} (MP ${s.mp})`) : '미봉인 카드';
      btn.className = `shrink-0 px-2 py-1 rounded-xl border text-[11px] font-story flex items-center gap-1 transition ${
        !unlocked || onCd
          ? 'bg-black/40 border-white/10 text-slate-500'
          : active
          ? 'bg-pink-500/40 border-yellow-300 text-yellow-100 shadow-[0_0_10px_rgba(250,204,21,0.45)]'
          : 'bg-purple-950/80 hover:bg-purple-800/80 border-yellow-400/45 text-pink-100'
      }`;
      btn.innerHTML = `<span class="text-[9px] font-mono text-yellow-300/90">[${s.key}]</span><span>${s.icon}</span><span class="font-bold">${s.label}${onCd ? ` ${Math.ceil(buffs.glowCd)}s` : ''}</span>`;
      if (unlocked && !onCd) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.currentTarget.blur();
          castFieldCard(s.key);
        });
      }
      slots.appendChild(btn);
    }
  }

  function castFieldCard(k) {
    if (mode !== 'explore') return;
    const s = QUICK_SLOTS.find((x) => x.key === k);
    if (!s || !ownedCards.has(s.id)) return host.showToast('아직 봉인하지 못한 카드입니다.');
    if (s.id === 'glow' && buffs.glowCd > 0) return host.showToast(`글로우 준비 중 (${Math.ceil(buffs.glowCd)}초 남음)`);
    if (player.mp < s.mp) return host.showToast(`MP가 부족합니다! (필요 MP ${s.mp})`);

    if (s.id === 'fly') {
      player.mp -= s.mp;
      buffs.fly = 12;
      buffs.flyLand = false;
      SoundFX.magic();
      world.burst(player.x, player.y, '#fef08a', 22);
      host.showToast('플라이 해방! 12초간 건물·호수·미궁 벽 위를 자유롭게 비행합니다!');
    } else if (s.id === 'light') {
      player.mp -= s.mp;
      buffs.light = 16;
      SoundFX.heal();
      world.burst(player.x, player.y, '#fef08a', 24);
      if (isCardActiveOnMap('illusion') && CARDS.illusion?.map === currentMapId) {
        anomaly.illusionDecoys.forEach((d) => { d.popped = true; });
      }
      const next = getNextObjective();
      if (next) world.guideBeam(player.x, player.y, next.x, next.y, '#fef08a');
      host.showToast('라이트 해방! 어둠과 가짜 환영을 걷어내고 목표 방향을 비춥니다!');
    } else if (s.id === 'glow') {
      if (player.mp >= player.maxMp) return host.showToast('MP가 이미 가득 차 있습니다!');
      buffs.glow = 7;
      buffs.glowCd = 18;
      buffs.glowAcc = 0;
      SoundFX.heal();
      world.burst(player.x, player.y, '#bef264', 24);
      host.showToast('글로우 해방! 7초간 반딧불이가 MP를 서서히 회복합니다!');
    } else if (s.id === 'flower') {
      if (player.hp >= player.maxHp) return host.showToast('체력이 이미 가득 차 있습니다!');
      player.mp -= s.mp;
      const rec = Math.min(player.maxHp - player.hp, 42);
      player.hp += rec;
      SoundFX.heal();
      world.burst(player.x, player.y, '#f9a8d4', 24);
      host.showToast(`플라워 해방! 꽃비가 내려 HP를 ${rec} 회복했습니다!`);
    } else if (s.id === 'windy') {
      player.mp -= s.mp;
      buffs.wind = 11;
      SoundFX.magic();
      world.burst(player.x, player.y, '#38bdf8', 22);
      if (currentMapId === 'town' && isCardActiveOnMap('jump') && Math.hypot(player.x - anomaly.jumpX, player.y - anomaly.jumpY) < 260) {
        anomaly.jumpBind = 5.5;
        host.showToast('윈디 해방! 도망치던 점프 현상을 5초간 포박했습니다!');
      } else {
        host.showToast('윈디 해방! 덩굴·물결 방해 무효화 & 다음 전투 선제 충격!');
      }
    } else if (s.id === 'shield') {
      if (buffs.shield) return host.showToast('이미 황금 결계가 펼쳐져 있습니다!');
      player.mp -= s.mp;
      buffs.shield = true;
      SoundFX.magic();
      world.burst(player.x, player.y, '#fde047', 20);
      host.showToast('실드 해방! 황금 결계를 두른 채 다음 전투를 시작합니다!');
    }
    updateHUD(true);
    updateFieldBar();
  }

  // --------------------------------------------------------------------------
  // 6. 크로우 북 · 기억 돌아보기 · 마법 의상실 (동행 토모요 전용)
  // --------------------------------------------------------------------------
  function enterMemoryMode(cardId) {
    const c = CARDS[cardId];
    if (!c) return;
    host.closeBookModal();
    Timers.clearAll();
    if (!memoryMode.active) {
      memoryMode.snapshot = {
        currentMapId,
        px: player.x,
        py: player.y,
        hp: player.hp,
        mp: player.mp,
        ownedCards: new Set(ownedCards),
        yueDefeated
      };
    }
    memoryMode.active = true;
    memoryMode.cardId = cardId;
    resetAnomalyState();

    currentMapId = MAPS[c.map] ? c.map : 'town';
    const cur = getMap();
    const sp = c.id === 'maze'
      ? (c.map === 'shrine_gate' ? { x: 500, y: 480 } : { x: 540, y: 610 })
      : { x: clamp(c.x - 95, 60, cur.w - 60), y: clamp(c.y + 65, 60, cur.h - 60) };
    player.x = sp.x;
    player.y = sp.y;
    kero.x = sp.x - 26;
    kero.y = sp.y - 18;
    if (isTomoyoFollowing()) placeTomoyoNearPlayer();
    player.targetPos = null;
    pendingTarget = null;
    encCd = 1.2;

    if ($('memoryBannerText')) $('memoryBannerText').textContent = Locale.t(`✨ [${cardName(c)}] 기억 회상 중`);
    $('memoryBanner')?.classList.remove('hidden');
    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
    host.showToast(`✨ [${cardName(c)}] 이상 현상이 살아 움직이던 그날의 기억으로 돌아왔습니다!`);
  }

  function exitMemoryMode() {
    if (!memoryMode.active) return;
    Timers.clearAll();
    vn.finish(true);
    battle.forceClose();
    const s = memoryMode.snapshot;
    memoryMode = { active: false, cardId: null, snapshot: null };
    $('memoryBanner')?.classList.add('hidden');
    if (s) {
      currentMapId = s.currentMapId;
      player.x = s.px;
      player.y = s.py;
      player.hp = s.hp;
      player.mp = s.mp;
      ownedCards = s.ownedCards;
      yueDefeated = s.yueDefeated;
      kero.x = player.x - 26;
      kero.y = player.y - 18;
      if (isTomoyoFollowing()) placeTomoyoNearPlayer();
    }
    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
    host.showToast('현재의 토모에다 마을로 돌아왔습니다.');
  }

  function openBook(silent = false) {
    host.openBookModal({
      title: 'THE CLOW BOOK',
      sub: `크로우 카드 수집도: ${ownedCards.size}/${CARD_ORDER.length} · 봉인한 카드는 [✨ 기억 돌아보기]로 다시 체험 가능 · 닫기(Z)`,
      silent,
      renderGrid(grid) {
        CARD_ORDER.forEach((id, idx) => {
          const c = CARDS[id];
          if (!c) return;
          const owned = ownedCards.has(id);
          const unlockedNow = isCardUnlockedByAct(id);
          const actLockText = ACTS.act2.includes(id)
            ? '제2막 개방'
            : ACTS.act3.includes(id)
            ? '제3막 개방'
            : (ACTS.act4Pair.includes(id) || ACTS.act4Final.includes(id))
            ? '제4막 개방'
            : '제1막 개방';
          const badge = c.ruler === 'kero'
            ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-400/40">☀ 태양</span>'
            : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-sky-200 border border-sky-400/40">☽ 달</span>';
          const div = document.createElement('div');
          div.className = `rounded-2xl p-2.5 flex flex-col items-center text-center border ${
            owned ? 'bg-purple-950/75 border-yellow-400/60' : 'bg-black/45 border-white/10 opacity-70'
          }`;
          div.innerHTML = owned
            ? `<div class="w-24 h-36 mb-2">${Art.getCard(c, false)}</div>
               <div class="flex items-center gap-1 mb-0.5"><span class="font-story font-bold text-sm text-yellow-200">${cardRuby(c)}</span>${badge}</div>
               <div class="text-[11px] text-pink-200 font-semibold">${Locale.t(c.skillName)} (MP ${c.mpCost})</div>
               <p class="text-[10px] text-purple-100/85 font-story mt-1 mb-2 leading-snug flex-1">${Locale.t(c.desc)}</p>
               <button data-replay="${id}" class="w-full py-1.5 rounded-xl bg-fuchsia-600/40 hover:bg-fuchsia-500/60 border border-pink-300/60 text-pink-100 text-[11px] font-story font-bold transition">✨ 기억 돌아보기</button>`
            : `<div class="w-24 h-36 mb-2 rounded-xl bg-black/55 border border-dashed border-yellow-500/30 flex flex-col items-center justify-center text-yellow-500/45"><span class="font-magic text-2xl">?</span><span class="text-[10px] mt-1 font-magic">NO.${String(idx + 1).padStart(2, '0')}</span></div>
               <div class="font-story font-bold text-xs text-slate-300">${unlockedNow ? '??? · 미봉인' : `🔒 ${actLockText}`}</div>
               <div class="text-[10px] text-amber-200/80 font-story mt-0.5">${Locale.t(unlockedNow ? (DATA.mapAreaLabels?.[c.map] || '') : '스토리 진행 시 출현')}</div>
               <p class="text-[10px] text-cyan-100/70 font-story mt-1 leading-snug">${Locale.t(unlockedNow ? (c.rumor || '') : '현재 막의 크로우 카드를 봉인하면 새로운 기운이 깨어납니다.')}</p>`;
          grid.appendChild(div);
        });
        grid.querySelectorAll('[data-replay]').forEach((b) => {
          b.addEventListener('click', () => enterMemoryMode(b.dataset.replay));
        });
      }
    });
  }

  function openWardrobe(silent = false) {
    host.openWardrobeModal({
      title: '🎀 토모요의 마법 의상실',
      silent,
      renderGrid(grid) {
        COSTUMES.forEach((cos) => {
          const unlocked = Rules.isCostumeUnlocked(cos, {
            ownedCards,
            bossCleared: yueDefeated,
            unlockedCostumes: story.unlockedCostumes
          });
          const equipped = story.costumeId === cos.id;
          const card = document.createElement('div');
          card.className = `rounded-2xl p-3.5 border flex flex-col justify-between gap-2 transition ${
            equipped
              ? 'bg-pink-900/45 border-yellow-300 shadow-lg'
              : unlocked
              ? 'bg-purple-950/75 border-pink-300/40'
              : 'bg-black/45 border-white/10 opacity-65'
          }`;
          card.innerHTML = `
            <div>
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-story font-bold text-sm text-yellow-200">${Locale.t(cos.name)}</span>
                <span class="w-4 h-4 rounded-full border border-white/70" style="background:${cos.dressColor}"></span>
              </div>
              <div class="text-xs font-bold text-emerald-300 mb-1">✦ ${Locale.t(cos.passive)}</div>
              <p class="text-[11px] font-story text-pink-100/90 leading-relaxed">${Locale.t(unlocked ? cos.tomoyoQuote : `🔒 해금 조건: ${cos.unlockHint}`)}</p>
            </div>
            <button ${!unlocked || equipped ? 'disabled' : ''} data-cos="${cos.id}" class="w-full py-2 rounded-xl text-xs font-story font-bold transition ${
              equipped
                ? 'bg-yellow-400/25 border border-yellow-300 text-yellow-200'
                : unlocked
                ? 'bg-pink-600 hover:bg-pink-500 text-white'
                : 'bg-slate-800 text-slate-400'
            }">${equipped ? '✨ 현재 착용 중' : unlocked ? '이 의상으로 갈아입기' : '미해금'}</button>`;
          grid.appendChild(card);
        });
        grid.querySelectorAll('[data-cos]').forEach((b) => {
          b.addEventListener('click', () => {
            story.costumeId = b.dataset.cos;
            story.unlockedCostumes.add(b.dataset.cos);
            recalcPower(false);
            SoundFX.heal();
            autoSave('의상 변경');
            updateHUD(true);
            openWardrobe(true);
            host.showToast(`🎀 [${getCostumeObj().name}] 착용 완료! 패시브 효과가 적용됩니다.`);
          });
        });
      }
    });
  }

  // --------------------------------------------------------------------------
  // 7. NPC 대화 · 카드 조우(친밀도 이중 가산 차단) · 4막 진행 · 유에 심판 직결
  // --------------------------------------------------------------------------
  function talkNPC(npc) {
    if (npc.id === 'tomoyo') {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      updateHUD(true);
      SoundFX.heal();
      host.showToast('☕ 토모요의 홍차로 HP·MP가 완전 회복되었습니다!');

      const latest = story.sealedOrder.length ? CARDS[story.sealedOrder[story.sealedOrder.length - 1]] : null;
      const filmMsg = latest
        ? `방금 봉인하신 [${cardName(latest)}] 장면이 어찌나 사랑스러웠는지 카메라에 고스란히 담아 두었답니다!`
        : '황혼빛 아래 마법 의상이 정말 눈부셔요! 보온병에 담아 온 따뜻한 홍차 드시고 기운 내세요!';
      let openWardrobeAfter = false;

      vn.start([
        { speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: filmMsg },
        {
          speaker: '토모요',
          role: 'COSTUME DESIGNER',
          avatar: 'tomoyo',
          mood: 'happy',
          text: `현재 착용 중인 [${getCostumeObj().name}] 외에 새 배틀 의상도 준비해 두었어요. 의상실을 열어 보실래요?`,
          choices: [
            {
              label: '🎀 응! 마법 의상실 열어줘!',
              effect: () => { openWardrobeAfter = true; },
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '마음에 드는 의상을 골라 보세요! 의상마다 특별한 마법 효과가 깃들어 있답니다!' }]
            },
            {
              label: '고마워 토모요! 홍차만 마시고 바로 출발할게!',
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '네! 멋진 활약, 옆에서 열심히 촬영하며 응원할게요!' }]
            }
          ]
        }
      ], () => {
        if (openWardrobeAfter) openWardrobe();
      });
    } else if (npc.id === 'touya') {
      buffs.cocoaBuff = true;
      SoundFX.heal();
      updateHUD(true);
      host.showToast('☕ 토우야의 코코아! 다음 전투 공격력 +15% · 치명타 +10%!');
      if (ownedCards.has('mirror')) {
        vn.start([
          { speaker: '토우야', role: 'BIG BROTHER', avatar: 'touya', mood: 'normal', text: '어이 괴물. ...아까 집 앞에서 너랑 똑같이 생긴 녀석이 나한테 엄청 얌전하게 인사하던데. 평소에 시끄러운 네가 그렇게 조용할 리가 없잖아.' },
          { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'shock', text: '으악?! 오, 오빠... 가짜였다는 거 알고 있었어?!' },
          { speaker: '토우야', role: 'BIG BROTHER', avatar: 'touya', mood: 'happy', text: '당연하지. ...뭐, 나쁜 녀석은 아닌 것 같더라. 나중에 만나면 잘 챙겨 줘라. 자, 코코아나 마시고 힘내. (다음 전투 공격+15%·치명+10%!)' }
        ]);
      } else {
        const syaNote = story.syaoranTrust >= 2 ? ' ...요즘 그 이상한 꼬마 녀석이랑 꽤 친해진 모양이던데, 수상한 짓 하면 가만 안 둔다.' : '';
        vn.start([
          { speaker: '토우야', role: 'BIG BROTHER', avatar: 'touya', mood: 'normal', text: '어이 괴물, 해 지는데 또 어디 돌아다니는 거냐? ...자, 따뜻한 코코아나 마시고 가. (다음 전투 공격력 +15% · 치명타 +10%!)' },
          { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'shy', text: '흥, 괴물 아니거든! ...그래도 코코아 고마워, 오빠!' },
          { speaker: '토우야', role: 'BIG BROTHER', avatar: 'touya', mood: 'normal', text: `무리해서 다치지 마라.${syaNote}` }
        ]);
      }
    } else if (npc.id === 'yukito') {
      buffs.snackBuff = true;
      SoundFX.heal();
      updateHUD(true);
      host.showToast('🍙 유키토의 간식! 다음 전투 피해 22% 경감 · 매 턴 MP +3!');
      const hint = ownedCards.size >= 14
        ? '이상하게 요즘 보름달이 가까워질수록 가끔 기억이 잠깐씩 끊기는 기분이 들어... 그래도 사쿠라가 웃는 걸 보면 안심이 돼.'
        : '직접 만든 주먹밥과 만두야! 든든하게 먹고 힘내, 사쿠라! (다음 전투 피해 22% 경감 · 매 턴 MP +3!)';
      vn.start([
        { speaker: '유키토', role: 'GENTLE FRIEND', avatar: 'yukito', mood: ownedCards.size >= 14 ? 'worried' : 'happy', text: `안녕 사쿠라! 황혼빛 산책로가 참 예쁘지? ${hint}` },
        { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'happy', text: '유키토 오빠가 만들어 준 간식 정말 맛있어요! 덕분에 힘이 불끈 솟아나요!' }
      ]);
    } else if (npc.id === 'syaoran') {
      const tr = story.syaoranTrust;
      if (!story.metSyaoran) {
        story.metSyaoran = true;
        vn.start([
          { speaker: '샤오랑', role: 'RIVAL', avatar: 'syaoran', mood: 'serious', text: '키노모토 사쿠라... 크로우 카드는 나도 노리고 있다. 어설프게 덤비다 다치지 마!' },
          {
            speaker: '샤오랑',
            role: 'RIVAL',
            avatar: 'syaoran',
            mood: 'serious',
            text: '신사 안쪽의 [파이어리]나 [선더]는 특히 위험해. 약점 상성 없이 덤비지 마라.',
            choices: [
              { label: '알려줘서 고마워, 샤오랑! 함께 마을을 지키자!', trustDelta: 1, reply: [{ speaker: '샤오랑', role: 'RIVAL', avatar: 'syaoran', mood: 'shy', text: '무, 무슨 소리야! ...하지만 위급할 땐 서로 도울 수밖에 없겠지.' }] },
              { label: '나도 절대 지지 않을 거야!', trustDelta: 0, reply: [{ speaker: '샤오랑', role: 'RIVAL', avatar: 'syaoran', mood: 'serious', text: '그래, 그 기세로 끝까지 해 보라고.' }] }
            ]
          }
        ]);
      } else {
        const statusMsg = yueDefeated
          ? '달의 심판자 유에까지 이겨내다니... 정말 대단해, 사쿠라.'
          : tr >= 3
          ? `현재 친밀도 ${tr}/5! 배틀 중 [⚡샤오랑 원호]와 위기 시 자동 엄호까지 내가 책임지고 등 뒤를 지킬게!`
          : tr >= 2
          ? `현재 친밀도 ${tr}/5! 이제 배틀 중 [⚡샤오랑 원호]를 누르면 내 부적 [뇌제초래]로 결계와 반사막을 깨뜨려 줄게!`
          : `지금까지 ${ownedCards.size}장 모았군. [선더]·[워터리]·[파이어리]·[다크] 현장에서 다시 만나게 될 거야!`;
        vn.start([{ speaker: '샤오랑', role: tr >= 2 ? 'ALLY' : 'RIVAL', avatar: 'syaoran', mood: tr >= 2 ? 'happy' : 'normal', text: statusMsg }]);
      }
    }
  }

  function buildCardIntro(id) {
    const c = CARDS[id];
    const wc = CARDS[c.weakness];
    const lines = [];
    const syaEnc = !memoryMode.active && DATA.syaoranEncounters?.[id];
    if (syaEnc && !story.seenEncounters.has(id)) {
      story.seenEncounters.add(id);
      story.metSyaoran = true;
      // 샤오랑 친밀도 이중 가산 버그 수정: 선택지에 trustDelta가 있으면 trustBonus를 중복 가산하지 않음!
      const encLines = toArr(syaEnc.lines);
      const hasChoiceDelta = encLines.some((ln) => toArr(ln?.choices).some((ch) => Number(ch?.trustDelta) > 0));
      if (!hasChoiceDelta && syaEnc.trustBonus) {
        story.syaoranTrust = Rules.clampTrust(story.syaoranTrust + syaEnc.trustBonus, 1);
      }
      lines.push(...encLines);
      return lines;
    }

    lines.push({ speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'normal', text: `${c.zone}... ${c.flavor}` });
    if (memoryMode.active) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `그날 [${cardName(c)}]와 마주했던 기억이야! 다시 한 번 봉인의 순간을 체험해 보자!` });
    } else if (story.sealedOrder.length === 0) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `틀림없어, 첫 번째 크로우 카드 [${cardName(c)}]의 실체야! 저항력을 50% 이하로 깎고 [🎯 수렴 봉인!] 마법진에 맞춰 봉인해 보자!` });
    } else if (wc && ownedCards.has(wc.id)) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `[${cardName(c)}]의 정령이야! 마침 약점인 [${cardName(wc)}] 카드를 가지고 있잖아! 행동 예고를 보고 맞서자!` });
    } else {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `[${cardName(c)}] 카드의 기운이야! [방어·호흡]으로 큰 공격을 버텨내며 공략해 보자!` });
    }
    return lines;
  }

  function finishCardSeal(c) {
    if (memoryMode.active) {
      vn.start([{ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `역시 멋졌어 사쿠라! [${cardName(c)}] 봉인의 기억이 생생하네! 이제 원래 마을로 돌아갈까?` }], exitMemoryMode);
      return;
    }

    const prevAct = getCurrentStoryAct();
    ownedCards.add(c.id);
    if (!story.sealedOrder.includes(c.id)) story.sealedOrder.push(c.id);
    const nextAct = getCurrentStoryAct();

    // 제1막 완료(플라이 봉인 직후): 토모요 정식 합류 + 첫 배틀 의상 선물 & 자동 착용!
    let tomoyoJustJoined = false;
    if (prevAct === 1 && nextAct >= 2) {
      tomoyoJustJoined = true;
      story.tomoyoFollowing = true;
      story.unlockedCostumes.add('sakura_dress');
      story.costumeId = 'sakura_dress';
    }

    recalcPower(true);
    if (tomoyoJustJoined) {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      placeTomoyoNearPlayer();
    }
    encCd = 1.0;
    updateHUD(true);
    updateFieldBar();
    autoSave(tomoyoJustJoined ? '플라이 봉인 · 토모요 합류' : `${cardName(c)} 봉인`);

    // 4막 단계별 개방 챕터 배너
    if (prevAct === 1 && nextAct >= 2) showChapterOnce('ACT II · 황혼의 마을과 학교', '토모요의 합류와 첫 마법 의상');
    if (prevAct === 2 && nextAct >= 3) showChapterOnce('ACT III · 전학생과 신사의 시련', '홍콩에서 온 전학생 리 샤오랑');
    if (prevAct === 3 && nextAct >= 4) showChapterOnce('ACT IV · 빛과 어둠의 무대', '학예회 강당의 다크와 라이트');
    if (prevAct === 4 && nextAct >= 4.5) showChapterOnce('ACT IV · 최후의 원소', '대지를 울리는 마지막 카드 어시');
    if (prevAct < 5 && nextAct >= 5) showChapterOnce('FINAL ACT · JUDGMENT', '최후의 심판');

    const lines = [];
    if (tomoyoJustJoined) {
      lines.push(
        { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'happy', text: '해냈다!! [플라이] 카드를 봉인했어! 이제 지팡이에 날개를 달아 하늘을 날 수 있어!' },
        { speaker: '토모요', role: 'BEST FRIEND', avatar: 'tomoyo', mood: 'happy', text: '사쿠라!! 방금 지팡이를 타고 하늘을 날고 계셨죠?! 카메라에 완벽하게 담아 두었답니다!!' },
        { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'shock', text: '으아악?! 토, 토모요?! 방금 내가 하늘 나는 거 다 본 거야?!' },
        { speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '비밀은 꼭 지킬게요! 대신 앞으로 사쿠라의 멋진 활약을 옆에서 촬영하게 해 주세요! 마침 첫 배틀 의상 [🌸 벚꽃 배틀 드레스]와 따뜻한 홍차도 챙겨 왔답니다! (의상 착용 · HP/MP 완전 회복!)' },
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: '오, 저 친구 센스 최고인데! 이제 토모요가 촬영을 위해 따라다니며 홍차 회복과 마법 의상실을 맡아 줄 거야! 그리고 마을과 학교 곳곳에서 여섯 장의 새로운 기운이 깨어났어!' }
      );
    } else {
      lines.push(
        { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'happy', text: `다행이야... [${cardName(c)}] 카드를 봉인하니까 이상 현상도 말끔히 가라앉았어!` },
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `마력이 한층 깊어졌어! (마력 Lv.${player.lv} · 최대 HP ${player.maxHp} · 최대 MP ${player.maxMp})` }
      );
    }

    if (c.id === 'watery') {
      story.unlockedCostumes.add('frog_rain');
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '사쿠라! 워터리를 봉인하셨군요! 의상실에 [🐸 개구리 우비 슈트]가 해금되었어요!' });
    }
    if (c.id === 'thunder') {
      story.unlockedCostumes.add('cat_thunder');
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '사쿠라! 선더를 봉인하셨군요! 의상실에 [🐱 고양이 귀 번개 슈트]가 해금되었어요!' });
    }
    if (ownedCards.has('fly') && ownedCards.has('jump') && (c.id === 'fly' || c.id === 'jump')) {
      story.unlockedCostumes.add('sky_wing');
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '하늘을 가르는 [🪽 하늘빛 날개 드레스]가 의상실에 준비되었어요!' });
    }
    if ((c.id === 'mirror' || c.id === 'flower') && !(ownedCards.has('mirror') && ownedCards.has('flower'))) {
      story.unlockedCostumes.add('alice_maid');
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '사랑스러운 [🎀 앨리스 메이드 드레스]가 의상실에 해금되었어요!' });
    }
    if (ownedCards.has('illusion') && ownedCards.has('maze') && (c.id === 'illusion' || c.id === 'maze')) {
      story.unlockedCostumes.add('pierrot_magic');
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '장난스러운 [🃏 피에로 매직 슈트]가 의상실에 준비되었어요!' });
    }
    if (ownedCards.size === 12) {
      story.unlockedCostumes.add('star_royal');
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '열두 장 돌파 기념으로 [👑 황혼 로열 드레스]를 지어 두었답니다!' });
    }

    // 4막 단계 개방 스토리 이벤트
    if (prevAct === 2 && nextAct >= 3) {
      lines.push(
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'shock', text: '사쿠라! 마을과 학교가 잠잠해지자마자 분수대 호수와 츠키미네 신사 쪽에서 강력한 마력이 여덟 군데나 터져 나왔어!' },
        { speaker: '샤오랑', role: 'RIVAL', avatar: 'syaoran', mood: 'serious', text: '키노모토 사쿠라... 홍콩에서 전학 온 리 샤오랑이다. 크로우 리드의 혈통을 이은 나도 카드를 회수하러 왔다. 어설픈 실력으로 덤비지 마라!' },
        { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'shock', text: '에엣?! 너도 크로우 카드를 모으는 거야?!' },
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: '제3막이 열렸어! 지금부터는 [워터리]·[선더]·[파이어리]·[소드]처럼 훨씬 강한 카드들이야. 분수대와 신사 쪽을 조사해 보자!' }
      );
    } else if (prevAct === 3 && nextAct >= 4) {
      lines.push(
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: '드디어 최상위 크로우 카드 [다크]와 [라이트]가 토모에다 초등학교 학예회 강당에서 깨어났어!' },
        { speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'worried', text: '강당 무대 쪽이 한낮처럼 눈부시다가도 칠흑처럼 어두워지고 있어요... 사쿠라, 단단히 준비하고 가세요!' }
      );
    } else if (prevAct === 4 && nextAct >= 4.5) {
      lines.push(
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'shock', text: '우와악!! 땅이 흔들리고 있어!! 크로우 카드 열아홉 장 중 최후의 원소 [어시]가 펭귄 공원 남쪽 언덕에서 깨어났어!' },
        { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'serious', text: '드디어 마지막 한 장이야...! [어시]까지 봉인하면 열아홉 장이 전부 모여!' }
      );
    } else if (prevAct < 5 && nextAct >= 5 && BOSS_YUE) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `드디어 열아홉 장을 모두 모았어! 남쪽 [${BOSS_YUE.zone}]에서 강렬한 달빛이 내려오고 있어!` });
    }

    vn.start(lines);
  }

  /** 유에 격파 -> 로비 끊김 없이 제2부 막간 시네마틱으로 자연 직결! */
  function finishYueVictory() {
    yueDefeated = true;
    story.unlockedCostumes.add('pure_angel');
    updateHUD(true);
    autoSave('제1부 완결 · 유에 심판 돌파');

    vn.start(toArr(DATA.dialogues?.yueVictory), () => {
      mode = 'ending';
      updateFieldBar();
      const f = CARDS[story.sealedOrder[0] || 'fly'];
      const l = CARDS[story.sealedOrder[story.sealedOrder.length - 1] || 'earthy'];

      host.transitionToNextAct(2, {
        icon: '⭐',
        sub: 'ACT I COMPLETE · INTERLUDE',
        title: '황혼이 지나고, 별빛의 새 학기',
        body:
          `<b>[${cardName(f)}]</b>에서 마지막 <b>[${cardName(l)}]</b>까지 열아홉 장의 크로우 카드를 모두 봉인하고, 달의 심판자 <b>유에</b>에게 새로운 주인으로 인정받은 사쿠라.<br/><br/>` +
          `평화로운 새 학기가 밝아오던 어느 날, 영국에서 온 신비로운 전학생 <b>에리오르</b>가 토모에다에 모습을 드러내고—<br/>` +
          `크로우의 마력이 서서히 옅어지며 열아홉 장의 카드와 유키토에게 새로운 위기가 찾아옵니다.<br/><br/>` +
          `<span class="text-yellow-200 text-xs font-bold">✨ 해금한 마법 의상(🕊 순백의 천사 드레스 포함) · HP/MP · 샤오랑 친밀도(${story.syaoranTrust}) · 추억이 모두 이어집니다!</span>`,
        buttonLabel: '⭐ 별빛의 새 학기로 계속하기 (X)',
        act1Payload: getSavePayload(),
        sharedPatch: getSharedState()
      });
    });
  }

  function handleDefeat() {
    if (memoryMode.active) return exitMemoryMode();
    if (!story.tomoyoFollowing) {
      currentMapId = MAPS.house_f1 ? 'house_f1' : 'town';
      player.x = currentMapId === 'house_f1' ? 410 : 385;
      player.y = currentMapId === 'house_f1' ? 360 : 465;
      kero.x = player.x - 28;
      kero.y = player.y - 20;
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      encCd = 2.0;
      host.resize();
      updateHUD(true);
      updateFieldBar();
      vn.start([
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'worried', text: '사쿠라! 정신 차려! 마력을 너무 써서 일단 집 1층 거실로 데려왔어!' },
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: '식탁에서 잠시 쉬었으니 기운이 다 돌아왔을 거야. 초등학교 앞마당의 [플라이]에게 다시 도전해 보자! (HP · MP 완전 회복)' }
      ]);
      return;
    }

    currentMapId = 'town';
    player.x = 415;
    player.y = 485;
    kero.x = 385;
    kero.y = 465;
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    encCd = 2.0;
    if (isTomoyoFollowing()) placeTomoyoNearPlayer();
    host.resize();
    updateHUD(true);
    updateFieldBar();
    vn.start(toArr(DATA.dialogues?.defeat));
  }

  // --------------------------------------------------------------------------
  // 8. 맵 전환 · 상호작용 · 탐험 업데이트 · 메인 틱 (모달 중 이동 완벽 차단!)
  // --------------------------------------------------------------------------
  function transitionMap(mid, sx, sy) {
    if (!MAPS[mid]) return;
    portalCd = 1.0;
    encCd = 0.8;
    player.targetPos = null;
    pendingTarget = null;
    const fade = $('mapFade');
    if (fade) fade.style.opacity = '1';
    Timers.after(() => {
      currentMapId = mid;
      player.x = sx;
      player.y = sy;
      kero.x = sx - 26;
      kero.y = sy - 18;
      anomaly.mirrorTrail = [];
      if (isTomoyoFollowing()) placeTomoyoNearPlayer();

      host.resize();
      SoundFX.encounter();
      updateHUD(true);
      const cnt = countUnsealedInMap(mid);
      if (mid === 'town' && getCurrentStoryAct() === 1) {
        host.showToast('황혼의 토모에다 마을로 나왔습니다! 초등학교 앞마당에서 [플라이]의 기운이 느껴집니다!');
      } else {
        host.showToast(mid === 'town' ? '황혼의 토모에다 마을로 나왔습니다.' : `${getMap().name}에 들어왔습니다.${cnt ? ` (이상 현상 ${cnt}곳)` : ''}`);
      }
      if (fade) fade.style.opacity = '0';
    }, 170);
  }

  function checkNearby() {
    nearbyTarget = null;
    let bestScore = 92;
    const cur = getMap();

    for (const p of toArr(cur.portals)) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 64 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'portal', obj: p }; }
    }
    // 토모요 합류 전(및 집 방문 시) 1층 거실 식탁 무료 휴식 안전망
    if (currentMapId === 'house_f1') {
      const dxT = Math.max(0, Math.abs(player.x - 410) - 80);
      const dyT = Math.max(0, Math.abs(player.y - 284) - 29);
      const dTable = Math.hypot(dxT, dyT);
      if (dTable < 48 && dTable + 12 < bestScore) {
        bestScore = dTable + 12;
        nearbyTarget = { type: 'rest_table', obj: { x: 410, y: 335, label: '거실 식탁에서 쉬어가기' } };
      }
    }
    for (const id of CARD_ORDER) {
      if (!isCardActiveOnMap(id)) continue;
      const c = CARDS[id];
      if (!c || c.map !== currentMapId) continue;
      const pos = getCardPos(c);
      const d = Math.hypot(player.x - pos.x, player.y - pos.y);
      if (d < 86 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'card', obj: { ...c, x: pos.x, y: pos.y } }; }
    }
    if (!yueDefeated && !memoryMode.active && BOSS_YUE && currentMapId === BOSS_YUE.map) {
      const d = Math.hypot(player.x - BOSS_YUE.x, player.y - BOSS_YUE.y);
      if (d < 92 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'boss', obj: BOSS_YUE }; }
    }
    for (const n of NPCS) {
      if (!isNpcVisible(n)) continue;
      const np = getNpcPos(n);
      const d = Math.hypot(player.x - np.x, player.y - np.y);
      // 동행 중인 토모요는 카드·포털·식탁과 겹칠 때 방해되지 않도록 우선순위 소폭 완화
      const score = n.id === 'tomoyo' ? d + 18 : d;
      if (d < 86 && score < bestScore) { bestScore = score; nearbyTarget = { type: 'npc', obj: { ...n, x: np.x, y: np.y } }; }
    }

    const btn = $('btnFloatInteract');
    if (!btn) return;
    if (nearbyTarget && mode === 'explore') {
      btn.classList.remove('hidden');
      btn.textContent = Locale.t(
        nearbyTarget.type === 'portal'
          ? `${nearbyTarget.obj.label} (X)`
          : nearbyTarget.type === 'rest_table'
          ? '🍵 거실 식탁에서 쉬어가기 (X)'
          : nearbyTarget.type === 'npc'
          ? `${Utils.withParticle(Locale.t(nearbyTarget.obj.name), '과/와')} 대화 (X)`
          : nearbyTarget.type === 'boss'
          ? (ownedCards.size === CARD_ORDER.length ? '유에의 심판에 맞서기 (X)' : '봉인된 시계탑 마법진 (X)')
          : '이상 현상 조사하기 (X)'
      );
    } else {
      btn.classList.add('hidden');
    }
  }

  function triggerInteract() {
    if (vn.isActive()) return vn.advance();
    if (mode !== 'explore' || !nearbyTarget) return;
    const t = nearbyTarget;

    if (t.type === 'portal') {
      if (memoryMode.active) return host.showToast('기억 회상 중에는 상단 [↩ 현재 마을로 돌아가기]를 이용해 주세요!');
      transitionMap(t.obj.targetMap, t.obj.spawnX, t.obj.spawnY);
    } else if (t.type === 'rest_table') {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      SoundFX.heal();
      world.burst(player.x, player.y, '#fef08a', 18);
      updateHUD(true);
      host.showToast('🍵 거실 식탁에서 잠시 숨을 돌렸습니다! (HP · MP 완전 회복)');
    } else if (t.type === 'npc') {
      talkNPC(t.obj);
    } else if (t.type === 'card') {
      const c = t.obj;
      vn.start(buildCardIntro(c.id), () => battle.start(c));
    } else if (t.type === 'boss') {
      if (ownedCards.size < CARD_ORDER.length) {
        const remCount = CARD_ORDER.length - ownedCards.size;
        vn.start([
          { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `아직 크로우 카드 ${remCount}장이 남아 있어! 열아홉 장이 모두 모이면 이 시계탑 광장에서 최후의 심판이 시작될 거야.` }
        ]);
      } else {
        const intro = toArr(DATA.dialogues?.yueIntro).slice();
        if (story.syaoranTrust >= 2 && DATA.dialogues?.syaoranYueCheer) {
          intro.unshift(...toArr(DATA.dialogues.syaoranYueCheer));
        }
        vn.start(intro, () => battle.start(BOSS_YUE));
      }
    }
  }

  function updateExplore(dt) {
    world.updateAmbience(dt);
    if (mode !== 'explore' || host.isAnyModalOpen?.()) return;

    if (encCd > 0) encCd = Math.max(0, encCd - dt);
    if (portalCd > 0) portalCd = Math.max(0, portalCd - dt);

    const prevSig = `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`;
    const colOpts = { ignoreObs: false, mazeActive: (currentMapId === 'school' || currentMapId === 'shrine_gate') && isCardActiveOnMap('maze') };

    if (buffs.fly > 0) {
      buffs.fly = Math.max(0, buffs.fly - dt);
      if (Math.random() < 0.35) world.burst(player.x, player.y + 8, '#ffffff', 1);
      if (buffs.fly === 0 && world.isColliding(getMap(), currentMapId, player.x, player.y, colOpts)) {
        buffs.flyLand = true;
        host.showToast('장애물·호수 위입니다. 빈 땅으로 이동하면 착지합니다!');
      }
    } else if (buffs.flyLand && !world.isColliding(getMap(), currentMapId, player.x, player.y, colOpts)) {
      buffs.flyLand = false;
      host.showToast('지상에 부드럽게 착지했습니다.');
    }

    if (buffs.light > 0) buffs.light = Math.max(0, buffs.light - dt);
    if (buffs.wind > 0) buffs.wind = Math.max(0, buffs.wind - dt);
    if (buffs.glowCd > 0) buffs.glowCd = Math.max(0, buffs.glowCd - dt);
    if (buffs.glow > 0) {
      buffs.glow = Math.max(0, buffs.glow - dt);
      buffs.glowAcc += dt;
      if (Math.random() < 0.3) {
        world.burst(player.x + (Math.random() - 0.5) * 28, player.y + (Math.random() - 0.5) * 20, '#bef264', 1);
      }
      if (buffs.glowAcc >= 0.5) {
        buffs.glowAcc -= 0.5;
        player.mp = Math.min(player.maxMp, player.mp + 2);
      }
    }
    if (prevSig !== `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`) {
      updateFieldBar();
    }

    const flying = buffs.fly > 0 || buffs.flyLand;
    const cosBonuses = Rules.getCostumeBonuses(story.costumeId);
    let spdMod = 1;
    let pushX = 0;
    let pushY = 0;

    if (isCardActiveOnMap('wood') && CARDS.wood?.map === currentMapId && !flying && buffs.wind <= 0) {
      if (Math.hypot(player.x - CARDS.wood.x, player.y - CARDS.wood.y) < 105) spdMod *= 0.45;
    }
    if (isCardActiveOnMap('earthy') && CARDS.earthy?.map === currentMapId && !flying) {
      if (Math.hypot(player.x - CARDS.earthy.x, player.y - CARDS.earthy.y) < 115) spdMod *= 0.62;
    }
    if (isCardActiveOnMap('watery') && CARDS.watery?.map === currentMapId && !flying && buffs.wind <= 0 && !cosBonuses.waterPushImmune) {
      const dw = Math.hypot(player.x - CARDS.watery.x, player.y - CARDS.watery.y);
      if (dw < 120 && dw > 35) {
        pushX += ((player.x - CARDS.watery.x) / dw) * 58;
        pushY += ((player.y - CARDS.watery.y) / dw) * 58;
      }
    }
    if (isCardActiveOnMap('jump') && CARDS.jump?.map === currentMapId) {
      anomaly.jumpHop = Math.max(0, anomaly.jumpHop - dt);
      anomaly.jumpBind = Math.max(0, anomaly.jumpBind - dt);
      const dj = Math.hypot(player.x - anomaly.jumpX, player.y - anomaly.jumpY);
      if (dj < 110 && dj > 44 && anomaly.jumpHop <= 0 && anomaly.jumpBind <= 0) {
        anomaly.jumpHop = 1.9;
        const spots = [{ x: 365, y: 830 }, { x: 475, y: 760 }, { x: 255, y: 935 }, { x: 465, y: 970 }];
        const pick = spots.filter((s) => Math.hypot(s.x - player.x, s.y - player.y) > 125)[0] || spots[0];
        anomaly.jumpX = pick.x;
        anomaly.jumpY = pick.y;
        world.burst(pick.x, pick.y, '#f472b6', 14);
        host.showToast('점프 기운이 공중으로 통통 뛰어 도망쳤다! ([윈디]로 묶을 수 있어요)');
      }
    }
    if (isCardActiveOnMap('glow') && CARDS.glow?.map === currentMapId) {
      const t = performance.now() * 0.001;
      anomaly.glowX = CARDS.glow.x + Math.sin(t * 1.1) * 42;
      anomaly.glowY = CARDS.glow.y + Math.cos(t * 1.6) * 16;
    }
    if (isCardActiveOnMap('shield') && CARDS.shield?.map === currentMapId && !flying && buffs.wind <= 0) {
      const ds = Math.hypot(player.x - CARDS.shield.x, player.y - CARDS.shield.y);
      if (ds < 95 && ds > 42) {
        pushX += ((player.x - CARDS.shield.x) / ds) * 46;
        pushY += ((player.y - CARDS.shield.y) / ds) * 46;
      }
    }
    if (isCardActiveOnMap('mirror') && CARDS.mirror?.map === currentMapId) {
      anomaly.mirrorTrail.push({ x: player.x, y: player.y, walk: player.walk });
      if (anomaly.mirrorTrail.length > 22) anomaly.mirrorTrail.shift();
    }
    if (isCardActiveOnMap('illusion') && CARDS.illusion?.map === currentMapId) {
      for (const d of anomaly.illusionDecoys) {
        if (!d.popped && Math.hypot(player.x - d.x, player.y - d.y) < 38) {
          d.popped = true;
          SoundFX.click();
          world.burst(d.x, d.y, '#c084fc', 18);
          host.showToast(`"${d.name}"의 모습이 보랏빛 안개로 흩어졌다! 가짜 환영이었어!`);
        }
      }
    }

    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx || dy) {
      player.targetPos = null;
      pendingTarget = null;
    } else if (player.targetPos) {
      const tx = player.targetPos.x - player.x;
      const ty = player.targetPos.y - player.y;
      const d = Math.hypot(tx, ty);
      if (d > 8) { dx = tx / d; dy = ty / d; }
      else player.targetPos = null;
    }

    const moveCol = { ignoreObs: flying, mazeActive: colOpts.mazeActive };
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const sp = getMoveSpeed() * spdMod;
      dx /= len;
      dy /= len;
      const nx = player.x + (dx * sp + pushX) * dt;
      const ny = player.y + (dy * sp + pushY) * dt;
      if (!world.isColliding(getMap(), currentMapId, nx, player.y, moveCol)) player.x = nx;
      if (!world.isColliding(getMap(), currentMapId, player.x, ny, moveCol)) player.y = ny;
      player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      player.walk += dt * 11;
    } else if (pushX || pushY) {
      if (!world.isColliding(getMap(), currentMapId, player.x + pushX * dt, player.y, moveCol)) player.x += pushX * dt;
      if (!world.isColliding(getMap(), currentMapId, player.x, player.y + pushY * dt, moveCol)) player.y += pushY * dt;
    }

    kero.x += (player.x - (player.dir === 'right' ? 28 : -28) - kero.x) * Math.min(1, dt * 4.5);
    kero.y += (player.y - 22 - kero.y) * Math.min(1, dt * 4.5);
    kero.bob += dt * 4.5;
    updateTomoyoFollow(dt);
    world.updateCamera(dt, getMap(), player);
    checkNearby();
    updateHUD();

    if (pendingTarget && Math.hypot(player.x - pendingTarget.obj.x, player.y - pendingTarget.obj.y) < 72) {
      nearbyTarget = pendingTarget;
      pendingTarget = null;
      player.targetPos = null;
      return triggerInteract();
    }
    if (portalCd <= 0 && !memoryMode.active) {
      for (const p of toArr(getMap().portals)) {
        if (Math.hypot(player.x - p.x, player.y - p.y) < 26) {
          return transitionMap(p.targetMap, p.spawnX, p.spawnY);
        }
      }
    }
    if (encCd <= 0 && nearbyTarget) {
      const d = Math.hypot(player.x - nearbyTarget.obj.x, player.y - nearbyTarget.obj.y);
      if (nearbyTarget.type === 'card' && d < 46) return triggerInteract();
      if (nearbyTarget.type === 'boss' && ownedCards.size === CARD_ORDER.length && d < 54) return triggerInteract();
    }
  }

  function tick(dt, now) {
    if (battle.isActive()) {
      battle.updateAndRenderVFX(dt);
      return;
    }
    updateExplore(dt);

    const cur = getMap();
    const hideKero = inPrologue && vn.state.i < 3;
    const hideAnomalies = inPrologue && vn.state.i < 2;
    const activeCards = hideAnomalies
      ? []
      : CARD_ORDER
          .filter((id) => isCardActiveOnMap(id) && CARDS[id]?.map === currentMapId)
          .map((id) => ({ ...CARDS[id], pos: getCardPos(CARDS[id]) }));

    const visibleNpcs = NPCS.filter(isNpcVisible).map((n) => (
      n.id === 'tomoyo' && isTomoyoFollowing() ? { ...n, x: tomoyoPos.x, y: tomoyoPos.y } : n
    ));

    const yueReady = !yueDefeated && !memoryMode.active && BOSS_YUE && ownedCards.size === CARD_ORDER.length;
    const bossObj = yueReady && currentMapId === BOSS_YUE.map
      ? { type: 'yue', x: BOSS_YUE.x, y: BOSS_YUE.y, label: '☽ 달의 심판자 유에' }
      : null;
    const clockCircle = currentMapId === 'town' && BOSS_YUE
      ? { x: BOSS_YUE.x, y: BOSS_YUE.y, ready: !!yueReady }
      : null;

    let earthyShake = 0;
    if (isCardActiveOnMap('earthy') && CARDS.earthy?.map === currentMapId) {
      const d = Math.hypot(player.x - CARDS.earthy.x, player.y - CARDS.earthy.y);
      if (d < 190) earthyShake = (1 - d / 190) * 3.2;
    }
    const shadowNearPlayer = !!(
      isCardActiveOnMap('shadow') &&
      CARDS.shadow?.map === currentMapId &&
      Math.hypot(player.x - CARDS.shadow.x, player.y - CARDS.shadow.y) < 220
    );

    world.render(now, {
      part: 1,
      map: cur,
      mapId: currentMapId,
      zones: ZONES,
      player,
      kero,
      buffs,
      costume: getCostumeObj(),
      anomaly,
      activeCards,
      activeIncidents: [],
      npcs: visibleNpcs,
      boss: bossObj,
      clockCircle,
      nextObjective: getNextObjective(),
      portalCounts: countUnsealedInMap,
      flags: {
        earthyShake,
        jumpActive: isCardActiveOnMap('jump'),
        wateryActive: isCardActiveOnMap('watery'),
        mazeActive: (currentMapId === 'school' || currentMapId === 'shrine_gate') && isCardActiveOnMap('maze'),
        shadowNearPlayer,
        hideKero,
        hideWand: inPrologue,
        showTarget: mode === 'explore'
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. 새 모험(지하 서재 프롤로그 · 교복 시작) & 챕터 라이프사이클 반환
  // --------------------------------------------------------------------------
  function startNewAdventure() {
    Timers.clearAll();
    vn.finish(true);
    battle.forceClose();
    memoryMode = { active: false, cardId: null, snapshot: null };
    inPrologue = true;
    $('memoryBanner')?.classList.add('hidden');
    $('endingBox')?.classList.add('hidden');

    ownedCards = new Set(['windy']);
    yueDefeated = false;
    shownActs = new Set();
    story.metSyaoran = false;
    story.syaoranTrust = 0;
    story.seenEncounters = new Set();
    story.sealedOrder = [];
    story.costumeId = 'school_uniform';
    story.unlockedCostumes = new Set(['school_uniform']);
    story.tomoyoFollowing = false;

    const hasBasement = !!MAPS.house_b1;
    currentMapId = hasBasement ? 'house_b1' : (MAPS.house ? 'house' : 'town');
    recalcPower(false);
    player.x = hasBasement ? 380 : (currentMapId === 'house' ? 240 : 385);
    player.y = hasBasement ? 225 : (currentMapId === 'house' ? 320 : 465);
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    player.targetPos = null;
    pendingTarget = null;
    kero.x = player.x - 28;
    kero.y = player.y - 20;

    Object.assign(buffs, {
      fly: 0, flyLand: false, light: 0, glow: 0, glowCd: 0, glowAcc: 0,
      wind: 0, shield: false, snackBuff: false, cocoaBuff: false
    });
    resetAnomalyState();

    host.resize();
    updateHUD(true);
    showChapterOnce('PROLOGUE · THE CLOW', '지하 서재의 붉은 책');

    const prologueLines = [
      { speaker: '사쿠라', role: 'STUDENT', avatar: 'sakura', mood: 'normal', text: '아빠 서재에서 이상한 빛이 새어 나오고 있어... 어라? 책상 위에 신비롭게 빛나는 붉은 책이 놓여 있네!' },
      { speaker: '사쿠라', role: 'STUDENT', avatar: 'sakura', mood: 'normal', text: '봉인을 열었더니 카드가 가득 들어 있어! 맨 위에 있는 카드 이름은... "윈디"?' },
      { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'shock', text: '으악!! 갑자기 거센 바람이 불어서 나머지 열여덟 장의 카드가 창밖 황혼 하늘로 전부 날아가 버렸어!!' },
      { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'shock', text: '으아악! 잠깐 눈 붙인 사이에 마력이 다 사라졌잖아!! 네가 윈디를 불러서 크로우 카드 열여덟 장이 토모에다 전역으로 흩어져 버렸다고!' },
      { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: '그나마 윈디 한 장은 네 손에 남았어! 자, 이 봉인의 열쇠를 받아 줘! 우선 초등학교 앞마당에서 날뛰는 [플라이] 카드부터 봉인하러 가자!' }
    ];

    vn.start(prologueLines, () => {
      inPrologue = false;
      encCd = 1.2;
      world.burst(player.x, player.y, '#38bdf8', 24);
      host.showToast('📖 크로우 카드 1/19 (윈디) 보유! 마을 초등학교 앞마당에서 [플라이]를 찾아 봉인하세요!');
      autoSave('모험 시작');
    });
  }

  return {
    part: 1,
    battleHooks: {
      getData: () => DATA,
      getCards: () => CARDS,
      getCardOrder: () => CARD_ORDER,
      getPlayer: () => player,
      getOwnedCards: () => ownedCards,
      getSakuraCards: () => new Set(),
      getCostumeId: () => story.costumeId,
      isCostumeReformed: () => false,
      getSyaoranTrust: () => story.syaoranTrust,
      getFieldBuffs: () => buffs,
      onHUDUpdate: () => updateHUD(true),
      onModeChange: (m) => { mode = m; updateFieldBar(); },
      onVictory: (target) => { if (target.isBoss) finishYueVictory(); else finishCardSeal(target); },
      onDefeat: handleDefeat,
      onFlee: () => { encCd = 2.0; host.showToast('잠시 물러나 재정비합니다.'); }
    },
    start({ saved, shared } = {}) {
      if (saved && saved.ownedCards) {
        applySavePayload(saved, shared);
      } else {
        startNewAdventure();
      }
    },
    tick,
    onModeChange(m) {
      mode = m;
      updateFieldBar();
    },
    onTrustDelta(delta) {
      story.syaoranTrust = Rules.clampTrust(story.syaoranTrust + delta, 1);
      updateHUD(true);
    },
    onCostumeBadgeClick() {
      const cos = getCostumeObj();
      if (!isTomoyoFollowing()) {
        host.showToast(`🎒 현재 착용: ${cos.name} (${cos.passive}) · 먼저 [플라이]를 봉인해 모험을 시작하세요!`);
      } else {
        host.showToast(`🎀 현재 착용: ${cos.name} (${cos.passive}) · 의상 교체와 홍차 회복은 동행 중인 토모요에게!`);
      }
    },
    onLocaleChange() {
      if (!$('bookModal')?.classList.contains('hidden')) openBook(true);
      if (!$('wardrobeModal')?.classList.contains('hidden')) openWardrobe(true);
      updateHUD(true);
      updateFieldBar();
    },
    onKeyDown(code) {
      if (mode !== 'explore' || host.isAnyModalOpen?.()) return;
      if (code === 'KeyX' || code === 'Enter') triggerInteract();
      else if (code.startsWith('Digit') && code.length === 6) castFieldCard(code[5]);
    },
    onCanvasPointer(lx, ly, initial) {
      if (mode !== 'explore' || host.isAnyModalOpen?.()) return;
      if (initial && lx > world.cam.w - 130 && ly < 110) return;
      const wx = lx + world.cam.x;
      const wy = ly + world.cam.y;
      if (initial) {
        const cur = getMap();
        for (const p of toArr(cur.portals)) {
          if (Math.hypot(wx - p.x, wy - p.y) < 44) {
            pendingTarget = { type: 'portal', obj: p };
            player.targetPos = { x: p.x, y: p.y };
            return;
          }
        }
        if (currentMapId === 'house_f1' && wx >= 320 && wx <= 500 && wy >= 245 && wy <= 325) {
          pendingTarget = { type: 'rest_table', obj: { x: 410, y: 335, label: '거실 식탁에서 쉬어가기' } };
          player.targetPos = { x: 410, y: 335 };
          return;
        }
        for (const n of NPCS) {
          if (!isNpcVisible(n)) continue;
          const np = getNpcPos(n);
          if (Math.hypot(wx - np.x, wy - np.y) < 48) {
            pendingTarget = { type: 'npc', obj: { ...n, x: np.x, y: np.y } };
            player.targetPos = { x: np.x, y: np.y };
            return;
          }
        }
        for (const id of CARD_ORDER) {
          if (isCardActiveOnMap(id) && CARDS[id]?.map === currentMapId) {
            const pos = getCardPos(CARDS[id]);
            if (Math.hypot(wx - pos.x, wy - pos.y) < 56) {
              pendingTarget = { type: 'card', obj: { ...CARDS[id], x: pos.x, y: pos.y } };
              player.targetPos = pos;
              return;
            }
          }
        }
        if (!yueDefeated && !memoryMode.active && BOSS_YUE && currentMapId === BOSS_YUE.map && Math.hypot(wx - BOSS_YUE.x, wy - BOSS_YUE.y) < 58) {
          pendingTarget = { type: 'boss', obj: BOSS_YUE };
          player.targetPos = { x: BOSS_YUE.x, y: BOSS_YUE.y };
          return;
        }
        pendingTarget = null;
      }
      player.targetPos = { x: wx, y: wy };
    },
    onInteract: triggerInteract,
    onKeroHint() {
      if (mode !== 'explore') return;
      const next = getNextObjective();
      if (!next) host.showToast('케로: 토모에다 마을이 완전히 평화로워졌어!');
      else if (next.isBoss) host.showToast(`케로: 모든 카드가 모였어! 남쪽 [${BOSS_YUE.zone}]으로 가자!`);
      else if (getCurrentStoryAct() === 1) {
        host.showToast('케로: 먼저 마을 동쪽 [토모에다 초등학교 앞마당]에서 날뛰는 [플라이]부터 봉인하자!');
      } else {
        const tc = next.targetCard || next;
        host.showToast(`케로: [${tc.zone}] 쪽에서 "${tc.rumor}" 같은 기운이 느껴져!`);
      }
    },
    onContinueAfterEnding() {
      mode = 'explore';
      updateFieldBar();
    },
    openBook,
    openWardrobe,
    exitMemoryMode,
    getCurrentMap: getMap,
    getPlayerPos: () => player,
    clearTargetPos() {
      player.targetPos = null;
      pendingTarget = null;
    },
    getSavePayload,
    getSharedState,
    getSlotMeta,
    destroy() {
      Timers.clearAll();
    }
  };
}
