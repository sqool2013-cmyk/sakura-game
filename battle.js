/**
 * ============================================================================
 * 카드캡터 3부작 공용 대화창(VN) & 전략 배틀 · 영창 시네마틱 엔진 (battle.js) — v.0.2.0
 * - 비주얼 노벨 대화창 (6종 표정 mood 오버레이 · AUTO 기본 OFF · 연타 오스킵 방지 락)
 * - 배틀 돌입 시 지팡이 해방 컷인 (1부 봉인 / 2부 별 / 3부 꿈의 지팡이 · Z 즉시 스킵)
 * - 난이도 상향 5종 마법 피니시:
 *   1) 수렴 마법진 (Ritual Ring)    : 1부 봉인 & 2부 공명 변환 (저항력 비례 극초고속·초정밀!)
 *   2) 5~7키 별빛 공명 (Star Combo) : 2부 실시간 ★변환 (일반 5키 · 상위 6키 · 보스전 7키)
 *   3) 순수 전략 격파               : 2부 기묘한 사건 보스 (HP 0 달성 즉시 돌파)
 *   4) 💎 크리스탈 프리즘 락        : 3부 클리어 카드 고착 (2단계 역회전 가속 쐐기 고정!)
 *   5) 마력 충돌 (Magic Clash)      : 1·2·3부 최종 보스전 (승리 후 X 연타 오스킵 완벽 차단!)
 * - 제3부 일상 각성 전용 즉시 고착 연출(playEventSecure) 지원
 * - 같은 배틀 안에서는 카드 선택 위치 기억 · 새 배틀 시작 시 첫 번째 카드로 자동 초기화
 * ============================================================================
 */
import { Utils, Locale, Art, SoundFX, Rules, Timers } from './core.js';

const { $, toArr, clamp, cardName, cardRuby } = Utils;

/* ----------------------------------------------------------------------------
 * 1. 비주얼 노벨(VN) 대화창 엔진 (6종 표정 + 감정 모션 + 연타 오스킵 가드)
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
    lockUntil: 0, // 배틀·연타 직후 첫 대사 오스킵 방지 타임스탬프
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
    // 타이핑 완료 직후 잔여 연타로 다음 대사가 바로 넘어가지 않도록 짧은 락 부여
    vn.lockUntil = Math.max(vn.lockUntil, performance.now() + 260);
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

  function start(lines, cb = null, { lockMs = 620 } = {}) {
    clearTimers();
    vn.active = true;
    vn.q = toArr(lines).slice();
    vn.i = 0;
    vn.cb = cb;
    vn.waitChoice = false;
    vn.choiceIdx = 0;
    vn.lockUntil = performance.now() + lockMs;
    $('vnOverlay')?.classList.remove('hidden');
    $('btnFloatInteract')?.classList.add('hidden');
    if (onModeChange) onModeChange('dialogue');
    renderLine();
  }

  function advance() {
    if (!vn.active || vn.waitChoice) return;
    if (performance.now() < vn.lockUntil) return;
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
    if (performance.now() < vn.lockUntil) return;
    const chs = toArr(vn.q[vn.i]?.choices);
    if (chs[vn.choiceIdx]) pickChoice(chs[vn.choiceIdx]);
  }

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
 * 2. 전략 배틀 · 난이도 상향 5종 마법 피니시 · 카드 위치 기억 · 영창 시네마틱
 * --------------------------------------------------------------------------*/
export function createBattleEngine(hooks) {
  const vfxCanvas = $('battleVfxCanvas');
  const vfxCtx = vfxCanvas ? vfxCanvas.getContext('2d') : null;
  const vfxList = [];
  let viewW = 960;
  let viewH = 640;

  // 같은 배틀 안에서는 카드 선택 위치 기억 · 새 배틀 시작 시 자동 초기화!
  let lastCardId = null;
  let lastPickerScrollTop = 0;

  const DIR_ARROWS = { up: '▲', down: '▼', left: '◀', right: '▶' };
  const ALL_DIRS = ['up', 'down', 'left', 'right'];
  const UPPER_CARDS = new Set([
    'windy', 'watery', 'firey', 'earthy', 'thunder', 'sword', 'erase', 'dark', 'light',
    'blaze', 'blade', 'rewind', 'break', 'dreaming', 'time', 'true_or_false', 'synchronize', 'exchange'
  ]);

  const state = {
    active: false,
    eventChantOnly: false,
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
    // 5종 마법 피니시 상태 (ring | combo | prism | clash)
    timing: false,
    finishKind: null,
    pendingLiveCardId: null,
    // (1) 수렴 마법진 (Ritual Ring — 저항력 높을수록 좁고 극초고속!)
    ringRadius: 102,
    ringSpeed: 130,
    ringMin: 34,
    ringMax: 42,
    // (2) 5~7키 별빛 공명 (Star Combo — 2부 실시간 ★변환 난이도 상향)
    comboSeq: [],
    comboStep: 0,
    comboTime: 0,
    comboMaxTime: 5.2,
    // (3) 💎 크리스탈 프리즘 락 (3부 클리어 카드 고착 — 2단계 역회전 가속 쐐기 고정)
    prismAngle: 0,
    prismSpeed: 205,
    prismDir: 1,
    prismStep: 0,
    prismSpan: 24,
    prismTargets: [95, 265],
    // (4) 최종 보스 마력 충돌 (Magic Clash — 승리 후 연타 오스킵 차단!)
    clashVal: 46,
    clashTime: 7.5,
    clashMaxTime: 7.5,
    clashPushBack: 25,
    clashTapPower: 6.5,
    clashResolved: false
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
    isSakura: false,
    isClear: false,
    lockUntil: 0,      // 영창 시작 직후 잔여 X 연타 무시 가드
    doneLockUntil: 0   // 타이핑 완료 직후 X 더블탭 무시 가드
  };

  function getCostumeBonuses() {
    const isReformed = typeof hooks.isCostumeReformed === 'function' ? !!hooks.isCostumeReformed() : false;
    return Rules.getCostumeBonuses(hooks.getCostumeId(), isReformed);
  }

  /** 원형 SVG 부채꼴 호(Arc) 경로 생성 헬퍼 (💎 크리스탈 프리즘 락용) */
  function describeArc(cx, cy, radius, startDeg, endDeg) {
    const rad = (deg) => ((deg - 90) * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(rad(startDeg));
    const y1 = cy + radius * Math.sin(rad(startDeg));
    const x2 = cx + radius * Math.cos(rad(endDeg));
    const y2 = cy + radius * Math.sin(rad(endDeg));
    const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  /** 두 각도 사이 최단 오차 계산 (0 ~ 180°) */
  function angleDelta(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
  }

  /** 배틀 돌입 지팡이 해방 컷인 전용 벡터 (1부 봉인 / 2부 별 / 3부 꿈의 지팡이) */
  function getWandReleaseSVG(part) {
    if (part === 3) {
      return `<svg viewBox="0 0 180 220" class="w-full h-full">
        <defs>
          <radialGradient id="wrDreamBg" cx="50%" cy="38%" r="58%">
            <stop offset="0%" stop-color="#bae6fd" stop-opacity="0.62"/>
            <stop offset="55%" stop-color="#38bdf8" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#0c172e" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="90" cy="84" r="76" fill="url(#wrDreamBg)"/>
        <circle cx="90" cy="84" r="64" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.78"/>
        <rect x="85" y="102" width="10" height="106" rx="5" fill="#e0f2fe" stroke="#38bdf8" stroke-width="1.6"/>
        <path d="M74 96 Q26 56 18 86 Q44 104 74 108 Z" fill="rgba(224,242,254,0.9)" stroke="#7dd3fc" stroke-width="1.6"/>
        <path d="M106 96 Q154 56 162 86 Q136 104 106 108 Z" fill="rgba(251,207,232,0.88)" stroke="#f9a8d4" stroke-width="1.6"/>
        <circle cx="90" cy="72" r="28" fill="rgba(14,165,233,0.34)" stroke="#fef08a" stroke-width="2.6"/>
        <circle cx="90" cy="72" r="20" fill="rgba(224,242,254,0.38)" stroke="#bae6fd" stroke-width="1.4"/>
        <polygon points="90,52 94,65 108,65 97,73 101,87 90,78 79,87 83,73 72,65 86,65" fill="#fef08a" stroke="#ffffff" stroke-width="1.1"/>
        <path d="M70 36 Q90 22 110 36" fill="none" stroke="#fde047" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="38" cy="40" r="3" fill="#bae6fd"/>
        <circle cx="144" cy="44" r="2.6" fill="#fef08a"/>
        <circle cx="136" cy="144" r="2.5" fill="#fbcfe8"/>
      </svg>`;
    }
    if (part === 2) {
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

  function shakeVisual() {
    const v = $('battleEnemyVisual');
    if (!v) return;
    v.classList.remove('shake-hit');
    void v.offsetWidth;
    v.classList.add('shake-hit');
  }

  function spawnVFX(type) {
    vfxList.push({ type, t: 0, max: 0.72 });
  }

  function resize(w, h, dpr) {
    viewW = w;
    viewH = h;
    if (!vfxCanvas || !vfxCtx) return;
    vfxCanvas.width = Math.floor(w * dpr);
    vfxCanvas.height = Math.floor(h * dpr);
    vfxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 카드별 짧은 효과 요약 태그 */
  function getCardBriefTag(c, isSak) {
    if (!c) return '';
    const pwr = Math.round((c.power || 0) * (isSak ? 1.25 : 1));
    switch (c.effect) {
      case 'bind': return `⚔${pwr} · ⛓구속`;
      case 'break': return `⚔${pwr} · 💥결계파괴`;
      case 'shield': return `🛡80%방어${pwr ? `·⚔${pwr}` : ''}`;
      case 'evade': return `🪽회피${pwr ? `·⚔${pwr}` : ''}`;
      case 'reflect': return `🪞반사${pwr ? `·⚔${pwr}` : ''}`;
      case 'heal': return isSak ? '💚HP+66·MP+18' : (hooks.part === 3 ? '💚대량회복' : '💚HP+50·MP+13');
      case 'light_heal': return `⚔${pwr} · ✨치유`;
      default: return `⚔${pwr}`;
    }
  }

  /* --------------------------------------------------------------------------
   * 하단 커맨드 키보드 포커스 & 카드 선택창 위치/스크롤 기억
   * ------------------------------------------------------------------------*/
  function getVisibleCmdButtons() {
    return ['btnCmdWand', 'btnCmdCard', 'btnCmdFocus', 'btnCmdSyaoran', 'btnCmdSeal']
      .map((id) => $(id))
      .filter((el) => el && !el.classList.contains('hidden'));
  }

  function syncCommandFocus() {
    const btns = getVisibleCmdButtons();
    if (!btns.length) return;
    state.cmdIdx = clamp(state.cmdIdx, 0, btns.length - 1);
    btns.forEach((b, idx) => {
      const active = !state.pickerOpen && !state.timing && !chant.active && idx === state.cmdIdx;
      b.classList.toggle('ring-2', active);
      b.classList.toggle('ring-yellow-300', active);
      b.classList.toggle('scale-[1.03]', active);
    });
  }

  function updatePickerInfoBar() {
    const infoEl = $('battlePickerInfo');
    if (!infoEl) return;
    const item = state.pickerItems[state.pickerIdx];
    if (!item) {
      infoEl.textContent = Locale.t('사용할 카드를 방향키로 선택하고 X를 누르세요.');
      return;
    }
    const { card, isSak, canTransform } = item;
    const weakNote = card.id === state.enemy?.weakness ? ' ★약점 특효!' : '';
    const modeHint = canTransform
      ? ' [X: 5~7키 ★별빛 변환 해방 / C: 일반 사용]'
      : ' [X: 즉시 해방]';
    infoEl.textContent = Locale.t(
      `${cardName(card)}${isSak ? '★' : ''} — ${card.skillName}: ${card.desc}${weakNote}${modeHint}`
    );
  }

  function syncPickerFocus() {
    const grid = $('battleCardGrid');
    if (!grid) return;
    const nodes = grid.querySelectorAll('.battle-card-chip');
    if (!nodes.length) return;
    state.pickerIdx = clamp(state.pickerIdx, 0, nodes.length - 1);
    const curItem = state.pickerItems[state.pickerIdx];
    if (curItem?.card?.id) lastCardId = curItem.card.id;

    nodes.forEach((el, idx) => {
      const sel = idx === state.pickerIdx;
      el.classList.toggle('ring-2', sel);
      el.classList.toggle('ring-yellow-300', sel);
      el.classList.toggle('bg-pink-900/60', sel);
      if (sel) el.scrollIntoView({ block: 'nearest' });
    });
    updatePickerInfoBar();
  }

  /* --------------------------------------------------------------------------
   * 적 행동 예고 (인텐트) 시스템
   * ------------------------------------------------------------------------*/
  function pickIntent() {
    const e = state.enemy;
    if (!e) return;
    if (state.bind > 0) {
      state.intent = { type: 'bound', text: '⛓ 구속 상태! 다음 턴 행동 불가 (마법 반격 없음)' };
      return;
    }
    if (state.exhausted) {
      const txt = hooks.part === 3
        ? '💫 탈진! 지금 [💎 프리즘 락 고착!] 또는 마력 충돌로 마무리하세요!'
        : e.isIncident
        ? '💫 시련의 힘이 약해졌다! 마무리 일격으로 돌파하세요!'
        : '💫 탈진! 지금 피니시 버튼으로 마무리할 최고의 기회!';
      state.intent = { type: 'exhausted', text: txt };
      return;
    }

    if (e.isBoss) {
      const t = state.turn % 4;
      if (hooks.part === 3) {
        if (state.phase === 1) {
          state.intent = t === 1
            ? { type: 'barrier', text: '⚙ 시계 수호 장치가 황금 태엽 결계를 전개하려 합니다! (결계 파괴 추천)' }
            : t === 3
            ? { type: 'heavy', text: '⚠ 주의! 시계 장치의 [시계 톱니 강타] 예고! 방어·실드·회피로 대비!' }
            : { type: 'attack', text: '⚔ 시계 수호 장치가 날카로운 시계 바늘을 겨눕니다.' };
        } else {
          state.intent = t === 0
            ? { type: 'reflect', text: '🕰 주의! 대마법사가 [시간 역행 반사막]을 펼치려 합니다!' }
            : t === 2
            ? { type: 'heavy', text: '⚠ 경고! 금기의 마법 [시계 나라의 시간 정지] 예고! 방어·회피 필수!' }
            : { type: 'drain', text: '⏳ 대마법사가 마력을 되감는 시간 파동을 준비합니다.' };
        }
      } else if (hooks.part === 2) {
        if (state.phase === 1) {
          state.intent = t === 1
            ? { type: 'barrier', text: '🛡 스피넬 썬이 흑태양 결계를 전개하려 합니다! (소드·이레이즈·샤오랑 추천)' }
            : t === 3
            ? { type: 'heavy', text: '⚠ 주의! 루비 문 & 스피넬 썬의 합동 강공격 예고! 방어·실드·점프 대비!' }
            : { type: 'attack', text: '⚔ 두 수호자가 합동 마력탄을 준비합니다.' };
        } else {
          state.intent = t === 0
            ? { type: 'reflect', text: '🪞 주의! 에리오르가 [영원한 밤의 반사막]을 펼치려 합니다!' }
            : t === 2
            ? { type: 'heavy', text: '⚠ 경고! 에리오르의 [별을 잠재우는 심연] 초강공격 예고! 방어·회피 필수!' }
            : { type: 'drain', text: '🌑 에리오르가 어둠으로 마력(MP)을 흡수하려 합니다.' };
        }
      } else {
        if (state.phase === 1) {
          state.intent = t === 1
            ? { type: 'barrier', text: '🛡 유에가 달빛 결계를 전개하려 합니다! (소드·이레이즈·샤오랑 원호 추천)' }
            : t === 3
            ? { type: 'heavy', text: '⚠ 주의! 유에의 [은빛 얼음 화살비] 강공격 예고! 방어·실드·점프로 대비!' }
            : { type: 'attack', text: '⚔ 유에가 차가운 달빛 화살을 겨눕니다.' };
        } else {
          state.intent = t === 0
            ? { type: 'reflect', text: '🪞 주의! 유에가 [만월 거울 반사막]을 펼치려 합니다!' }
            : t === 2
            ? { type: 'heavy', text: '⚠ 경고! 유에의 [만월의 심판] 초강공격 예고! 방어·실드·점프 필수!' }
            : { type: 'drain', text: '🌙 유에가 달빛으로 사쿠라의 마력(MP)을 흡수하려 합니다.' };
        }
      }
      return;
    }

    const r = state.turn % 3;
    if (r === 1) {
      const gm = e.gimmick;
      if (gm === 'charge') state.intent = { type: 'heavy', text: `⚠ 주의! [${e.sigName}] 강공격 예고! [방어·호흡]이나 결계·회피로 대비하세요!` };
      else if (gm === 'barrier') state.intent = { type: 'barrier', text: `🛡 [${e.sigName}] 단단한 방어 결계 전개 예고! (결계 파괴·샤오랑 원호 유효)` };
      else if (gm === 'evade') state.intent = { type: 'evade', text: `💨 [${e.sigName}] 고속 회피 태세 예고! (구속·지팡이·약점으로 해제)` };
      else if (gm === 'reflect') state.intent = { type: 'reflect', text: `🪞 [${e.sigName}] 마법 반사막 예고! (결계 파괴·샤오랑 원호로 파괴 가능)` };
      else if (gm === 'drain') state.intent = { type: 'drain', text: `🌑 [${e.sigName}] MP 흡수 공격 예고! [방어·호흡]으로 피해를 줄이세요!` };
      else state.intent = { type: 'heal_self', text: `🌿 [${e.sigName}] 저항력 회복 예고! 지금 화력을 집중하세요!` };
    } else {
      state.intent = { type: 'attack', text: `⚔ ${cardName(e) || e.kr}의 마법 반격이 예상됩니다.` };
    }
  }

  /* --------------------------------------------------------------------------
   * 배틀 UI 동기화
   * ------------------------------------------------------------------------*/
  function updateUI() {
    if (!state.active || !state.enemy) return;
    const e = state.enemy;
    const player = hooks.getPlayer();
    const trust = hooks.getSyaoranTrust ? hooks.getSyaoranTrust() : 0;

    if ($('battleEnemyName')) {
      const titleText = e.isBoss || e.isIncident ? Locale.t(e.kr) : `${cardRuby(e)} (${e.en})`;
      $('battleEnemyName').innerHTML = titleText;
    }
    const tag = $('battleEnemyTag');
    if (tag) {
      if (e.isBoss) {
        tag.textContent = hooks.part === 3 ? '🕰 FINAL CLOCKLAND' : hooks.part === 2 ? '🌌 FINAL TRIAL' : '☽ FINAL JUDGE';
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/40 border border-sky-300 text-sky-100';
      } else if (e.isIncident) {
        tag.textContent = '✦ 기묘한 마법 사건';
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/35 border border-rose-300 text-rose-100';
      } else if (hooks.part === 3) {
        tag.textContent = '💎 CLEAR CARD';
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/30 border border-sky-300 text-sky-100';
      } else if (hooks.part === 2) {
        tag.textContent = '★ 별빛 공명';
        tag.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/35 border border-pink-300 text-pink-100';
      } else {
        tag.textContent = e.ruler === 'kero' ? '☀ 태양 계통' : '☽ 달 계통';
        tag.className = e.ruler === 'kero'
          ? 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-300 text-amber-100'
          : 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/35 border border-sky-300 text-sky-100';
      }
    }

    const pb = $('battlePhaseBadge');
    if (pb) {
      if (e.isBoss) {
        pb.classList.remove('hidden');
        pb.textContent = hooks.part === 3
          ? (state.phase === 1 ? 'PHASE 1 · 시계 수호 장치' : 'PHASE 2 · 시간의 대마법사')
          : hooks.part === 2
          ? (state.phase === 1 ? 'PHASE 1 · 스피넬 & 루비' : 'PHASE 2 · 에리오르')
          : `PHASE ${state.phase} · ${state.phase === 1 ? '초승달' : '만월 각성'}`;
      } else {
        pb.classList.add('hidden');
      }
    }

    if ($('battleWeakHint')) $('battleWeakHint').textContent = Locale.t(e.weakHint || '');
    if ($('battleEnemyHpText')) $('battleEnemyHpText').textContent = `${Math.max(0, Math.ceil(state.hp))} / ${state.maxHp}`;
    if ($('battleEnemyHpBar')) $('battleEnemyHpBar').style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
    if ($('battleSakuraHp')) $('battleSakuraHp').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    if ($('battleSakuraMp')) $('battleSakuraMp').textContent = `${Math.ceil(player.mp)}/${player.maxMp}`;

    const ib = $('battleIntentBanner');
    if (ib && state.intent) {
      ib.textContent = Locale.t(state.intent.text);
      ib.className = state.intent.type === 'heavy'
        ? 'px-3.5 py-1.5 rounded-full bg-rose-950/85 border border-rose-400 text-xs font-story text-rose-100 shadow-lg text-center max-w-xl'
        : state.intent.type === 'bound' || state.intent.type === 'exhausted'
        ? 'px-3.5 py-1.5 rounded-full bg-emerald-950/85 border border-emerald-400 text-xs font-story text-emerald-100 shadow-lg text-center max-w-xl'
        : 'px-3.5 py-1.5 rounded-full bg-black/60 border border-amber-400/55 text-xs font-story text-amber-100 shadow-lg text-center max-w-xl';
    }

    const sb = $('battleStatusBadges');
    if (sb) {
      sb.innerHTML = '';
      [
        state.bind > 0 && ['⛓ 구속됨', 'bg-sky-500/35 border-sky-300 text-sky-100'],
        state.eGuard && ['🛡 결계 활성', 'bg-amber-500/35 border-yellow-300 text-yellow-100'],
        state.eRef && ['🪞 반사막 활성', 'bg-cyan-500/35 border-cyan-300 text-cyan-100'],
        state.eEvade && ['💨 고속 회피', 'bg-fuchsia-500/35 border-fuchsia-300 text-fuchsia-100'],
        state.exhausted && ['💫 탈진', 'bg-emerald-500/35 border-emerald-300 text-emerald-100']
      ].filter(Boolean).forEach(([t, cls]) => {
        const sp = document.createElement('span');
        sp.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`;
        sp.textContent = t;
        sb.appendChild(sp);
      });
    }

    const sbf = $('battleSakuraBuffs');
    if (sbf) {
      sbf.innerHTML = '';
      [
        state.sShield && ['🛡 결계', 'bg-yellow-500/30 border-yellow-300 text-yellow-100'],
        state.sEvade && ['🪽 회피', 'bg-pink-500/30 border-pink-300 text-pink-100'],
        state.sRef && ['🪞 반사', 'bg-cyan-500/30 border-cyan-300 text-cyan-100'],
        state.sFocus && ['💙 방어', 'bg-sky-500/30 border-sky-300 text-sky-100'],
        state.cocoaBoost && ['☕ 공+15%', 'bg-amber-500/30 border-amber-300 text-amber-100'],
        state.snackGuard && ['🍙 방+22%', 'bg-emerald-500/30 border-emerald-300 text-emerald-100'],
        trust >= 3 && !state.syaoranSaveUsed && ['⚡ 샤오랑 엄호', 'bg-emerald-500/25 border-emerald-300 text-emerald-100']
      ].filter(Boolean).forEach(([t, cls]) => {
        const sp = document.createElement('span');
        sp.className = `text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`;
        sp.textContent = t;
        sbf.appendChild(sp);
      });
    }

    const btnSya = $('btnCmdSyaoran');
    if (btnSya) {
      if (trust >= 2) {
        btnSya.classList.remove('hidden');
        btnSya.disabled = state.busy || state.syaoranUsed;
      } else {
        btnSya.classList.add('hidden');
      }
    }

    const btnSeal = $('btnCmdSeal');
    const hpRatio = state.hp / Math.max(1, state.maxHp);
    if (btnSeal) {
      if (e.isIncident) {
        btnSeal.classList.add('hidden');
      } else {
        btnSeal.classList.remove('hidden');
        const sealReady = e.isBoss ? state.hp <= 0 : hpRatio <= 0.5;
        if ($('btnSealMain')) {
          $('btnSealMain').textContent = e.isBoss
            ? '🔥 마력 충돌!'
            : hooks.part === 3
            ? '💎 프리즘 고착!'
            : hooks.part === 2
            ? '★ 공명 변환!'
            : '🎯 수렴 봉인!';
        }
        if ($('btnSealSub')) {
          $('btnSealSub').textContent = e.isBoss
            ? (sealReady ? 'X 연타 결전!' : '저항력 0 필요')
            : sealReady
            ? (state.exhausted ? '탈진 · 최적!' : `저항 ${Math.round(hpRatio * 100)}% (고난도)`)
            : '🔒 50%↓ 약화';
        }
        btnSeal.disabled = state.busy || !sealReady;
      }
    }

    ['btnCmdWand', 'btnCmdCard', 'btnCmdFocus'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = state.busy;
    });
    const fleeBtn = $('btnBattleFlee');
    if (fleeBtn) fleeBtn.disabled = state.busy;

    if (hooks.onHUDUpdate) hooks.onHUDUpdate();
    syncCommandFocus();
  }

  /* --------------------------------------------------------------------------
   * 카드 선택 패널 (같은 배틀 내 위치 기억 · 새 배틀 시작 시 자동 초기화!)
   * ------------------------------------------------------------------------*/
  function openCardPicker() {
    if (state.busy) return;
    if (state.pickerOpen) return closeCardPicker();

    const picker = $('battleCardPicker');
    const grid = $('battleCardGrid');
    if (!picker || !grid) return;

    let infoEl = $('battlePickerInfo');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'battlePickerInfo';
      infoEl.className = 'mb-1.5 px-2.5 py-1.5 rounded-xl bg-black/55 border border-yellow-400/35 text-[11px] font-story text-yellow-100 truncate';
      picker.insertBefore(infoEl, grid);
    }

    const cards = hooks.getCards();
    const order = hooks.getCardOrder();
    const owned = hooks.getOwnedCards();
    const sakuraSet = hooks.getSakuraCards ? hooks.getSakuraCards() : new Set();
    const player = hooks.getPlayer();

    if ($('battlePickerTitle')) {
      $('battlePickerTitle').textContent = Locale.t(
        hooks.part === 2
          ? '카드 선택 (방향키+X: ★변환·해방 / C: 일반 / Z: 닫기)'
          : hooks.part === 3
          ? '해방할 클리어 카드 선택 (방향키+X 즉시 해방 / Z: 닫기)'
          : '해방할 크로우 카드 선택 (방향키+X 즉시 해방 / Z: 닫기)'
      );
    }

    grid.innerHTML = '';
    state.pickerItems = [];

    order.forEach((id) => {
      if (!owned.has(id)) return;
      const c = cards[id];
      if (!c) return;
      const isSak = hooks.part === 2 && sakuraSet.has(id);
      const canTransform = hooks.part === 2 && !isSak && !c.finalOnly;
      const mpCost = isSak ? Math.max(6, c.mpCost - 2) : c.mpCost;
      const weak = c.id === state.enemy?.weakness;
      const rec = state.enemy?.isIncident && toArr(state.enemy.recommended).includes(id);
      const enough = player.mp >= mpCost;

      const idx = state.pickerItems.length;
      state.pickerItems.push({ card: c, isSak, canTransform, mpCost, enough });

      const chip = document.createElement('div');
      chip.className = `battle-card-chip rounded-xl px-2.5 py-1.5 border flex items-center justify-between gap-1.5 transition cursor-pointer ${
        !enough
          ? 'bg-black/45 border-white/10 opacity-45 cursor-not-allowed'
          : isSak
          ? 'bg-fuchsia-950/75 hover:bg-fuchsia-900/85 border-pink-300/80'
          : canTransform
          ? 'bg-indigo-950/80 hover:bg-indigo-900/85 border-yellow-300/75'
          : hooks.part === 3
          ? 'bg-sky-950/80 hover:bg-sky-900/85 border-sky-300/65'
          : 'bg-purple-950/80 hover:bg-purple-900/85 border-yellow-400/50'
      }`;

      const badgeHtml = weak
        ? '<span class="text-[9px] px-1 rounded bg-emerald-500/35 text-emerald-200 border border-emerald-400/50">약점</span>'
        : rec && canTransform
        ? '<span class="text-[9px] px-1 rounded bg-pink-500/40 text-pink-100 border border-pink-300">★추천</span>'
        : isSak
        ? '<span class="text-[9px] text-pink-300">★</span>'
        : '';

      const rightBtnHtml = canTransform
        ? `<div class="flex items-center gap-1 shrink-0">
             <span class="px-1.5 py-0.5 rounded bg-gradient-to-r from-pink-500 to-amber-500 text-white text-[10px] font-bold">★변환</span>
             <button data-norm="${idx}" title="일반 크로우 카드로 사용 (C)" class="px-1.5 py-0.5 rounded bg-slate-700/90 hover:bg-slate-600 text-slate-200 text-[10px] font-bold">일반</button>
           </div>`
        : `<span class="text-[10px] font-mono ${enough ? 'text-sky-200' : 'text-rose-300'} shrink-0">MP${mpCost}</span>`;

      chip.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1">
            <span class="font-story font-bold text-xs ${isSak ? 'text-pink-200' : hooks.part === 3 ? 'text-sky-100' : 'text-yellow-200'} truncate">${cardName(c)}</span>
            ${badgeHtml}
          </div>
          <div class="text-[10px] text-pink-100/85 truncate">${getCardBriefTag(c, isSak)}${canTransform ? ` · MP${mpCost}` : ''}</div>
        </div>
        ${rightBtnHtml}
      `;

      chip.addEventListener('mouseenter', () => {
        state.pickerIdx = idx;
        syncPickerFocus();
      });
      chip.addEventListener('click', (e) => {
        if (e.target.closest('[data-norm]')) return;
        state.pickerIdx = idx;
        triggerPickedCard(false);
      });
      const normBtn = chip.querySelector('[data-norm]');
      if (normBtn) {
        normBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.pickerIdx = idx;
          triggerPickedCard(true);
        });
      }
      grid.appendChild(chip);
    });

    if (state.pickerItems.length === 0) {
      grid.innerHTML = '<div class="col-span-full py-4 text-center text-xs font-story text-sky-200/80">아직 보유한 카드가 없습니다. 지팡이 공격으로 먼저 저항력을 약화시켜 보세요!</div>';
    }

    picker.classList.remove('hidden');
    state.pickerOpen = true;

    // 같은 배틀 내에서는 직전 선택 카드 & 스크롤 위치 복원 (새 배틀은 0부터 시작!)
    const rememberedIdx = lastCardId ? state.pickerItems.findIndex((it) => it.card.id === lastCardId) : -1;
    state.pickerIdx = rememberedIdx >= 0 ? rememberedIdx : 0;
    if (lastPickerScrollTop > 0) {
      grid.scrollTop = lastPickerScrollTop;
    } else {
      grid.scrollTop = 0;
    }

    syncCommandFocus();
    syncPickerFocus();
    SoundFX.click();
  }

  function closeCardPicker() {
    const grid = $('battleCardGrid');
    if (grid && state.pickerOpen) {
      lastPickerScrollTop = grid.scrollTop;
    }
    $('battleCardPicker')?.classList.add('hidden');
    state.pickerOpen = false;
    syncCommandFocus();
  }

  function triggerPickedCard(forceNormal = false) {
    const item = state.pickerItems[state.pickerIdx];
    if (!item) return;
    if (!item.enough) {
      SoundFX.hit();
      setLog(`MP가 부족합니다! (필요 MP ${item.mpCost})`);
      return;
    }
    lastCardId = item.card.id;
    closeCardPicker();
    if (item.canTransform && !forceNormal) {
      startLiveTransformFinish(item.card);
    } else {
      useCard(item.card, false);
    }
  }

  /* --------------------------------------------------------------------------
   * 플레이어 턴 액션 (지팡이 · 카드 해방 · 방어/호흡 · 샤오랑 원호)
   * ------------------------------------------------------------------------*/
  function applyPlayerDamage(dmg, { breaksGuard = false, bindTurn = false, logPrefix = '' } = {}) {
    const e = state.enemy;
    const cos = getCostumeBonuses();
    let finalDmg = Math.round(dmg * (cos.allAtkMult || 1));

    if (state.cocoaBoost) {
      finalDmg = Math.round(finalDmg * 1.15);
    }

    let critText = '';
    const critChance = (cos.critChance || 0) + (state.cocoaBoost ? 0.10 : 0);
    if (critChance > 0 && Math.random() < critChance) {
      finalDmg = Math.round(finalDmg * (cos.critMult || 1.3));
      critText = ' 💥치명타!';
    }

    if (state.eRef && !breaksGuard) {
      const player = hooks.getPlayer();
      const refD = Math.max(8, Math.round(finalDmg * 0.4));
      player.hp = Math.max(1, player.hp - refD);
      state.eRef = false;
      SoundFX.hit();
      setLog(`🪞 적의 반사막에 막혀 ${refD}의 반사 피해를 입었다!`);
      return false;
    }

    if (state.eEvade && !breaksGuard) {
      finalDmg = Math.round(finalDmg * 0.35);
      state.eEvade = false;
    }
    if (state.eGuard) {
      if (breaksGuard) {
        state.eGuard = false;
        state.eRef = false;
      } else {
        finalDmg = Math.round(finalDmg * 0.45);
      }
    }

    state.hp = Math.max(0, state.hp - finalDmg);
    shakeVisual();
    if (bindTurn && !e.isBoss && state.bindRes <= 0) {
      state.bind = 1;
      state.bindRes = 2;
    }

    let msg = `${logPrefix} ${finalDmg}의 마법 피해!${critText}`;
    if (e.isBoss && state.phase === 1 && state.hp <= state.maxHp * 0.5) {
      state.phase = 2;
      state.eGuard = false;
      state.eRef = false;
      const vis = $('battleEnemyVisual');
      if (vis) vis.innerHTML = Art.getManifest(e, { isPart2: hooks.part === 2, isPart3: hooks.part === 3, bossPhase: 2 });
      msg += hooks.part === 3
        ? ' 🕰 PHASE 2! 시계 수호 장치가 물러나고 대마법사가 직접 나선다!'
        : hooks.part === 2
        ? ' 🌌 PHASE 2! 에리오르가 영원한 어둠을 펼쳐 직접 나선다!'
        : ' 🌕 만월 각성! 유에의 심판이 절정에 달한다!';
    }

    if (state.hp === 0) {
      state.exhausted = true;
      if (e.isIncident) {
        setLog(`${msg} ✦ 마법 사건의 근원을 완전히 깨뜨렸다!`);
        updateUI();
        Timers.after(() => {
          closeBattleOverlay();
          if (hooks.onVictory) hooks.onVictory(e);
        }, 720);
        return true;
      }
      msg += e.isBoss
        ? ' 💫 저항력이 0! 지금 [🔥 마력 충돌!]로 최후의 결판을 내자!'
        : hooks.part === 3
        ? ' 💫 탈진! 지금 [💎 프리즘 고착!]으로 깔끔히 고착하자!'
        : ' 💫 탈진! 지금 피니시 버튼으로 깔끔히 마무리하자!';
    }

    setLog(msg);
    return false;
  }

  function cmdWand() {
    if (state.busy) return;
    closeCardPicker();
    state.busy = true;
    const player = hooks.getPlayer();
    const dmg = Math.round((13 + player.lv * 1.15) * player.mult);
    player.mp = Math.min(player.maxMp, player.mp + 7);
    SoundFX.magic();
    spawnVFX(hooks.part === 3 ? 'crystal' : 'seal');
    const resolved = applyPlayerDamage(dmg, {
      breaksGuard: false,
      logPrefix: hooks.part === 3 ? '꿈의 지팡이 크리스탈 일격! (MP +7)' : hooks.part === 2 ? '별의 지팡이 일격! (MP +7)' : '봉인의 지팡이 일격! (MP +7)'
    });
    if (resolved) return;
    updateUI();
    Timers.after(enemyTurn, 760);
  }

  function cmdFocus() {
    if (state.busy) return;
    closeCardPicker();
    state.busy = true;
    const player = hooks.getPlayer();
    state.sFocus = true;
    const mpGain = Math.min(player.maxMp - player.mp, 26);
    const hpGain = Math.min(player.maxHp - player.hp, 12);
    player.mp += mpGain;
    player.hp += hpGain;
    SoundFX.heal();
    spawnVFX(hooks.part === 3 ? 'crystal' : 'seal');
    setLog(`🛡 방어·호흡! 다음 피해 65% 경감 · MP +${mpGain} · HP +${hpGain}!`);
    updateUI();
    Timers.after(enemyTurn, 760);
  }

  function cmdSyaoran() {
    if (state.busy || state.syaoranUsed) return;
    const trust = hooks.getSyaoranTrust ? hooks.getSyaoranTrust() : 0;
    if (trust < 2) return;
    closeCardPicker();
    state.busy = true;
    state.syaoranUsed = true;
    const player = hooks.getPlayer();
    const dmg = Math.round((34 + trust * 5) * player.mult);
    SoundFX.syaoran();
    spawnVFX('syaoran');
    const resolved = applyPlayerDamage(dmg, {
      breaksGuard: true,
      logPrefix: '⚡ 샤오랑 원호 [뇌제초래]! 적의 결계·반사막을 꿰뚫고'
    });
    if (resolved) return;
    updateUI();
    Timers.after(enemyTurn, 860);
  }

  function useCard(c, justTransformed = false) {
    const player = hooks.getPlayer();
    const sakuraSet = hooks.getSakuraCards ? hooks.getSakuraCards() : new Set();
    const isSak = hooks.part === 2 && (sakuraSet.has(c.id) || justTransformed);
    const cos = getCostumeBonuses();
    const mpCost = isSak && !justTransformed ? Math.max(6, c.mpCost - 2) : c.mpCost;

    if (!justTransformed && player.mp < mpCost) {
      setLog('MP가 부족합니다!');
      return;
    }

    state.busy = true;
    if (!justTransformed) player.mp -= mpCost;
    SoundFX.magic();
    spawnVFX(c.vfx || (hooks.part === 3 ? 'crystal' : 'seal'));

    const weak = c.id === state.enemy.weakness;
    const recBonus = state.enemy.isIncident && justTransformed && toArr(state.enemy.recommended).includes(c.id);
    let dmg = Math.round((c.power || 0) * player.mult * (cos.magicMult || 1));
    if (isSak) dmg = Math.round(dmg * 1.25);
    if (justTransformed) dmg = Math.round(dmg * (recBonus ? 1.65 : 1.4));
    if (weak) dmg = Math.round(dmg * 1.5);
    if (hooks.part === 1 && state.enemy.isBoss && c.ruler === 'yue') dmg = Math.round(dmg * 0.55);

    const tagPrefix = justTransformed
      ? `★ [${cardName(c)}] 사쿠라 카드 실시간 각성!!`
      : `[${cardName(c)}${isSak ? '★' : ''}] ${Locale.t(c.skillName)} 해방!`;

    if (c.effect === 'heal') {
      const baseHp = hooks.part === 3 ? (c.id === 'kindness' ? 115 : c.id === 'promise' ? 95 : 85) : (isSak ? 66 : 50);
      const baseMp = hooks.part === 3 ? (c.id === 'kindness' ? 36 : c.id === 'promise' ? 30 : 24) : (isSak ? 18 : 13);
      const hr = Math.min(player.maxHp - player.hp, Math.round(baseHp * (cos.healMult || 1)));
      const mr = Math.min(player.maxMp - player.mp, baseMp);
      player.hp += hr;
      player.mp += mr;
      SoundFX.heal();
      setLog(`${tagPrefix} HP +${hr} · MP +${mr} 회복!`);
      updateUI();
      Timers.after(enemyTurn, 780);
      return;
    }

    if (c.effect === 'shield') state.sShield = true;
    if (c.effect === 'evade') state.sEvade = true;
    if (c.effect === 'reflect') state.sRef = true;
    if (c.effect === 'light_heal') {
      const baseLh = hooks.part === 3 ? (c.id === 'remind' ? 70 : 52) : (isSak ? 38 : 28);
      const hr = Math.min(player.maxHp - player.hp, Math.round(baseLh * (cos.healMult || 1)));
      player.hp += hr;
      SoundFX.heal();
    }

    const extra = weak ? ' ★약점 특효!' : recBonus ? ' ★사건 핵심 돌파!' : '';
    const resolved = applyPlayerDamage(Math.max(8, dmg), {
      breaksGuard: c.effect === 'break' || weak || justTransformed,
      bindTurn: c.effect === 'bind',
      logPrefix: `${tagPrefix}${extra}`
    });
    if (resolved) return;

    updateUI();
    Timers.after(enemyTurn, 820);
  }

  /* --------------------------------------------------------------------------
   * 적 턴 처리 (의상 패시브 · 샤오랑 위기 대리 방어 · 자동 MP 재생 포함)
   * ------------------------------------------------------------------------*/
  function enemyTurn() {
    if (!state.active) return;
    const e = state.enemy;
    const player = hooks.getPlayer();
    const cos = getCostumeBonuses();
    state.turn++;

    let mpAuto = cos.turnMpRegen || 0;
    if (state.snackGuard) mpAuto += 3;
    if (mpAuto > 0) player.mp = Math.min(player.maxMp, player.mp + mpAuto);

    if (state.bindRes > 0) state.bindRes--;
    if (state.bind > 0) {
      state.bind--;
      setLog(`⛓ ${cardName(e) || e.kr}는 구속되어 움직이지 못했다!`);
      state.sFocus = false;
      state.busy = false;
      pickIntent();
      updateUI();
      return;
    }
    if (state.exhausted) {
      setLog(
        e.isBoss
          ? `💫 ${e.kr}의 마력이 흔들린다! 지금 [🔥 마력 충돌!]로 최후의 결판을 내자!`
          : hooks.part === 3
          ? `💫 ${cardName(e)}가 완전히 지쳤다! 지금 [💎 프리즘 고착!]으로 고착할 절호의 기회!`
          : `💫 ${cardName(e) || e.kr}가 지쳐서 반격하지 못한다! 지금 마무리하자!`
      );
      state.sFocus = false;
      state.busy = false;
      pickIntent();
      updateUI();
      return;
    }

    const it = state.intent?.type || 'attack';
    let dmg = Math.round((e.atk || 15) * (state.phase === 2 ? 1.24 : 1) * (0.9 + Math.random() * 0.2));
    let logMsg = '';

    if (it === 'barrier') {
      state.eGuard = true;
      dmg = Math.round(dmg * 0.55);
      logMsg = `🛡 적이 단단한 결계를 펼치며 견제했다!`;
    } else if (it === 'reflect') {
      state.eRef = true;
      dmg = Math.round(dmg * 0.45);
      logMsg = `🪞 적이 마법 반사막을 전개했다!`;
    } else if (it === 'evade') {
      state.eEvade = true;
      dmg = Math.round(dmg * 0.65);
      logMsg = `💨 적이 고속 회피 태세를 갖췄다!`;
    } else if (it === 'heal_self') {
      const rec = Math.round(state.maxHp * 0.14);
      state.hp = Math.min(state.maxHp, state.hp + rec);
      dmg = Math.round(dmg * 0.55);
      logMsg = `🌿 적이 저항력을 ${rec} 회복하며 반격했다!`;
    } else if (it === 'heavy') {
      dmg = Math.round(dmg * 1.55);
      logMsg = `⚠ 적의 강공격 [${e.sigName || '마력 해방'}]!`;
    } else if (it === 'drain') {
      const mpLoss = Math.min(player.mp, 16);
      player.mp -= mpLoss;
      logMsg = `🌑 적이 마력을 흡수했다! (MP -${mpLoss})`;
    } else {
      logMsg = `⚔ ${cardName(e) || e.kr}의 반격!`;
    }

    if (state.sEvade) {
      state.sEvade = false;
      setLog(`🪽 공중으로 날아올라 공격을 완벽히 피했다!`);
      state.sFocus = false;
      state.busy = false;
      pickIntent();
      updateUI();
      return;
    }

    if (state.sRef) {
      state.sRef = false;
      const back = Math.max(12, Math.round(dmg * 1.25));
      state.hp = Math.max(0, state.hp - back);
      shakeVisual();
      SoundFX.magic();
      setLog(`🪞 반사막 발동! 적의 공격을 되돌려 ${back}의 피해를 주었다!`);
      if (state.hp === 0) state.exhausted = true;
      state.sFocus = false;
      state.busy = false;
      pickIntent();
      updateUI();
      return;
    }

    // 의상 속성/전체 피해 경감 + 방어/결계/간식 경감
    if (cos.allDmgResist && cos.allDmgResist < 1) {
      dmg = Math.round(dmg * cos.allDmgResist);
    }
    if (['watery', 'windy', 'fly', 'aqua', 'gale'].includes(e.id) || e.anomalyType === 'local_rain') {
      dmg = Math.round(dmg * (cos.waterWindResist || 1));
    }
    if (['thunder', 'firey', 'blaze'].includes(e.id)) {
      dmg = Math.round(dmg * (cos.elemResist || 1));
    }
    if (state.sShield) {
      dmg = Math.max(2, Math.round(dmg * 0.2));
      state.sShield = false;
      logMsg += ' (결계로 80% 방어!)';
    }
    if (state.sFocus) {
      dmg = Math.max(2, Math.round(dmg * 0.35));
      logMsg += ' (방어·호흡 경감!)';
    }
    if (state.snackGuard) {
      dmg = Math.max(2, Math.round(dmg * 0.78));
    }

    // 친밀도 3 이상: 치명적 위기 시 샤오랑 자동 대리 방어 (전투당 1회)
    const trust = hooks.getSyaoranTrust ? hooks.getSyaoranTrust() : 0;
    if (player.hp - dmg <= 0 && trust >= 3 && !state.syaoranSaveUsed) {
      state.syaoranSaveUsed = true;
      SoundFX.syaoran();
      spawnVFX('syaoran');
      player.hp = Math.max(1, Math.min(player.maxHp, Math.round(player.maxHp * 0.25)));
      setLog(`⚡ 위기의 순간! 샤오랑이 뛰어들어 부적으로 치명타를 대신 막아냈다! ("무사해, 사쿠라?!")`);
      state.sFocus = false;
      state.busy = false;
      pickIntent();
      updateUI();
      return;
    }

    player.hp = Math.max(0, player.hp - dmg);
    SoundFX.hit();
    setLog(`${logMsg} HP -${dmg}`);
    state.sFocus = false;

    if (player.hp <= 0) {
      updateUI();
      Timers.after(() => {
        closeBattleOverlay();
        if (hooks.onDefeat) hooks.onDefeat();
      }, 900);
      return;
    }

    state.busy = false;
    pickIntent();
    updateUI();
  }

  /* --------------------------------------------------------------------------
   * 난이도 상향 5종 마법 피니시 시스템 (Ring / 5~7키 Combo / Prism Lock / Clash)
   * ------------------------------------------------------------------------*/
  function hideTimingBox() {
    state.timing = false;
    state.finishKind = null;
    state.pendingLiveCardId = null;
    state.clashResolved = false;
    $('sealTimingBox')?.classList.add('hidden');
  }

  /** 메인 피니시 버튼 라우터 */
  function openSeal() {
    if (state.busy || !state.enemy || state.enemy.isIncident) return;
    closeCardPicker();

    const e = state.enemy;
    const hpRatio = state.hp / Math.max(1, state.maxHp);
    if (e.isBoss && state.hp > 0) {
      setLog('최종 보스의 저항력을 0까지 깎아야 마력 충돌을 일으킬 수 있습니다!');
      SoundFX.hit();
      return;
    }
    if (!e.isBoss && hpRatio > 0.5) {
      setLog('저항력이 너무 높습니다! 먼저 50% 이하로 약화시키세요.');
      SoundFX.hit();
      return;
    }

    if (e.isBoss) {
      startMagicClashFinish();
    } else if (hooks.part === 3) {
      startCrystalPrismFinish();
    } else {
      startRitualRingFinish();
    }
  }

  /** (1) 수렴 마법진 (Ritual Ring — 1부 봉인 & 2부 공명 변환 · 저항력 비례 고난도 상향!) */
  function startRitualRingFinish() {
    const e = state.enemy;
    const cos = getCostumeBonuses();
    const hpRatio = clamp(state.hp / Math.max(1, state.maxHp), 0, 0.5);
    const isUpper = UPPER_CARDS.has(e.id);
    const stress = hpRatio / 0.5; // 0(탈진) ~ 1(저항력 50%)

    // 저항력이 높을수록 폭은 훨씬 좁고, 수렴 속도는 대폭 빠르게!
    const targetCenter = 28 + Math.random() * 20;
    const baseHalf = state.exhausted
      ? (isUpper ? 7.2 : 8.5)
      : Math.max(isUpper ? 2.6 : 3.2, (isUpper ? 6.2 : 7.4) - stress * (isUpper ? 3.5 : 4.0));
    const finalHalf = baseHalf + (cos.sealZoneBonus || 0) * 0.42;

    state.ringMin = Math.max(16, targetCenter - finalHalf);
    state.ringMax = Math.min(72, targetCenter + finalHalf);
    state.ringRadius = 104;
    // 탈진 시 92~108 px/s, 저항력 50%일 때는 152~192 px/s로 확 빨라짐!
    state.ringSpeed = (isUpper ? 108 : 92) + stress * (isUpper ? 84 : 64);

    state.finishKind = 'ring';
    state.timing = true;
    state.busy = true;

    const box = $('sealTimingBox');
    if (box) {
      const isP2 = hooks.part === 2;
      const bandW = (state.ringMax - state.ringMin).toFixed(1);
      box.innerHTML = `
        <div class="flex items-center justify-between text-[11px] mb-1">
          <span class="font-magic ${isP2 ? 'text-pink-200' : 'text-yellow-300'} tracking-widest">${isP2 ? 'STAR RITUAL RING' : 'SEALING RITUAL RING'}</span>
          <span class="font-story text-amber-200 font-bold">${state.exhausted ? '💫 탈진 보너스' : `저항 ${Math.round(hpRatio * 100)}% · 폭 ${bandW}`}</span>
        </div>
        <p class="font-story text-xs text-pink-100 mb-2">바깥 마법 고리가 <b>빛나는 황금 띠</b>에 겹치는 순간 <b>X</b> 또는 <b>실행</b>!</p>
        <div class="relative mx-auto w-44 h-44 flex items-center justify-center my-1">
          <svg viewBox="0 0 220 220" class="w-full h-full">
            <circle cx="110" cy="110" r="102" fill="rgba(10,4,24,0.65)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
            <circle cx="110" cy="110" r="${((state.ringMin + state.ringMax) / 2).toFixed(1)}" fill="none" stroke="${isP2 ? 'rgba(244,114,182,0.52)' : 'rgba(250,204,21,0.52)'}" stroke-width="${(state.ringMax - state.ringMin).toFixed(1)}"/>
            <circle cx="110" cy="110" r="${state.ringMin.toFixed(1)}" fill="none" stroke="#fef08a" stroke-width="1.3" stroke-dasharray="4 3"/>
            <circle cx="110" cy="110" r="${state.ringMax.toFixed(1)}" fill="none" stroke="#fef08a" stroke-width="1.3" stroke-dasharray="4 3"/>
            <circle id="ritualShrinkCircle" cx="110" cy="110" r="${state.ringRadius}" fill="none" stroke="#f472b6" stroke-width="4.2"/>
            <polygon points="110,96 113,106 123,106 115,112 118,122 110,116 102,122 105,112 97,106 107,106" fill="#fef08a" opacity="0.9"/>
          </svg>
        </div>
        <div class="flex justify-center gap-2 mt-1">
          <button id="btnExecFinish" class="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold text-sm shadow-lg active:scale-95">${isP2 ? '★ 공명 실행! (X)' : '🎯 봉인 실행! (X)'}</button>
          <button id="btnCancelFinish" class="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 font-bold text-sm">취소 (Z)</button>
        </div>
      `;
      box.classList.remove('hidden');
      $('btnExecFinish')?.addEventListener('click', execSeal);
      $('btnCancelFinish')?.addEventListener('click', cancelSeal);
    }
    syncCommandFocus();
    SoundFX.click();
  }

  /** (2) 5~7키 별빛 공명 (Star Combo — 2부 전투 중 실시간 ★변환 난이도 상향!) */
  function startLiveTransformFinish(card) {
    const cos = getCostumeBonuses();
    const isBoss = !!state.enemy?.isBoss;
    const isUpper = UPPER_CARDS.has(card.id);
    // 일반 5키 · 상위 6키 · 보스전 7키로 상향!
    const count = isBoss ? 7 : isUpper ? 6 : 5;
    const seq = [];
    for (let i = 0; i < count; i++) {
      let dir = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
      if (i >= 2 && seq[i - 1] === dir && seq[i - 2] === dir) {
        const others = ALL_DIRS.filter((d) => d !== dir);
        dir = others[Math.floor(Math.random() * others.length)];
      }
      seq.push(dir);
    }

    state.finishKind = 'combo';
    state.pendingLiveCardId = card.id;
    state.comboSeq = seq;
    state.comboStep = 0;
    state.comboMaxTime = (isBoss ? 6.0 : isUpper ? 5.6 : 5.2) + (cos.sealZoneBonus || 0) * 0.08;
    state.comboTime = state.comboMaxTime;
    state.timing = true;
    state.busy = true;

    const box = $('sealTimingBox');
    if (box) {
      box.innerHTML = `
        <div class="flex items-center justify-between text-[11px] mb-1">
          <span class="font-magic text-pink-200 tracking-widest">STAR RESONANCE · ${count} KEYS</span>
          <span id="comboTimerTxt" class="font-mono text-yellow-200 font-bold">${state.comboTime.toFixed(1)}s</span>
        </div>
        <p class="font-story text-xs text-pink-100 mb-2"><b>[${cardName(card)}]</b> ★변환! 방향키(또는 WASD/클릭) ${count}개를 순서대로 입력! (오입력 시 시간 감점)</p>
        <div id="comboSlots" class="flex items-center justify-center flex-wrap gap-1.5 my-2"></div>
        <div class="h-2 bg-black/70 rounded-full overflow-hidden border border-pink-300/60 mb-2.5">
          <div id="comboTimeBar" class="h-full bg-gradient-to-r from-pink-400 via-yellow-300 to-fuchsia-400" style="width:100%"></div>
        </div>
        <div class="flex justify-center gap-2">
          <button id="btnCancelFinish" class="px-4 py-1.5 rounded-xl bg-slate-700 text-slate-200 font-bold text-xs">취소 (Z)</button>
        </div>
      `;
      box.classList.remove('hidden');
      $('btnCancelFinish')?.addEventListener('click', cancelSeal);
      renderComboSlots();
    }
    syncCommandFocus();
    SoundFX.click();
  }

  function renderComboSlots() {
    const wrap = $('comboSlots');
    if (!wrap) return;
    wrap.innerHTML = '';
    state.comboSeq.forEach((dir, idx) => {
      const done = idx < state.comboStep;
      const cur = idx === state.comboStep;
      const btn = document.createElement('button');
      btn.className = `w-10 h-10 sm:w-11 sm:h-11 rounded-xl border-2 text-base sm:text-lg font-bold flex items-center justify-center transition ${
        done
          ? 'bg-emerald-500/40 border-emerald-300 text-emerald-100 scale-95'
          : cur
          ? 'bg-pink-600/80 border-yellow-300 text-yellow-100 scale-110 shadow-[0_0_16px_rgba(253,224,71,0.65)]'
          : 'bg-black/50 border-white/25 text-slate-300'
      }`;
      btn.textContent = done ? '★' : DIR_ARROWS[dir];
      btn.addEventListener('click', () => handleComboDir(dir));
      wrap.appendChild(btn);
    });
  }

  function handleComboDir(dir) {
    if (!state.timing || state.finishKind !== 'combo') return;
    if (dir === state.comboSeq[state.comboStep]) {
      SoundFX.comboStep(state.comboStep);
      state.comboStep++;
      renderComboSlots();
      if (state.comboStep >= state.comboSeq.length) {
        const card = hooks.getCards()[state.pendingLiveCardId];
        hideTimingBox();
        if (card) completeLiveTransform(card);
      }
    } else {
      SoundFX.hit();
      state.comboTime = Math.max(0.25, state.comboTime - 0.55);
      const wrap = $('comboSlots');
      if (wrap) {
        wrap.classList.remove('shake-hit');
        void wrap.offsetWidth;
        wrap.classList.add('shake-hit');
      }
      setLog('⚠ 방향키 오입력! 공명 시간이 줄어들었습니다! 정확히 눌러 주세요!');
    }
  }

  /** (3) 💎 크리스탈 프리즘 락 (Part 3 클리어 카드 고착 — 2단계 역회전 가속 쐐기 고정!) */
  function startCrystalPrismFinish() {
    const e = state.enemy;
    const cos = getCostumeBonuses();
    const hpRatio = clamp(state.hp / Math.max(1, state.maxHp), 0, 0.5);
    const stress = hpRatio / 0.5;
    const isUpper = UPPER_CARDS.has(e.id);

    const t1 = 70 + Math.floor(Math.random() * 105);
    const t2 = (t1 + 145 + Math.floor(Math.random() * 70)) % 360;
    const baseSpan = state.exhausted
      ? (isUpper ? 24 : 28)
      : Math.max(isUpper ? 13 : 16, (isUpper ? 22 : 25) - stress * 8.5);

    state.prismTargets = [t1, t2];
    state.prismSpan = baseSpan + (cos.sealZoneBonus || 0) * 1.1;
    state.prismAngle = (t1 + 185) % 360;
    state.prismDir = 1;
    state.prismStep = 0;
    state.prismSpeed = (isUpper ? 195 : 172) + stress * 72;

    state.finishKind = 'prism';
    state.timing = true;
    state.busy = true;

    renderCrystalPrismBox(hpRatio);
    syncCommandFocus();
    SoundFX.click();
  }

  function renderCrystalPrismBox(hpRatio = 0) {
    const box = $('sealTimingBox');
    if (!box) return;
    const t1 = state.prismTargets[0];
    const t2 = state.prismTargets[1];
    const half = state.prismSpan / 2;
    const arc1 = describeArc(110, 110, 82, t1 - half, t1 + half);
    const arc2 = describeArc(110, 110, 82, t2 - half * 0.9, t2 + half * 0.9);
    const step1Done = state.prismStep >= 1;

    box.innerHTML = `
      <div class="flex items-center justify-between text-[11px] mb-1">
        <span class="font-magic text-sky-200 tracking-widest">CRYSTAL PRISM LOCK · ${state.prismStep + 1}/2</span>
        <span id="prismStatusMeta" class="font-story text-yellow-200 font-bold">${step1Done ? '2단계 역회전 가속!' : (state.exhausted ? '💫 탈진 보너스' : `저항 ${Math.round(hpRatio * 100)}%`)}</span>
      </div>
      <p class="font-story text-xs text-sky-100 mb-2">회전하는 크리스탈 바늘이 <b>빛나는 쐐기</b>에 겹칠 때 <b>X</b>로 2곳을 고정하세요!</p>
      <div class="relative mx-auto w-44 h-44 flex items-center justify-center my-1">
        <svg viewBox="0 0 220 220" class="w-full h-full">
          <circle cx="110" cy="110" r="88" fill="rgba(8,18,40,0.74)" stroke="rgba(186,230,253,0.28)" stroke-width="1.5"/>
          <circle cx="110" cy="110" r="82" fill="none" stroke="rgba(186,230,253,0.18)" stroke-width="10"/>
          <path d="${arc1}" fill="none" stroke="${step1Done ? '#34d399' : '#38bdf8'}" stroke-width="11" stroke-linecap="round" opacity="${step1Done ? '0.95' : '0.92'}"/>
          <path d="${arc2}" fill="none" stroke="${step1Done ? '#fde047' : 'rgba(249,168,212,0.38)'}" stroke-width="${step1Done ? '11' : '8'}" stroke-linecap="round"/>
          <g id="prismNeedle" transform="rotate(${state.prismAngle.toFixed(1)} 110 110)">
            <line x1="110" y1="110" x2="110" y2="24" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>
            <polygon points="110,16 116,30 110,26 104,30" fill="#fef08a" stroke="#38bdf8" stroke-width="1"/>
          </g>
          <polygon points="110,96 122,110 110,124 98,110" fill="rgba(186,230,253,0.4)" stroke="#e0f2fe" stroke-width="1.8"/>
          <circle cx="110" cy="110" r="5" fill="#fef08a"/>
        </svg>
      </div>
      <div class="flex justify-center gap-2 mt-1">
        <button id="btnExecFinish" class="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 via-cyan-500 to-indigo-500 text-white font-bold text-sm shadow-lg active:scale-95">💎 프리즘 고정! (X)</button>
        <button id="btnCancelFinish" class="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 font-bold text-sm">취소 (Z)</button>
      </div>
    `;
    box.classList.remove('hidden');
    $('btnExecFinish')?.addEventListener('click', execSeal);
    $('btnCancelFinish')?.addEventListener('click', cancelSeal);
  }

  /** (4) 최종 보스전 마력 충돌 (Magic Clash — X 연타 결전 · 오스킵 완벽 차단!) */
  function startMagicClashFinish() {
    const isP3 = hooks.part === 3;
    const isP2 = hooks.part === 2;
    state.finishKind = 'clash';
    state.clashVal = 45;
    state.clashMaxTime = 7.8;
    state.clashTime = state.clashMaxTime;
    state.clashPushBack = isP3 ? 28 : isP2 ? 26 : 24;
    state.clashTapPower = 6.4;
    state.clashResolved = false;
    state.timing = true;
    state.busy = true;

    const box = $('sealTimingBox');
    if (box) {
      box.innerHTML = `
        <div class="flex items-center justify-between text-[11px] mb-1">
          <span class="font-magic text-yellow-300 tracking-widest">FINAL MAGIC CLASH!</span>
          <span id="clashTimerTxt" class="font-mono text-rose-200 font-bold">${state.clashTime.toFixed(1)}s</span>
        </div>
        <p class="font-story text-xs text-pink-100 mb-2"><b>X 키</b>(또는 버튼)를 연타해 마력 구슬을 오른쪽 끝까지 밀어내세요!</p>
        <div class="relative h-8 bg-black/80 rounded-full border-2 border-yellow-300/80 overflow-hidden mb-3">
          <div id="clashPlayerFill" class="absolute inset-y-0 left-0 bg-gradient-to-r ${isP3 ? 'from-sky-500 via-cyan-400 to-yellow-200' : 'from-pink-500 via-fuchsia-500 to-yellow-300'}" style="width:${state.clashVal}%"></div>
          <div id="clashEnemyFill" class="absolute inset-y-0 right-0 bg-gradient-to-l ${isP3 ? 'from-teal-950 via-indigo-900 to-teal-500/75' : isP2 ? 'from-indigo-950 via-purple-900 to-indigo-500/80' : 'from-slate-900 via-indigo-900 to-sky-400/75'}" style="width:${100 - state.clashVal}%"></div>
          <div id="clashOrb" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border-2 border-yellow-300 shadow-[0_0_16px_#fef08a] flex items-center justify-center text-xs" style="left:${state.clashVal}%">✦</div>
        </div>
        <div class="flex justify-center gap-2">
          <button id="btnExecFinish" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white font-bold text-sm shadow-xl active:scale-95">🔥 마력 밀어내기! (X 연타)</button>
        </div>
      `;
      box.classList.remove('hidden');
      $('btnExecFinish')?.addEventListener('click', execSeal);
    }
    syncCommandFocus();
    SoundFX.encounter();
  }

  /** 피니시 실행 핸들러 (수렴 마법진 / 프리즘 락 / 마력 충돌 X 입력) */
  function execSeal() {
    if (!state.timing) return;
    const e = state.enemy;

    if (state.finishKind === 'ring') {
      const ok = state.ringRadius >= state.ringMin && state.ringRadius <= state.ringMax;
      hideTimingBox();
      if (ok) {
        SoundFX.seal();
        spawnVFX('seal');
        const chantKey = hooks.part === 2 ? 'transform_p2' : 'seal_p1';
        const subQuote = hooks.part === 2 ? (e.transformQuote || '') : (e.sealQuote || '');
        startChant({
          mode: 'seal',
          chantText: Locale.getChant(chantKey),
          subQuote,
          initialManifest: Art.getManifest(e, { isPart2: hooks.part === 2 }),
          finalCards: [e],
          isSakura: hooks.part === 2,
          isClear: false,
          lockMs: 520,
          onDone: () => {
            closeBattleOverlay();
            if (hooks.onVictory) hooks.onVictory(e);
          }
        });
      } else {
        SoundFX.hit();
        setLog('💫 마법진 타이밍이 빗나갔다! 적이 강하게 반격해 온다!');
        Timers.after(enemyTurn, 720);
      }
      return;
    }

    if (state.finishKind === 'prism') {
      const targetAngle = state.prismTargets[state.prismStep];
      const tol = (state.prismSpan / 2) * (state.prismStep === 1 ? 0.92 : 1.0);
      const diff = angleDelta(state.prismAngle, targetAngle);
      if (diff <= tol) {
        SoundFX.comboStep(state.prismStep + 1);
        if (state.prismStep === 0) {
          // 1단계 고정 성공 -> 2단계 역회전 가속!
          state.prismStep = 1;
          state.prismDir = -1;
          state.prismSpeed *= 1.24;
          const hpRatio = clamp(state.hp / Math.max(1, state.maxHp), 0, 0.5);
          renderCrystalPrismBox(hpRatio);
          setLog('💎 1단계 프리즘 쐐기 고정! 역회전하는 2단계 황금 쐐기를 고정하세요!');
        } else {
          // 2단계 고정 완료 -> 클리어 카드 고착 영창!
          hideTimingBox();
          SoundFX.seal();
          spawnVFX('crystal');
          startChant({
            mode: 'seal',
            chantText: Locale.getChant('secure_p3'),
            subQuote: e.secureQuote || '',
            initialManifest: Art.getManifest(e, { isPart3: true }),
            finalCards: [e],
            isSakura: false,
            isClear: true,
            lockMs: 560,
            onDone: () => {
              closeBattleOverlay();
              if (hooks.onVictory) hooks.onVictory(e);
            }
          });
        }
      } else {
        hideTimingBox();
        SoundFX.hit();
        setLog('💫 크리스탈 프리즘 고정 실패! 투명한 기운이 반격해 온다!');
        Timers.after(enemyTurn, 720);
      }
      return;
    }

    if (state.finishKind === 'clash') {
      if (state.clashResolved) return;
      state.clashVal = Math.min(100, state.clashVal + state.clashTapPower);
      SoundFX.clashTap();
      renderClashBar();
      if (state.clashVal >= 100) {
        // 승리 확정 즉시 모든 추가 연타 차단 -> 짧은 연출 휴지 후 영창 시작(긴 입력 락 부여!)
        state.clashResolved = true;
        state.timing = false;
        SoundFX.seal();
        spawnVFX(hooks.part === 3 ? 'crystal' : 'seal');
        const execBtn = $('btnExecFinish');
        if (execBtn) {
          execBtn.disabled = true;
          execBtn.textContent = '✨ 마력 충돌 승리!!';
        }
        setLog('✨ 마력 충돌 승리!! 지팡이의 찬란한 빛이 상대를 감싸 안는다!!');

        Timers.after(() => {
          hideTimingBox();
          const data = hooks.getData();
          const cards = hooks.getCards();
          if (hooks.part === 3) {
            startChant({
              mode: 'seal',
              chantText: Locale.getChant('finale_p3'),
              subQuote: '서른한 장의 클리어 카드와 꿈의 지팡이가 모두의 내일을 열어젖혔다!',
              initialManifest: Art.getManifest(e, { isPart3: true, bossPhase: 2 }),
              finalCards: [e],
              isSakura: false,
              isClear: true,
              lockMs: 950,
              onDone: () => {
                closeBattleOverlay();
                if (hooks.onVictory) hooks.onVictory(e);
              }
            });
          } else if (hooks.part === 2) {
            startChant({
              mode: 'seal',
              chantText: Locale.getChant('dual_p2'),
              subQuote: '어둠과 빛이 하나의 별빛으로 어우러지며 토모에다의 아침이 열렸다!',
              initialManifest: Art.getManifest(e, { isPart2: true, bossPhase: 2 }),
              finalCards: [cards.dark, cards.light].filter(Boolean),
              isSakura: true,
              isClear: false,
              lockMs: 950,
              onDone: () => {
                closeBattleOverlay();
                if (hooks.onVictory) hooks.onVictory(e);
              }
            });
          } else {
            startChant({
              mode: 'seal',
              chantText: Locale.getChant('yue_p1'),
              subQuote: '달의 심판자 유에가 따뜻한 미소로 사쿠라를 새로운 주인으로 인정했다.',
              initialManifest: Art.getManifest(e, { isPart2: false }),
              finalCards: [e],
              isSakura: false,
              isClear: false,
              lockMs: 950,
              onDone: () => {
                closeBattleOverlay();
                if (hooks.onVictory) hooks.onVictory(e);
              }
            });
          }
        }, 480);
      }
    }
  }

  function renderClashBar() {
    const p = $('clashPlayerFill');
    const ef = $('clashEnemyFill');
    const orb = $('clashOrb');
    if (p) p.style.width = `${state.clashVal}%`;
    if (ef) ef.style.width = `${100 - state.clashVal}%`;
    if (orb) orb.style.left = `${state.clashVal}%`;
  }

  function cancelSeal() {
    if (!state.timing || state.finishKind === 'clash') return;
    hideTimingBox();
    state.busy = false;
    SoundFX.click();
    syncCommandFocus();
  }

  function completeLiveTransform(card) {
    const player = hooks.getPlayer();
    player.mp = Math.max(0, player.mp - card.mpCost);
    SoundFX.transform();
    spawnVFX('seal');
    if (hooks.onLiveCardConverted) hooks.onLiveCardConverted(card);

    startChant({
      mode: 'seal',
      chantText: Locale.getChant('transform_p2'),
      subQuote: card.transformQuote || `[${cardName(card)}]가 별빛을 머금고 사쿠라 카드로 다시 태어났다!`,
      initialManifest: Art.getCard(card, false),
      finalCards: [card],
      isSakura: true,
      isClear: false,
      lockMs: 520,
      onDone: () => useCard(card, true)
    });
  }

  /* --------------------------------------------------------------------------
   * 지팡이 해방 컷인 & 3단계 정령->카드 변신 영창 시네마틱
   * ------------------------------------------------------------------------*/
  function applyChantFrame(isSakura, isClear, isWide = false) {
    const vis = $('chantCardVisual');
    if (!vis) return;
    const sizeCls = isWide ? 'w-72 h-52 sm:w-80 sm:h-60' : 'w-36 h-52 sm:w-44 sm:h-64';
    const frameCls = isClear
      ? 'bg-gradient-to-br from-sky-900/90 via-indigo-950/90 to-slate-900 border-2 border-sky-300 shadow-[0_0_28px_rgba(125,211,252,0.55)]'
      : isSakura
      ? 'sakura-frame'
      : 'clow-frame';
    vis.className = `${sizeCls} rounded-2xl ${frameCls} p-2 relative z-10 flex items-center justify-center gap-2`;
  }

  function flipToFinalCard() {
    if (chant.flipped || chant.mode === 'release') return;
    chant.flipped = true;
    const vis = $('chantCardVisual');
    if (!vis) return;
    const multi = chant.finalCards.length > 1;
    applyChantFrame(chant.isSakura, chant.isClear, multi);
    vis.innerHTML = multi
      ? chant.finalCards.map((c) => `<div class="w-1/2 h-full">${Art.getCard(c, chant.isSakura, chant.isClear)}</div>`).join('')
      : (chant.finalCards[0] ? Art.getCard(chant.finalCards[0], chant.isSakura, chant.isClear) : '');
    vis.classList.remove('card-flip-in');
    void vis.offsetWidth;
    vis.classList.add('card-flip-in');
    SoundFX.seal();
  }

  function startChant({
    mode = 'seal',
    chantText,
    subQuote = '',
    initialManifest = '',
    finalCards = [],
    isSakura = false,
    isClear = false,
    lockMs = 450,
    onDone
  }) {
    Timers.clear(chant.tId);
    chant.active = true;
    chant.mode = mode;
    chant.typing = true;
    chant.full = Locale.t(chantText);
    chant.sub = Locale.t(subQuote);
    chant.len = 0;
    chant.onDone = onDone;
    chant.flipped = mode === 'release';
    chant.finalCards = finalCards;
    chant.isSakura = isSakura;
    chant.isClear = isClear;
    chant.lockUntil = performance.now() + lockMs;
    chant.doneLockUntil = 0;

    const vis = $('chantCardVisual');
    if (vis) {
      applyChantFrame(isSakura, isClear, false);
      vis.classList.remove('card-flip-in');
      vis.innerHTML = initialManifest || (finalCards[0] ? Art.getCard(finalCards[0], isSakura, isClear) : '');
    }

    if ($('chantSubLabel')) {
      $('chantSubLabel').textContent = mode === 'release'
        ? (hooks.part === 3 ? 'DREAM KEY · RELEASE' : hooks.part === 2 ? 'STAR KEY · RELEASE' : 'SEALING KEY · RELEASE')
        : isClear
        ? 'DREAM WAND · SECURE'
        : isSakura
        ? 'STAR RELEASE · BECOME MY SAKURA CARD'
        : 'SEALING RITUAL · RETURN TO YOUR TRUE FORM';
    }
    if ($('chantText')) {
      $('chantText').style.whiteSpace = 'pre-line';
      $('chantText').textContent = '';
    }
    if ($('chantSubQuote')) $('chantSubQuote').textContent = '';
    $('btnChantDone')?.classList.add('hidden');
    if ($('btnChantDone')) {
      $('btnChantDone').textContent = mode === 'release'
        ? '배틀 시작! (X / 클릭)'
        : isClear
        ? '클리어 카드 거두기 (X / 클릭)'
        : isSakura
        ? Locale.t('사쿠라 카드 거두기 (X / 클릭)')
        : '카드 거두기 (X / 클릭)';
    }
    $('chantOverlay')?.classList.remove('hidden');

    const flipPoint = Math.max(12, Math.floor(chant.full.length * 0.62));
    chant.tId = Timers.every(() => {
      chant.len += 2;
      if (mode === 'seal' && !chant.flipped && chant.len >= flipPoint) {
        flipToFinalCard();
      }
      if (chant.len >= chant.full.length) {
        if ($('chantText')) $('chantText').textContent = chant.full;
        if ($('chantSubQuote')) $('chantSubQuote').textContent = chant.sub;
        if (mode === 'seal' && !chant.flipped) flipToFinalCard();
        chant.typing = false;
        chant.doneLockUntil = performance.now() + 420;
        Timers.clear(chant.tId);
        chant.tId = null;
        $('btnChantDone')?.classList.remove('hidden');
      } else if ($('chantText')) {
        $('chantText').textContent = chant.full.slice(0, chant.len);
      }
    }, 28);
  }

  function completeChantStep(skip = false) {
    if (!chant.active) return;
    const now = performance.now();
    // 연타 오스킵 방지 가드 (Z 명시적 스킵은 lockUntil의 절반 이후 허용)
    if (!skip && now < chant.lockUntil) return;
    if (skip && now < chant.lockUntil - 400) return;

    if (chant.typing && !skip) {
      Timers.clear(chant.tId);
      chant.tId = null;
      chant.typing = false;
      chant.doneLockUntil = now + 420;
      if ($('chantText')) $('chantText').textContent = chant.full;
      if ($('chantSubQuote')) $('chantSubQuote').textContent = chant.sub;
      if (chant.mode === 'seal' && !chant.flipped) flipToFinalCard();
      $('btnChantDone')?.classList.remove('hidden');
      return;
    }
    if (!skip && now < chant.doneLockUntil) return;

    Timers.clear(chant.tId);
    chant.tId = null;
    chant.active = false;
    $('chantOverlay')?.classList.add('hidden');
    const cb = chant.onDone;
    chant.onDone = null;
    if (cb) cb();
  }

  /** 제3부 일상 각성 카드 전용: 배틀 없이 즉시 💎 클리어 카드 고착 영창 실행 */
  function playEventSecure(card, onDone) {
    if (!card) return;
    state.active = true;
    state.eventChantOnly = true;
    state.enemy = card;
    state.busy = true;
    hideTimingBox();
    closeCardPicker();
    $('battleOverlay')?.classList.remove('hidden');
    if (hooks.onModeChange) hooks.onModeChange('battle');
    SoundFX.seal();
    spawnVFX('crystal');

    startChant({
      mode: 'seal',
      chantText: Locale.getChant('secure_p3'),
      subQuote: card.secureQuote || '',
      initialManifest: Art.getManifest(card, { isPart3: true }),
      finalCards: [card],
      isSakura: false,
      isClear: true,
      lockMs: 520,
      onDone: () => {
        closeBattleOverlay();
        if (onDone) onDone(card);
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 배틀 시작 · 종료 · VFX 프레임 루프 · 키보드 제어
   * ------------------------------------------------------------------------*/
  function closeBattleOverlay() {
    hideTimingBox();
    closeCardPicker();
    Timers.clear(chant.tId);
    chant.active = false;
    $('chantOverlay')?.classList.add('hidden');
    $('battleOverlay')?.classList.add('hidden');
    state.active = false;
    state.eventChantOnly = false;
    state.enemy = null;
    state.busy = false;
    if (hooks.onModeChange) hooks.onModeChange('explore');
  }

  function start(target) {
    // 새 배틀 시작 시 직전 배틀의 카드 선택 위치·스크롤 완전 초기화!
    lastCardId = null;
    lastPickerScrollTop = 0;

    const fb = hooks.getFieldBuffs ? hooks.getFieldBuffs() : {};
    state.active = true;
    state.eventChantOnly = false;
    state.enemy = target;
    state.maxHp = target.maxHp || 120;
    state.hp = state.maxHp;
    state.busy = true;
    state.turn = 0;
    state.exhausted = false;
    state.phase = 1;
    state.bind = 0;
    state.bindRes = 0;
    state.eGuard = false;
    state.eRef = false;
    state.eEvade = false;
    state.sShield = !!fb.shield;
    state.sEvade = false;
    state.sRef = false;
    state.sFocus = false;
    state.snackGuard = !!fb.snackBuff;
    state.cocoaBoost = !!fb.cocoaBuff;
    state.syaoranUsed = false;
    state.syaoranSaveUsed = false;
    state.cmdIdx = 0;
    state.pickerOpen = false;
    state.pickerIdx = 0;

    if (fb) {
      fb.shield = false;
      fb.snackBuff = false;
      fb.cocoaBuff = false;
    }

    hideTimingBox();
    closeCardPicker();
    $('battleOverlay')?.classList.remove('hidden');
    if (hooks.onModeChange) hooks.onModeChange('battle');

    const vis = $('battleEnemyVisual');
    if (vis) {
      vis.innerHTML = Art.getManifest(target, { isPart2: hooks.part === 2, isPart3: hooks.part === 3, bossPhase: 1 });
    }

    SoundFX.encounter();
    const releaseKey = hooks.part === 3 ? 'release_p3' : hooks.part === 2 ? 'release_p2' : 'release_p1';
    const wandSub = hooks.part === 3
      ? '꿈의 지팡이가 투명한 빛을 뿜으며 해방되었다!'
      : hooks.part === 2
      ? '별의 지팡이가 찬란한 별빛을 뿜으며 해방되었다!'
      : '봉인의 열쇠가 붉은 봉인의 지팡이로 모습을 드러냈다!';

    pickIntent();
    updateUI();

    startChant({
      mode: 'release',
      chantText: Locale.getChant(releaseKey),
      subQuote: wandSub,
      initialManifest: getWandReleaseSVG(hooks.part),
      finalCards: [],
      isSakura: hooks.part === 2,
      isClear: hooks.part === 3,
      lockMs: 420,
      onDone: () => {
        state.busy = false;
        let openLog = target.isBoss
          ? `${Locale.t(target.kr)}와(과)의 최종 결전이 시작되었다!`
          : hooks.part === 3
          ? `${cardName(target)}의 투명한 기운이 실체화했다! 저항력을 50% 이하로 깎고 프리즘 락으로 고착하자!`
          : hooks.part === 2 && target.isIncident
          ? `[${Locale.t(target.kr)}] 발생! 전투 중 [🃏 카드 해방]으로 크로우 카드를 ★별빛 변환해 돌파하자!`
          : `${cardName(target)}의 정령이 나타났다! 저항력을 50% 이하로 깎은 뒤 마무리하자!`;

        if (fb && fb.wind > 0) {
          fb.wind = 0;
          const pre = Math.round(24 * hooks.getPlayer().mult);
          state.hp = Math.max(1, state.hp - pre);
          openLog = `🍃 선제 바람 충격으로 ${pre} 피해! ${openLog}`;
          spawnVFX('wind');
        }
        setLog(openLog);
        updateUI();
      }
    });
  }

  function updateAndRenderVFX(dt) {
    if (!state.active) return;

    // 1) 수렴 마법진 프레임 업데이트
    if (state.timing && state.finishKind === 'ring') {
      state.ringRadius -= state.ringSpeed * dt;
      if (state.ringRadius <= 10) {
        hideTimingBox();
        SoundFX.hit();
        setLog('💫 마법진이 너무 작아져 봉인 타이밍을 놓쳤다! 적이 반격해 온다!');
        Timers.after(enemyTurn, 720);
      } else {
        const c = $('ritualShrinkCircle');
        if (c) {
          c.setAttribute('r', state.ringRadius.toFixed(1));
          const inZone = state.ringRadius >= state.ringMin && state.ringRadius <= state.ringMax;
          c.setAttribute('stroke', inZone ? '#fde047' : '#f472b6');
        }
      }
    }

    // 2) 5~7키 별빛 공명 타이머 업데이트
    if (state.timing && state.finishKind === 'combo') {
      state.comboTime = Math.max(0, state.comboTime - dt);
      const tEl = $('comboTimerTxt');
      const bEl = $('comboTimeBar');
      if (tEl) tEl.textContent = `${state.comboTime.toFixed(1)}s`;
      if (bEl) bEl.style.width = `${(state.comboTime / state.comboMaxTime) * 100}%`;
      if (state.comboTime <= 0) {
        hideTimingBox();
        SoundFX.hit();
        setLog('💫 별빛 공명 시간이 초과되어 변환에 실패했다! 적이 반격해 온다!');
        Timers.after(enemyTurn, 720);
      }
    }

    // 3) 💎 크리스탈 프리즘 락 회전 바늘 업데이트
    if (state.timing && state.finishKind === 'prism') {
      state.prismAngle = (state.prismAngle + state.prismDir * state.prismSpeed * dt + 360) % 360;
      const needle = $('prismNeedle');
      if (needle) {
        needle.setAttribute('transform', `rotate(${state.prismAngle.toFixed(1)} 110 110)`);
      }
    }

    // 4) 최종 보스 마력 충돌 프레임 업데이트
    if (state.timing && state.finishKind === 'clash' && !state.clashResolved) {
      state.clashTime = Math.max(0, state.clashTime - dt);
      state.clashVal = Math.max(0, state.clashVal - state.clashPushBack * dt);
      const tEl = $('clashTimerTxt');
      if (tEl) tEl.textContent = `${state.clashTime.toFixed(1)}s`;
      renderClashBar();
      if (state.clashVal <= 0 || state.clashTime <= 0) {
        hideTimingBox();
        SoundFX.hit();
        state.hp = Math.round(state.maxHp * 0.14);
        state.exhausted = false;
        setLog('💫 마력 충돌에서 밀려났다! 적이 저항력을 약간 회복하며 반격해 온다!');
        updateUI();
        Timers.after(enemyTurn, 800);
      }
    }

    // 5) 배틀 VFX 캔버스 렌더
    if (!vfxCtx) return;
    vfxCtx.clearRect(0, 0, viewW, viewH);
    const cx = viewW / 2;
    const cy = viewH * 0.42;

    for (let i = vfxList.length - 1; i >= 0; i--) {
      const fx = vfxList[i];
      fx.t += dt;
      if (fx.t >= fx.max) {
        vfxList.splice(i, 1);
        continue;
      }
      const p = fx.t / fx.max;
      const a = 1 - p;
      vfxCtx.save();
      if (fx.type === 'crystal') {
        vfxCtx.strokeStyle = `rgba(186,230,253,${a})`;
        vfxCtx.lineWidth = 3.5;
        vfxCtx.beginPath();
        vfxCtx.arc(cx, cy, 24 + p * 125, 0, Math.PI * 2);
        vfxCtx.stroke();
        for (let k = 0; k < 6; k++) {
          const ang = p * 2.2 + (k * Math.PI) / 3;
          vfxCtx.fillStyle = `rgba(224,242,254,${a})`;
          vfxCtx.beginPath();
          vfxCtx.arc(cx + Math.cos(ang) * (30 + p * 95), cy + Math.sin(ang) * (30 + p * 95), 5 * a, 0, Math.PI * 2);
          vfxCtx.fill();
        }
      } else if (fx.type === 'syaoran') {
        vfxCtx.strokeStyle = `rgba(52,211,153,${a})`;
        vfxCtx.lineWidth = 4;
        vfxCtx.beginPath();
        vfxCtx.arc(cx, cy, 26 + p * 125, 0, Math.PI * 2);
        vfxCtx.stroke();
        vfxCtx.strokeStyle = `rgba(253,224,71,${a})`;
        vfxCtx.lineWidth = 3;
        vfxCtx.beginPath();
        vfxCtx.moveTo(cx - 50, cy - 110);
        vfxCtx.lineTo(cx + 12, cy - 20);
        vfxCtx.lineTo(cx - 14, cy + 12);
        vfxCtx.lineTo(cx + 42, cy + 95);
        vfxCtx.stroke();
      } else if (fx.type === 'wind') {
        vfxCtx.strokeStyle = `rgba(125,211,252,${a})`;
        vfxCtx.lineWidth = 3.2;
        for (let k = 0; k < 4; k++) {
          vfxCtx.beginPath();
          vfxCtx.arc(cx, cy, 28 + k * 24 + p * 75, p * 5 + k, p * 5 + k + 2.4);
          vfxCtx.stroke();
        }
      } else if (fx.type === 'water') {
        vfxCtx.strokeStyle = `rgba(56,189,248,${a})`;
        vfxCtx.lineWidth = 4;
        vfxCtx.beginPath();
        vfxCtx.arc(cx, cy, 25 + p * 130, 0, Math.PI * 2);
        vfxCtx.stroke();
      } else if (fx.type === 'fire') {
        const g = vfxCtx.createRadialGradient(cx, cy, 8, cx, cy, 35 + p * 135);
        g.addColorStop(0, `rgba(254,240,138,${a * 0.9})`);
        g.addColorStop(0.55, `rgba(249,115,22,${a * 0.72})`);
        g.addColorStop(1, 'rgba(239,68,68,0)');
        vfxCtx.fillStyle = g;
        vfxCtx.beginPath();
        vfxCtx.arc(cx, cy, 35 + p * 135, 0, Math.PI * 2);
        vfxCtx.fill();
      } else if (fx.type === 'sword') {
        vfxCtx.strokeStyle = `rgba(248,250,252,${a})`;
        vfxCtx.lineWidth = 5;
        vfxCtx.beginPath();
        vfxCtx.moveTo(cx - 115, cy - 75);
        vfxCtx.lineTo(cx + 115, cy + 75);
        vfxCtx.moveTo(cx + 115, cy - 75);
        vfxCtx.lineTo(cx - 115, cy + 75);
        vfxCtx.stroke();
      } else if (fx.type === 'flower') {
        for (let k = 0; k < 14; k++) {
          const ang = (k / 14) * Math.PI * 2 + p * 2;
          vfxCtx.fillStyle = `rgba(249,168,212,${a})`;
          vfxCtx.beginPath();
          vfxCtx.ellipse(cx + Math.cos(ang) * (25 + p * 125), cy + Math.sin(ang) * (20 + p * 105), 8, 4.5, ang, 0, Math.PI * 2);
          vfxCtx.fill();
        }
      } else {
        vfxCtx.strokeStyle = `rgba(253,224,71,${a})`;
        vfxCtx.lineWidth = 3.5;
        vfxCtx.beginPath();
        vfxCtx.arc(cx, cy, 24 + p * 125, 0, Math.PI * 2);
        vfxCtx.stroke();
      }
      vfxCtx.restore();
    }
  }

  function handleKey(code) {
    if (!state.active) return;

    if (chant.active) {
      if (code === 'KeyX' || code === 'Enter' || code === 'Space') completeChantStep(false);
      else if (code === 'KeyZ' || code === 'Escape') completeChantStep(true);
      return;
    }

    if (state.timing) {
      if (state.finishKind === 'combo') {
        if (code === 'ArrowUp' || code === 'KeyW') handleComboDir('up');
        else if (code === 'ArrowDown' || code === 'KeyS') handleComboDir('down');
        else if (code === 'ArrowLeft' || code === 'KeyA') handleComboDir('left');
        else if (code === 'ArrowRight' || code === 'KeyD') handleComboDir('right');
        else if (code === 'KeyZ' || code === 'Escape') cancelSeal();
      } else {
        if (code === 'KeyX' || code === 'Enter' || code === 'Space') execSeal();
        else if (code === 'KeyZ' || code === 'Escape') cancelSeal();
      }
      return;
    }

    if (state.pickerOpen) {
      const len = state.pickerItems.length;
      const cols = window.innerWidth >= 640 ? 3 : 2;
      if (code === 'KeyZ' || code === 'Escape') {
        closeCardPicker();
        SoundFX.click();
      } else if (len > 0) {
        if (code === 'ArrowRight' || code === 'KeyD') { state.pickerIdx = (state.pickerIdx + 1) % len; syncPickerFocus(); SoundFX.click(); }
        else if (code === 'ArrowLeft' || code === 'KeyA') { state.pickerIdx = (state.pickerIdx - 1 + len) % len; syncPickerFocus(); SoundFX.click(); }
        else if (code === 'ArrowDown' || code === 'KeyS') { state.pickerIdx = Math.min(len - 1, state.pickerIdx + cols); syncPickerFocus(); SoundFX.click(); }
        else if (code === 'ArrowUp' || code === 'KeyW') { state.pickerIdx = Math.max(0, state.pickerIdx - cols); syncPickerFocus(); SoundFX.click(); }
        else if (code === 'KeyX' || code === 'Enter' || code === 'Space') triggerPickedCard(false);
        else if (code === 'KeyC') triggerPickedCard(true);
      }
      return;
    }

    if (state.busy) return;
    const btns = getVisibleCmdButtons();
    if (!btns.length) return;
    if (code === 'ArrowRight' || code === 'KeyD') {
      state.cmdIdx = (state.cmdIdx + 1) % btns.length;
      syncCommandFocus();
      SoundFX.click();
    } else if (code === 'ArrowLeft' || code === 'KeyA') {
      state.cmdIdx = (state.cmdIdx - 1 + btns.length) % btns.length;
      syncCommandFocus();
      SoundFX.click();
    } else if (code === 'KeyX' || code === 'Enter' || code === 'Space') {
      const targetBtn = btns[state.cmdIdx];
      if (targetBtn && !targetBtn.disabled) targetBtn.click();
      else SoundFX.hit();
    }
  }

  // 고정 DOM 버튼 이벤트 1회 바인딩
  $('btnCmdWand')?.addEventListener('click', cmdWand);
  $('btnCmdCard')?.addEventListener('click', openCardPicker);
  $('btnCmdFocus')?.addEventListener('click', cmdFocus);
  $('btnCmdSyaoran')?.addEventListener('click', cmdSyaoran);
  $('btnCmdSeal')?.addEventListener('click', openSeal);
  $('btnClosePicker')?.addEventListener('click', closeCardPicker);
  $('btnBattleFlee')?.addEventListener('click', () => {
    if (state.busy) return;
    closeBattleOverlay();
    if (hooks.onFlee) hooks.onFlee();
  });
  $('chantOverlay')?.addEventListener('click', () => completeChantStep(false));
  $('btnChantDone')?.addEventListener('click', (e) => {
    e.stopPropagation();
    completeChantStep(false);
  });
  $('btnChantSkip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    completeChantStep(true);
  });

  return {
    state,
    start,
    playEventSecure,
    forceClose: () => {
      lastCardId = null;
      lastPickerScrollTop = 0;
      closeBattleOverlay();
    },
    resize,
    updateAndRenderVFX,
    updateUI,
    handleKey,
    completeChantStep,
    execSeal,
    cancelSeal,
    isActive: () => state.active,
    isChantActive: () => chant.active,
    isTiming: () => state.timing
  };
}
