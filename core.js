/**
 * ============================================================================
 * 카드캡터 3부작 공용 코어 엔진 (core.js)
 * - Firebase RTDB 데이터·아트 병렬 로더 및 통일 자유 로그인(한글 ID / 자유 암호)
 * - 원작명판(사쿠라·토모요) <-> 국내 번안판(체리·지수) 실시간 전환 & 조사 자동 보정
 * - 고퀄리티 SVG(« ») 복원 및 2D 캔버스용 건물 스프라이트 캐싱
 * - Web Audio 오르골 BGM & 효과음 / 중앙 타이머 / 체력 성장 & 의상 패시브 규칙
 * ============================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, set, get, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

/* ----------------------------------------------------------------------------
 * 1. 안전 스토리지 & 중앙 타이머 & 기본 유틸리티
 * --------------------------------------------------------------------------*/
export const SafeStore = {
  get(key, fallback = null) {
    try {
      const val = window.localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      window.localStorage.setItem(key, String(val));
    } catch {}
  },
  getJSON(key, fallback = null) {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  setJSON(key, obj) {
    try {
      this.set(key, JSON.stringify(obj));
    } catch {}
  }
};

export const Timers = (() => {
  const timeouts = new Set();
  const intervals = new Set();
  return {
    after(fn, ms) {
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
      return id;
    },
    every(fn, ms) {
      const id = setInterval(fn, ms);
      intervals.add(id);
      return id;
    },
    clear(id) {
      if (id == null) return;
      if (timeouts.has(id)) {
        clearTimeout(id);
        timeouts.delete(id);
      }
      if (intervals.has(id)) {
        clearInterval(id);
        intervals.delete(id);
      }
    },
    clearAll() {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      intervals.forEach(clearInterval);
      intervals.clear();
    }
  };
})();

export const Utils = {
  $(id) {
    return document.getElementById(id);
  },
  toArr(v) {
    return Array.isArray(v) ? v : (v ? Object.values(v) : []);
  },
  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },
  hasBatchim(word) {
    if (!word) return false;
    const str = String(word).trim();
    if (!str) return false;
    const code = str.charCodeAt(str.length - 1);
    return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0;
  },
  /** 단어 끝 받침에 맞는 조사 자동 부착 (예: '과/와', '이/가', '은/는', '을/를') */
  withParticle(word, pair = '과/와') {
    if (!word) return '';
    const [withB, withoutB] = pair.split('/');
    return word + (this.hasBatchim(word) ? withB : withoutB);
  },
  cardName(c) {
    return c ? `${c.kr}(${c.read})` : '';
  },
  cardRuby(c) {
    return c ? `<ruby class="card-ruby">${c.kr}<rt>${c.read}</rt></ruby>` : '';
  }
};

/* ----------------------------------------------------------------------------
 * 2. 원작명판(orig: 사쿠라) <-> 국내 공식 번안판(kr: 체리) 자동 변환 엔진
 *    - 받침이 달라지는 인물/지명(유키토->청명, 토우야->도진, 에리오르->에리얼, 토모에다->우수 마을)
 *      의 한국어 조사(은/는, 이/가, 을/를, 과/와, 아/야, 으로/로)까지 자연스럽게 교정
 * --------------------------------------------------------------------------*/
export const Locale = (() => {
  const STORE_KEY = 'sakura_locale_mode';
  let mode = SafeStore.get(STORE_KEY, 'orig') === 'kr' ? 'kr' : 'orig';
  const listeners = new Set();

  // 받침 변화가 있는 치환 규칙 (조사 동반 우선 치환)
  const PARTICLE_RULES = [
    { from: '츠키시로 유키토', to: '오청명', batchim: true },
    { from: '히이라기자와 에리오르', to: '에리얼 신', batchim: true },
    { from: '에리오르', to: '에리얼', batchim: true },
    { from: '유키토', to: '청명', batchim: true },
    { from: '토우야', to: '도진', batchim: true },
    { from: '토모에다', to: '우수 마을', batchim: true }
  ];

  // 단순 고정 명칭 및 영창 치환 (긴 구문부터 우선 치환)
  const DIRECT_RULES = [
    ['토모에다 초등학교', '우수초등학교'],
    ['토모에다 마을', '우수 마을'],
    ['츠키미네 신사', '월봉사'],
    ['신사 본당', '월봉사 본당'],
    ['신사 안뜰', '월봉사 안뜰'],
    ['신사 앞마당', '월봉사 앞마당'],
    ['신사 샘터', '월봉사 샘터'],
    ['키노모토 사쿠라', '유체리'],
    ['키노모토', '유체리'],
    ['다이도우지 토모요', '신지수'],
    ['사쿠라 카드', '체리 카드'],
    ['사쿠라 북', '체리 북'],
    ['THE SAKURA BOOK', 'THE CHERRY BOOK'],
    ['THE SAKURA CARD ARC', 'THE CHERRY CARD ARC'],
    ['SAKURA CARD', 'CHERRY CARD'],
    ['레리즈(해방)!', '봉인 해제!'],
    ['레리즈(해방)', '봉인 해제'],
    ['레리즈!', '봉인 해제!'],
    ['나쿠루', '류미호'],
    ['사쿠라', '체리'],
    ['토모요', '지수']
  ];

  const PARTICLE_MAP = {
    '은': '은', '는': '은',
    '이': '이', '가': '이',
    '을': '을', '를': '을',
    '과': '과', '와': '과',
    '아': '아', '야': '아',
    '으로': '으로', '로': '으로'
  };

  function translateToKr(input) {
    if (typeof input !== 'string' || !input) return input;
    let out = input;

    // 1) 복합 지명·고유명사 먼저 치환 (토모에다 초등학교 등이 깨지지 않도록)
    for (const [from, to] of DIRECT_RULES) {
      if (out.includes(from)) {
        out = out.split(from).join(to);
      }
    }

    // 2) 받침 변화가 있는 단어 + 바로 뒤 조사 자동 교정
    for (const rule of PARTICLE_RULES) {
      if (!out.includes(rule.from)) continue;
      // 인명 호칭(오빠/군/씨)이 뒤에 올 때는 받침 보정 없이 단어만 깔끔히 치환
      const re = new RegExp(`${rule.from}(으로|로|은|는|이|가|을|를|과|와|아|야)?`, 'g');
      out = out.replace(re, (_, p) => {
        if (!p) return rule.to;
        // '우수 마을'의 끝 글자 '을'(ㄹ 받침)은 '로' 유지 예외 처리
        if (rule.to === '우수 마을' && (p === '로' || p === '으로')) {
          return `${rule.to}로`;
        }
        return `${rule.to}${PARTICLE_MAP[p] || p}`;
      });
    }

    // 3) 자연스러운 호칭/표현 다듬기
    out = out.replace(/청명(이|은|을|과)가/g, '청명이');
    out = out.replace(/카드캡터:\s*(황혼|별빛|꿈결)의\s*우수 마을/g, '카드캡터 체리: $1의 우수 마을');
    return out;
  }

  return {
    getMode() {
      return mode;
    },
    isKr() {
      return mode === 'kr';
    },
    label() {
      return mode === 'kr' ? '🍒 체리 (번안명)' : '🌸 사쿠라 (원작명)';
    },
    shortLabel() {
      return mode === 'kr' ? '🍒 체리' : '🌸 사쿠라';
    },
    t(text) {
      return mode === 'kr' ? translateToKr(text) : text;
    },
    setMode(next) {
      const clean = next === 'kr' ? 'kr' : 'orig';
      if (clean === mode) return mode;
      mode = clean;
      SafeStore.set(STORE_KEY, mode);
      listeners.forEach((fn) => {
        try { fn(mode); } catch {}
      });
      return mode;
    },
    toggle() {
      return this.setMode(mode === 'orig' ? 'kr' : 'orig');
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})();

/* ----------------------------------------------------------------------------
 * 3. 고퀄리티 벡터 아트(« ») 복원 & 캔버스 건물 스프라이트 캐싱 매니저
 * --------------------------------------------------------------------------*/
export const Art = (() => {
  let rawArt = { avatars: {}, buildings: {}, clow: {}, sakura: {} };
  const buildingCache = {};

  function decodeSvg(str) {
    return typeof str === 'string' ? str.replace(/«/g, '<').replace(/»/g, '>') : '';
  }

  function cacheBuildings() {
    const items = (rawArt.buildings && rawArt.buildings.items) || {};
    Object.entries(items).forEach(([key, encoded]) => {
      const svg = decodeSvg(encoded);
      if (!svg) return;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      buildingCache[key] = img;
    });
  }

  return {
    decodeSvg,
    init(bundleArt) {
      rawArt = bundleArt || { avatars: {}, buildings: {}, clow: {}, sakura: {} };
      cacheBuildings();
    },
    getBuilding(key) {
      const img = buildingCache[key];
      return (img && img.complete && img.naturalWidth > 0) ? img : null;
    },
    getAvatar(who) {
      const items = (rawArt.avatars && rawArt.avatars.items) || {};
      return decodeSvg(items[who] || items.sakura || '');
    },
    getCard(card, isSakura = false) {
      if (!card) return '';
      if (card.isBoss) {
        if (card.id === 'yue') {
          const tpl = decodeSvg(rawArt.clow?.frameTemplate || '');
          const art = decodeSvg(rawArt.clow?.cards?.yue || '');
          return tpl.replace('{{RULER}}', '☽').replace('{{ART}}', art).replace('{{TITLE}}', 'THE JUDGE YUE');
        }
        return decodeSvg(rawArt.sakura?.bosses?.eriol_card || '');
      }
      if (isSakura && rawArt.sakura?.frameTemplate) {
        const tpl = decodeSvg(rawArt.sakura.frameTemplate);
        const inner = decodeSvg(rawArt.sakura.cards?.[card.id] || '');
        const title = Locale.isKr() ? card.en : card.en;
        return tpl.replace('{{ART}}', inner).replace('{{TITLE}}', title);
      }
      const tpl = decodeSvg(rawArt.clow?.frameTemplate || '');
      const inner = decodeSvg(rawArt.clow?.cards?.[card.id] || '');
      const mark = card.ruler === 'kero' ? '☀' : '☽';
      return tpl.replace('{{RULER}}', mark).replace('{{ART}}', inner).replace('{{TITLE}}', card.en);
    },
    /**
     * 배틀 무대용 정령/보스 비주얼 반환
     * @param {Object} target - 카드 또는 사건/최종 보스 객체
     * @param {Object} opts - { isPart2, bossPhase }
     */
    getManifest(target, { isPart2 = false, bossPhase = 1 } = {}) {
      if (!target) return '';
      // 제2부 6대 사건 전용 보스 (bossKey 지정 시)
      if (target.bossKey && rawArt.sakura?.bosses?.[target.bossKey]) {
        return decodeSvg(rawArt.sakura.bosses[target.bossKey]);
      }
      // 최종 보스 (1부 유에 / 2부 에리오르 2페이즈)
      if (target.isBoss) {
        if (target.id === 'yue') {
          return decodeSvg(rawArt.clow?.spirits?.yue || '');
        }
        const bosses = rawArt.sakura?.bosses || {};
        return decodeSvg(bossPhase === 1 ? bosses.spinel_ruby : bosses.eriol_final);
      }
      // 일반 카드 정령 실체화 (1부 크로우 / 2부 별빛 시련)
      const body = decodeSvg(rawArt.clow?.spirits?.[target.id] || '');
      const tpl = isPart2
        ? decodeSvg(rawArt.sakura?.trialSpiritTemplate || rawArt.clow?.spiritTemplate || '')
        : decodeSvg(rawArt.clow?.spiritTemplate || '');
      return tpl ? tpl.replace('{{BODY}}', body) : body;
    }
  };
})();

/* ----------------------------------------------------------------------------
 * 4. Web Audio 절차적 오르골 BGM & 효과음 엔진
 * --------------------------------------------------------------------------*/
export const SoundFX = (() => {
  let ac = null;
  let enabled = true;
  let bgmTimer = null;
  let step = 0;
  let themePart = 1;

  const MELODIES = {
    // 제1부 황혼의 오르골
    1: [523.25, 659.25, 783.99, 659.25, 587.33, 739.99, 880.0, 739.99, 659.25, 783.99, 987.77, 783.99, 698.46, 880.0, 783.99, 659.25],
    // 제2부 별빛의 오르골
    2: [587.33, 739.99, 880.0, 739.99, 659.25, 783.99, 987.77, 783.99, 587.33, 880.0, 1174.66, 987.77, 880.0, 739.99, 659.25, 587.33]
  };

  function ensureCtx() {
    if (!enabled) return null;
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch {
      return null;
    }
  }

  function tone(freq, dur = 0.18, type = 'sine', vol = 0.075, delay = 0) {
    const c = ensureCtx();
    if (!c) return;
    try {
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {}
  }

  return {
    setTheme(part) {
      themePart = part === 2 ? 2 : 1;
    },
    isEnabled() {
      return enabled;
    },
    startBGM() {
      if (bgmTimer || !enabled) return;
      ensureCtx();
      bgmTimer = setInterval(() => {
        if (!enabled) return;
        const notes = MELODIES[themePart] || MELODIES[1];
        const n = notes[step % notes.length];
        tone(n, 0.42, 'triangle', 0.025);
        if (step % 4 === 0) tone(n * 0.5, 0.74, 'sine', 0.02);
        step++;
      }, 510);
    },
    toggle() {
      enabled = !enabled;
      if (!enabled && bgmTimer) {
        clearInterval(bgmTimer);
        bgmTimer = null;
      } else if (enabled) {
        this.startBGM();
      }
      return enabled;
    },
    click() { tone(760, 0.07, 'sine', 0.05); },
    encounter() {
      tone(523.25, 0.16, 'triangle', 0.07, 0);
      tone(659.25, 0.16, 'triangle', 0.07, 0.08);
      tone(783.99, 0.28, 'sine', 0.08, 0.16);
    },
    magic() {
      tone(659.25, 0.14, 'sine', 0.08, 0);
      tone(987.77, 0.18, 'triangle', 0.08, 0.07);
      tone(1318.5, 0.24, 'sine', 0.07, 0.14);
    },
    hit() {
      tone(190, 0.14, 'sawtooth', 0.07, 0);
      tone(125, 0.18, 'square', 0.05, 0.05);
    },
    heal() {
      tone(523.25, 0.16, 'sine', 0.07, 0);
      tone(659.25, 0.18, 'sine', 0.07, 0.08);
      tone(1046.5, 0.3, 'triangle', 0.07, 0.16);
    },
    seal() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.35, 'triangle', 0.08, i * 0.09));
    },
    syaoran() {
      // 샤오랑 부적 원호 '뇌제초래' 전용 청량한 낙뢰 화음
      tone(880, 0.12, 'sawtooth', 0.06, 0);
      tone(1174.66, 0.15, 'triangle', 0.07, 0.06);
      tone(1567.98, 0.28, 'sine', 0.08, 0.12);
    }
  };
})();

/* ----------------------------------------------------------------------------
 * 5. 성장 곡선(HP 100->115 / 105->120) & 마법 의상실 패시브 공용 규칙
 * --------------------------------------------------------------------------*/
export const Rules = {
  /**
   * 1부·2부 체력·마력·레벨 성장 곡선 계산
   * - 1부: Lv.1~19, HP 100 -> 115, MP 100 + g*14 (+ 의상 보너스)
   * - 2부: Lv.1~20, HP 105 -> 120, MP 130 + k*9 (+ 1부 연동 +20 + 의상 보너스)
   */
  calcStats({ part = 1, progressCount = 0, total = 19, costumeId = 'sakura_dress', part1Linked = false, progCfg = null }) {
    const bonus = this.getCostumeBonuses(costumeId);
    const ratio = Utils.clamp(progressCount / Math.max(1, total - (part === 1 ? 1 : 0)), 0, 1);

    if (part === 2) {
      const startHp = progCfg?.startHp ?? 105;
      const maxHpCap = progCfg?.maxHp ?? 120;
      const baseMp = progCfg?.baseMp ?? 130;
      const mpPer = progCfg?.mpPerCard ?? 9;
      const linkMp = part1Linked ? (progCfg?.part1LinkMpBonus ?? 20) : 0;
      return {
        lv: 1 + progressCount,
        maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio),
        maxMp: baseMp + progressCount * mpPer + linkMp + bonus.mpBonus,
        mult: 1.05 + progressCount * 0.036
      };
    }

    const startHp = progCfg?.startHp ?? 100;
    const maxHpCap = progCfg?.maxHp ?? 115;
    const baseMp = progCfg?.baseMp ?? 100;
    const mpPer = progCfg?.mpPerCard ?? 14;
    return {
      lv: 1 + progressCount,
      maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio),
      maxMp: baseMp + progressCount * mpPer + bonus.mpBonus,
      mult: 1.0 + progressCount * 0.032
    };
  },

  /** 의상별 전략 패시브 보너스 */
  getCostumeBonuses(costumeId) {
    switch (costumeId) {
      case 'cat_thunder':
        return { mpBonus: 0, magicMult: 1.10, elemResist: 0.80, speedMult: 1.0, sealZoneBonus: 0, turnMpRegen: 0 };
      case 'sky_wing':
        return { mpBonus: 0, magicMult: 1.0, elemResist: 1.0, speedMult: 1.12, sealZoneBonus: 4, turnMpRegen: 0 };
      case 'star_royal':
        return { mpBonus: 0, magicMult: 1.0, elemResist: 1.0, speedMult: 1.0, sealZoneBonus: 0, turnMpRegen: 4 };
      default: // sakura_dress
        return { mpBonus: 5, magicMult: 1.0, elemResist: 1.0, speedMult: 1.0, sealZoneBonus: 0, turnMpRegen: 0 };
    }
  },

  /** 의상 해금 조건 판정 */
  isCostumeUnlocked(costume, ctx) {
    if (!costume) return false;
    const t = costume.unlockType;
    if (t === 'default') return true;
    if (t === 'card') return !!(ctx.ownedCards?.has(costume.unlockCard) || ctx.sakuraCards?.has(costume.unlockCard));
    if (t === 'cards_all') return Utils.toArr(costume.unlockCards).every((id) => ctx.ownedCards?.has(id));
    if (t === 'owned_count') return (ctx.ownedCards?.size || 0) >= (costume.unlockCount || 12);
    if (t === 'card_or_p1') return !!(ctx.part1Linked || ctx.sakuraCards?.has(costume.unlockCard));
    if (t === 'incident') return !!ctx.clearedIncidents?.has(costume.unlockIncident);
    if (t === 'sakura_count') return (ctx.sakuraCards?.size || 0) >= (costume.unlockCount || 5);
    return false;
  }
};

/* ----------------------------------------------------------------------------
 * 6. Firebase RTDB 연결 & 통일 자유 로그인 모듈 (한글 ID + 자유 비밀번호 호환)
 * --------------------------------------------------------------------------*/
const FIREBASE_CFG = {
  apiKey: "AIzaSyCsIXKvZt9PrES_opeCDYxaSLV02dWVVKA",
  authDomain: "neit-pc.firebaseapp.com",
  databaseURL: "https://neit-pc-default-rtdb.firebaseio.com",
  projectId: "neit-pc",
  storageBucket: "neit-pc.firebasestorage.app",
  messagingSenderId: "833154417780",
  appId: "1:833154417780:web:b94e8cb42751abdccdfd21"
};

const app = initializeApp(FIREBASE_CFG);
const db = getDatabase(app);

const withTimeout = (promise, ms = 12000) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('서버 응답 시간 초과 (네트워크를 확인해 주세요)')), ms))
  ]);

/** Firebase 키 금지문자(. # $ [ ] /)만 제거하며 한글·영문·숫자 ID 모두 허용 */
function sanitizeId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[.#$\[\]\/]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 24);
}

/** 자유 비밀번호(4~16자, 숫자·영문·한글 모두 가능 · 기존 4자리 PIN과 100% 호환) */
function sanitizeSecret(raw) {
  return String(raw || '').trim().slice(0, 16);
}

function secretMatches(savedRecord, inputSecret) {
  const stored = savedRecord?.password || savedRecord?.pin || '';
  if (!stored) return true;
  return String(stored) === String(inputSecret);
}

async function fetchNode(path, required = true) {
  const snap = await withTimeout(get(ref(db, path)));
  if (!snap.exists()) {
    if (required) throw new Error(`${path} 경로에 데이터가 없습니다.`);
    return null;
  }
  return snap.val();
}

export const Cloud = {
  sanitizeId,
  sanitizeSecret,

  /** 파트별 게임 데이터 + 공용 고퀄리티 벡터 에셋 일괄 로드 */
  async loadBundle(part = 1) {
    const tasks = [
      fetchNode(`sakura/content/part${part}`, true),
      fetchNode('sakura/content/art/avatars', true),
      fetchNode('sakura/content/art/buildings', true),
      fetchNode('sakura/content/art/cards_clow', true),
      part >= 2 ? fetchNode('sakura/content/art/cards_sakura', true) : Promise.resolve(null)
    ];
    const [gameData, avatars, buildings, clow, sakura] = await Promise.all(tasks);
    const art = { avatars, buildings, clow, sakura };
    Art.init(art);
    return { data: gameData, art };
  },

  /** 클라우드 저장 (기존 4자리 PIN과 새 자유 비밀번호 모두 호환 검증) */
  async save(part, rawId, rawSecret, payload) {
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요. (한글·영문·숫자 자유 입력)');
    if (sec.length < 4) throw new Error('비밀번호는 4자 이상 입력해 주세요.');

    const nodeRef = ref(db, `sakura/part${part}/players/${cid}`);
    const cur = await withTimeout(get(nodeRef));
    if (cur.exists() && !secretMatches(cur.val(), sec)) {
      throw new Error('이미 등록된 아이디입니다. 비밀번호가 일치하지 않습니다.');
    }

    await withTimeout(set(nodeRef, {
      ...payload,
      playerId: cid,
      password: sec,
      pin: sec, // 기존 버전 하위 호환 유지
      updatedAt: Date.now()
    }));
    return { id: cid, secret: sec };
  },

  /** 클라우드 불러오기 */
  async load(part, rawId, rawSecret) {
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요.');

    const snap = await withTimeout(get(ref(db, `sakura/part${part}/players/${cid}`)));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!secretMatches(val, sec)) {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }
    return val;
  },

  /** 제2부에서 제1부 클리어 기록 자동/수동 연동 */
  async loadPart1Record(rawId, rawSecret) {
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요.');

    const snap = await withTimeout(get(ref(db, `sakura/part1/players/${cid}`)));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (sec && !secretMatches(val, sec)) {
      throw new Error('제1부 기록의 비밀번호가 일치하지 않습니다.');
    }
    return val;
  },

  /** 저장 데이터 삭제 */
  async del(part, rawId, rawSecret) {
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요.');

    const nodeRef = ref(db, `sakura/part${part}/players/${cid}`);
    const snap = await withTimeout(get(nodeRef));
    if (!snap.exists()) throw new Error('삭제할 저장 데이터가 없습니다.');
    if (!secretMatches(snap.val(), sec)) {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }
    await withTimeout(remove(nodeRef));
    return cid;
  }
};

export const SakuraCore = { SafeStore, Timers, Utils, Locale, Art, SoundFX, Rules, Cloud };
window.SakuraCore = SakuraCore;
