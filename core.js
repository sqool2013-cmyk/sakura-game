/**
 * ============================================================================
 * 카드캡터 3부작 통합 공용 코어 엔진 (core.js) — v.0.2.0
 * - 단일 스토리 연속 3부작(제1부 황혼 -> 제2부 별빛 -> 제3부 꿈결) 통합 엔진
 * - 메모리 전용 익명 인증(inMemoryPersistence) + 무유출 SHA-256 해시(/sakura/secrets)
 * - 단일 Firebase 경로(/sakura/players/{id}) + 멀티 세이브 슬롯(자동 1 + 수동 6)
 * - 제3부 분할 노드(part3 + part3_late / cards_clear_a + cards_clear_b) 자동 병합 로드
 * - 3부작 무퇴보 연속 성장 곡선 (1부 HP 100->120 / 2부 120->145 / 3부 145->175)
 * - 초등학교 교복 + 1부 8벌 + 2부 ★별빛 리폼·2벌 + 3부 중학교 교복·신규 3벌
 * - 원작명판(사쿠라·토모요·아키호·카이토) <-> 번안판(체리·지수·루베리·카이트)
 *   실시간 전환 · 말더듬 보정(토, 토모요 -> 지, 지수) · ㄹ받침 조사 보정
 * - 1·2·3부 원작/더빙 공식 주문 영창 정밀 고증 교정
 * ============================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { initializeAuth, inMemoryPersistence, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, set, get, remove, update } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

export const VERSION = {
  app: 'v.0.2.0',
  engine: 'v.0.2.0',
  trilogy: 'v.0.2.0'
};

export const SAVE_SLOTS = [
  { key: 'auto', label: '자동 저장 슬롯', isAuto: true },
  { key: 'slot1', label: '저장 슬롯 1', isAuto: false },
  { key: 'slot2', label: '저장 슬롯 2', isAuto: false },
  { key: 'slot3', label: '저장 슬롯 3', isAuto: false },
  { key: 'slot4', label: '저장 슬롯 4', isAuto: false },
  { key: 'slot5', label: '저장 슬롯 5', isAuto: false },
  { key: 'slot6', label: '저장 슬롯 6', isAuto: false }
];

/* ----------------------------------------------------------------------------
 * 1. 안전 스토리지 & 중앙 타이머 & 기본 유틸리티
 * --------------------------------------------------------------------------*/
export const SafeStore = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {}
  },
  getJSON(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  setJSON(key, obj) {
    try {
      window.localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
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
    return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  },
  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },
  hasBatchim(word) {
    if (!word) return false;
    const ch = String(word).trim().slice(-1);
    const code = ch.charCodeAt(0);
    return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0;
  },
  endsWithRieul(word) {
    if (!word) return false;
    const ch = String(word).trim().slice(-1);
    const code = ch.charCodeAt(0);
    return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 === 8;
  },
  /** 단어 끝 받침에 맞는 조사 자동 부착 (예: '과/와', '이/가', '은/는', '을/를') */
  withParticle(word, pair = '과/와') {
    if (!word) return '';
    const [withB, withoutB] = pair.split('/');
    return word + (this.hasBatchim(word) ? withB : withoutB);
  },
  /** TVA 스타일 괄호 없는 단일 호칭 (예: '플라이', '윈디', '게일') */
  cardName(c) {
    return c ? (c.read || c.kr || '') : '';
  },
  /** 간결한 카드 표시용 텍스트 */
  cardRuby(c) {
    return c ? (c.read || c.kr || '') : '';
  },
  /** 저장 시각 포맷 (MM/DD HH:MM) */
  formatTime(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${mm}/${dd} ${hh}:${mi}`;
    } catch {
      return '';
    }
  }
};

/* ----------------------------------------------------------------------------
 * 2. 원작명판(orig: 사쿠라) <-> 국내 공식 번안판(kr: 체리) 자동 변환 엔진
 *    - 말더듬 교정(토, 토모요 -> 지, 지수 등) + ㄹ받침 조사 보정 + 1·2·3부 공식 주문
 * --------------------------------------------------------------------------*/
export const Locale = (() => {
  const STORE_KEY = 'sakura_locale_mode';
  let mode = SafeStore.get(STORE_KEY, 'orig') === 'kr' ? 'kr' : 'orig';
  const listeners = new Set();

  const CARD_PAREN_RE = /(바람|비행|나무|방패|도약|거울|꽃|번개|미궁|그림자|환상|검|땅|소멸|물|등불|불|어둠|빛)\((윈디|플라이|우드|실드|점프|미러|플라워|선더|메이즈|섀도|일루전|소드|어시|이레이즈|워터리|글로우|파이어리|다크|라이트)\)/g;

  const PARTICLE_RULES = [
    { from: '츠키시로 유키토', to: '오청명' },
    { from: '히이라기자와 에리오르', to: '에리얼 신' },
    { from: '에리오르', to: '에리얼' },
    { from: '유키토', to: '청명' },
    { from: '토우야', to: '도진' },
    { from: '토모에다', to: '우수 마을' }
  ];

  const DIRECT_RULES = [
    // 말더듬 패턴 우선 치환 (앞 글자 잔존 방지!)
    ['토, 토모요', '지, 지수'],
    ['사, 사쿠라', '체, 체리'],
    ['유, 유키토', '청, 청명'],
    ['토, 토우야', '도, 도진'],
    ['에, 에리오르', '에, 에리얼'],
    ['아, 아키호', '루, 루베리'],
    ['카, 카이토', '카, 카이트'],
    // 지명·학교·신사·인물 공식 번안
    ['토모에다 초등학교', '우수초등학교'],
    ['토모에다 중학교', '우수중학교'],
    ['토모에다 마을', '우수 마을'],
    ['츠키미네 신사', '월봉사'],
    ['신사 본당', '월봉사 본당'],
    ['신사 안뜰', '월봉사 안뜰'],
    ['신사 앞마당', '월봉사 앞마당'],
    ['신사 샘터', '월봉사 샘터'],
    ['신사 경내', '월봉사 경내'],
    ['신사 뒤편 동굴', '월봉사 뒤편 동굴'],
    ['키노모토 사쿠라', '유체리'],
    ['키노모토', '유체리'],
    ['다이도우지 토모요', '신지수'],
    ['시노모토 아키호', '서 루베리'],
    ['유나 D. 카이토', '유나 D. 카이트'],
    ['아키호', '루베리'],
    ['카이토', '카이트'],
    ['사쿠라 카드', '체리 카드'],
    ['사쿠라 북', '체리 북'],
    ['THE SAKURA BOOK', 'THE CHERRY BOOK'],
    ['THE SAKURA CARD ARC', 'THE CHERRY CARD ARC'],
    ['SAKURA CARD', 'CHERRY CARD'],
    ['레리즈(해방)!', '봉인 해제!'],
    ['레리즈(해방)', '봉인 해제'],
    ['레리즈!', '봉인 해제!'],
    ['레리즈', '봉인 해제'],
    ['나쿠루', '류미호'],
    ['사쿠라', '체리'],
    ['토모요', '지수']
  ];

  const OFFICIAL_CHANTS = {
    release_p1: {
      orig: '어둠의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라.\n계약 아래 사쿠라가 명한다, 레리즈!',
      kr: '어둠의 힘을 지니고 있는 열쇠여,\n진정한 모습으로 내 앞에 나타나라.\n너와의 계약에 따라 체리가 명한다, 봉인 해제!'
    },
    release_p2: {
      orig: '별의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라.\n계약 아래 사쿠라가 명한다, 레리즈!',
      kr: '별의 힘을 지니고 있는 열쇠여,\n진정한 모습으로 내 앞에 나타나라.\n너와의 계약에 따라 체리가 명한다, 봉인 해제!'
    },
    release_p3: {
      orig: '꿈의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라!\n레리즈!',
      kr: '꿈의 힘을 지닌 열쇠여,\n진정한 모습으로 내 앞에 나타나라!\n봉인 해제!'
    },
    seal_p1: {
      orig: '그대의 본래 모습으로 돌아가라,\n크로우 카드!',
      kr: '너의 본 모습으로 돌아갈 것을 명한다,\n크로우 카드!'
    },
    yue_p1: {
      orig: '유에 씨와 모두를 지키는\n새로운 주인이 될게요!',
      kr: '유에 씨와 모두를 지키는\n새로운 주인이 될게요!'
    },
    transform_p2: {
      orig: '크로우가 만들어 낸 카드여,\n낡은 모습을 버리고 새롭게 태어나라.\n너의 새로운 주인, 사쿠라의 이름 아래!',
      kr: '크로우가 만들어 낸 카드여,\n낡은 모습을 벗어버리고 새롭게 태어나라.\n너의 새로운 주인, 체리의 이름 아래서!'
    },
    dual_p2: {
      orig: '어둠과 빛이여,\n낡은 모습을 버리고 새롭게 태어나라.\n너의 새로운 주인, 사쿠라의 이름 아래!',
      kr: '어둠과 빛이여,\n낡은 모습을 벗어버리고 새롭게 태어나라.\n너의 새로운 주인, 체리의 이름 아래서!'
    },
    secure_p3: {
      orig: '주인 없는 자여,\n꿈의 지팡이 아래 나의 힘이 되어라!\n시큐어!',
      kr: '주인 없는 존재여,\n꿈의 지팡이를 따라 여기 나의 힘이 되어라!\n시큐어!'
    },
    finale_p3: {
      orig: '절대 괜찮아질 거야!\n누구도 사라지지 않는 새로운 이야기로—\n꿈의 지팡이 아래, 모두의 내일을 열어라!',
      kr: '다 잘될 거야!\n누구도 사라지지 않는 새로운 이야기로—\n꿈의 지팡이 아래, 모두의 내일을 열어라!'
    }
  };

  const PARTICLE_MAP = {
    '가': '이',
    '는': '은',
    '를': '을',
    '와': '과',
    '랑': '이랑',
    '야': '아',
    '여': '이여',
    '로': '으로'
  };

  function cleanCardParens(input) {
    if (typeof input !== 'string' || !input) return input;
    return input
      .replace(CARD_PAREN_RE, '$2')
      .replace(/레리즈\(해방\)/g, '레리즈')
      .replace(/고착\(시큐어\)/g, '시큐어');
  }

  function translateToKr(input) {
    if (typeof input !== 'string' || !input) return input;
    let out = input;

    for (const [from, to] of DIRECT_RULES) {
      if (out.includes(from)) out = out.split(from).join(to);
    }

    for (const rule of PARTICLE_RULES) {
      if (!out.includes(rule.from)) continue;
      const isRieul = Utils.endsWithRieul(rule.to);
      const re = new RegExp(`${rule.from}(가|는|를|와|랑|야|여|로)?`, 'g');
      out = out.replace(re, (_, part) => {
        if (!part) return rule.to;
        if (part === '로' && isRieul) return `${rule.to}로`;
        return rule.to + (PARTICLE_MAP[part] || part);
      });
    }

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
      const cleaned = cleanCardParens(text);
      return mode === 'kr' ? translateToKr(cleaned) : cleaned;
    },
    getChant(kind = 'seal_p1') {
      const entry = OFFICIAL_CHANTS[kind] || OFFICIAL_CHANTS.seal_p1;
      return mode === 'kr' ? entry.kr : entry.orig;
    },
    setMode(next) {
      const clean = next === 'kr' ? 'kr' : 'orig';
      if (clean === mode) return mode;
      mode = clean;
      SafeStore.set(STORE_KEY, mode);
      listeners.forEach((fn) => {
        try {
          fn(mode);
        } catch {}
      });
      return mode;
    },
    toggle() {
      return this.setMode(mode === 'orig' ? 'kr' : 'orig');
    },
    onChange(fn) {
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})();

/* ----------------------------------------------------------------------------
 * 3. 벡터 아트 복원 · 6종 상황별 표정 오버레이 · 1/2/3부 카드 & 보스 렌더러
 * --------------------------------------------------------------------------*/
export const Art = (() => {
  let rawArt = { avatars: {}, buildings: {}, clow: {}, sakura: {}, clear: {} };
  const buildingCache = {};

  const MOOD_OVERLAYS = {
    happy: `<g class="mood-layer"><circle cx="24" cy="28" r="3" fill="#fef08a"/><path d="M132 22 L135 30 L143 33 L135 36 L132 44 L129 36 L121 33 L129 30 Z" fill="#fef08a"/><ellipse cx="52" cy="94" rx="8" ry="4" fill="#fb7185" opacity="0.35"/><ellipse cx="108" cy="94" rx="8" ry="4" fill="#fb7185" opacity="0.35"/></g>`,
    shock: `<g class="mood-layer"><g stroke="#fef08a" stroke-width="2.4" stroke-linecap="round" opacity="0.88"><line x1="12" y1="16" x2="28" y2="30"/><line x1="148" y1="16" x2="132" y2="30"/><line x1="10" y1="54" x2="24" y2="58"/><line x1="150" y1="54" x2="136" y2="58"/></g><path d="M126 48 Q134 62 126 70 Q118 62 126 48 Z" fill="#7dd3fc" stroke="#ffffff" stroke-width="1.4"/></g>`,
    serious: `<g class="mood-layer"><rect width="160" height="160" fill="none" stroke="#f43f5e" stroke-opacity="0.45" stroke-width="6"/><path d="M18 22 L38 30 M142 22 L122 30" stroke="#fde047" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/></g>`,
    shy: `<g class="mood-layer"><ellipse cx="50" cy="92" rx="10" ry="5" fill="#fb7185" opacity="0.52"/><ellipse cx="110" cy="92" rx="10" ry="5" fill="#fb7185" opacity="0.52"/><g stroke="#f43f5e" stroke-width="1.5" opacity="0.72"><line x1="45" y1="90" x2="49" y2="95"/><line x1="51" y1="90" x2="55" y2="95"/><line x1="105" y1="90" x2="109" y2="95"/><line x1="111" y1="90" x2="115" y2="95"/></g><path d="M126 30 C126 24 134 24 134 30 C134 35 126 40 126 40 C126 40 118 35 118 30 C118 24 126 24 126 30 Z" fill="#f472b6" opacity="0.85"/></g>`,
    worried: `<g class="mood-layer"><rect width="160" height="44" fill="rgba(15,23,42,0.34)"/><path d="M128 52 Q134 64 128 70 Q122 64 128 52 Z" fill="#93c5fd" opacity="0.9"/><path d="M22 26 Q28 20 34 26 Q40 20 46 26" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.7"/></g>`
  };

  function decodeSvg(str) {
    return typeof str === 'string' ? str.replace(/«/g, '<').replace(/»/g, '>') : '';
  }

  function cacheBuildings() {
    const items = (rawArt.buildings && rawArt.buildings.items) || {};
    Object.entries(items).forEach(([key, raw]) => {
      if (buildingCache[key]) return;
      const svg = decodeSvg(raw);
      if (!svg) return;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      buildingCache[key] = img;
    });
  }

  return {
    decodeSvg,
    setRawArt(artObj) {
      rawArt = {
        avatars: artObj?.avatars || rawArt.avatars || {},
        buildings: artObj?.buildings || rawArt.buildings || {},
        clow: artObj?.clow || rawArt.clow || {},
        sakura: artObj?.sakura || rawArt.sakura || {},
        clear: artObj?.clear || rawArt.clear || {}
      };
      cacheBuildings();
    },
    getBuilding(key) {
      const img = buildingCache[key];
      return (img && img.complete && img.naturalWidth > 0) ? img : null;
    },
    getAvatar(who, mood = 'normal') {
      const items = (rawArt.avatars && rawArt.avatars.items) || {};
      const moodKey = `${who}_${mood}`;
      if (mood && mood !== 'normal' && items[moodKey]) {
        return decodeSvg(items[moodKey]);
      }
      const base = decodeSvg(items[who] || items.sakura || '');
      const overlay = mood && mood !== 'normal' ? MOOD_OVERLAYS[mood] : '';
      if (!overlay || !base) return base;
      return base.replace(/<\/svg>\s*$/i, `${overlay}</svg>`);
    },
    getCard(card, isSakura = false, isClear = false) {
      if (!card) return '';
      const clow = rawArt.clow || {};
      const sak = rawArt.sakura || {};
      const clr = rawArt.clear || {};

      // 제3부 클리어 카드 (투명 크리스탈 프레임)
      if (isClear || card.isClear) {
        if (card.isBoss) {
          return decodeSvg((clr.bosses && clr.bosses.clear_finale_card) || '');
        }
        const tpl = decodeSvg(clr.frameTemplate || '');
        const inner = decodeSvg((clr.cards && clr.cards[card.id]) || '');
        if (tpl && inner) {
          return tpl.replace('{{ART}}', inner).replace('{{TITLE}}', card.en || '');
        }
      }

      if (card.isBoss) {
        if (card.id === 'kaito_boss') {
          return decodeSvg((clr.bosses && clr.bosses.clear_finale_card) || '');
        }
        if (isSakura || card.id === 'eriol_boss') {
          return decodeSvg((sak.bosses && sak.bosses.eriol_card) || '');
        }
        const tpl = decodeSvg(clow.frameTemplate || '');
        const inner = decodeSvg((clow.cards && clow.cards.yue) || '');
        return tpl.replace('{{RULER}}', '☽').replace('{{ART}}', inner).replace('{{TITLE}}', 'THE JUDGE YUE');
      }

      if (isSakura && sak.frameTemplate) {
        const tpl = decodeSvg(sak.frameTemplate);
        const inner = decodeSvg((sak.cards && sak.cards[card.id]) || (clow.cards && clow.cards[card.id]) || '');
        return tpl.replace('{{ART}}', inner).replace('{{TITLE}}', card.en || '');
      }

      const tpl = decodeSvg(clow.frameTemplate || '');
      const inner = decodeSvg((clow.cards && clow.cards[card.id]) || '');
      const mark = card.ruler === 'kero' ? '☀' : '☽';
      return tpl.replace('{{RULER}}', mark).replace('{{ART}}', inner).replace('{{TITLE}}', card.en || '');
    },
    getManifest(target, { isPart2 = false, isPart3 = false, bossPhase = 1 } = {}) {
      if (!target) return '';
      const clow = rawArt.clow || {};
      const sak = rawArt.sakura || {};
      const clr = rawArt.clear || {};

      if (isPart3 || target.id === 'kaito_boss') {
        const cb = clr.bosses || {};
        if (target.isBoss || target.id === 'kaito_boss') {
          return decodeSvg(bossPhase === 1 ? (cb.clockwork_construct || '') : (cb.clockland_mage || ''));
        }
        if (target.id === 'dreaming' && cb.cloaked_figure) {
          return decodeSvg(cb.cloaked_figure);
        }
        const body = decodeSvg((clr.cards && clr.cards[target.id]) || '');
        const tpl = decodeSvg(clr.spiritTemplate || '');
        if (tpl && body) return tpl.replace('{{BODY}}', body);
        return this.getCard(target, false, true);
      }

      if (target.isBoss) {
        if (isPart2 || target.id === 'eriol_boss') {
          const b = sak.bosses || {};
          return decodeSvg(bossPhase === 1 ? (b.spinel_ruby || '') : (b.eriol_final || ''));
        }
        return decodeSvg((clow.spirits && clow.spirits.yue) || '');
      }

      if (target.isIncident && target.bossKey) {
        const b = sak.bosses || {};
        if (b[target.bossKey]) return decodeSvg(b[target.bossKey]);
      }

      const body = decodeSvg((clow.spirits && clow.spirits[target.id]) || '');
      if (body.trim().startsWith('<svg')) return body;
      const tpl = decodeSvg((isPart2 && sak.trialSpiritTemplate) ? sak.trialSpiritTemplate : (clow.spiritTemplate || ''));
      if (tpl && body) return tpl.replace('{{BODY}}', body);
      return this.getCard(target, isPart2, false);
    }
  };
})();

/* ----------------------------------------------------------------------------
 * 4. Web Audio 오르골 BGM & 효과음 엔진 (1부 황혼 / 2부 별빛 / 3부 꿈결 멜로디)
 * --------------------------------------------------------------------------*/
export const SoundFX = (() => {
  let ac = null;
  let enabled = true;
  let bgmTimer = null;
  let step = 0;
  let themePart = 1;

  const MELODY_P1 = [523.25, 659.25, 783.99, 659.25, 587.33, 739.99, 880.0, 739.99, 659.25, 783.99, 987.77, 783.99, 698.46, 880.0, 783.99, 659.25];
  const MELODY_P2 = [587.33, 739.99, 880.0, 739.99, 659.25, 783.99, 987.77, 783.99, 587.33, 880.0, 1174.66, 987.77, 880.0, 739.99, 659.25, 587.33];
  const MELODY_P3 = [659.25, 783.99, 1046.5, 987.77, 783.99, 880.0, 1174.66, 1046.5, 659.25, 987.77, 1318.5, 1174.66, 987.77, 880.0, 783.99, 659.25];

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
    setTheme(part = 1) {
      themePart = part === 3 ? 3 : part === 2 ? 2 : 1;
    },
    startBGM() {
      if (bgmTimer || !enabled) return;
      ensureCtx();
      bgmTimer = setInterval(() => {
        if (!enabled) return;
        const notes = themePart === 3 ? MELODY_P3 : themePart === 2 ? MELODY_P2 : MELODY_P1;
        const n = notes[step % notes.length];
        tone(n, 0.42, 'triangle', 0.024);
        if (step % 4 === 0) tone(n * 0.5, 0.72, 'sine', 0.019);
        step++;
      }, themePart === 3 ? 480 : themePart === 2 ? 500 : 520);
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
    isEnabled() {
      return enabled;
    },
    click() {
      tone(740, 0.07, 'sine', 0.05);
    },
    encounter() {
      tone(523.25, 0.16, 'triangle', 0.07, 0);
      tone(659.25, 0.16, 'triangle', 0.07, 0.08);
      tone(783.99, 0.28, 'sine', 0.08, 0.16);
    },
    magic() {
      tone(587.33, 0.14, 'sine', 0.08, 0);
      tone(880, 0.18, 'triangle', 0.08, 0.07);
      tone(1174.66, 0.24, 'sine', 0.07, 0.14);
    },
    syaoran() {
      tone(440, 0.12, 'sawtooth', 0.06, 0);
      tone(659.25, 0.14, 'triangle', 0.07, 0.06);
      tone(1046.5, 0.24, 'sine', 0.08, 0.12);
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
    comboStep(idx = 0) {
      const notes = [659.25, 783.99, 1046.5, 1318.5];
      tone(notes[idx % notes.length], 0.13, 'triangle', 0.08);
    },
    clashTap() {
      tone(520 + Math.random() * 140, 0.06, 'triangle', 0.06);
    },
    seal() {
      const chord = themePart === 3
        ? [659.25, 880, 1046.5, 1318.5, 1567.98]
        : themePart === 2
        ? [587.33, 739.99, 880, 1174.66, 1479.98]
        : [523.25, 659.25, 783.99, 1046.5, 1318.5];
      chord.forEach((f, i) => tone(f, 0.34, 'triangle', 0.08, i * 0.09));
    },
    transform() {
      this.seal();
    }
  };
})();

/* ----------------------------------------------------------------------------
 * 5. 3부작 무퇴보 연속 성장 곡선 · 의상(1부 9 + 2부 2 + 3부 4) · 친밀도 상한
 * --------------------------------------------------------------------------*/
export const Rules = {
  TRUST_CAPS: { 1: 5, 2: 10, 3: 15 },

  /** 제1부 4막 단계 개방형 스토리 진행 규칙 */
  PART1_ACTS: {
    act1: ['fly'],
    act2: ['wood', 'jump', 'shield', 'flower', 'illusion', 'shadow'],
    act3: ['watery', 'thunder', 'mirror', 'sword', 'maze', 'erase', 'glow', 'firey'],
    act4Pair: ['dark', 'light'],
    act4Final: ['earthy']
  },

  /** 프롤로그 ~ 첫 플라이 봉인 직전 기본 착용하는 초등학교 교복 정의 */
  SCHOOL_UNIFORM: {
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
    reformedPassive: '단정한 평상복 (마법 보정 없음)',
    tomoyoQuote: '평소 입는 교복도 정말 귀엽지만, 카드 봉인 때는 역시 제가 정성껏 지어 드린 배틀 의상이 최고랍니다!'
  },

  clampTrust(value, part = 1) {
    const cap = this.TRUST_CAPS[part] || 10;
    return Utils.clamp(Math.floor(Number(value) || 0), 0, cap);
  },

  DEFAULT_COSTUMES_P1: [
    {
      id: 'school_uniform', name: '🎒 초등학교 교복', icon: '🎒', unlockType: 'default', unlockHint: '기본 복장',
      dressColor: '#1e293b', accentColor: '#ffffff', hatType: 'uniform', hatColor: '#1e293b',
      passive: '단정한 평상복 (마법 보정 없음)',
      reformedPassive: '단정한 평상복 (마법 보정 없음)',
      tomoyoQuote: '평소 입는 교복도 정말 귀엽지만, 카드 봉인 때는 역시 제가 정성껏 지어 드린 배틀 의상이 최고랍니다!'
    },
    {
      id: 'sakura_dress', name: '🌸 벚꽃 배틀 드레스', icon: '🌸', unlockType: 'card', unlockCard: 'fly', unlockHint: '플라이 봉인 후 토모요 합류 시 선물',
      dressColor: '#f472b6', accentColor: '#fff1f2', hatType: 'beret', hatColor: '#f43f5e',
      passive: '최대 MP +5',
      reformedPassive: '★별빛 리폼: 최대 MP +12 · 마법 위력 +5%',
      tomoyoQuote: '사쿠라의 첫 비행을 기념해 정성껏 지은 분홍빛 첫 배틀 의상이에요!'
    },
    {
      id: 'frog_rain', name: '🐸 개구리 우비 슈트', icon: '🐸', unlockType: 'card', unlockCard: 'watery', unlockHint: '워터리 봉인 시 해금',
      dressColor: '#4ade80', accentColor: '#fef08a', hatType: 'frog', hatColor: '#22c55e',
      passive: '물·바람 피해 25% 경감 · 필드 물결 밀림 면역',
      reformedPassive: '★별빛 리폼: 물·바람 피해 32% 경감 · 최대 HP +5 · 물결/폭우 면역',
      tomoyoQuote: '비 오는 날에도 끄떡없는 개구리 후드 우비와 노란 장화랍니다!'
    },
    {
      id: 'cat_thunder', name: '🐱 고양이 귀 번개 슈트', icon: '🐱', unlockType: 'card', unlockCard: 'thunder', unlockHint: '선더 봉인 시 해금',
      dressColor: '#1e1b4b', accentColor: '#facc15', hatType: 'cat', hatColor: '#1e1b4b',
      passive: '마법 공격 위력 +10% · 번개/화염 피해 20% 경감',
      reformedPassive: '★별빛 리폼: 마법 공격 위력 +16% · 번개/화염 피해 28% 경감',
      tomoyoQuote: '고양이 귀 후드와 노란 리본! 전기가 통하지 않는 특수 마법 천으로 지었답니다!'
    },
    {
      id: 'sky_wing', name: '🪽 하늘빛 날개 드레스', icon: '🪽', unlockType: 'cards_all', unlockCards: ['fly', 'jump'], unlockHint: '플라이 + 점프 봉인 시 해금',
      dressColor: '#38bdf8', accentColor: '#ffffff', hatType: 'wing', hatColor: '#e0f2fe',
      passive: '필드 이동 속도 +12% · 봉인/공명 판정 여유 +4%',
      reformedPassive: '★별빛 리폼: 필드 이동 속도 +16% · 봉인/공명 판정 여유 +7%',
      tomoyoQuote: '하늘을 가르는 순백의 프릴과 날개 리본이에요! 발걸음도 한결 가벼워질 거예요!'
    },
    {
      id: 'alice_maid', name: '🎀 앨리스 메이드 드레스', icon: '🎀', unlockType: 'cards_any', unlockCards: ['mirror', 'flower'], unlockHint: '미러 또는 플라워 봉인 시 해금',
      dressColor: '#2563eb', accentColor: '#ffffff', hatType: 'ribbon', hatColor: '#f8fafc',
      passive: '회복(플라워·글로우·라이트) 효과 +25%',
      reformedPassive: '★별빛 리폼: 회복 효과 +38% · 최대 MP +8',
      tomoyoQuote: '파란 드레스에 순백의 앞치마와 큰 리본! 치유의 마력이 더욱 포근하게 퍼진답니다!'
    },
    {
      id: 'pierrot_magic', name: '🃏 피에로 매직 슈트', icon: '🃏', unlockType: 'cards_all', unlockCards: ['illusion', 'maze'], unlockHint: '일루전 + 메이즈 봉인 시 해금',
      dressColor: '#7e22ce', accentColor: '#fde047', hatType: 'jester', hatColor: '#a855f7',
      passive: '치명타(1.3배 피해) 확률 20% 발생',
      reformedPassive: '★별빛 리폼: 치명타(1.35배 피해) 확률 28% 발생',
      tomoyoQuote: '금빛 방울이 달린 장난스러운 어릿광대 슈트예요! 상대를 깜짝 놀라게 할 일격이 터질 거예요!'
    },
    {
      id: 'star_royal', name: '👑 황혼 로열 드레스', icon: '👑', unlockType: 'owned_count', unlockCount: 12, unlockHint: '크로우 카드 12장 이상 보유 시 해금',
      dressColor: '#be185d', accentColor: '#fde047', hatType: 'crown', hatColor: '#fde047',
      passive: '전투 매 턴 MP +4 자동 회복',
      reformedPassive: '★별빛 리폼: 전투 매 턴 MP +7 자동 회복',
      tomoyoQuote: '해와 달이 어우러지는 황혼을 금빛 실로 수놓은 특별 의상이에요!'
    },
    {
      id: 'pure_angel', name: '🕊 순백의 천사 드레스', icon: '🕊', unlockType: 'boss_clear', unlockHint: '달의 심판자 유에 격파 시 해금',
      dressColor: '#f8fafc', accentColor: '#fde047', hatType: 'halo', hatColor: '#fef08a',
      passive: '최대 HP +10 · 최대 MP +15 · 모든 공격 +12%',
      reformedPassive: '★별빛 리폼: 최대 HP +15 · 최대 MP +22 · 모든 공격 +18%',
      tomoyoQuote: '새로운 크로우 카드의 주인님께 바치는 순백의 천사 드레스예요! 정말 눈부셔요!'
    }
  ],

  /** 제2부 전용 신규 의상 2벌 */
  DEFAULT_COSTUMES_P2_EXTRA: [
    {
      id: 'star_opening', name: '⭐ 별빛 오프닝 드레스', icon: '⭐', unlockType: 'default', unlockHint: '새 학기 별의 지팡이 각성 기념 지급',
      dressColor: '#db2777', accentColor: '#fef08a', hatType: 'beret', hatColor: '#fbcfe8',
      passive: '최대 MP +10 · 마법 위력 +8% · 3키 공명 시간 여유',
      reformedPassive: '최대 MP +10 · 마법 위력 +8% · 3키 공명 시간 여유',
      tomoyoQuote: '별의 지팡이와 새 학기를 기념해 밤새워 지은 반짝이는 분홍 별빛 드레스예요!'
    },
    {
      id: 'eclipse_cape', name: '🌙 흑백 성좌 케이프', icon: '🌙', unlockType: 'incident', unlockIncident: 'inc_ruby', unlockHint: '스피넬 썬 · 루비 문 시련 돌파 시 해금',
      dressColor: '#1e1b4b', accentColor: '#f472b6', hatType: 'crown', hatColor: '#38bdf8',
      passive: '전투 매 턴 MP +5 · 치명타 확률 22% · 모든 공격 +10%',
      reformedPassive: '전투 매 턴 MP +5 · 치명타 확률 22% · 모든 공격 +10%',
      tomoyoQuote: '검은 태양과 붉은 달의 대결에서 영감을 받아 지은 신비로운 성좌 망토 의상이에요!'
    }
  ],

  /** 제3부 전용 신규 의상 4벌 */
  DEFAULT_COSTUMES_P3_EXTRA: [
    {
      id: 'mschool_uniform', name: '🎀 중학교 세일러 교복', icon: '🎀', unlockType: 'default', unlockHint: '중학교 입학 기본 복장',
      dressColor: '#0f172a', accentColor: '#f8fafc', hatType: 'uniform_mid', hatColor: '#e11d48',
      passive: '단정한 중학교 교복 (마법 보정 없음)',
      reformedPassive: '단정한 중학교 교복 (마법 보정 없음)',
      tomoyoQuote: '중학생이 되신 사쿠라의 교복 모습도 정말 사랑스러워요!'
    },
    {
      id: 'crystal_dream', name: '💎 크리스탈 드림 드레스', icon: '💎', unlockType: 'card', unlockCard: 'gale', unlockHint: '첫 클리어 카드 게일 고착 후 토모요 선물',
      dressColor: '#38bdf8', accentColor: '#fef08a', hatType: 'crystal', hatColor: '#bae6fd',
      passive: '클리어 마법 위력 +12% · 최대 MP +15',
      reformedPassive: '클리어 마법 위력 +12% · 최대 MP +15',
      tomoyoQuote: '투명하게 반짝이는 꿈의 지팡이에 맞춰 하늘빛 크리스탈 프릴로 지어 보았답니다!'
    },
    {
      id: 'clockwork_wonder', name: '🕰 클락워크 원더 드레스', icon: '🕰', unlockType: 'clear_count', unlockCount: 12, unlockHint: '클리어 카드 12장 이상 고착 시 해금',
      dressColor: '#4338ca', accentColor: '#fde047', hatType: 'crown', hatColor: '#fef08a',
      passive: '받는 피해 15% 경감 · 프리즘 락 판정 여유 +6%',
      reformedPassive: '받는 피해 15% 경감 · 프리즘 락 판정 여유 +6%',
      tomoyoQuote: '황금 시계 장식을 수놓은 신비로운 드레스예요!'
    },
    {
      id: 'prism_snow', name: '❄️ 프리즘 스노우 케이프', icon: '❄️', unlockType: 'clear_count', unlockCount: 22, unlockHint: '클리어 카드 22장 이상 고착 시 해금',
      dressColor: '#e0f2fe', accentColor: '#f472b6', hatType: 'halo', hatColor: '#7dd3fc',
      passive: '매 턴 MP +8 자동 회복 · 모든 공격 +18%',
      reformedPassive: '매 턴 MP +8 자동 회복 · 모든 공격 +18%',
      tomoyoQuote: '눈꽃처럼 투명하면서도 따뜻한 빛을 품은 최고 걸작 케이프랍니다!'
    }
  ],

  /**
   * 3부작 연속 무퇴보 성장 곡선
   * - 제1부: HP 100 -> 120 / MP 100 -> 208 (장당 +6) / 배율 1.00 -> 1.58
   * - 제2부: HP 120 -> 145 / MP 210 -> 324 (장당 +6) / 배율 1.55 -> 2.15
   * - 제3부: HP 145 -> 175 / MP 325 -> 480 (31장 장당 +5) / 배율 2.10 -> 3.03
   */
  calcStats({ part = 1, progressCount = 0, total = 19, costumeId = 'sakura_dress', isReformed = false, part1Linked = false, progCfg = null }) {
    const bonus = this.getCostumeBonuses(costumeId, isReformed);
    const ratio = Utils.clamp(progressCount / Math.max(1, total - (part === 1 ? 1 : 0)), 0, 1);

    if (part === 3) {
      const startHp = Math.max(145, progCfg?.startHp ?? 145);
      const maxHpCap = Math.max(175, progCfg?.maxHp ?? 175);
      const baseMp = Math.max(325, progCfg?.baseMp ?? 325);
      const mpPer = progCfg?.mpPerCard ?? 5;
      return {
        lv: 1 + progressCount,
        maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio) + (bonus.hpBonus || 0),
        maxMp: baseMp + progressCount * mpPer + (bonus.mpBonus || 0),
        mult: 2.10 + progressCount * 0.03
      };
    }

    if (part === 2) {
      const startHp = Math.max(120, progCfg?.startHp ?? 120);
      const maxHpCap = Math.max(145, progCfg?.maxHp ?? 145);
      const baseMp = Math.max(210, progCfg?.baseMp ?? 210);
      const mpPer = Math.max(6, progCfg?.mpPerCard ?? 6);
      const linkMp = part1Linked ? 12 : 0;
      return {
        lv: 1 + progressCount,
        maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio) + (bonus.hpBonus || 0),
        maxMp: baseMp + progressCount * mpPer + linkMp + (bonus.mpBonus || 0),
        mult: 1.55 + progressCount * 0.032
      };
    }

    const startHp = Math.max(100, progCfg?.startHp ?? 100);
    const maxHpCap = Math.max(120, progCfg?.maxHp ?? 120);
    const baseMp = Math.max(100, progCfg?.baseMp ?? 100);
    const mpPer = 6;
    return {
      lv: 1 + progressCount,
      maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio) + (bonus.hpBonus || 0),
      maxMp: baseMp + progressCount * mpPer + (bonus.mpBonus || 0),
      mult: 1.0 + progressCount * 0.032
    };
  },

  getCostumeBonuses(costumeId, isReformed = false) {
    const base = {
      hpBonus: 0, mpBonus: 0, magicMult: 1.0, allAtkMult: 1.0,
      allDmgResist: 1.0, elemResist: 1.0, waterWindResist: 1.0, waterPushImmune: false,
      healMult: 1.0, critChance: 0, critMult: 1.3,
      speedMult: 1.0, sealZoneBonus: 0, turnMpRegen: 0
    };
    switch (costumeId) {
      case 'school_uniform':
      case 'mschool_uniform':
        return { ...base };
      case 'sakura_dress':
        return isReformed
          ? { ...base, mpBonus: 12, magicMult: 1.05 }
          : { ...base, mpBonus: 5 };
      case 'frog_rain':
        return isReformed
          ? { ...base, hpBonus: 5, waterWindResist: 0.68, waterPushImmune: true }
          : { ...base, waterWindResist: 0.75, waterPushImmune: true };
      case 'cat_thunder':
        return isReformed
          ? { ...base, magicMult: 1.16, elemResist: 0.72 }
          : { ...base, magicMult: 1.10, elemResist: 0.80 };
      case 'sky_wing':
        return isReformed
          ? { ...base, speedMult: 1.16, sealZoneBonus: 7 }
          : { ...base, speedMult: 1.12, sealZoneBonus: 4 };
      case 'alice_maid':
        return isReformed
          ? { ...base, mpBonus: 8, healMult: 1.38 }
          : { ...base, healMult: 1.25 };
      case 'pierrot_magic':
        return isReformed
          ? { ...base, critChance: 0.28, critMult: 1.35 }
          : { ...base, critChance: 0.20, critMult: 1.30 };
      case 'star_royal':
        return isReformed
          ? { ...base, turnMpRegen: 7 }
          : { ...base, turnMpRegen: 4 };
      case 'pure_angel':
        return isReformed
          ? { ...base, hpBonus: 15, mpBonus: 22, magicMult: 1.18, allAtkMult: 1.18 }
          : { ...base, hpBonus: 10, mpBonus: 15, magicMult: 1.12, allAtkMult: 1.12 };
      case 'star_opening':
        return { ...base, mpBonus: 10, magicMult: 1.08, sealZoneBonus: 3 };
      case 'eclipse_cape':
        return { ...base, turnMpRegen: 5, critChance: 0.22, critMult: 1.32, allAtkMult: 1.10 };
      case 'crystal_dream':
        return { ...base, mpBonus: 15, magicMult: 1.12 };
      case 'clockwork_wonder':
        return { ...base, allDmgResist: 0.85, sealZoneBonus: 6 };
      case 'prism_snow':
        return { ...base, turnMpRegen: 8, allAtkMult: 1.18, magicMult: 1.12 };
      default:
        return { ...base };
    }
  },

  getCostumePassiveLabel(costume, isReformed = false) {
    if (!costume) return '';
    if (isReformed && costume.reformedPassive) return costume.reformedPassive;
    return costume.passive || '';
  },

  isCostumeUnlocked(costume, ctx) {
    if (!costume) return false;
    if (ctx.unlockedCostumes?.has?.(costume.id)) return true;
    const t = costume.unlockType;
    if (t === 'default') return true;
    if (t === 'card') {
      return !!(
        ctx.ownedCards?.has(costume.unlockCard) ||
        ctx.sakuraCards?.has(costume.unlockCard) ||
        ctx.clearCards?.has(costume.unlockCard)
      );
    }
    if (t === 'cards_all') return Utils.toArr(costume.unlockCards).every((id) => ctx.ownedCards?.has(id));
    if (t === 'cards_any') return Utils.toArr(costume.unlockCards).some((id) => ctx.ownedCards?.has(id));
    if (t === 'owned_count') return (ctx.ownedCards?.size || 0) >= (costume.unlockCount || 12);
    if (t === 'boss_clear') return !!ctx.bossCleared;
    if (t === 'card_or_p1') return !!(ctx.part1Linked || ctx.sakuraCards?.has(costume.unlockCard));
    if (t === 'incident') return !!ctx.clearedIncidents?.has(costume.unlockIncident);
    if (t === 'sakura_count') return (ctx.sakuraCards?.size || 0) >= (costume.unlockCount || 5);
    if (t === 'clear_count') return (ctx.clearCards?.size || 0) >= (costume.unlockCount || 12);
    return false;
  }
};

/* ----------------------------------------------------------------------------
 * 6. Firebase RTDB 공용 데이터·아트 로더 & 무마찰 4중 보안 멀티 세이브 클라우드
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

const LOCAL_SLOTS_KEY = 'sakura_trilogy_local_slots';
const app = initializeApp(FIREBASE_CFG);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
const db = getDatabase(app);

let authReadyPromise = null;

const contentCache = {
  artLoaded: false,
  art: { avatars: null, buildings: null, clow: null, sakura: null, clear: null },
  parts: {}
};

function sanitizeId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[.#$\[\]\/]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 24);
}

function sanitizeSecret(raw) {
  return String(raw || '').trim().slice(0, 16);
}

function sanitizeSlotKey(key) {
  const valid = SAVE_SLOTS.some((s) => s.key === key);
  return valid ? key : 'auto';
}

function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('서버 응답 시간 초과')), ms))
  ]);
}

function ensureAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!authReadyPromise) {
    authReadyPromise = withTimeout(signInAnonymously(auth), 12000)
      .then((cred) => cred.user)
      .catch((err) => {
        authReadyPromise = null;
        throw new Error(`인증 세션 발급 실패: ${err.message}`);
      });
  }
  return authReadyPromise;
}

async function computeSecretHash(cid, inputSec) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('보안 연결(HTTPS) 환경에서만 클라우드 계정을 이용할 수 있습니다.');
  }
  const encoded = new TextEncoder().encode(`sakura_secret_v1:${cid}:${inputSec}`);
  const buf = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySecret(cid, inputSec, playerVal) {
  const hashKey = await computeSecretHash(cid, inputSec);
  const hashRef = ref(db, `sakura/secrets/${cid}/${hashKey}`);
  const hashSnap = await withTimeout(get(hashRef));
  if (hashSnap.exists() && hashSnap.val() === true) {
    return { ok: true, hashKey };
  }

  const legacySec = playerVal && playerVal.secret != null ? String(playerVal.secret) : '';
  const legacyPin = playerVal && playerVal.pin != null ? String(playerVal.pin) : '';
  if ((legacySec && legacySec === inputSec) || (legacyPin && legacyPin === inputSec)) {
    await withTimeout(set(hashRef, true));
    await withTimeout(update(ref(db, `sakura/players/${cid}`), {
      secret: null,
      pin: null,
      authMode: 'secrets'
    }));
    return { ok: true, hashKey };
  }

  return { ok: false, hashKey };
}

async function fetchNode(path, required = true) {
  await ensureAuth();
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
  sanitizeSlotKey,
  ensureAuth,

  /** 공용 아트 병렬 프리로드 (3부 분할 노드 cards_clear_a + cards_clear_b 자동 병합) */
  async ensureSharedArt(includeSakura = true, includeClear = false) {
    await ensureAuth();
    const tasks = [];
    if (!contentCache.art.avatars) {
      tasks.push(fetchNode('sakura/content/art/avatars', true).then((v) => { contentCache.art.avatars = v; }));
    }
    if (!contentCache.art.buildings) {
      tasks.push(fetchNode('sakura/content/art/buildings', true).then((v) => { contentCache.art.buildings = v; }));
    }
    if (!contentCache.art.clow) {
      tasks.push(fetchNode('sakura/content/art/cards_clow', true).then((v) => { contentCache.art.clow = v; }));
    }
    if (includeSakura && !contentCache.art.sakura) {
      tasks.push(fetchNode('sakura/content/art/cards_sakura', false).then((v) => { contentCache.art.sakura = v || {}; }));
    }
    if (includeClear && !contentCache.art.clear) {
      tasks.push(
        Promise.all([
          fetchNode('sakura/content/art/cards_clear_a', false),
          fetchNode('sakura/content/art/cards_clear_b', false),
          fetchNode('sakura/content/art/cards_clear', false)
        ]).then(([a, b, legacy]) => {
          const base = a || legacy || {};
          contentCache.art.clear = {
            frameTemplate: base.frameTemplate || '',
            spiritTemplate: base.spiritTemplate || '',
            cards: { ...(legacy?.cards || {}), ...(a?.cards || {}), ...(b?.cards || {}) },
            bosses: { ...(legacy?.bosses || {}), ...(a?.bosses || {}), ...(b?.bosses || {}) }
          };
        })
      );
    }
    if (tasks.length) await Promise.all(tasks);
    Art.setRawArt(contentCache.art);
    contentCache.artLoaded = true;
    return contentCache.art;
  },

  /** 특정 막(1 | 2 | 3) 데이터 + 공용 아트 번들 로드 (3부는 part3 + part3_late 자동 병합!) */
  async loadBundle(part = 1) {
    await ensureAuth();
    let dataPromise;
    if (contentCache.parts[part]) {
      dataPromise = Promise.resolve(contentCache.parts[part]);
    } else if (part === 3) {
      dataPromise = Promise.all([
        fetchNode('sakura/content/part3', true),
        fetchNode('sakura/content/part3_late', false)
      ]).then(([early, late]) => {
        const merged = {
          ...early,
          cardOrder: [...Utils.toArr(early.cardOrder), ...Utils.toArr(late?.cardOrderLate)],
          acts: {
            ...(early.actsEarly || {}),
            ...(late?.actsLate || {})
          },
          cards: { ...(early.cards || {}), ...(late?.cards || {}) },
          bossClear: late?.bossClear || early.bossClear || null,
          dialogues: { ...(early.dialogues || {}), ...(late?.dialogues || {}) }
        };
        contentCache.parts[3] = merged;
        return merged;
      });
    } else {
      dataPromise = fetchNode(`sakura/content/part${part}`, true).then((v) => {
        contentCache.parts[part] = v;
        return v;
      });
    }

    const [, data] = await Promise.all([
      this.ensureSharedArt(part >= 2, part >= 3),
      dataPromise
    ]);
    return { data, art: contentCache.art };
  },

  /* ---- 로컬 게스트 멀티 슬롯 관리 ---- */
  getLocalSlots() {
    const raw = SafeStore.getJSON(LOCAL_SLOTS_KEY, {});
    return raw && typeof raw === 'object' ? raw : {};
  },
  saveLocalSlot(slotKey, snapshot) {
    const sk = sanitizeSlotKey(slotKey);
    const all = this.getLocalSlots();
    all[sk] = { ...snapshot, slotKey: sk, savedAt: snapshot.savedAt || Date.now() };
    SafeStore.setJSON(LOCAL_SLOTS_KEY, all);
    return all[sk];
  },
  deleteLocalSlot(slotKey) {
    const sk = sanitizeSlotKey(slotKey);
    const all = this.getLocalSlots();
    delete all[sk];
    SafeStore.setJSON(LOCAL_SLOTS_KEY, all);
    return all;
  },

  getLatestSlot(slotsObj) {
    if (!slotsObj || typeof slotsObj !== 'object') return null;
    let best = null;
    for (const s of SAVE_SLOTS) {
      const rec = slotsObj[s.key];
      if (!rec || typeof rec !== 'object') continue;
      if (!best || (rec.savedAt || 0) > (best.savedAt || 0)) {
        best = { ...rec, slotKey: s.key };
      }
    }
    return best;
  },

  /* ---- Firebase 단일 경로(/sakura/players/{id}) + 무유출 secrets 계정 ---- */
  async loginAccount(rawId, rawSecret) {
    await ensureAuth();
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요. (한글·영문·숫자 자유 입력)');
    if (sec.length < 4) throw new Error('비밀번호는 4자 이상 입력해 주세요.');

    const accRef = ref(db, `sakura/players/${cid}`);
    const snap = await withTimeout(get(accRef));
    if (snap.exists()) {
      const val = snap.val();
      const verified = await verifySecret(cid, sec, val);
      if (!verified.ok) {
        throw new Error('이미 등록된 아이디입니다. 비밀번호가 일치하지 않습니다.');
      }
      return {
        status: 'logged_in',
        id: cid,
        secret: sec,
        slots: (val.slots && typeof val.slots === 'object') ? val.slots : {}
      };
    }

    const now = Date.now();
    const hashKey = await computeSecretHash(cid, sec);
    await withTimeout(set(ref(db, `sakura/secrets/${cid}/${hashKey}`), true));
    await withTimeout(set(accRef, {
      playerId: cid,
      authMode: 'secrets',
      createdAt: now,
      updatedAt: now
    }));
    return {
      status: 'registered',
      id: cid,
      secret: sec,
      slots: {}
    };
  },

  async fetchAccountSlots(rawId, rawSecret) {
    await ensureAuth();
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요.');
    const snap = await withTimeout(get(ref(db, `sakura/players/${cid}`)));
    if (!snap.exists()) return {};
    const val = snap.val();
    const verified = await verifySecret(cid, sec, val);
    if (!verified.ok) throw new Error('비밀번호가 일치하지 않습니다.');
    return (val.slots && typeof val.slots === 'object') ? val.slots : {};
  },

  async saveSlot(rawId, rawSecret, slotKey, snapshot) {
    await ensureAuth();
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    const sk = sanitizeSlotKey(slotKey);
    if (!cid) throw new Error('아이디를 입력해 주세요.');
    if (sec.length < 4) throw new Error('비밀번호는 4자 이상 입력해 주세요.');

    const accRef = ref(db, `sakura/players/${cid}`);
    const snap = await withTimeout(get(accRef));
    if (snap.exists()) {
      const verified = await verifySecret(cid, sec, snap.val());
      if (!verified.ok) throw new Error('비밀번호가 일치하지 않습니다.');
    } else {
      const hashKey = await computeSecretHash(cid, sec);
      await withTimeout(set(ref(db, `sakura/secrets/${cid}/${hashKey}`), true));
    }

    const now = Date.now();
    const record = {
      ...snapshot,
      slotKey: sk,
      savedAt: now
    };
    await withTimeout(update(accRef, {
      playerId: cid,
      authMode: 'secrets',
      secret: null,
      pin: null,
      updatedAt: now,
      [`slots/${sk}`]: record
    }));
    return record;
  },

  async deleteSlot(rawId, rawSecret, slotKey) {
    await ensureAuth();
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    const sk = sanitizeSlotKey(slotKey);
    if (!cid) throw new Error('아이디를 입력해 주세요.');

    const accRef = ref(db, `sakura/players/${cid}`);
    const snap = await withTimeout(get(accRef));
    if (!snap.exists()) throw new Error('계정 정보를 찾을 수 없습니다.');
    const verified = await verifySecret(cid, sec, snap.val());
    if (!verified.ok) throw new Error('비밀번호가 일치하지 않습니다.');

    await withTimeout(remove(ref(db, `sakura/players/${cid}/slots/${sk}`)));
    return sk;
  },

  async deleteAccount(rawId, rawSecret) {
    await ensureAuth();
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요.');

    const accRef = ref(db, `sakura/players/${cid}`);
    const snap = await withTimeout(get(accRef));
    if (!snap.exists()) throw new Error('삭제할 계정이 없습니다.');
    const verified = await verifySecret(cid, sec, snap.val());
    if (!verified.ok) throw new Error('비밀번호가 일치하지 않습니다.');

    await Promise.all([
      withTimeout(remove(accRef)),
      withTimeout(remove(ref(db, `sakura/secrets/${cid}`)))
    ]);
    return cid;
  }
};

export const SakuraCore = { VERSION, SAVE_SLOTS, SafeStore, Timers, Utils, Locale, Art, SoundFX, Rules, Cloud };
window.SakuraCore = SakuraCore;
