/**
 * ============================================================================
 * 카드캡터 3부작 공용 2D 월드 & 비주얼 렌더 엔진 (world.js) — v.0.2.0
 * - 제1부(황혼) · 제2부(별빛) · 제3부(꿈결) 공용 야외(town / town_p3) 및
 *   14개 실내 맵(집 · 초등학교 · 중학교 · 대저택 · 신사) 완벽 렌더링
 * - 분수대 중앙 원형 산책 데크 & 원형 충돌 판정
 * - 제1부 19종 이상 현상 + 제2부 사건 기믹/별빛 공명 + 제3부 13종 투명 크리스탈 현상
 * - 지팡이 방안 2 적용: 평상시 탐험 중 숨김, 비행/해방 시에만 봉인·별·꿈의 지팡이 출현
 * - 초등학교·중학교 교복 + 1·2·3부 전체 마법 의상 실시간 스프라이트 & 모모 전용 외형
 * ============================================================================
 */
import { Utils, Locale, Art } from './core.js';

const { toArr, clamp, cardName } = Utils;

export function createWorldEngine(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0, w: 960, h: 640 };

  // 환경 입자 (벚꽃잎 · 반딧불이 · 필드 마법 파티클)
  const petals = Array.from({ length: 52 }, () => ({
    x: Math.random() * 1800,
    y: Math.random() * 1450,
    vx: -14 - Math.random() * 16,
    vy: 18 + Math.random() * 20,
    s: 3 + Math.random() * 3.4,
    a: Math.random() * 6.28
  }));

  const fireflies = Array.from({ length: 42 }, () => ({
    x: Math.random() * 1800,
    y: Math.random() * 1450,
    r: 1.8 + Math.random() * 2.1,
    p: Math.random() * 6.28,
    sp: 1.5 + Math.random() * 2.0
  }));

  const fieldFx = [];

  /** 필드 파티클 폭발 생성 */
  function burst(x, y, color = '#fde047', count = 16) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 28 + Math.random() * 92;
      fieldFx.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 2 + Math.random() * 3,
        life: 0.72,
        max: 0.72,
        color
      });
    }
  }

  /** 방향성 별빛/크리스탈 길잡이 입자 발사 */
  function guideBeam(x, y, targetX, targetY, color = '#fef08a') {
    const ang = Math.atan2(targetY - y, targetX - x);
    for (let i = 0; i < 16; i++) {
      fieldFx.push({
        x, y,
        vx: Math.cos(ang) * (125 + i * 16),
        vy: Math.sin(ang) * (125 + i * 16),
        r: 3.5,
        life: 1.0,
        max: 1.0,
        color
      });
    }
  }

  /** 뷰포트 리사이즈 & DPR 보정 */
  function resize(stageEl, mapData, playerPos) {
    const w = Math.max(320, stageEl?.clientWidth || window.innerWidth);
    const h = Math.max(240, stageEl?.clientHeight || window.innerHeight - 60);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cam.w = w;
    cam.h = h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mapData && playerPos) snapCamera(mapData, playerPos);
    return { w, h, dpr };
  }

  /** 카메라 즉시 스냅 */
  function snapCamera(mapData, pos) {
    if (!mapData || !pos) return;
    cam.x = mapData.w <= cam.w ? -(cam.w - mapData.w) / 2 : clamp(pos.x - cam.w / 2, 0, mapData.w - cam.w);
    cam.y = mapData.h <= cam.h ? -(cam.h - mapData.h) / 2 : clamp(pos.y - cam.h / 2, 0, mapData.h - cam.h);
  }

  /** 카메라 부드러운 추적 */
  function updateCamera(dt, mapData, pos) {
    if (!mapData || !pos) return;
    const tx = mapData.w <= cam.w ? -(cam.w - mapData.w) / 2 : clamp(pos.x - cam.w / 2, 0, mapData.w - cam.w);
    const ty = mapData.h <= cam.h ? -(cam.h - mapData.h) / 2 : clamp(pos.y - cam.h / 2, 0, mapData.h - cam.h);
    cam.x += (tx - cam.x) * Math.min(1, dt * 7.2);
    cam.y += (ty - cam.y) * Math.min(1, dt * 7.2);
  }

  /** 환경 입자 프레임 업데이트 */
  function updateAmbience(dt) {
    for (const p of petals) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += dt * 2.0;
      if (p.x < -12) p.x = 1812;
      if (p.y > 1462) p.y = -12;
    }
    for (const f of fireflies) f.p += f.sp * dt;
    for (let i = fieldFx.length - 1; i >= 0; i--) {
      const fx = fieldFx[i];
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.life -= dt;
      if (fx.life <= 0) fieldFx.splice(i, 1);
    }
  }

  /**
   * 맵 경계 · 건물 · 미로 벽 · 호수/분수대 충돌 판정
   * - 야외 맵(town, town_p3) 공용 지원
   * - 분수대는 정확한 원형(r=44) 충돌 + 주변 원형 산책 데크(r=98) 통행 개방
   */
  function isColliding(mapData, mapId, nx, ny, { ignoreObs = false, mazeActive = false, penguinChasing = false } = {}) {
    if (!mapData) return false;
    const r = 13;
    if (nx < 28 || nx > mapData.w - 28 || ny < 28 || ny > mapData.h - 28) return true;
    if (ignoreObs) return false;

    for (const ob of toArr(mapData.obstacles)) {
      if (penguinChasing && ob.type === 'penguin') continue;
      if (ob.type === 'fountain' || ob.type === 'sacred_tree') {
        const cx = ob.x + ob.w / 2;
        const cy = ob.y + ob.h / 2;
        const rad = ob.type === 'fountain' ? 44 : 34;
        if (Math.hypot(nx - cx, ny - cy) < rad + r) return true;
        continue;
      }
      if (nx + r > ob.x && nx - r < ob.x + ob.w && ny + r > ob.y && ny - r < ob.y + ob.h) return true;
    }

    if (mazeActive && mapData.mazeWalls) {
      for (const mw of toArr(mapData.mazeWalls)) {
        if (nx + r > mw.x && nx - r < mw.x + mw.w && ny + r > mw.y && ny - r < mw.y + mw.h) return true;
      }
    }

    const isOutdoor = mapId === 'town' || mapId === 'town_p3';
    if (isOutdoor && mapData.waterArea) {
      const wa = mapData.waterArea;
      const inLake = ((nx - wa.cx) ** 2) / (wa.rx ** 2) + ((ny - wa.cy) ** 2) / (wa.ry ** 2) < 1;
      if (inLake) {
        const onPromenade = Math.hypot(nx - wa.cx, ny - wa.cy) <= 98;
        const onBridge = toArr(mapData.bridges).some(
          (b) => nx >= b.x + 2 && nx <= b.x + b.w - 2 && ny >= b.y - 12 && ny <= b.y + b.h + 12
        );
        if (!onPromenade && !onBridge) return true;
      }
    }
    return false;
  }

  /* --------------------------------------------------------------------------
   * 내부 그리기 헬퍼들
   * ------------------------------------------------------------------------*/
  function drawSpriteOrFallback(key, x, y, w, h, fallbackColor = '#4c1d95') {
    const img = Art.getBuilding(key);
    if (img) {
      ctx.drawImage(img, x, y, w, h);
      return true;
    }
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(x, y, w, h);
    return false;
  }

  /** 제3부 신규 야외 랜드마크: 고풍스러운 유럽풍 대저택 */
  function drawMansionBuilding(ob) {
    const { x, y, w, h } = ob;
    ctx.save();
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 4, w * 0.52, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 본관 석조 외벽
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.fillRect(x + 8, y + 36, w - 16, h - 36);
    ctx.strokeRect(x + 8, y + 36, w - 16, h - 36);

    // 좌우 첨탑 지붕 & 중앙 박공 지붕
    ctx.fillStyle = '#1e3a5f';
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 42);
    ctx.lineTo(x + w / 2, y - 16);
    ctx.lineTo(x + w + 4, y + 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 중앙 시계/장미창 장식
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 18, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 18);
    ctx.lineTo(x + w / 2, y + 11);
    ctx.moveTo(x + w / 2, y + 18);
    ctx.lineTo(x + w / 2 + 6, y + 20);
    ctx.stroke();

    // 2층·1층 아치형 창문 (따스한 불빛)
    const winCols = [x + 26, x + 58, x + w - 74, x + w - 42];
    winCols.forEach((wx) => {
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(wx, y + 54, 16, 24, [8, 8, 2, 2]);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(wx, y + 92, 16, 24, [8, 8, 2, 2]);
      ctx.fill();
      ctx.stroke();
    });

    // 중앙 현관 아치 문
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - 18, y + h - 42, 36, 42, [16, 16, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // 정원 울타리 장식
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(x + 14, y + h - 4, 10, 0, Math.PI * 2);
    ctx.arc(x + w - 14, y + h - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLamp(l, now, dimmed = false, part = 1) {
    const pulse = 0.88 + 0.12 * Math.sin(now * 0.004 + l.x);
    ctx.save();
    if (!dimmed) {
      const grad = ctx.createRadialGradient(l.x, l.y - 16, 4, l.x, l.y - 16, 62 * pulse);
      const glowCol = l.type === 'lantern'
        ? 'rgba(251,146,60,0.45)'
        : part === 3
        ? 'rgba(186,230,253,0.42)'
        : 'rgba(254,240,138,0.36)';
      grad.addColorStop(0, glowCol);
      grad.addColorStop(1, 'rgba(254,240,138,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y - 16, 62 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#334155';
    ctx.fillRect(l.x - 2, l.y - 14, 4, 18);
    ctx.fillStyle = dimmed ? '#475569' : (part === 3 && l.type !== 'lantern' ? '#e0f2fe' : '#fef08a');
    ctx.beginPath();
    ctx.arc(l.x, l.y - 16, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLandmark(ob, now, flags) {
    const t = now * 0.001;
    ctx.save();

    if (ob.type === 'house') {
      drawSpriteOrFallback('house', ob.x - 10, ob.y - 24, ob.w + 20, ob.h + 30, '#5c2249');
    } else if (ob.type === 'school') {
      drawSpriteOrFallback('school', ob.x - 5, ob.y - 20, ob.w + 10, ob.h + 25, '#475569');
    } else if (ob.type === 'mansion') {
      drawMansionBuilding(ob);
    } else if (ob.type === 'penguin') {
      if (flags.penguinChasing) {
        ctx.strokeStyle = 'rgba(244,114,182,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(ob.x + 55, ob.y + 92, 46, 18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 11px "Gowun Batang", serif';
        ctx.fillStyle = '#fda4af';
        ctx.textAlign = 'center';
        ctx.fillText(Locale.t('펭귄 대왕이 사라졌다!'), ob.x + 55, ob.y + 96);
        ctx.restore();
        return;
      }
      const bounce = flags.jumpActive ? Math.abs(Math.sin(t * 3.6)) : 0;
      const lift = bounce * 36;
      if (flags.jumpActive) {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(ob.x + 55, ob.y + 112, 44 * (1 - bounce * 0.3), 12, 0, 0, Math.PI * 2);
        ctx.fill();
        if (bounce < 0.18) {
          ctx.strokeStyle = 'rgba(244,114,182,0.88)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(ob.x + 55, ob.y + 110, 68 * (1 - bounce * 2.5), 22 * (1 - bounce * 2.5), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      drawSpriteOrFallback('penguin', ob.x - 10, ob.y - 20 - lift, ob.w + 20, ob.h + 25, '#1e3a8a');
    } else if (ob.type === 'fountain') {
      const cx = ob.x + ob.w / 2;
      const cy = ob.y + ob.h / 2;
      drawSpriteOrFallback('fountain', ob.x - 6, ob.y - 6, ob.w + 12, ob.h + 12, '#0284c7');
      const w = 18 + Math.sin(now * (flags.wateryActive ? 0.015 : 0.005)) * 8;
      ctx.strokeStyle = 'rgba(186,230,253,0.75)';
      ctx.lineWidth = flags.wateryActive ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, w, 0, Math.PI * 2);
      ctx.stroke();
      if (flags.wateryActive) {
        const jetH = 62 + Math.sin(t * 11) * 14;
        const wg = ctx.createLinearGradient(cx, cy, cx, cy - jetH);
        wg.addColorStop(0, '#2563eb');
        wg.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy + 6);
        ctx.quadraticCurveTo(cx - 8, cy - jetH * 0.6, cx - 12, cy - jetH);
        ctx.quadraticCurveTo(cx, cy - jetH - 16, cx + 12, cy - jetH);
        ctx.quadraticCurveTo(cx + 8, cy - jetH * 0.6, cx + 16, cy + 6);
        ctx.closePath();
        ctx.fill();
        for (let i = 0; i < 12; i++) {
          const p = (t * 1.8 + i * 0.17) % 1;
          const a = (i / 12) * Math.PI * 2;
          ctx.fillStyle = `rgba(186,230,253,${1 - p})`;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * p * 92, cy - jetH * (1 - p) + p * p * 75, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (ob.type === 'shrine') {
      drawSpriteOrFallback('shrine', ob.x - 12, ob.y - 24, ob.w + 24, ob.h + 30, '#881337');
    } else if (ob.type === 'clock') {
      drawSpriteOrFallback('clock', ob.x - 15, ob.y - 44, ob.w + 30, ob.h + 50, '#3730a3');
    }

    if (ob.label) {
      ctx.font = 'bold 12px "Gowun Batang", serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t(ob.label), ob.x + ob.w / 2, ob.y - (ob.type === 'clock' ? 48 : ob.type === 'mansion' ? 22 : 26));
    }
    ctx.restore();
  }

  /** 14개 층별/구역별 실내 맵 렌더러 (1·2부 10맵 + 3부 중학교·대저택 4맵) */
  function drawIndoorMap(mapData, mapId, now, part, mazeActive) {
    const isP2 = part === 2;
    const isP3 = part === 3;
    const w = mapData.w;
    const h = mapData.h;

    if (mapId === 'school' || mapId === 'school_f1' || mapId === 'school_f2' || mapId === 'mschool_f1') {
      ctx.fillStyle = isP3 ? '#162547' : isP2 ? '#251a46' : '#211c42';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = isP3 ? '#1e325c' : isP2 ? '#362354' : '#31254f';
      ctx.fillRect(30, 30, w - 60, h * 0.42);
      ctx.fillStyle = isP3 ? '#192a4f' : isP2 ? '#2b2054' : '#282150';
      ctx.fillRect(30, h * 0.44, w - 60, h * 0.51);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let y = 40; y < h - 30; y += 22) {
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(w - 30, y);
        ctx.stroke();
      }
      ctx.fillStyle = isP3 ? 'rgba(186,230,253,0.11)' : isP2 ? 'rgba(251,207,232,0.08)' : 'rgba(254,240,138,0.08)';
      [w * 0.2, w * 0.5, w * 0.8].forEach((wx) => {
        ctx.beginPath();
        ctx.moveTo(wx - 48, 30);
        ctx.lineTo(wx + 48, 30);
        ctx.lineTo(wx + 88, 210);
        ctx.lineTo(wx - 22, 210);
        ctx.closePath();
        ctx.fill();
      });
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = isP3 ? 'rgba(186,230,253,0.75)' : isP2 ? 'rgba(251,207,232,0.62)' : 'rgba(254,240,138,0.6)';
      ctx.textAlign = 'center';
      if (mapId === 'school') {
        ctx.fillText('도서실', 190, 62);
        ctx.fillText('4학년 2반 교실', 535, 62);
        ctx.fillText('과학실', 895, 62);
        ctx.fillText('음악실', 200, 515);
      } else if (mapId === 'school_f1') {
        ctx.fillText('도서실', w * 0.25, 62);
        ctx.fillText('음악실', w * 0.75, 62);
      } else if (mapId === 'mschool_f1') {
        ctx.fillText('1학년 2반 교실', w * 0.25, 62);
        ctx.fillText('중학교 도서실', w * 0.75, 62);
      } else {
        ctx.fillText('4학년 2반 교실', w * 0.25, 62);
        ctx.fillText('과학실', w * 0.75, 62);
      }
    } else if (mapId === 'mschool_roof') {
      // 제3부 신규: 토모에다 중학교 옥상 (맑은 꿈결 하늘과 타일 마당)
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#1e3a6e');
      sky.addColorStop(1, '#263859');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // 옥상 콘크리트 타일 격자
      ctx.fillStyle = '#334155';
      ctx.fillRect(36, 42, w - 72, h - 84);
      ctx.strokeStyle = 'rgba(186,230,253,0.16)';
      ctx.lineWidth = 1;
      for (let gx = 36; gx <= w - 36; gx += 48) {
        ctx.beginPath(); ctx.moveTo(gx, 42); ctx.lineTo(gx, h - 42); ctx.stroke();
      }
      for (let gy = 42; gy <= h - 42; gy += 48) {
        ctx.beginPath(); ctx.moveTo(36, gy); ctx.lineTo(w - 36, gy); ctx.stroke();
      }
      // 상단 철망 난간 느낌
      ctx.strokeStyle = 'rgba(224,242,254,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 42, w - 72, h - 84);
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = 'rgba(224,242,254,0.78)';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t('토모에다 중학교 옥상 · 벚꽃 전망대'), w / 2, 74);
    } else if (mapId === 'mansion_hall') {
      // 제3부 신규: 아키호의 저택 응접실 (고풍 대리석 체커보드 + 진홍/남색 카펫)
      ctx.fillStyle = '#181c36';
      ctx.fillRect(0, 0, w, h);
      const tile = 44;
      for (let gx = 30; gx < w - 30; gx += tile) {
        for (let gy = 30; gy < h - 30; gy += tile) {
          const even = ((Math.floor(gx / tile) + Math.floor(gy / tile)) % 2) === 0;
          ctx.fillStyle = even ? '#252b4f' : '#1d2240';
          ctx.fillRect(gx, gy, Math.min(tile, w - 30 - gx), Math.min(tile, h - 30 - gy));
        }
      }
      // 중앙 응접 카펫
      ctx.fillStyle = '#4c1d45';
      ctx.fillRect(w * 0.18, h * 0.22, w * 0.64, h * 0.54);
      ctx.strokeStyle = 'rgba(253,224,71,0.52)';
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.19, h * 0.23, w * 0.62, h * 0.52);
      // 샹들리에 따스한 빛
      const ch = ctx.createRadialGradient(w / 2, h * 0.45, 18, w / 2, h * 0.45, 220);
      ch.addColorStop(0, 'rgba(254,240,138,0.16)');
      ch.addColorStop(1, 'rgba(254,240,138,0)');
      ctx.fillStyle = ch;
      ctx.fillRect(30, 30, w - 60, h - 60);
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = 'rgba(254,240,138,0.74)';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t('아키호의 저택 응접실'), w / 2, 62);
    } else if (mapId === 'mansion_lib') {
      // 제3부 신규: 아키호의 저택 대서고 (깊은 마호가니 목재 바닥 + 황금 시계 원형 문양)
      ctx.fillStyle = '#14152b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#231d38';
      ctx.fillRect(30, 30, w - 60, h - 60);
      ctx.strokeStyle = 'rgba(253,224,71,0.08)';
      ctx.lineWidth = 1;
      for (let y = 40; y < h - 30; y += 24) {
        ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(w - 30, y); ctx.stroke();
      }
      // 대서고 중앙 거대 원형 시계 러그
      ctx.save();
      ctx.translate(w / 2, h * 0.5);
      ctx.fillStyle = 'rgba(30, 41, 82, 0.72)';
      ctx.beginPath(); ctx.arc(0, 0, 145, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(253,224,71,0.45)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, 145, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(186,230,253,0.32)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, 118, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 124, Math.sin(a) * 124);
        ctx.lineTo(Math.cos(a) * 140, Math.sin(a) * 140);
        ctx.stroke();
      }
      ctx.restore();
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = 'rgba(186,230,253,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t('아키호의 저택 대서고'), w / 2, 62);
    } else if (mapId === 'school_hall') {
      ctx.fillStyle = '#1b1130';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4c261c';
      ctx.fillRect(80, 45, w - 160, 210);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(80, 45, w - 160, 210);
      ctx.fillStyle = '#881337';
      ctx.fillRect(80, 45, 58, 210);
      ctx.fillRect(w - 138, 45, 58, 210);
      ctx.fillStyle = '#251a40';
      ctx.fillRect(40, 275, w - 80, h - 315);
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = 'rgba(254,240,138,0.65)';
      ctx.textAlign = 'center';
      ctx.fillText('학예회 연극 무대', w / 2, 74);
    } else if (mapId === 'shrine' || mapId === 'shrine_gate' || mapId === 'shrine_main') {
      ctx.fillStyle = isP3 ? '#1e1b3d' : mapId === 'shrine_main' ? '#2c1538' : '#231330';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3d2c4c';
      ctx.fillRect(w / 2 - 65, 160, 130, h - 200);
      ctx.strokeStyle = isP3 ? 'rgba(186,230,253,0.26)' : isP2 ? 'rgba(249,168,212,0.22)' : 'rgba(250,204,21,0.2)';
      ctx.lineWidth = 1.5;
      for (let sy = 180; sy < h - 50; sy += 36) ctx.strokeRect(w / 2 - 58, sy, 116, 30);
      [[w * 0.4, 280], [w * 0.6, 280], [w * 0.4, 470], [w * 0.6, 470]].forEach(([lx, ly]) =>
        drawLamp({ x: lx, y: ly, type: 'lantern' }, now, false, part)
      );
    } else if (mapId === 'shrine_cave') {
      ctx.fillStyle = '#11101d';
      ctx.fillRect(0, 0, w, h);
      const cg = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.55);
      cg.addColorStop(0, '#26243d');
      cg.addColorStop(1, '#090812');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.45, h * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = 'rgba(203,213,225,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t('신사 뒤편 동굴'), w / 2, 62);
    } else if (mapId === 'house' || mapId === 'house_f1' || mapId === 'house_b1' || mapId === 'house_f2') {
      const bgCol = mapId === 'house_b1' ? '#20132e' : mapId === 'house_f1' ? (isP3 ? '#262145' : '#361f3f') : (isP3 ? '#252652' : '#2c1a38');
      ctx.fillStyle = bgCol;
      ctx.fillRect(0, 0, w, h);
      if (mapId === 'house') {
        ctx.fillStyle = '#471a33';
        ctx.fillRect(65, 175, 340, 360);
        ctx.strokeStyle = 'rgba(250,204,21,0.38)';
        ctx.lineWidth = 2;
        ctx.strokeRect(75, 185, 320, 340);
        ctx.fillStyle = '#351f49';
        ctx.fillRect(472, 30, 418, 315);
        ctx.fillStyle = '#291838';
        ctx.fillRect(472, 367, 418, 303);
        ctx.font = 'bold 14px "Gowun Batang", serif';
        ctx.fillStyle = 'rgba(254,240,138,0.58)';
        ctx.textAlign = 'center';
        ctx.fillText('지하 서재', 235, 62);
        ctx.fillText('2층 거울 복도', 690, 62);
        ctx.fillText('다락방 서고', 690, 405);
      } else {
        ctx.fillStyle = mapId === 'house_b1' ? '#4c142e' : mapId === 'house_f1' ? '#5e2249' : (isP3 ? '#3b2b69' : '#3a2254');
        ctx.fillRect(w * 0.16, h * 0.24, w * 0.68, h * 0.52);
        ctx.strokeStyle = isP3 ? 'rgba(186,230,253,0.45)' : 'rgba(250,204,21,0.38)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.17, h * 0.25, w * 0.66, h * 0.50);
      }
    }

    ctx.strokeStyle = isP3 ? 'rgba(186,230,253,0.55)' : isP2 ? 'rgba(249,168,212,0.48)' : 'rgba(250,204,21,0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, w - 48, h - 48);

    for (const ob of toArr(mapData.obstacles)) {
      ctx.save();
      if (ob.type === 'wall') {
        ctx.fillStyle = isP3 ? '#2c3e6b' : '#46316b';
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
        ctx.strokeStyle = isP3 ? 'rgba(186,230,253,0.35)' : 'rgba(253,224,71,0.28)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
      } else {
        drawSpriteOrFallback(ob.type, ob.x - 4, ob.y - 6, ob.w + 8, ob.h + 12, '#5c2d16');
      }
      if (ob.label) {
        ctx.font = 'bold 11px "Gowun Batang", serif';
        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.fillText(Locale.t(ob.label), ob.x + ob.w / 2, ob.y - 9);
      }
      ctx.restore();
    }

    if (mazeActive && mapData.mazeWalls) {
      const pulse = 0.62 + 0.25 * Math.sin(now * 0.004);
      for (const mw of toArr(mapData.mazeWalls)) {
        ctx.fillStyle = `rgba(148,163,184,${pulse})`;
        ctx.fillRect(mw.x, mw.y, mw.w, mw.h);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(mw.x, mw.y, mw.w, mw.h);
      }
    }
  }

  /** 마법 의상 전체(초등학교·중학교 교복 + 1·2·3부 배틀 의상) 실시간 외형 스프라이트 */
  function drawProtagonistChar(x, y, walk, dir, costume, overrideColors = null) {
    const step = Math.sin(walk) * 2.5;
    const dress = overrideColors?.dress || costume?.dressColor || '#f472b6';
    const accent = overrideColors?.accent || costume?.accentColor || '#fff1f2';
    const hatCol = overrideColors?.hat || costume?.hatColor || '#f43f5e';
    const hatType = overrideColors?.hatType || costume?.hatType || 'beret';

    // 천사 / 프리즘 스노우 케이프 등 뒤 작은 날개
    if (hatType === 'halo') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x - 12, y - 1, 6, 3.5, -0.4, 0, Math.PI * 2);
      ctx.ellipse(x + 12, y - 1, 6, 3.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 드레스 몸체
    ctx.fillStyle = dress;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x - 12.5, y + 12 + step * 0.3);
    ctx.lineTo(x + 12.5, y + 12 - step * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 의상별 포인트 장식
    if (hatType === 'uniform' || hatType === 'uniform_mid') {
      // 초등학교/중학교 세일러 교복 흰 카라 & 빨간 리본 스카프
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - 7.5, y - 3);
      ctx.lineTo(x + 7.5, y - 3);
      ctx.lineTo(x, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hatType === 'uniform_mid' ? '#f43f5e' : '#e11d48';
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y + 2);
      ctx.lineTo(x + 2.6, y + 2);
      ctx.lineTo(x, y + 8.8);
      ctx.closePath();
      ctx.fill();
      if (hatType === 'uniform_mid') {
        // 중학교 세일러 치마 하단 흰색 라인 포인트
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - 9.5, y + 9.5);
        ctx.lineTo(x + 9.5, y + 9.5);
        ctx.stroke();
      }
    } else if (hatType === 'crystal') {
      // 3부 크리스탈 드림 드레스: 중앙 다이아 보석 + 투명 프릴
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 3.5, y + 4); ctx.lineTo(x, y + 8); ctx.lineTo(x - 3.5, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 9); ctx.lineTo(x + 10, y + 9);
      ctx.stroke();
    } else if (hatType === 'cat') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x - 4, y + 1, 8, 3);
    } else if (hatType === 'ribbon') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y + 11);
      ctx.lineTo(x + 6, y + 11);
      ctx.closePath();
      ctx.fill();
    } else if (hatType === 'frog') {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x - 7, y + 11, 5, 3.5);
      ctx.fillRect(x + 2, y + 11, 5, 3.5);
    } else if (hatType === 'crown' || hatType === 'jester') {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 7);
      ctx.lineTo(x + 8, y + 7);
      ctx.stroke();
    }

    // 머리카락 & 얼굴
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.arc(x, y - 10, 10.5, 0, Math.PI * 2);
    ctx.fill();
    if (dir !== 'up') {
      ctx.fillStyle = '#ffedd5';
      ctx.beginPath();
      ctx.arc(x, y - 9, 7.5, 0, Math.PI * 2);
      ctx.fill();
      const ex = dir === 'left' ? -2.2 : dir === 'right' ? 2.2 : 0;
      ctx.fillStyle = '#047857';
      ctx.beginPath();
      ctx.arc(x - 2.6 + ex, y - 8.8, 1.35, 0, Math.PI * 2);
      ctx.arc(x + 2.6 + ex, y - 8.8, 1.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // 의상별 모자 / 머리 장식
    if (hatType === 'frog') {
      ctx.fillStyle = hatCol;
      ctx.beginPath();
      ctx.arc(x, y - 15, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - 5.5, y - 20, 3.2, 0, Math.PI * 2);
      ctx.arc(x + 5.5, y - 20, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(x - 5.5, y - 20, 1.4, 0, Math.PI * 2);
      ctx.arc(x + 5.5, y - 20, 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatType === 'cat') {
      ctx.fillStyle = hatCol;
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 14); ctx.lineTo(x - 7, y - 24); ctx.lineTo(x - 2, y - 17);
      ctx.moveTo(x + 10, y - 14); ctx.lineTo(x + 7, y - 24); ctx.lineTo(x + 2, y - 17);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(x - 6.5, y - 19, 1.8, 0, Math.PI * 2);
      ctx.arc(x + 6.5, y - 19, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatType === 'wing') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x - 9, y - 18, 5.5, 3, -0.45, 0, Math.PI * 2);
      ctx.ellipse(x + 9, y - 18, 5.5, 3, 0.45, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(x, y - 18, 2.8, 0, Math.PI * 2); ctx.fill();
    } else if (hatType === 'crystal') {
      // 3부 크리스탈 드림 드레스: 투명 크리스탈 티아라 리본
      ctx.fillStyle = '#e0f2fe';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x - 7.5, y - 19, 5.2, 3, -0.35, 0, Math.PI * 2);
      ctx.ellipse(x + 7.5, y - 19, 5.2, 3, 0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(x, y - 25); ctx.lineTo(x + 3.2, y - 19); ctx.lineTo(x, y - 15); ctx.lineTo(x - 3.2, y - 19);
      ctx.closePath();
      ctx.fill();
    } else if (hatType === 'ribbon') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x - 7, y - 19, 5, 3.2, -0.25, 0, Math.PI * 2);
      ctx.ellipse(x + 7, y - 19, 5, 3.2, 0.25, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2563eb';
      ctx.beginPath(); ctx.arc(x, y - 19, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (hatType === 'jester') {
      ctx.fillStyle = hatCol;
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 15); ctx.lineTo(x - 13, y - 25); ctx.lineTo(x, y - 18);
      ctx.lineTo(x + 13, y - 25); ctx.lineTo(x + 9, y - 15);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(x - 13, y - 25, 2.3, 0, Math.PI * 2);
      ctx.arc(x + 13, y - 25, 2.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatType === 'crown') {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#be185d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 17); ctx.lineTo(x - 5, y - 24); ctx.lineTo(x - 1, y - 20);
      ctx.lineTo(x + 1, y - 25); ctx.lineTo(x + 4, y - 20); ctx.lineTo(x + 7, y - 24);
      ctx.lineTo(x + 7, y - 17); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (hatType === 'halo') {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y - 24, 9, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (hatType === 'uniform' || hatType === 'uniform_mid') {
      // 교복 착용 시 모자 없이 단정한 단발 머리 유지
    } else {
      ctx.fillStyle = hatCol;
      ctx.beginPath();
      ctx.ellipse(x, y - 18, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.arc(x, y - 19, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlayerSprite(state, now) {
    const { player, buffs, costume, part, flags } = state;
    ctx.save();
    const flying = buffs.fly > 0 || buffs.flyLand;
    const lift = flying ? 18 + Math.sin(now * 0.01) * 5 : 0;
    ctx.translate(player.x, player.y);

    const shadowNear = !!flags.shadowNearPlayer;
    ctx.fillStyle = shadowNear ? 'rgba(5,2,20,0.9)' : 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(
      shadowNear ? Math.sin(now * 0.005) * 16 : 0,
      shadowNear ? 18 + Math.cos(now * 0.004) * 5 : 14,
      shadowNear ? 28 : Math.max(6, 12 - lift * 0.2),
      shadowNear ? 11 : 5,
      0, 0, Math.PI * 2
    );
    ctx.fill();

    if (buffs.glow > 0) {
      for (let i = 0; i < 6; i++) {
        const a = now * 0.004 + (i * Math.PI) / 3;
        ctx.fillStyle = part === 3 ? 'rgba(186,230,253,0.92)' : 'rgba(190,242,100,0.9)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 24, Math.sin(a) * 14 - lift, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (buffs.light > 0) {
      const lg = ctx.createRadialGradient(0, -lift, 8, 0, -lift, 92);
      lg.addColorStop(0, part === 3 ? 'rgba(186,230,253,0.46)' : 'rgba(254,249,195,0.45)');
      lg.addColorStop(1, 'rgba(254,249,195,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(0, -lift, 92, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(0, -lift);

    if (flying) {
      const fl = Math.sin(now * 0.018) * 7;
      ctx.fillStyle = part === 3
        ? 'rgba(186,230,253,0.86)'
        : flags.isSakuraFly
        ? 'rgba(251,207,232,0.96)'
        : 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = part === 3 ? '#7dd3fc' : '#fde047';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-4, -2); ctx.quadraticCurveTo(-30, -22 - fl, -25, 5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, -2); ctx.quadraticCurveTo(30, -22 - fl, 25, 5); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    if (buffs.wind > 0) {
      ctx.strokeStyle = part === 3 ? 'rgba(186,230,253,0.82)' : part === 2 ? 'rgba(249,168,212,0.75)' : 'rgba(56,189,248,0.72)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 6, 22, 9, Math.sin(now * 0.008) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawProtagonistChar(0, 0, player.walk, player.dir || 'down', costume);

    // 지팡이 방안 2: 평상시 탐험 중 숨김, 비행 중 또는 명시적 해방 시에만 봉인/별/꿈의 지팡이 출현
    const showWand = flying || !!flags?.showWand;
    if (showWand && !flags?.hideWand) {
      if (part === 3) {
        // 3부 꿈의 지팡이 (은백색 봉 + 하늘빛 크리스탈 구슬 + 황금 별/초승달)
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(11, -15); ctx.lineTo(11, 10); ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(11, -17, 5.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(9.8, -18.2, 1.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = part === 2 ? '#f472b6' : '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(11, -14); ctx.lineTo(11, 10); ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.arc(11, -16.5, part === 2 ? 5.2 : 4.2, 0, Math.PI * 2); ctx.fill();
        if (part === 2) { ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 1.4; ctx.stroke(); }
      }
    }

    if (buffs.shield) {
      ctx.strokeStyle = part === 3 ? 'rgba(186,230,253,0.92)' : part === 2 ? 'rgba(251,207,232,0.9)' : 'rgba(253,224,71,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -2, 22, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  /** 제3부 투명 크리스탈 이상 현상 전용 렌더러 (13종 비주얼 패턴) */
  function drawClearCardAnomaly(c, state, now) {
    const t = now * 0.001;
    const pos = c.pos || { x: c.x, y: c.y };
    const { player } = state;
    const dist = Math.hypot(player.x - pos.x, player.y - pos.y);
    const kind = c.anomalyType || 'clear_prism';

    ctx.save();
    ctx.translate(pos.x, pos.y);

    switch (kind) {
      case 'clear_gale':
        for (let i = 0; i < 4; i++) {
          const a = t * 3.6 + i * 1.57;
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(186,230,253,0.88)' : 'rgba(251,207,232,0.75)';
          ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.arc(0, 0, 16 + i * 12, a, a + 2.2); ctx.stroke();
        }
        break;

      case 'clear_cube': {
        const s = 34 + Math.sin(t * 3) * 4;
        ctx.fillStyle = 'rgba(186,230,253,0.22)';
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2.2;
        ctx.fillRect(-s, -s * 0.72, s * 2, s * 1.44);
        ctx.strokeRect(-s, -s * 0.72, s * 2, s * 1.44);
        ctx.strokeStyle = 'rgba(249,168,212,0.78)';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(-s * 0.62, -s * 0.44, s * 1.24, s * 0.88);
        break;
      }

      case 'clear_water':
        for (let w = 0; w < 3; w++) {
          const wr = 18 + ((t * 30 + w * 20) % 58);
          ctx.strokeStyle = `rgba(186,230,253,${Math.max(0, 0.85 - wr / 72)})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.ellipse(0, 8, wr, wr * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(125,211,252,0.78)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -28 + Math.sin(t * 4) * 6);
        ctx.quadraticCurveTo(22, -6, 0, 14);
        ctx.quadraticCurveTo(-22, -6, 0, -28 + Math.sin(t * 4) * 6);
        ctx.fill(); ctx.stroke();
        break;

      case 'clear_gears':
        [[-18, -8, 22, 1.4], [18, 12, 16, -2.0]].forEach(([gx, gy, gr, sp]) => {
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(t * sp);
          ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.8; ctx.setLineDash([7, 4]);
          ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(0, 0, gr * 0.55, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        });
        break;

      case 'clear_wings': {
        const flap = Math.sin(t * 6.4) * 12;
        ctx.fillStyle = 'rgba(224,242,254,0.78)';
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.quadraticCurveTo(-28, -26 - flap, -48, -4 - flap * 0.6);
        ctx.quadraticCurveTo(-22, 10, 0, 14); ctx.quadraticCurveTo(22, 10, 48, -4 - flap * 0.6);
        ctx.quadraticCurveTo(28, -26 - flap, 0, 4); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      }

      case 'clear_veil': {
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 74);
        g.addColorStop(0, 'rgba(186,230,253,0.44)');
        g.addColorStop(0.55, 'rgba(30,41,82,0.55)');
        g.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(224,242,254,0.75)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.ellipse(0, 0, 38 + Math.sin(t * 2) * 5, 26, t * 0.4, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        break;
      }

      case 'clear_spiral':
        ctx.save(); ctx.rotate(t * 1.9);
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = i % 2 ? '#bae6fd' : '#f9a8d4';
          ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.arc(0, 0, 14 + i * 11, i * 1.1, i * 1.1 + 3.4); ctx.stroke();
        }
        ctx.restore();
        break;

      case 'clear_cloud': {
        const cy = Math.sin(t * 2.2) * 5;
        ctx.fillStyle = 'rgba(224,242,254,0.82)';
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(-18, cy, 16, 0, Math.PI * 2);
        ctx.arc(0, cy - 8, 20, 0, Math.PI * 2);
        ctx.arc(18, cy, 16, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        break;
      }

      case 'clear_maze': {
        const ph = 0.55 + 0.3 * Math.sin(t * 2.4);
        ctx.strokeStyle = `rgba(186,230,253,${ph})`; ctx.lineWidth = 2.8; ctx.strokeRect(-44, -34, 88, 68);
        ctx.strokeStyle = `rgba(254,240,138,${ph * 0.85})`; ctx.lineWidth = 1.8; ctx.strokeRect(-26, -20, 52, 40);
        break;
      }

      case 'clear_blaze': {
        const fg = ctx.createRadialGradient(0, 0, 8, 0, 0, 78);
        fg.addColorStop(0, 'rgba(56,189,248,0.68)');
        fg.addColorStop(0.5, 'rgba(249,115,22,0.52)');
        fg.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.fill();
        [[-16, 6, 32], [16, 8, 30], [0, 4, 48]].forEach(([tx, ty, th], idx) => {
          const sw = Math.sin(t * 8 + idx * 2) * 5;
          ctx.fillStyle = idx === 2 ? 'rgba(56,189,248,0.92)' : 'rgba(249,115,22,0.88)';
          ctx.beginPath();
          ctx.moveTo(tx - 13, ty); ctx.quadraticCurveTo(tx - 8, ty - th * 0.6, tx + sw, ty - th);
          ctx.quadraticCurveTo(tx + 8, ty - th * 0.6, tx + 13, ty); ctx.closePath(); ctx.fill();
        });
        break;
      }

      case 'clear_blade':
        for (let i = 0; i < 2; i++) {
          const sp = (t * 2.3 + i * 0.5) % 1;
          const al = Math.sin(sp * Math.PI);
          ctx.save(); ctx.rotate(i * 1.55 + Math.floor(t * 2.3) * 0.85);
          ctx.strokeStyle = `rgba(224,242,254,${al * 0.95})`; ctx.lineWidth = 3.6;
          ctx.beginPath(); ctx.arc(0, 0, 36, -0.8 + sp * 1.2, 0.35 + sp * 1.2); ctx.stroke();
          ctx.strokeStyle = `rgba(125,211,252,${al * 0.85})`; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(0, 0, 41, -0.6 + sp * 1.2, 0.25 + sp * 1.2); ctx.stroke();
          ctx.restore();
        }
        break;

      case 'clear_sparkle': {
        const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 62);
        g.addColorStop(0, 'rgba(254,240,138,0.52)');
        g.addColorStop(0.55, 'rgba(249,168,212,0.28)');
        g.addColorStop(1, 'rgba(186,230,253,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 10; i++) {
          const a = t * 1.5 + (i * Math.PI * 2) / 10;
          const r = 18 + (i % 3) * 11;
          ctx.fillStyle = i % 2 ? '#fef08a' : '#fbcfe8';
          ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r * 0.72, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }

      default: {
        // clear_prism (기본 크리스탈 프리즘 다면체)
        const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 66);
        g.addColorStop(0, 'rgba(224,242,254,0.58)');
        g.addColorStop(0.55, 'rgba(125,211,252,0.28)');
        g.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.rotate(t * 0.9);
        ctx.fillStyle = 'rgba(255,255,255,0.26)';
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -26); ctx.lineTo(18, 0); ctx.lineTo(0, 26); ctx.lineTo(-18, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        break;
      }
    }

    // 제3부 크리스탈 공명 코어 (스포일러 없이 상호작용 중심점 명확히 안내)
    const isEvent = c.acquireMode === 'event';
    const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
    ctx.strokeStyle = isEvent
      ? `rgba(251,207,232,${0.65 * pulse + 0.25})`
      : `rgba(186,230,253,${0.68 * pulse + 0.25})`;
    ctx.lineWidth = 1.9;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(0, 0, 27 + Math.sin(t * 3.2) * 2.2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = isEvent ? '#fef08a' : '#e0f2fe';
    ctx.strokeStyle = isEvent ? '#f472b6' : '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 0); ctx.lineTo(0, 10); ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    if (dist < 190) {
      const tagText = isEvent ? '✨ 포근한 빛' : '💎 투명한 기운';
      ctx.font = 'bold 11px "Gowun Batang", serif';
      const tw = ctx.measureText(tagText).width;
      const ly = -40 + Math.sin(t * 3.2) * 2.5;
      ctx.fillStyle = 'rgba(12, 23, 46, 0.84)';
      ctx.strokeStyle = isEvent ? 'rgba(251, 207, 232, 0.85)' : 'rgba(186, 230, 253, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-tw / 2 - 8, ly - 11, tw + 16, 17, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isEvent ? '#fef08a' : '#e0f2fe';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, 0, ly + 1);
    }

    ctx.restore();
  }

  /** 1·2부 19종 + 3부 투명 크리스탈 이상 현상 통합 렌더러 */
  function drawCardAnomaly(c, state, now) {
    if (state.part === 3) {
      drawClearCardAnomaly(c, state, now);
      return;
    }

    const t = now * 0.001;
    const pos = c.pos || { x: c.x, y: c.y };
    const { player, anomaly, part } = state;
    const dist = Math.hypot(player.x - pos.x, player.y - pos.y);
    const isP2 = part === 2;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    switch (c.id) {
      case 'windy':
        for (let i = 0; i < 4; i++) {
          const a = t * 3.2 + i * 1.57;
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(56,189,248,0.78)' : 'rgba(249,168,212,0.7)';
          ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.arc(0, 0, 18 + i * 11, a, a + 2.1); ctx.stroke();
        }
        break;

      case 'fly': {
        const sx = Math.cos(t * 1.45) * 44;
        const sy = Math.sin(t * 2.9) * 18 - 10;
        const flap = Math.sin(t * 7.5) * 14;
        ctx.fillStyle = 'rgba(248,250,252,0.18)';
        ctx.beginPath(); ctx.ellipse(sx, sy + 26, 42, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(sx, sy);
        ctx.fillStyle = isP2 ? 'rgba(255,241,242,0.85)' : 'rgba(248,250,252,0.84)';
        ctx.strokeStyle = isP2 ? '#f472b6' : 'rgba(253,224,71,0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.quadraticCurveTo(-24, -22 - flap, -46, -6 - flap * 0.6);
        ctx.quadraticCurveTo(-22, 6, 0, 12); ctx.quadraticCurveTo(22, 6, 46, -6 - flap * 0.6);
        ctx.quadraticCurveTo(24, -22 - flap, 0, 4); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
        break;
      }

      case 'wood': {
        const g = ctx.createRadialGradient(0, 0, 12, 0, 0, 112);
        g.addColorStop(0, 'rgba(22,163,74,0.48)');
        g.addColorStop(0.6, 'rgba(21,128,61,0.24)');
        g.addColorStop(1, 'rgba(21,128,61,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.fill();

        const dirToP = Math.atan2(player.y - pos.y, player.x - pos.x);
        for (let i = 0; i < 10; i++) {
          const isReach = i < 2 && dist < 210;
          const a = isReach ? dirToP + (i === 0 ? -0.18 : 0.18) : (i * Math.PI) / 5 + Math.sin(t * 1.4 + i) * 0.16;
          const l = isReach ? Math.min(110, dist * 0.68) : 64 + Math.sin(t * 2.3 + i * 1.3) * 18;
          const cx1 = Math.cos(a + 0.42) * l * 0.52;
          const cy1 = Math.sin(a + 0.42) * l * 0.52;
          const ex = Math.cos(a) * l;
          const ey = Math.sin(a) * l;
          ctx.strokeStyle = i % 2 ? '#4ade80' : '#16a34a';
          ctx.lineWidth = isReach ? 6.5 : 5;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.stroke();
          ctx.fillStyle = '#86efac';
          ctx.beginPath(); ctx.ellipse(cx1, cy1, 7, 3.5, a + 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = i % 3 === 0 ? '#fbcfe8' : '#4ade80';
          ctx.beginPath(); ctx.arc(ex, ey, 4.2, 0, Math.PI * 2); ctx.fill();
        }
        for (let lf = 0; lf < 14; lf++) {
          const la = t * 2.1 + lf * 0.45;
          const lr = 24 + ((lf * 13 + t * 24) % 74);
          ctx.fillStyle = lf % 2 ? 'rgba(74,222,128,0.85)' : 'rgba(134,239,172,0.8)';
          ctx.beginPath();
          ctx.ellipse(Math.cos(la) * lr, Math.sin(la) * lr * 0.78, 5, 2.4, la, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'shield': {
        const rad = 56 * (1 + Math.sin(t * 3.2) * 0.06);
        const g = ctx.createRadialGradient(0, 0, 12, 0, 0, rad);
        g.addColorStop(0, 'rgba(254,240,138,0.12)');
        g.addColorStop(0.75, 'rgba(250,204,21,0.3)');
        g.addColorStop(1, 'rgba(250,204,21,0.62)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(254,240,138,0.9)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = t * 0.45 + (i * Math.PI) / 3;
          i === 0 ? ctx.moveTo(Math.cos(a) * rad * 0.84, Math.sin(a) * rad * 0.84) : ctx.lineTo(Math.cos(a) * rad * 0.84, Math.sin(a) * rad * 0.84);
        }
        ctx.closePath(); ctx.stroke();
        break;
      }

      case 'jump':
        [[-28, 12, 0, '#f472b6', 7], [26, -8, 1.7, '#fde047', 6], [0, 6, 3.1, '#38bdf8', 9], [-14, -22, 4.4, '#c084fc', 5.5]].forEach(([ox, oy, ph, col, r]) => {
          const b = Math.abs(Math.sin(t * 3.8 + ph));
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.ellipse(ox, oy + 8, r * (1.1 - b * 0.4), 3.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(ox, oy - b * 42, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
        });
        break;

      case 'mirror': {
        const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 58);
        g.addColorStop(0, 'rgba(186,230,253,0.45)');
        g.addColorStop(1, 'rgba(125,211,252,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 52, 36, 0, 0, Math.PI * 2); ctx.fill();
        const trail = anomaly?.mirrorTrail?.[0] || { x: player.x, y: player.y, walk: 0 };
        const dx = clamp(-(trail.x - pos.x) * 0.35, -55, 55);
        const dy = clamp((trail.y - pos.y) * 0.22, -35, 35);
        ctx.save(); ctx.translate(dx, dy); ctx.globalAlpha = 0.82;
        drawProtagonistChar(0, 0, trail.walk, 'down', state.costume, { dress: '#bae6fd', hat: '#38bdf8', accent: '#ffffff' });
        ctx.font = 'bold 10px "Gowun Batang", serif';
        ctx.fillStyle = '#e0f2fe'; ctx.textAlign = 'center';
        ctx.fillText(Locale.t('사쿠라...?'), 0, -26);
        ctx.restore();
        break;
      }

      case 'flower': {
        const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 74);
        g.addColorStop(0, 'rgba(244,114,182,0.42)');
        g.addColorStop(1, 'rgba(244,114,182,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.fill();
        [[-28, -12], [26, -14], [-22, 20], [26, 18], [0, 0]].forEach(([bx, by], idx) => {
          ctx.save(); ctx.translate(bx, by);
          for (let p = 0; p < 5; p++) {
            const pa = (p * Math.PI * 2) / 5 + t * 0.4;
            ctx.fillStyle = idx % 2 ? '#fb7185' : '#fbcfe8';
            ctx.beginPath(); ctx.ellipse(Math.cos(pa) * 6.5, Math.sin(pa) * 6.5, 6, 3.8, pa, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(0, 0, 3.8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        break;
      }

      case 'thunder': {
        const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 72);
        g.addColorStop(0, 'rgba(56,189,248,0.46)');
        g.addColorStop(0.55, 'rgba(30,27,75,0.48)');
        g.addColorStop(1, 'rgba(30,27,75,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const ang = t * 1.35 + i * 2.1;
          ctx.strokeStyle = i === 0 ? 'rgba(253,224,71,0.84)' : 'rgba(125,211,252,0.8)';
          ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.arc(0, 0, 22 + i * 14, ang, ang + 1.5); ctx.stroke();
        }
        for (let s = 0; s < 10; s++) {
          const a = t * 1.45 + s * 0.65;
          ctx.fillStyle = s % 2 ? '#fde047' : '#7dd3fc';
          ctx.beginPath(); ctx.arc(Math.cos(a) * (24 + (s % 3) * 14), Math.sin(a) * (18 + (s % 2) * 11), 2.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }

      case 'maze': {
        const ph = 0.58 + 0.32 * Math.sin(t * 2.2);
        ctx.strokeStyle = `rgba(203,213,225,${ph})`; ctx.lineWidth = 3; ctx.strokeRect(-48, -38, 96, 76);
        ctx.strokeStyle = `rgba(253,224,71,${ph * 0.8})`; ctx.lineWidth = 2; ctx.strokeRect(-30, -24, 60, 48);
        break;
      }

      case 'shadow': {
        const g = ctx.createRadialGradient(0, 0, 18, 0, 0, 118);
        g.addColorStop(0, 'rgba(3,1,12,0.97)');
        g.addColorStop(0.58, 'rgba(30,27,75,0.62)');
        g.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 6, 118, 86, 0, 0, Math.PI * 2); ctx.fill();

        const dirP = Math.atan2(player.y - pos.y, player.x - pos.x);
        for (let i = 0; i < 8; i++) {
          const track = i < 3 && dist < 280;
          const a = track ? dirP + (i - 1) * 0.22 : (i * Math.PI) / 4 + Math.sin(t * 1.8 + i) * 0.28;
          const r = track ? Math.min(138, dist * 0.68) : 56 + Math.sin(t * 2.8 + i) * 14;
          const cx1 = Math.cos(a + 0.35) * r * 0.5;
          const cy1 = Math.sin(a + 0.35) * r * 0.5;
          const ex = Math.cos(a) * r;
          const ey = Math.sin(a) * r;
          ctx.strokeStyle = track ? 'rgba(6,3,18,0.96)' : 'rgba(15,10,40,0.88)';
          ctx.lineWidth = track ? 7.5 : 5.5;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.stroke();
        }
        const bl = Math.sin(t * 2.5) > -0.75 ? 1 : 0.1;
        ctx.fillStyle = `rgba(199,210,254,${0.9 * bl})`;
        ctx.beginPath();
        ctx.ellipse(-9, -4, 4, 2.2, 0, 0, Math.PI * 2);
        ctx.ellipse(9, -4, 4, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'illusion': {
        for (let i = 0; i < 4; i++) {
          const ox = Math.cos(t * 0.9 + i * 1.7) * 22;
          const oy = Math.sin(t * 1.1 + i * 1.4) * 16;
          const f = ctx.createRadialGradient(ox, oy, 4, ox, oy, 54);
          f.addColorStop(0, 'rgba(216,180,254,0.52)');
          f.addColorStop(1, 'rgba(126,34,206,0)');
          ctx.fillStyle = f;
          ctx.beginPath(); ctx.arc(ox, oy, 54, 0, Math.PI * 2); ctx.fill();
        }
        for (let r = 0; r < 3; r++) {
          const rad = 14 + ((t * 22 + r * 16) % 46);
          ctx.strokeStyle = `rgba(232,121,249,${Math.max(0.15, 0.85 - rad / 58)})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(250,245,255,0.92)';
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9333ea';
        ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'sword':
        for (let i = 0; i < 2; i++) {
          const sp = (t * 2.2 + i * 0.5) % 1;
          const al = Math.sin(sp * Math.PI);
          ctx.save(); ctx.rotate(i * 1.6 + Math.floor(t * 2.2) * 0.9);
          ctx.strokeStyle = `rgba(248,250,252,${al * 0.94})`; ctx.lineWidth = 3.8;
          ctx.beginPath(); ctx.arc(0, 0, 36, -0.9 + sp * 1.2, 0.3 + sp * 1.2); ctx.stroke();
          ctx.strokeStyle = `rgba(253,224,71,${al * 0.8})`; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(0, 0, 40, -0.7 + sp * 1.2, 0.2 + sp * 1.2); ctx.stroke();
          ctx.restore();
        }
        break;

      case 'earthy':
        ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + 0.2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 40); ctx.stroke();
        }
        [[-22, 4, 26], [18, 6, 22], [0, -4, 34]].forEach(([rx, ry, rh], idx) => {
          const jt = Math.sin(t * 24 + idx * 2) * 1.8;
          const lf = Math.abs(Math.sin(t * 2.1 + idx)) * 8;
          ctx.fillStyle = idx === 2 ? '#b45309' : '#78350f';
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(rx - 12 + jt, ry + 10); ctx.lineTo(rx - 4 + jt, ry - rh - lf); ctx.lineTo(rx + 10 + jt, ry + 10);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        });
        break;

      case 'erase': {
        const r = 42 + Math.sin(t * 2.4) * 6;
        const g = ctx.createRadialGradient(0, 0, 8, 0, 0, r + 24);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.55, 'rgba(226,232,240,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r + 24, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 12; i++) {
          const p = (t * 0.8 + i * 0.17) % 1;
          ctx.fillStyle = `rgba(248,250,252,${1 - p})`;
          ctx.fillRect(Math.cos(i * 1.7) * (20 + p * 32), Math.sin(i * 1.7) * 16 - p * 48, 5, 5);
        }
        break;
      }

      case 'watery': {
        for (let w = 0; w < 3; w++) {
          const wr = 18 + ((t * 32 + w * 20) % 56);
          ctx.strokeStyle = `rgba(125,211,252,${Math.max(0, 0.8 - wr / 72)})`; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.ellipse(0, 8, wr, wr * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        }
        const ch = 44 + Math.sin(t * 5.2) * 10;
        const wg = ctx.createLinearGradient(0, 12, 0, -ch);
        wg.addColorStop(0, 'rgba(37,99,235,0.88)'); wg.addColorStop(1, 'rgba(224,242,254,0.96)');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(-16, 10); ctx.quadraticCurveTo(-8, -ch * 0.5, -10, -ch);
        ctx.quadraticCurveTo(0, -ch - 12, 10, -ch); ctx.quadraticCurveTo(8, -ch * 0.5, 16, 10);
        ctx.closePath(); ctx.fill();
        break;
      }

      case 'glow': {
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 108);
        g.addColorStop(0, 'rgba(217,249,157,0.48)');
        g.addColorStop(0.55, 'rgba(163,230,53,0.2)');
        g.addColorStop(1, 'rgba(190,242,100,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 108, 72, 0, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = 'rgba(217,249,157,0.42)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let s = 0; s <= 32; s++) {
          const p = (s / 32) * Math.PI * 2 + t * 0.7;
          const rx = Math.sin(p) * 76;
          const ry = Math.sin(p * 2) * 32;
          s === 0 ? ctx.moveTo(rx, ry) : ctx.lineTo(rx, ry);
        }
        ctx.stroke();

        for (let i = 0; i < 28; i++) {
          const p = t * 1.45 + i * 0.25;
          const a = 0.45 + 0.55 * Math.sin(t * 4.5 + i);
          const rx = Math.sin(p) * (46 + (i % 4) * 14);
          const ry = Math.sin(p * 2) * 26 + Math.cos(p * 0.8 + i) * 14;
          ctx.fillStyle = i % 3 === 0 ? `rgba(254,240,138,${a})` : `rgba(217,249,157,${a})`;
          ctx.beginPath(); ctx.arc(rx, ry, 2.4 + (i % 3) * 1.1, 0, Math.PI * 2); ctx.fill();
        }
        const coreR = 9 + Math.sin(t * 3.4) * 2;
        const cg = ctx.createRadialGradient(0, 0, 2, 0, 0, coreR + 14);
        cg.addColorStop(0, 'rgba(254,252,232,0.96)');
        cg.addColorStop(0.5, 'rgba(190,242,100,0.68)');
        cg.addColorStop(1, 'rgba(190,242,100,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(0, 0, coreR + 14, 0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'firey': {
        const fg = ctx.createRadialGradient(0, 0, 10, 0, 0, 82);
        fg.addColorStop(0, 'rgba(251,146,60,0.7)'); fg.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(0, 0, 82, 0, Math.PI * 2); ctx.fill();
        [[-20, 6, 34], [20, 8, 32], [0, 4, 52]].forEach(([tx, ty, th], idx) => {
          const sw = Math.sin(t * 9 + idx * 2) * 6;
          const h = th + Math.sin(t * 11 + idx) * 8;
          ctx.fillStyle = idx === 2 ? 'rgba(249,115,22,0.94)' : 'rgba(239,68,68,0.86)';
          ctx.beginPath();
          ctx.moveTo(tx - 15, ty); ctx.quadraticCurveTo(tx - 10, ty - h * 0.6, tx + sw, ty - h);
          ctx.quadraticCurveTo(tx + 10, ty - h * 0.6, tx + 15, ty); ctx.closePath(); ctx.fill();
        });
        break;
      }

      case 'dark': {
        const dg = ctx.createRadialGradient(0, 0, 22, 0, 0, 132);
        dg.addColorStop(0, 'rgba(1,0,6,1)');
        dg.addColorStop(0.55, 'rgba(18,12,52,0.88)');
        dg.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(0, 0, 132, 0, Math.PI * 2); ctx.fill();

        ctx.save(); ctx.rotate(-t * 0.65);
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = i % 2 ? 'rgba(99,102,241,0.58)' : 'rgba(168,85,247,0.45)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 26 + i * 14, i * 0.9, i * 0.9 + 2.3); ctx.stroke();
        }
        ctx.restore();

        ctx.fillStyle = 'rgba(199,210,254,0.92)';
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#010008';
        ctx.beginPath(); ctx.arc(5, -3, 14, 0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'light': {
        [-36, 0, 36].forEach((ox, idx) => {
          const sw = Math.sin(t * 1.4 + idx) * 8;
          const bm = ctx.createLinearGradient(ox, -175, ox + sw, 42);
          bm.addColorStop(0, 'rgba(254,249,195,0.04)');
          bm.addColorStop(0.55, idx === 1 ? 'rgba(254,249,195,0.58)' : 'rgba(254,240,138,0.34)');
          bm.addColorStop(1, 'rgba(255,255,255,0.88)');
          ctx.fillStyle = bm;
          ctx.beginPath();
          ctx.moveTo(ox - 18, -175); ctx.lineTo(ox + 18, -175);
          ctx.lineTo(ox + 44 + sw, 38); ctx.lineTo(ox - 44 + sw, 38);
          ctx.closePath(); ctx.fill();
        });

        const lg = ctx.createRadialGradient(0, 0, 8, 0, 0, 108);
        lg.addColorStop(0, 'rgba(255,255,255,0.98)');
        lg.addColorStop(0.45, 'rgba(254,240,138,0.62)');
        lg.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(0, 0, 108, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = 'rgba(249,168,212,0.48)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 52 + Math.sin(t * 2) * 4, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(125,211,252,0.42)'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(0, 0, 68 - Math.sin(t * 2) * 4, 0, Math.PI * 2); ctx.stroke();

        ctx.save(); ctx.rotate(t * 0.6);
        ctx.strokeStyle = 'rgba(255,255,255,0.86)'; ctx.lineWidth = 2.4;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); ctx.stroke();
        }
        ctx.restore();
        break;
      }
    }

    if (isP2) {
      const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
      ctx.save();
      ctx.rotate(t * 0.65);
      ctx.strokeStyle = `rgba(249,168,212,${0.65 * pulse + 0.25})`;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(t * 3.5) * 2.5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(254,240,138,${0.7 * pulse + 0.2})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(3, -3); ctx.lineTo(10, 0); ctx.lineTo(3, 3);
      ctx.lineTo(0, 10); ctx.lineTo(-3, 3); ctx.lineTo(-10, 0); ctx.lineTo(-3, -3);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      const tagText = `★ ${Locale.t(cardName(c))}`;
      ctx.font = 'bold 11px "Gowun Batang", serif';
      const tw = ctx.measureText(tagText).width;
      const ly = -44 + Math.sin(t * 3.2) * 2.5;
      ctx.fillStyle = 'rgba(22, 6, 40, 0.84)';
      ctx.strokeStyle = 'rgba(249, 168, 212, 0.82)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-tw / 2 - 8, ly - 11, tw + 16, 17, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, 0, ly + 1);
    } else if (dist < 145) {
      const pr = Math.max(0, 1 - dist / 145);
      ctx.strokeStyle = `rgba(253,224,71,${0.25 + pr * 0.58})`;
      ctx.lineWidth = 1.7;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(0, 0, 26 + Math.sin(t * 5) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    if (c.id === 'illusion' && anomaly?.illusionDecoys) {
      for (const d of anomaly.illusionDecoys) {
        if (d.popped) continue;
        ctx.save(); ctx.translate(d.x, d.y); ctx.globalAlpha = 0.72 + 0.2 * Math.sin(t * 4);
        ctx.fillStyle = d.dress;
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-10, 12); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = d.hair; ctx.beginPath(); ctx.arc(0, -10, 9.5, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 10px "Gowun Batang", serif'; ctx.fillStyle = '#e9d5ff'; ctx.textAlign = 'center';
        ctx.fillText(Locale.t(d.name), 0, -24); ctx.restore();
      }
    }
  }

  /** 제2부 대형 사건 필드 기믹 렌더러 */
  function drawIncident(inc, now) {
    const t = now * 0.001;
    const pos = inc.pos || { x: inc.x, y: inc.y };
    ctx.save();
    ctx.translate(pos.x, pos.y);

    if (inc.anomalyType === 'local_rain') {
      const pg = ctx.createRadialGradient(0, 10, 10, 0, 10, 95);
      pg.addColorStop(0, 'rgba(56,189,248,0.42)'); pg.addColorStop(1, 'rgba(30,58,138,0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(0, 10, 95, 58, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(125,211,252,0.82)'; ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const p = (t * 2.1 + i * 0.13) % 1;
        const rx = -66 + ((i * 23) % 132);
        const ry = -84 + p * 105;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 14); ctx.stroke();
      }
      const cy = -82 + Math.sin(t * 2.4) * 5;
      ctx.fillStyle = 'rgba(30,41,59,0.92)'; ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-34, cy, 24, 0, Math.PI * 2); ctx.arc(0, cy - 10, 30, 0, Math.PI * 2); ctx.arc(34, cy, 24, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (inc.anomalyType === 'penguin_chase') {
      const lift = Math.abs(Math.sin(t * 5.2)) * 20;
      ctx.fillStyle = 'rgba(244,63,94,0.28)'; ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 34, 62, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      drawSpriteOrFallback('penguin', -64, -78 - lift, 128, 134, '#1e3a8a');
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath(); ctx.arc(-16, -28 - lift, 4.5, 0, Math.PI * 2); ctx.arc(16, -28 - lift, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (inc.anomalyType === 'phantom_school') {
      const g = ctx.createRadialGradient(0, 0, 12, 0, 0, 92);
      g.addColorStop(0, 'rgba(192,132,252,0.52)'); g.addColorStop(1, 'rgba(30,27,75,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ang = t * 1.1 + (i * Math.PI * 2) / 3;
        ctx.save(); ctx.translate(Math.cos(ang) * 52, Math.sin(ang) * 32); ctx.rotate(ang);
        ctx.fillStyle = '#7c3f1f'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.6;
        ctx.fillRect(-14, -9, 28, 18); ctx.strokeRect(-14, -9, 28, 18); ctx.restore();
      }
    } else if (inc.anomalyType === 'frozen_wall') {
      ctx.fillStyle = 'rgba(125,211,252,0.44)'; ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 2.4;
      ctx.fillRect(-58, -56, 116, 48); ctx.strokeRect(-58, -56, 116, 48);
    } else if (inc.anomalyType === 'void_shrine') {
      const r = 56 + Math.sin(t * 2.5) * 7;
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r + 24);
      g.addColorStop(0, 'rgba(255,255,255,0.92)'); g.addColorStop(0.55, 'rgba(244,63,94,0.35)'); g.addColorStop(1, 'rgba(76,5,25,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r + 24, 0, Math.PI * 2); ctx.fill();
    }

    const labelY = inc.anomalyType === 'local_rain' ? -122 : -76;
    ctx.font = 'bold 12px "Gowun Batang", serif';
    ctx.fillStyle = '#fef08a'; ctx.textAlign = 'center';
    ctx.fillText(`✦ ${Locale.t(inc.kr)}`, 0, labelY + Math.sin(t * 3.5) * 3);
    ctx.restore();
  }

  /* --------------------------------------------------------------------------
   * 메인 프레임 렌더 함수
   * ------------------------------------------------------------------------*/
  function render(now, state) {
    const {
      part = 1,
      map,
      mapId = 'town',
      zones = [],
      player,
      kero,
      buffs,
      activeCards = [],
      activeIncidents = [],
      npcs = [],
      boss = null,
      clockCircle = null,
      nextObjective = null,
      portalCounts = () => 0,
      flags = {}
    } = state;
    if (!map) return;

    const isOutdoor = mapId === 'town' || mapId === 'town_p3';
    ctx.clearRect(0, 0, cam.w, cam.h);

    let sx = 0;
    let sy = 0;
    if (flags.earthyShake > 0) {
      sx = Math.sin(now * 0.045) * flags.earthyShake;
      sy = Math.cos(now * 0.052) * flags.earthyShake;
    }

    let darkNearFactor = 0;
    for (const c of activeCards) {
      if (part !== 3 && c.id === 'dark') {
        const pos = c.pos || { x: c.x, y: c.y };
        const d = Math.hypot(player.x - pos.x, player.y - pos.y);
        if (d < 290) darkNearFactor = Math.max(darkNearFactor, 1 - d / 290);
      }
    }
    const darkBlocked = darkNearFactor > 0.25 && buffs.light <= 0;

    ctx.save();
    ctx.translate(-cam.x + sx, -cam.y + sy);

    // 1) 지형 · 도로 · 호수 · 원형 분수대 데크 · 건물
    if (isOutdoor) {
      for (const z of zones) {
        ctx.fillStyle = z.base; ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = z.grass;
        for (let gx = z.x + 32; gx < z.x + z.w - 20; gx += 80) {
          for (let gy = z.y + 32; gy < z.y + z.h - 20; gy += 80) {
            ctx.beginPath(); ctx.arc(gx, gy, 16, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.fillStyle = part === 3 ? '#273c6e' : part === 2 ? '#402c66' : '#3b2e5e';
      ctx.fillRect(320, 290, 1220, 62);
      ctx.fillRect(320, 500, 1220, 58);
      ctx.fillRect(320, 290, 62, 920);
      ctx.fillRect(865, 290, 70, 990);
      ctx.fillRect(1375, 290, 66, 780);
      if (part === 3) {
        // 아키호의 대저택으로 이어지는 서쪽 정원 석조 길
        ctx.fillRect(150, 1125, 232, 48);
      }

      if (map.waterArea) {
        const wa = map.waterArea;
        ctx.fillStyle = part === 3 ? '#0c4a6e' : '#0e376e';
        ctx.beginPath(); ctx.ellipse(wa.cx, wa.cy, wa.rx, wa.ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = part === 3 ? 'rgba(186,230,253,0.72)' : part === 2 ? 'rgba(249,168,212,0.52)' : 'rgba(125,211,252,0.55)';
        ctx.lineWidth = 3; ctx.stroke();

        ctx.fillStyle = part === 3 ? '#324873' : '#4c3e6e';
        ctx.beginPath(); ctx.arc(wa.cx, wa.cy, 98, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = part === 3 ? '#7dd3fc' : '#d97706';
        ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = 'rgba(254,240,138,0.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(wa.cx, wa.cy, 76, 0, Math.PI * 2); ctx.stroke();
      }
      for (const b of toArr(map.bridges)) {
        ctx.fillStyle = '#784421'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = part === 3 ? '#bae6fd' : '#d97706'; ctx.lineWidth = 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
      }

      ctx.fillStyle = part === 3 ? '#1e2f69' : part === 2 ? '#381e6b' : '#332266';
      ctx.beginPath(); ctx.arc(900, 1220, 130, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = part === 3 ? 'rgba(186,230,253,0.55)' : part === 2 ? 'rgba(249,168,212,0.45)' : 'rgba(250,204,21,0.38)';
      ctx.lineWidth = 2; ctx.stroke();

      for (const tr of toArr(map.trees)) {
        drawSpriteOrFallback('sakura_tree', tr.x - 40, tr.y - 48, 80, 86, '#db2777');
      }
      for (const ob of toArr(map.obstacles)) drawLandmark(ob, now, flags);
      drawSpriteOrFallback('torii', 1365, 780, 120, 90, '#dc2626');
      for (const l of toArr(map.lamps)) drawLamp(l, now, darkBlocked, part);

      if (clockCircle) {
        ctx.save(); ctx.translate(clockCircle.x, clockCircle.y); ctx.rotate(now * 0.00052);
        ctx.strokeStyle = clockCircle.ready
          ? (part === 3 ? 'rgba(186,230,253,0.92)' : part === 2 ? 'rgba(253,224,71,0.88)' : 'rgba(147,197,253,0.85)')
          : (part === 3 ? 'rgba(125,211,252,0.42)' : part === 2 ? 'rgba(249,168,212,0.38)' : 'rgba(250,204,21,0.32)');
        ctx.lineWidth = clockCircle.ready ? 2.6 : 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.stroke();
        if (part === 3) {
          // 꿈결 시계 눈금 12개 + 7각 별 마법진
          for (let i = 0; i < 12; i++) {
            const a = (i * Math.PI) / 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 62, Math.sin(a) * 62);
            ctx.lineTo(Math.cos(a) * 72, Math.sin(a) * 72);
            ctx.stroke();
          }
          for (let i = 0; i < 7; i++) {
            const a1 = (i * 2 * Math.PI) / 7 - Math.PI / 2;
            const a2 = (((i + 3) % 7) * 2 * Math.PI) / 7 - Math.PI / 2;
            ctx.beginPath(); ctx.moveTo(Math.cos(a1) * 56, Math.sin(a1) * 56); ctx.lineTo(Math.cos(a2) * 56, Math.sin(a2) * 56); ctx.stroke();
          }
        } else {
          const pts = part === 2 ? 5 : 6;
          for (let i = 0; i < pts; i++) {
            const a1 = (i * 2 * Math.PI) / pts - (part === 2 ? Math.PI / 2 : 0);
            const a2 = (((i + 2) % pts) * 2 * Math.PI) / pts - (part === 2 ? Math.PI / 2 : 0);
            ctx.beginPath(); ctx.moveTo(Math.cos(a1) * 56, Math.sin(a1) * 56); ctx.lineTo(Math.cos(a2) * 56, Math.sin(a2) * 56); ctx.stroke();
          }
        }
        ctx.restore();
      }
    } else {
      drawIndoorMap(map, mapId, now, part, !!flags.mazeActive);
    }

    // 2) 포털
    for (const p of toArr(map.portals)) {
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.006);
      const isOutTarget = p.targetMap === 'town' || p.targetMap === 'town_p3';
      const rem = !isOutTarget ? portalCounts(p.targetMap) : 0;
      const col = part === 3 ? '125,211,252' : part === 2 ? '249,168,212' : '103,232,249';
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 34);
      g.addColorStop(0, `rgba(${col},${0.65 * pulse})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = part === 3 ? '#bae6fd' : part === 2 ? '#f9a8d4' : '#67e8f9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 11, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.font = 'bold 11px "Gowun Batang", serif';
      ctx.fillStyle = rem ? '#fef08a' : (part === 3 ? '#e0f2fe' : part === 2 ? '#fbcfe8' : '#a5f3fc');
      ctx.textAlign = 'center';
      const mark = part === 3 ? '💎' : part === 2 ? '★' : '';
      ctx.fillText(`◈ ${Locale.t(p.label)}${rem ? ` (${mark}${rem})` : ''}`, p.x, p.y - 16);
    }

    // 3) 카드 이상 현상 & 제2부 대형 사건
    for (const c of activeCards) drawCardAnomaly(c, state, now);
    for (const inc of activeIncidents) drawIncident(inc, now);

    // 4) 최종 보스
    if (boss) {
      const by = boss.y + Math.sin(now * 0.004) * 6;
      if (boss.type === 'yue') {
        const yg = ctx.createRadialGradient(boss.x, by, 6, boss.x, by, 50);
        yg.addColorStop(0, 'rgba(186,230,253,0.75)'); yg.addColorStop(1, 'rgba(186,230,253,0)');
        ctx.fillStyle = yg; ctx.beginPath(); ctx.arc(boss.x, by, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(boss.x, by); ctx.quadraticCurveTo(boss.x - 36, by - 24, boss.x - 26, by + 10);
        ctx.moveTo(boss.x, by); ctx.quadraticCurveTo(boss.x + 36, by - 24, boss.x + 26, by + 10);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath(); ctx.moveTo(boss.x, by - 6); ctx.lineTo(boss.x - 12, by + 18); ctx.lineTo(boss.x + 12, by + 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(boss.x, by - 12, 10, 0, Math.PI * 2); ctx.fill();
      } else if (boss.type === 'kaito') {
        const kg = ctx.createRadialGradient(boss.x, by, 8, boss.x, by, 58);
        kg.addColorStop(0, 'rgba(45,212,191,0.7)'); kg.addColorStop(0.55, 'rgba(250,204,21,0.38)'); kg.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(boss.x, by, 58, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(boss.x, by); ctx.rotate(now * 0.0012);
        ctx.strokeStyle = 'rgba(253,224,71,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
        ctx.fillStyle = '#111827'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(boss.x, by - 6); ctx.lineTo(boss.x - 13, by + 18); ctx.lineTo(boss.x + 13, by + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2e211a'; ctx.beginPath(); ctx.arc(boss.x, by - 12, 10, 0, Math.PI * 2); ctx.fill();
      } else {
        const eg = ctx.createRadialGradient(boss.x, by, 8, boss.x, by, 54);
        eg.addColorStop(0, 'rgba(253,224,71,0.68)'); eg.addColorStop(0.55, 'rgba(99,102,241,0.42)'); eg.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(boss.x, by, 54, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e1b4b'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(boss.x, by - 6); ctx.lineTo(boss.x - 13, by + 18); ctx.lineTo(boss.x + 13, by + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1e3a5f'; ctx.beginPath(); ctx.arc(boss.x, by - 12, 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = 'bold 12px "Gowun Batang", serif';
      ctx.fillStyle = boss.type === 'yue' ? '#bae6fd' : boss.type === 'kaito' ? '#5eead4' : '#fef08a';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t(boss.label), boss.x, by - 32);
    }

    // 5) NPC들 (모모 전용 토끼 인형 스프라이트 포함)
    for (const n of npcs) {
      ctx.save();
      const alpha = typeof n.alpha === 'number' ? clamp(n.alpha, 0.25, 1) : 1;
      ctx.globalAlpha = alpha;
      if (alpha < 0.92) {
        const fg = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, 28);
        fg.addColorStop(0, 'rgba(186,230,253,0.45)'); fg.addColorStop(1, 'rgba(186,230,253,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(n.x, n.y, 28, 0, Math.PI * 2); ctx.fill();
      }

      if (n.id === 'momo') {
        // 토끼 인형 모모 전용 귀여운 스프라이트
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.beginPath(); ctx.ellipse(n.x, n.y + 11, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.ellipse(n.x - 9, n.y - 2, 3.5, 8, 0.35, 0, Math.PI * 2);
        ctx.ellipse(n.x + 9, n.y - 2, 3.5, 8, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7e22ce';
        ctx.beginPath(); ctx.ellipse(n.x, n.y + 5, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(n.x, n.y - 5, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath(); ctx.arc(n.x - 2.6, n.y - 5.5, 1.3, 0, Math.PI * 2); ctx.arc(n.x + 2.6, n.y - 5.5, 1.3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 14, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = n.dressColor; ctx.beginPath(); ctx.moveTo(n.x, n.y - 4); ctx.lineTo(n.x - 11, n.y + 12); ctx.lineTo(n.x + 11, n.y + 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = n.hairColor; ctx.beginPath(); ctx.arc(n.x, n.y - 10, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffedd5'; ctx.beginPath(); ctx.arc(n.x, n.y - 9, 7, 0, Math.PI * 2); ctx.fill();
      }

      ctx.globalAlpha = Math.max(0.65, alpha);
      ctx.font = 'bold 11px "Gowun Batang", serif';
      ctx.fillStyle = n.id === 'eriol' || n.id === 'momo'
        ? '#fef08a'
        : n.id === 'kaito'
        ? '#5eead4'
        : (n.id === 'yue' || n.id === 'yukito')
        ? '#bae6fd'
        : n.id === 'syaoran'
        ? '#6ee7b7'
        : '#fbcfe8';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t(n.name), n.x, n.y - 25 + Math.sin(now * 0.004) * 2);

      if (n.sleepy) {
        const zOff = (now * 0.025) % 14;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = `rgba(186,230,253,${1 - zOff / 16})`;
        ctx.fillText('zZ', n.x + 15, n.y - 14 - zOff);
      }
      ctx.restore();
    }

    // 6) 이동 목표 링 & 방향 화살표
    if (player.targetPos && flags.showTarget) {
      ctx.strokeStyle = part === 3 ? 'rgba(186,230,253,0.82)' : part === 2 ? 'rgba(249,168,212,0.75)' : 'rgba(250,204,21,0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.targetPos.x, player.targetPos.y, 10 + Math.sin(now * 0.01) * 3, 0, Math.PI * 2); ctx.stroke();
    }

    if (nextObjective && Math.hypot(nextObjective.x - player.x, nextObjective.y - player.y) > 110) {
      const a = Math.atan2(nextObjective.y - player.y, nextObjective.x - player.x);
      ctx.save(); ctx.translate(player.x + Math.cos(a) * 42, player.y + Math.sin(a) * 42); ctx.rotate(a);
      ctx.fillStyle = nextObjective.isBoss ? 'rgba(253,224,71,0.9)' : part === 3 ? 'rgba(125,211,252,0.9)' : 'rgba(244,114,182,0.85)';
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-3, -4); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // 7) 주인공 & 케로
    drawPlayerSprite(state, now);
    if (!flags.hideKero && kero) {
      const ky = kero.y + Math.sin(kero.bob) * 4;
      const kw = Math.sin(now * 0.015) * 4;
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.ellipse(kero.x - 10, ky - 2 + kw * 0.4, 6, 3, -0.4, 0, Math.PI * 2);
      ctx.ellipse(kero.x + 10, ky - 2 + kw * 0.4, 6, 3, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(kero.x, ky, 8, 0, Math.PI * 2);
      ctx.arc(kero.x - 5, ky - 7, 3.5, 0, Math.PI * 2);
      ctx.arc(kero.x + 5, ky - 7, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath(); ctx.arc(kero.x - 2.5, ky - 1, 1.3, 0, Math.PI * 2); ctx.arc(kero.x + 2.5, ky - 1, 1.3, 0, Math.PI * 2); ctx.fill();
    }

    // 8) 필드 파티클 & 야외 벚꽃/반딧불이
    for (const fx of fieldFx) {
      ctx.globalAlpha = Math.max(0, fx.life / fx.max);
      ctx.fillStyle = fx.color;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (isOutdoor && !darkBlocked) {
      for (const p of petals) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = part === 3 ? 'rgba(251,207,232,0.82)' : 'rgba(251,207,232,0.75)';
        ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (const f of fireflies) {
        ctx.fillStyle = part === 3
          ? `rgba(186,230,253,${0.25 + 0.65 * Math.abs(Math.sin(f.p))})`
          : `rgba(254,240,138,${0.25 + 0.65 * Math.abs(Math.sin(f.p))})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // 9) 근접 대기 효과 (광과민성 안전 · 점멸 없음)
    const pierced = buffs.light > 0 ? 0.16 : 1;
    if (flags.eternalDarkness) {
      const vg = ctx.createRadialGradient(cam.w / 2, cam.h / 2, 70, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.68);
      vg.addColorStop(0, `rgba(8,4,24,${0.18 * pierced})`); vg.addColorStop(1, `rgba(2,1,12,${0.78 * pierced})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, cam.w, cam.h);
    }

    for (const c of activeCards) {
      const pos = c.pos || { x: c.x, y: c.y };
      const dist = Math.hypot(player.x - pos.x, player.y - pos.y);
      if (dist > 280) continue;
      const k = Math.max(0, 1 - dist / 280);
      if (part === 3) {
        if (c.anomalyType === 'clear_blaze') {
          ctx.fillStyle = `rgba(56,189,248,${0.14 * k})`; ctx.fillRect(0, 0, cam.w, cam.h);
        } else if (c.anomalyType === 'clear_veil') {
          ctx.fillStyle = `rgba(15,23,42,${0.28 * k * pierced})`; ctx.fillRect(0, 0, cam.w, cam.h);
        } else if (c.anomalyType === 'clear_gears') {
          ctx.fillStyle = `rgba(254,240,138,${0.12 * k})`; ctx.fillRect(0, 0, cam.w, cam.h);
        }
        continue;
      }

      if (c.id === 'dark' || c.id === 'shadow') {
        const vg = ctx.createRadialGradient(cam.w / 2, cam.h / 2, c.id === 'dark' ? 38 : 54, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.56);
        vg.addColorStop(0, `rgba(1,0,8,${(c.id === 'dark' ? 0.42 : 0.25) * k * pierced})`);
        vg.addColorStop(1, `rgba(1,0,8,${(c.id === 'dark' ? 0.97 : 0.90) * k * pierced})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, cam.w, cam.h);
      } else if (c.id === 'light') {
        ctx.fillStyle = `rgba(254,249,195,${0.44 * k})`; ctx.fillRect(0, 0, cam.w, cam.h);
        for (let i = 0; i < 14; i++) {
          const lx = (i * 113 + now * 0.03) % cam.w;
          const ly = (i * 83 + now * 0.05) % cam.h;
          ctx.fillStyle = `rgba(255,255,255,${0.7 * k})`;
          ctx.beginPath(); ctx.arc(lx, ly, 2.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
        }
      } else if (c.id === 'glow') {
        ctx.fillStyle = `rgba(190,242,100,${0.12 * k})`; ctx.fillRect(0, 0, cam.w, cam.h);
        for (let i = 0; i < 16; i++) {
          const gx = (i * 101 + Math.sin(now * 0.001 + i) * 35 + cam.w) % cam.w;
          const gy = (i * 67 + now * 0.025) % cam.h;
          ctx.fillStyle = `rgba(217,249,157,${0.72 * k})`;
          ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (c.id === 'wood') {
        for (let i = 0; i < 14; i++) {
          const wx = (i * 97 + now * 0.05) % cam.w;
          const wy = (i * 73 + now * 0.06) % cam.h;
          ctx.fillStyle = `rgba(74,222,128,${0.75 * k})`;
          ctx.beginPath(); ctx.ellipse(wx, wy, 5, 2.4, now * 0.003 + i, 0, Math.PI * 2); ctx.fill();
        }
      } else if (c.id === 'firey') {
        ctx.fillStyle = `rgba(249,115,22,${0.22 * k})`; ctx.fillRect(0, 0, cam.w, cam.h);
      } else if (c.id === 'flower') {
        ctx.fillStyle = `rgba(244,114,182,${0.12 * k})`; ctx.fillRect(0, 0, cam.w, cam.h);
        for (let i = 0; i < 18; i++) {
          const fx = (i * 97 + now * 0.04) % cam.w;
          const fy = (i * 71 + now * 0.07) % cam.h;
          ctx.fillStyle = i % 2 ? 'rgba(251,207,232,0.85)' : 'rgba(249,168,212,0.82)';
          ctx.beginPath(); ctx.ellipse(fx, fy, 4.5, 2.5, now * 0.002 + i, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // 10) 비네팅 & 미니맵
    const mv = ctx.createRadialGradient(cam.w / 2, cam.h / 2, Math.min(cam.w, cam.h) * 0.4, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.75);
    mv.addColorStop(0, 'rgba(0,0,0,0)'); mv.addColorStop(1, part === 3 ? 'rgba(8,18,40,0.34)' : 'rgba(14,6,34,0.34)');
    ctx.fillStyle = mv; ctx.fillRect(0, 0, cam.w, cam.h);

    const mw = 114;
    const mh = 92;
    const mx = cam.w - mw - 12;
    const my = 12;
    const sxm = mw / map.w;
    const sym = mh / map.h;
    ctx.fillStyle = part === 3 ? 'rgba(10,20,44,0.88)' : 'rgba(14,6,30,0.86)';
    ctx.strokeStyle = part === 3 ? 'rgba(186,230,253,0.68)' : part === 2 ? 'rgba(249,168,212,0.62)' : 'rgba(250,204,21,0.58)';
    ctx.lineWidth = 1.4;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);

    if (darkBlocked) {
      for (let ny = my + 4; ny < my + mh - 4; ny += 6) {
        ctx.fillStyle = `rgba(99,102,241,${0.18 + 0.16 * Math.sin(now * 0.01 + ny)})`;
        ctx.fillRect(mx + 4, ny, mw - 8, 2);
      }
      ctx.font = 'bold 10px "Gowun Batang", serif';
      ctx.fillStyle = '#c7d2fe';
      ctx.textAlign = 'center';
      ctx.fillText('🌑 어둠에 잠김', mx + mw / 2, my + mh / 2 + 3);
    } else {
      for (const p of toArr(map.portals)) {
        ctx.fillStyle = part === 3 ? '#7dd3fc' : part === 2 ? '#f9a8d4' : '#67e8f9';
        ctx.beginPath(); ctx.arc(mx + p.x * sxm, my + p.y * sym, 2.9, 0, Math.PI * 2); ctx.fill();
      }
      for (const inc of activeIncidents) {
        const pos = inc.pos || { x: inc.x, y: inc.y };
        ctx.fillStyle = '#fb7185';
        ctx.beginPath(); ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 3.8, 0, Math.PI * 2); ctx.fill();
      }
      for (const c of activeCards) {
        const pos = c.pos || { x: c.x, y: c.y };
        if (part === 3) {
          ctx.strokeStyle = 'rgba(224,242,254,0.92)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 4.3, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = c.acquireMode === 'event' ? '#fef08a' : '#38bdf8';
          ctx.beginPath(); ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 2.6, 0, Math.PI * 2); ctx.fill();
        } else if (part === 2) {
          ctx.strokeStyle = 'rgba(249,168,212,0.9)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 4.5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#fde047';
          ctx.beginPath(); ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 2.8, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#f472b6';
          ctx.beginPath(); ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 3.0, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const n of npcs) {
        ctx.fillStyle = n.id === 'eriol' ? '#60a5fa' : n.id === 'kaito' ? '#5eead4' : n.id === 'momo' ? '#fef08a' : (n.id === 'yue' || n.id === 'yukito') ? '#bae6fd' : '#c084fc';
        ctx.beginPath(); ctx.arc(mx + n.x * sxm, my + n.y * sym, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (boss) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(mx + boss.x * sxm, my + boss.y * sym, 4.0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(mx + player.x * sxm, my + player.y * sym, 3.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  return {
    cam,
    resize,
    snapCamera,
    updateCamera,
    updateAmbience,
    isColliding,
    burst,
    guideBeam,
    render
  };
}
