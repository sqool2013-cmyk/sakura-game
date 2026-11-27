/**
 * ============================================================================
 * 카드캡터 3부작 — 제3부 고유 컨트롤러 (chapter3.js) — v.0.2.0
 * - 통합 단일 스토리 앱(index.html)과 연동되는 제3부(클리어 카드 편) 모듈
 * - 원작 코믹스 완결 기준 클리어 카드 31장 전원 수록 (5막 단계 개방형)
 * - 배틀 + 💎 크리스탈 프리즘 락 고착 & 일상/스토리 즉시 각성 혼합 구조
 * - 중학교 세일러 교복 시작 -> 첫 카드 고착 직후 토모요 정식 합류 & 신규 의상 선물
 * - 1·2부 의상(★별빛 리폼 포함)·스탯(HP 145->175 / MP 325->480)·친밀도(최대 15) 연속 계승
 * - 9개 맵(꿈결 마을 · 집 2곳 · 중학교 2곳 · 대저택 2곳 · 신사 2곳) 및 6종 필드 퀵바 지원
 * ============================================================================
 */

export function createChapter(host, DATA) {
  const { engines, world, vn, battle, keys } = host;
  const { Timers, Utils, Locale, Art, SoundFX, Rules } = engines;
  const { $, toArr, clamp, cardName, cardRuby } = Utils;

  // --------------------------------------------------------------------------
  // 1. 제3부 병합 데이터 바인딩 & 의상·5막 규칙 정규화
  // --------------------------------------------------------------------------
  const CARDS = DATA.cards || {};
  const CARD_ORDER = toArr(DATA.cardOrder);
  const MAPS = DATA.maps || {};
  const ZONES = toArr(DATA.zones);
  const NPCS = toArr(DATA.npcs);
  const BOSS_CLEAR = DATA.bossClear || null;
  const QUICK_SLOTS = toArr(DATA.fieldQuickSlots);

  const ACTS_RAW = DATA.acts || {};
  const ACTS = {
    act1First: toArr(ACTS_RAW.act1First).length ? toArr(ACTS_RAW.act1First) : ['gale'],
    act1Rest: toArr(ACTS_RAW.act1Rest).length ? toArr(ACTS_RAW.act1Rest) : ['siege', 'aqua', 'reflect', 'action'],
    act2: toArr(ACTS_RAW.act2).length ? toArr(ACTS_RAW.act2) : ['record', 'flight', 'lucid', 'spiral', 'snooze', 'labyrinth'],
    act3: [...toArr(ACTS_RAW.act3a), ...toArr(ACTS_RAW.act3b)],
    act4: toArr(ACTS_RAW.act4),
    act5: toArr(ACTS_RAW.act5)
  };

  const COSTUME_ICONS = {
    mschool_uniform: '🎀',
    crystal_dream: '💎',
    clockwork_wonder: '🕰',
    prism_snow: '❄️',
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

  // 제3부 신규 4벌 최상단 배치 + 1·2부 배틀 의상(초등학교 교복 제외) 계승 통합
  const p3Base = toArr(DATA.costumes).length ? toArr(DATA.costumes) : toArr(Rules?.DEFAULT_COSTUMES_P3_EXTRA);
  const carryPool = [
    ...toArr(Rules?.DEFAULT_COSTUMES_P2_EXTRA),
    ...toArr(Rules?.DEFAULT_COSTUMES_P1).filter((c) => c.id !== 'school_uniform')
  ];
  const costumeMap = new Map();
  p3Base.forEach((c) => {
    costumeMap.set(c.id, { ...c, icon: c.icon || COSTUME_ICONS[c.id] || '💎' });
  });
  carryPool.forEach((c) => {
    if (!costumeMap.has(c.id)) {
      costumeMap.set(c.id, { ...c, icon: c.icon || COSTUME_ICONS[c.id] || '🌸' });
    }
  });
  const COSTUMES = Array.from(costumeMap.values());

  const MAP_GROUPS = {
    house_f1: ['house_f1', 'house_f2'],
    mschool_f1: ['mschool_f1', 'mschool_roof'],
    mansion_hall: ['mansion_hall', 'mansion_lib'],
    shrine_gate: ['shrine_gate', 'shrine_main']
  };

  // --------------------------------------------------------------------------
  // 2. 제3부 게임 상태 변수
  // --------------------------------------------------------------------------
  let mode = 'explore'; // explore | dialogue | battle | ending
  let clearCards = new Set();
  let bossDefeated = false;
  let shownActs = new Set();
  let currentMapId = 'house_f2';
  let portalCd = 0;
  let encCd = 0;
  let nearbyTarget = null;
  let pendingTarget = null;
  let lastHudSig = '';
  let inPrologue = false;
  let memoryMode = { active: false, cardId: null, snapshot: null };

  const story = {
    syaoranTrust: 5,
    securedOrder: [],
    costumeId: 'mschool_uniform',
    unlockedCostumes: new Set(['mschool_uniform']),
    reformedCostumes: new Set(),
    tomoyoFollowing: false,
    talkedSyaoranP3: false,
    part1Cleared: false,
    part2Cleared: false,
    firstSealedCard: '',
    lastSealedCard: '',
    hadMirror: false
  };

  const tomoyoPos = { x: 465, y: 485 };

  const player = {
    x: 380,
    y: 300,
    dir: 'down',
    hp: 145,
    maxHp: 145,
    mp: 325,
    maxMp: 325,
    lv: 1,
    mult: 2.1,
    walk: 0,
    targetPos: null
  };

  const kero = { x: 350, y: 280, bob: 0 };

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

  // --------------------------------------------------------------------------
  // 3. 핵심 헬퍼 · 5막 단계 개방 · 토모요 촬영 동행 AI · 연속 성장 곡선
  // --------------------------------------------------------------------------
  const getMap = () => MAPS[currentMapId] || MAPS.town_p3;

  /**
   * 제3부 5막 단계 계산:
   * 1.0: 첫 카드(게일) 고정
   * 1.5: 제1막 잔여 4장
   * 2  : 제2막 6장 (전학생 합류 & 대저택 개방)
   * 3  : 제3막 8장
   * 4  : 제4막 7장
   * 5  : 제5막 5장
   * 6  : 31장 전원 고착 완료 -> 최종 결전 개방
   */
  function getCurrentStoryAct() {
    if (!ACTS.act1First.every((id) => clearCards.has(id))) return 1.0;
    if (!ACTS.act1Rest.every((id) => clearCards.has(id))) return 1.5;
    if (!ACTS.act2.every((id) => clearCards.has(id))) return 2;
    if (!ACTS.act3.every((id) => clearCards.has(id))) return 3;
    if (!ACTS.act4.every((id) => clearCards.has(id))) return 4;
    if (!ACTS.act5.every((id) => clearCards.has(id))) return 5;
    return 6;
  }

  function isCardUnlockedByAct(id) {
    if (memoryMode.active) return memoryMode.cardId === id;
    if (clearCards.has(id)) return false;
    const act = getCurrentStoryAct();
    if (ACTS.act1First.includes(id)) return true;
    if (ACTS.act1Rest.includes(id)) return act >= 1.5;
    if (ACTS.act2.includes(id)) return act >= 2;
    if (ACTS.act3.includes(id)) return act >= 3;
    if (ACTS.act4.includes(id)) return act >= 4;
    if (ACTS.act5.includes(id)) return act >= 5;
    return false;
  }

  const isCardActiveOnMap = (id) => isCardUnlockedByAct(id);
  const getUnsecured = () => CARD_ORDER.filter(isCardActiveOnMap).map((id) => CARDS[id]).filter(Boolean);
  const isFinalUnlocked = () => !bossDefeated && !memoryMode.active && !!BOSS_CLEAR && getCurrentStoryAct() >= 6;

  function countUnsecuredInMap(mid) {
    if (currentMapId === 'town_p3' && MAP_GROUPS[mid]) {
      const grp = MAP_GROUPS[mid];
      return CARD_ORDER.filter((id) => isCardActiveOnMap(id) && grp.includes(CARDS[id]?.map)).length;
    }
    return CARD_ORDER.filter((id) => isCardActiveOnMap(id) && CARDS[id]?.map === mid).length;
  }

  const isTomoyoFollowing = () => !!(story.tomoyoFollowing && clearCards.has('gale') && !inPrologue);

  function getNpcPos(n) {
    if (n.id === 'tomoyo' && isTomoyoFollowing()) {
      return { x: tomoyoPos.x, y: tomoyoPos.y };
    }
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
    if (!isTomoyoFollowing()) return;
    const desiredX = player.x + (player.dir === 'right' ? -68 : player.dir === 'left' ? 68 : -54);
    const desiredY = player.y + (player.dir === 'down' ? -48 : player.dir === 'up' ? 54 : -34);
    const distToPlayer = Math.hypot(player.x - tomoyoPos.x, player.y - tomoyoPos.y);
    const dx = desiredX - tomoyoPos.x;
    const dy = desiredY - tomoyoPos.y;
    const distToSpot = Math.hypot(dx, dy);
    const cur = getMap();

    if (distToPlayer > 76 && distToSpot > 6) {
      const spd = Math.min(getMoveSpeed() * 0.94, Math.max(135, distToSpot * 3.4));
      tomoyoPos.x = clamp(tomoyoPos.x + (dx / distToSpot) * spd * dt, 36, (cur?.w || 800) - 36);
      tomoyoPos.y = clamp(tomoyoPos.y + (dy / distToSpot) * spd * dt, 36, (cur?.h || 600) - 36);
    } else if (distToPlayer < 46 && distToPlayer > 1) {
      const push = 42 * dt;
      tomoyoPos.x = clamp(tomoyoPos.x - ((player.x - tomoyoPos.x) / distToPlayer) * push, 36, (cur?.w || 800) - 36);
      tomoyoPos.y = clamp(tomoyoPos.y - ((player.y - tomoyoPos.y) / distToPlayer) * push, 36, (cur?.h || 600) - 36);
    }
  }

  /**
   * 제3부 NPC 가시성 규칙:
   * - 토모요: 첫 카드(게일) 고착 후 합류 시 전 맵 동행
   * - 아키호 · 카이토 · 모모: 제2막부터 등장 (최종 결전 대기 중에는 시계탑 이벤트와 중복 방지)
   */
  function isNpcVisible(n) {
    if (n.id === 'tomoyo') return isTomoyoFollowing();
    if (n.map !== currentMapId) return false;
    const act = getCurrentStoryAct();
    if (['akiho', 'kaito', 'momo'].includes(n.id) && act < 2) return false;
    if ((n.id === 'kaito' || n.id === 'akiho') && isFinalUnlocked()) return false;
    return true;
  }

  const getCostumeObj = () => COSTUMES.find((c) => c.id === story.costumeId) || COSTUMES[0];
  const getCostumeIcon = (cos) => cos?.icon || COSTUME_ICONS[cos?.id] || '💎';
  const isCostumeReformed = (cosId = story.costumeId) => story.reformedCostumes.has(cosId);

  function applySharedState(shared) {
    if (!shared || typeof shared !== 'object') return;
    toArr(shared.unlockedCostumes).forEach((cid) => {
      if (cid !== 'school_uniform') story.unlockedCostumes.add(cid);
    });
    toArr(shared.reformedCostumes).forEach((cid) => story.reformedCostumes.add(cid));
    story.unlockedCostumes.add('mschool_uniform');
    const trust = Rules.clampTrust(Number(shared.syaoranTrust) || 5, 3);
    if (trust > story.syaoranTrust) story.syaoranTrust = trust;
    story.part1Cleared = !!shared.part1Cleared;
    story.part2Cleared = !!shared.part2Cleared;
    story.firstSealedCard = shared.firstSealedCard || '';
    story.lastSealedCard = shared.lastSealedCard || '';
    story.hadMirror = !!shared.hadMirror;
  }

  function recalcPower(healBonus = false) {
    const prevMaxHp = player.maxHp;
    const prevMaxMp = player.maxMp;
    const stats = Rules.calcStats({
      part: 3,
      progressCount: clearCards.size,
      total: CARD_ORDER.length || 31,
      costumeId: story.costumeId,
      isReformed: isCostumeReformed(),
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
    let s = 250 + (clearCards.has('flight') ? 24 : 0);
    s *= Rules.getCostumeBonuses(story.costumeId, isCostumeReformed()).speedMult || 1;
    if (buffs.fly > 0 || buffs.flyLand) s *= 1.68;
    return s;
  }

  function getZoneName() {
    if (currentMapId !== 'town_p3') return getMap()?.name || '꿈결의 토모에다';
    for (const z of ZONES) {
      if (player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h) {
        return z.name;
      }
    }
    return '꿈결의 토모에다';
  }

  function findPortalToward(targetMap) {
    const portals = toArr(getMap()?.portals);
    return portals.find((p) => p.targetMap === targetMap)
      || portals.find((p) => MAP_GROUPS[p.targetMap]?.includes(targetMap))
      || portals.find((p) => p.targetMap === 'town_p3')
      || portals[0];
  }

  function getNextObjective() {
    const rem = getUnsecured();
    if (rem.length > 0) {
      const here = rem.filter((c) => c.map === currentMapId);
      if (here.length > 0) {
        let best = here[0];
        let bestD = Infinity;
        for (const c of here) {
          const d = Math.hypot(c.x - player.x, c.y - player.y);
          if (d < bestD) { bestD = d; best = c; }
        }
        return best;
      }
      const tc = rem[0];
      const pt = findPortalToward(tc.map);
      return pt ? { isPortal: true, x: pt.x, y: pt.y, zone: tc.zone, targetCard: tc } : tc;
    }
    if (isFinalUnlocked() && BOSS_CLEAR) {
      if (currentMapId !== 'town_p3') {
        const pt = findPortalToward('town_p3');
        return pt ? { isPortal: true, isBoss: true, x: pt.x, y: pt.y, zone: BOSS_CLEAR.zone, targetCard: BOSS_CLEAR } : BOSS_CLEAR;
      }
      return BOSS_CLEAR;
    }
    return null;
  }

  function showChapterOnce(sub, title) {
    if (shownActs.has(sub)) return;
    shownActs.add(sub);
    host.showChapterBanner(sub, title);
  }

  // --------------------------------------------------------------------------
  // 4. 멀티 세이브 슬롯 페이로드 · 공유 상태 · 자동 저장
  // --------------------------------------------------------------------------
  function getUnlockedCostumeList() {
    const unlocked = new Set(story.unlockedCostumes);
    COSTUMES.forEach((cos) => {
      if (Rules.isCostumeUnlocked(cos, {
        clearCards,
        bossCleared: bossDefeated,
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
      syaoranTrust: Rules.clampTrust(story.syaoranTrust, 3),
      part1Cleared: story.part1Cleared,
      part2Cleared: story.part2Cleared,
      part3Cleared: bossDefeated,
      firstSealedCard: story.firstSealedCard,
      lastSealedCard: story.lastSealedCard,
      hadMirror: story.hadMirror
    };
  }

  function getSlotMeta() {
    return {
      zoneName: getZoneName(),
      summary: bossDefeated
        ? `3부작 완전 정복 · 💎 ${clearCards.size}/${CARD_ORDER.length} · Lv.${player.lv}`
        : `💎 클리어 ${clearCards.size}/${CARD_ORDER.length} · 꿈마력 Lv.${player.lv}`
    };
  }

  function getSavePayload() {
    const s = memoryMode.active && memoryMode.snapshot ? memoryMode.snapshot : null;
    return {
      version: 5,
      part: 3,
      bossDefeated: s ? s.bossDefeated : bossDefeated,
      currentMapId: s ? s.currentMapId : currentMapId,
      clearCards: Array.from(s ? s.clearCards : clearCards),
      shownActs: Array.from(shownActs),
      story: {
        syaoranTrust: Rules.clampTrust(story.syaoranTrust, 3),
        securedOrder: story.securedOrder.slice(),
        costumeId: story.costumeId,
        unlockedCostumes: getUnlockedCostumeList(),
        reformedCostumes: Array.from(story.reformedCostumes),
        tomoyoFollowing: story.tomoyoFollowing,
        talkedSyaoranP3: story.talkedSyaoranP3
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

    clearCards = new Set(toArr(saved.clearCards));
    bossDefeated = !!saved.bossDefeated;
    shownActs = new Set(toArr(saved.shownActs));

    const st = saved.story || {};
    story.syaoranTrust = Rules.clampTrust(Number(st.syaoranTrust) || 5, 3);
    story.securedOrder = toArr(st.securedOrder);
    story.talkedSyaoranP3 = !!st.talkedSyaoranP3;

    const hasGale = clearCards.has('gale');
    story.costumeId = st.costumeId || (hasGale ? 'crystal_dream' : 'mschool_uniform');
    story.unlockedCostumes = new Set([
      'mschool_uniform',
      ...(hasGale ? ['crystal_dream'] : []),
      ...toArr(st.unlockedCostumes)
    ]);
    story.reformedCostumes = new Set(toArr(st.reformedCostumes));
    if (shared) applySharedState(shared);
    if (st.costumeId && COSTUMES.some((c) => c.id === st.costumeId)) {
      story.costumeId = st.costumeId;
    }

    currentMapId = MAPS[saved.currentMapId] ? saved.currentMapId : 'town_p3';
    story.tomoyoFollowing = hasGale && (typeof st.tomoyoFollowing === 'boolean' ? st.tomoyoFollowing : true);

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

    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
  }

  // --------------------------------------------------------------------------
  // 5. HUD & 제3부 필드 퀵바 (플라이트·아쿠아·스누즈·리페어·게일·시즈)
  // --------------------------------------------------------------------------
  function updateHUD(force = false) {
    const zn = getZoneName();
    const curCos = getCostumeObj();
    const sig = `${Locale.getMode()}|${player.lv}|${Math.ceil(player.hp)}|${player.maxHp}|${Math.ceil(player.mp)}|${player.maxMp}|${clearCards.size}|${story.syaoranTrust}|${curCos.id}|${zn}|${bossDefeated}|${memoryMode.active}`;
    if (!force && sig === lastHudSig) return;
    lastHudSig = sig;

    if ($('hudCostumeBadge')) $('hudCostumeBadge').textContent = getCostumeIcon(curCos);
    if ($('hudMagicLv')) $('hudMagicLv').textContent = `💎 꿈마력 Lv.${player.lv}`;
    if ($('hudTrustBadge')) $('hudTrustBadge').textContent = `⚡친밀 ${story.syaoranTrust}/15`;
    if ($('hudHpBar')) $('hudHpBar').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    if ($('hudMpBar')) $('hudMpBar').style.width = `${Math.max(0, (player.mp / player.maxMp) * 100)}%`;
    if ($('hudHpNum')) $('hudHpNum').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    if ($('hudMpNum')) $('hudMpNum').textContent = `${Math.ceil(player.mp)}/${player.maxMp}`;
    if ($('hudCardCount')) $('hudCardCount').textContent = `💎 ${clearCards.size}/${CARD_ORDER.length}`;
    if ($('hudZone')) $('hudZone').textContent = Locale.t(zn);

    const rem = getUnsecured().length;
    const act = getCurrentStoryAct();

    if (memoryMode.active) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'CLEAR MEMORY REPLAY';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${cardName(CARDS[memoryMode.cardId])}]의 고착 기억을 다시 체험 중`);
    } else if (act === 1.0) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · ACT I · 투명한 첫 바람';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t('토모에다 중학교 앞 벚꽃길의 투명한 기운을 조사하라');
    } else if (act === 1.5) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · ACT I · 꿈의 지팡이';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`중학교·분수대·신사·공원의 투명한 기운을 고착하라 (남은 ${rem}곳)`);
    } else if (act === 2) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · ACT II · 새로운 친구와 날개';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`중학교·저택·신사의 새로운 기운을 조사하라 (제2막 남은 ${rem}곳)`);
    } else if (act === 3) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · ACT III · 꿈결의 서고';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`저택 대서고와 마을 곳곳의 투명 기운을 추적하라 (제3막 남은 ${rem}곳)`);
    } else if (act === 4) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · ACT IV · 흔들리는 톱니바퀴';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`강해진 투명 마력의 근원을 고착하라 (제4막 남은 ${rem}곳)`);
    } else if (act === 5) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · ACT V · 꿈의 끝에서';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`마지막 클리어 카드들을 모두 고착하라 (제5막 남은 ${rem}곳)`);
    } else if (!bossDefeated && BOSS_CLEAR) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'PART III · GRAND FINALE';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${BOSS_CLEAR.zone}]에서 최후의 결전에 맞서라!`);
    } else {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'TRILOGY COMPLETE · FOREVER DREAM';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t('서른한 장의 클리어 카드와 모두의 내일을 지켜냈다');
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
      const unlocked = clearCards.has(s.id);
      const onCd = s.id === 'snooze' && buffs.glowCd > 0 && buffs.glow <= 0;
      const active = (s.id === 'flight' && (buffs.fly > 0 || buffs.flyLand))
        || (s.id === 'aqua' && buffs.light > 0)
        || (s.id === 'snooze' && buffs.glow > 0)
        || (s.id === 'gale' && buffs.wind > 0)
        || (s.id === 'siege' && buffs.shield);

      const btn = document.createElement('button');
      btn.disabled = !unlocked || onCd;
      btn.title = unlocked ? (onCd ? `대기 중 (${Math.ceil(buffs.glowCd)}s)` : `${Locale.t(s.desc)} (MP ${s.mp})`) : '미고착 카드';
      btn.className = `shrink-0 px-2 py-1 rounded-xl border text-[11px] font-story flex items-center gap-1 transition ${
        !unlocked || onCd
          ? 'bg-black/40 border-white/10 text-slate-500'
          : active
          ? 'bg-sky-500/45 border-yellow-200 text-yellow-100 shadow-[0_0_10px_rgba(125,211,252,0.55)]'
          : 'bg-sky-950/80 hover:bg-sky-900/85 border-sky-300/50 text-sky-100'
      }`;
      btn.innerHTML = `<span class="text-[9px] font-mono text-yellow-200">[${s.key}]</span><span>${s.icon}</span><span class="font-bold">${s.label}${onCd ? ` ${Math.ceil(buffs.glowCd)}s` : ''}</span>`;
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
    if (!s || !clearCards.has(s.id)) return host.showToast('아직 고착하지 못한 클리어 카드입니다.');
    if (s.id === 'snooze' && buffs.glowCd > 0) return host.showToast(`스누즈 준비 중 (${Math.ceil(buffs.glowCd)}초 남음)`);
    if (player.mp < s.mp) return host.showToast(`MP가 부족합니다! (필요 MP ${s.mp})`);

    if (s.id === 'flight') {
      player.mp -= s.mp;
      buffs.fly = 12;
      buffs.flyLand = false;
      SoundFX.magic();
      world.burst(player.x, player.y, '#bae6fd', 24);
      host.showToast('🦋 플라이트 해방! 12초간 투명 날개로 건물·호수 위를 자유롭게 비행합니다!');
    } else if (s.id === 'aqua') {
      player.mp -= s.mp;
      buffs.light = 16;
      buffs.wind = Math.max(buffs.wind, 10);
      SoundFX.heal();
      world.burst(player.x, player.y, '#38bdf8', 24);
      const next = getNextObjective();
      if (next) world.guideBeam(player.x, player.y, next.x, next.y, '#7dd3fc');
      host.showToast('💧 아쿠아 해방! 안개·열기 정화 + 길잡이 빛 + 다음 전투 선제 파동!');
    } else if (s.id === 'snooze') {
      if (player.mp >= player.maxMp) return host.showToast('MP가 이미 가득 차 있습니다!');
      buffs.glow = 7;
      buffs.glowCd = 15;
      buffs.glowAcc = 0;
      SoundFX.heal();
      world.burst(player.x, player.y, '#fef08a', 24);
      host.showToast('☁️ 스누즈 해방! 7초간 포근한 구름이 MP를 서서히 회복합니다!');
    } else if (s.id === 'repair') {
      if (player.hp >= player.maxHp) return host.showToast('체력이 이미 가득 차 있습니다!');
      player.mp -= s.mp;
      const rec = Math.min(player.maxHp - player.hp, 65);
      player.hp += rec;
      SoundFX.heal();
      world.burst(player.x, player.y, '#fbcfe8', 24);
      host.showToast(`🪡 리페어 해방! 따스한 빛의 실이 상처를 감싸 HP를 ${rec} 회복했습니다!`);
    } else if (s.id === 'gale') {
      player.mp -= s.mp;
      buffs.wind = 11;
      SoundFX.magic();
      world.burst(player.x, player.y, '#e0f2fe', 22);
      host.showToast('🌪 게일 해방! 이동 방해 무효화 & 다음 전투 선제 돌풍 충격!');
    } else if (s.id === 'siege') {
      if (buffs.shield) return host.showToast('이미 투명 크리스탈 결계가 펼쳐져 있습니다!');
      player.mp -= s.mp;
      buffs.shield = true;
      SoundFX.magic();
      world.burst(player.x, player.y, '#bae6fd', 22);
      host.showToast('🧊 시즈 해방! 투명 크리스탈 결계를 두른 채 다음 전투를 시작합니다!');
    }
    updateHUD(true);
    updateFieldBar();
  }

  // --------------------------------------------------------------------------
  // 6. 클리어 북 (31장 · 스포일러 차단 미고착 처리) · 기억 돌아보기 · 의상실
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
        clearCards: new Set(clearCards),
        bossDefeated
      };
    }
    memoryMode.active = true;
    memoryMode.cardId = cardId;

    currentMapId = MAPS[c.map] ? c.map : 'town_p3';
    const cur = getMap();
    player.x = clamp(c.x - 85, 60, cur.w - 60);
    player.y = clamp(c.y + 60, 60, cur.h - 60);
    kero.x = player.x - 26;
    kero.y = player.y - 18;
    if (isTomoyoFollowing()) placeTomoyoNearPlayer();
    player.targetPos = null;
    pendingTarget = null;
    encCd = 1.2;

    if ($('memoryBannerText')) $('memoryBannerText').textContent = Locale.t(`✨ [${cardName(c)}] 고착 기억 회상 중`);
    $('memoryBanner')?.classList.remove('hidden');
    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
    host.showToast(`✨ [${cardName(c)}] 투명 기운과 마주했던 그날의 기억으로 돌아왔습니다!`);
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
      clearCards = s.clearCards;
      bossDefeated = s.bossDefeated;
      kero.x = player.x - 26;
      kero.y = player.y - 18;
      if (isTomoyoFollowing()) placeTomoyoNearPlayer();
    }
    mode = 'explore';
    host.resize();
    updateHUD(true);
    updateFieldBar();
    host.showToast('현재의 꿈결 토모에다 마을로 돌아왔습니다.');
  }

  function openBook(silent = false) {
    host.openBookModal({
      title: 'THE CLEAR BOOK',
      sub: `클리어 카드 수집도: 💎 ${clearCards.size}/${CARD_ORDER.length} · 고착한 카드는 [✨ 기억 돌아보기]로 다시 체험 가능 · 닫기(Z)`,
      silent,
      renderGrid(grid) {
        CARD_ORDER.forEach((id, idx) => {
          const c = CARDS[id];
          if (!c) return;
          const owned = clearCards.has(id);
          const unlockedNow = isCardUnlockedByAct(id);
          const actLabel = `제${c.act || 1}막 개방`;
          const modeTag = c.acquireMode === 'event'
            ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/25 text-pink-200 border border-pink-300/50">✨ 일상</span>'
            : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-100 border border-sky-300/60">💎 배틀</span>';

          const div = document.createElement('div');
          div.className = `rounded-2xl p-2.5 flex flex-col items-center text-center border ${
            owned ? 'bg-sky-950/75 border-sky-300/70 shadow-lg' : 'bg-black/45 border-white/10 opacity-70'
          }`;
          div.innerHTML = owned
            ? `<div class="w-24 h-36 mb-2">${Art.getCard(c, false, true)}</div>
               <div class="flex items-center gap-1 mb-0.5"><span class="font-story font-bold text-sm text-sky-100">${cardRuby(c)}</span>${modeTag}</div>
               <div class="text-[11px] text-yellow-200 font-semibold">${Locale.t(c.skillName)} (MP ${c.mpCost})</div>
               <p class="text-[10px] text-sky-100/85 font-story mt-1 mb-2 leading-snug flex-1">${Locale.t(c.desc)}</p>
               <button data-replay="${id}" class="w-full py-1.5 rounded-xl bg-sky-600/45 hover:bg-sky-500/65 border border-sky-200/70 text-sky-50 text-[11px] font-story font-bold transition">✨ 기억 돌아보기</button>`
            : `<div class="w-24 h-36 mb-2 rounded-xl bg-black/55 border border-dashed border-sky-400/35 flex flex-col items-center justify-center text-sky-300/45"><span class="font-magic text-2xl">?</span><span class="text-[10px] mt-1 font-magic">NO.${String(idx + 1).padStart(2, '0')}</span></div>
               <div class="font-story font-bold text-xs text-slate-300">${unlockedNow ? '??? · 미고착' : `🔒 ${actLabel}`}</div>
               <div class="text-[10px] text-sky-200/80 font-story mt-0.5">${Locale.t(unlockedNow ? (DATA.mapAreaLabels?.[c.map] || '') : '스토리 진행 시 출현')}</div>
               <p class="text-[10px] text-cyan-100/70 font-story mt-1 leading-snug">${Locale.t(unlockedNow ? (c.rumor || '') : '현재 막의 투명한 기운을 고착하면 새로운 이야기가 열립니다.')}</p>`;
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
            clearCards,
            bossCleared: bossDefeated,
            unlockedCostumes: story.unlockedCostumes
          });
          const reformed = story.reformedCostumes.has(cos.id);
          const equipped = story.costumeId === cos.id;
          const passiveTxt = Rules.getCostumePassiveLabel(cos, reformed);
          const lockedHint = cos.unlockType === 'clear_count'
            ? '🔒 모험을 진행하며 카드를 더 많이 모으면 토모요가 지어 드려요.'
            : cos.unlockType === 'incident'
            ? '🔒 마을의 기묘한 사건을 돌파하면 해금됩니다.'
            : cos.unlockType === 'boss_clear'
            ? '🔒 마지막 시련을 돌파하면 해금됩니다.'
            : '🔒 모험을 진행하며 특정 조건을 달성하면 토모요가 선물해 드려요.';
          const card = document.createElement('div');
          card.className = `rounded-2xl p-3.5 border flex flex-col justify-between gap-2 transition ${
            equipped
              ? 'bg-sky-900/50 border-yellow-300 shadow-lg'
              : unlocked
              ? 'bg-indigo-950/75 border-sky-300/45'
              : 'bg-black/45 border-white/10 opacity-65'
          }`;
          card.innerHTML = `
            <div>
              <div class="flex items-center justify-between gap-2 mb-1">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-story font-bold text-sm ${unlocked ? 'text-yellow-200' : 'text-slate-300'} truncate">${unlocked ? Locale.t(cos.name) : '🔒 ??? (비밀 배틀 의상)'}</span>
                  ${unlocked && reformed ? '<span class="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-400/25 border border-yellow-300 text-[9px] font-bold text-yellow-200">★리폼</span>' : ''}
                </div>
                <span class="w-4 h-4 shrink-0 rounded-full border ${unlocked ? 'border-white/70' : 'border-white/25'}" style="background:${unlocked ? cos.dressColor : '#334155'}"></span>
              </div>
              <div class="text-xs font-bold ${!unlocked ? 'text-slate-400' : reformed ? 'text-yellow-200' : 'text-emerald-300'} mb-1">✦ ${unlocked ? Locale.t(passiveTxt) : '효과: 해금 후 공개'}</div>
              <p class="text-[11px] font-story ${unlocked ? 'text-sky-100/90' : 'text-slate-400'} leading-relaxed">${Locale.t(unlocked ? cos.tomoyoQuote : lockedHint)}</p>
            </div>
            <button ${!unlocked || equipped ? 'disabled' : ''} data-cos="${cos.id}" class="w-full py-2 rounded-xl text-xs font-story font-bold transition ${
              equipped
                ? 'bg-yellow-400/25 border border-yellow-300 text-yellow-200'
                : unlocked
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
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
  // 7. NPC 대화 · 카드 조우(일상 즉시 고착 vs 배틀) · 5막 전환 · 대단원 완결
  // --------------------------------------------------------------------------
  function talkNPC(npc) {
    const act = getCurrentStoryAct();

    if (npc.id === 'tomoyo') {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      updateHUD(true);
      SoundFX.heal();
      host.showToast('☕ 토모요의 홍차로 HP·MP가 완전 회복되었습니다!');

      const latest = story.securedOrder.length ? CARDS[story.securedOrder[story.securedOrder.length - 1]] : null;
      const filmMsg = latest
        ? `방금 [${cardName(latest)}] 카드를 고착하시던 투명한 빛이 카메라에 환상적으로 담겼답니다!`
        : '중학생이 되신 사쿠라의 새로운 꿈의 지팡이, 정말 보석처럼 눈부셔요! 따뜻한 홍차 드세요!';
      let openWardrobeAfter = false;

      vn.start([
        { speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: filmMsg },
        {
          speaker: '토모요',
          role: 'COSTUME DESIGNER',
          avatar: 'tomoyo',
          mood: 'happy',
          text: `현재 착용 중인 [${getCostumeObj().name}] 외에 지난 학기 의상과 새 클리어 드레스도 모두 준비되어 있어요. 의상실을 열어 보실래요?`,
          choices: [
            {
              label: '🎀 응! 마법 의상실 열어줘!',
              effect: () => { openWardrobeAfter = true; },
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '마음에 드는 의상을 골라 보세요! 오늘도 최고의 장면을 촬영해 드릴게요!' }]
            },
            {
              label: '고마워 토모요! 홍차만 마시고 바로 출발할게!',
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '네! 언제든 필요하실 때 저를 불러 주세요!' }]
            }
          ]
        }
      ], () => {
        if (openWardrobeAfter) openWardrobe();
      });
    } else if (npc.id === 'syaoran') {
      if (!story.talkedSyaoranP3) {
        story.talkedSyaoranP3 = true;
        story.syaoranTrust = Rules.clampTrust(story.syaoranTrust + 1, 3);
        updateHUD(true);
        vn.start([
          { speaker: '샤오랑', role: 'PARTNER', avatar: 'syaoran', mood: 'happy', text: '드디어 돌아왔어, 사쿠라. 이제 떨어져 있지 않고 같은 중학교에서 계속 네 곁에 있을 수 있어.' },
          { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'shy', text: '응, 샤오랑!! 다시 만나서 정말 기뻐! 투명해진 카드 때문에 조금 놀랐지만 샤오랑이 함께라면 절대 괜찮을 거야!' },
          { speaker: '샤오랑', role: 'PARTNER', avatar: 'syaoran', mood: 'serious', text: `당연하지. 현재 친밀도 ${story.syaoranTrust}/15! 배틀에서 [⚡샤오랑 원호]나 위기 엄호가 필요할 땐 언제든 나를 믿어 줘.` }
        ]);
      } else {
        const msg = bossDefeated
          ? '긴 모험이었지만, 마지막까지 사쿠라와 함께 걸어올 수 있어서 정말 행복했어. 앞으로도 계속 옆에 있을게.'
          : act >= 4
          ? `현재 친밀도 ${story.syaoranTrust}/15! 네 마력이 점점 깊어지고 있어. 무리하지 마, 무슨 일이 있어도 내가 네 등 뒤를 지킬 테니까.`
          : `지금까지 투명한 카드 ${clearCards.size}장을 고착했구나. 배틀 중 [⚡샤오랑 원호]로 결계와 반사막을 깨뜨릴 수 있으니 잊지 마!`;
        vn.start([{ speaker: '샤오랑', role: 'PARTNER', avatar: 'syaoran', mood: act >= 4 && !bossDefeated ? 'serious' : 'happy', text: msg }]);
      }
    } else if (npc.id === 'touya') {
      buffs.cocoaBuff = true;
      SoundFX.heal();
      updateHUD(true);
      host.showToast('☕ 토우야의 코코아! 다음 전투 공격력 +15% · 치명타 +10%!');
      const msg = bossDefeated
        ? '중학생 되자마자 한바탕 소동을 또 겪은 모양이군. 이제 좀 편하게 쉬어라, 괴물. 자 코코아.'
        : act >= 4
        ? '어이 괴물... 나한테도 요즘 새로운 힘이 조금씩 돌아오고 있어. 정말 위험할 땐 혼자 끌어안지 마라. 일단 코코아 마시고 기운 내.'
        : '중학생이 됐는데도 여전히 분주하게 뛰어다니는구나, 괴물. ...자, 따뜻한 코코아 마시고 다치지 않게 조심해라.';
      vn.start([
        { speaker: '토우야', role: 'BIG BROTHER', avatar: 'touya', mood: act >= 4 && !bossDefeated ? 'serious' : 'normal', text: msg },
        { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'happy', text: '괴물 아니거든! ...그래도 코코아 고마워, 오빠!' }
      ]);
    } else if (npc.id === 'yukito') {
      buffs.snackBuff = true;
      SoundFX.heal();
      updateHUD(true);
      host.showToast('🍙 유키토의 간식! 다음 전투 피해 22% 경감 · 매 턴 MP +3!');
      const msg = bossDefeated
        ? '사쿠라 덕분에 마을이 정말 포근하고 평화로워졌어! 중학교 생활도 신나게 즐기렴!'
        : '중학교 입학 축하해, 사쿠라! 요즘 유에도 사쿠라가 걱정돼서 자주 귀를 기울이고 있더라. 수제 샌드위치랑 주먹밥 챙겨 먹어!';
      vn.start([
        { speaker: '유키토', role: 'GENTLE FRIEND', avatar: 'yukito', mood: 'happy', text: msg },
        { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'happy', text: '와아, 유키토 오빠 간식 최고예요! 든든하게 먹고 힘낼게요!' }
      ]);
    } else if (npc.id === 'akiho') {
      const msg = bossDefeated
        ? '사쿠라 씨, 정말 고마워요! 앞으로도 우리 계속 같은 반 친구로 재미있는 책 많이 읽고 놀아요!'
        : act >= 4
        ? '사쿠라 씨... 요즘 저도 자꾸 신기한 꿈을 꿔요. 높은 곳에서 사쿠라 씨랑 똑같은 누군가를 바라보는 꿈인데... 사쿠라 씨랑 이야기하면 마음이 놓여요.'
        : '안녕하세요, 사쿠라 씨! 토모에다 중학교는 정말 따스하고 멋진 곳이에요! 시간 나실 때 저희 저택 대서고에도 꼭 놀러 오세요!';
      vn.start([
        { speaker: '아키호', role: 'NEW FRIEND', avatar: 'akiho', mood: act >= 4 && !bossDefeated ? 'worried' : 'happy', text: msg },
        { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'happy', text: '응, 아키호! 언제든 같이 놀자!' }
      ]);
    } else if (npc.id === 'kaito') {
      const recHp = Math.min(player.maxHp - player.hp, Math.round(player.maxHp * 0.3));
      const recMp = Math.min(player.maxMp - player.mp, Math.round(player.maxMp * 0.3));
      if (recHp > 0 || recMp > 0) {
        player.hp += recHp;
        player.mp += recMp;
        SoundFX.heal();
        updateHUD(true);
        host.showToast(`🫖 카이토의 향긋한 홍차 대접! (HP +${recHp} · MP +${recMp})`);
      }
      const msg = bossDefeated
        ? '사쿠라 아가씨, 그동안의 무례를 용서해 주셔서 진심으로 감사드립니다. 오늘도 아키호 아가씨와 함께하실 최고의 홍차를 우려 두었습니다.'
        : act >= 4
        ? '어서 오십시오, 사쿠라 아가씨. 아키호 아가씨께서 늘 사쿠라 아가씨 이야기를 하십니다. ...시간은 참으로 빠르게 흐르는군요. 따뜻한 홍차 한 잔 드시고 가십시오.'
        : '어서 오십시오, 사쿠라 아가씨. 저택에 오신 것을 환영합니다. 아키호 아가씨를 위해 구운 스콘과 향긋한 홍차를 준비해 두었습니다.';
      vn.start([{ speaker: '카이토', role: 'BUTLER', avatar: 'kaito', mood: 'happy', text: msg }]);
    } else if (npc.id === 'momo') {
      if (bossDefeated || clearCards.has('blank')) {
        vn.start([
          { speaker: '모모', role: 'GUARDIAN OF THE BOOK', avatar: 'momo', mood: 'happy', text: bossDefeated ? '정말 근사한 결말이었어, 사쿠라! 가끔 초콜릿이라도 들고 대서고에 놀러 오렴~' : '사쿠라, 네 상냥함과 용기라면 분명 모두를 구할 수 있을 거야. 힘내렴!' }
        ]);
      } else {
        vn.start([
          { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'normal', text: '아키호가 아끼는 토끼 인형 모모다! 보들보들하고 정말 귀엽네... 어라? 방금 눈이 반짝인 것 같기도 하고?' }
        ]);
      }
    }
  }

  function buildCardIntro(c) {
    if (toArr(c.specialIntro).length) {
      return toArr(c.specialIntro);
    }
    const wc = CARDS[c.weakness];
    const lines = [
      { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'normal', text: `${c.zone}... ${c.flavor}` }
    ];
    if (memoryMode.active) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `그날 [${cardName(c)}] 카드를 고착하던 기억이야! 다시 한 번 크리스탈 프리즘 락을 체험해 보자!` });
    } else if (story.securedOrder.length === 0) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `틀림없어, 새로운 투명 카드 [${cardName(c)}]의 기운이야! 저항력을 50% 이하로 깎고 [💎 프리즘 고착!]으로 두 쐐기를 맞춰 고착해 보자!` });
    } else if (wc && clearCards.has(wc.id)) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `[${cardName(c)}]의 투명한 기운이야! 마침 약점인 [${cardName(wc)}] 카드를 가지고 있잖아! 상성을 살려 공략하자!` });
    } else {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `[${cardName(c)}]의 기운이 실체화하고 있어! 행동 예고를 보고 방어·결계로 맞서며 고착하자!` });
    }
    return lines;
  }

  function finishCardSecure(c) {
    if (memoryMode.active) {
      vn.start([{ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `[${cardName(c)}] 고착의 기억, 다시 봐도 반짝반짝 멋지네! 이제 원래 마을로 돌아갈까?` }], exitMemoryMode);
      return;
    }

    const prevAct = getCurrentStoryAct();
    clearCards.add(c.id);
    if (!story.securedOrder.includes(c.id)) story.securedOrder.push(c.id);
    const nextAct = getCurrentStoryAct();

    let tomoyoJustJoined = false;
    if (prevAct === 1.0 && nextAct >= 1.5) {
      tomoyoJustJoined = true;
      story.tomoyoFollowing = true;
      story.unlockedCostumes.add('crystal_dream');
      story.costumeId = 'crystal_dream';
    }
    if (clearCards.size >= 12) story.unlockedCostumes.add('clockwork_wonder');
    if (clearCards.size >= 22) story.unlockedCostumes.add('prism_snow');

    // 막 전환마다 샤오랑과의 유대 자연 상승 (최대 15)
    if (Math.floor(nextAct) > Math.floor(prevAct)) {
      story.syaoranTrust = Rules.clampTrust(story.syaoranTrust + 1, 3);
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
    autoSave(tomoyoJustJoined ? '게일 고착 · 토모요 합류' : `${cardName(c)} 고착`);

    // 5막 단계 개방 배너
    if (prevAct === 1.0 && nextAct >= 1.5) showChapterOnce('PART III · ACT I', '꿈의 지팡이와 크리스탈 드레스');
    if (prevAct < 2 && nextAct >= 2) showChapterOnce('PART III · ACT II', '새로운 친구와 투명한 날개');
    if (prevAct < 3 && nextAct >= 3) showChapterOnce('PART III · ACT III', '깊어지는 꿈결의 서고');
    if (prevAct < 4 && nextAct >= 4) showChapterOnce('PART III · ACT IV', '흔들리는 시간의 톱니바퀴');
    if (prevAct < 5 && nextAct >= 5) showChapterOnce('PART III · ACT V', '꿈의 끝에서');
    if (prevAct < 6 && nextAct >= 6) showChapterOnce('PART III · GRAND FINALE', '모두의 내일을 여는 마법');

    const lines = [];
    if (tomoyoJustJoined && toArr(DATA.dialogues?.tomoyoRejoin).length) {
      lines.push(...toArr(DATA.dialogues.tomoyoRejoin));
    } else {
      lines.push(
        { speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'happy', text: `[${cardName(c)}] 카드를 고착했어! 투명하게 반짝여서 정말 보석 같아!` },
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `꿈의 마력이 더욱 깊어졌어! (💎 꿈마력 Lv.${player.lv} · 최대 HP ${player.maxHp} · 최대 MP ${player.maxMp})` }
      );
    }

    if (clearCards.size === 12) {
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '열두 장 돌파 기념으로 [🕰 클락워크 원더 드레스]가 의상실에 해금되었어요! 언제든 갈아입어 보세요!' });
    } else if (clearCards.size === 22) {
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '스물두 장 돌파 기념 최고 걸작 [❄️ 프리즘 스노우 케이프]가 의상실에 준비되었답니다!' });
    }

    if (prevAct < 2 && nextAct >= 2 && toArr(DATA.dialogues?.act2Start).length) {
      lines.push(...toArr(DATA.dialogues.act2Start));
    } else if (prevAct < 3 && nextAct >= 3 && toArr(DATA.dialogues?.act3Start).length) {
      lines.push(...toArr(DATA.dialogues.act3Start));
    } else if (prevAct < 4 && nextAct >= 4 && toArr(DATA.dialogues?.act4Start).length) {
      lines.push(...toArr(DATA.dialogues.act4Start));
    } else if (prevAct < 5 && nextAct >= 5 && toArr(DATA.dialogues?.act5Start).length) {
      lines.push(...toArr(DATA.dialogues.act5Start));
    } else if (prevAct < 6 && nextAct >= 6 && BOSS_CLEAR) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `서른한 장의 클리어 카드가 전부 모였어!! 남쪽 [${BOSS_CLEAR.zone}]에서 거대한 시계 마법진이 열리고 있어!` });
    }

    vn.start(lines);
  }

  function finishBossVictory() {
    bossDefeated = true;
    recalcPower(true);
    updateHUD(true);
    updateFieldBar();
    autoSave('제3부 대단원 완결');

    vn.start(toArr(DATA.dialogues?.finalVictory), () => {
      mode = 'ending';
      updateFieldBar();
      host.showEnding({
        sub: 'TRILOGY GRAND FINALE · CLEAR CARD COMPLETE',
        title: '절대 괜찮아질 거야 — 황혼 · 별빛 · 꿈결의 완결',
        summaryHtml:
          `황혼의 <b>크로우 카드 19장</b>, 별빛의 <b>사쿠라 카드 19장</b>, 그리고 꿈결의 <b>클리어 카드 31장</b>까지!<br/>` +
          `사쿠라와 소중한 친구들은 누구 하나 잃지 않고 모두의 행복한 내일을 열어젖혔습니다.<br/>` +
          `<span class="text-sky-200 font-bold mt-2 inline-block">💎 최종 꿈마력 Lv.${player.lv} · 최대 HP ${player.maxHp} · 최대 MP ${player.maxMp} · ⚡ 샤오랑 친밀도 ${story.syaoranTrust}/15</span><br/>` +
          `<span class="text-yellow-200 text-xs mt-1.5 inline-block">✨ 클리어 북에서 31장 전원의 기억을 언제든 되돌아보거나 평화로운 마을을 자유롭게 산책할 수 있습니다.</span>`
      });
    });
  }

  function handleDefeat() {
    if (memoryMode.active) return exitMemoryMode();
    if (!story.tomoyoFollowing) {
      currentMapId = MAPS.house_f1 ? 'house_f1' : 'town_p3';
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
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'worried', text: '사쿠라! 정신 차려! 일단 집 1층 거실로 데려왔어!' },
        { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: '식탁에서 쉬었으니 기운이 다 돌아왔을 거야. 중학교 앞 벚꽃길의 첫 투명 기운에 다시 도전하자! (HP · MP 완전 회복)' }
      ]);
      return;
    }

    currentMapId = 'town_p3';
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

  // --------------------------------------------------------------------------
  // 8. 맵 전환 · 상호작용 · 탐험 업데이트 · 메인 틱
  // --------------------------------------------------------------------------
  function transitionMap(mid, sx, sy) {
    if (!MAPS[mid]) return;
    if ((mid === 'mansion_hall' || mid === 'mansion_lib') && getCurrentStoryAct() < 2) {
      portalCd = 0.8;
      host.showToast('🏰 곧 새로운 이웃이 이사 올 것 같은 큰 저택이다! (제2막부터 방문 가능)');
      return;
    }

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
      if (isTomoyoFollowing()) placeTomoyoNearPlayer();

      host.resize();
      SoundFX.encounter();
      updateHUD(true);
      const cnt = countUnsecuredInMap(mid);
      host.showToast(
        mid === 'town_p3'
          ? '꿈결의 토모에다 마을로 나왔습니다.'
          : `${getMap().name}에 들어왔습니다.${cnt ? ` (투명 기운 ${cnt}곳)` : ''}`
      );
      if (fade) fade.style.opacity = '0';
    }, 170);
  }

  function checkNearby() {
    nearbyTarget = null;
    let bestScore = 94;
    const cur = getMap();

    for (const p of toArr(cur.portals)) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 64 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'portal', obj: p }; }
    }
    // 집 1층 거실 식탁 무료 휴식 안전망 (토모요 합류 전에도 안전하게 회복!)
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
      const d = Math.hypot(player.x - c.x, player.y - c.y);
      if (d < 88 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'card', obj: c }; }
    }
    if (isFinalUnlocked() && BOSS_CLEAR && currentMapId === BOSS_CLEAR.map) {
      const d = Math.hypot(player.x - BOSS_CLEAR.x, player.y - BOSS_CLEAR.y);
      if (d < 98 && d < bestScore) { bestScore = d; nearbyTarget = { type: 'boss', obj: BOSS_CLEAR }; }
    }
    for (const n of NPCS) {
      if (!isNpcVisible(n)) continue;
      const np = getNpcPos(n);
      const d = Math.hypot(player.x - np.x, player.y - np.y);
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
          : nearbyTarget.type === 'rest_table'
          ? '🍵 거실 식탁에서 쉬어가기 (X)'
          : nearbyTarget.type === 'npc'
          ? `${Utils.withParticle(Locale.t(nearbyTarget.obj.name), '과/와')} 대화 (X)`
          : nearbyTarget.type === 'boss'
          ? '🕰 최후의 시계 마법진 맞서기 (X)'
          : nearbyTarget.obj.acquireMode === 'event'
          ? '✨ 포근한 빛 조사하기 (X)'
          : '💎 투명한 기운 조사하기 (X)'
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
      world.burst(player.x, player.y, '#bae6fd', 18);
      updateHUD(true);
      host.showToast('🍵 거실 식탁에서 잠시 숨을 돌렸습니다! (HP · MP 완전 회복)');
    } else if (t.type === 'npc') {
      talkNPC(t.obj);
    } else if (t.type === 'card') {
      const c = t.obj;
      if (c.acquireMode === 'event') {
        const evLines = toArr(c.eventLines).length
          ? toArr(c.eventLines)
          : [{ speaker: '사쿠라', role: 'DREAM MASTER', avatar: 'sakura', mood: 'happy', text: `${c.zone}... ${c.flavor}` }];
        vn.start(evLines, () => {
          battle.playEventSecure(c, () => finishCardSecure(c));
        });
      } else {
        vn.start(buildCardIntro(c), () => battle.start(c));
      }
    } else if (t.type === 'boss') {
      const intro = toArr(DATA.dialogues?.finalIntro).slice();
      if (story.syaoranTrust >= 3 && DATA.dialogues?.syaoranFinalCheer) {
        intro.unshift(...toArr(DATA.dialogues.syaoranFinalCheer));
      }
      vn.start(intro, () => battle.start(BOSS_CLEAR));
    }
  }

  function updateExplore(dt) {
    world.updateAmbience(dt);
    if (mode !== 'explore' || host.isAnyModalOpen?.()) return;

    if (encCd > 0) encCd = Math.max(0, encCd - dt);
    if (portalCd > 0) portalCd = Math.max(0, portalCd - dt);

    const prevSig = `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`;
    const colOpts = { ignoreObs: false, mazeActive: false };

    if (buffs.fly > 0) {
      buffs.fly = Math.max(0, buffs.fly - dt);
      if (Math.random() < 0.35) world.burst(player.x, player.y + 8, '#bae6fd', 1);
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
        world.burst(player.x + (Math.random() - 0.5) * 28, player.y + (Math.random() - 0.5) * 20, '#fef08a', 1);
      }
      if (buffs.glowAcc >= 0.5) {
        buffs.glowAcc -= 0.5;
        player.mp = Math.min(player.maxMp, player.mp + 4);
      }
    }
    if (prevSig !== `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`) {
      updateFieldBar();
    }

    const flying = buffs.fly > 0 || buffs.flyLand;
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

    const moveCol = { ignoreObs: flying, mazeActive: false };
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const sp = getMoveSpeed();
      dx /= len;
      dy /= len;
      const nx = player.x + dx * sp * dt;
      const ny = player.y + dy * sp * dt;
      if (!world.isColliding(getMap(), currentMapId, nx, player.y, moveCol)) player.x = nx;
      if (!world.isColliding(getMap(), currentMapId, player.x, ny, moveCol)) player.y = ny;
      player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      player.walk += dt * 11;
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
      if (nearbyTarget.type === 'card' && d < 46) return triggerInteract();
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
    const activeCards = inPrologue
      ? []
      : CARD_ORDER
          .filter((id) => isCardActiveOnMap(id) && CARDS[id]?.map === currentMapId)
          .map((id) => ({ ...CARDS[id], pos: { x: CARDS[id].x, y: CARDS[id].y } }));

    const visibleNpcs = NPCS.filter(isNpcVisible).map((n) => (
      n.id === 'tomoyo' && isTomoyoFollowing() ? { ...n, x: tomoyoPos.x, y: tomoyoPos.y } : n
    ));

    const finalReady = isFinalUnlocked();
    const bossObj = finalReady && BOSS_CLEAR && currentMapId === BOSS_CLEAR.map
      ? { type: 'kaito', x: BOSS_CLEAR.x, y: BOSS_CLEAR.y, label: '🕰 최후의 시계 마법진' }
      : null;
    const clockCircle = currentMapId === 'town_p3' && BOSS_CLEAR
      ? { x: BOSS_CLEAR.x, y: BOSS_CLEAR.y, ready: !!finalReady }
      : null;

    world.render(now, {
      part: 3,
      map: cur,
      mapId: currentMapId,
      zones: ZONES,
      player,
      kero,
      buffs,
      costume: getCostumeObj(),
      anomaly: {},
      activeCards,
      activeIncidents: [],
      npcs: visibleNpcs,
      boss: bossObj,
      clockCircle,
      nextObjective: getNextObjective(),
      portalCounts: countUnsecuredInMap,
      flags: {
        hideWand: inPrologue,
        eternalDarkness: finalReady,
        showTarget: mode === 'explore'
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. 제3부 새 시작 (중학교 입학식 · 사쿠라의 방 프롤로그) & 라이프사이클 반환
  // --------------------------------------------------------------------------
  function startNewAdventure(shared = null, fromInterlude = false) {
    Timers.clearAll();
    vn.finish(true);
    battle.forceClose();
    memoryMode = { active: false, cardId: null, snapshot: null };
    inPrologue = true;
    $('memoryBanner')?.classList.add('hidden');
    $('endingBox')?.classList.add('hidden');

    clearCards = new Set();
    bossDefeated = false;
    shownActs = new Set();
    story.syaoranTrust = 5;
    story.securedOrder = [];
    story.costumeId = 'mschool_uniform';
    story.unlockedCostumes = new Set(['mschool_uniform']);
    story.reformedCostumes = new Set();
    story.tomoyoFollowing = false;
    story.talkedSyaoranP3 = false;

    if (shared) applySharedState(shared);
    // 3부 서막은 중학교 입학식 교복 차림으로 자연스럽게 시작
    story.costumeId = 'mschool_uniform';

    currentMapId = MAPS.house_f2 ? 'house_f2' : 'town_p3';
    recalcPower(false);
    player.x = currentMapId === 'house_f2' ? 380 : 385;
    player.y = currentMapId === 'house_f2' ? 290 : 465;
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

    host.resize();
    updateHUD(true);
    showChapterOnce('PART III · PROLOGUE', '벚꽃 흩날리는 중학교 입학식');

    const prologueLines = toArr(DATA.dialogues?.prologue);
    vn.start(prologueLines, () => {
      inPrologue = false;
      encCd = 1.2;
      world.burst(player.x, player.y, '#bae6fd', 26);
      host.showToast(
        fromInterlude
          ? '💎 제3부 꿈결의 토모에다 시작! 마을로 나가 중학교 앞 벚꽃길의 투명한 기운을 조사하세요!'
          : '💎 꿈의 열쇠 획득! 마을로 나가 중학교 앞 벚꽃길의 투명한 기운을 조사하세요!'
      );
      autoSave('제3부 모험 시작');
    });
  }

  return {
    part: 3,
    battleHooks: {
      getData: () => DATA,
      getCards: () => CARDS,
      getCardOrder: () => CARD_ORDER,
      getPlayer: () => player,
      getOwnedCards: () => clearCards,
      getSakuraCards: () => new Set(),
      getCostumeId: () => story.costumeId,
      isCostumeReformed: () => isCostumeReformed(),
      getSyaoranTrust: () => story.syaoranTrust,
      getFieldBuffs: () => buffs,
      onHUDUpdate: () => updateHUD(true),
      onModeChange: (m) => { mode = m; updateFieldBar(); },
      onVictory: (target) => { if (target.isBoss) finishBossVictory(); else finishCardSecure(target); },
      onDefeat: handleDefeat,
      onFlee: () => { encCd = 2.0; host.showToast('잠시 물러나 꿈의 마력을 재정비합니다.'); }
    },
    start({ saved, shared, fromInterlude } = {}) {
      if (saved && saved.part === 3) {
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
      story.syaoranTrust = Rules.clampTrust(story.syaoranTrust + delta, 3);
      updateHUD(true);
    },
    onCostumeBadgeClick() {
      const cos = getCostumeObj();
      const reformed = isCostumeReformed();
      const passive = Rules.getCostumePassiveLabel(cos, reformed);
      if (!isTomoyoFollowing()) {
        host.showToast(`🎀 현재 착용: ${cos.name} (${passive}) · 먼저 중학교 앞 첫 투명 기운을 고착하세요!`);
      } else {
        host.showToast(`🎀 현재 착용: ${cos.name}${reformed ? ' ★리폼' : ''} (${passive}) · 의상 교체와 홍차 회복은 동행 중인 토모요에게!`);
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
            const c = CARDS[id];
            if (Math.hypot(wx - c.x, wy - c.y) < 58) {
              pendingTarget = { type: 'card', obj: c };
              player.targetPos = { x: c.x, y: c.y };
              return;
            }
          }
        }
        if (isFinalUnlocked() && BOSS_CLEAR && currentMapId === BOSS_CLEAR.map && Math.hypot(wx - BOSS_CLEAR.x, wy - BOSS_CLEAR.y) < 62) {
          pendingTarget = { type: 'boss', obj: BOSS_CLEAR };
          player.targetPos = { x: BOSS_CLEAR.x, y: BOSS_CLEAR.y };
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
      if (!next) host.showToast('케로: 서른한 장의 클리어 카드까지 전부 완전 정복이야! 토모에다가 정말 평화로워!');
      else if (next.isBoss) host.showToast(`케로: 준비 끝! 남쪽 [${BOSS_CLEAR.zone}]으로 가서 마지막 결전을 치르자!`);
      else {
        const tc = next.targetCard || next;
        host.showToast(`케로: [${tc.zone}] 쪽에서 "${tc.rumor}" 같은 투명한 기운이 느껴져!`);
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
