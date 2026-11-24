/**
 * ============================================================================
 * 카드캡터 3부작 공용 2D 월드 & 비주얼 렌더 엔진 (world.js)
 * - 1부(황혼) · 2부(별빛) 공용 야외/실내 맵, 고화질 캐싱 건물 & 충돌 판정
 * - 19종 크로우 카드 이상 현상 (광과민성 안전 번개·도플갱어·실제 벽 미로 등)
 * - 제2부 에리오르 6대 사건 전용 필드 기믹 (국지 폭우·추격 펭귄 괴수·환상 교실 등)
 * - 토모요/지수 마법 의상 4종 실시간 외형 반영 & 반투명 유키토(청명) 연출
 * ============================================================================
 */
import { Utils, Locale, Art } from './core.js';

const { toArr } = Utils;

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

  /** 방향성 별빛 길잡이 입자 발사 */
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
    cam.x = mapData.w <= cam.w ? -(cam.w - mapData.w) / 2 : Utils.clamp(pos.x - cam.w / 2, 0, mapData.w - cam.w);
    cam.y = mapData.h <= cam.h ? -(cam.h - mapData.h) / 2 : Utils.clamp(pos.y - cam.h / 2, 0, mapData.h - cam.h);
  }

  /** 카메라 부드러운 추적 */
  function updateCamera(dt, mapData, pos) {
    if (!mapData || !pos) return;
    const tx = mapData.w <= cam.w ? -(cam.w - mapData.w) / 2 : Utils.clamp(pos.x - cam.w / 2, 0, mapData.w - cam.w);
    const ty = mapData.h <= cam.h ? -(cam.h - mapData.h) / 2 : Utils.clamp(pos.y - cam.h / 2, 0, mapData.h - cam.h);
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

  /** 맵 경계 · 건물 · 미로 벽 · 호수 수면 충돌 판정 */
  function isColliding(mapData, mapId, nx, ny, { ignoreObs = false, mazeActive = false, penguinChasing = false } = {}) {
    if (!mapData) return false;
    const r = 14;
    if (nx < 28 || nx > mapData.w - 28 || ny < 28 || ny > mapData.h - 28) return true;
    if (ignoreObs) return false;

    for (const ob of toArr(mapData.obstacles)) {
      // 제2부 펭귄 괴수 추격 사건 중에는 원래 미끄럼틀 자리가 비어 있음
      if (penguinChasing && ob.type === 'penguin') continue;
      if (nx + r > ob.x && nx - r < ob.x + ob.w && ny + r > ob.y && ny - r < ob.y + ob.h) return true;
    }
    if (mapId === 'school' && mazeActive) {
      for (const mw of toArr(mapData.mazeWalls)) {
        if (nx + r > mw.x && nx - r < mw.x + mw.w && ny + r > mw.y && ny - r < mw.y + mw.h) return true;
      }
    }
    if (mapId === 'town' && mapData.waterArea) {
      const wa = mapData.waterArea;
      const inLake = ((nx - wa.cx) ** 2) / (wa.rx ** 2) + ((ny - wa.cy) ** 2) / (wa.ry ** 2) < 1;
      if (inLake) {
        const onBridge = toArr(mapData.bridges).some(
          (b) => nx >= b.x + 2 && nx <= b.x + b.w - 2 && ny >= b.y - 10 && ny <= b.y + b.h + 10
        );
        if (!onBridge) return true;
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

  function drawLamp(l, now) {
    const pulse = 0.88 + 0.12 * Math.sin(now * 0.004 + l.x);
    ctx.save();
    const grad = ctx.createRadialGradient(l.x, l.y - 16, 4, l.x, l.y - 16, 62 * pulse);
    grad.addColorStop(0, l.type === 'lantern' ? 'rgba(251,146,60,0.45)' : 'rgba(254,240,138,0.36)');
    grad.addColorStop(1, 'rgba(254,240,138,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y - 16, 62 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillRect(l.x - 2, l.y - 14, 4, 18);
    ctx.fillStyle = '#fef08a';
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
    } else if (ob.type === 'penguin') {
      // 제2부 펭귄 추격 사건 활성 시 고정 미끄럼틀 대신 빈 받침대만 표시
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
      drawSpriteOrFallback('fountain', ob.x - 10, ob.y - 10, ob.w + 20, ob.h + 20, '#0284c7');
      const w = 18 + Math.sin(now * (flags.wateryActive ? 0.015 : 0.005)) * 8;
      ctx.strokeStyle = 'rgba(186,230,253,0.75)';
      ctx.lineWidth = flags.wateryActive ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, w, 0, Math.PI * 2);
      ctx.stroke();
      if (flags.wateryActive) {
        const jetH = 58 + Math.sin(t * 11) * 14;
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
      ctx.fillText(Locale.t(ob.label), ob.x + ob.w / 2, ob.y - (ob.type === 'clock' ? 48 : 26));
    }
    ctx.restore();
  }

  function drawIndoorMap(mapData, mapId, now, part, mazeActive) {
    const isP2 = part === 2;
    if (mapId === 'school') {
      ctx.fillStyle = isP2 ? '#251a46' : '#211c42';
      ctx.fillRect(0, 0, mapData.w, mapData.h);
      ctx.fillStyle = isP2 ? '#362354' : '#31254f';
      ctx.fillRect(30, 30, mapData.w - 60, 240);
      ctx.fillStyle = isP2 ? '#2b2054' : '#282150';
      ctx.fillRect(30, 294, mapData.w - 60, 175);
      ctx.fillStyle = isP2 ? '#30214c' : '#2c2348';
      ctx.fillRect(30, 469, mapData.w - 60, 260);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let y = 40; y < mapData.h - 30; y += 22) {
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(mapData.w - 30, y);
        ctx.stroke();
      }
      ctx.fillStyle = isP2 ? 'rgba(251,207,232,0.08)' : 'rgba(254,240,138,0.08)';
      [150, 520, 880].forEach((wx) => {
        ctx.beginPath();
        ctx.moveTo(wx - 50, 30);
        ctx.lineTo(wx + 50, 30);
        ctx.lineTo(wx + 95, 220);
        ctx.lineTo(wx - 20, 220);
        ctx.closePath();
        ctx.fill();
      });
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = isP2 ? 'rgba(251,207,232,0.6)' : 'rgba(254,240,138,0.58)';
      ctx.textAlign = 'center';
      ctx.fillText('도서실', 190, 62);
      ctx.fillText('4학년 2반 교실', 535, 62);
      ctx.fillText('과학실', 895, 62);
      ctx.fillText('음악실', 200, 515);
    } else if (mapId === 'shrine') {
      ctx.fillStyle = isP2 ? '#281338' : '#251433';
      ctx.fillRect(0, 0, mapData.w, mapData.h);
      ctx.fillStyle = '#3d2c4c';
      ctx.fillRect(435, 190, 130, 520);
      ctx.strokeStyle = isP2 ? 'rgba(249,168,212,0.22)' : 'rgba(250,204,21,0.2)';
      ctx.lineWidth = 1.5;
      for (let sy = 210; sy < 700; sy += 36) ctx.strokeRect(442, sy, 116, 30);
      [[410, 310], [590, 310], [410, 500], [590, 500], [290, 210], [720, 210]].forEach(([lx, ly]) =>
        drawLamp({ x: lx, y: ly, type: 'lantern' }, now)
      );
    } else if (mapId === 'house') {
      ctx.fillStyle = isP2 ? '#30173d' : '#2c1a38';
      ctx.fillRect(0, 0, mapData.w, mapData.h);
      ctx.fillStyle = isP2 ? '#4f1838' : '#471a33';
      ctx.fillRect(65, 175, 340, 360);
      ctx.strokeStyle = isP2 ? 'rgba(249,168,212,0.42)' : 'rgba(250,204,21,0.38)';
      ctx.lineWidth = 2;
      ctx.strokeRect(75, 185, 320, 340);
      ctx.fillStyle = '#351f49';
      ctx.fillRect(472, 30, 418, 315);
      ctx.fillStyle = '#291838';
      ctx.fillRect(472, 367, 418, 303);
      ctx.font = 'bold 14px "Gowun Batang", serif';
      ctx.fillStyle = isP2 ? 'rgba(251,207,232,0.6)' : 'rgba(254,240,138,0.58)';
      ctx.textAlign = 'center';
      ctx.fillText('지하 서재', 235, 62);
      ctx.fillText('2층 거울 복도', 690, 62);
      ctx.fillText('다락방 서고', 690, 405);
    }

    ctx.strokeStyle = isP2 ? 'rgba(249,168,212,0.48)' : 'rgba(250,204,21,0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, mapData.w - 48, mapData.h - 48);

    for (const ob of toArr(mapData.obstacles)) {
      ctx.save();
      if (ob.type === 'wall') {
        ctx.fillStyle = '#46316b';
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
        ctx.strokeStyle = 'rgba(253,224,71,0.28)';
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

    if (mapId === 'school' && mazeActive) {
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

  /** 마법 의상 4종 실시간 반영 주인공 캐릭터 스프라이트 */
  function drawProtagonistChar(x, y, walk, costume, overrideColors = null) {
    const step = Math.sin(walk) * 2.5;
    const dress = overrideColors?.dress || costume?.dressColor || '#f472b6';
    const accent = overrideColors?.accent || costume?.accentColor || '#fff1f2';
    const hatCol = overrideColors?.hat || costume?.hatColor || '#f43f5e';
    const hatType = overrideColors?.hatType || costume?.hatType || 'beret';

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

    // 의상 포인트 리본/장식
    if (hatType === 'cat') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x - 4, y + 1, 8, 3);
    } else if (hatType === 'crown') {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.2;
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
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.arc(x, y - 9, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // 의상별 모자 / 머리 장식
    if (hatType === 'cat') {
      // 고양이 귀 번개 슈트
      ctx.fillStyle = hatCol;
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 14);
      ctx.lineTo(x - 7, y - 24);
      ctx.lineTo(x - 2, y - 17);
      ctx.moveTo(x + 10, y - 14);
      ctx.lineTo(x + 7, y - 24);
      ctx.lineTo(x + 2, y - 17);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(x - 6.5, y - 19, 1.8, 0, Math.PI * 2);
      ctx.arc(x + 6.5, y - 19, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatType === 'wing') {
      // 하늘빛 날개 드레스 리본
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x - 9, y - 18, 5.5, 3, -0.45, 0, Math.PI * 2);
      ctx.ellipse(x + 9, y - 18, 5.5, 3, 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(x, y - 18, 2.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatType === 'crown') {
      // 황혼/별빛 로열 왕관
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#be185d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 17);
      ctx.lineTo(x - 5, y - 24);
      ctx.lineTo(x - 1, y - 20);
      ctx.lineTo(x + 1, y - 25);
      ctx.lineTo(x + 4, y - 20);
      ctx.lineTo(x + 7, y - 24);
      ctx.lineTo(x + 7, y - 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // 기본 베레모
      ctx.fillStyle = hatCol;
      ctx.beginPath();
      ctx.ellipse(x, y - 18, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(x, y - 19, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayerSprite(state, now) {
    const { player, buffs, costume, part, flags } = state;
    ctx.save();
    const flying = buffs.fly > 0 || buffs.flyLand;
    const lift = flying ? 18 + Math.sin(now * 0.01) * 5 : 0;
    ctx.translate(player.x, player.y);

    // 그림자(섀도) 근접 시 발밑 그림자 꿈틀거림
    const shadowNear = !!flags.shadowNearPlayer;
    ctx.fillStyle = shadowNear ? 'rgba(5,2,20,0.85)' : 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(
      shadowNear ? Math.sin(now * 0.006) * 8 : 0,
      14,
      shadowNear ? 24 : Math.max(6, 12 - lift * 0.2),
      shadowNear ? 9 : 5,
      0, 0, Math.PI * 2
    );
    ctx.fill();

    if (buffs.glow > 0) {
      for (let i = 0; i < 6; i++) {
        const a = now * 0.004 + (i * Math.PI) / 3;
        ctx.fillStyle = 'rgba(190,242,100,0.9)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 24, Math.sin(a) * 14 - lift, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (buffs.light > 0) {
      const lg = ctx.createRadialGradient(0, -lift, 8, 0, -lift, 88);
      lg.addColorStop(0, 'rgba(254,249,195,0.42)');
      lg.addColorStop(1, 'rgba(254,249,195,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(0, -lift, 88, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(0, -lift);

    if (flying) {
      const fl = Math.sin(now * 0.018) * 7;
      ctx.fillStyle = flags.isSakuraFly ? 'rgba(251,207,232,0.96)' : 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.quadraticCurveTo(-30, -22 - fl, -25, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, -2);
      ctx.quadraticCurveTo(30, -22 - fl, 25, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (buffs.wind > 0) {
      ctx.strokeStyle = part === 2 ? 'rgba(249,168,212,0.75)' : 'rgba(56,189,248,0.72)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 6, 22, 9, Math.sin(now * 0.008) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawProtagonistChar(0, 0, player.walk, costume);

    // 1부 봉인의 지팡이 vs 2부 별의 지팡이
    ctx.strokeStyle = part === 2 ? '#f472b6' : '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(11, -14);
    ctx.lineTo(11, 10);
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(11, -16.5, part === 2 ? 5.2 : 4.2, 0, Math.PI * 2);
    ctx.fill();
    if (part === 2) {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    if (buffs.shield) {
      ctx.strokeStyle = part === 2 ? 'rgba(251,207,232,0.9)' : 'rgba(253,224,71,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 19종 크로우 카드 / 서브 별빛 공명 이상 현상 렌더러 (광과민성 안전) */
  function drawCardAnomaly(c, state, now) {
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
          ctx.beginPath();
          ctx.arc(0, 0, 18 + i * 11, a, a + 2.1);
          ctx.stroke();
        }
        break;
      case 'fly': {
        const sx = Math.cos(t * 1.45) * 44;
        const sy = Math.sin(t * 2.9) * 18 - 10;
        const flap = Math.sin(t * 7.5) * 14;
        ctx.fillStyle = 'rgba(248,250,252,0.18)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 26, 42, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = isP2 ? 'rgba(255,241,242,0.85)' : 'rgba(248,250,252,0.82)';
        ctx.strokeStyle = isP2 ? '#f472b6' : 'rgba(253,224,71,0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.quadraticCurveTo(-24, -22 - flap, -46, -6 - flap * 0.6);
        ctx.quadraticCurveTo(-22, 6, 0, 12);
        ctx.quadraticCurveTo(22, 6, 46, -6 - flap * 0.6);
        ctx.quadraticCurveTo(24, -22 - flap, 0, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'wood': {
        const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 68);
        g.addColorStop(0, 'rgba(34,197,94,0.34)');
        g.addColorStop(1, 'rgba(21,128,61,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 68, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + Math.sin(t + i) * 0.12;
          const l = 46 + Math.sin(t * 2.2 + i * 1.3) * 14;
          ctx.strokeStyle = i % 2 ? '#4ade80' : '#22c55e';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(Math.cos(a + 0.35) * l * 0.5, Math.sin(a + 0.35) * l * 0.5, Math.cos(a) * l, Math.sin(a) * l);
          ctx.stroke();
        }
        break;
      }
      case 'shield': {
        const rad = 52 * (1 + Math.sin(t * 3.2) * 0.06);
        const g = ctx.createRadialGradient(0, 0, 12, 0, 0, rad);
        g.addColorStop(0, 'rgba(254,240,138,0.1)');
        g.addColorStop(0.75, 'rgba(250,204,21,0.28)');
        g.addColorStop(1, 'rgba(250,204,21,0.58)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(254,240,138,0.88)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = t * 0.45 + (i * Math.PI) / 3;
          i === 0 ? ctx.moveTo(Math.cos(a) * rad * 0.82, Math.sin(a) * rad * 0.82) : ctx.lineTo(Math.cos(a) * rad * 0.82, Math.sin(a) * rad * 0.82);
        }
        ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'jump':
        [[-28, 12, 0, '#f472b6', 7], [26, -8, 1.7, '#fde047', 6], [0, 6, 3.1, '#38bdf8', 9], [-14, -22, 4.4, '#c084fc', 5.5]].forEach(([ox, oy, ph, col, r]) => {
          const b = Math.abs(Math.sin(t * 3.8 + ph));
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(ox, oy + 8, r * (1.1 - b * 0.4), 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(ox, oy - b * 42, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        });
        break;
      case 'mirror': {
        const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 58);
        g.addColorStop(0, 'rgba(186,230,253,0.45)');
        g.addColorStop(1, 'rgba(125,211,252,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, 52, 36, 0, 0, Math.PI * 2);
        ctx.fill();
        const trail = anomaly?.mirrorTrail?.[0] || { x: player.x, y: player.y, walk: 0 };
        const dx = Utils.clamp(-(trail.x - pos.x) * 0.35, -55, 55);
        const dy = Utils.clamp((trail.y - pos.y) * 0.22, -35, 35);
        ctx.save();
        ctx.translate(dx, dy);
        ctx.globalAlpha = 0.8;
        drawProtagonistChar(0, 0, trail.walk, state.costume, { dress: '#bae6fd', hat: '#38bdf8', accent: '#ffffff' });
        ctx.font = 'bold 10px "Gowun Batang", serif';
        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.fillText(Locale.t('사쿠라...?'), 0, -26);
        ctx.restore();
        break;
      }
      case 'flower': {
        const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 64);
        g.addColorStop(0, 'rgba(244,114,182,0.38)');
        g.addColorStop(1, 'rgba(244,114,182,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 64, 0, Math.PI * 2);
        ctx.fill();
        [[-24, -10], [22, -12], [-18, 18], [22, 16], [0, 0]].forEach(([bx, by], idx) => {
          ctx.save();
          ctx.translate(bx, by);
          for (let p = 0; p < 5; p++) {
            const pa = (p * Math.PI * 2) / 5 + t * 0.4;
            ctx.fillStyle = idx % 2 ? '#fb7185' : '#fbcfe8';
            ctx.beginPath();
            ctx.ellipse(Math.cos(pa) * 6, Math.sin(pa) * 6, 5.5, 3.5, pa, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        break;
      }
      case 'thunder': {
        // 광과민성 안전 번개: 점멸(플래시) 없이 부드러운 회전 정전기 띠 & 잔잔한 스파크
        const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 66);
        g.addColorStop(0, 'rgba(56,189,248,0.44)');
        g.addColorStop(0.55, 'rgba(30,27,75,0.45)');
        g.addColorStop(1, 'rgba(30,27,75,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 66, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          const ang = t * 1.35 + i * 2.1;
          ctx.strokeStyle = i === 0 ? 'rgba(253,224,71,0.82)' : 'rgba(125,211,252,0.78)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(0, 0, 20 + i * 13, ang, ang + 1.45);
          ctx.stroke();
        }
        for (let s = 0; s < 8; s++) {
          const a = t * 1.4 + s * 0.78;
          ctx.fillStyle = s % 2 ? '#fde047' : '#7dd3fc';
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (22 + (s % 3) * 12), Math.sin(a) * (16 + (s % 2) * 10), 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'maze': {
        const ph = 0.55 + 0.35 * Math.sin(t * 2.2);
        ctx.strokeStyle = `rgba(203,213,225,${ph})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(-44, -36, 88, 72);
        ctx.strokeStyle = `rgba(253,224,71,${ph * 0.78})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(-28, -22, 56, 44);
        break;
      }
      case 'shadow': {
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 66);
        g.addColorStop(0, 'rgba(5,3,18,0.94)');
        g.addColorStop(0.65, 'rgba(49,46,129,0.45)');
        g.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 66, 0, Math.PI * 2);
        ctx.fill();
        const dirP = Math.atan2(player.y - pos.y, player.x - pos.x);
        for (let i = 0; i < 6; i++) {
          const a = i === 0 && dist < 250 ? dirP : (i * Math.PI) / 3 + Math.sin(t * 1.8 + i) * 0.25;
          const r = i === 0 && dist < 250 ? Math.min(82, dist * 0.55) : 42 + Math.sin(t * 3 + i) * 10;
          ctx.strokeStyle = 'rgba(12,8,34,0.94)';
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(Math.cos(a + 0.35) * r * 0.5, Math.sin(a + 0.35) * r * 0.5, Math.cos(a) * r, Math.sin(a) * r);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(199,210,254,0.88)';
        ctx.beginPath();
        ctx.ellipse(-8, -4, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.ellipse(8, -4, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'illusion':
        for (let i = 0; i < 4; i++) {
          const ox = Math.cos(t * 0.9 + i * 1.7) * 20;
          const oy = Math.sin(t * 1.1 + i * 1.4) * 14;
          const f = ctx.createRadialGradient(ox, oy, 4, ox, oy, 48);
          f.addColorStop(0, 'rgba(192,132,252,0.42)');
          f.addColorStop(1, 'rgba(126,34,206,0)');
          ctx.fillStyle = f;
          ctx.beginPath();
          ctx.arc(ox, oy, 48, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'sword':
        for (let i = 0; i < 2; i++) {
          const sp = (t * 2.2 + i * 0.5) % 1;
          const al = Math.sin(sp * Math.PI);
          ctx.save();
          ctx.rotate(i * 1.6 + Math.floor(t * 2.2) * 0.9);
          ctx.strokeStyle = `rgba(248,250,252,${al * 0.92})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, 34, -0.9 + sp * 1.2, 0.3 + sp * 1.2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(253,224,71,${al * 0.78})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, 38, -0.7 + sp * 1.2, 0.2 + sp * 1.2);
          ctx.stroke();
          ctx.restore();
        }
        break;
      case 'earthy':
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + 0.2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 36);
          ctx.stroke();
        }
        [[-22, 4, 24], [18, 6, 20], [0, -4, 30]].forEach(([rx, ry, rh], idx) => {
          const jt = Math.sin(t * 24 + idx * 2) * 1.8;
          const lf = Math.abs(Math.sin(t * 2.1 + idx)) * 8;
          ctx.fillStyle = idx === 2 ? '#b45309' : '#78350f';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(rx - 12 + jt, ry + 10);
          ctx.lineTo(rx - 4 + jt, ry - rh - lf);
          ctx.lineTo(rx + 10 + jt, ry + 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
        break;
      case 'erase': {
        const r = 34 + Math.sin(t * 2.4) * 5;
        const g = ctx.createRadialGradient(0, 0, 6, 0, 0, r + 18);
        g.addColorStop(0, 'rgba(255,255,255,0.92)');
        g.addColorStop(0.55, 'rgba(226,232,240,0.52)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r + 18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'watery': {
        for (let w = 0; w < 3; w++) {
          const wr = 18 + ((t * 32 + w * 20) % 52);
          ctx.strokeStyle = `rgba(125,211,252,${Math.max(0, 0.78 - wr / 68)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(0, 8, wr, wr * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        const ch = 40 + Math.sin(t * 5.2) * 10;
        const wg = ctx.createLinearGradient(0, 12, 0, -ch);
        wg.addColorStop(0, 'rgba(37,99,235,0.88)');
        wg.addColorStop(1, 'rgba(224,242,254,0.95)');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(-16, 10);
        ctx.quadraticCurveTo(-8, -ch * 0.5, -10, -ch);
        ctx.quadraticCurveTo(0, -ch - 12, 10, -ch);
        ctx.quadraticCurveTo(8, -ch * 0.5, 16, 10);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'glow':
        for (let i = 0; i < 16; i++) {
          const p = t * 1.6 + i * 0.42;
          const a = 0.45 + 0.55 * Math.sin(t * 5 + i);
          ctx.fillStyle = i % 2 ? `rgba(254,240,138,${a})` : `rgba(217,249,157,${a})`;
          ctx.beginPath();
          ctx.arc(Math.sin(p) * 38, Math.sin(p * 2) * 18 + Math.cos(p * 0.7 + i) * 10, 2.5 + (i % 3) * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'firey': {
        const fg = ctx.createRadialGradient(0, 0, 8, 0, 0, 74);
        fg.addColorStop(0, 'rgba(251,146,60,0.65)');
        fg.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(0, 0, 74, 0, Math.PI * 2);
        ctx.fill();
        [[-18, 6, 30], [18, 8, 28], [0, 4, 46]].forEach(([tx, ty, th], idx) => {
          const sw = Math.sin(t * 9 + idx * 2) * 6;
          const h = th + Math.sin(t * 11 + idx) * 8;
          ctx.fillStyle = idx === 2 ? 'rgba(249,115,22,0.92)' : 'rgba(239,68,68,0.84)';
          ctx.beginPath();
          ctx.moveTo(tx - 14, ty);
          ctx.quadraticCurveTo(tx - 10, ty - h * 0.6, tx + sw, ty - h);
          ctx.quadraticCurveTo(tx + 10, ty - h * 0.6, tx + 14, ty);
          ctx.closePath();
          ctx.fill();
        });
        break;
      }
      case 'dark': {
        const dg = ctx.createRadialGradient(0, 0, 16, 0, 0, 88);
        dg.addColorStop(0, 'rgba(2,1,10,0.98)');
        dg.addColorStop(0.65, 'rgba(24,20,64,0.82)');
        dg.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(0, 0, 88, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(165,180,252,0.82)';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#02010a';
        ctx.beginPath();
        ctx.arc(4, -2, 8.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'light': {
        const bm = ctx.createLinearGradient(0, -145, 0, 34);
        bm.addColorStop(0, 'rgba(254,249,195,0.06)');
        bm.addColorStop(1, 'rgba(255,255,255,0.86)');
        ctx.fillStyle = bm;
        ctx.beginPath();
        ctx.moveTo(-24, -145);
        ctx.lineTo(24, -145);
        ctx.lineTo(52, 30);
        ctx.lineTo(-52, 30);
        ctx.closePath();
        ctx.fill();
        const lg = ctx.createRadialGradient(0, 0, 6, 0, 0, 76);
        lg.addColorStop(0, 'rgba(255,255,255,0.94)');
        lg.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(0, 0, 76, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    // 2부 서브 공명 지점은 작은 분홍 별빛 테두리 추가
    if (isP2 || dist < 145) {
      const pr = Math.max(0, 1 - dist / 145);
      ctx.strokeStyle = isP2 ? `rgba(249,168,212,${0.38 + pr * 0.55})` : `rgba(253,224,71,${0.25 + pr * 0.58})`;
      ctx.lineWidth = 1.7;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 26 + Math.sin(t * 5) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // 환상 가짜 분신 (학교 도서실)
    if (c.id === 'illusion' && anomaly?.illusionDecoys) {
      for (const d of anomaly.illusionDecoys) {
        if (d.popped) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.globalAlpha = 0.72 + 0.2 * Math.sin(t * 4);
        ctx.fillStyle = d.dress;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(-10, 12);
        ctx.lineTo(10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = d.hair;
        ctx.beginPath();
        ctx.arc(0, -10, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 10px "Gowun Batang", serif';
        ctx.fillStyle = '#e9d5ff';
        ctx.textAlign = 'center';
        ctx.fillText(Locale.t(d.name), 0, -24);
        ctx.restore();
      }
    }
  }

  /** 제2부 에리오르 6대 사건 전용 대형 필드 기믹 렌더러 */
  function drawIncident(inc, now) {
    const t = now * 0.001;
    const pos = inc.pos || { x: inc.x, y: inc.y };
    ctx.save();
    ctx.translate(pos.x, pos.y);

    if (inc.anomalyType === 'local_rain') {
      // 제1사건: 사쿠라 집 앞 국지성 폭우 & 먹구름
      const pg = ctx.createRadialGradient(0, 10, 10, 0, 10, 95);
      pg.addColorStop(0, 'rgba(56,189,248,0.42)');
      pg.addColorStop(1, 'rgba(30,58,138,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(0, 10, 95, 58, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let r = 0; r < 3; r++) {
        const rr = 14 + ((t * 42 + r * 26) % 68);
        ctx.strokeStyle = `rgba(186,230,253,${Math.max(0, 0.72 - rr / 75)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 12, rr, rr * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(125,211,252,0.82)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const p = (t * 2.1 + i * 0.13) % 1;
        const rx = -66 + ((i * 23) % 132);
        const ry = -84 + p * 105;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 6, ry + 14);
        ctx.stroke();
      }
      // 먹구름 본체
      const cy = -82 + Math.sin(t * 2.4) * 5;
      ctx.fillStyle = 'rgba(30,41,59,0.92)';
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-34, cy, 24, 0, Math.PI * 2);
      ctx.arc(0, cy - 10, 30, 0, Math.PI * 2);
      ctx.arc(34, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (inc.anomalyType === 'penguin_chase') {
      // 제2사건: 깨어나 사쿠라를 추격하는 거대 펭귄 괴수!
      const bounce = Math.abs(Math.sin(t * 5.2));
      const lift = bounce * 20;
      ctx.fillStyle = 'rgba(244,63,94,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 34, 62, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      drawSpriteOrFallback('penguin', -64, -78 - lift, 128, 134, '#1e3a8a');
      // 붉게 빛나는 눈 오버레이
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(-16, -28 - lift, 4.5, 0, Math.PI * 2);
      ctx.arc(16, -28 - lift, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (inc.anomalyType === 'phantom_school') {
      // 제3사건: 뒤틀린 환상 교실 (공중 부양 책상 & 보랏빛 파동)
      const g = ctx.createRadialGradient(0, 0, 12, 0, 0, 92);
      g.addColorStop(0, 'rgba(192,132,252,0.52)');
      g.addColorStop(0.6, 'rgba(126,34,206,0.28)');
      g.addColorStop(1, 'rgba(30,27,75,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 92, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ang = t * 1.1 + (i * Math.PI * 2) / 3;
        ctx.save();
        ctx.translate(Math.cos(ang) * 52, Math.sin(ang) * 32);
        ctx.rotate(ang);
        ctx.fillStyle = '#7c3f1f';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.6;
        ctx.fillRect(-14, -9, 28, 18);
        ctx.strokeRect(-14, -9, 28, 18);
        ctx.restore();
      }
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 42 + Math.sin(t * 3) * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (inc.anomalyType === 'frozen_wall') {
      // 제4사건: 허공에 멈춘 호수 수벽 & 스피넬 썬 오라
      const g = ctx.createRadialGradient(0, -10, 10, 0, -10, 96);
      g.addColorStop(0, 'rgba(56,189,248,0.52)');
      g.addColorStop(0.6, 'rgba(30,27,75,0.45)');
      g.addColorStop(1, 'rgba(2,6,23,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -10, 96, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(125,211,252,0.42)';
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 2.4;
      ctx.fillRect(-58, -56, 116, 48);
      ctx.strokeRect(-58, -56, 116, 48);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#38bdf8' : '#2dd4bf';
        ctx.beginPath();
        ctx.arc(-44 + i * 13, -34 + Math.sin(t * 2 + i) * 14, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (inc.anomalyType === 'void_shrine') {
      // 제5사건: 하얗게 지워지는 신사 바닥 & 루비 문 진홍 나비
      const r = 56 + Math.sin(t * 2.5) * 7;
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r + 24);
      g.addColorStop(0, 'rgba(255,255,255,0.92)');
      g.addColorStop(0.55, 'rgba(244,63,94,0.35)');
      g.addColorStop(1, 'rgba(76,5,25,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r + 24, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = t * 1.5 + (i * Math.PI) / 3;
        const bx = Math.cos(a) * 48;
        const by = Math.sin(a) * 30 - 12;
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.ellipse(bx - 4, by, 5, 3, -0.4, 0, Math.PI * 2);
        ctx.ellipse(bx + 4, by, 5, 3, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 사건 이름표 배지
    const labelY = inc.anomalyType === 'local_rain' ? -122 : -76;
    ctx.font = 'bold 12px "Gowun Batang", serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
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

    ctx.clearRect(0, 0, cam.w, cam.h);

    // 대지 진동(earthy 근접 시)
    let sx = 0;
    let sy = 0;
    if (flags.earthyShake > 0) {
      sx = Math.sin(now * 0.045) * flags.earthyShake;
      sy = Math.cos(now * 0.052) * flags.earthyShake;
    }

    ctx.save();
    ctx.translate(-cam.x + sx, -cam.y + sy);

    // 1) 지형 · 도로 · 호수 · 건물
    if (mapId === 'town') {
      for (const z of zones) {
        ctx.fillStyle = z.base;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = z.grass;
        for (let gx = z.x + 32; gx < z.x + z.w - 20; gx += 80) {
          for (let gy = z.y + 32; gy < z.y + z.h - 20; gy += 80) {
            ctx.beginPath();
            ctx.arc(gx, gy, 16, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // 마을 도로
      ctx.fillStyle = part === 2 ? '#402c66' : '#3b2e5e';
      ctx.fillRect(320, 290, 1220, 62);
      ctx.fillRect(320, 500, 1220, 58);
      ctx.fillRect(320, 290, 62, 920);
      ctx.fillRect(865, 290, 70, 990);
      ctx.fillRect(1375, 290, 66, 780);

      // 호수 & 다리
      if (map.waterArea) {
        const wa = map.waterArea;
        ctx.fillStyle = '#0e376e';
        ctx.beginPath();
        ctx.ellipse(wa.cx, wa.cy, wa.rx, wa.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = part === 2 ? 'rgba(249,168,212,0.52)' : 'rgba(125,211,252,0.55)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      for (const b of toArr(map.bridges)) {
        ctx.fillStyle = '#784421';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }

      // 시계탑 원형 광장
      ctx.fillStyle = part === 2 ? '#381e6b' : '#332266';
      ctx.beginPath();
      ctx.arc(900, 1220, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = part === 2 ? 'rgba(249,168,212,0.45)' : 'rgba(250,204,21,0.38)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 고화질 캐싱 벚꽃나무, 건물, 도리이, 가로등
      for (const tr of toArr(map.trees)) {
        drawSpriteOrFallback('sakura_tree', tr.x - 40, tr.y - 48, 80, 86, '#db2777');
      }
      for (const ob of toArr(map.obstacles)) {
        drawLandmark(ob, now, flags);
      }
      drawSpriteOrFallback('torii', 1365, 780, 120, 90, '#dc2626');
      for (const l of toArr(map.lamps)) drawLamp(l, now);

      // 시계탑 광장 마법진 (1부: 6망성 달 / 2부: 5망성 별)
      if (clockCircle) {
        ctx.save();
        ctx.translate(clockCircle.x, clockCircle.y);
        ctx.rotate(now * 0.00052);
        ctx.strokeStyle = clockCircle.ready
          ? (part === 2 ? 'rgba(253,224,71,0.88)' : 'rgba(147,197,253,0.85)')
          : (part === 2 ? 'rgba(249,168,212,0.38)' : 'rgba(250,204,21,0.32)');
        ctx.lineWidth = clockCircle.ready ? 2.6 : 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 74, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 56, 0, Math.PI * 2);
        ctx.stroke();
        if (part === 2) {
          for (let i = 0; i < 5; i++) {
            const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            const a2 = (((i + 2) % 5) * 2 * Math.PI) / 5 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a1) * 56, Math.sin(a1) * 56);
            ctx.lineTo(Math.cos(a2) * 56, Math.sin(a2) * 56);
            ctx.stroke();
          }
        } else {
          for (let i = 0; i < 6; i++) {
            const a1 = (i * Math.PI) / 3;
            const a2 = ((i + 2) * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a1) * 56, Math.sin(a1) * 56);
            ctx.lineTo(Math.cos(a2) * 56, Math.sin(a2) * 56);
            ctx.stroke();
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
      const rem = p.targetMap !== 'town' ? portalCounts(p.targetMap) : 0;
      const col = part === 2 ? '249,168,212' : '103,232,249';
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 34);
      g.addColorStop(0, `rgba(${col},${0.65 * pulse})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = part === 2 ? '#f9a8d4' : '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 22, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'bold 11px "Gowun Batang", serif';
      ctx.fillStyle = rem ? '#fef08a' : (part === 2 ? '#fbcfe8' : '#a5f3fc');
      ctx.textAlign = 'center';
      ctx.fillText(`◈ ${Locale.t(p.label)}${rem ? ` (${part === 2 ? '★' : ''}${rem})` : ''}`, p.x, p.y - 16);
    }

    // 3) 카드 이상 현상 & 제2부 대형 사건
    for (const c of activeCards) drawCardAnomaly(c, state, now);
    for (const inc of activeIncidents) drawIncident(inc, now);

    // 4) 최종 보스 (1부 유에 / 2부 에리오르 & 두 수호자)
    if (boss) {
      const by = boss.y + Math.sin(now * 0.004) * 6;
      if (boss.type === 'yue') {
        const yg = ctx.createRadialGradient(boss.x, by, 6, boss.x, by, 50);
        yg.addColorStop(0, 'rgba(186,230,253,0.75)');
        yg.addColorStop(1, 'rgba(186,230,253,0)');
        ctx.fillStyle = yg;
        ctx.beginPath();
        ctx.arc(boss.x, by, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(boss.x, by);
        ctx.quadraticCurveTo(boss.x - 36, by - 24, boss.x - 26, by + 10);
        ctx.moveTo(boss.x, by);
        ctx.quadraticCurveTo(boss.x + 36, by - 24, boss.x + 26, by + 10);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(boss.x, by - 6);
        ctx.lineTo(boss.x - 12, by + 18);
        ctx.lineTo(boss.x + 12, by + 18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(boss.x, by - 12, 10, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const eg = ctx.createRadialGradient(boss.x, by, 8, boss.x, by, 54);
        eg.addColorStop(0, 'rgba(253,224,71,0.68)');
        eg.addColorStop(0.55, 'rgba(99,102,241,0.42)');
        eg.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(boss.x, by, 54, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(boss.x, by - 6);
        ctx.lineTo(boss.x - 13, by + 18);
        ctx.lineTo(boss.x + 13, by + 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1e3a5f';
        ctx.beginPath();
        ctx.arc(boss.x, by - 12, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 12px "Gowun Batang", serif';
      ctx.fillStyle = boss.type === 'yue' ? '#bae6fd' : '#fef08a';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t(boss.label), boss.x, by - 30);
    }

    // 5) NPC들 (2부 반투명 유키토/청명 연출 포함!)
    for (const n of npcs) {
      ctx.save();
      const alpha = typeof n.alpha === 'number' ? Utils.clamp(n.alpha, 0.25, 1) : 1;
      ctx.globalAlpha = alpha;

      // 반투명 상태일 때 푸른 잔상 오라
      if (alpha < 0.92) {
        const fg = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, 28);
        fg.addColorStop(0, 'rgba(186,230,253,0.45)');
        fg.addColorStop(1, 'rgba(186,230,253,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 28, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(n.x, n.y + 14, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = n.dressColor;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y - 4);
      ctx.lineTo(n.x - 11, n.y + 12);
      ctx.lineTo(n.x + 11, n.y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = n.hairColor;
      ctx.beginPath();
      ctx.arc(n.x, n.y - 10, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffedd5';
      ctx.beginPath();
      ctx.arc(n.x, n.y - 9, 7, 0, Math.PI * 2);
      ctx.fill();

      // NPC 이름표
      ctx.globalAlpha = Math.max(0.65, alpha);
      ctx.font = 'bold 11px "Gowun Batang", serif';
      ctx.fillStyle = n.id === 'eriol' ? '#fef08a' : (n.id === 'yue' || n.id === 'yukito') ? '#bae6fd' : n.id === 'syaoran' ? '#6ee7b7' : '#fbcfe8';
      ctx.textAlign = 'center';
      ctx.fillText(Locale.t(n.name), n.x, n.y - 25 + Math.sin(now * 0.004) * 2);

      // 졸려하는 유키토(청명) zZ 연출
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
      ctx.strokeStyle = part === 2 ? 'rgba(249,168,212,0.75)' : 'rgba(250,204,21,0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.targetPos.x, player.targetPos.y, 10 + Math.sin(now * 0.01) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (nextObjective && Math.hypot(nextObjective.x - player.x, nextObjective.y - player.y) > 110) {
      const a = Math.atan2(nextObjective.y - player.y, nextObjective.x - player.x);
      ctx.save();
      ctx.translate(player.x + Math.cos(a) * 42, player.y + Math.sin(a) * 42);
      ctx.rotate(a);
      ctx.fillStyle = nextObjective.isBoss ? 'rgba(253,224,71,0.9)' : 'rgba(244,114,182,0.85)';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 7) 주인공 & 케로
    drawPlayerSprite(state, now);
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
    ctx.beginPath();
    ctx.arc(kero.x - 2.5, ky - 1, 1.3, 0, Math.PI * 2);
    ctx.arc(kero.x + 2.5, ky - 1, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 8) 필드 파티클 & 야외 벚꽃/반딧불이
    for (const fx of fieldFx) {
      ctx.globalAlpha = Math.max(0, fx.life / fx.max);
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (mapId === 'town') {
      for (const p of petals) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = 'rgba(251,207,232,0.75)';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (const f of fireflies) {
        ctx.fillStyle = `rgba(254,240,138,${0.25 + 0.65 * Math.abs(Math.sin(f.p))})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 9) 근접 대기 효과 (광과민성 안전 · 점멸 없음)
    const pierced = buffs.light > 0 ? 0.18 : 1;
    if (flags.eternalDarkness) {
      const vg = ctx.createRadialGradient(cam.w / 2, cam.h / 2, 70, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.68);
      vg.addColorStop(0, `rgba(8,4,24,${0.18 * pierced})`);
      vg.addColorStop(1, `rgba(2,1,12,${0.76 * pierced})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cam.w, cam.h);
    }

    for (const c of activeCards) {
      const pos = c.pos || { x: c.x, y: c.y };
      const dist = Math.hypot(player.x - pos.x, player.y - pos.y);
      if (dist > 250) continue;
      const k = Math.max(0, 1 - dist / 250);
      if (c.id === 'dark' || c.id === 'shadow') {
        const vg = ctx.createRadialGradient(cam.w / 2, cam.h / 2, 48, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.58);
        vg.addColorStop(0, `rgba(2,1,12,${0.25 * k * pierced})`);
        vg.addColorStop(1, `rgba(2,1,12,${0.92 * k * pierced})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, cam.w, cam.h);
      } else if (c.id === 'light') {
        ctx.fillStyle = `rgba(254,249,195,${0.36 * k})`;
        ctx.fillRect(0, 0, cam.w, cam.h);
      } else if (c.id === 'firey') {
        ctx.fillStyle = `rgba(249,115,22,${0.2 * k})`;
        ctx.fillRect(0, 0, cam.w, cam.h);
      } else if (c.id === 'flower') {
        ctx.fillStyle = `rgba(244,114,182,${0.12 * k})`;
        ctx.fillRect(0, 0, cam.w, cam.h);
        for (let i = 0; i < 16; i++) {
          const fx = (i * 97 + now * 0.04) % cam.w;
          const fy = (i * 71 + now * 0.07) % cam.h;
          ctx.fillStyle = i % 2 ? 'rgba(251,207,232,0.85)' : 'rgba(249,168,212,0.82)';
          ctx.beginPath();
          ctx.ellipse(fx, fy, 4.5, 2.5, now * 0.002 + i, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 10) 은은한 황혼/별빛 비네팅 & 미니맵
    const mv = ctx.createRadialGradient(cam.w / 2, cam.h / 2, Math.min(cam.w, cam.h) * 0.4, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.75);
    mv.addColorStop(0, 'rgba(0,0,0,0)');
    mv.addColorStop(1, 'rgba(14,6,34,0.34)');
    ctx.fillStyle = mv;
    ctx.fillRect(0, 0, cam.w, cam.h);

    const mw = 114;
    const mh = 92;
    const mx = cam.w - mw - 12;
    const my = 12;
    const sxm = mw / map.w;
    const sym = mh / map.h;
    ctx.fillStyle = 'rgba(14,6,30,0.84)';
    ctx.strokeStyle = part === 2 ? 'rgba(249,168,212,0.62)' : 'rgba(250,204,21,0.58)';
    ctx.lineWidth = 1.4;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);

    for (const p of toArr(map.portals)) {
      ctx.fillStyle = part === 2 ? '#f9a8d4' : '#67e8f9';
      ctx.beginPath();
      ctx.arc(mx + p.x * sxm, my + p.y * sym, 2.9, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const inc of activeIncidents) {
      const pos = inc.pos || { x: inc.x, y: inc.y };
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 3.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of activeCards) {
      const pos = c.pos || { x: c.x, y: c.y };
      ctx.fillStyle = part === 2 ? '#fde047' : '#f472b6';
      ctx.beginPath();
      ctx.arc(mx + pos.x * sxm, my + pos.y * sym, 3.0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of npcs) {
      ctx.fillStyle = n.id === 'eriol' ? '#60a5fa' : (n.id === 'yue' || n.id === 'yukito') ? '#bae6fd' : '#c084fc';
      ctx.beginPath();
      ctx.arc(mx + n.x * sxm, my + n.y * sym, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (boss) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(mx + boss.x * sxm, my + boss.y * sym, 4.0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + player.x * sxm, my + player.y * sym, 3.6, 0, Math.PI * 2);
    ctx.fill();
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
