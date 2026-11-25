// AR 地面輪廓：家具佔地框＋尺寸標示＋建議留空區（單位：公分，加在家具模型的群組裡）
const ZONES = {
  沙發: { front: 60, label: '前方走道 60 cm' },
  床台: { front: 60, left: 60, right: 60, label: '兩側與床尾 60 cm' },
  餐桌: { front: 75, back: 75, left: 75, right: 75, label: '拉椅子空間 75 cm' },
  書桌: { front: 75, label: '座位空間 75 cm' },
  化妝台: { front: 75, label: '座位空間 75 cm' }
};
export function zoneFor(cat, k) { if (k === 'ownPuff' || k === 'own120Ott') return null; return ZONES[cat] || null; }

const LINE = '#ff6a1f', ZONE = '#ffa15c';
function mat(THREE, col) {
  const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.9 });
  m.name = 'frame'; return m;
}
function strip(THREE, m, x0, z0, x1, z1, wid = 2.4) {   // 地上一條細帶
  const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.BoxGeometry(len + wid, 0.3, wid), o = new THREE.Mesh(g, m);
  o.position.set((x0 + x1) / 2, 0.25, (z0 + z1) / 2); o.rotation.y = -Math.atan2(z1 - z0, x1 - x0); return o;
}
function dashed(THREE, grp, m, x0, z0, x1, z1) {          // 虛線
  const len = Math.hypot(x1 - x0, z1 - z0), seg = 10, gap = 7, n = Math.max(1, Math.floor((len + gap) / (seg + gap)));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const a = i * step, b = Math.min(len, a + Math.min(seg, step - 2)), t0 = a / len, t1 = b / len;
    grp.add(strip(THREE, m, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, 1.8));
  }
}
function rect(THREE, grp, m, x0, z0, x1, z1, dash) {
  const f = dash ? (a, b, c, d) => dashed(THREE, grp, m, a, b, c, d) : (a, b, c, d) => grp.add(strip(THREE, m, a, b, c, d));
  f(x0, z0, x1, z0); f(x1, z0, x1, z1); f(x1, z1, x0, z1); f(x0, z1, x0, z0);
}
function label(THREE, text, h, col, x, z, rotY = 0) {     // 平躺在地上的文字牌
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 64, pad = 26;
  g.font = `700 ${fs}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;
  const tw = Math.ceil(g.measureText(text).width); c.width = tw + pad * 2; c.height = fs + 34;
  g.font = `700 ${fs}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;
  const r = c.height / 2; g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(r, 0); g.lineTo(c.width - r, 0); g.arc(c.width - r, r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r, c.height); g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); g.fill();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 3);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 1, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 }); m.name = 'frame';
  const w = h * c.width / c.height, o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  o.rotation.order = 'YXZ'; o.rotation.set(-Math.PI / 2, rotY, 0); o.position.set(x, 0.5, z); return { o, w };
}
/* box：家具在地上的範圍 {x0,x1,z0,z1}（公分）；size：標示用的長寬 */
export function makeFrame(THREE, box, size, zone) {
  const grp = new THREE.Group(); grp.name = 'ar-frame';
  const mL = mat(THREE, LINE), mZ = mat(THREE, ZONE);
  const { x0, x1, z0, z1 } = box, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  rect(THREE, grp, mL, x0, z0, x1, z1, false);
  const H = Math.max(9, Math.min(16, Math.min(x1 - x0, z1 - z0) * 0.16));   // 字牌高度
  if (zone) {
    const zx0 = x0 - (zone.left || 0), zx1 = x1 + (zone.right || 0), zz0 = z0 - (zone.back || 0), zz1 = z1 + (zone.front || 0);
    rect(THREE, grp, mZ, zx0, zz0, zx1, zz1, true);
    if (zone.front) { const l = label(THREE, zone.label, H * 0.85, '#c2560f', cx, z1 + Math.max(zone.front * 0.62, H * 0.75 + 4 + H * 1.25)); grp.add(l.o); }
  }
  // 寬（前緣外側）、深（右側外側）
  const off = H * 0.75 + 4;
  const lw = label(THREE, `寬 ${size.w} cm`, H, LINE, cx, z1 + off); if (!(zone && zone.front)) grp.add(lw.o); else { lw.o.position.z = z1 + off; grp.add(lw.o); }
  const ld = label(THREE, `深 ${size.d} cm`, H, LINE, x1 + off, cz, Math.PI / 2); grp.add(ld.o);
  return grp;
}

/* 組合擺放：每件家具的佔地框（可旋轉）＋整組外框與總寬／總深（單位：公分） */
export function makeComboFrame(THREE, polys, box, room) {
  const grp = new THREE.Group(); grp.name = 'ar-frame';
  const mL = mat(THREE, LINE), mZ = mat(THREE, ZONE);
  for (const p of polys) for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4]; grp.add(strip(THREE, mL, a[0], a[1], b[0], b[1], 2)); }
  const { x0, x1, z0, z1 } = box, g = 8;
  rect(THREE, grp, mZ, x0 - g, z0 - g, x1 + g, z1 + g, true);
  const H = Math.max(10, Math.min(18, Math.min(x1 - x0, z1 - z0) * 0.12)), off = g + H * 0.75 + 4;
  grp.add(label(THREE, `總寬 ${Math.round(x1 - x0)} cm`, H, LINE, (x0 + x1) / 2, z1 + off).o);
  grp.add(label(THREE, `總深 ${Math.round(z1 - z0)} cm`, H, LINE, x1 + off, (z0 + z1) / 2, Math.PI / 2).o);
  if (room) {   // 房間牆線（從家具配置網站送過來時才有）：對準真實的牆角就能看出整個空間
    const mR = mat(THREE, '#3d7bd9'), W = room.w / 2, D = room.d / 2;
    for (const [a, b] of [[[-W, -D], [W, -D]], [[W, -D], [W, D]], [[W, D], [-W, D]], [[-W, D], [-W, -D]]]) grp.add(strip(THREE, mR, a[0], a[1], b[0], b[1], 4));
    grp.add(label(THREE, `房間 ${room.w}×${room.d} cm`, Math.max(12, H), '#2f63b5', 0, -D + Math.max(12, H) * 0.75 + 6).o);
  }
  return grp;
}
