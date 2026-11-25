/**
 * ============================================================================
 * 카드캡터 3부작 공용 대화창(VN) & 전략 배틀 · 영창 시네마틱 엔진 (battle.js) — v.0.1.2
 * - 비주얼 노벨 대화창 (6종 표정 mood 오버레이 · 감정 모션 · AUTO 기본 OFF)
 * - 배틀 돌입 시 지팡이 봉인 해제(레리즈 / 봉인 해제) 컷인 연출 (Z 즉시 스킵)
 * - 상황별 4종 마법 피니시 시스템 (스윙 게이지 일변도 탈피!):
 *   1) 수렴 마법진 (Ritual Ring) : 1부 크로우 카드 봉인 & 2부 별빛 공명 변환
 *   2) 3키 별빛 공명 (Star Combo) : 2부 전투 중 실시간 ★사쿠라/체리 카드 각성
 *   3) 순수 전략 격파             : 2부 5대 기묘한 사건 보스 (게이지 없이 HP 0 즉시 돌파!)
 *   4) 마력 충돌 (Magic Clash)   : 최종 보스전 (1부 유에 · 2부 에리오르 X 연타 대결!)
 * - 카드 선택 패널 직전 선택 카드 & 스크롤 위치 기억 (연속 사용 편의성 대폭 개선)
 * - 배틀 커맨드 & 카드 그리드 키보드(방향키/WASD + X/Z) 완전 조작
 * - 8벌 + 2벌 의상 & ★별빛 리폼 패시브 반영 · 스포일러 태그/중복 코드 제거
 * ============================================================================
 */
import { Utils, Locale, Art, SoundFX, Rules, Timers } from './core.js';

const { $, toArr, cardName, cardRuby } = Utils;

/* ----------------------------------------------------------------------------
 * 1. 비주얼 노벨(VN) 대화창 엔진 (6종 표정 + 모션)
 * --------------------------------------------------------------------------*/
export function createVNEngine({ onModeChange, onTrustDelta } = {}) {
  const vn = {
    active: false,
    q: [],
    i: 0,
    rawText: '',
    text: '',
    len: 0,
    typing: false,
    waitChoice: false,
    choiceIdx: 0,
    auto: false, // 기본값 OFF
    cb: null,
    tId: null,
    aId: null
  };

  function clearTimers() {
    Timers.clear(vn.tId);
    Timers.clear(vn.aId);
    vn.tId = null;
    vn.aId = null;
  }

  function highlightChoice() {
    document.querySelectorAll('.vn-ch').forEach((btn, idx) => {
      btn.className = idx === vn.choiceIdx
        ? 'vn-ch w-full px-4 py-2.5 rounded-2xl text-left font-story text-sm border-2 border-yellow-300 bg-gradient-to-r from-pink-600/90 to-purple-700/90 text-white shadow-lg transition'
        : 'vn-ch w-full px-4 py-2.5 rounded-2xl text-left font-story text-sm border border-yellow-400/40 bg-[#1a0b34]/90 text-pink-100 hover:bg-purple-900/80 transition';
    });
  }

  function pickChoice(ch) {
    if (!ch) return;
    SoundFX.click();
    if (typeof ch.trustDelta === 'number' && ch.trustDelta !== 0 && onTrustDelta) {
      onTrustDelta(ch.trustDelta);
    }
    if (typeof ch.effect === 'function') ch.effect();
    vn.waitChoice = false;
    $('vnChoices')?.classList.add('hidden');
    if (ch.reply && toArr(ch.reply).length) {
      vn.q.splice(vn.i + 1, 0, ...toArr(ch.reply));
    }
    vn.i++;
    renderLine();
  }

  function onTyped() {
    const line = vn.q[vn.i];
    const choices = toArr(line?.choices);
    if (choices.length) {
      vn.waitChoice = true;
      vn.choiceIdx = 0;
      const box = $('vnChoices');
      if (box) {
        box.innerHTML = '';
        choices.forEach((ch) => {
          const b = document.createElement('button');
          b.className = 'vn-ch w-full px-4 py-2.5 rounded-2xl text-left font-story text-sm border transition';
          b.textContent = `✦ ${Locale.t(ch.label)}`;
          b.onclick = (e) => {
            e.stopPropagation();
            pickChoice(ch);
          };
          box.appendChild(b);
        });
        box.classList.remove('hidden');
        highlightChoice();
      }
      return;
    }
    if (vn.auto) {
      const waitMs = Math.min(3400, Math.max(1400, vn.text.length * 44));
      vn.aId = Timers.after(() => {
        if (vn.active && !vn.typing && !vn.waitChoice) {
          vn.i++;
          renderLine();
        }
      }, waitMs);
    }
  }

  function renderLine() {
    clearTimers();
    const line = vn.q[vn.i];
    if (!line) return finish();

    const spEl = $('vnSpeaker');
    const roleEl = $('vnRole');
    const portEl = $('vnPortrait');
    const chEl = $('vnChoices');
    const txtEl = $('vnText');

    if (spEl) spEl.textContent = Locale.t(line.speaker || '사쿠라');
    if (roleEl) roleEl.textContent = Locale.t(line.role || '');
    if (portEl) {
      const mood = line.mood || 'normal';
      portEl.innerHTML = Art.getAvatar(line.avatar || 'sakura', mood);
      portEl.classList.remove('shake-hit');
      if (mood === 'shock') {
        void portEl.offsetWidth;
        portEl.classList.add('shake-hit');
      }
    }
    if (chEl) {
      chEl.classList.add('hidden');
      chEl.innerHTML = '';
    }

    vn.rawText = line.text || '';
    vn.text = Locale.t(vn.rawText);
    vn.len = 0;
    vn.typing = true;
    vn.waitChoice = false;
    if (txtEl) txtEl.textContent = '';

    vn.tId = Timers.every(() => {
      vn.len += 2;
      if (vn.len >= vn.text.length) {
        if (txtEl) txtEl.textContent = vn.text;
        vn.typing = false;
        Timers.clear(vn.tId);
        vn.tId = null;
        onTyped();
      } else if (txtEl) {
        txtEl.textContent = vn.text.slice(0, vn.len);
      }
    }, 22);
  }

  function start(lines, cb = null) {
    clearTimers();
    vn.active = true;
    vn.q = toArr(lines).slice();
    vn.i = 0;
    vn.cb = cb;
    vn.waitChoice = false;
    vn.choiceIdx = 0;
    $('vnOverlay')?.classList.remove('hidden');
    $('btnFloatInteract')?.classList.add('hidden');
    if (onModeChange) onModeChange('dialogue');
    renderLine();
  }

  function advance() {
    if (!vn.active || vn.waitChoice) return;
    if (vn.typing) {
      Timers.clear(vn.tId);
      vn.tId = null;
      vn.typing = false;
      if ($('vnText')) $('vnText').textContent = vn.text;
      onTyped();
    } else {
      Timers.clear(vn.aId);
      vn.aId = null;
      SoundFX.click();
      vn.i++;
      renderLine();
    }
  }

  function finish(silent = false) {
    clearTimers();
    vn.active = false;
    vn.typing = false;
    vn.waitChoice = false;
    $('vnOverlay')?.classList.add('hidden');
    $('vnChoices')?.classList.add('hidden');
    const cb = vn.cb;
    vn.cb = null;
    if (!silent && onModeChange) onModeChange('explore');
    if (!silent && cb) cb();
  }

  function toggleAuto() {
    vn.auto = !vn.auto;
    const btn = $('btnAutoVN');
    if (btn) {
      btn.textContent = vn.auto ? 'AUTO ON' : 'AUTO OFF';
      btn.className = vn.auto
        ? 'px-2 py-0.5 rounded-lg text-[11px] font-bold border border-emerald-400/60 bg-emerald-500/25 text-emerald-200'
        : 'px-2 py-0.5 rounded-lg text-[11px] font-bold border border-slate-500 bg-slate-800/70 text-slate-300';
    }
    if (vn.auto && vn.active && !vn.typing && !vn.waitChoice) onTyped();
    return vn.auto;
  }

  function moveChoice(dir) {
    if (!vn.active || !vn.waitChoice) return;
    const chs = toArr(vn.q[vn.i]?.choices);
    if (!chs.length) return;
    vn.choiceIdx = (vn.choiceIdx + dir + chs.length) % chs.length;
    highlightChoice();
  }

  function confirmChoice() {
    if (!vn.active || !vn.waitChoice) return;
    const chs = toArr(vn.q[vn.i]?.choices);
    if (chs[vn.choiceIdx]) pickChoice(chs[vn.choiceIdx]);
  }

  /** 원작명 <-> 번안명 전환 시 현재 열린 대사창 즉시 번역 반영 */
  function refreshLocale() {
    if (!vn.active) return;
    const line = vn.q[vn.i];
    if (!line) return;
    if ($('vnSpeaker')) $('vnSpeaker').textContent = Locale.t(line.speaker || '사쿠라');
    if ($('vnRole')) $('vnRole').textContent = Locale.t(line.role || '');
    vn.text = Locale.t(vn.rawText);
    if (!vn.typing && $('vnText')) $('vnText').textContent = vn.text;
    if (vn.waitChoice) {
      const chs = toArr(line.choices);
      document.querySelectorAll('.vn-ch').forEach((btn, idx) => {
        if (chs[idx]) btn.textContent = `✦ ${Locale.t(chs[idx].label)}`;
      });
    }
  }

  // 기본 버튼 연결
  $('vnOverlay')?.addEventListener('click', () => {
    if (vn.active && !vn.waitChoice) advance();
  });
  $('btnSkipVN')?.addEventListener('click', (e) => {
    e.stopPropagation();
    finish(false);
  });
  $('btnAutoVN')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAuto();
  });

  return {
    state: vn,
    start,
    advance,
    finish,
    toggleAuto,
    moveChoice,
    confirmChoice,
    refreshLocale,
    isActive: () => vn.active
  };
}

/* ----------------------------------------------------------------------------
 * 2. 전략 배틀 · 4종 마법 피니시 · 카드 위치 기억 · 영창 시네마틱 엔진
 * --------------------------------------------------------------------------*/
export function createBattleEngine(hooks) {
  /**
   * hooks 인터페이스:
   * - part: 1 | 2
   * - getData(): DATA
   * - getCards(): CARDS map
   * - getCardOrder(): string[]
   * - getPlayer(): { hp, maxHp, mp, maxMp, lv, mult }
   * - getOwnedCards(): Set
   * - getSakuraCards(): Set
   * - getCostumeId(): string
   * - isCostumeReformed?(): boolean
   * - getSyaoranTrust(): number
   * - getFieldBuffs(): { shield, wind, snackBuff, cocoaBuff }
   * - onHUDUpdate(): void
   * - onModeChange(mode): void
   * - onVictory(target, meta): void
   * - onLiveCardConverted(card): void
   * - onDefeat(): void
   * - onFlee(): void
   */
  const vfxCanvas = $('battleVfxCanvas');
  const vfxCtx = vfxCanvas ? vfxCanvas.getContext('2d') : null;
  const vfxList = [];
  let viewW = 960;
  let viewH = 640;

  // 카드 선택창 직전 커서 & 스크롤 위치 기억
  let lastCardId = null;
  let lastPickerScrollTop = 0;

  const DIR_ARROWS = { up: '▲', down: '▼', left: '◀', right: '▶' };
  const ALL_DIRS = ['up', 'down', 'left', 'right'];

  const state = {
    active: false,
    enemy: null,
    hp: 100,
    maxHp: 100,
    busy: false,
    turn: 0,
    exhausted: false,
    phase: 1,
    bind: 0,
    bindRes: 0,
    eGuard: false,
    eRef: false,
    eEvade: false,
    intent: null,
    // 주인공 방어/버프
    sShield: false,
    sEvade: false,
    sRef: false,
    sFocus: false,
    snackGuard: false,
    cocoaBoost: false,
    // 샤오랑 원호 상태
    syaoranUsed: false,
    syaoranSaveUsed: false,
    // 키보드 포커스 상태
    cmdIdx: 0,
    pickerOpen: false,
    pickerIdx: 0,
    pickerItems: [],
    // 4종 마법 피니시 상태 (ring | combo | clash)
    timing: false,
    finishKind: null, // 'ring' | 'combo' | 'clash'
    pendingLiveCardId: null,
    // (1) 수렴 마법진 (Ritual Ring)
    ringRadius: 100,
    ringSpeed: 64,
    ringMin: 28,
    ringMax: 52,
    // (2) 3키 별빛 공명 (Star Combo)
    comboSeq: [],
    comboStep: 0,
    comboTime: 0,
    comboMaxTime: 5.5,
    // (3) 최종 보스 마력 충돌 (Magic Clash)
    clashVal: 50,
    clashTime: 8.5,
    clashMaxTime: 8.5,
    clashPushBack: 17,
    clashTapPower: 7.8
  };

  const chant = {
    active: false,
    mode: 'seal', // 'release' | 'seal'
    typing: false,
    full: '',
    sub: '',
    len: 0,
    tId: null,
    onDone: null,
    flipped: false,
    finalCards: [],
    isSakura: false
  };

  function getCostumeBonuses() {
    const isReformed = typeof hooks.isCostumeReformed === 'function' ? !!hooks.isCostumeReformed() : false;
    return Rules.getCostumeBonuses(hooks.getCostumeId(), isReformed);
  }

  /** 배틀 돌입 지팡이 봉인 해제 컷인용 전용 벡터 (1부 봉인의 지팡이 / 2부 별의 지팡이) */
  function getWandReleaseSVG(isPart2) {
    if (isPart2) {
      return `<svg viewBox="0 0 180 220" class="w-full h-full">
        <defs>
          <radialGradient id="wrStarBg" cx="50%" cy="38%" r="58%">
            <stop offset="0%" stop-color="#fde047" stop-opacity="0.55"/>
            <stop offset="55%" stop-color="#ec4899" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#1e0b36" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="90" cy="84" r="76" fill="url(#wrStarBg)"/>
        <circle cx="90" cy="84" r="64" fill="none" stroke="#fbcfe8" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.7"/>
        <rect x="85" y="102" width="10" height="106" rx="5" fill="#f472b6" stroke="#fef08a" stroke-width="1.5"/>
        <path d="M74 96 Q34 62 24 88 Q44 102 74 108 Z" fill="#ffffff" stroke="#fbcfe8" stroke-width="1.6"/>
        <path d="M106 96 Q146 62 156 88 Q136 102 106 108 Z" fill="#ffffff" stroke="#fbcfe8" stroke-width="1.6"/>
        <circle cx="90" cy="74" r="28" fill="#db2777" stroke="#fef08a" stroke-width="2.6"/>
        <circle cx="90" cy="74" r="20" fill="#4a0828" stroke="#fbcfe8" stroke-width="1.4"/>
        <polygon points="90,56 95,69 109,69 98,77 102,91 90,82 78,91 82,77 71,69 85,69" fill="#fef08a" stroke="#f59e0b" stroke-width="1.2"/>
        <circle cx="38" cy="42" r="3" fill="#fef08a"/>
        <circle cx="144" cy="46" r="2.6" fill="#fbcfe8"/>
        <circle cx="136" cy="142" r="2.5" fill="#fef08a"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 180 220" class="w-full h-full">
      <defs>
        <radialGradient id="wrSealBg" cx="50%" cy="38%" r="58%">
          <stop offset="0%" stop-color="#fde047" stop-opacity="0.58"/>
          <stop offset="55%" stop-color="#f43f5e" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#14072b" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="90" cy="84" r="76" fill="url(#wrSealBg)"/>
      <circle cx="90" cy="84" r="64" fill="none" stroke="#fde047" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.72"/>
      <rect x="85" y="102" width="10" height="106" rx="5" fill="#e11d48" stroke="#fde047" stroke-width="1.5"/>
      <path d="M74 92 Q28 54 20 82 Q44 98 74 104 Z" fill="#ffffff" stroke="#fde047" stroke-width="1.6"/>
      <path d="M106 92 Q152 54 160 82 Q136 98 106 104 Z" fill="#ffffff" stroke="#fde047" stroke-width="1.6"/>
      <circle cx="90" cy="76" r="24" fill="#fb7185" stroke="#fde047" stroke-width="2.4"/>
      <polygon points="108,70 132,76 108,84" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/>
      <circle cx="95" cy="70" r="3.6" fill="#0f172a"/>
      <circle cx="94" cy="69" r="1.3" fill="#ffffff"/>
      <polygon points="90,34 93,42 101,42 94.5,47 97,55 90,50 83,55 85.5,47 79,42 87,42" fill="#fef08a"/>
      <circle cx="38" cy="42" r="3" fill="#fef08a"/>
      <circle cx="144" cy="48" r="2.5" fill="#fda4af"/>
    </svg>`;
  }

  function setLog(msg) {
    const el = $('battleLog');
    if (el) el.textContent = Locale.t(msg);
  }

  function shakeEnemy() {
    const el = $('battleEnemyVisual');
    if (!el) return;
    el.classList.remove('shake-hit');
    void el.offsetWidth;
    el.classList.add('shake-hit');
  }

  function spawnVFX(type = 'seal') {
    const pal = {
      wind: ['#38bdf8', '#bae6fd'],
      fly: ['#ffffff', '#fef08a'],
      flower: ['#f9a8d4', '#fb7185', '#fef08a'],
      fire: ['#f97316', '#fde047'],
      water: ['#38bdf8', '#2563eb'],
      shadow: ['#818cf8', '#c084fc'],
      sword: ['#f8fafc', '#fde047'],
      syaoran: ['#34d399', '#fde047', '#38bdf8'],
      seal: ['#fde047', '#f472b6', '#ffffff']
    }[type] || ['#fde047', '#f472b6'];

    const cx = viewW * 0.5;
    const cy = viewH * 0.42;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 65 + Math.random() * 180;
      const life = 0.45 + Math.random() * 0.4;
      vfxList.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 2.5 + Math.random() * 4,
        life,
        max: life,
        color: pal[i % pal.length]
      });
    }
  }

  function resize(w, h, dpr) {
    viewW = w;
    viewH = h;
    if (vfxCanvas && vfxCtx) {
      vfxCanvas.width = Math.floor(w * dpr);
      vfxCanvas.height = Math.floor(h * dpr);
      vfxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function getEnemyDisplayName(e) {
    if (!e) return '';
    if (e.isBoss) {
      if (hooks.part === 2) return state.phase === 1 ? '스피넬 썬 & 루비 문' : '에리오르';
      return '유에';
    }
    if (e.isIncident) return e.kr || e.title || '기묘한 마법 현상';
    return cardName(e);
  }

  /** 다음 턴 적 행동 패턴 및 예고 배너 결정 */
  function pickIntent() {
    const e = state.enemy;
    if (!e) return;
    state.turn++;
    if (state.exhausted) {
      state.intent = {
        type: 'recover',
        label: e.isBoss
          ? (hooks.part === 2
              ? '🔥 마력 충돌 찬스! 지금 [🔥 마력 충돌!]로 에리오르의 어둠을 밀어내자!'
              : '🔥 마력 충돌 찬스! 지금 [🔥 마력 충돌!]로 유에의 심판을 돌파하자!')
          : `💫 탈진 상태! 지금 [${hooks.part === 2 ? '★ 수렴 변환!' : '🎯 수렴 봉인!'}] 하지 않으면 저항력을 회복한다!`
      };
      return;
    }

    if (e.isBoss) {
      const st = state.turn % 4;
      if (hooks.part === 1) {
        if (state.phase === 1) {
          state.intent = st === 1 ? { type: 'attack', dmg: 22, label: '⚔ 은빛 날개 칼날 (예상 피해 22)' }
            : st === 2 ? { type: 'barrier', label: '☽ 다음 턴 [달빛 결계] 전개 예정 (전개 후 소드·이레이즈·원호로 파괴)' }
            : st === 3 ? { type: 'charge', label: '🌕 마력 집중! 다음 턴 [창백한 월광의 심판] 예고!' }
            : { type: 'big', dmg: 42, label: '🌕 [강력 예고!] 창백한 월광의 심판 (피해 42 · 방어/실드/점프 권장!)' };
        } else {
          state.intent = st === 1 ? { type: 'drain', dmg: 26, mp: 14, label: '☽ 달의 지배 (피해 26 + MP 14 흡수)' }
            : st === 2 ? { type: 'reflect', label: '🪞 다음 턴 [만월의 거울막] 전개 예정 (전개 후 공격 시 반사됨!)' }
            : st === 3 ? { type: 'charge', label: '🌕 만월의 심판 준비! 다음 턴 [최후의 은빛 심판] 발동!' }
            : { type: 'big', dmg: 52, label: '🌕 [치명 예고!] 최후의 은빛 심판 (피해 52 · 방어/실드/점프 필수!)' };
        }
      } else {
        if (state.phase === 1) {
          state.intent = st === 1 ? { type: 'attack', dmg: 26, label: '🦋 스피넬 썬 & 루비 문 합동 마력탄 (예상 피해 26)' }
            : st === 2 ? { type: 'barrier', label: '🛡 다음 턴 [흑태양의 결계] 전개 예정 (소드·이레이즈·원호로 파괴)' }
            : st === 3 ? { type: 'charge', label: '⚡ 스피넬 썬이 푸른 마력을 응집한다! 다음 턴 강공격 예고!' }
            : { type: 'big', dmg: 48, label: '🔥 [강력 예고!] 흑태양과 홍월의 교차 포화 (피해 48 · 방어/실드/점프 권장!)' };
        } else {
          state.intent = st === 1 ? { type: 'drain', dmg: 30, mp: 16, label: '🌑 에리오르의 영원한 수면 어둠 (피해 30 + MP 16 흡수)' }
            : st === 2 ? { type: 'reflect', label: '🪞 다음 턴 [크로우의 반사 거울막] 전개 예정 (전개 후 공격 시 반사!)' }
            : st === 3 ? { type: 'charge', label: '🌌 에리오르가 태양과 달의 지팡이를 들어올린다! 최후의 시련 예고!' }
            : { type: 'big', dmg: 58, label: '🌌 [치명 예고!] 토모에다를 덮는 영원한 어둠 (피해 58 · 방어/실드/점프 필수!)' };
        }
      }
      return;
    }

    if (state.intent && state.intent.type === 'charge') {
      const d = Math.round((e.atk || 16) * 1.72);
      state.intent = { type: 'big', dmg: d, label: `🔥 [필살 예고!] ${e.sigName || '강력한 마법'} (피해 ${d} · 방어/실드/점프 권장!)` };
      return;
    }

    if (state.turn % 3 === 2) {
      const g = e.gimmick || 'charge';
      if (g === 'charge') state.intent = { type: 'charge', label: `⚡ 마력 응집 중! 다음 턴 [${e.sigName || '필살기'}] 예고!` };
      else if (g === 'barrier') state.intent = { type: 'barrier', label: '🛡 다음 턴 [마력 결계] 전개 예정 (전개 후 소드·이레이즈·원호로 파괴)' };
      else if (g === 'reflect') state.intent = { type: 'reflect', label: '🪞 다음 턴 [거울 반사막] 전개 예정 (전개 후 일반 공격 반사)' };
      else if (g === 'evade') state.intent = { type: 'evade', label: '🪽 다음 턴 [고속 회피] 태세 예정 (전개 후 지팡이 회피)' };
      else if (g === 'drain') state.intent = { type: 'drain', dmg: Math.round((e.atk || 16) * 0.95), mp: 12, label: `🌑 ${e.sigName || '마력 흡수'} (피해 ${Math.round((e.atk || 16) * 0.95)} + MP 12 흡수)` };
      else state.intent = { type: 'heal', label: `🌿 ${e.sigName || '마력 재생'} (저항력 회복 + 약한 반격)` };
    } else {
      state.intent = { type: 'attack', dmg: e.atk || 16, label: `⚔ ${e.sigName || '마법 반격'} (예상 피해 ${e.atk || 16})` };
    }
  }

  /** 마무리(수렴 마법진 / 마력 충돌) 시도 가능 여부 */
  function canAttemptFinish() {
    const e = state.enemy;
    if (!e || e.isIncident) return false; // 2부 사건 보스는 게이지 없이 HP 0으로 순수 격파!
    if (e.isBoss) {
      if (state.phase === 1) return state.hp <= state.maxHp * 0.55;
      return state.exhausted || state.hp <= state.maxHp * 0.35;
    }
    return state.exhausted || state.hp <= state.maxHp * 0.5;
  }

  /** 수렴 마법진(Ritual Ring) 난이도 계산 */
  function ringMetrics() {
    const e = state.enemy;
    const cosBonus = getCostumeBonuses().sealZoneBonus || 0;
    if (!e) return { band: 24, speed: 60, lbl: '집중' };

    const r = Utils.clamp(state.hp / Math.max(1, state.maxHp), 0, 1);
    const isElemental = ['windy', 'watery', 'firey', 'earthy'].includes(e.id);
    const isTop = ['dark', 'light'].includes(e.id);

    // 저항력 0% -> 링 폭 30%(여유), 속도 48/s / 저항력 50% -> 링 폭 16%(긴장), 속도 78/s
    let band = Math.round(30 - r * 28) + cosBonus;
    let speed = Math.round(48 + r * 62);
    if (isElemental) { band -= 2; speed += 8; }
    if (isTop) { band -= 4; speed += 14; }
    band = Utils.clamp(band, 12, 38);
    return { band, speed, lbl: speed >= 82 ? '초고속' : speed >= 65 ? '빠름' : '집중' };
  }

  function getCommandButtons() {
    return ['btnCmdWand', 'btnCmdCard', 'btnCmdFocus', 'btnCmdSyaoran', 'btnCmdSeal']
      .map((id) => $(id))
      .filter((el) => el && !el.classList.contains('hidden'));
  }

  function syncCommandHighlight() {
    const btns = getCommandButtons();
    if (!btns.length) return;
    state.cmdIdx = Utils.clamp(state.cmdIdx, 0, btns.length - 1);
    btns.forEach((btn, idx) => {
      const active = state.active && !state.busy && !state.timing && !chant.active && !state.pickerOpen && idx === state.cmdIdx;
      btn.classList.toggle('ring-2', active);
      btn.classList.toggle('ring-yellow-300', active);
      btn.classList.toggle('scale-[1.03]', active);
    });
  }

  function updateUI() {
    const e = state.enemy;
    if (!e) return;
    const p = hooks.getPlayer();
    const trust = hooks.getSyaoranTrust ? hooks.getSyaoranTrust() : 0;

    if ($('battleEnemyHpBar')) $('battleEnemyHpBar').style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
    if ($('battleEnemyHpText')) $('battleEnemyHpText').textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
    if ($('battleSakuraHp')) $('battleSakuraHp').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    if ($('battleSakuraMp')) $('battleSakuraMp').textContent = `${Math.ceil(p.mp)}/${p.maxMp}`;

    const activeStance = state.eRef
      ? '⚠ [현재 반사 활성 중! 이레이즈·원호·방어 권장] · '
      : state.eGuard
      ? '🛡 [현재 결계 활성 중! 소드·이레이즈·원호로 파괴] · '
      : state.eEvade
      ? '🪽 [현재 회피 활성 중! 마법 권장] · '
      : '';

    const ib = $('battleIntentBanner');
    if (ib) {
      if (state.bind > 0) {
        ib.textContent = Locale.t('⛓ 구속 상태: 이번 턴 상대 행동 불가!');
        ib.className = 'px-3.5 py-1.5 rounded-full bg-cyan-950/85 border border-cyan-300/70 text-xs font-story text-cyan-100 text-center max-w-xl';
      } else if (state.intent) {
        ib.textContent = Locale.t(activeStance + state.intent.label);
        const danger = state.intent.type === 'big' || state.intent.type === 'charge' || state.eRef;
        ib.className = danger
          ? 'px-3.5 py-1.5 rounded-full bg-rose-950/85 border-2 border-rose-400 text-xs font-story font-bold text-rose-100 text-center max-w-xl animate-pulse'
          : 'px-3.5 py-1.5 rounded-full bg-black/60 border border-amber-400/55 text-xs font-story text-amber-100 text-center max-w-xl';
      }
    }

    const pb = $('battlePhaseBadge');
    if (pb) {
      pb.classList.toggle('hidden', !e.isBoss);
      if (e.isBoss) {
        pb.textContent = Locale.t(
          hooks.part === 1
            ? (state.phase === 1 ? 'PHASE 1 · 초승달의 시련' : 'PHASE 2 · 만월의 심판')
            : (state.phase === 1 ? 'PHASE 1 · 스피넬 썬 & 루비 문' : 'PHASE 2 · 에리오르 (영원한 어둠)')
        );
      }
    }

    const eb = [];
    if (e.isBoss) {
      eb.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/40 border border-sky-300/60 text-sky-100">${hooks.part === 1 ? '☽ 달 카드 반감 · 구속 면역' : '구속 면역 · 2페이즈 최종 결전'}</span>`);
    }
    if (e.isIncident) {
      eb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/35 border border-pink-300 text-pink-100">⚔ 순수 전략 격파 (HP 0으로 돌파!)</span>');
    }
    if (state.exhausted) eb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-400/35 border border-yellow-200 text-yellow-100">🌟 탈진! 마무리 찬스!</span>');
    if (state.eGuard) eb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/35 border border-yellow-300 text-yellow-100">🛡 결계 활성</span>');
    if (state.eRef) eb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/35 border border-sky-200 text-sky-100">🪞 반사 활성</span>');
    if (state.eEvade) eb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-500/35 border border-pink-300 text-pink-100">🪽 회피 활성</span>');
    if (state.bind > 0) eb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/35 border border-cyan-300 text-cyan-100">⛓ 구속</span>');
    if ($('battleStatusBadges')) $('battleStatusBadges').innerHTML = eb.join('');

    const sb = [];
    if (state.sShield) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/30 border border-yellow-300 text-yellow-100">🛡 결계</span>');
    if (state.sEvade) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/30 border border-pink-300 text-pink-100">✨ 도약 회피</span>');
    if (state.sRef) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/30 border border-sky-300 text-sky-100">🪞 거울 반사</span>');
    if (state.sFocus) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 border border-indigo-300 text-indigo-100">🛡 방어</span>');
    if (state.snackGuard) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/30 border border-cyan-200 text-cyan-100">🍙 방어+MP재생</span>');
    if (state.cocoaBoost) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/30 border border-orange-300 text-orange-100">☕ 공격+15%·치명+10%</span>');
    if (trust >= 3 && !state.syaoranSaveUsed) sb.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/30 border border-emerald-300 text-emerald-100">⚡ 위기엄호</span>');
    if ($('battleSakuraBuffs')) $('battleSakuraBuffs').innerHTML = sb.join('');

    // 마무리 버튼 (사건 보스는 순수 격파, 최종 보스는 마력 충돌, 카드전은 수렴 마법진!)
    const sealBtn = $('btnCmdSeal');
    const ready = canAttemptFinish();
    if (e.isIncident) {
      if ($('btnSealMain')) $('btnSealMain').textContent = '⚔ 순수 격파';
      if ($('btnSealSub')) $('btnSealSub').textContent = 'HP 0으로 해결';
      if (sealBtn) sealBtn.disabled = true;
    } else if (e.isBoss) {
      if ($('btnSealMain')) {
        $('btnSealMain').textContent = Locale.t(
          !ready ? '🔒 충돌 불가' : state.phase === 1 ? '🔥 결계 충돌!' : '🔥 마력 충돌!'
        );
      }
      if ($('btnSealSub')) {
        $('btnSealSub').textContent = !ready
          ? (state.phase === 1 ? '저항력 55%↓ 필요' : '저항력 35%↓ 필요')
          : 'X 연타 정면승부!';
      }
      if (sealBtn) sealBtn.disabled = !ready || state.busy || state.timing || chant.active;
    } else {
      const m = ringMetrics();
      if ($('btnSealMain')) {
        $('btnSealMain').textContent = Locale.t(
          !ready ? '🔒 봉인 불가' : hooks.part === 2 ? '🎯 사쿠라 변환!' : '🎯 수렴 봉인!'
        );
      }
      if ($('btnSealSub')) {
        $('btnSealSub').textContent = !ready
          ? '저항력 50%↓ 필요'
          : `${state.exhausted ? '탈진! ' : ''}링 ${m.band}% · ${m.lbl}`;
      }
      if (sealBtn) sealBtn.disabled = !ready || state.busy || state.timing || chant.active;
    }

    const btnSya = $('btnCmdSyaoran');
    if (btnSya) {
      const unlocked = trust >= 2;
      btnSya.classList.toggle('hidden', !unlocked);
      btnSya.disabled = !unlocked || state.syaoranUsed || state.busy || state.timing || chant.active;
      const sub = btnSya.querySelector('span');
      if (sub) sub.textContent = state.syaoranUsed ? '사용 완료' : '결계파괴·뇌제';
    }

    ['btnCmdWand', 'btnCmdCard', 'btnCmdFocus'].forEach((id) => {
      if ($(id)) $(id).disabled = state.busy || state.timing || chant.active;
    });

    syncCommandHighlight();
    if (hooks.onHUDUpdate) hooks.onHUDUpdate();
  }

  function start(target) {
    const buffs = hooks.getFieldBuffs();
    Object.assign(state, {
      active: true,
      enemy: target,
      maxHp: target.maxHp,
      hp: target.maxHp,
      busy: false,
      turn: 0,
      exhausted: false,
      phase: 1,
      bind: 0,
      bindRes: 0,
      eGuard: false,
      eRef: false,
      eEvade: false,
      intent: null,
      sShield: !!buffs.shield,
      sEvade: false,
      sRef: false,
      sFocus: false,
      snackGuard: !!buffs.snackBuff,
      cocoaBoost: !!buffs.cocoaBuff,
      syaoranUsed: false,
      syaoranSaveUsed: false,
      cmdIdx: 0,
      pickerOpen: false,
      pickerIdx: 0,
      pickerItems: [],
      timing: false,
      finishKind: null,
      pendingLiveCardId: null
    });
    buffs.shield = false;
    buffs.snackBuff = false;
    buffs.cocoaBuff = false;

    let bonus = '';
    if (buffs.wind > 0 && !target.isBoss) {
      const pd = Math.round(state.maxHp * 0.12);
      state.hp = Math.max(1, state.hp - pd);
      buffs.wind = 0;
      bonus += ` [윈디] 선제 돌풍으로 저항력 -${pd}!`;
    }
    if (state.sShield) bonus += ' [실드] 결계 유지!';
    if (state.snackGuard) bonus += ' [유키토의 간식] 방어+MP재생 적용!';
    if (state.cocoaBoost) bonus += ' [토우야의 코코아] 공격+15%·치명타+10%!';

    if ($('battleEnemyName')) {
      $('battleEnemyName').innerHTML = (target.isBoss || target.isIncident)
        ? `${Locale.t(target.kr)} <span class="text-xs font-magic text-yellow-300/80">${target.en || ''}</span>`
        : `${hooks.part === 2 ? '★ 별빛 공명 · ' : ''}${cardRuby(target)} <span class="text-xs font-magic text-yellow-300/80">${target.en}</span>`;
    }
    const tag = $('battleEnemyTag');
    if (tag) {
      if (target.isBoss) {
        tag.textContent = Locale.t(hooks.part === 1 ? '☽ 달의 심판자' : '🌌 최후의 시련');
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/40 border border-sky-300/70 text-sky-100';
      } else if (target.isIncident) {
        // 스포일러 방지: 초반 사건에서는 절대 에리오르 이름을 노출하지 않음!
        tag.textContent = Locale.t('✦ 기묘한 마법 사건');
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/35 border border-pink-300 text-pink-100';
      } else if (target.ruler === 'kero') {
        tag.textContent = '☀ 태양 지배';
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/25 border border-yellow-400/50 text-yellow-200';
      } else {
        tag.textContent = '☽ 달 지배';
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 border border-sky-400/50 text-sky-200';
      }
    }

    if ($('battleEnemyVisual')) {
      $('battleEnemyVisual').innerHTML = Art.getManifest(target, { isPart2: hooks.part === 2, bossPhase: 1 });
    }
    if ($('battleWeakHint')) $('battleWeakHint').textContent = Locale.t(target.weakHint || '');
    ['battleCardPicker', 'sealTimingBox', 'chantOverlay'].forEach((id) => $(id)?.classList.add('hidden'));
    $('battleOverlay')?.classList.remove('hidden');

    if (hooks.onModeChange) hooks.onModeChange('battle');
    pickIntent();

    const startMsg = target.isBoss
      ? (hooks.part === 1 ? '달의 심판자 유에가 은빛 날개를 펼쳤다!' : '스피넬 썬과 루비 문이 검은 날개와 진홍 나비 날개를 펼쳤다!')
      : target.isIncident
      ? `${target.kr}이(가) 앞을 가로막는다! 추천 카드를 3키 별빛 공명으로 각성시키며 저항력을 0으로 만들어 격파하자!`
      : `${cardName(target)}의 정령이 실체화했다! 저항력을 50% 이하로 약화시켜 수렴 마법진으로 봉인하자!`;
    setLog(startMsg + bonus);

    state.busy = true;
    updateUI();
    openWandRelease(() => {
      state.busy = false;
      SoundFX.encounter();
      updateUI();
    });
  }

  function damageEnemy(raw, { isBreak = false, isWand = false, isWeak = false, fromReflect = false } = {}) {
    const cos = getCostumeBonuses();
    let dmg = raw;
    const notes = [];

    if (!fromReflect) {
      if (cos.allAtkMult > 1) dmg = Math.round(dmg * cos.allAtkMult);
      if (state.cocoaBoost) dmg = Math.round(dmg * 1.15);
      const critChance = (cos.critChance || 0) + (state.cocoaBoost ? 0.1 : 0);
      if (critChance > 0 && Math.random() < critChance) {
        dmg = Math.round(dmg * (cos.critMult || 1.3));
        notes.push('💥치명타!');
      }
    }

    if (!fromReflect && state.eRef) {
      state.eRef = false;
      if (isBreak) {
        notes.push('반사막 파괴!!');
      } else {
        const back = Math.max(8, Math.round(dmg * 0.55));
        const p = hooks.getPlayer();
        p.hp = Math.max(0, p.hp - back);
        SoundFX.hit();
        return { dmg: 0, reflected: back, phaseUp: false, note: ` 거울 반사막에 막혀 ${back}의 피해를 되돌려 받았다!` };
      }
    }
    if (!fromReflect && state.eEvade) {
      state.eEvade = false;
      if (isWand) {
        SoundFX.click();
        return { dmg: 0, reflected: 0, phaseUp: false, note: ' 적이 공중으로 회피해 지팡이 일격이 빗나갔다!' };
      }
      if (!isWeak) {
        dmg = Math.round(dmg * 0.65);
        notes.push('회피로 피해 감소');
      }
    }
    if (!fromReflect && state.eGuard) {
      state.eGuard = false;
      if (isBreak) {
        dmg = Math.round(dmg * 1.25);
        notes.push('결계 파괴!!');
      } else {
        dmg = Math.max(4, Math.round(dmg * 0.45));
        notes.push('결계에 반감');
      }
    }

    let phaseUp = false;
    if (state.enemy.isBoss && state.phase === 1 && state.hp - dmg <= state.maxHp * 0.5) {
      state.hp = Math.ceil(state.maxHp * 0.5);
      state.phase = 2;
      state.eGuard = true;
      state.bind = 0;
      phaseUp = true;
    } else {
      state.hp = Math.max(0, state.hp - dmg);
    }
    return { dmg, reflected: 0, phaseUp, note: notes.length ? ` (${notes.join(', ')})` : '' };
  }

  function shortEffectTag(c, isSak) {
    if (c.effect === 'heal') return isSak ? '💚HP+66·MP+18' : '💚HP+50·MP+13';
    if (c.effect === 'light_heal') return `⚔${c.power}·💚회복`;
    if (c.effect === 'bind') return `⚔${c.power}·⛓구속`;
    if (c.effect === 'break') return `⚔${c.power}·💥파괴`;
    if (c.effect === 'shield') return '🛡결계80%↓';
    if (c.effect === 'evade') return `⚔${c.power}·✨회피`;
    if (c.effect === 'reflect') return '🪞공격반사';
    return `⚔${c.power}`;
  }

  function closeCardPicker() {
    if (!state.pickerOpen) return false;
    const grid = $('battleCardGrid');
    if (grid) lastPickerScrollTop = grid.scrollTop;
    state.pickerOpen = false;
    $('battleCardPicker')?.classList.add('hidden');
    syncCommandHighlight();
    return true;
  }

  function ensureDetailBar() {
    const picker = $('battleCardPicker');
    const grid = $('battleCardGrid');
    if (!picker || !grid) return null;
    let bar = $('battleCardDetailBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'battleCardDetailBar';
      bar.className = 'mb-2 px-2.5 py-1.5 rounded-xl bg-black/55 border border-yellow-400/35 text-[11px] font-story text-cyan-100 leading-snug truncate';
      picker.insertBefore(bar, grid);
    }
    return bar;
  }

  function syncPickerHighlight(autoScroll = true) {
    const items = state.pickerItems;
    if (!items.length) return;
    state.pickerIdx = Utils.clamp(state.pickerIdx, 0, items.length - 1);
    const cur = items[state.pickerIdx];
    if (cur) lastCardId = cur.id;

    items.forEach((it, idx) => {
      const sel = idx === state.pickerIdx;
      it.el.classList.toggle('ring-2', sel);
      it.el.classList.toggle('ring-yellow-300', sel);
      it.el.classList.toggle('bg-purple-800/90', sel && it.canUse);
      if (sel && autoScroll) it.el.scrollIntoView({ block: 'nearest' });
    });

    const bar = ensureDetailBar();
    if (bar && cur) {
      const prefix = cur.isWk ? '★약점/추천! ' : cur.isRes ? '⚠달 반감 · ' : '';
      const modeTip = cur.canLiveTransform ? ' [X: ✨3키 ★변환 해방 / C: 일반 사용]' : ' [X / 클릭: 즉시 해방]';
      bar.textContent = Locale.t(`${prefix}${cardName(cur.card)} — ${cur.card.desc}${cur.canUse ? modeTip : ' (MP 부족 또는 사용 불가)'}`);
    }
  }

  /** 컴팩트 원클릭 카드 선택 패널 (직전 선택 카드 & 스크롤 위치 완벽 기억!) */
  function openCardPicker() {
    if (!state.active || state.busy || state.timing || chant.active) return;
    const grid = $('battleCardGrid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 gap-1.5 overflow-y-auto pr-1';
    ensureDetailBar();

    const cards = hooks.getCards();
    const order = hooks.getCardOrder();
    const owned = hooks.getOwnedCards();
    const sakura = hooks.getSakuraCards ? hooks.getSakuraCards() : new Set();
    const p = hooks.getPlayer();
    const e = state.enemy;
    const isP2 = hooks.part === 2;

    if ($('battlePickerTitle')) {
      $('battlePickerTitle').textContent = Locale.t(
        isP2
          ? '카드 선택 (X: ✨3키 ★변환·해방 / C: 일반 / Z: 닫기)'
          : '크로우 카드 선택 (방향키 + X 또는 원클릭 즉시 해방 · Z: 닫기)'
      );
    }

    const recommended = toArr(e.recommended);
    state.pickerItems = [];

    for (const id of order) {
      if (!isP2 && !owned.has(id)) continue;
      const c = cards[id];
      if (!c) continue;

      const isSak = isP2 && sakura.has(id);
      const isSelf = isP2 && !e.isBoss && !e.isIncident && e.id === id;
      const isFinalLocked = isP2 && c.finalOnly && !isSak;
      const cost = isSak ? Math.max(6, c.mpCost - 2) : c.mpCost;
      const canUse = p.mp >= cost && !isSelf;
      const canLiveTransform = isP2 && !isSak && !isFinalLocked && canUse;
      const isWk = e.weakness === id || recommended.includes(id);
      const isRes = hooks.part === 1 && e.isBoss && c.ruler === 'yue';

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.disabled = !canUse;
      chip.className = `relative px-2.5 py-1.5 rounded-xl text-left border transition flex flex-col gap-0.5 ${
        isSelf
          ? 'bg-rose-950/45 border-rose-400/40 opacity-50'
          : !canUse
          ? 'bg-black/40 border-white/10 opacity-45'
          : isWk
          ? 'bg-amber-600/30 hover:bg-amber-500/40 border-yellow-300'
          : isSak
          ? 'bg-fuchsia-950/85 hover:bg-fuchsia-800/85 border-pink-300/80'
          : 'bg-purple-950/80 hover:bg-purple-800/80 border-purple-400/40'
      }`;

      const badge = isSelf
        ? '<span class="text-[9px] px-1 rounded bg-rose-500 text-white font-bold">공명중</span>'
        : isWk
        ? `<span class="text-[9px] px-1 rounded bg-yellow-300 text-black font-bold">${e.isIncident ? '추천' : '약점'}</span>`
        : isRes
        ? '<span class="text-[9px] px-1 rounded bg-slate-700 text-slate-300">반감</span>'
        : canLiveTransform
        ? '<span class="text-[9px] px-1 rounded bg-pink-500 text-white font-bold">★변환</span>'
        : isSak
        ? '<span class="text-[9px] px-1 rounded bg-pink-500/50 text-pink-100 font-bold">★공명</span>'
        : (c.ruler === 'kero' ? '<span class="text-[10px] text-amber-300">☀</span>' : '<span class="text-[10px] text-sky-300">☽</span>');

      chip.innerHTML = `
        <div class="flex items-center justify-between gap-1 w-full">
          <span class="font-story font-bold text-xs ${isSak ? 'text-pink-200' : 'text-yellow-200'} truncate">${cardRuby(c)} ${badge}</span>
          <span class="text-[10px] font-mono text-sky-300 shrink-0">MP ${cost}</span>
        </div>
        <div class="flex items-center justify-between gap-1 w-full text-[10px]">
          <span class="text-pink-100/85 truncate">${Locale.t(shortEffectTag(c, isSak))}</span>
          ${canLiveTransform ? '<span data-norm="1" class="px-1.5 py-0.2 rounded bg-purple-900/90 hover:bg-purple-700 border border-purple-300/45 text-[9px] text-amber-100 shrink-0">일반</span>' : ''}
        </div>
      `;

      const idx = state.pickerItems.length;
      chip.addEventListener('mouseenter', () => {
        state.pickerIdx = idx;
        syncPickerHighlight(false);
      });
      chip.addEventListener('click', (ev) => {
        if (!canUse) return;
        lastCardId = id;
        const normEl = ev.target.closest('[data-norm]');
        closeCardPicker();
        if (normEl) {
          useCard(id, false);
        } else if (canLiveTransform) {
          startStarCombo(id);
        } else {
          useCard(id, false);
        }
      });

      grid.appendChild(chip);
      state.pickerItems.push({ id, card: c, el: chip, canUse, canLiveTransform, isWk, isRes });
    }

    state.pickerOpen = true;

    // 직전에 선택했던 카드가 목록에 있으면 그 카드로 즉시 복원!
    const rememberedIdx = lastCardId ? state.pickerItems.findIndex((it) => it.id === lastCardId) : -1;
    const firstUsable = state.pickerItems.findIndex((it) => it.canUse);
    state.pickerIdx = rememberedIdx >= 0 ? rememberedIdx : (firstUsable >= 0 ? firstUsable : 0);

    $('battleCardPicker')?.classList.remove('hidden');
    syncCommandHighlight();

    // 직전 스크롤 위치 복원 후, 포커스 카드가 화면 밖이면 최소 이동
    grid.scrollTop = lastPickerScrollTop;
    syncPickerHighlight(rememberedIdx < 0);
    if (rememberedIdx >= 0 && state.pickerItems[rememberedIdx]?.el) {
      const el = state.pickerItems[rememberedIdx].el;
      const top = el.offsetTop - grid.offsetTop;
      const bottom = top + el.offsetHeight;
      if (top < grid.scrollTop || bottom > grid.scrollTop + grid.clientHeight) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
    SoundFX.click();
  }

  function doWand() {
    if (!state.active || state.busy || state.timing || chant.active) return;
    state.busy = true;
    closeCardPicker();
    const p = hooks.getPlayer();
    const raw = Math.round((16 + Math.random() * 5) * p.mult);
    const r = damageEnemy(raw, { isWand: true });
    const wandName = hooks.part === 2 ? '별의 지팡이' : '봉인의 지팡이';
    if (r.dmg > 0) {
      SoundFX.hit();
      shakeEnemy();
      spawnVFX('seal');
      setLog(`${wandName} 일격! ${r.dmg}의 피해!${r.note}`);
    } else {
      setLog(`${wandName} 일격!${r.note}`);
    }
    updateUI();
    Timers.after(() => postPlayerTurn(r.phaseUp), 700);
  }

  function doFocus() {
    if (!state.active || state.busy || state.timing || chant.active) return;
    state.busy = true;
    closeCardPicker();
    state.sFocus = true;
    const p = hooks.getPlayer();
    const gain = Math.min(p.maxMp - p.mp, 26 + Math.floor(p.lv * 1.4));
    p.mp += gain;
    SoundFX.heal();
    spawnVFX('seal');
    setLog(`방어 태세로 호흡을 가다듬었다! 다음 피해 65% 경감 + MP ${gain} 회복!`);
    updateUI();
    Timers.after(() => postPlayerTurn(false), 660);
  }

  function doSyaoranAssist() {
    const trust = hooks.getSyaoranTrust ? hooks.getSyaoranTrust() : 0;
    if (!state.active || state.busy || state.timing || chant.active || state.syaoranUsed || trust < 2) return;
    state.busy = true;
    state.syaoranUsed = true;
    closeCardPicker();

    const p = hooks.getPlayer();
    const baseDmg = Math.round((38 + Math.min(10, trust) * 5) * Math.max(1, p.mult * 0.92));
    const r = damageEnemy(baseDmg, { isBreak: true, isWeak: true });
    SoundFX.syaoran();
    shakeEnemy();
    spawnVFX('syaoran');
    setLog(`⚡ 샤오랑 부적 원호 — "뇌제초래!!" 푸른 번개 부적이 ${r.dmg}의 피해!${r.note}`);
    updateUI();
    Timers.after(() => postPlayerTurn(r.phaseUp), 820);
  }

  function useCard(id, liveAwakened = false) {
    const cards = hooks.getCards();
    const c = cards[id];
    if (!c) return;
    lastCardId = id;
    const p = hooks.getPlayer();
    const isP2 = hooks.part === 2;
    const sakura = hooks.getSakuraCards ? hooks.getSakuraCards() : new Set();
    const isSak = isP2 && (sakura.has(id) || liveAwakened);
    const cost = isSak && !liveAwakened ? Math.max(6, c.mpCost - 2) : c.mpCost;

    if (!liveAwakened && p.mp < cost) return;
    state.busy = true;
    if (!liveAwakened) p.mp = Math.max(0, p.mp - cost);
    spawnVFX(c.vfx);

    const cos = getCostumeBonuses();
    const costumeMagic = cos.magicMult || 1;
    const healMult = cos.healMult || 1;
    const sakMult = liveAwakened ? 1.65 : isSak ? 1.3 : (isP2 ? 0.85 : 1.0);
    const recommended = toArr(state.enemy.recommended);
    const isWk = state.enemy.weakness === id || recommended.includes(id);

    let msg = liveAwakened
      ? `★ [사쿠라 카드 각성 일격!] ${cardName(c)} — ${c.skillName}! `
      : `[${cardName(c)}]${isSak ? '★' : ''} 해방 — ${c.skillName}! `;
    let phaseUp = false;

    if (c.effect === 'heal') {
      const h = Math.min(p.maxHp - p.hp, Math.round((isSak ? 66 : 50) * healMult));
      const m = Math.min(p.maxMp - p.mp, Math.round((isSak ? 18 : 13) * healMult));
      p.hp += h;
      p.mp += m;
      SoundFX.heal();
      msg += `HP +${h}, MP +${m} 회복!`;
      if (liveAwakened) {
        const bonusR = damageEnemy(Math.round(36 * p.mult), { isWeak: isWk });
        phaseUp = bonusR.phaseUp;
        shakeEnemy();
        msg += ` 각성 별빛 파동으로 ${bonusR.dmg}의 피해!`;
      }
    } else {
      let dmg = Math.round((c.power || 22) * p.mult * sakMult * costumeMagic);
      let note = liveAwakened ? ' (★실시간 각성 보너스!)' : (isSak ? ' (★별의 공명!)' : '');

      if (isWk) {
        dmg = Math.round(dmg * 1.42);
        note += ' (약점 명중!)';
      } else if (hooks.part === 1 && state.enemy.isBoss && c.ruler === 'yue') {
        dmg = Math.max(5, Math.round(dmg * 0.35));
        note = ' (달 카드 반감!)';
      } else if (hooks.part === 1 && state.enemy.isBoss && ['firey', 'earthy', 'light'].includes(id)) {
        dmg = Math.round(dmg * 1.15);
        note = ' (태양 공명!)';
      }

      if (dmg > 0) {
        const r = damageEnemy(dmg, { isBreak: c.effect === 'break' || liveAwakened, isWeak: isWk });
        phaseUp = r.phaseUp;
        if (r.reflected) {
          msg += r.note;
        } else {
          shakeEnemy();
          SoundFX.magic();
          msg += `${r.dmg}의 피해!${note}${r.note}`;
        }
      } else {
        SoundFX.magic();
      }

      if (c.effect === 'light_heal') {
        const baseH = id === 'glow' ? (isSak ? 36 : 26) : (isSak ? 44 : 30);
        const h = Math.round(baseH * healMult);
        p.hp = Math.min(p.maxHp, p.hp + h);
        SoundFX.heal();
        msg += ` HP +${h}!`;
      } else if (c.effect === 'bind') {
        if (state.enemy.isBoss) msg += ' 최종 보스에게는 구속이 통하지 않는다!';
        else if (state.bindRes > 0) msg += ' 적이 구속을 뿌리쳤다!';
        else {
          state.bind = 1;
          state.bindRes = 2;
          msg += ' 상대를 1턴 구속했다!';
        }
      } else if (c.effect === 'shield') {
        state.sShield = true;
        msg += ' 수호 결계 전개!';
      } else if (c.effect === 'evade') {
        state.sEvade = true;
        msg += ' 공중 회피 태세!';
      } else if (c.effect === 'reflect') {
        state.sRef = true;
        msg += ' 거울 반사 준비!';
      }
    }

    setLog(msg);
    updateUI();
    Timers.after(() => postPlayerTurn(phaseUp), 780);
  }

  function enterBossPhase2() {
    if ($('battleEnemyVisual')) {
      $('battleEnemyVisual').innerHTML = Art.getManifest(state.enemy, { isPart2: hooks.part === 2, bossPhase: 2 });
    }
    SoundFX.encounter();
    spawnVFX('shadow');
    pickIntent();
    setLog(
      hooks.part === 1
        ? '유에: "겨우 이 정도가 아닐 텐데..." — [PHASE 2 · 만월의 심판]과 달빛 결계가 전개되었다!'
        : '에리오르: "수호자들을 넘어섰군요... 이제 제 차례입니다." — [PHASE 2 · 에리오르]가 영원한 어둠과 결계를 펼쳤다!'
    );
    state.busy = false;
    updateUI();
  }

  /** 2부 5대 사건 보스: 게이지 없이 HP 0 달성 즉시 순수 격파! */
  function resolveIncidentVictory() {
    const e = state.enemy;
    state.busy = true;
    state.hp = 0;
    SoundFX.seal();
    spawnVFX('seal');
    shakeEnemy();
    setLog(`✨ [${e.kr}]의 기묘한 마법 현상을 완전히 돌파했다!`);
    updateUI();
    Timers.after(() => finishBattleVictory(e), 850);
  }

  function postPlayerTurn(phaseUp) {
    if (!state.active) return;
    const p = hooks.getPlayer();
    if (p.hp <= 0) return handleDefeat();
    if (phaseUp && state.enemy.isBoss) return enterBossPhase2();

    if (state.hp <= 0) {
      state.hp = 0;
      state.eGuard = state.eRef = state.eEvade = false;
      // 제2부 5대 기묘한 사건 보스는 게이지 없이 HP 0 달성 즉시 승리!
      if (state.enemy.isIncident) {
        return resolveIncidentVictory();
      }
      if (!state.exhausted) {
        state.exhausted = true;
        pickIntent();
        SoundFX.magic();
        setLog(
          state.enemy.isBoss
            ? (hooks.part === 2
                ? '에리오르의 어둠이 흔들린다! 지금 [🔥 마력 충돌!]로 최후의 별빛을 밀어붙이자!'
                : '유에의 달빛이 흔들린다! 지금 [🔥 마력 충돌!]로 심판을 돌파하자!')
            : `${cardName(state.enemy)}가 탈진했다! 지금 [${hooks.part === 2 ? '🎯 사쿠라 변환!' : '🎯 수렴 봉인!'}] 마법진을 펼치자!`
        );
        state.busy = false;
        updateUI();
        return;
      }
    }
    enemyTurn();
  }

  function hurtPlayer(raw, mpDrain = 0) {
    const p = hooks.getPlayer();
    const trust = hooks.getSyaoranTrust ? hooks.getSyaoranTrust() : 0;

    if (state.sEvade) {
      state.sEvade = false;
      SoundFX.magic();
      return { txt: '[점프]로 완벽히 회피했다!', ref: 0 };
    }
    if (state.sRef) {
      state.sRef = false;
      const r = Math.round(raw * 1.35);
      SoundFX.magic();
      return { txt: `[미러]가 공격을 되돌려 ${r}의 피해를 반사했다!`, ref: r };
    }

    if (trust >= 3 && !state.syaoranSaveUsed && (p.hp <= p.maxHp * 0.35 || raw >= p.hp)) {
      state.syaoranSaveUsed = true;
      SoundFX.syaoran();
      spawnVFX('syaoran');
      return { txt: '⚡ 위기의 순간 샤오랑이 뛰어들어 부적으로 공격을 대신 막아냈다! (피해 0)', ref: 0 };
    }

    let d = raw;
    let pre = '';

    const cos = getCostumeBonuses();
    if (cos.elemResist < 1 && ['thunder', 'firey', 'inc_rain', 'inc_spinel'].includes(state.enemy?.id)) {
      d = Math.round(d * cos.elemResist);
    }
    if (cos.waterWindResist < 1 && ['watery', 'windy', 'inc_rain'].includes(state.enemy?.id)) {
      d = Math.round(d * cos.waterWindResist);
    }
    if (state.snackGuard) {
      d = Math.max(2, Math.round(d * 0.78));
    }

    if (state.sShield) {
      state.sShield = false;
      d = Math.max(2, Math.round(d * 0.2));
      pre = '[결계]로 충격을 막아내 ';
    } else if (state.sFocus) {
      d = Math.max(3, Math.round(d * 0.35));
      pre = '방어 태세로 ';
    }

    p.hp = Math.max(0, p.hp - d);
    let dr = '';
    if (mpDrain > 0) {
      const lost = Math.min(p.mp, mpDrain);
      p.mp -= lost;
      if (lost) dr = ` (MP -${lost})`;
    }
    SoundFX.hit();
    return { txt: `${pre}사쿠라에게 ${d}의 피해!${dr}`, ref: 0 };
  }

  function applyTurnEndRegen() {
    const cosRegen = getCostumeBonuses().turnMpRegen || 0;
    const snackRegen = state.snackGuard ? 3 : 0;
    const total = cosRegen + snackRegen;
    if (total > 0) {
      const p = hooks.getPlayer();
      p.mp = Math.min(p.maxMp, p.mp + total);
    }
  }

  function enemyTurn() {
    const e = state.enemy;
    const p = hooks.getPlayer();

    if (state.bind > 0) {
      state.bind--;
      applyTurnEndRegen();
      setLog(`${getEnemyDisplayName(e)}은(는) 구속되어 움직이지 못했다!`);
      state.busy = false;
      updateUI();
      return;
    }
    if (state.bindRes > 0) state.bindRes--;

    if (state.exhausted) {
      state.exhausted = false;
      const rec = Math.max(18, Math.round(state.maxHp * 0.16));
      state.hp = Math.min(state.maxHp, rec);
      SoundFX.encounter();
      setLog(`마무리를 망설이는 사이 상대가 저항력을 ${rec} 회복했다!`);
      pickIntent();
      applyTurnEndRegen();
      state.busy = false;
      updateUI();
      return;
    }

    const act = state.intent || { type: 'attack', dmg: e.atk };
    let msg = '';
    let refPhaseUp = false;

    if (act.type === 'charge') {
      SoundFX.encounter();
      spawnVFX(e.vfx || 'shadow');
      msg = `${getEnemyDisplayName(e)}가 막대한 마력을 응집하고 있다! 다음 턴 강공격 대비!`;
    } else if (act.type === 'barrier') {
      state.eGuard = true;
      SoundFX.magic();
      msg = `${getEnemyDisplayName(e)}가 마력 결계를 펼쳤다! (소드·이레이즈·샤오랑 원호로 파괴)`;
    } else if (act.type === 'reflect') {
      state.eRef = true;
      SoundFX.magic();
      msg = `${getEnemyDisplayName(e)}가 거울 반사막을 펼쳤다! 일반 공격 주의!`;
    } else if (act.type === 'evade') {
      state.eEvade = true;
      SoundFX.magic();
      msg = `${getEnemyDisplayName(e)}가 고속 회피 태세를 갖췄다!`;
    } else if (act.type === 'heal') {
      const h = Math.round(state.maxHp * 0.14);
      state.hp = Math.min(state.maxHp, state.hp + h);
      const r = hurtPlayer(Math.max(4, Math.round(e.atk * 0.55)));
      SoundFX.heal();
      msg = `${getEnemyDisplayName(e)}가 저항력 ${h} 회복하며 ${r.txt}`;
    } else {
      const raw = Math.round((act.dmg || e.atk) * (0.92 + Math.random() * 0.16));
      const r = hurtPlayer(raw, act.mp || 0);
      msg = `${getEnemyDisplayName(e)}의 ${act.type === 'big' ? '강력한 일격! ' : '반격! '}${r.txt}`;
      if (r.ref > 0) {
        const res = damageEnemy(r.ref, { fromReflect: true });
        refPhaseUp = res.phaseUp;
        shakeEnemy();
        if (state.hp <= 0) {
          if (e.isIncident) {
            state.sFocus = false;
            return resolveIncidentVictory();
          }
          state.exhausted = true;
          msg += ' 상대가 반사 충격으로 탈진했다!';
        }
      }
    }

    state.sFocus = false;
    applyTurnEndRegen();
    setLog(msg);
    updateUI();

    if (p.hp <= 0) return handleDefeat();
    if (refPhaseUp) return enterBossPhase2();
    pickIntent();
    state.busy = false;
    updateUI();
  }

  function handleDefeat() {
    Timers.clearAll();
    state.active = false;
    state.busy = false;
    state.timing = false;
    state.finishKind = null;
    chant.active = false;
    $('battleOverlay')?.classList.add('hidden');
    if (hooks.onDefeat) hooks.onDefeat();
  }

  /* --------------------------------------------------------------------------
   * 3. 4종 마법 피니시 엔진 (수렴 마법진 / 3키 별빛 공명 / X연타 마력 충돌)
   *    - #sealTimingBox 내부에 상황별 전용 인터랙티브 스테이지를 동적 렌더링
   * ------------------------------------------------------------------------*/
  function closeFinishBox() {
    state.timing = false;
    state.finishKind = null;
    state.pendingLiveCardId = null;
    $('sealTimingBox')?.classList.add('hidden');
  }

  function cancelSeal() {
    if (!state.timing) return;
    closeFinishBox();
    SoundFX.click();
    updateUI();
  }

  /** 메인 [🌟 봉인! / 🔥 마력 충돌!] 버튼 클릭 진입점 */
  function startSeal() {
    if (!state.active || state.busy || state.timing || chant.active) return;
    const e = state.enemy;
    if (!e) return;
    if (e.isIncident) {
      setLog('기묘한 사건 보스는 봉인 게이지 없이 저항력을 0으로 만들면 즉시 해결됩니다!');
      SoundFX.click();
      return;
    }
    if (!canAttemptFinish()) {
      const req = e.isBoss ? (state.phase === 1 ? '55%' : '35%') : '50%';
      setLog(`아직 상대의 저항력이 너무 강해! 저항력을 ${req} 이하로 약화시켜야 해!`);
      SoundFX.click();
      return;
    }
    if (e.isBoss) startMagicClash();
    else startRitualRing();
  }

  /* ---- [피니시 1] 수렴 마법진 (Ritual Ring) : 1부 봉인 & 2부 공명 변환 ---- */
  function startRitualRing() {
    closeCardPicker();
    const box = $('sealTimingBox');
    if (!box) return;

    const m = ringMetrics();
    const center = 38 + Math.round((Math.random() - 0.5) * 14); // 31 ~ 45 사이 랜덤 목표 반경
    state.ringMin = Math.max(16, Math.round(center - m.band / 2));
    state.ringMax = Math.min(82, Math.round(center + m.band / 2));
    state.ringSpeed = m.speed;
    state.ringRadius = 100;
    state.timing = true;
    state.finishKind = 'ring';

    const isP2 = hooks.part === 2;
    const targetOuterPct = state.ringMax;
    const targetInnerPct = state.ringMin;

    box.innerHTML = `
      <div class="flex items-center justify-between text-[11px] mb-1">
        <span class="font-magic ${isP2 ? 'text-pink-200' : 'text-yellow-300'} tracking-widest">🎯 ${isP2 ? 'STAR CONVERGENCE RING' : 'RITUAL SEALING RING'}</span>
        <span class="font-story text-pink-200 font-bold">판정폭 ${m.band}% · ${m.lbl}</span>
      </div>
      <p class="font-story text-xs text-pink-100 mb-2.5">${Locale.t('줄어드는 빛의 고리가 <b>황금 마법진 구역</b>에 겹치는 순간 <b>X</b> 또는 <b>실행</b>을 누르세요!')}</p>
      <div class="relative w-36 h-36 mx-auto mb-3 flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border border-dashed border-purple-400/35 animate-spin-slow"></div>
        <!-- 황금 판정 띠 (바깥 경계 ~ 안쪽 경계) -->
        <div class="absolute rounded-full border-2 border-yellow-300/90 bg-yellow-300/18 shadow-[0_0_16px_rgba(250,204,21,0.35)]" style="width:${targetOuterPct}%;height:${targetOuterPct}%;"></div>
        <div class="absolute rounded-full bg-[#15082c]/85 border border-yellow-200/75" style="width:${targetInnerPct}%;height:${targetInnerPct}%;"></div>
        <!-- 중앙 별 코어 -->
        <div id="ritualCore" class="relative z-10 text-lg transition-transform duration-100">${isP2 ? '⭐' : '✦'}</div>
        <!-- 수렴하는 움직이는 고리 (GPU scale) -->
        <div id="ritualRingCircle" class="absolute inset-0 rounded-full border-[4px] border-pink-400 shadow-[0_0_14px_#f472b6] pointer-events-none" style="will-change:transform;transform:scale(1);"></div>
      </div>
      <div class="flex justify-center gap-2">
        <button id="btnExecRing" class="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold text-sm shadow-lg active:scale-95">${Locale.t(isP2 ? '★ 지금 변환! (X)' : '🌟 지금 봉인! (X)')}</button>
        <button id="btnCancelFinish" class="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 font-bold text-sm">취소 (Z)</button>
      </div>
    `;
    box.classList.remove('hidden');
    $('btnExecRing')?.addEventListener('pointerdown', (ev) => { ev.preventDefault(); execRing(); });
    $('btnCancelFinish')?.addEventListener('click', cancelSeal);
    SoundFX.click();
    updateUI();
  }

  function syncRingVisual() {
    const ring = $('ritualRingCircle');
    if (ring) {
      ring.style.transform = `scale(${(state.ringRadius / 100).toFixed(3)})`;
      const inZone = state.ringRadius >= state.ringMin - 1.5 && state.ringRadius <= state.ringMax + 1.5;
      ring.style.borderColor = inZone ? '#fef08a' : '#f472b6';
      const core = $('ritualCore');
      if (core) core.style.transform = inZone ? 'scale(1.32)' : 'scale(1)';
    }
  }

  function execRing() {
    if (!state.timing || state.finishKind !== 'ring') return;
    const r = state.ringRadius;
    const hit = r >= state.ringMin - 1.8 && r <= state.ringMax + 1.8;
    closeFinishBox();
    state.busy = true;

    if (hit) {
      const e = state.enemy;
      const isP2 = hooks.part === 2;
      openChant({
        cards: [e],
        spiritTarget: e,
        isSakura: isP2,
        mainChant: Locale.getChant(isP2 ? 'transform_p2' : 'seal_p1'),
        subQuote: isP2 ? e.transformQuote : e.sealQuote,
        onDone: () => finishBattleVictory(e)
      });
    } else {
      handleFinishFail('수렴 마법진 타이밍이 어긋나 봉인진이 깨졌다!');
    }
  }

  /* ---- [피니시 2] 3키 별빛 공명 (Star Combo) : 2부 전투 중 실시간 ★카드 변환 ---- */
  function startStarCombo(cardId) {
    const c = hooks.getCards()[cardId];
    const p = hooks.getPlayer();
    if (!c || p.mp < c.mpCost) return;

    closeCardPicker();
    const box = $('sealTimingBox');
    if (!box) return;

    // 3방향 커맨드 생성 (3개 모두 똑같지 않게 보정)
    const seq = [
      ALL_DIRS[Math.floor(Math.random() * 4)],
      ALL_DIRS[Math.floor(Math.random() * 4)],
      ALL_DIRS[Math.floor(Math.random() * 4)]
    ];
    if (seq[0] === seq[1] && seq[1] === seq[2]) {
      seq[2] = ALL_DIRS[(ALL_DIRS.indexOf(seq[2]) + 1) % 4];
    }

    const cosBonus = getCostumeBonuses().sealZoneBonus || 0;
    state.comboSeq = seq;
    state.comboStep = 0;
    state.comboMaxTime = 5.4 + cosBonus * 0.22;
    state.comboTime = state.comboMaxTime;
    state.pendingLiveCardId = cardId;
    state.timing = true;
    state.finishKind = 'combo';

    box.innerHTML = `
      <div class="flex items-center justify-between text-[11px] mb-1">
        <span class="font-magic text-pink-200 tracking-widest">✨ STAR RESONANCE COMBO</span>
        <span class="font-story text-yellow-200 font-bold">${Locale.t(`[${cardName(c)}] 실시간 ★각성`)}</span>
      </div>
      <p class="font-story text-xs text-pink-100 mb-2">방향키(WASD) 또는 아래 화살표를 <b>순서대로 3번</b> 입력해 별빛을 공명시키세요! (취소: Z)</p>
      <div id="comboSlots" class="flex items-center justify-center gap-3 my-2.5"></div>
      <div class="h-2 bg-black/70 rounded-full overflow-hidden border border-pink-300/50 mb-3">
        <div id="comboTimeBar" class="h-full bg-gradient-to-r from-pink-400 via-yellow-300 to-fuchsia-400" style="width:100%"></div>
      </div>
      <div class="flex items-center justify-center gap-2 mb-2.5">
        <button data-cdir="left" class="w-11 h-10 rounded-xl bg-purple-900/90 hover:bg-pink-600 border border-pink-300/60 text-yellow-200 font-bold text-base active:scale-95">◀</button>
        <button data-cdir="up" class="w-11 h-10 rounded-xl bg-purple-900/90 hover:bg-pink-600 border border-pink-300/60 text-yellow-200 font-bold text-base active:scale-95">▲</button>
        <button data-cdir="down" class="w-11 h-10 rounded-xl bg-purple-900/90 hover:bg-pink-600 border border-pink-300/60 text-yellow-200 font-bold text-base active:scale-95">▼</button>
        <button data-cdir="right" class="w-11 h-10 rounded-xl bg-purple-900/90 hover:bg-pink-600 border border-pink-300/60 text-yellow-200 font-bold text-base active:scale-95">▶</button>
      </div>
      <div class="flex justify-center">
        <button id="btnCancelFinish" class="px-4 py-1.5 rounded-xl bg-slate-700 text-slate-200 font-bold text-xs">취소 (Z)</button>
      </div>
    `;
    box.classList.remove('hidden');
    box.querySelectorAll('[data-cdir]').forEach((btn) => {
      btn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        inputComboDir(btn.dataset.cdir);
      });
    });
    $('btnCancelFinish')?.addEventListener('click', cancelSeal);
    renderComboSlots();
    SoundFX.click();
    updateUI();
  }

  function renderComboSlots() {
    const wrap = $('comboSlots');
    if (!wrap) return;
    wrap.innerHTML = state.comboSeq.map((dir, idx) => {
      const done = idx < state.comboStep;
      const cur = idx === state.comboStep;
      const cls = done
        ? 'bg-gradient-to-br from-pink-500 to-amber-400 border-yellow-200 text-white scale-105 shadow-[0_0_14px_rgba(250,204,21,0.7)]'
        : cur
        ? 'bg-purple-800/90 border-yellow-300 text-yellow-200 ring-2 ring-yellow-300/80 scale-110'
        : 'bg-black/55 border-white/20 text-slate-300';
      return `<div class="w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center transition ${cls}">
        <span class="text-xl font-bold leading-none">${done ? '★' : DIR_ARROWS[dir]}</span>
        <span class="text-[9px] font-mono mt-0.5">${idx + 1}</span>
      </div>`;
    }).join('');
  }

  function inputComboDir(dir) {
    if (!state.timing || state.finishKind !== 'combo') return;
    const expected = state.comboSeq[state.comboStep];
    if (dir === expected) {
      SoundFX.comboStep?.(state.comboStep);
      spawnVFX('seal');
      state.comboStep++;
      renderComboSlots();
      if (state.comboStep >= state.comboSeq.length) {
        const liveId = state.pendingLiveCardId;
        const c = hooks.getCards()[liveId];
        const p = hooks.getPlayer();
        closeFinishBox();
        state.busy = true;
        p.mp = Math.max(0, p.mp - c.mpCost);
        openChant({
          cards: [c],
          spiritTarget: c,
          isSakura: true,
          mainChant: Locale.getChant('transform_p2'),
          subQuote: c.transformQuote || c.awakeningLine,
          onDone: () => {
            if (hooks.onLiveCardConverted) hooks.onLiveCardConverted(c);
            useCard(liveId, true);
          }
        });
      }
    } else {
      SoundFX.hit();
      state.comboStep = 0;
      const box = $('sealTimingBox');
      if (box) {
        box.classList.remove('shake-hit');
        void box.offsetWidth;
        box.classList.add('shake-hit');
      }
      renderComboSlots();
    }
  }

  function failStarCombo() {
    const liveId = state.pendingLiveCardId;
    const c = hooks.getCards()[liveId];
    const p = hooks.getPlayer();
    closeFinishBox();
    state.busy = true;
    p.mp = Math.max(0, p.mp - (c?.mpCost || 0));
    SoundFX.hit();
    setLog(`별빛 공명 시간이 지나 [${cardName(c)}] 변환에 실패했다! (크로우 카드 위력으로 발동)`);
    updateUI();
    Timers.after(() => useCard(liveId, false), 650);
  }

  /* ---- [피니시 3] 마력 충돌 (Magic Clash · X 연타!) : 최종 보스전 ---- */
  function startMagicClash() {
    closeCardPicker();
    const box = $('sealTimingBox');
    if (!box) return;

    const cosBonus = getCostumeBonuses().sealZoneBonus || 0;
    state.clashVal = state.exhausted ? 54 : 42;
    state.clashMaxTime = 8.5;
    state.clashTime = state.clashMaxTime;
    state.clashPushBack = Math.max(12, (state.exhausted ? 15.5 : 20.5) - cosBonus * 0.45);
    state.clashTapPower = 7.8;
    state.timing = true;
    state.finishKind = 'clash';

    const heroName = Locale.t('사쿠라');
    const bossName = Locale.t(getEnemyDisplayName(state.enemy));

    box.innerHTML = `
      <div class="flex items-center justify-between text-[11px] mb-1">
        <span class="font-magic text-yellow-300 tracking-widest">🔥 MAGIC CLASH · FINAL DUEL</span>
        <span id="clashTimerText" class="font-mono text-pink-200 font-bold">${state.clashTime.toFixed(1)}s</span>
      </div>
      <p class="font-story text-xs text-pink-100 mb-2"><b>X 키를 연타</b>(또는 아래 버튼 연타)해 마력 구슬을 상대 쪽 끝까지 밀어내세요!</p>
      <div class="flex justify-between text-[10px] font-story font-bold mb-1 px-1">
        <span class="text-pink-300">✦ ${heroName}</span>
        <span class="text-sky-300">${bossName} ☽</span>
      </div>
      <div class="relative h-7 bg-indigo-950/90 rounded-full border-2 border-yellow-300/75 overflow-hidden mb-3">
        <div id="clashPlayerBar" class="h-full bg-gradient-to-r from-pink-500 via-fuchsia-400 to-yellow-300 transition-[width] duration-75" style="width:${state.clashVal}%"></div>
        <div id="clashOrb" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-yellow-200 shadow-[0_0_16px_#fef08a]" style="left:${state.clashVal}%"></div>
      </div>
      <div class="flex justify-center gap-2">
        <button id="btnClashTap" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 border border-yellow-200 text-white font-bold text-sm shadow-xl active:scale-95">🔥 마력 밀어내기! (X 연타)</button>
        <button id="btnCancelFinish" class="px-3.5 py-2 rounded-xl bg-slate-700 text-slate-200 font-bold text-xs">취소 (Z)</button>
      </div>
    `;
    box.classList.remove('hidden');
    $('btnClashTap')?.addEventListener('pointerdown', (ev) => { ev.preventDefault(); tapClash(); });
    $('btnCancelFinish')?.addEventListener('click', cancelSeal);
    SoundFX.encounter();
    updateUI();
  }

  function syncClashVisual() {
    const bar = $('clashPlayerBar');
    const orb = $('clashOrb');
    const tEl = $('clashTimerText');
    if (bar) bar.style.width = `${state.clashVal.toFixed(1)}%`;
    if (orb) orb.style.left = `${state.clashVal.toFixed(1)}%`;
    if (tEl) tEl.textContent = `${Math.max(0, state.clashTime).toFixed(1)}s`;
  }

  function tapClash() {
    if (!state.timing || state.finishKind !== 'clash') return;
    state.clashVal = Math.min(100, state.clashVal + state.clashTapPower);
    SoundFX.clashTap?.();
    if (Math.random() < 0.35) spawnVFX('seal');
    syncClashVisual();

    if (state.clashVal >= 100) {
      const e = state.enemy;
      closeFinishBox();
      state.busy = true;
      if (state.phase === 1) {
        state.hp = Math.ceil(state.maxHp * 0.5);
        state.phase = 2;
        state.eGuard = true;
        enterBossPhase2();
        return;
      }
      if (hooks.part === 2) {
        const cards = hooks.getCards();
        openChant({
          cards: [cards.dark, cards.light],
          spiritTarget: e,
          isSakura: true,
          mainChant: Locale.getChant('dual_p2'),
          subQuote: '어둠과 빛이 손을 맞잡고 별빛 사쿠라 카드로 피어나며 토모에다의 아침이 열렸다!',
          onDone: () => finishBattleVictory(e)
        });
      } else {
        openChant({
          cards: [e],
          spiritTarget: e,
          isSakura: false,
          mainChant: Locale.getChant('yue_p1'),
          subQuote: '달의 심판자 유에가 부드러운 미소와 함께 새로운 주인을 인정했다.',
          onDone: () => finishBattleVictory(e)
        });
      }
    }
  }

  function handleFinishFail(reasonMsg) {
    SoundFX.hit();
    const r = state.hp / Math.max(1, state.maxHp);
    const res = hurtPlayer(Math.max(8, Math.round(state.enemy.atk * (0.85 + r * 0.5))));
    if (state.exhausted) {
      state.exhausted = false;
      state.hp = Math.max(14, Math.round(state.maxHp * 0.16));
    }
    setLog(`${reasonMsg} 역습 — ${res.txt}`);
    updateUI();
    if (hooks.getPlayer().hp <= 0) handleDefeat();
    else {
      Timers.after(() => {
        pickIntent();
        state.busy = false;
        updateUI();
      }, 800);
    }
  }

  /** 공용 X / 모바일 실행 호환 */
  function execSeal() {
    if (!state.timing) return;
    if (state.finishKind === 'ring') execRing();
    else if (state.finishKind === 'clash') tapClash();
  }

  function finishBattleVictory(target) {
    state.active = false;
    state.busy = false;
    state.timing = false;
    state.finishKind = null;
    state.pickerOpen = false;
    $('battleOverlay')?.classList.add('hidden');
    if (hooks.onVictory) hooks.onVictory(target);
  }

  /* --------------------------------------------------------------------------
   * 4. 배틀 돌입 지팡이 봉인 해제 컷인 & 3단계 정령 -> 카드 실시간 변신 영창
   * ------------------------------------------------------------------------*/
  function openWandRelease(onDone) {
    const isP2 = hooks.part === 2;
    SoundFX.magic();
    spawnVFX('seal');
    chant.active = true;
    chant.mode = 'release';
    chant.typing = true;
    chant.flipped = true;
    chant.finalCards = [];
    chant.isSakura = isP2;
    chant.full = Locale.getChant(isP2 ? 'release_p2' : 'release_p1');
    chant.sub = Locale.t(
      isP2 ? '별의 열쇠가 찬란한 빛과 함께 별의 지팡이로 깨어났다!' : '봉인의 열쇠가 빛을 뿜으며 봉인의 지팡이로 깨어났다!'
    );
    chant.len = 0;
    chant.onDone = onDone;

    const vis = $('chantCardVisual');
    if (vis) {
      vis.className = 'w-44 h-52 sm:w-52 sm:h-60 rounded-3xl manifest-stage p-2 relative z-10 flex items-center justify-center animate-float';
      vis.innerHTML = getWandReleaseSVG(isP2);
    }

    if ($('chantSubLabel')) {
      $('chantSubLabel').textContent = isP2 ? 'RELEASE · KEY OF THE STAR' : 'RELEASE · KEY OF DARKNESS';
    }
    const textEl = $('chantText');
    if (textEl) {
      textEl.style.whiteSpace = 'pre-line';
      textEl.textContent = '';
    }
    if ($('chantSubQuote')) $('chantSubQuote').textContent = '';
    if ($('btnChantDone')) {
      $('btnChantDone').textContent = '⚔ 배틀 시작! (X / 클릭)';
      $('btnChantDone').classList.add('hidden');
    }
    $('chantOverlay')?.classList.remove('hidden');

    Timers.clear(chant.tId);
    chant.tId = Timers.every(() => {
      chant.len += 2;
      if (chant.len >= chant.full.length) {
        if (textEl) textEl.textContent = chant.full;
        if ($('chantSubQuote')) $('chantSubQuote').textContent = chant.sub;
        chant.typing = false;
        Timers.clear(chant.tId);
        chant.tId = null;
        $('btnChantDone')?.classList.remove('hidden');
      } else if (textEl) {
        textEl.textContent = chant.full.slice(0, chant.len);
      }
    }, 24);
  }

  function revealFinalChantCard() {
    if (chant.flipped) return;
    chant.flipped = true;
    SoundFX.seal();
    spawnVFX('seal');
    const vis = $('chantCardVisual');
    if (!vis) return;
    const frameCls = chant.isSakura ? 'sakura-frame' : 'clow-frame';
    if (chant.finalCards.length >= 2) {
      vis.className = 'flex items-center justify-center gap-3 relative z-10 card-flip-in';
      vis.innerHTML = chant.finalCards
        .map((c) => `<div class="w-32 h-46 sm:w-40 sm:h-56 rounded-2xl ${frameCls} p-1.5">${Art.getCard(c, chant.isSakura)}</div>`)
        .join('');
    } else {
      vis.className = `w-36 h-52 sm:w-44 sm:h-64 rounded-2xl ${frameCls} p-2 relative z-10 flex items-center justify-center card-flip-in`;
      vis.innerHTML = Art.getCard(chant.finalCards[0], chant.isSakura);
    }
  }

  function openChant({ cards = [], spiritTarget = null, isSakura = false, mainChant = '', subQuote = '', onDone = null }) {
    SoundFX.magic();
    spawnVFX('seal');
    chant.active = true;
    chant.mode = 'seal';
    chant.typing = true;
    chant.flipped = false;
    chant.finalCards = cards;
    chant.isSakura = isSakura;
    chant.full = Locale.t(mainChant);
    chant.sub = Locale.t(subQuote || '');
    chant.len = 0;
    chant.onDone = onDone;

    const vis = $('chantCardVisual');
    if (vis) {
      vis.className = 'w-44 h-48 sm:w-52 sm:h-56 rounded-3xl manifest-stage p-2 relative z-10 flex items-center justify-center animate-float';
      vis.innerHTML = spiritTarget
        ? Art.getManifest(spiritTarget, { isPart2: isSakura, bossPhase: state.phase })
        : Art.getCard(cards[0], isSakura);
    }

    if ($('chantSubLabel')) {
      $('chantSubLabel').textContent = Locale.t(
        isSakura ? 'STAR TRANSFORMATION · SAKURA CARD' : 'RETURN TO YOUR TRUE FORM · CLOW CARD'
      );
    }
    const textEl = $('chantText');
    if (textEl) {
      textEl.style.whiteSpace = 'pre-line';
      textEl.textContent = '';
    }
    if ($('chantSubQuote')) $('chantSubQuote').textContent = '';
    if ($('btnChantDone')) {
      $('btnChantDone').textContent = Locale.t(isSakura ? '사쿠라 카드 거두기 (X / 클릭)' : '카드 거두기 (X / 클릭)');
      $('btnChantDone').classList.add('hidden');
    }
    $('chantOverlay')?.classList.remove('hidden');

    const flipPoint = Math.floor(chant.full.length * 0.65);

    Timers.clear(chant.tId);
    chant.tId = Timers.every(() => {
      chant.len += 2;
      if (!chant.flipped && chant.len >= flipPoint) {
        revealFinalChantCard();
      }
      if (chant.len >= chant.full.length) {
        revealFinalChantCard();
        if (textEl) textEl.textContent = chant.full;
        if ($('chantSubQuote')) $('chantSubQuote').textContent = chant.sub;
        chant.typing = false;
        Timers.clear(chant.tId);
        chant.tId = null;
        $('btnChantDone')?.classList.remove('hidden');
      } else if (textEl) {
        textEl.textContent = chant.full.slice(0, chant.len);
      }
    }, 34);
  }

  function completeChantStep(skipAll = false) {
    if (!chant.active) return;
    if (chant.typing && !skipAll) {
      Timers.clear(chant.tId);
      chant.tId = null;
      chant.typing = false;
      if (chant.mode !== 'release') revealFinalChantCard();
      if ($('chantText')) $('chantText').textContent = chant.full;
      if ($('chantSubQuote')) $('chantSubQuote').textContent = chant.sub;
      $('btnChantDone')?.classList.remove('hidden');
      return;
    }
    Timers.clear(chant.tId);
    chant.tId = null;
    chant.active = false;
    $('chantOverlay')?.classList.add('hidden');
    const fn = chant.onDone;
    chant.onDone = null;
    if (fn) fn();
  }

  /* --------------------------------------------------------------------------
   * 5. 배틀 전용 키보드 통합 핸들러 (4종 피니시 + 커맨드 + 카드 그리드)
   * ------------------------------------------------------------------------*/
  function handleKey(code) {
    if (!state.active) return false;

    if (chant.active) {
      if (code === 'KeyX' || code === 'Enter' || code === 'Space') completeChantStep(false);
      else if (code === 'KeyZ' || code === 'Escape') completeChantStep(true);
      return true;
    }

    if (state.timing) {
      if (code === 'KeyZ' || code === 'Escape') {
        cancelSeal();
        return true;
      }
      if (state.finishKind === 'ring') {
        if (code === 'KeyX' || code === 'Enter' || code === 'Space') execRing();
      } else if (state.finishKind === 'clash') {
        if (code === 'KeyX' || code === 'Enter' || code === 'Space') tapClash();
      } else if (state.finishKind === 'combo') {
        if (code === 'ArrowUp' || code === 'KeyW') inputComboDir('up');
        else if (code === 'ArrowDown' || code === 'KeyS') inputComboDir('down');
        else if (code === 'ArrowLeft' || code === 'KeyA') inputComboDir('left');
        else if (code === 'ArrowRight' || code === 'KeyD') inputComboDir('right');
      }
      return true;
    }

    if (state.busy) return true;

    if (state.pickerOpen) {
      const len = state.pickerItems.length;
      const cols = window.innerWidth >= 640 ? 3 : 2;
      if (code === 'KeyZ' || code === 'Escape') {
        closeCardPicker();
        SoundFX.click();
      } else if (len > 0) {
        if (code === 'ArrowRight' || code === 'KeyD') { state.pickerIdx = (state.pickerIdx + 1) % len; syncPickerHighlight(true); SoundFX.click(); }
        else if (code === 'ArrowLeft' || code === 'KeyA') { state.pickerIdx = (state.pickerIdx - 1 + len) % len; syncPickerHighlight(true); SoundFX.click(); }
        else if (code === 'ArrowDown' || code === 'KeyS') { state.pickerIdx = Math.min(len - 1, state.pickerIdx + cols); syncPickerHighlight(true); SoundFX.click(); }
        else if (code === 'ArrowUp' || code === 'KeyW') { state.pickerIdx = Math.max(0, state.pickerIdx - cols); syncPickerHighlight(true); SoundFX.click(); }
        else if (code === 'KeyX' || code === 'Enter') {
          const item = state.pickerItems[state.pickerIdx];
          if (item && item.canUse) {
            lastCardId = item.id;
            closeCardPicker();
            if (item.canLiveTransform) startStarCombo(item.id);
            else useCard(item.id, false);
          }
        } else if (code === 'KeyC') {
          const item = state.pickerItems[state.pickerIdx];
          if (item && item.canUse) {
            lastCardId = item.id;
            closeCardPicker();
            useCard(item.id, false);
          }
        }
      }
      return true;
    }

    const btns = getCommandButtons();
    if (!btns.length) return true;
    if (code === 'ArrowRight' || code === 'KeyD') {
      state.cmdIdx = (state.cmdIdx + 1) % btns.length;
      syncCommandHighlight();
      SoundFX.click();
    } else if (code === 'ArrowLeft' || code === 'KeyA') {
      state.cmdIdx = (state.cmdIdx - 1 + btns.length) % btns.length;
      syncCommandHighlight();
      SoundFX.click();
    } else if (code === 'KeyX' || code === 'Enter') {
      const targetBtn = btns[state.cmdIdx];
      if (targetBtn && !targetBtn.disabled) {
        targetBtn.click();
      } else if (targetBtn && targetBtn.id === 'btnCmdSeal') {
        startSeal();
      }
    }
    return true;
  }

  function flee() {
    if (!state.active || state.busy || chant.active) return;
    state.active = false;
    closeFinishBox();
    closeCardPicker();
    $('battleOverlay')?.classList.add('hidden');
    if (hooks.onModeChange) hooks.onModeChange('explore');
    if (hooks.onFlee) hooks.onFlee();
  }

  /** 배틀 프레임 업데이트 (3종 미니게임 애니메이션 & VFX 파티클) */
  function updateAndRenderVFX(dt) {
    if (state.timing) {
      if (state.finishKind === 'ring') {
        state.ringRadius -= state.ringSpeed * dt;
        if (state.ringRadius <= 8) state.ringRadius = 100;
        syncRingVisual();
      } else if (state.finishKind === 'combo') {
        state.comboTime -= dt;
        const bar = $('comboTimeBar');
        if (bar) bar.style.width = `${Math.max(0, (state.comboTime / state.comboMaxTime) * 100)}%`;
        if (state.comboTime <= 0) {
          failStarCombo();
        }
      } else if (state.finishKind === 'clash') {
        state.clashTime -= dt;
        state.clashVal = Math.max(0, state.clashVal - state.clashPushBack * dt);
        syncClashVisual();
        if (state.clashVal <= 0 || state.clashTime <= 0) {
          closeFinishBox();
          state.busy = true;
          handleFinishFail('마력 충돌에서 밀려나고 말았다!');
        }
      }
    }

    if (!vfxCtx) return;
    vfxCtx.clearRect(0, 0, viewW, viewH);
    for (let i = vfxList.length - 1; i >= 0; i--) {
      const p = vfxList[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        vfxList.splice(i, 1);
        continue;
      }
      vfxCtx.globalAlpha = Math.max(0, p.life / p.max);
      vfxCtx.fillStyle = p.color;
      vfxCtx.beginPath();
      vfxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      vfxCtx.fill();
    }
    vfxCtx.globalAlpha = 1;
  }

  function forceClose() {
    Timers.clear(chant.tId);
    state.active = false;
    state.busy = false;
    state.timing = false;
    state.finishKind = null;
    state.pickerOpen = false;
    chant.active = false;
    ['battleOverlay', 'chantOverlay', 'sealTimingBox', 'battleCardPicker'].forEach((id) => $(id)?.classList.add('hidden'));
  }

  // 공용 버튼 바인딩
  $('btnCmdWand')?.addEventListener('click', doWand);
  $('btnCmdCard')?.addEventListener('click', openCardPicker);
  $('btnCmdFocus')?.addEventListener('click', doFocus);
  $('btnCmdSeal')?.addEventListener('click', startSeal);
  $('btnCmdSyaoran')?.addEventListener('click', doSyaoranAssist);
  $('btnClosePicker')?.addEventListener('click', closeCardPicker);
  $('btnChantDone')?.addEventListener('click', (e) => {
    e.stopPropagation();
    completeChantStep(false);
  });
  $('btnChantSkip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    completeChantStep(true);
  });
  $('chantOverlay')?.addEventListener('click', () => completeChantStep(false));
  $('btnBattleFlee')?.addEventListener('click', flee);

  return {
    state,
    chant,
    start,
    resize,
    updateUI,
    updateAndRenderVFX,
    handleKey,
    execSeal,
    cancelSeal,
    completeChantStep,
    flee,
    forceClose,
    isActive: () => state.active,
    isTiming: () => state.timing,
    isChantActive: () => chant.active,
    isPickerOpen: () => state.pickerOpen
  };
}
