/**
 * ============================================================================
 * 카드캡터 3부작 — 제1부 고유 컨트롤러 (chapter1.js) — v.0.3.0
 * - 통합 런처(index.html)의 host 인터페이스와 연동되는 제1부(크로우 카드 편) 모듈
 * - 지하 서재 붉은 책 & 윈디 비산 인터랙티브 프롤로그 (케로·이상 현상 등장 시점 제어)
 * - 10개 층별/구역별 맵(집 3층 · 학교 3구역 · 신사 3구역 · 마을) 및 구 4맵 호환
 * - 19장 크로우 카드 이상 현상 · 8벌 마법 의상실 · 크로우 북 기억 돌아보기
 * - NPC 역할 분담 (토모요 회복+선택형 의상실 / 토우야 공격버프+미러 특별 대사 /
 *   유키토 방어버프+유에 강림 시 동일체 숨김 / 샤오랑 사건 공투+친밀도 원호)
 * - 제1부 엔딩에서 제2부(별빛의 토모에다)로 바로 이어가는 원클릭 직결 지원
 * ============================================================================
 */

export function createChapter(host, DATA) {
  const { engines, world, vn, battle, keys } = host;
  const { Timers, Utils, Locale, Art, SoundFX, Rules } = engines;
  const { $, toArr, clamp, cardName, cardRuby } = Utils;

  // --------------------------------------------------------------------------
  // 1. 제1부 데이터 바인딩 & 기본 상수
  // --------------------------------------------------------------------------
  const CARDS = DATA.cards || {};
  const CARD_ORDER = toArr(DATA.cardOrder);
  const MAPS = DATA.maps || {};
  const ZONES = toArr(DATA.zones);
  const NPCS = toArr(DATA.npcs);
  const BOSS_YUE = DATA.bossYue;
  const QUICK_SLOTS = toArr(DATA.fieldQuickSlots);

  const FALLBACK_COSTUMES = [
    {
      id: 'sakura_dress',
      name: '🌸 벚꽃 배틀 드레스',
      unlockType: 'default',
      unlockHint: '기본 지급 의상',
      dressColor: '#f472b6',
      accentColor: '#fff1f2',
      hatType: 'beret',
      hatColor: '#f43f5e',
      passive: '최대 MP +5',
      tomoyoQuote: '황혼빛과 가장 잘 어울리는 분홍빛 기본 배틀 의상이에요!'
    }
  ];

  const dataCostumes = toArr(DATA.costumes);
  const defaultP1 = toArr(Rules?.DEFAULT_COSTUMES_P1);
  const COSTUMES = dataCostumes.length >= 8
    ? dataCostumes
    : (defaultP1.length ? defaultP1 : (dataCostumes.length ? dataCostumes : FALLBACK_COSTUMES));

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
  let inPrologue = false;
  let lastHudSig = '';
  let memoryMode = { active: false, cardId: null, snapshot: null };

  const story = {
    metSyaoran: false,
    syaoranTrust: 0,
    seenEncounters: new Set(),
    sealedOrder: [],
    costumeId: 'sakura_dress'
  };

  const player = {
    x: 385,
    y: 465,
    dir: 'down',
    hp: 100,
    maxHp: 100,
    mp: 105,
    maxMp: 105,
    lv: 1,
    mult: 1,
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
      { x: 135, y: 205, name: '토모요?', hair: '#3b0764', dress: '#c084fc', popped: false },
      { x: 345, y: 205, name: '케로?', hair: '#facc15', dress: '#fde047', popped: false }
    ]
  };

  // --------------------------------------------------------------------------
  // 3. 핵심 헬퍼 (맵 · 카드 위치 · 의상 · 스탯 · 동일체 규칙)
  // --------------------------------------------------------------------------
  const getMap = () => MAPS[currentMapId] || MAPS.town;
  const isCardActiveOnMap = (id) => (
    memoryMode.active ? (memoryMode.cardId === id) : (id !== 'windy' && !ownedCards.has(id))
  );
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

  /** 시계탑에 유에가 강림한 동안 유키토(청명) 숨김 — 원작 동일체 고증 */
  function isNpcVisible(n) {
    if (n.map !== currentMapId) return false;
    const yueSummoned = ownedCards.size === CARD_ORDER.length && !yueDefeated && !memoryMode.active;
    if (n.id === 'yukito' && yueSummoned) return false;
    return true;
  }

  const getCostumeObj = () => COSTUMES.find((c) => c.id === story.costumeId) || COSTUMES[0];

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

  function getZoneName() {
    if (currentMapId !== 'town') return getMap()?.name || '황혼의 토모에다';
    for (const z of ZONES) {
      if (player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h) {
        return z.name;
      }
    }
    return '황혼의 토모에다';
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
          if (d < bestD) {
            bestD = d;
            best = { ...c, x: p.x, y: p.y };
          }
        }
        return best;
      }
      const tc = rem[0];
      const portals = toArr(getMap()?.portals);
      const direct = portals.find((p) => p.targetMap === tc.map)
        || portals.find((p) => MAP_GROUPS[p.targetMap]?.includes(tc.map))
        || portals.find((p) => p.targetMap === 'town')
        || portals[0];
      return direct ? { isPortal: true, x: direct.x, y: direct.y, zone: tc.zone, targetCard: tc } : tc;
    }
    if (!yueDefeated && !memoryMode.active && BOSS_YUE) {
      if (currentMapId !== 'town') {
        const portals = toArr(getMap()?.portals);
        const p = portals.find((x) => x.targetMap === 'town') || portals[0];
        return p ? { isPortal: true, isBoss: true, x: p.x, y: p.y, zone: BOSS_YUE.zone, targetCard: BOSS_YUE } : BOSS_YUE;
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
  // 4. 저장 페이로드 구성 & 자동 저장 & 세이브 적용
  // --------------------------------------------------------------------------
  function getSavePayload() {
    const s = memoryMode.active && memoryMode.snapshot ? memoryMode.snapshot : null;
    return {
      version: 4,
      part: 1,
      yueDefeated: s ? s.yueDefeated : yueDefeated,
      currentMapId: s ? s.currentMapId : currentMapId,
      ownedCards: Array.from(s ? s.ownedCards : ownedCards),
      shownActs: Array.from(shownActs),
      story: {
        metSyaoran: story.metSyaoran,
        syaoranTrust: story.syaoranTrust,
        seenEncounters: Array.from(story.seenEncounters),
        sealedOrder: story.sealedOrder.slice(),
        costumeId: story.costumeId
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
    host.saveChapter(1, getSavePayload(), reason);
  }

  function applySavePayload(saved) {
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
    story.syaoranTrust = Number(st.syaoranTrust) || 0;
    story.seenEncounters = new Set(toArr(st.seenEncounters));
    story.sealedOrder = toArr(st.sealedOrder);
    story.costumeId = st.costumeId || 'sakura_dress';

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
    const sig = `${Locale.getMode()}|${player.lv}|${Math.ceil(player.hp)}|${player.maxHp}|${Math.ceil(player.mp)}|${player.maxMp}|${ownedCards.size}|${story.syaoranTrust}|${zn}|${yueDefeated}|${memoryMode.active}`;
    if (!force && sig === lastHudSig) return;
    lastHudSig = sig;

    if ($('hudMagicLv')) $('hudMagicLv').textContent = `마력 Lv.${player.lv}`;
    if ($('hudTrustBadge')) $('hudTrustBadge').textContent = `⚡친밀 ${story.syaoranTrust}`;
    if ($('hudHpBar')) $('hudHpBar').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    if ($('hudMpBar')) $('hudMpBar').style.width = `${Math.max(0, (player.mp / player.maxMp) * 100)}%`;
    if ($('hudHpNum')) $('hudHpNum').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    if ($('hudMpNum')) $('hudMpNum').textContent = `${Math.ceil(player.mp)}/${player.maxMp}`;
    if ($('hudCardCount')) $('hudCardCount').textContent = `${ownedCards.size}/${CARD_ORDER.length}`;
    if ($('hudZone')) $('hudZone').textContent = Locale.t(zn);

    const rem = getUnsealed().length;
    if (memoryMode.active) {
      if ($('hudActLabel')) $('hudActLabel').textContent = 'MEMORY REPLAY';
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`[${cardName(CARDS[memoryMode.cardId])}]의 그날의 이상 현상을 다시 체험 중`);
    } else if (rem > 0) {
      if ($('hudActLabel')) {
        $('hudActLabel').textContent = story.sealedOrder.length < 6
          ? 'PART I · ACT I · THE AWAKENING'
          : story.sealedOrder.length < 12
          ? 'PART I · ACT II · RISING MAGIC'
          : 'PART I · ACT III · DEEPENING DUSK';
      }
      if ($('hudQuest')) $('hudQuest').textContent = Locale.t(`황혼의 토모에다 곳곳의 이상 현상을 조사하라 (남은 기운 ${rem}곳)`);
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
      host.showToast('플라이 해방! 12초간 건물·호수·미로 벽 위를 자유롭게 비행합니다!');
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
  // 6. 크로우 북 · 기억 돌아보기 · 8벌 마법 의상실
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
      sub: `봉인 현황: ${ownedCards.size}/${CARD_ORDER.length} · 봉인한 카드의 [✨ 기억 돌아보기]로 그날의 이상 현상을 다시 체험할 수 있습니다 · 닫기(Z)`,
      silent,
      renderGrid(grid) {
        CARD_ORDER.forEach((id, idx) => {
          const c = CARDS[id];
          if (!c) return;
          const owned = ownedCards.has(id);
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
               <div class="font-story font-bold text-xs text-slate-300">??? · 미봉인</div>
               <div class="text-[10px] text-amber-200/80 font-story mt-0.5">${Locale.t(DATA.mapAreaLabels?.[c.map] || '')}</div>
               <p class="text-[10px] text-cyan-100/70 font-story mt-1 leading-snug">${Locale.t(c.rumor || '')}</p>`;
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
      onHeal() {
        player.hp = player.maxHp;
        player.mp = player.maxMp;
        SoundFX.heal();
        updateHUD(true);
        host.showToast('☕ 토모요의 따뜻한 홍차로 HP·MP가 완전 회복되었습니다!');
      },
      renderGrid(grid) {
        COSTUMES.forEach((cos) => {
          const unlocked = Rules.isCostumeUnlocked(cos, { ownedCards, bossCleared: yueDefeated });
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
  // 7. NPC 대화 · 카드 조우 · 봉인 완료 · 유에 최종 심판
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
        : '황혼빛 아래 마법 의상이 정말 눈부셔요! 따뜻한 홍차 드시고 기운 내세요!';
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
              reply: [{ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '네! 멋진 활약, 오늘도 응원할게요!' }]
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
              {
                label: '알려줘서 고마워, 샤오랑! 함께 마을을 지키자!',
                trustDelta: 1,
                reply: [{ speaker: '샤오랑', role: 'RIVAL', avatar: 'syaoran', mood: 'shy', text: '무, 무슨 소리야! ...하지만 위급할 땐 서로 도울 수밖에 없겠지.' }]
              },
              {
                label: '나도 절대 지지 않을 거야!',
                trustDelta: 0,
                reply: [{ speaker: '샤오랑', role: 'RIVAL', avatar: 'syaoran', mood: 'serious', text: '그래, 그 기세로 끝까지 해 보라고.' }]
              }
            ]
          }
        ]);
      } else {
        const statusMsg = yueDefeated
          ? '달의 심판자 유에까지 이겨내다니... 정말 대단해, 사쿠라.'
          : tr >= 3
          ? `현재 친밀도 ${tr}! 배틀 중 [⚡샤오랑 원호]와 위기 시 자동 엄호까지 내가 책임지고 등 뒤를 지킬게!`
          : tr >= 2
          ? `현재 친밀도 ${tr}! 이제 배틀 중 [⚡샤오랑 원호]를 누르면 내 부적 [뇌제초래]로 결계와 반사막을 깨뜨려 줄게!`
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
      if (syaEnc.trustBonus) story.syaoranTrust += syaEnc.trustBonus;
      lines.push(...toArr(syaEnc.lines));
      return lines;
    }

    lines.push({ speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'normal', text: `${c.zone}... ${c.flavor}` });
    if (memoryMode.active) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `그날 [${cardName(c)}]와 마주했던 기억이야! 다시 한 번 봉인의 순간을 체험해 보자!` });
    } else if (story.sealedOrder.length === 0) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `틀림없어, 크로우 카드 [${cardName(c)}]의 실체야! 저항력을 50% 이하로 깎아야 봉인 마법진이 열려!` });
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

    ownedCards.add(c.id);
    if (!story.sealedOrder.includes(c.id)) story.sealedOrder.push(c.id);
    recalcPower(true);
    encCd = 1.0;
    updateHUD(true);
    updateFieldBar();
    autoSave(`${cardName(c)} 봉인`);

    if (story.sealedOrder.length === 6) showChapterOnce('ACT II · RISING MAGIC', '깨어나는 마력');
    if (story.sealedOrder.length === 12) showChapterOnce('ACT III · DEEPENING DUSK', '깊어지는 황혼');
    if (ownedCards.size === CARD_ORDER.length) showChapterOnce('FINAL ACT · JUDGMENT', '최후의 심판');

    const rem = getUnsealed();
    const lines = [
      { speaker: '사쿠라', role: 'CARDCAPTOR', avatar: 'sakura', mood: 'happy', text: `다행이야... [${cardName(c)}] 카드를 봉인하니까 이상 현상도 말끔히 가라앉았어!` },
      { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'happy', text: `마력이 한층 깊어졌어! (마력 Lv.${player.lv} · 최대 HP ${player.maxHp} · 최대 MP ${player.maxMp})` }
    ];

    if (c.id === 'watery') lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '사쿠라! 워터리를 봉인하셨군요! 의상실에 [🐸 개구리 우비 슈트]가 해금되었어요!' });
    if (c.id === 'thunder') lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '사쿠라! 선더를 봉인하셨군요! 의상실에 [🐱 고양이 귀 번개 슈트]가 해금되었어요!' });
    if (ownedCards.has('fly') && ownedCards.has('jump') && (c.id === 'fly' || c.id === 'jump')) {
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '하늘을 가르는 [🪽 하늘빛 날개 드레스]가 의상실에 준비되었어요!' });
    }
    if ((c.id === 'mirror' || c.id === 'flower') && !(ownedCards.has('mirror') && ownedCards.has('flower'))) {
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '사랑스러운 [🎀 앨리스 메이드 드레스]가 의상실에 해금되었어요!' });
    }
    if (ownedCards.has('illusion') && ownedCards.has('maze') && (c.id === 'illusion' || c.id === 'maze')) {
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '장난스러운 [🃏 피에로 매직 슈트]가 의상실에 준비되었어요!' });
    }
    if (ownedCards.size === 12) {
      lines.push({ speaker: '토모요', role: 'COSTUME DESIGNER', avatar: 'tomoyo', mood: 'happy', text: '열두 장 돌파 기념으로 [👑 황혼 로열 드레스]를 지어 두었답니다!' });
    }
    if (rem.length === 0 && BOSS_YUE) {
      lines.push({ speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: `드디어 열아홉 장을 모두 모았어! 남쪽 [${BOSS_YUE.zone}]에서 강렬한 달빛이 내려오고 있어!` });
    }
    vn.start(lines);
  }

  function finishYueVictory() {
    yueDefeated = true;
    recalcPower(true);
    updateHUD(true);
    autoSave('최후의 심판 돌파');

    vn.start(toArr(DATA.dialogues?.yueVictory), () => {
      mode = 'ending';
      updateFieldBar();
      const f = CARDS[story.sealedOrder[0] || 'fly'];
      const l = CARDS[story.sealedOrder[story.sealedOrder.length - 1] || 'light'];
      host.showEnding({
        sub: 'PART I CLEAR · THE NEW MASTER',
        title: '새로운 크로우 카드의 주인',
        summaryHtml:
          `사쿠라는 <b>[${cardName(f)}]</b>에서 시작해 마지막 <b>[${cardName(l)}]</b>까지 열아홉 장의 크로우 카드를 모두 봉인하고, 달의 심판자 유에에게 새로운 주인으로 인정받았습니다!<br/>` +
          `<span class="text-emerald-200 font-bold mt-1.5 inline-block">⚡ 샤오랑 친밀도 ${story.syaoranTrust} · 최종 체력 ${player.maxHp} · 마력 Lv.${player.lv}</span><br/>` +
          `<span class="text-yellow-200 text-xs mt-1 inline-block">✨ 지금 바로 제2부 [별빛의 토모에다]로 출발하면 추억과 최대 MP +20 보너스가 자동 계승됩니다!</span>`,
        nextPart: 2,
        nextPartLabel: '⭐ 제2부: 별빛의 토모에다로 이어서 출발!'
      });
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
      host.resize();
      SoundFX.encounter();
      updateHUD(true);
      const cnt = countUnsealedInMap(mid);
      host.showToast(mid === 'town' ? '황혼의 토모에다 마을로 나왔습니다.' : `${getMap().name}에 들어왔습니다.${cnt ? ` (이상 현상 ${cnt}곳)` : ''}`);
      if (fade) fade.style.opacity = '0';
    }, 170);
  }

  function checkNearby() {
    nearbyTarget = null;
    let best = 88;
    const cur = getMap();

    for (const p of toArr(cur.portals)) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 64 && d < best) { best = d; nearbyTarget = { type: 'portal', obj: p }; }
    }
    for (const n of NPCS) {
      if (!isNpcVisible(n)) continue;
      const d = Math.hypot(player.x - n.x, player.y - n.y);
      if (d < best) { best = d; nearbyTarget = { type: 'npc', obj: n }; }
    }
    for (const id of CARD_ORDER) {
      if (!isCardActiveOnMap(id)) continue;
      const c = CARDS[id];
      if (!c || c.map !== currentMapId) continue;
      const pos = getCardPos(c);
      const d = Math.hypot(player.x - pos.x, player.y - pos.y);
      if (d < best) { best = d; nearbyTarget = { type: 'card', obj: { ...c, x: pos.x, y: pos.y } }; }
    }
    if (!yueDefeated && !memoryMode.active && BOSS_YUE && currentMapId === BOSS_YUE.map) {
      const d = Math.hypot(player.x - BOSS_YUE.x, player.y - BOSS_YUE.y);
      if (d < best + 10) { best = d; nearbyTarget = { type: 'boss', obj: BOSS_YUE }; }
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
    } else if (t.type === 'npc') {
      talkNPC(t.obj);
    } else if (t.type === 'card') {
      vn.start(buildCardIntro(t.obj.id), () => battle.start(t.obj));
    } else if (t.type === 'boss') {
      if (ownedCards.size < CARD_ORDER.length) {
        encCd = 2.4;
        vn.start([{
          speaker: '케로',
          role: 'GUARDIAN',
          avatar: 'kero',
          mood: 'serious',
          text: `남은 크로우 카드 ${CARD_ORDER.length - ownedCards.size}장을 모두 봉인하면 달의 심판 마법진이 열릴 거야!`
        }]);
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
    if (mode !== 'explore') return;

    if (encCd > 0) encCd = Math.max(0, encCd - dt);
    if (portalCd > 0) portalCd = Math.max(0, portalCd - dt);

    const prevSig = `${buffs.fly > 0}${buffs.flyLand}${buffs.light > 0}${buffs.glow > 0}${Math.ceil(buffs.glowCd)}${buffs.wind > 0}`;
    const mazeActive = (currentMapId === 'school' || currentMapId === 'shrine_gate') && isCardActiveOnMap('maze');
    const colOpts = { ignoreObs: false, mazeActive };

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

    // 10개 층별/구역별 맵 이상 현상 상호작용
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
      anomaly.glowX = CARDS.glow.x + Math.sin(t * 1.1) * 34;
      anomaly.glowY = CARDS.glow.y + Math.cos(t * 1.6) * 14;
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

    const moveCol = { ignoreObs: flying, mazeActive };
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
      if (nearbyTarget.type === 'card' && d < 48) return triggerInteract();
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
    const visibleNpcs = NPCS.filter(isNpcVisible);
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
        showTarget: mode === 'explore'
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. 새 모험(지하 서재 프롤로그) 시작 & 챕터 라이프사이클 반환
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
    story.costumeId = 'sakura_dress';

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
      { speaker: '케로', role: 'GUARDIAN', avatar: 'kero', mood: 'serious', text: '그나마 윈디 한 장은 네 손에 남았어! 자, 이 봉인의 열쇠를 받아 줘! 카드캡터가 되어 열여덟 장의 크로우 카드를 모두 봉인하는 거야!' }
    ];

    vn.start(prologueLines, () => {
      inPrologue = false;
      encCd = 1.2;
      world.burst(player.x, player.y, '#38bdf8', 24);
      host.showToast('📖 크로우 카드 1/19 (윈디) 보유! 마을로 나가 흩어진 18장을 봉인하세요!');
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
      getSyaoranTrust: () => story.syaoranTrust,
      getFieldBuffs: () => buffs,
      onHUDUpdate: () => updateHUD(true),
      onModeChange: (m) => { mode = m; updateFieldBar(); },
      onVictory: (target) => { if (target.isBoss) finishYueVictory(); else finishCardSeal(target); },
      onDefeat: handleDefeat,
      onFlee: () => { encCd = 2.0; host.showToast('잠시 물러나 재정비합니다.'); }
    },
    start({ saved } = {}) {
      if (saved && saved.ownedCards) {
        applySavePayload(saved);
        host.showToast('⚡ 제1부 저장 기록을 이어서 시작합니다!');
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
      story.syaoranTrust = Math.max(0, story.syaoranTrust + delta);
      updateHUD(true);
    },
    onLocaleChange() {
      if (!$('bookModal')?.classList.contains('hidden')) openBook(true);
      if (!$('wardrobeModal')?.classList.contains('hidden')) openWardrobe(true);
      updateHUD(true);
      updateFieldBar();
    },
    onKeyDown(code) {
      if (mode !== 'explore') return;
      if (code === 'KeyX' || code === 'Enter') triggerInteract();
      else if (code.startsWith('Digit') && code.length === 6) castFieldCard(code[5]);
    },
    onCanvasPointer(lx, ly, initial) {
      if (mode !== 'explore') return;
      if (initial && lx > world.cam.w - 130 && ly < 110) return;
      const wx = lx + world.cam.x;
      const wy = ly + world.cam.y;
      if (initial) {
        const cur = getMap();
        for (const p of toArr(cur.portals)) {
          if (Math.hypot(wx - p.x, wy - p.y) < 44) { pendingTarget = { type: 'portal', obj: p }; player.targetPos = { x: p.x, y: p.y }; return; }
        }
        for (const n of NPCS) {
          if (isNpcVisible(n) && Math.hypot(wx - n.x, wy - n.y) < 48) { pendingTarget = { type: 'npc', obj: n }; player.targetPos = { x: n.x, y: n.y }; return; }
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
        if (!yueDefeated && !memoryMode.active && BOSS_YUE && currentMapId === BOSS_YUE.map && Math.hypot(wx - BOSS_YUE.x, wy - BOSS_YUE.y) < 60) {
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
      else {
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
    getSavePayload,
    applyCloudSave(saved) {
      applySavePayload(saved);
    },
    destroy() {
      Timers.clearAll();
    }
  };
}
