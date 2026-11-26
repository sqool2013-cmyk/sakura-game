/**
 * ============================================================================
 * 카드캡터 3부작 — 제1부 고유 컨트롤러 (chapter1.js) — v.0.1.4
 * - 단일 스토리 통합 앱(index.html)과 연동되는 제1부(크로우 카드 편) 모듈
 * - 초등학교 교복 시작 -> 플라이 봉인 직후 토모요(지수) 정식 합류 & 첫 배틀 의상 선물
 * - 제1부 4막(Act) 단계 개방형 스토리: 1막(플라이) -> 2막(6장) -> 3막(샤오랑·8장) -> 4막(다크/라이트->어시->유에)
 * - 토모요 합류 전 안전망: 집 1층 거실 식탁에서 무료 HP·MP 완전 회복 지원
 * - 샤오랑 친밀도 이중 가산 버그 수정 & 제1부 상한(최대 5) 보정
 * - 4종 마법 피니시(수렴 마법진 · 최종 보스 X연타 마력 충돌) & 연속 성장 곡선 연동
 * ============================================================================
 */

export function createChapter(host, DATA) {
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
  // --------------------------------------------------------------------------
  // 3. 핵심 헬퍼 · 4막 단계 개방 · 토모요 촬영 동행 AI · 성장 곡선
  // --------------------------------------------------------------------------
  const getMap = () => MAPS[currentMapId] || MAPS.town;

  /**
   * 제1부 4막(Act) 현재 진행 단계 계산
   * 1: 플라이 고정 / 2: 마을·학교 6장 / 3: 샤오랑 합류 & 호수·신사 8장
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
// ... existing code ...
  /** 토모요(지수) 촬영 동행 활성화 여부 (플라이 봉인 후 정식 합류 이후 전 맵 동행) */
  const isTomoyoFollowing = () => !!(story.tomoyoFollowing && ownedCards.has('fly') && !inPrologue);

  /** 동행 중인 토모요의 실시간 좌표 반환 */
// ... existing code ...
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
// ... existing code ...
  function getSharedState() {
    const carryCostume = story.costumeId === 'school_uniform' ? 'sakura_dress' : story.costumeId;
    return {
      costumeId: carryCostume,
      unlockedCostumes: getUnlockedCostumeList().filter((id) => id !== 'school_uniform'),
      syaoranTrust: story.syaoranTrust,
      part1Cleared: yueDefeated,
      firstSealedCard: story.sealedOrder[0] || '',
      lastSealedCard: story.sealedOrder[story.sealedOrder.length - 1] || '',
      hadMirror: ownedCards.has('mirror') || yueDefeated
    };
  }
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
    vn.start(prologueLines, () => {
      inPrologue = false;
      encCd = 1.2;
      world.burst(player.x, player.y, '#38bdf8', 24);
      host.showToast('📖 크로우 카드 1/19 (윈디) 보유! 마을 초등학교 앞마당에서 [플라이]를 찾아 봉인하세요!');
      autoSave('모험 시작');
    });
  }
// ... existing code ...
    onCostumeBadgeClick() {
      const cos = getCostumeObj();
      if (!isTomoyoFollowing()) {
        host.showToast(`🎒 현재 착용: ${cos.name} (${cos.passive}) · 먼저 [플라이]를 봉인해 모험을 시작하세요!`);
      } else {
        host.showToast(`🎀 현재 착용: ${cos.name} (${cos.passive}) · 의상 교체와 홍차 회복은 동행 중인 토모요에게!`);
      }
    },
// ... existing code ...
      if (initial) {
        const cur = getMap();
        for (const p of toArr(cur.portals)) {
          if (Math.hypot(wx - p.x, wy - p.y) < 44) { pendingTarget = { type: 'portal', obj: p }; player.targetPos = { x: p.x, y: p.y }; return; }
        }
        if (currentMapId === 'house_f1' && wx >= 320 && wx <= 500 && wy >= 245 && wy <= 325) {
          pendingTarget = { type: 'rest_table', obj: { x: 410, y: 335, label: '거실 식탁에서 쉬어가기' } };
          player.targetPos = { x: 410, y: 335 };
          return;
        }
        for (const n of NPCS) {
// ... existing code ...
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
// ... existing code ...
