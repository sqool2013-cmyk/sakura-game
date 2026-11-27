/**
 * ============================================================================
 * 카드캡터 3부작 — 제2부 고유 컨트롤러 (chapter2.js) — v.0.2.0
 * - 통합 단일 스토리 앱(index.html)과 연동되는 제2부(사쿠라/체리 카드 편) 모듈
 * - 토모요(지수) 촬영 동행 AI: 모든 실내·야외 맵에서 일정 거리로 동행(회복·의상실 전담)
 * - 1부 해금 의상 ★별빛 리폼(패시브 강화) + 2부 전용 신규 의상 2벌(중복 해금 대사 제거)
 * - 연속 무퇴보 HP/MP 성장(120->145 / 210->324) · 샤오랑 친밀도 상한(Lv.10)
 * - 5~7키 별빛 공명 · 사건 순수 격파 · 수렴 마법진 · X연타 마력 충돌 연동
 * - 제2부 완결 시 제3부(꿈결의 토모에다 · 클리어 카드 편) 막간 시네마틱으로 자연 직결
 * ============================================================================
 */

export function createChapter(host, DATA) {
  const { engines, world, vn, battle, keys } = host;
  const { Timers, Utils, Locale, Art, SoundFX, Rules } = engines;
  const { $, toArr, clamp, cardName, cardRuby } = Utils;

  // --------------------------------------------------------------------------
  // 1. 제2부 데이터 바인딩 & 의상 통합(1부 8벌 리폼 메타 + 2부 신규 2벌)
  // --------------------------------------------------------------------------
  const CARDS = DATA.cards || {};
  const CARD_ORDER = toArr(DATA.cardOrder);
  const MAPS = DATA.maps || {};
  const ZONES = toArr(DATA.zones);
  const NPCS = toArr(DATA.npcs);
  const INCIDENTS = toArr(DATA.incidents).sort((a, b) => (a.order || 0) - (b.order || 0));
  const BOSS_ERIOL = DATA.bossEriol;
  const QUICK_SLOTS = toArr(DATA.fieldQuickSlots);

  const COSTUME_ICONS = {
    sakura_dress: '🌸',
    frog_rain: '🐸',
    cat_thunder: '🐱',
    sky_wing: '🪽',
    alice_maid: '🎀',
    pierrot_magic: '🃏',
    star_royal: '👑',
    pure_angel: '🕊',
    star_opening: '⭐',
    eclipse_cape: '🌙'
  };

  /** 단일 스토리 몰입감을 깨는 "1부~" 메타 문구 자동 자연화 */
  function naturalizeMeta(text) {
    if (typeof text !== 'string' || !text) return text;
    return text
      .replace(/1부에서\s*제일\s*먼저/g, '처음으로')
      .replace(/1부에서\s*처음으로/g, '지난 학기에 처음으로')
      .replace(/1부부터\s*이어진/g, '처음부터 이어져 온')
      .replace(/1부\s*기록\s*연동\s*또는\s*/g, '')
      .replace(/1부\s*클리어\s*계승\s*또는\s*/g, '유에의 심판 돌파 또는 ')
      .replace(/1부\s*계승/g, '지난 학기의 추억');
  }

  const FALLBACK_COSTUMES = toArr(Rules?.DEFAULT_COSTUMES_P1).length
    ? toArr(Rules.DEFAULT_COSTUMES_P1)
    : [{
        id: 'sakura_dress',
        name: '🌸 벚꽃 배틀 드레스',
        icon: '🌸',
        unlockType: 'default',
        unlockHint: '기본 지급 의상',
        dressColor: '#ec4899',
        accentColor: '#fef08a',
        hatType: 'beret',
        hatColor: '#e11d48',
        passive: '최대 MP +5',
        reformedPassive: '★별빛 리폼: 최대 MP +12 · 마법 위력 +5%',
        tomoyoQuote: '별의 지팡이와 가장 잘 어울리는 분홍빛 기본 배틀 의상이에요!'
      }];

  const baseP1Map = new Map(toArr(Rules?.DEFAULT_COSTUMES_P1).map((c) => [c.id, c]));
  const rawCostumes = toArr(DATA.costumes).length ? toArr(DATA.costumes) : FALLBACK_COSTUMES;
  const mergedCostumes = rawCostumes.map((c) => {
    const p1Def = baseP1Map.get(c.id) || {};
    return {
      ...p1Def,
      ...c,
      icon: c.icon || p1Def.icon || COSTUME_ICONS[c.id] || '🌸',
      reformedPassive: c.reformedPassive || p1Def.reformedPassive || `★별빛 리폼: ${c.passive || ''}`,
      unlockHint: naturalizeMeta(c.unlockHint || p1Def.unlockHint || ''),
      tomoyoQuote: naturalizeMeta(c.tomoyoQuote || p1Def.tomoyoQuote || '')
    };
  });
  for (const extra of toArr(Rules?.DEFAULT_COSTUMES_P2_EXTRA)) {
    if (!mergedCostumes.some((c) => c.id === extra.id)) {
      mergedCostumes.push({ ...extra });
    }
  }
  const COSTUMES = mergedCostumes;

  const INCIDENT_COSTUME_REWARD = {
    inc_rain: 'frog_rain',
    inc_penguin: 'sky_wing',
    inc_school: 'alice_maid',
    inc_spinel: 'pierrot_magic',
    inc_ruby: 'eclipse_cape'
  };

  const MAP_GROUPS = {
    house: ['house', 'house_f1', 'house_b1', 'house_f2'],
    house_f1: ['house_f1', 'house_b1', 'house_f2'],
    school: ['school', 'school_f1', 'school_f2', 'school_hall'],
    school_f1: ['school_f1', 'school_f2', 'school_hall'],
    shrine: ['shrine', 'shrine_gate', 'shrine_main', 'shrine_cave'],
    shrine_gate: ['shrine_gate', 'shrine_main', 'shrine_cave']
  };

  // --------------------------------------------------------------------------
  // 2. 제2부 상태 변수
  // --------------------------------------------------------------------------
  let mode = 'explore'; // explore | dialogue | battle | ending
  let sakuraCards = new Set();
  let clearedIncidents = new Set();
  let eriolDefeated = false;
  let shownActs = new Set();
  let currentMapId = 'town';
  let portalCd = 0;
  let encCd = 0;
  let nearbyTarget = null;
  let pendingTarget = null;
  let lastHudSig = '';
  let memoryMode = { active: false, cardId: null, snapshot: null };

  const story = {
    syaoranTrust: 2,
    convertedOrder: [],
    seenMilestones: new Set(),
    metEriol: false,
    costumeId: 'sakura_dress',
    unlockedCostumes: new Set(['sakura_dress', 'star_opening']),
    reformedCostumes: new Set()
  };

  const tomoyoPos = { x: 455, y: 485 };

  const part1Link = {
    linked: false,
    firstCard: '',
    lastCard: '',
    syaoranTrust: 0,
    yueDefeated: false,
    hadMirror: false
  };

  const player = {
    x: 385,
    y: 465,
    dir: 'down',
    hp: 120,
    maxHp: 120,
    mp: 210,
    maxMp: 210,
    lv: 1,
    mult: 1.55,
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
    jumpX: CARDS.jump?.x || 515,
    jumpY: CARDS.jump?.y || 935,
    jumpHop: 0,
    jumpBind: 0,
    glowX: CARDS.glow?.x || 790,
    glowY: CARDS.glow?.y || 545,
    penguinX: 355,
    penguinY: 850,
    mirrorTrail: [],
    // 학교 1층 도서실(illusion 위치 225, 225 주변) 가짜 환영 분신
    illusionDecoys: [
      { x: 145, y: 205, name: '토모요?', hair: '#3b0764', dress: '#c084fc', popped: false },
      { x: 315, y: 215, name: '케로?', hair: '#facc15', dress: '#fde047', popped: false }
    ]
  };

  // --------------------------------------------------------------------------
  // 3. 핵심 헬퍼 · 1부 공유 상태 계승 · 최종장 해금 조건 · 성장 곡선
  // --------------------------------------------------------------------------
  const getMap = () => MAPS[currentMapId] || MAPS.town;
  const getNonFinalIds = () => CARD_ORDER.filter((id) => !CARDS[id]?.finalOnly);

  const isFinalUnlocked = () => {
    if (eriolDefeated || memoryMode.active) return false;
    const allIncCleared = INCIDENTS.every((inc) => clearedIncidents.has(inc.id));
    const allNonFinalAwakened = getNonFinalIds().every((id) => sakuraCards.has(id));
    return allIncCleared && allNonFinalAwakened;
  };

  const isCardActiveOnMap = (id) => {
    if (memoryMode.active) return memoryMode.cardId === id;
    const c = CARDS[id];
    if (!c || c.finalOnly) return false;
    return !sakuraCards.has(id);
  };

  const isIncidentActive = (inc) => !memoryMode.active && !clearedIncidents.has(inc.id);
  const getIncidentPos = (inc) => (
    inc.id === 'inc_penguin' ? { x: anomaly.penguinX, y: anomaly.penguinY } : { x: inc.x, y: inc.y }
  );
  const getCardPos = (c) => (
    c.id === 'jump'
      ? { x: anomaly.jumpX, y: anomaly.jumpY }
      : c.id === 'glow'
      ? { x: anomaly.glowX, y: anomaly.glowY }
      : { x: c.x, y: c.y }
  );

  function countTargetsInMap(mid) {
    const targets = (currentMapId === 'town' && MAP_GROUPS[mid]) ? MAP_GROUPS[mid] : [mid];
    const incCnt = INCIDENTS.filter((inc) => isIncidentActive(inc) && targets.includes(inc.map)).length;
    const cardCnt = CARD_ORDER.filter((id) => isCardActiveOnMap(id) && targets.includes(CARDS[id]?.map)).length;
    return incCnt + cardCnt;
  }

  const getCostumeObj = () => COSTUMES.find((c) => c.id === story.costumeId) || COSTUMES[0];
  const getCostumeIcon = (cos) => cos?.icon || COSTUME_ICONS[cos?.id] || '🌸';
  const isCostumeReformed = (cosId = story.costumeId) => story.reformedCostumes.has(cosId);

  /** 토모요(지수) 동행 좌표 및 추적 AI (실내·야외 모든 맵에서 촬영 거리 유지) */
  function getNpcPos(n) {
    if (n.id === 'tomoyo') return { x: tomoyoPos.x, y: tomoyoPos.y };
    return { x: n.x, y: n.y };
  }

  function placeTomoyoNearPlayer() {
    const cur = getMap();
    const ox = player.dir === 'right' ? -64 : 64;
    const oy = player.dir === 'down' ? -46 : 46;
    tomoyoPos.x = clamp(player.x + ox, 44, (cur?.w || 800) - 44);
    tomoyoPos.y = clamp(player.y + oy, 44, (cur?.h || 600) - 44);
  }

  function updateTomoyoFollow(dt) {
    const desiredX = player.x + (player.dir === 'right' ? -68 : player.dir === 'left' ? 68 : -54);
    const desiredY = player.y + (player.dir === 'down' ? -48 : player.dir === 'up' ? 54 : -34);
    const distToPlayer = Math.hypot(player.x - tomoyoPos.x, player.y - tomoyoPos.y);
    const dx = desiredX - tomoyoPos.x;
    const dy = desiredY - tomoyoPos.y;
    const distToSpot = Math.hypot(dx, dy);
    const cur = getMap();

    if (distToPlayer > 76 && distToSpot > 6) {
      const spd = Math.min(getMoveSpeed() * 0.94, Math.max(130, distToSpot * 3.4));
      tomoyoPos.x = clamp(tomoyoPos.x + (dx / distToSpot) * spd * dt, 36, (cur?.w || 800) - 36);
      tomoyoPos.y = clamp(tomoyoPos.y + (dy / distToSpot) * spd * dt, 36, (cur?.h || 600) - 36);
    } else if (distToPlayer < 46 && distToPlayer > 1) {
      const push = 42 * dt;
      tomoyoPos.x = clamp(tomoyoPos.x - ((player.x - tomoyoPos.x) / distToPlayer) * push, 36, (cur?.w || 800) - 36);
      tomoyoPos.y = clamp(tomoyoPos.y - ((player.y - tomoyoPos.y) / distToPlayer) * push, 36, (cur?.h || 600) - 36);
    }
  }

  /**
   * 원작 동일체 및 최종장 가시성 방어 + 토모요 전 맵 동행:
   * - 토모요는 사쿠라와 함께 모든 실내·야외 맵에 동행
   * - 마을 맵에 유키토(청명)가 존재할 때 중복 유에 NPC 숨김
   * - 최종장 개방 시 학교 앞 에리오르 NPC 숨김 (시계탑 최종 보스로 이동)
   */
  function isNpcVisible(n) {
    if (n.id === 'tomoyo') return true;
    if (n.map !== currentMapId) return false;
    if (n.id === 'yue' && NPCS.some((x) => x.id === 'yukito')) return false;
    if (n.id === 'eriol' && isFinalUnlocked()) return false;
    return true;
  }

  /** 유키토(청명) 반투명도 계산 (0.38 -> 1.0, 변환 진행도에 비례해 선명해짐!) */
  function getYukitoAlpha() {
    if (eriolDefeated) return 1.0;
    const ratio = clamp(sakuraCards.size / Math.max(1, CARD_ORDER.length), 0, 1);
    return Number((0.38 + ratio * 0.62).toFixed(2));
  }

  /** 단일 캠페인 공유 상태(1부 해금 의상 · 리폼 의상 · 친밀도 · 추억) 계승 반영 */
  function applySharedState(shared) {
    if (!shared || typeof shared !== 'object') return;
    toArr(shared.unlockedCostumes).forEach((cid) => story.unlockedCostumes.add(cid));
    toArr(shared.reformedCostumes).forEach((cid) => story.reformedCostumes.add(cid));
    story.unlockedCostumes.add('star_opening');
    if (shared.costumeId && COSTUMES.some((c) => c.id === shared.costumeId)) {
      story.costumeId = shared.costumeId;
    }
    const trust = Rules.clampTrust(Number(shared.syaoranTrust) || 0, 2);
    if (trust > story.syaoranTrust) story.syaoranTrust = trust;

    if (shared.part1Cleared || shared.firstSealedCard || shared.hadMirror) {
      part1Link.linked = true;
      part1Link.firstCard = shared.firstSealedCard || part1Link.firstCard || 'fly';
      part1Link.lastCard = shared.lastSealedCard || part1Link.lastCard || 'light';
      part1Link.syaoranTrust = Math.max(part1Link.syaoranTrust, trust);
      part1Link.yueDefeated = !!shared.part1Cleared || part1Link.yueDefeated;
      part1Link.hadMirror = !!shared.hadMirror || part1Link.hadMirror;
    }
  }

  function recalcPower(healBonus = false) {
    const prevMaxHp = player.maxHp;
    const prevMaxMp = player.maxMp;
    const stats = Rules.calcStats({
      part: 2,
      progressCount: sakuraCards.size,
      total: CARD_ORDER.length || 19,
      costumeId: story.costumeId,
      isReformed: isCostumeReformed(),
      part1Linked: part1Link.linked,
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
    let s = 245 + (sakuraCards.has('jump') ? 22 : 0);
    s *= Rules.getCostumeBonuses(story.costumeId, isCostumeReformed()).speedMult || 1;
    if (buffs.fly > 0 || buffs.flyLand) s *= (sakuraCards.has('fly') ? 1.7 : 1.55);
    return s;
  }

  /** 연속 성장(HP 120~145 / 배율 1.55~2.15)에 맞춘 제2부 전투 적 저항력 균형 보정 */
  function getScaledBattleTarget(target) {
    if (!target) return target;
    if (target.isBoss) return { ...target, maxHp: Math.round((target.maxHp || 720) * 1.18) };
    if (target.isIncident) return { ...target, maxHp: Math.round((target.maxHp || 280) * 1.25) };
    return { ...target, maxHp: Math.round((target.maxHp || 180) * 1.15) };
  }

  function resetAnomalyState() {
    anomaly.jumpX = CARDS.jump?.x || 515;
    anomaly.jumpY = CARDS.jump?.y || 935;
    anomaly.jumpHop = 0;
    anomaly.jumpBind = 0;
    anomaly.glowX = CARDS.glow?.x || 790;
    anomaly.glowY = CARDS.glow?.y || 545;
    anomaly.penguinX = 355;
    anomaly.penguinY = 850;
    anomaly.mirrorTrail = [];
    anomaly.illusionDecoys.forEach((d) => { d.popped = false; });
  }

  function getZoneName() {
    if (currentMapId !== 'town') return getMap()?.name || '별빛의 토모에다';
    for (const z of ZONES) {
      if (player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h) {
        return z.name;
      }
    }
    return '별빛의 토모에다';
  }

  function findPortalToward(targetMap) {
    const portals = toArr(getMap()?.portals);
    return portals.find((p) => p.targetMap === targetMap)
      || portals.find((p) => MAP_GROUPS[p.targetMap]?.includes(targetMap))
      || portals.find((p) => p.targetMap === 'town')
      || portals[0];
  }

  function getNextObjective() {
    if (memoryMode.active && CARDS[memoryMode.cardId]) {
      const mc = CARDS[memoryMode.cardId];
      const pos = getCardPos(mc);
      return { ...mc, x: pos.x, y: pos.y };
    }

    // 1순위: 기묘한 5대 사건
    const remInc = INCIDENTS.filter(isIncidentActive);
    if (remInc.length > 0) {
      const here = remInc.filter((inc) => inc.map === currentMapId);
      if (here.length > 0) {
        let best = here[0];
        let bestD = Infinity;
        for (const inc of here) {
          const p = getIncidentPos(inc);
          const d = Math.hypot(p.x - player.x, p.y - player.y);
          if (d < bestD) { bestD = d; best = { ...inc, isIncident: true, x: p.x, y: p.y }; }
        }
        return best;
      }
      const ti = remInc[0];
      const pt = findPortalToward(ti.map);
      return pt ? { isPortal: true, x: pt.x, y: pt.y, zone: ti.zone, targetIncident: ti } : { ...ti, isIncident: true };
    }

    // 2순위: 남은 비최종 별빛 공명 지점 (17장 완료까지)
    const remCards = getNonFinalIds().filter((id) => !sakuraCards.has(id)).map((id) => CARDS[id]);
    if (remCards.length > 0) {
      const here = remCards.filter((c) => c.map === currentMapId);
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
      const tc = remCards[0];
      const pt = findPortalToward(tc.map);
      return pt ? { isPortal: true, x: pt.x, y: pt.y, zone: tc.zone, targetCard: tc } : tc;
    }

    // 3순위: 최종장 에리오르 결전
    if (!eriolDefeated && BOSS_ERIOL) {
      if (currentMapId !== 'town') {
        const pt = findPortalToward('town');
        return pt ? { isPortal: true, isBoss: true, x: pt.x, y: pt.y, zone: BOSS_ERIOL.zone, targetCard: BOSS_ERIOL } : BOSS_ERIOL;
      }
      return BOSS_ERIOL;
    }
    return null;
  }

  function showChapterOnce(sub, title) {
    if (shownActs.has(sub)) return;
    shownActs.add(sub);
    host.showChapterBanner(sub, title);
  }

  // --------------------------------------------------------------------------
  // 4. 멀티 세이브 슬롯 페이로드 · 공유 상태 · 슬롯 메타 · 자동 저장
  // --------------------------------------------------------------------------
  function getUnlockedCostumeList() {
    const unlocked = new Set(story.unlockedCostumes);
    COSTUMES.forEach((cos) => {
      if (Rules.isCostumeUnlocked(cos, {
        sakuraCards,
        clearedIncidents,
        part1Linked: part1Link.linked,
        bossCleared: eriolDefeated,
        unlockedCostumes: unlocked
      })) {
        unlocked.add(cos.id);
      }
    });
    return Array.from(unlocked);
  }

  function getSharedState() {
    return {
      costumeId: story.costumeId,
      unlockedCostumes: getUnlockedCostumeList(),
      reformedCostumes: Array.from(story.reformedCostumes),
      syaoranTrust: Rules.clampTrust(story.syaoranTrust, 2),
      part1Cleared: part1Link.yueDefeated,
      part2Cleared: eriolDefeated,
      firstSealedCard: part1Link.firstCard,
      lastSealedCard: part1Link.lastCard,
      hadMirror: part1Link.hadMirror
    };
  }

  function getSlotMeta() {
    return {
      zoneName: getZoneName(),
      summary: eriolDefeated
        ? `최종장 돌파 · ★각성 ${sakuraCards.size}/${CARD_ORDER.length} · Lv.${player.lv}`
        : `사건 ${clearedIncidents.size}/${INCIDENTS.length} · ★각성 ${sakuraCards.size}/${CARD_ORDER.length} · Lv.${player.lv}`
    };
  }

  function getSavePayload() {
    const s = memoryMode.active && memoryMode.snapshot ? memoryMode.snapshot : null;
    return {
      version: 5,
      part: 2,
      eriolDefeated: s ? s.eriolDefeated : eriolDefeated,
      currentMapId: s ? s.currentMapId : currentMapId,
      sakuraCards: Array.from(s ? s.sakuraCards : sakuraCards),
      clearedIncidents: Array.from(s ? s.clearedIncidents : clearedIncidents),
      shownActs: Array.from(shownActs),
      story: {
        syaoranTrust: Rules.clampTrust(story.syaoranTrust, 2),
        convertedOrder: story.convertedOrder.slice(),
        seenMilestones: Array.from(story.seenMilestones),
        metEriol: !!story.metEriol,
        costumeId: story.costumeId,
        unlockedCostumes: getUnlockedCostumeList(),
        reformedCostumes: Array.from(story.reformedCostumes)
      },
      part1Link: { ...part1Link },
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
    $('memoryBanner')?.classList.add('hidden');
    $('endingBox')?.classList.add('hidden');

    sakuraCards = new Set(toArr(saved.sakuraCards));
    clearedIncidents = new Set(toArr(saved.clearedIncidents));
    eriolDefeated = !!saved.eriolDefeated;
    shownActs = new Set(toArr(saved.shownActs));

    const st = saved.story || {};
    story.syaoranTrust = Rules.clampTrust(Math.max(2, Number(st.syaoranTrust) || 2), 2);
    story.convertedOrder = toArr(st.convertedOrder);
    story.seenMilestones = new Set(toArr(st.seenMilestones));
    story.metEriol = !!st.metEriol;
    story.costumeId = st.costumeId || 'sakura_dress';
    story.unlockedCostumes = new Set(['sakura_dress', 'star_opening', ...toArr(st.unlockedCostumes)]);
    story.reformedCostumes = new Set(toArr(st.reformedCostumes));

    if (saved.part1Link && saved.part1Link.linked) {
      Object.assign(part1Link, saved.part1Link);
    }
    if (shared) applySharedState(shared);

    currentMapId = MAPS[saved.currentMapId] ? saved.currentMapId : 'town';
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
    placeTomoyoNearPlayer();
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
    const sig = `${Locale.getMode()}|${player.lv}|${Math.ceil(player.hp)}|${player.maxHp}|${Math.ceil(player.mp)}|${player.maxMp}|${sakuraCards.size}|${clearedIncidents.size}|${story.syaoranTrust}|${curCos.id}|${isCostumeReformed()}|${zn}|${eriolDefeated}|${memoryMode.active}`;
    if (!force && sig === lastHudSig) return;
    lastHudSig = sig;

    if ($('hudCostumeBadge')) $('hudCostumeBadge').textContent = getCostumeIcon(curCos);
    if ($('hudMagicLv')) $('hudMagicLv').textContent = `★ 별마력 Lv.${player.lv}`;
    if ($('hudTrustBadge')) $('hudTrustBadge').textContent = `⚡친밀 ${story.syaoranTrust}/10`;
    if ($('hudHpBar')) $('hudHpBar').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    if ($('hudMpBar')) $('hudMpBar').style.width = `${Math.max(0, (player.mp / player.maxMp) * 100)}%`;
    if ($('hudHpNum')) $('hudHpNum').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    if ($('hudMpNum')) $('hudMpNum').textContent = `${Math.ceil(player.mp)}/${player.maxMp}`;
    if ($('hudCardCount')) $('hudCardCount').textContent = `★ ${sakuraCards.size}/${CARD_ORDER.length}`;
    if ($('hudZone')) $('hudZone').textContent = Locale.t(zn);

    const remInc = INCIDENTS.filter(isIncidentActive).length;
    const remNonFinal = getNonFinalIds().filter((id) => !sakuraCards.has(id)).length;

    if (memoryMode.active) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'STAR MEMORY REPLAY';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${cardName(CARDS[memoryMode.cardId])}]의 별빛 각성 시련을 다시 체험 중`);
    } else if (remInc > 0) {
      if ($('hudActLabel')) $('hudActLabel').textContent = `PART II · INCIDENTS (${INCIDENTS.length - remInc}/${INCIDENTS.length})`;
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`토모에다 곳곳의 기묘한 사건 돌파 (남은 사건 ${remInc}곳 · ★변환 ${sakuraCards.size}/19)`);
    } else if (remNonFinal > 0) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART II · STAR RESONANCE';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`남은 별빛 공명 지점 ${remNonFinal}곳의 카드를 사쿠라 카드로 변환하라`);
    } else if (!eriolDefeated && BOSS_ERIOL) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART II · FINAL TRIAL · ETERNAL NIGHT';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${BOSS_ERIOL.zone}]에서 에리오르의 최종 시련에 맞서 다크와 라이트를 깨워라!`);
    } else {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART II · GRAND FINALE';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t('열아홉 장의 사쿠라 카드가 영원한 별빛으로 피어났다');
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
      const isSak = sakuraCards.has(s.id);
      const onCd = s.id === 'glow' && buffs.glowCd > 0 && buffs.glow <= 0;
      const active = (s.id === 'fly' && (buffs.fly > 0 || buffs.flyLand))
        || (s.id === 'light' && buffs.light > 0)
        || (s.id === 'glow' && buffs.glow > 0)
        || (s.id === 'windy' && buffs.wind > 0)
        || (s.id === 'shield' && buffs.shield);

      const btn = document.createElement('button');
      btn.disabled = onCd;
      btn.title = onCd ? `대기 중 (${Math.ceil(buffs.glowCd)}s)` : `${Locale.t(s.desc)} (MP ${s.mp})`;
      btn.className = `shrink-0 px-2 py-1 rounded-xl border text-[11px] font-story flex items-center gap-1 transition ${
        onCd
          ? 'bg-black/40 border-white/10 text-slate-500'
          : active
          ? 'bg-pink-500/45 border-yellow-200 text-yellow-100 shadow-[0_0_10px_rgba(244,114,182,0.55)]'
          : isSak
          ? 'bg-fuchsia-900/75 hover:bg-fuchsia-800/85 border-pink-300/75 text-pink-100'
          : 'bg-purple-950/80 hover:bg-purple-800/80 border-yellow-400/40 text-amber-100'
      }`;
      btn.innerHTML = `<span class="text-[9px] font-mono text-yellow-200">[${s.key}]</span><span>${s.icon}</span><span class="font-bold">${s.label}${isSak ? '★' : ''}${onCd ? ` ${Math.ceil(buffs.glowCd)}s` : ''}</span>`;
      if (!onCd) {
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
    if (!s) return;
    if (s.id === 'glow' && buffs.glowCd > 0) return host.showToast(`글로우 준비 중 (${Math.ceil(buffs.glowCd)}초 남음)`);
    if (player.mp < s.mp) return host.showToast(`MP가 부족합니다! (필요 MP ${s.mp})`);
    const isSak = sakuraCards.has(s.id);

    if (s.id === 'fly') {
      player.mp -= s.mp;
      buffs.fly = 12;
      buffs.flyLand = false;
      SoundFX.magic();
      world.burst(player.x, player.y, isSak ? '#f9a8d4' : '#fef08a', 24);
      host.showToast(`플라이${isSak ? '★' : ''} 해방! 12초간 건물·호수·장애물 위를 자유롭게 비행합니다!`);
    } else if (s.id === 'light') {
      player.mp -= s.mp;
      buffs.light = 16;
      SoundFX.heal();
      world.burst(player.x, player.y, '#fef08a', 26);
      if (isCardActiveOnMap('illusion') && CARDS.illusion?.map === currentMapId) {
        anomaly.illusionDecoys.forEach((d) => { d.popped = true; });
      }
      const next = getNextObjective();
      if (next) world.guideBeam(player.x, player.y, next.x, next.y, '#fef08a');
      host.showToast('라이트 해방! 어둠과 환영을 걷어내고 별빛 길잡이를 쏩니다!');
    } else if (s.id === 'glow') {
      if (player.mp >= player.maxMp) return host.showToast('MP가 이미 가득 차 있습니다!');
      buffs.glow = 7;
      buffs.glowCd = 16;
      buffs.glowAcc = 0;
      SoundFX.heal();
      world.burst(player.x, player.y, '#bef264', 24);
      host.showToast('글로우 해방! 7초간 반딧불이가 MP를 서서히 회복합니다!');
    } else if (s.id === 'flower') {
      if (player.hp >= player.maxHp) return host.showToast('체력이 이미 가득 차 있습니다!');
      player.mp -= s.mp;
      const amt = isSak ? 58 : 42;
      const rec = Math.min(player.maxHp - player.hp, amt);
      player.hp += rec;
      SoundFX.heal();
      world.burst(player.x, player.y, '#f9a8d4', 26);
      host.showToast(`플라워${isSak ? '★' : ''} 해방! 벚꽃비가 내려 HP를 ${rec} 회복했습니다!`);
    } else if (s.id === 'windy') {
      player.mp -= s.mp;
      buffs.wind = 11;
      SoundFX.magic();
      world.burst(player.x, player.y, '#7dd3fc', 24);
      if (currentMapId === 'town' && isCardActiveOnMap('jump') && Math.hypot(player.x - anomaly.jumpX, player.y - anomaly.jumpY) < 260) {
        anomaly.jumpBind = 5.5;
        host.showToast('윈디 해방! 도망치던 점프 공명을 5초간 포박했습니다!');
      } else {
        host.showToast('윈디 해방! 폭우·수벽 방해 무효화 & 다음 전투 선제 충격!');
      }
    } else if (s.id === 'shield') {
      if (buffs.shield) return host.showToast('이미 별빛 결계가 펼쳐져 있습니다!');
      player.mp -= s.mp;
      buffs.shield = true;
      SoundFX.magic();
      world.burst(player.x, player.y, '#fbcfe8', 22);
      host.showToast('실드 해방! 별빛 결계를 두른 채 다음 전투를 시작합니다!');
    }
    updateHUD(true);
    updateFieldBar();
  }

  // --------------------------------------------------------------------------
  // 6. 사쿠라/체리 북 · 기억 돌아보기 · 8벌 마법 의상실 (1부 해금 의상 계승!)
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
        sakuraCards: new Set(sakuraCards),
        clearedIncidents: new Set(clearedIncidents),
        eriolDefeated
      };
    }
    memoryMode.active = true;
    memoryMode.cardId = cardId;
    resetAnomalyState();

    currentMapId = MAPS[c.map] ? c.map : 'town';
    const cur = getMap();
    player.x = clamp(c.x - 90, 60, cur.w - 60);
    player.y = clamp(c.y + 60, 60, cur.h - 60);
    kero.x = player.x - 26;
    kero.y = player.y - 18;
    placeTomoyoNearPlayer();
    player.targetPos = null;
    pendingTarget = null;
    encCd = 1.2;

    if ($('memoryBannerText')) $('memoryBannerText').textContent = Locale.t(`✨ [${cardName(c)}] 별빛 각성 기억 회상 중`);
    $('memoryBanner')?.classList.remove('hidden');
    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
    host.showToast(`✨ [${cardName(c)}]를 사쿠라 카드로 깨워내던 그날의 기억으로 돌아왔습니다!`);
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
      sakuraCards = s.sakuraCards;
      clearedIncidents = s.clearedIncidents;
      eriolDefeated = s.eriolDefeated;
      kero.x = player.x - 26;
      kero.y = player.y - 18;
      placeTomoyoNearPlayer();
    }
    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
    host.showToast('현재의 별빛 토모에다 마을로 돌아왔습니다.');
  }

  function openBook(silent = false) {
    host.openBookModal({
      title: 'THE SAKURA BOOK',
      sub: `사쿠라 카드 각성 진행도: ★ ${sakuraCards.size}/${CARD_ORDER.length} · 각성 완료 카드는 [✨ 기억 돌아보기] 가능 · 닫기(Z)`,
      silent,
      renderGrid(grid) {
        CARD_ORDER.forEach((id) => {
          const c = CARDS[id];
          if (!c) return;
          const isSak = sakuraCards.has(id);
          const badge = isSak
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/35 text-pink-100 border border-pink-300/75">★ ${Locale.isKr() ? '체리' : '사쿠라'}</span>`
            : c.finalOnly
            ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/35 text-sky-200 border border-sky-300/50">최종장</span>'
            : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/45">크로우</span>';
          const mpDisp = isSak ? Math.max(6, c.mpCost - 2) : c.mpCost;
          const div = document.createElement('div');
          div.className = `rounded-2xl p-2.5 flex flex-col items-center text-center border transition ${
            isSak ? 'bg-gradient-to-b from-fuchsia-950/90 to-rose-950/85 border-pink-300/80 shadow-lg' : 'bg-black/45 border-yellow-500/30 opacity-85'
          }`;
          div.innerHTML = `
            <div class="w-24 h-36 mb-2">${Art.getCard(c, isSak)}</div>
            <div class="flex items-center gap-1 mb-0.5"><span class="font-story font-bold text-sm ${isSak ? 'text-pink-200' : 'text-yellow-200'}">${cardRuby(c)}</span>${badge}</div>
            <div class="text-[11px] ${isSak ? 'text-yellow-200' : 'text-slate-300'} font-semibold">${Locale.t(c.skillName)} (MP ${mpDisp})${isSak ? ' ★공명' : ''}</div>
            <p class="text-[10px] text-purple-100/85 font-story mt-1 mb-2 leading-snug flex-1">${Locale.t(isSak ? c.desc : `${DATA.mapAreaLabels?.[c.map] || ''} · ${c.rumor || ''}`)}</p>
            ${isSak
              ? `<button data-replay="${id}" class="w-full py-1.5 rounded-xl bg-pink-600/45 hover:bg-pink-500/65 border border-pink-200/70 text-pink-50 text-[11px] font-story font-bold transition">✨ 기억 돌아보기</button>`
              : `<div class="w-full py-1 rounded-xl bg-black/35 border border-white/10 text-[10px] text-amber-200/85 font-story">${Locale.t(c.finalOnly ? '최종장 동시 각성' : (c.zone || '전투 실시간 ★변환'))}</div>`}`;
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
            sakuraCards,
            clearedIncidents,
            part1Linked: part1Link.linked,
            bossCleared: eriolDefeated,
            unlockedCostumes: story.unlockedCostumes
          });
          const reformed = story.reformedCostumes.has(cos.id);
          const equipped = story.costumeId === cos.id;
          const passiveTxt = Rules.getCostumePassiveLabel(cos, reformed);
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
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-story font-bold text-sm text-yellow-200 truncate">${Locale.t(cos.name)}</span>
                  ${reformed ? '<span class="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-400/25 border border-yellow-300 text-[9px] font-bold text-yellow-200">★리폼</span>' : ''}
                </div>
                <span class="w-4 h-4 shrink-0 rounded-full border border-white/70" style="background:${cos.dressColor}"></span>
              </div>
              <div class="text-xs font-bold ${reformed ? 'text-yellow-200' : 'text-emerald-300'} mb-1">✦ ${Locale.t(passiveTxt)}</div>
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
            const curCos = getCostumeObj();
            host.showToast(`🎀 [${curCos.name}]${isCostumeReformed() ? ' ★별빛 리폼' : ''} 착용 완료!`);
          });
        });
      }
    });
  }

  // --------------------------------------------------------------------------
  // 7. 의상 신규 해금 vs ★별빛 리폼 분기 · 마일스톤 · 사건 돌파 · NPC 대화
  // --------------------------------------------------------------------------
  /** 이미 보유한 1부 의상은 '★별빛 리폼(패시브 강화)'으로, 미보유 의상은 신규 해금으로 분기 */
  function grantOrReformCostume(cosId, contextLabel = '') {
    const cos = COSTUMES.find((c) => c.id === cosId);
    if (!cos) return null;

    const alreadyOwned = story.unlockedCostumes.has(cosId);
    if (alreadyOwned) {
      if (story.reformedCostumes.has(cosId)) return null;
      story.reformedCostumes.add(cosId);
      const upgraded = Rules.getCostumePassiveLabel(cos, true);
      return {
        speaker: '토모요',
        role: 'COSTUME DESIGNER',
        avatar: 'tomoyo',
        mood: 'happy',
        text: `${contextLabel ? `${contextLabel} ` : ''}이미 소중히 간직하고 계신 [${cos.name}]에 황금 별실을 더해 ★별빛 리폼으로 강화해 드렸어요! (${upgraded})`
      };
    }

    story.unlockedCostumes.add(cosId);
    return {
      speaker: '토모요',
      role: 'COSTUME DESIGNER',
      avatar: 'tomoyo',
      mood: 'happy',
      text: `${contextLabel ? `${contextLabel} ` : ''}새 마법 의상 [${cos.name}]을(를) 완성해 두었답니다! 필요하실 때 제게 말씀해 주세요!`
    };
  }

  function collectPendingMilestones() {
    const out = [];
    const ms = DATA?.dialogues?.milestones || {};
    if (sakuraCards.size >= 5 && !story.seenMilestones.has('m5') && ms.m5) {
      story.seenMilestones.add('m5');
      showChapterOnce('PART II · ACT II', '보이지 않는 시선');
      // m5의 중복 의상 해금 문구를 제거하고 보유 여부에 따라 ★별빛 리폼 또는 신규 해금 대사로 교체
      const filteredM5 = toArr(ms.m5).filter((ln) => !String(ln?.text || '').includes('의상실에'));
      const royalLine = grantOrReformCostume('star_royal', '벌써 다섯 장이나 사쿠라 카드로 깨워내셨군요!');
      if (royalLine) out.push(royalLine);
      out.push(...filteredM5);
    }
    if (sakuraCards.size >= 10 && !story.seenMilestones.has('m10') && ms.m10) {
      story.seenMilestones.add('m10');
      showChapterOnce('PART II · ACT III', '별빛의 공명');
      out.push(...toArr(ms.m10));
    }
    if (getNonFinalIds().every((id) => sakuraCards.has(id)) && !story.seenMilestones.has('m17') && ms.m17) {
      story.seenMilestones.add('m17');
      showChapterOnce('FINAL TRIAL · ETERNAL NIGHT', '영원한 어둠과 별빛 여명');
      out.push(...toArr(ms.m17));
    }
    return out;
  }

  /** 배틀 도중 실시간 ★ 사쿠라/체리 카드 각성 성공 시 즉시 반영 */
  function handleLiveCardConverted(c) {
    if (!c || memoryMode.active) return;
    if (!sakuraCards.has(c.id)) {
      sakuraCards.add(c.id);
      if (!story.convertedOrder.includes(c.id)) story.convertedOrder.push(c.id);
      if (c.id === 'thunder' && !story.reformedCostumes.has('cat_thunder')) {
        if (story.unlockedCostumes.has('cat_thunder')) story.reformedCostumes.add('cat_thunder');
        else story.unlockedCostumes.add('cat_thunder');
      }
      recalcPower(true);
      updateHUD(true);
      updateFieldBar();
      autoSave(`${cardName(c)}★ 각성`);
      host.showToast(`★ [${cardName(c)}] 사쿠라 카드로 실시간 각성 완료! (★ ${sakuraCards.size}/19)`);
    }
  }

  function finishIncidentClear(inc) {
    // 의상 보유 여부 판정 후 사건 완료 기록
    const rewardCosId = INCIDENT_COSTUME_REWARD[inc.id];
    const costumeLine = rewardCosId ? grantOrReformCostume(rewardCosId) : null;

    clearedIncidents.add(inc.id);
    encCd = 1.2;
    recalcPower(true);
    updateHUD(true);
    updateFieldBar();
    autoSave(`${inc.kr} 돌파`);

    // 기존 JSON의 중복 의상 해금 멘트만 정제하고 동적 해금/★리폼 멘트로 교체
    const rawClear = toArr(inc.clear).map((ln) => {
      if (!ln || typeof ln.text !== 'string') return ln;
      const cleaned = ln.text
        .replace(/의상실에[^!.]*(준비해 두었답니다|해금되었답니다|준비해 줬대)[!.]?/g, '')
        .replace(/토모요도\s*$/g, '')
        .trim();
      return cleaned ? { ...ln, text: naturalizeMeta(cleaned) } : null;
    }).filter(Boolean);

    const lines = rawClear.slice();
    if (costumeLine) lines.push(costumeLine);
    lines.push(...collectPendingMilestones());
    if (isFinalUnlocked() && !story.seenMilestones.has('final_ready') && BOSS_ERIOL) {
      story.seenMilestones.add('final_ready');
      lines.push({ speaker: '유에', role: 'MOON GUARDIAN', avatar: 'yue', mood: 'serious', text: `모든 사건과 열일곱 장의 별빛이 모였다! 남쪽 [${BOSS_ERIOL.zone}]에서 에리오르의 영원한 어둠이 기다리고 있어!` });
    }
    vn.start(lines);
  }

  function finishResonanceTransform(c) {
    if (memoryMode.active) {
      vn.start([{ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `[${cardName(c)}]가 분홍빛 별빛으로 피어나던 순간, 다시 봐도 감동이야! 이제 원래 마을로 돌아갈까?` }], exitMemoryMode);
      return;
    }

    sakuraCards.add(c.id);
    if (!story.convertedOrder.includes(c.id)) story.convertedOrder.push(c.id);
    recalcPower(true);
    encCd = 1.0;
    updateHUD(true);
    updateFieldBar();
    autoSave(`${cardName(c)}★ 변환`);

    const lines = [
      { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'happy', text: c.postQuote || `[${cardName(c)}]가 사쿠라 카드로 다시 태어났어!` },
      { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `별의 마력이 한층 깊어졌어! (★ 별마력 Lv.${player.lv} · 최대 HP ${player.maxHp} · 최대 MP ${player.maxMp})` }
    ];
    lines.push(...collectPendingMilestones());
    if (isFinalUnlocked() && !story.seenMilestones.has('final_ready') && BOSS_ERIOL) {
      story.seenMilestones.add('final_ready');
      lines.push({ speaker: '유에', role: 'MOON GUARDIAN', avatar: 'yue', mood: 'serious', text: `드디어 모든 준비가 끝났다! 남쪽 [${BOSS_ERIOL.zone}]에서 에리오르와 마지막 결전을 치르자!` });
    }
    vn.start(lines);
  }

  /** 제2부 완결 -> 제3부(클리어 카드 편) 막간 시네마틱 전환 호출 */
  function openPart3Interlude() {
    mode = 'ending';
    updateFieldBar();
    const f = CARDS[story.convertedOrder[0] || 'windy'];
    host.transitionToNextAct(3, {
      icon: '💎',
      sub: 'ACT II COMPLETE · INTERLUDE TO PART III',
      title: '별빛이 물러가고, 벚꽃 흩날리는 중학교 입학식',
      body:
        `<b>[${cardName(f)}]★</b>부터 마지막 <b>[다크]★ · [라이트]★</b> 동시 각성까지 열아홉 장의 사쿠라 카드를 모두 피워내고, 에리오르의 마지막 시련을 넘어선 사쿠라.<br/><br/>` +
        `이듬해 봄, 만개한 벚꽃 아래 <b>토모에다 중학교</b>에 입학한 사쿠라는 홍콩에서 돌아온 <b>샤오랑</b>과 꿈에 그리던 재회를 맞습니다.<br/>` +
        `하지만 신비로운 꿈을 꾼 다음 날 아침, 소중한 카드들이 모두 투명하게 변해 버리고 손안에는 새로운 <b>꿈의 열쇠</b>가 쥐어지는데—<br/><br/>` +
        `<span class="text-sky-200 text-xs font-bold">💎 1·2부 의상(★별빛 리폼 포함) · HP/MP · 샤오랑 친밀도(${story.syaoranTrust}) · 추억이 모두 제3부로 이어집니다!</span>`,
      buttonLabel: '💎 중학교 입학식(제3부)으로 계속하기 (X)',
      act2Payload: getSavePayload(),
      sharedPatch: getSharedState()
    });
  }

  function finishEriolVictory() {
    sakuraCards.add('dark');
    sakuraCards.add('light');
    if (!story.convertedOrder.includes('dark')) story.convertedOrder.push('dark');
    if (!story.convertedOrder.includes('light')) story.convertedOrder.push('light');
    eriolDefeated = true;
    recalcPower(true);
    updateHUD(true);
    updateFieldBar();
    autoSave('제2부 완결 · 에리오르 최종 시련 돌파');

    vn.start(toArr(DATA.dialogues?.eriolVictory), () => {
      openPart3Interlude();
    });
  }

  function handleDefeat() {
    if (memoryMode.active) return exitMemoryMode();
    currentMapId = 'town';
    player.x = 415;
    player.y = 485;
    kero.x = 385;
    kero.y = 465;
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    encCd = 2.0;
    placeTomoyoNearPlayer();
    host.resize();
    updateHUD(true);
    updateFieldBar();
    vn.start(toArr(DATA.dialogues?.defeat));
  }

  function talkNPC(npc) {
    if (npc.id === 'tomoyo') {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      updateHUD(true);
      SoundFX.heal();
      host.showToast('☕ 토모요의 홍차로 HP·MP가 완전 회복되었습니다!');

      const firstCardNote = part1Link.linked && CARDS[part1Link.firstCard]
        ? `처음으로 [${cardName(CARDS[part1Link.firstCard])}]를 봉인하시던 날이 엊그제 같은데, 벌써 별의 지팡이 주인이 되셨네요! `
        : '';
      let openWardrobeAfter = false;
      const curCos = getCostumeObj();

      vn.start([
        { speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: `${firstCardNote}별의 지팡이와 새 마법 의상이 정말 눈부셔요! 보온병에 담아 온 따뜻한 홍차로 기운을 차리세요.` },
        {
          speaker: '토모요',
          role: 'COSTUME DESIGNER',
          avatar: 'tomoyo',
          mood: 'happy',
          text: `현재 착용 중인 [${curCos.name}]${isCostumeReformed() ? ' (★별빛 리폼)' : ''} 외에도 사건을 돌파할 때마다 기존 의상을 별빛 리폼하거나 새 의상을 준비해 드려요. 의상실을 열어 보실래요?`,
          choices: [
            {
              label: '🎀 응! 마법 의상실 열어줘!',
              effect: () => { openWardrobeAfter = true; },
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '마음에 드는 의상을 골라 보세요! 별빛 리폼된 의상은 효과가 한층 더 강해졌답니다!' }]
            },
            {
              label: '고마워 토모요! 홍차만 마시고 바로 출발할게!',
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '오늘의 활약도 카메라에 완벽하게 담아 둘게요!' }]
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

      const yukitoLine = eriolDefeated
        ? '유키토 녀석, 요즘 안색이 완전히 좋아졌더라. 네가 고생 좀 했겠군. 자, 코코아 마셔라.'
        : part1Link.hadMirror
        ? '요즘 유키토가 자꾸 피곤해 보이는 게 영 신경 쓰여... 아, 그리고 예전에 만났던 네 거울 녀석한테 줄 초록 리본도 사 뒀다. 자, 코코아 마시고 힘내라.'
        : '어이 괴물, 요즘 유키토가 자꾸 졸려하고 몸이 흐릿해 보이는 것 같지 않냐... 무리하지 말고 이 코코아 마시고 든든하게 움직여라.';

      vn.start([
        { speaker: '토우야', role: 'BIG BROTHER', avatar: 'touya', mood: eriolDefeated ? 'happy' : 'worried', text: yukitoLine },
        { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'happy', text: '응, 오빠! 유키토 오빠도 카드들도 내가 꼭 지켜낼게! 코코아 고마워!' }
      ]);
    } else if (npc.id === 'yukito') {
      buffs.snackBuff = true;
      SoundFX.heal();
      updateHUD(true);
      host.showToast('🍙 유키토의 간식! 다음 전투 피해 22% 경감 · 매 턴 MP +3!');

      const alpha = getYukitoAlpha();
      const msg = eriolDefeated
        ? '사쿠라 덕분에 요즘 몸이 정말 가볍고 따뜻해! 직접 만든 주먹밥 많이 먹고 가!'
        : alpha < 0.65
        ? '안녕 사쿠라... 후아암, 이상하게 요즘 자꾸 잠이 쏟아지고 손끝이 투명하게 보이는 기분이 들어... 그래도 주먹밥은 맛있게 만들었으니까 꼭 챙겨 먹어!'
        : '요즘 조금씩 기운이 돌아오는 것 같아! 사쿠라의 별빛이 따뜻하게 전해져 오거든. 간식 먹고 힘내!';

      vn.start([
        { speaker: '유키토', role: 'GENTLE FRIEND', avatar: 'yukito', mood: alpha < 0.65 ? 'worried' : 'happy', text: msg },
        { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: alpha < 0.65 ? 'worried' : 'happy', text: alpha < 0.65 ? '유키토 오빠, 조금만 기다려 주세요! 제가 얼른 모든 카드를 깨워낼게요!' : '다행이에요 유키토 오빠! 간식 정말 잘 먹을게요!' }
      ]);
    } else if (npc.id === 'syaoran') {
      const msg = eriolDefeated
        ? '크로우 리드의 환생까지 이겨내다니... 역시 넌 최고의 마법사야, 사쿠라. 중학교에 들어가서도 계속 함께하자.'
        : `현재 친밀도 ${story.syaoranTrust}/10! 배틀 중 [⚡샤오랑 원호]로 결계와 반사막을 깨뜨릴 수 있으니 언제든 불러! 사건 전투 중엔 [🃏 카드 해방]의 5~7키 별빛 공명으로 카드를 실시간 각성시키는 것도 잊지 마!`;
      vn.start([{ speaker: '샤오랑', role: 'ALLY', avatar: 'syaoran', mood: 'happy', text: msg }]);
    } else if (npc.id === 'eriol') {
      // 에리오르 신비감 유지: 최종 결전 전까지는 카드·마법 정체를 숨기는 정중하고 묘한 전학생 톤
      story.metEriol = true;
      if (eriolDefeated) {
        vn.start([{ speaker: '에리오르', role: 'FRIEND', avatar: 'eriol', mood: 'happy', text: '이제 토모에다의 별빛은 완전히 당신의 것입니다, 사쿠라 씨. 스피넬과 루비도 안부를 전하더군요.' }]);
      } else if (clearedIncidents.size === 0) {
        vn.start([
          { speaker: '에리오르', role: 'TRANSFER STUDENT', avatar: 'eriol', mood: 'happy', text: '안녕하세요, 사쿠라 씨. 영국에서 전학 온 히이라기자와 에리오르입니다. 토모에다 마을은 별빛이 참 맑고 포근하네요.' },
          { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'happy', text: '안녕, 에리오르 군! 모르는 길이 있으면 언제든지 나한테 물어봐!' }
        ]);
      } else if (clearedIncidents.size < 3) {
        vn.start([
          { speaker: '에리오르', role: 'TRANSFER STUDENT', avatar: 'eriol', mood: 'normal', text: '요즘 마을에 조금 신기한 일들이 잦다고 들었어요. 사쿠라 씨는 늘 바쁘신 것 같네요. 무리하지 마시고 가끔은 달콤한 홍차라도 드시며 쉬어 가세요.' },
          { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'shy', text: '아, 하하... 고마워, 에리오르 군! 별일 아니야!' }
        ]);
      } else {
        vn.start([
          { speaker: '에리오르', role: 'TRANSFER STUDENT', avatar: 'eriol', mood: 'happy', text: '사쿠라 씨의 눈빛이 처음 만났을 때보다 훨씬 단단해지셨네요. 별이 가장 밝게 빛나는 밤은, 아주 깊은 어둠이 찾아온 직후라고 하더군요. ...후후, 그냥 옛이야기입니다.' },
          { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'worried', text: '(방금 에리오르 군의 미소... 어쩐지 어디선가 느껴 본 적 있는 포근하고도 묘한 기분이 들어...)' }
        ]);
      }
    }
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
      placeTomoyoNearPlayer();
      anomaly.mirrorTrail = [];
      host.resize();
      SoundFX.encounter();
      updateHUD(true);
      const cnt = countTargetsInMap(mid);
      host.showToast(mid === 'town' ? '별빛의 토모에다 마을로 나왔습니다.' : `${getMap().name}에 들어왔습니다.${cnt ? ` (사건·공명 ${cnt}곳)` : ''}`);
      if (fade) fade.style.opacity = '0';
    }, 170);
  }

  function checkNearby() {
    nearbyTarget = null;
    let bestScore = 96;
    const cur = getMap();

    for (const p of toArr(cur.portals)) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 64 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'portal', obj: p }; }
    }
    for (const inc of INCIDENTS) {
      if (!isIncidentActive(inc) || inc.map !== currentMapId) continue;
      const pos = getIncidentPos(inc);
      const d = Math.hypot(player.x - pos.x, player.y - pos.y);
      if (d < 100 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'incident', obj: { ...inc, isIncident: true, x: pos.x, y: pos.y } }; }
    }
    for (const id of CARD_ORDER) {
      if (!isCardActiveOnMap(id)) continue;
      const c = CARDS[id];
      if (!c || c.map !== currentMapId) continue;
      const pos = getCardPos(c);
      const d = Math.hypot(player.x - pos.x, player.y - pos.y);
      if (d < 88 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'card', obj: { ...c, x: pos.x, y: pos.y } }; }
    }
    if (isFinalUnlocked() && BOSS_ERIOL && currentMapId === BOSS_ERIOL.map) {
      const d = Math.hypot(player.x - BOSS_ERIOL.x, player.y - BOSS_ERIOL.y);
      if (d < 102 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'boss', obj: BOSS_ERIOL }; }
    } else if (eriolDefeated && !memoryMode.active && BOSS_ERIOL && currentMapId === BOSS_ERIOL.map) {
      const d = Math.hypot(player.x - BOSS_ERIOL.x, player.y - BOSS_ERIOL.y);
      if (d < 102 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'next_act', obj: BOSS_ERIOL }; }
    }
    for (const n of NPCS) {
      if (!isNpcVisible(n)) continue;
      const np = getNpcPos(n);
      const d = Math.hypot(player.x - np.x, player.y - np.y);
      // 동행 중인 토모요는 카드·사건·포털과 겹칠 때 방해되지 않도록 우선순위 소폭 완화
      const score = n.id === 'tomoyo' ? d + 18 : d;
      if (d < 88 && score < bestScore) { bestScore = score; nearbyTarget = { type: 'npc', obj: { ...n, x: np.x, y: np.y } }; }
    }

    const btn = $('btnFloatInteract');
    if (!btn) return;
    if (nearbyTarget && mode === 'explore') {
      btn.classList.remove('hidden');
      btn.textContent = Locale.t(
        nearbyTarget.type === 'portal'
          ? `${nearbyTarget.obj.label} (X)`
          : nearbyTarget.type === 'npc'
          ? `${Utils.withParticle(Locale.t(nearbyTarget.obj.name), '과/와')} 대화 (X)`
          : nearbyTarget.type === 'incident'
          ? `✦ ${nearbyTarget.obj.kr} 조사 (X)`
          : nearbyTarget.type === 'boss'
          ? '🌌 에리오르 최종 시련 맞서기 (X)'
          : nearbyTarget.type === 'next_act'
          ? '💎 중학교 입학식(제3부)으로 떠나기 (X)'
          : `★ ${cardName(nearbyTarget.obj)} 별빛 공명 (X)`
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
    } else if (t.type === 'npc') {
      talkNPC(t.obj);
    } else if (t.type === 'incident') {
      const inc = t.obj;
      vn.start(toArr(inc.intro), () => battle.start(getScaledBattleTarget({ ...inc, isIncident: true })));
    } else if (t.type === 'card') {
      const c = t.obj;
      const intro = [
        { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'normal', text: `${c.zone}... ${c.flavor}` },
        { speaker: '사쿠라', role: 'STAR MASTER', avatar: 'sakura', mood: 'serious', text: c.awakeningLine || `[${cardName(c)}]여, 내 별빛으로 다시 깨어나 줘!` }
      ];
      vn.start(intro, () => battle.start(getScaledBattleTarget(c)));
    } else if (t.type === 'boss') {
      const intro = toArr(DATA.dialogues?.eriolIntro).slice();
      if (story.syaoranTrust >= 2 && DATA.dialogues?.syaoranFinalCheer) {
        intro.unshift(...toArr(DATA.dialogues.syaoranFinalCheer));
      }
      vn.start(intro, () => battle.start(getScaledBattleTarget(BOSS_ERIOL)));
    } else if (t.type === 'next_act') {
      openPart3Interlude();
    }
  }

  function updateExplore(dt) {
    world.updateAmbience(dt);
    if (mode !== 'explore' || host.isAnyModalOpen?.()) return;

    if (encCd > 0) encCd = Math.max(0, encCd - dt);
    if (portalCd > 0) portalCd = Math.max(0, portalCd - dt);

    const prevSig = `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`;
    const penguinChasing = currentMapId === 'town' && !memoryMode.active && !clearedIncidents.has('inc_penguin');
    const colOpts = { ignoreObs: false, mazeActive: false, penguinChasing };

    if (buffs.fly > 0) {
      buffs.fly = Math.max(0, buffs.fly - dt);
      if (Math.random() < 0.35) world.burst(player.x, player.y + 8, '#fbcfe8', 1);
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
        player.mp = Math.min(player.maxMp, player.mp + (sakuraCards.has('glow') ? 3 : 2));
      }
    }
    if (prevSig !== `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`) {
      updateFieldBar();
    }

    // 제2사건: 펭귄 대왕 공원 구역 내에서 플레이어 근접 시 부드럽게 추격
    if (penguinChasing) {
      const distP = Math.hypot(player.x - anomaly.penguinX, player.y - anomaly.penguinY);
      if (distP < 280 && distP > 36 && player.x < 640 && player.y > 630) {
        const spd = 76;
        anomaly.penguinX = clamp(anomaly.penguinX + ((player.x - anomaly.penguinX) / distP) * spd * dt, 120, 560);
        anomaly.penguinY = clamp(anomaly.penguinY + ((player.y - anomaly.penguinY) / distP) * spd * dt, 700, 1140);
      } else {
        const t = performance.now() * 0.0008;
        const homeX = 355 + Math.cos(t) * 85;
        const homeY = 850 + Math.sin(t * 1.3) * 55;
        anomaly.penguinX += (homeX - anomaly.penguinX) * Math.min(1, dt * 1.5);
        anomaly.penguinY += (homeY - anomaly.penguinY) * Math.min(1, dt * 1.5);
      }
    }

    const flying = buffs.fly > 0 || buffs.flyLand;
    const cosBonuses = Rules.getCostumeBonuses(story.costumeId, isCostumeReformed());
    let spdMod = 1;
    let pushX = 0;
    let pushY = 0;

    // 제1사건 국지성 폭우 둔화 (개구리 우비 또는 윈디로 면역)
    const rainInc = INCIDENTS.find((x) => x.id === 'inc_rain');
    if (rainInc && isIncidentActive(rainInc) && currentMapId === rainInc.map && !flying && buffs.wind <= 0 && !cosBonuses.waterPushImmune) {
      if (Math.hypot(player.x - rainInc.x, player.y - rainInc.y) < 115) spdMod *= 0.68;
    }

    // 제2부 별빛 공명 지점 필드 이상 현상 상호작용 보완 (1부와 일관된 체험)
    if (isCardActiveOnMap('wood') && CARDS.wood?.map === currentMapId && !flying && buffs.wind <= 0) {
      if (Math.hypot(player.x - CARDS.wood.x, player.y - CARDS.wood.y) < 105) spdMod *= 0.55;
    }
    if (isCardActiveOnMap('earthy') && CARDS.earthy?.map === currentMapId && !flying) {
      if (Math.hypot(player.x - CARDS.earthy.x, player.y - CARDS.earthy.y) < 115) spdMod *= 0.65;
    }
    if (isCardActiveOnMap('watery') && CARDS.watery?.map === currentMapId && !flying && buffs.wind <= 0 && !cosBonuses.waterPushImmune) {
      const dw = Math.hypot(player.x - CARDS.watery.x, player.y - CARDS.watery.y);
      if (dw < 115 && dw > 36) {
        pushX += ((player.x - CARDS.watery.x) / dw) * 52;
        pushY += ((player.y - CARDS.watery.y) / dw) * 52;
      }
    }
    if (isCardActiveOnMap('shield') && CARDS.shield?.map === currentMapId && !flying && buffs.wind <= 0) {
      const ds = Math.hypot(player.x - CARDS.shield.x, player.y - CARDS.shield.y);
      if (ds < 92 && ds > 42) {
        pushX += ((player.x - CARDS.shield.x) / ds) * 42;
        pushY += ((player.y - CARDS.shield.y) / ds) * 42;
      }
    }

    if (isCardActiveOnMap('jump') && CARDS.jump?.map === currentMapId) {
      anomaly.jumpHop = Math.max(0, anomaly.jumpHop - dt);
      anomaly.jumpBind = Math.max(0, anomaly.jumpBind - dt);
      const dj = Math.hypot(player.x - anomaly.jumpX, player.y - anomaly.jumpY);
      if (dj < 105 && dj > 48 && anomaly.jumpHop <= 0 && anomaly.jumpBind <= 0) {
        anomaly.jumpHop = 2.0;
        const spots = [{ x: 515, y: 935 }, { x: 430, y: 1030 }, { x: 550, y: 760 }, { x: 260, y: 1020 }];
        const pick = spots.filter((s) => Math.hypot(s.x - player.x, s.y - player.y) > 120)[0] || spots[0];
        anomaly.jumpX = pick.x;
        anomaly.jumpY = pick.y;
        world.burst(pick.x, pick.y, '#f472b6', 14);
        host.showToast('점프 공명이 통통 뛰어 달아났다! ([윈디]로 묶을 수 있어요)');
      }
    }
    if (isCardActiveOnMap('glow') && CARDS.glow?.map === currentMapId) {
      const t = performance.now() * 0.001;
      anomaly.glowX = CARDS.glow.x + Math.sin(t * 1.1) * 34;
      anomaly.glowY = CARDS.glow.y + Math.cos(t * 1.6) * 14;
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

    const moveCol = { ignoreObs: flying, mazeActive: false, penguinChasing };
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

    if (pendingTarget && Math.hypot(player.x - pendingTarget.obj.x, player.y - pendingTarget.obj.y) < 74) {
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
      if (nearbyTarget.type === 'incident' && d < 52) return triggerInteract();
      if (nearbyTarget.type === 'card' && d < 48) return triggerInteract();
      if (nearbyTarget.type === 'boss' && d < 56) return triggerInteract();
    }
  }

  function tick(dt, now) {
    if (battle.isActive()) {
      battle.updateAndRenderVFX(dt);
      return;
    }
    updateExplore(dt);

    const cur = getMap();
    const activeCards = CARD_ORDER
      .filter((id) => isCardActiveOnMap(id) && CARDS[id]?.map === currentMapId)
      .map((id) => ({ ...CARDS[id], pos: getCardPos(CARDS[id]) }));
    const activeIncidents = INCIDENTS
      .filter((inc) => isIncidentActive(inc) && inc.map === currentMapId)
      .map((inc) => ({ ...inc, pos: getIncidentPos(inc) }));
    const visibleNpcs = NPCS.filter(isNpcVisible).map((n) => {
      if (n.id === 'tomoyo') {
        return { ...n, x: tomoyoPos.x, y: tomoyoPos.y };
      }
      if (n.id === 'yukito') {
        return { ...n, alpha: getYukitoAlpha(), sleepy: !eriolDefeated && sakuraCards.size < 14 };
      }
      return n;
    });

    const finalReady = isFinalUnlocked();
    const bossObj = finalReady && BOSS_ERIOL && currentMapId === BOSS_ERIOL.map
      ? { type: 'eriol', x: BOSS_ERIOL.x, y: BOSS_ERIOL.y, label: '🌌 에리오르 & 두 수호자' }
      : null;
    const clockCircle = currentMapId === 'town' && BOSS_ERIOL
      ? { x: BOSS_ERIOL.x, y: BOSS_ERIOL.y, ready: !!finalReady }
      : null;

    let earthyShake = 0;
    if (isCardActiveOnMap('earthy') && CARDS.earthy?.map === currentMapId) {
      const d = Math.hypot(player.x - CARDS.earthy.x, player.y - CARDS.earthy.y);
      if (d < 190) earthyShake = (1 - d / 190) * 3.0;
    }
    const shadowNearPlayer = !!(
      isCardActiveOnMap('shadow') &&
      CARDS.shadow?.map === currentMapId &&
      Math.hypot(player.x - CARDS.shadow.x, player.y - CARDS.shadow.y) < 220
    );

    world.render(now, {
      part: 2,
      map: cur,
      mapId: currentMapId,
      zones: ZONES,
      player,
      kero,
      buffs,
      costume: getCostumeObj(),
      anomaly,
      activeCards,
      activeIncidents,
      npcs: visibleNpcs,
      boss: bossObj,
      clockCircle,
      nextObjective: getNextObjective(),
      portalCounts: countTargetsInMap,
      flags: {
        earthyShake,
        shadowNearPlayer,
        isSakuraFly: sakuraCards.has('fly'),
        penguinChasing: currentMapId === 'town' && !memoryMode.active && !clearedIncidents.has('inc_penguin'),
        wateryActive: currentMapId === 'town' && !memoryMode.active && !clearedIncidents.has('inc_spinel'),
        eternalDarkness: finalReady,
        showTarget: mode === 'explore'
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. 제2부 시작 (1부 완결 직후 자연 연결 + 의상/친밀도/추억 계승)
  // --------------------------------------------------------------------------
  function startNewAdventure(shared = null, fromInterlude = false) {
    Timers.clearAll();
    vn.finish(true);
    battle.forceClose();
    memoryMode = { active: false, cardId: null, snapshot: null };
    $('memoryBanner')?.classList.add('hidden');
    $('endingBox')?.classList.add('hidden');

    sakuraCards = new Set();
    clearedIncidents = new Set();
    eriolDefeated = false;
    shownActs = new Set();
    story.syaoranTrust = 2;
    story.convertedOrder = [];
    story.seenMilestones = new Set();
    story.metEriol = false;
    story.costumeId = 'sakura_dress';
    story.unlockedCostumes = new Set(['sakura_dress', 'star_opening']);
    story.reformedCostumes = new Set();

    Object.assign(part1Link, {
      linked: false, firstCard: '', lastCard: '', syaoranTrust: 0, yueDefeated: false, hadMirror: false
    });
    if (shared) applySharedState(shared);

    currentMapId = 'town';
    recalcPower(false);
    player.x = 385;
    player.y = 465;
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    player.targetPos = null;
    pendingTarget = null;
    kero.x = 355;
    kero.y = 445;
    placeTomoyoNearPlayer();

    Object.assign(buffs, {
      fly: 0, flyLand: false, light: 0, glow: 0, glowCd: 0, glowAcc: 0,
      wind: 0, shield: false, snackBuff: false, cocoaBuff: false
    });
    resetAnomalyState();

    host.resize();
    updateHUD(true);
    showChapterOnce('PART II · STARLIGHT', '별의 지팡이와 다섯 개의 사건');

    const openLines = toArr(DATA.dialogues?.opening).map((ln) => (
      ln && typeof ln.text === 'string' ? { ...ln, text: naturalizeMeta(ln.text) } : ln
    ));
    if (part1Link.linked && CARDS[part1Link.firstCard]) {
      openLines.push({
        speaker: '사쿠라',
        role: 'STAR MASTER',
        avatar: 'sakura',
        mood: 'happy',
        text: `지난 학기에 제일 먼저 봉인했던 [${cardName(CARDS[part1Link.firstCard])}]부터 마지막 [${cardName(CARDS[part1Link.lastCard])}]까지... 소중한 추억이 담긴 카드와 유키토 오빠를 꼭 지켜낼게!`
      });
    }
    openLines.push({
      speaker: '토모요',
      role: 'COSTUME DESIGNER',
      avatar: 'tomoyo',
      mood: 'happy',
      text: '별의 지팡이 각성을 축하하며 새 의상 [⭐ 별빛 오프닝 드레스]를 준비해 두었어요! 이번에도 사쿠라 곁을 따라다니며 촬영과 홍차를 챙겨 드릴게요!'
    });
    vn.start(openLines, () => {
      encCd = 1.2;
      if (fromInterlude) {
        host.showToast('⭐ 별빛의 새 학기가 시작되었습니다! 동행 중인 토모요에게 새 의상을 확인해 보세요!');
      }
      autoSave('제2부 모험 시작');
    });
  }

  return {
    part: 2,
    battleHooks: {
      getData: () => DATA,
      getCards: () => CARDS,
      getCardOrder: () => CARD_ORDER,
      getPlayer: () => player,
      getOwnedCards: () => new Set(CARD_ORDER),
      getSakuraCards: () => sakuraCards,
      getCostumeId: () => story.costumeId,
      isCostumeReformed: () => isCostumeReformed(),
      getSyaoranTrust: () => story.syaoranTrust,
      getFieldBuffs: () => buffs,
      onHUDUpdate: () => updateHUD(true),
      onModeChange: (m) => { mode = m; updateFieldBar(); },
      onLiveCardConverted: handleLiveCardConverted,
      onVictory: (target) => {
        if (target.isBoss) finishEriolVictory();
        else if (target.isIncident) finishIncidentClear(target);
        else finishResonanceTransform(target);
      },
      onDefeat: handleDefeat,
      onFlee: () => { encCd = 2.0; host.showToast('잠시 물러나 별의 마력을 재정비합니다.'); }
    },
    start({ saved, shared, fromInterlude } = {}) {
      if (saved && saved.part === 2) {
        applySavePayload(saved, shared);
      } else {
        startNewAdventure(shared, !!fromInterlude);
      }
    },
    tick,
    onModeChange(m) {
      mode = m;
      updateFieldBar();
    },
    onTrustDelta(delta) {
      story.syaoranTrust = Rules.clampTrust(story.syaoranTrust + delta, 2);
      updateHUD(true);
    },
    onCostumeBadgeClick() {
      const cos = getCostumeObj();
      const reformed = isCostumeReformed();
      const passive = Rules.getCostumePassiveLabel(cos, reformed);
      host.showToast(`🎀 현재 착용: ${cos.name}${reformed ? ' ★리폼' : ''} (${passive}) · 의상 교체와 홍차 회복은 동행 중인 토모요에게!`);
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
          if (Math.hypot(wx - p.x, wy - p.y) < 44) { pendingTarget = { type: 'portal', obj: p }; player.targetPos = { x: p.x, y: p.y }; return; }
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
        for (const inc of INCIDENTS) {
          if (isIncidentActive(inc) && inc.map === currentMapId) {
            const pos = getIncidentPos(inc);
            if (Math.hypot(wx - pos.x, wy - pos.y) < 66) {
              pendingTarget = { type: 'incident', obj: { ...inc, isIncident: true, x: pos.x, y: pos.y } };
              player.targetPos = pos;
              return;
            }
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
        if (isFinalUnlocked() && BOSS_ERIOL && currentMapId === BOSS_ERIOL.map && Math.hypot(wx - BOSS_ERIOL.x, wy - BOSS_ERIOL.y) < 60) {
          pendingTarget = { type: 'boss', obj: BOSS_ERIOL };
          player.targetPos = { x: BOSS_ERIOL.x, y: BOSS_ERIOL.y };
          return;
        }
        if (eriolDefeated && !memoryMode.active && BOSS_ERIOL && currentMapId === BOSS_ERIOL.map && Math.hypot(wx - BOSS_ERIOL.x, wy - BOSS_ERIOL.y) < 64) {
          pendingTarget = { type: 'next_act', obj: BOSS_ERIOL };
          player.targetPos = { x: BOSS_ERIOL.x, y: BOSS_ERIOL.y };
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
      if (!next) host.showToast('케로: 열아홉 장 모두 사쿠라 카드가 됐어! 시계탑 광장에서 중학교 입학식(제3부)으로 출발할 수 있어!');
      else if (next.isBoss) host.showToast(`케로: 준비 끝! 남쪽 [${BOSS_ERIOL.zone}]에서 에리오르의 최종 시련에 맞서자!`);
      else if (next.targetIncident || next.isIncident) {
        const ti = next.targetIncident || next;
        host.showToast(`케로: [${ti.zone}]에서 "${ti.rumor}" 사건이 벌어지고 있어! 전투 중 ★변환으로 카드를 깨워 봐!`);
      } else {
        const tc = next.targetCard || next;
        host.showToast(`케로: [${tc.zone}] 쪽에서 [${cardName(tc)}]의 별빛 공명이 느껴져!`);
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
