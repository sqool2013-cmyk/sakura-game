/**
 * ============================================================================
 * 카드캡터 3부작 공용 코어 엔진 (core.js) — v.0.2.0
 * - 버전 표기 규칙: 주요 판올림 v.0.2.0 / 버그 수정 시 -b, -c 접미사 부착
 * - Firebase RTDB 데이터·아트 병렬 로더 및 명확한 계정 로그인/등록 모듈
 * - 원작명판(사쿠라·토모요) <-> 국내 번안판(체리·지수) 실시간 전환 & 공식 주문
 * - 6종 표정 오버레이 합성 & 2D 캔버스용 건물 스프라이트 캐싱
 * - Web Audio 오르골 BGM & 효과음 / 8벌 마법 의상실 패시브 & 성장 곡선 규칙
 * ============================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, set, get, remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

export const VERSION = {
  engine: 'v.0.2.0',
  part1: 'v.0.2.0',
  part2: 'v.0.1.0'
};

/* ----------------------------------------------------------------------------
 * 1. 안전 스토리지 & 중앙 타이머 & 기본 유틸리티
 * --------------------------------------------------------------------------*/
// ... existing code ...
  /** 단어 끝 받침에 맞는 조사 자동 부착 (예: '과/와', '이/가', '은/는', '을/를') */
  withParticle(word, pair = '과/와') {
    if (!word) return '';
    const [withB, withoutB] = pair.split('/');
    return word + (this.hasBatchim(word) ? withB : withoutB);
  },
  /** TVA 스타일 괄호 없는 단일 호칭 (예: '플라이', '윈디') */
  cardName(c) {
    return c ? (c.read || c.kr || '') : '';
  },
  /** 간결한 카드 표시용 텍스트 */
  cardRuby(c) {
    return c ? (c.read || c.kr || '') : '';
  }
};

/* ----------------------------------------------------------------------------
 * 2. 원작명판(orig: 사쿠라) <-> 국내 공식 번안판(kr: 체리) 자동 변환 엔진
 *    - 받침이 달라지는 인물/지명의 한국어 조사 자동 교정
 *    - 구버전 JSON의 괄호 카드명(예: 바람(윈디))을 단일 호칭(윈디)으로 자동 정제
 *    - 공식 검증된 1·2부 봉인/변환 주문 4행 줄맞춤 제공
 * --------------------------------------------------------------------------*/
export const Locale = (() => {
  const STORE_KEY = 'sakura_locale_mode';
  let mode = SafeStore.get(STORE_KEY, 'orig') === 'kr' ? 'kr' : 'orig';
  const listeners = new Set();

  // 구버전 JSON 호환용: '바람(윈디)' -> '윈디' 자동 정제 패턴
  const CARD_PAREN_RE = /(바람|비행|나무|방패|도약|거울|꽃|번개|미궁|그림자|환상|검|땅|소멸|물|등불|불|어둠|빛)\((윈디|플라이|우드|실드|점프|미러|플라워|선더|메이즈|섀도|일루전|소드|어시|이레이즈|워터리|글로우|파이어리|다크|라이트)\)/g;

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
    ['신사 경내', '월봉사 경내'],
    ['신사 뒤편 동굴', '월봉사 뒤편 동굴'],
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
    ['레리즈', '봉인 해제'],
    ['나쿠루', '류미호'],
    ['사쿠라', '체리'],
    ['토모요', '지수']
  ];

  // 공식 검증 봉인 / 변환 주문 (원작명판 vs 국내 번안판)
  const OFFICIAL_CHANTS = {
    seal_p1: {
      orig: '어둠의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라.\n계약 아래 사쿠라가 명한다, 레리즈!\n그대의 본래 모습으로 돌아가라, 크로우 카드!',
      kr: '어둠의 힘을 지니고 있는 열쇠여,\n진정한 모습으로 내 앞에 나타나라.\n너와의 계약에 따라 체리가 명한다, 봉인 해제!\n너의 본 모습으로 돌아갈 것을 명한다, 크로우 카드!'
    },
    yue_p1: {
      orig: '어둠의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라.\n계약 아래 사쿠라가 명한다, 레리즈!\n유에 씨와 모두를 지키는 새로운 주인이 될게요!',
      kr: '어둠의 힘을 지니고 있는 열쇠여,\n진정한 모습으로 내 앞에 나타나라.\n너와의 계약에 따라 체리가 명한다, 봉인 해제!\n유에 씨와 모두를 지키는 새로운 주인이 될게요!'
    },
    transform_p2: {
      orig: '별의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라.\n계약 아래 사쿠라가 명한다, 레리즈!\n크로우가 만들어 낸 카드여, 낡은 모습을 버리고 새롭게 태어나라.\n너의 새로운 주인, 사쿠라의 이름 아래!',
      kr: '별의 힘을 지니고 있는 열쇠여,\n진정한 모습으로 내 앞에 나타나라.\n너와의 계약에 따라 체리가 명한다, 봉인 해제!\n크로우가 만들어 낸 카드여, 낡은 모습을 벗어버리고 새롭게 태어나라.\n너의 새로운 주인, 체리의 이름 아래서!'
    },
    dual_p2: {
      orig: '별의 힘을 감춘 열쇠여,\n진정한 모습을 내 앞에 보여라.\n어둠과 빛이여, 낡은 모습을 버리고 새롭게 태어나라.\n너의 새로운 주인, 사쿠라의 이름 아래!',
      kr: '별의 힘을 지니고 있는 열쇠여,\n진정한 모습으로 내 앞에 나타나라.\n어둠과 빛이여, 낡은 모습을 벗어버리고 새롭게 태어나라.\n너의 새로운 주인, 체리의 이름 아래서!'
    }
  };

  const PARTICLE_MAP = {
// ... existing code ...
    out = out.replace(/청명(이|은|을|과)가/g, '청명이');
    out = out.replace(/카드캡터:\s*(황혼|별빛|꿈결)의\s*우수 마을/g, '카드캡터 체리: $1의 우수 마을');
    return out;
  }

  function cleanCardParens(input) {
    if (typeof input !== 'string' || !input) return input;
    return input
      .replace(CARD_PAREN_RE, '$2')
      .replace(/레리즈\(해방\)/g, '레리즈');
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
    /** 공식 고증 4~5행 영창 주문 반환 (seal_p1 | yue_p1 | transform_p2 | dual_p2) */
    getChant(kind = 'seal_p1') {
      const entry = OFFICIAL_CHANTS[kind] || OFFICIAL_CHANTS.seal_p1;
      return mode === 'kr' ? entry.kr : entry.orig;
    },
    setMode(next) {
      const clean = next === 'kr' ? 'kr' : 'orig';
// ... existing code ...
export const Art = (() => {
  let rawArt = { avatars: {}, buildings: {}, clow: {}, sakura: {} };
  const buildingCache = {};

  // 6종 상황별 표정 오버레이 레이어 (JSON 표정 데이터가 없을 때도 즉시 생동감 표현)
  const MOOD_OVERLAYS = {
    happy: `<g class="mood-layer"><circle cx="24" cy="28" r="3" fill="#fef08a"/><path d="M132 22 L135 30 L143 33 L135 36 L132 44 L129 36 L121 33 L129 30 Z" fill="#fef08a"/><ellipse cx="52" cy="94" rx="8" ry="4" fill="#fb7185" opacity="0.35"/><ellipse cx="108" cy="94" rx="8" ry="4" fill="#fb7185" opacity="0.35"/></g>`,
    shock: `<g class="mood-layer"><g stroke="#fef08a" stroke-width="2.4" stroke-linecap="round" opacity="0.88"><line x1="12" y1="16" x2="28" y2="30"/><line x1="148" y1="16" x2="132" y2="30"/><line x1="10" y1="54" x2="24" y2="58"/><line x1="150" y1="54" x2="136" y2="58"/></g><path d="M126 48 Q134 62 126 70 Q118 62 126 48 Z" fill="#7dd3fc" stroke="#ffffff" stroke-width="1.4"/></g>`,
    serious: `<g class="mood-layer"><rect width="160" height="160" fill="none" stroke="#f43f5e" stroke-opacity="0.45" stroke-width="6"/><path d="M18 22 L38 30 M142 22 L122 30" stroke="#fde047" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/></g>`,
    shy: `<g class="mood-layer"><ellipse cx="50" cy="92" rx="10" ry="5" fill="#fb7185" opacity="0.52"/><ellipse cx="110" cy="92" rx="10" ry="5" fill="#fb7185" opacity="0.52"/><g stroke="#f43f5e" stroke-width="1.5" opacity="0.72"><line x1="45" y1="90" x2="49" y2="95"/><line x1="51" y1="90" x2="55" y2="95"/><line x1="105" y1="90" x2="109" y2="95"/><line x1="111" y1="90" x2="115" y2="95"/></g><path d="M126 30 C126 24 134 24 134 30 C134 35 126 40 126 40 C126 40 118 35 118 30 C118 24 126 24 126 30 Z" fill="#f472b6" opacity="0.85"/></g>`,
    worried: `<g class="mood-layer"><rect width="160" height="44" fill="rgba(15,23,42,0.34)"/><path d="M128 52 Q134 64 128 70 Q122 64 128 52 Z" fill="#93c5fd" opacity="0.9"/><path d="M22 26 Q28 20 34 26 Q40 20 46 26" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.7"/></g>`
  };

  function decodeSvg(str) {
// ... existing code ...
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
    getCard(card, isSakura = false) {
// ... existing code ...
/* ----------------------------------------------------------------------------
 * 5. 성장 곡선(HP 100->115 / 105->120) & 마법 의상실 8벌 패시브 공용 규칙
 * --------------------------------------------------------------------------*/
export const Rules = {
  /** 제1부 기본 8벌 마법 의상 카탈로그 (구버전 JSON에서도 8벌 의상실 즉시 지원) */
  DEFAULT_COSTUMES_P1: [
    {
      id: 'sakura_dress', name: '🌸 벚꽃 배틀 드레스', unlockType: 'default', unlockHint: '기본 지급 의상',
      dressColor: '#f472b6', accentColor: '#fff1f2', hatType: 'beret', hatColor: '#f43f5e',
      passive: '최대 MP +5', tomoyoQuote: '황혼빛과 가장 잘 어울리는 분홍빛 기본 배틀 의상이에요!'
    },
    {
      id: 'frog_rain', name: '🐸 개구리 우비 슈트', unlockType: 'card', unlockCard: 'watery', unlockHint: '「워터리」 봉인 시 해금',
      dressColor: '#4ade80', accentColor: '#fef08a', hatType: 'frog', hatColor: '#22c55e',
      passive: '물·바람 피해 25% 경감 · 필드 물결 밀림 면역', tomoyoQuote: '비 오는 날에도 끄떡없는 개구리 후드 우비와 노란 장화랍니다!'
    },
    {
      id: 'cat_thunder', name: '🐱 고양이 귀 번개 슈트', unlockType: 'card', unlockCard: 'thunder', unlockHint: '「선더」 봉인 시 해금',
      dressColor: '#1e1b4b', accentColor: '#facc15', hatType: 'cat', hatColor: '#1e1b4b',
      passive: '마법 공격 위력 +10% · 번개/화염 피해 20% 경감', tomoyoQuote: '고양이 귀 후드와 노란 리본! 전기가 통하지 않는 특수 마법 천으로 지었답니다!'
    },
    {
      id: 'sky_wing', name: '🪽 하늘빛 날개 드레스', unlockType: 'cards_all', unlockCards: ['fly', 'jump'], unlockHint: '「플라이」 + 「점프」 봉인 시 해금',
      dressColor: '#38bdf8', accentColor: '#ffffff', hatType: 'wing', hatColor: '#e0f2fe',
      passive: '필드 이동 속도 +12% · 봉인 게이지 구역 +4%', tomoyoQuote: '하늘을 가르는 순백의 프릴과 날개 리본이에요! 발걸음도 한결 가벼워질 거예요!'
    },
    {
      id: 'alice_maid', name: '🎀 앨리스 메이드 드레스', unlockType: 'cards_any', unlockCards: ['mirror', 'flower'], unlockHint: '「미러」 또는 「플라워」 봉인 시 해금',
      dressColor: '#2563eb', accentColor: '#ffffff', hatType: 'ribbon', hatColor: '#f8fafc',
      passive: '회복(플라워·글로우·라이트) 효과 +25%', tomoyoQuote: '파란 드레스에 순백의 앞치마와 큰 리본! 치유의 마력이 더욱 포근하게 퍼진답니다!'
    },
    {
      id: 'pierrot_magic', name: '🃏 피에로 매직 슈트', unlockType: 'cards_all', unlockCards: ['illusion', 'maze'], unlockHint: '「일루전」 + 「메이즈」 봉인 시 해금',
      dressColor: '#7e22ce', accentColor: '#fde047', hatType: 'jester', hatColor: '#a855f7',
      passive: '치명타(1.3배 피해) 확률 20% 발생', tomoyoQuote: '금빛 방울이 달린 장난스러운 어릿광대 슈트예요! 상대를 깜짝 놀라게 할 일격이 터질 거예요!'
    },
    {
      id: 'star_royal', name: '👑 황혼 로열 드레스', unlockType: 'owned_count', unlockCount: 12, unlockHint: '크로우 카드 12장 이상 보유 시 해금',
      dressColor: '#be185d', accentColor: '#fde047', hatType: 'crown', hatColor: '#fde047',
      passive: '전투 매 턴 MP +4 자동 회복', tomoyoQuote: '해와 달이 어우러지는 황혼을 금빛 실로 수놓은 특별 의상이에요!'
    },
    {
      id: 'pure_angel', name: '🕊 순백의 천사 드레스', unlockType: 'boss_clear', unlockHint: '달의 심판자 유에 격파 시 해금 (2부 계승)',
      dressColor: '#f8fafc', accentColor: '#fde047', hatType: 'halo', hatColor: '#fef08a',
      passive: '최대 HP +10 · 최대 MP +15 · 모든 공격 +12%', tomoyoQuote: '새로운 크로우 카드의 주인님께 바치는 순백의 천사 드레스예요! 정말 눈부셔요!'
    }
  ],

  /**
   * 1부·2부 체력·마력·레벨 성장 곡선 계산
   * - 1부: Lv.1~19, HP 100 -> 115 (+의상 HP 보너스), MP 100 + g*14 (+의상 MP 보너스)
   * - 2부: Lv.1~20, HP 105 -> 120 (+의상 HP 보너스), MP 130 + k*9 (+1부 연동 +20 +의상 MP 보너스)
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
        maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio) + (bonus.hpBonus || 0),
        maxMp: baseMp + progressCount * mpPer + linkMp + (bonus.mpBonus || 0),
        mult: 1.05 + progressCount * 0.036
      };
    }

    const startHp = progCfg?.startHp ?? 100;
    const maxHpCap = progCfg?.maxHp ?? 115;
    const baseMp = progCfg?.baseMp ?? 100;
    const mpPer = progCfg?.mpPerCard ?? 14;
    return {
      lv: 1 + progressCount,
      maxHp: Math.round(startHp + (maxHpCap - startHp) * ratio) + (bonus.hpBonus || 0),
      maxMp: baseMp + progressCount * mpPer + (bonus.mpBonus || 0),
      mult: 1.0 + progressCount * 0.032
    };
  },

  /** 8벌 마법 의상별 전략 패시브 보너스 */
  getCostumeBonuses(costumeId) {
    const base = {
      hpBonus: 0, mpBonus: 0, magicMult: 1.0, allAtkMult: 1.0,
      elemResist: 1.0, waterWindResist: 1.0, waterPushImmune: false,
      healMult: 1.0, critChance: 0, critMult: 1.3,
      speedMult: 1.0, sealZoneBonus: 0, turnMpRegen: 0
    };
    switch (costumeId) {
      case 'frog_rain':
        return { ...base, waterWindResist: 0.75, waterPushImmune: true };
      case 'cat_thunder':
        return { ...base, magicMult: 1.10, elemResist: 0.80 };
      case 'sky_wing':
        return { ...base, speedMult: 1.12, sealZoneBonus: 4 };
      case 'alice_maid':
        return { ...base, healMult: 1.25 };
      case 'pierrot_magic':
        return { ...base, critChance: 0.20, critMult: 1.30 };
      case 'star_royal':
        return { ...base, turnMpRegen: 4 };
      case 'pure_angel':
        return { ...base, hpBonus: 10, mpBonus: 15, magicMult: 1.12, allAtkMult: 1.12 };
      default: // sakura_dress
        return { ...base, mpBonus: 5 };
    }
  },

  /** 의상 해금 조건 판정 */
  isCostumeUnlocked(costume, ctx) {
    if (!costume) return false;
    const t = costume.unlockType;
    if (t === 'default') return true;
    if (t === 'card') return !!(ctx.ownedCards?.has(costume.unlockCard) || ctx.sakuraCards?.has(costume.unlockCard));
    if (t === 'cards_all') return Utils.toArr(costume.unlockCards).every((id) => ctx.ownedCards?.has(id));
    if (t === 'cards_any') return Utils.toArr(costume.unlockCards).some((id) => ctx.ownedCards?.has(id));
    if (t === 'owned_count') return (ctx.ownedCards?.size || 0) >= (costume.unlockCount || 12);
    if (t === 'boss_clear') return !!ctx.bossCleared;
    if (t === 'card_or_p1') return !!(ctx.part1Linked || ctx.sakuraCards?.has(costume.unlockCard));
    if (t === 'incident') return !!ctx.clearedIncidents?.has(costume.unlockIncident);
    if (t === 'sakura_count') return (ctx.sakuraCards?.size || 0) >= (costume.unlockCount || 5);
    return false;
  }
};
// ... existing code ...
export const Cloud = {
  sanitizeId,
  sanitizeSecret,

  /** 원스톱 계정 로그인 또는 신규 등록 (기존 기록 있으면 자동 로드, 없으면 새 계정 생성) */
  async loginOrRegister(part, rawId, rawSecret) {
    const cid = sanitizeId(rawId);
    const sec = sanitizeSecret(rawSecret);
    if (!cid) throw new Error('아이디를 입력해 주세요. (한글·영문·숫자 자유 입력)');
    if (sec.length < 4) throw new Error('비밀번호는 4자 이상 입력해 주세요.');

    const nodeRef = ref(db, `sakura/part${part}/players/${cid}`);
    const snap = await withTimeout(get(nodeRef));
    if (snap.exists()) {
      const val = snap.val();
      if (!secretMatches(val, sec)) {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }
      return { status: 'logged_in', id: cid, secret: sec, data: val };
    }
    return { status: 'registered', id: cid, secret: sec, data: null };
  },

  /** 파트별 게임 데이터 + 공용 고퀄리티 벡터 에셋 일괄 로드 */
  async loadBundle(part = 1) {
// ... existing code ...
export const SakuraCore = { VERSION, SafeStore, Timers, Utils, Locale, Art, SoundFX, Rules, Cloud };
window.SakuraCore = SakuraCore;
