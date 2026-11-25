// 自動產生：來源是家具配置網站 index.html 的建模段落，請勿手改（改完家具配置網站後重跑 build_engine.py）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { OBB } from 'three/addons/math/OBB.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const deg = Math.PI / 180;
const V3 = THREE.Vector3;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ACCENT = 0xb8683a, DANGER = 0xc0392b;
let WALL_T = 12;                                                        // 牆厚（公分）：整個專案共用，可在「專案與空間」設定
const STORE_KEY = 'furniture-planner-projects-v1';
const canFS = (() => { try { return !!window.showSaveFilePicker && window.top === window.self; } catch (e) { return false; } })();   // 能直接讀寫電腦裡的檔案（不在 Claude 網頁裡時）

/* ================= 材質與幾何工具 ================= */
const MATS = new Map();
// 專案自訂顏色的紋路：顏色是由圖片加入的，就把那張圖片的紋路貼上去
const CTEX = new Map();
function customTex(col, even) {                                          // even：皮革、布料這類應該整片均勻的材質——把圖片上深深淺淺的色塊完全拉平，只留細紋
  try {
    const o = spaces && Array.isArray(spaces.colors) ? spaces.colors.find(q => q.c === col && q.tex) : null; if (!o) return null;
    const key = o.tex + (even ? '|even' : ''); let t = CTEX.get(key);
    if (!t) {
      if (even) {
        const S = 192, mk = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; }, c = mk(S), x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = col; x.fillRect(0, 0, S, S); t = new THREE.CanvasTexture(c);
        const im = new Image(); im.onload = () => { try {
          x.drawImage(im, 0, 0, S, S); const sm = mk(12); sm.getContext('2d').drawImage(c, 0, 0, 12, 12);
          const bl = mk(S), bx = bl.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingQuality = 'high'; bx.drawImage(sm, 0, 0, S, S);
          const I = x.getImageData(0, 0, S, S), d = I.data, lo = bx.getImageData(0, 0, S, S).data, av = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
          for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) { const r = d[i + k] / Math.max(10, lo[i + k]); d[i + k] = Math.max(0, Math.min(255, av[k] * (1 + (r - 1) * 0.45))); }   // 每一點只留下和周圍的相對差異（細紋），底色統一成平均色
          x.putImageData(I, 0, 0); t.needsUpdate = true; } catch (e) { } };
        im.src = o.tex;
      } else t = new THREE.TextureLoader().load(o.tex);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 4; CTEX.set(key, t);   // 鏡射重複：接縫處看不出來
    }
    return t;
  } catch (e) { return null; }
}
// 紋路不照模型原本的貼圖座標拉伸，而是照實際尺寸（每張圖 TRI_CM 公分）從三個方向投影上去：大沙發、小椅腳上的紋路一樣大，轉彎的地方自然銜接
const TRI_CM = 42, TRI_GAIN = 0.55, TRI_SAT = 1.06;   // 場景的燈光和色調映射會讓顏色變亮、變淡：貼圖先壓暗一點、彩度補一點，受光面看起來才接近原圖
let TRI_MAX = 0, TRI_CUR = 0;                                                         // 正在建的那件家具適合的紋路大小（公分）：大件家具紋路鋪得大一點，小件鋪得細一點，重複的次數差不多
const triSize = it => clamp(Math.round(Math.max(it.w || 0, it.d || 0, it.h || 0) * 0.3 / 6) * 6, 18, 90);
const GRAIN_ON = { value: 0 };                                           // 渲染模式才打開材質的細部質感（編輯時不算，操作比較順）
const GRAIN = { leather: 1, fabric: 2, velvet: 3, wood: 4 };
function fxMat(m) {                                                       // 依 userData.tri（自訂紋路）、userData.grain（質感）改寫著色器
  const U = m.userData, tri = !!U.tri, gr = U.grain || 0;
  m.onBeforeCompile = sh => {
    sh.uniforms.grainOn = GRAIN_ON;
    if (tri) { sh.uniforms.triMap = { value: U.tri }; sh.uniforms.triS = { value: U.triS }; sh.uniforms.triO = { value: U.triO }; sh.uniforms.triG = { value: new THREE.Vector2(TRI_GAIN, TRI_SAT) }; }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriP;\nvarying vec3 vTriN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = transformed * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));\nvTriN = objectNormal;');
    let head = '#include <common>\nvarying vec3 vTriP;\nvarying vec3 vTriN;\nuniform float grainOn;\n' + (tri ? 'uniform sampler2D triMap;\nuniform float triS;\nuniform float triO;\nuniform vec2 triG;\n' : '');
    if (gr) head += `
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
vec2 gUV(vec3 q) { vec3 a = abs(vTriN); return a.x > a.y && a.x > a.z ? q.zy : a.y > a.z ? q.xz : q.xy; }
float grainH(vec3 q) {
  ${gr === 1 ? 'float n = gNoise(q * 1.3) * 0.65 + gNoise(q * 2.9) * 0.35; return smoothstep(0.2, 0.8, n);'
    : gr === 2 ? 'vec2 u = gUV(q) * 5.0; return 0.5 + 0.35 * sin(u.x) * sin(u.y) + 0.3 * (gNoise(q * 1.6) - 0.5);'
    : gr === 3 ? 'return gNoise(q * 3.0) * 0.6 + gNoise(q * 0.9) * 0.4;'
    : 'vec2 u = gUV(q); return gNoise(vec3(u.x * 0.05, u.y * 1.6, 3.0)) * 0.7 + gNoise(vec3(u.x * 0.2, u.y * 4.5, 7.0)) * 0.3;'}
}
`;
    let fs = sh.fragmentShader.replace('#include <common>', head);
    let mapCode = '#include <map_fragment>';
    if (tri) mapCode = 'vec3 triW = pow(abs(normalize(vTriN)), vec3(4.0)); triW /= (triW.x + triW.y + triW.z);\ndiffuseColor.rgb *= (texture2D(triMap, vTriP.zy / triS + triO) * triW.x + texture2D(triMap, vTriP.xz / triS + triO) * triW.y + texture2D(triMap, vTriP.xy / triS + triO) * triW.z).rgb * triG.x;\nfloat triL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = max(vec3(0.0), mix(vec3(triL), diffuseColor.rgb, triG.y));';
    if (gr) {
      const amt = [0, 0.07, 0.06, 0.025, 0.03][gr], col = [0, 0.05, 0.07, 0.05, tri ? 0 : 0.07][gr], fq = [0, 2.9, 5.0, 3.0, 4.5][gr];   // 起伏的高度（公分）、顏色的深淺變化、最細的紋路頻率
      mapCode += `\nfloat gH = 0.5, gFade = 0.0;\nif (grainOn > 0.5) { gFade = clamp(1.3 - length(fwidth(vTriP)) * ${(fq * 0.9).toFixed(2)}, 0.0, 1.0); if (gFade > 0.01) gH = grainH(vTriP); diffuseColor.rgb *= 1.0 + (gH - 0.5) * ${col.toFixed(2)} * gFade; }`;
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (grainOn > 0.5 && gFade > 0.01) {
  vec2 gD = vec2(grainH(vTriP + dFdx(vTriP)) - gH, grainH(vTriP + dFdy(vTriP)) - gH) * ${amt.toFixed(3)} * gFade;   // 往左右、上下各取一點算坡度（每個像素各自算，不會出現小方塊）
  vec3 gSx = dFdx(-vViewPosition), gSy = dFdy(-vViewPosition), gR1 = cross(gSy, normal), gR2 = cross(normal, gSx);
  float gDet = dot(gSx, gR1) * faceDirection;
  normal = normalize(abs(gDet) * normal - sign(gDet) * (gD.x * gR1 + gD.y * gR2));
}`);
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (grainOn > 0.5) roughnessFactor = clamp(roughnessFactor + (0.5 - gH) * 0.18 * gFade, 0.04, 1.0);`);
    }
    sh.fragmentShader = fs.replace('#include <map_fragment>', mapCode);
  };
  m.customProgramCacheKey = () => 'fx' + (tri ? 't' : '') + gr;
  m.needsUpdate = true;
  return m;
}
function triMat(m, tx, even) {
  const slab = even === 'slab' && TRI_MAX > 0;                            // 大理石、陶板：整張圖剛好鋪滿這件家具最長的一邊（像一整片石板，紋路跟著尺寸放大縮小，不重複）
  m.userData.triO = slab ? 0.5 : 0;
  m.userData.triS = slab ? TRI_MAX + 2 : even ? Math.max(14, (TRI_CUR || TRI_CM) * 0.4) : TRI_CUR || TRI_CM;   // 皮革、布料的紋理本來就細：鋪小一點
  m.map = null; m.color.set('#ffffff'); if (m.clearcoat !== undefined) m.clearcoat = Math.min(m.clearcoat, 0.08); if (m.sheen !== undefined) m.sheen = 0;   // 表面的反光、絨光會把顏色洗白：自訂的紋路以圖片的顏色為準
  m.userData.tri = tx;
  return fxMat(m);
}
function mat(color, rough = 0.75, metal = 0) {
  const tx = customTex(color), k = color + '|' + rough + '|' + metal + (tx ? '|' + tx.uuid + '|' + TRI_CUR : '');
  if (!MATS.has(k)) { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal }); if (tx) triMat(m, tx); MATS.set(k, m); }
  return MATS.get(k);
}
function add(g, geo, m, x, y, z) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
function B(g, w, h, d, x, y, z, m) { return add(g, new THREE.BoxGeometry(Math.max(w, .1), Math.max(h, .1), Math.max(d, .1)), m, x, y, z); }
function RB(g, w, h, d, r, x, y, z, m) {
  w = Math.max(w, .2); h = Math.max(h, .2); d = Math.max(d, .2);
  r = Math.min(r, Math.min(w, h, d) / 2 - 0.05);
  if (r <= 0.2) return B(g, w, h, d, x, y, z, m);
  return add(g, new RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z);
}
function C(g, rt, rb, h, x, y, z, m, seg = 24) { return add(g, new THREE.CylinderGeometry(rt, rb, Math.max(h, .1), seg), m, x, y, z); }
function legs4(g, w, d, legH, inset, size, m, round = true) {
  for (const x of [-w / 2 + inset, w / 2 - inset]) for (const z of [-d / 2 + inset, d / 2 - inset]) {
    if (round) C(g, size / 2, size * 0.4, legH, x, legH / 2, z, m, 12);
    else B(g, size, legH, size, x, legH / 2, z, m);
  }
}
function disposeObj(o) {
  o.traverse(c => {
    if (c.userData && c.userData.tex) c.userData.tex.dispose();
    if (c.geometry) c.geometry.dispose();
    if (c.material && c.material.userData && c.material.userData.own) c.material.dispose();
  });
}

/* ================= 家具模型（原點在底部中心，正面朝 +Z） ================= */
const SOFA_STYLES = {
  modern:  { name: '現代方正', legH: 10, legSize: 5, aw: 18, armH: 0.78, armR: 5, seat: 45, cushT: 12, cushR: 5, backT: 20, backR: 4, backCush: true },
  nordic:  { name: '北歐細腳', legH: 20, legSize: 4.5, taper: true, aw: 9, armH: 0.7, armR: 3, seat: 46, cushT: 11, cushR: 4, backT: 12, backR: 3, backCush: true, oneSeat: true, bcT: 11 },
  classic: { name: '美式捲扶手', legH: 6, legSize: 7, bun: true, aw: 22, armH: 0.8, armR: 4, roll: true, seat: 47, cushT: 14, cushR: 7, backT: 22, backR: 6, backCush: true, bcT: 17 },
  chester: { name: '皮革拉扣', legH: 7, legSize: 6, bun: true, aw: 22, armFull: true, armR: 6, seat: 44, cushT: 10, cushR: 3, backT: 24, backR: 6, tufted: true, rough: 0.45 },
  low:     { name: '低矮模組', legH: 0, aw: 14, armH: 0.55, armR: 6, seat: 38, cushT: 16, cushR: 7, backT: 14, backR: 5, backCush: true, bcT: 20, pillows: true, c2: '抱枕顏色' },
};
const SOFA_OPTS = [{ key: 'style', label: '款式', list: Object.entries(SOFA_STYLES).map(([id, v]) => ({ id, name: v.name, ...(v.c2 ? { c2: v.c2 } : {}) })) }];
function buildSofa(it) {
  const st = SOFA_STYLES[it.style] || SOFA_STYLES.modern;
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), L = mat(it.color2, 0.55);
  const legH = st.legH ? Math.min(st.legH, h * 0.25) : 0;
  const seatTop = Math.min(st.seat, h * 0.62), baseTop = seatTop - st.cushT;
  const aw = Math.min(st.aw, w * 0.14);
  const bt = Math.min(st.backT, d * 0.25);
  const rollR = st.roll ? aw * 0.62 : 0;
  const armH = st.armFull ? h : Math.min(h * st.armH, 64);
  // 腳
  if (legH > 0) {
    for (const x of [-w / 2 + 7, w / 2 - 7]) for (const z of [-d / 2 + 7, d / 2 - 7]) {
      if (st.taper) C(g, st.legSize / 2, st.legSize * 0.25, legH, x * 0.97, legH / 2, z * 0.95, L, 12);
      else if (st.bun) { const m = add(g, new THREE.SphereGeometry(st.legSize / 2, 16, 10), L, x, legH / 2, z); m.scale.y = legH / st.legSize; }
      else C(g, st.legSize / 2, st.legSize * 0.4, legH, x, legH / 2, z, L, 12);
    }
  }
  const y0 = legH;
  RB(g, w, baseTop - y0, d, 3, 0, (y0 + baseTop) / 2, 0, F);
  RB(g, w, h - y0, bt, st.backR, 0, (y0 + h) / 2, -d / 2 + bt / 2, F);
  // 扶手
  if (aw > 0) for (const sd of [-1, 1]) {
    const ax = sd * (w / 2 - aw / 2), top = armH - rollR;
    RB(g, aw, top - y0, d, st.armR, ax, (y0 + top) / 2, 0, F);
    if (st.roll) {
      const m = C(g, rollR, rollR, d, ax + sd * rollR * 0.25, top, 0, F, 24);
      m.rotation.x = Math.PI / 2;
    }
  }
  // 坐墊與靠墊
  const inner = w - 2 * aw, cd = d - bt;
  const n = seatsOf(it), cw = inner / n;
  const bh = (h - seatTop) * 0.88;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + cw * (i + .5);
    RB(g, cw - 1.5, st.cushT, cd - 1, st.cushR, x, baseTop + st.cushT / 2, -d / 2 + bt + cd / 2, F);
  }
  if (st.backCush && bh > 12) {
    const nb = n, bw = inner / nb, t = st.bcT || 14;
    for (let i = 0; i < nb; i++) RB(g, bw - 3, bh, t, Math.min(8, t / 2), -inner / 2 + bw * (i + .5), seatTop + bh / 2, -d / 2 + bt + t / 2 - 1, F);
  }
  // 抱枕
  if (st.pillows && inner > 60) {
    const P = mat(it.color2, 0.95), ps = Math.min(42, inner * 0.3);
    for (const sd of [-1, 1]) {
      const m = RB(g, ps, ps, 11, 5, sd * (inner / 2 - ps / 2 - 4), seatTop + ps / 2 - 2, -d / 2 + bt + (st.bcT || 14) + 5, P); m.userData.pil = 1;
      m.rotation.z = sd * 0.12; m.rotation.x = -0.15;
    }
  }
  // 拉扣
  if (st.tufted) {
    const Bt = mat(it.color, 0.35), zf = -d / 2 + bt + 0.2;
    const rows = Math.max(1, Math.floor((h - seatTop - 6) / 11)), cols = Math.max(2, Math.round((w - 2 * aw) / 13));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -inner / 2 + (inner / cols) * (c + (r % 2 ? 1 : .5)), y = seatTop + 8 + r * 11;
      if (x > inner / 2 - 2) continue;
      add(g, new THREE.SphereGeometry(0.9, 8, 6), Bt, x, y, zf);
    }
  }
  return g;
}
function buildSofaSet(it) { // 1+2+3 沙發組（家具庫縮圖用）
  const g = new THREE.Group();
  const a = buildSofa({ ...TYPES.sofa, type: 'sofa', style: it.style }), b = buildSofa({ ...TYPES.sofa2, type: 'sofa2', style: it.style }), c = buildSofa({ ...TYPES.armchair, type: 'armchair', style: it.style });
  b.position.set(-TYPES.sofa.w / 2 - 15 + TYPES.sofa2.d / 2, 0, TYPES.sofa.d / 2 + 10 + TYPES.sofa2.w / 2); b.rotation.y = Math.PI / 2;
  c.position.set(TYPES.sofa.w / 2 + 15 - TYPES.armchair.d / 2, 0, TYPES.sofa.d / 2 + 10 + TYPES.armchair.w / 2); c.rotation.y = -Math.PI / 2;
  g.add(a, b, c);
  return g;
}
/* ---------- 人物（比例參考）：依性別、身高、體重建出人形，原點在腳底中心、面向 +Z ---------- */
const PERSON_HEAD = 1.75;                                               // 人物的頭放大幾倍（1＝寫實比例）
const PERSON_DEF = { m: { ht: 172, wt: 68 }, f: { ht: 160, wt: 52 } };
const personHt = it => it.ht || PERSON_DEF[it.sex === 'f' ? 'f' : 'm'].ht;
const personWt = it => it.wt || PERSON_DEF[it.sex === 'f' ? 'f' : 'm'].wt;
const personInfo = it => `身高 cm、體重 kg・BMI ${(personWt(it) / (personHt(it) / 100) ** 2).toFixed(1)}・佔地約 ${Math.round(it.w)}×${Math.round(it.d)} cm${it.pose === 'sit' ? `・坐高 ${Math.round(it.h)} cm` : ''}`;
function buildPerson(it) {
  const HT = personHt(it), HS = PERSON_HEAD, H = HT / (0.84 + 0.1295 * HS), fem = it.sex === 'f', sit = it.pose === 'sit';   // 可愛版：頭放大 HS 倍、身體等比縮一點，總身高仍是設定的身高
  const bmi = personWt(it) / (HT / 100) ** 2, k = clamp(Math.sqrt(bmi / 22), 0.78, 1.6), belly = clamp((bmi - 24) / 12, 0, 1);   // 胖瘦：整體寬度、肚子
  const skin = '#f3d2b8', SK = mat(skin, 0.7), TOP = mat(it.color, 0.9), PANT = mat(it.color2, 0.88), SHOE = mat('#3a3b3f', 0.7), SOLE = mat('#2a2a2d', 0.8), HAIR = mat(fem ? '#5a3b28' : '#3a2a20', 0.75);
  const P = (x, y, z) => new V3(x, y, z);
  const ball = (g, r, p, m, sx = 1, sy = 1, sz = 1) => { const s = add(g, new THREE.SphereGeometry(r, 20, 14), m, p.x, p.y, p.z); s.scale.set(sx, sy, sz); return s; };
  // 用一層層橢圓截面疊出連續曲面（軀幹、脖子）：[高度, 半寬, 半厚, 前後偏移]，單位都是身高的比例
  const loft = (parent, secs, m, n = 28) => {
    const S = [];                                                        // 截面之間補平滑的中間層
    for (let j = 0; j < secs.length - 1; j++) for (let s = 0; s < 4; s++) {
      const t = s / 4, a = secs[Math.max(0, j - 1)], b = secs[j], c = secs[j + 1], d = secs[Math.min(secs.length - 1, j + 2)];
      S.push(b.map((v, i) => i === 0 ? b[0] + (c[0] - b[0]) * t : 0.5 * (2 * v + (c[i] - a[i]) * t + (2 * a[i] - 5 * v + 4 * c[i] - d[i]) * t * t + (3 * v - a[i] - 3 * c[i] + d[i]) * t * t * t)));
    }
    S.push(secs[secs.length - 1]);
    const pos = [], idx = [], N = S.length;
    for (const [y, rx, rz, cz] of S) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pos.push(Math.cos(a) * Math.max(rx, 0.001) * H, y * H, (cz + Math.sin(a) * Math.max(rz, 0.001)) * H); }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n; idx.push(a, a + n, b, b, a + n, b + n); }
    const bc = pos.length / 3; pos.push(0, S[0][0] * H, S[0][3] * H, 0, S[N - 1][0] * H, S[N - 1][3] * H);
    for (let i = 0; i < n; i++) { idx.push(bc, i, (i + 1) % n, bc + 1, (N - 1) * n + (i + 1) % n, (N - 1) * n + i); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return add(parent, geo, m, 0, 0, 0);
  };
  // 四肢：上端在關節、往下延伸，半徑照肌肉線條變化（[位置 0~1, 半徑]）
  const limb = (parent, len, prof, m, sz = 1) => {
    const pts = []; for (let i = 20; i >= 0; i--) { const t = i / 20; let r = prof[prof.length - 1][1]; for (let j = 1; j < prof.length; j++) if (t <= prof[j][0]) { const [t0, r0] = prof[j - 1], [t1, r1] = prof[j], u = (t - t0) / (t1 - t0); r = r0 + (r1 - r0) * (0.5 - Math.cos(Math.PI * u) / 2); break; } pts.push(new THREE.Vector2(r * H, -t * len)); }
    const s = add(parent, new THREE.LatheGeometry(pts, 20), m, 0, 0, 0); s.scale.z = sz; return s;
  };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const sc = (prof, f) => prof.map(([t, r]) => [t, r * f]);
  // ---- 軀幹（褲子到腰、上衣從臀到脖子） ----
  const rh = (fem ? 0.106 : 0.097) * k, rw = (fem ? 0.074 : 0.084) * k * (1 + 0.12 * belly), rc = (fem ? 0.09 : 0.103) * k, rs = (fem ? 0.094 : 0.108) * k, dk = k * (1 + 0.1 * belly);
  const bz = 0.03 * belly, body = [
    [0.465, 0.05 * k, 0.05 * dk, -0.004], [0.49, rh * 0.94, 0.068 * dk, -0.008], [0.52, rh, 0.07 * dk, -0.008], [0.56, rh * 0.97, (0.064 + bz) * dk, -0.004 + bz * 0.6],
    [0.61, rw, (0.056 + bz) * dk, 0.002 + bz * 0.7], [0.66, rw * 1.05, (0.058 + bz * 0.6) * dk, 0.005 + bz * 0.4], [0.71, rc * 0.98, (fem ? 0.068 : 0.064) * dk, fem ? 0.012 : 0.008], [0.75, rc, (fem ? 0.066 : 0.066) * dk, 0.008],
    [0.79, rs, 0.055 * dk, 0.002], [0.815, rs * 0.9, 0.045 * dk, 0], [0.832, 0.056 * k, 0.036 * dk, 0], [0.843, 0.04, 0.038, 0.003]];
  const g = new THREE.Group(), up = new THREE.Group();                   // up：腰部以上（坐姿時整個往下移、稍微往後靠）
  loft(up, body.slice(0, 5), PANT);
  loft(up, [[0.515, rh * 1.03, 0.072 * dk, -0.008], ...body.slice(3).map((s, i) => i < 2 ? [s[0], s[1] * 1.03, s[2] * 1.03, s[3]] : s)], TOP);   // 上衣下襬蓋到臀部
  // ---- 脖子、頭 ----
  const nk = Math.sqrt(k);
  loft(up, [[0.82, 0.03 * nk, 0.031 * nk, 0.002], [0.86, 0.027 * nk, 0.029 * nk, 0.006], [0.89, 0.028 * nk, 0.03 * nk, 0.011]], SK, 20);
  const head = new THREE.Group(); head.position.set(0, (0.84 + 0.058 * HS) * H, 0.012 * H); head.rotation.x = -0.04; head.scale.setScalar(HS); up.add(head);
  { // 圓圓的頭：臉頰鼓、下巴短，只留一個小小的鼻子
    const geo = new THREE.SphereGeometry(1, 48, 34), ps = geo.attributes.position;
    const G = (v, c, s) => Math.exp(-(((v - c) / s) ** 2));
    for (let i = 0; i < ps.count; i++) {
      const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), f = clamp(z * 2.2, 0, 1);
      const jaw = y < 0 ? 1 - 0.16 * y * y : 1 - 0.08 * y * y;
      const px = x * 0.056 * jaw, py = y * (y < 0 ? 0.058 : 0.0625), pz = z * (z > 0 ? 0.0545 : 0.058) + f * 0.0035 * G(x, 0, 0.09) * G(y, -0.2, 0.08);
      ps.setXYZ(i, px * H, py * H, pz * H);
    }
    geo.computeVertexNormals(); add(head, geo, SK, 0, 0, 0);
  }
  const EYE = mat('#2b1d16', 0.18), SHINE = mat('#ffffff', 0.25), BLUSH = mat('#f2a39b', 0.9), MOUTH = mat('#a8534c', 0.6);
  for (const sd of [-1, 1]) {
    const ex = sd * 0.021 * H, ey = -0.004 * H, ez = 0.0492 * H;
    const eye = ball(head, 1, P(ex, ey, ez), EYE, 0.0088 * H, 0.012 * H, 0.0042 * H); eye.rotation.y = sd * 0.36; eye.castShadow = false;   // 大眼睛＋亮點
    ball(head, 1, P(ex + 0.0028 * H, ey + 0.0048 * H, ez + 0.0036 * H), SHINE, 0.003 * H, 0.0034 * H, 0.0014 * H).castShadow = false;
    ball(head, 1, P(ex - 0.0026 * H, ey - 0.0042 * H, ez + 0.0037 * H), SHINE, 0.0014 * H, 0.0016 * H, 0.0008 * H).castShadow = false;
    const br = add(head, new THREE.BoxGeometry(0.012 * H, 0.0016 * H, 0.002 * H), HAIR, sd * 0.021 * H, 0.0155 * H, 0.0508 * H);
    br.rotation.z = sd * 0.08; br.rotation.y = sd * 0.38; br.castShadow = false;
    const bl = ball(head, 1, P(sd * 0.035 * H, -0.0185 * H, 0.0392 * H), BLUSH, 0.0085 * H, 0.0052 * H, 0.0016 * H); bl.rotation.y = sd * 0.72; bl.castShadow = false;   // 腮紅
    ball(head, 1, P(sd * 0.0555 * H, -0.006 * H, -0.004 * H), SK, 0.0055 * H, 0.0125 * H, 0.008 * H);   // 耳朵
  }
  { const sm = add(head, new THREE.TorusGeometry(0.0075 * H, 0.0011 * H, 6, 14, Math.PI * 0.72), MOUTH, 0, -0.0215 * H, 0.0512 * H); sm.rotation.z = -Math.PI * 0.86; sm.rotation.x = 0.2; sm.castShadow = false; }   // 微笑
  // 頭髮：蓬蓬的頭頂＋瀏海；男生短髮，女生及肩的鮑伯頭
  const cap = add(head, new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), HAIR, 0, 0.004 * H, -0.004 * H);
  cap.scale.set(0.0615 * H, 0.068 * H, 0.066 * H); cap.rotation.x = -0.42;
  { const fr = ball(head, 1, P(fem ? 0 : 0.006 * H, (fem ? 0.033 : 0.037) * H, 0.0345 * H), HAIR, (fem ? 0.053 : 0.049) * H, (fem ? 0.019 : 0.015) * H, 0.0225 * H); fr.rotation.x = 0.62; fr.rotation.z = fem ? 0 : -0.1; }   // 瀏海：貼著額頭的一片
  if (fem) {
    ball(head, 1, P(0, -0.022 * H, -0.02 * H), HAIR, 0.062 * H, 0.062 * H, 0.046 * H);
    for (const sd of [-1, 1]) ball(head, 1, P(sd * 0.054 * H, -0.02 * H, 0.004 * H), HAIR, 0.014 * H, 0.05 * H, 0.032 * H);
  }
  // ---- 手臂：短袖、前臂與手露出膚色；肩、肘可以轉 ----
  const sx = rs * H * 0.9, sy = 0.8 * H, rig = { sh: [], el: [], hip: [], knee: [], H, sit }, ak = k * 0.5 + 0.5;
  for (const sd of [-1, 1]) {
    const La = 0.186 * H, Lf = 0.146 * H;
    const S = pivot(up, sd * sx, sy, 0);
    limb(S, La, sc([[0, 0.026], [0.2, 0.0285], [0.5, 0.026], [0.85, 0.0225], [1, 0.021]], ak), SK);
    limb(S, La * 0.55, sc([[0, 0.028], [0.3, 0.031], [1, 0.0295]], ak), TOP); ball(S, 0.0285 * ak * H, P(0, 0, 0), TOP);   // 袖子
    const E = pivot(S, 0, -La, 0); ball(E, 0.0208 * ak * H, P(0, 0, 0), SK);
    limb(E, Lf, sc([[0, 0.021], [0.22, 0.0225], [0.65, 0.018], [1, 0.0142]], ak), SK);
    const hand = pivot(E, 0, -Lf, 0); hand.rotation.x = -0.12;         // 手：掌心朝大腿，手指微彎，拇指朝前
    ball(hand, 1, P(0, -0.026 * H, 0.002 * H), SK, 0.017 * H, 0.027 * H, 0.021 * H);   // 圓圓的手
    S.rotation.z = sd * (sit ? 0.05 : 0.085);
    rig.sh.push(S); rig.el.push(E);
  }
  // ---- 腿與鞋：髖、膝可以轉 ----
  const hx = (rh - 0.045 * k) * H, lk = k, ck = Math.sqrt(k);
  // 坐姿：大腿水平。坐在家具上時臀部高度＝座面高度（it.seat）：座面低，小腿往前伸、腳仍踩地；座面高，小腿垂直、腳懸空。沒有家具時用自然坐高
  const Lt = 0.215 * H, Lc = 0.237 * H, onSeat = sit && it.seat > 0, hy = sit ? (onSeat ? it.seat + 0.045 * lk * H : 0.048 * H + Lc) : 0.5 * H;
  const drop = hy - 0.048 * H, lean = sit && drop < Lc ? Math.acos(clamp(drop / Lc, 0.1, 1)) : 0;   // 座面低：小腿往前傾的角度
  const slope = sit && drop > Lc ? Math.asin(clamp((drop - Lc) / Lt, 0, 0.34)) : 0;                // 座面稍高：大腿往膝蓋方向往下斜，腳仍踩地（太高才懸空）
  rig.hipSit = -(Math.PI / 2 - slope); rig.kneeSit = Math.PI / 2 - slope - lean;
  for (const sd of [-1, 1]) {
    const Hp = pivot(g, sd * hx, hy, 0); ball(Hp, 0.047 * lk * H, P(0, 0, 0), PANT);
    limb(Hp, Lt, sc([[0, 0.048], [0.25, 0.0495], [0.65, 0.04], [0.92, 0.033], [1, 0.0315]], lk), PANT);
    const K = pivot(Hp, 0, -Lt, 0); ball(K, 0.031 * ck * H, P(0, 0, 0), PANT);
    limb(K, Lc, sc([[0, 0.0315], [0.28, 0.034], [0.6, 0.027], [0.9, 0.0215], [1, 0.021]], ck), PANT);
    const ft = 0.155 * H, fz0 = ft / 2 - 0.04 * H, fy = -Lc - 0.048 * H;   // 鞋：鞋底＋鞋面
    const shoe = pivot(K, sd * 0.004 * H, fy, 0); shoe.rotation.y = sd * 0.1; shoe.rotation.x = lean;   // 小腿前傾時鞋底仍平貼地面
    RB(shoe, 0.05 * H, 0.016 * H, ft * 0.9, 0.007 * H, 0, 0.008 * H, fz0 - 0.004 * H, SOLE);
    ball(shoe, 1, P(0, 0.032 * H, fz0 - 0.004 * H), SHOE, 0.031 * H, 0.027 * H, ft * 0.48);
    ball(shoe, 1, P(0, 0.038 * H, -0.006 * H), SHOE, 0.027 * H, 0.028 * H, 0.036 * H);
    Hp.rotation.z = sd * (sit ? 0.06 : -0.03);
    rig.hip.push(Hp); rig.knee.push(K);
  }
  if (sit) { const piv = new THREE.Group(); piv.position.set(0, hy, 0); up.position.set(0, -0.5 * H, 0); piv.rotation.x = -0.1; piv.add(up); g.add(piv); }
  else g.add(up);
  personPose(rig, 0, 0);
  // 以實際外形決定佔地尺寸，並讓中心對準原點
  const box = new THREE.Box3().setFromObject(g, true), c = box.getCenter(new V3()), out = new THREE.Group();
  g.position.set(-c.x, onSeat ? 0 : -box.min.y, -c.z); out.add(g);       // 坐在家具上：腳可能懸空，不把人往下拉到地面
  const r1 = v => Math.round(v * 10) / 10, sz = box.getSize(new V3());
  it.w = r1(sz.x); it.d = r1(sz.z); it.h = r1(onSeat ? box.max.y : sz.y);
  rig.g = g; rig.y0 = g.position.y; out.userData.rig = rig;
  return out;
}
// 擺姿勢：amt = 0 是靜止（站或坐），amt = 1 是走路；ph 是走路的相位（走一個完整步伐循環 = 2π）
function personPose(rig, ph, amt) {
  for (let i = 0; i < 2; i++) {
    const p = ph + i * Math.PI;
    if (rig.sit) { rig.hip[i].rotation.x = rig.hipSit ?? -Math.PI / 2; rig.knee[i].rotation.x = rig.kneeSit ?? Math.PI / 2; rig.sh[i].rotation.x = -0.3; rig.el[i].rotation.x = -1.15; continue; }
    rig.hip[i].rotation.x = -0.42 * amt * Math.sin(p);
    rig.knee[i].rotation.x = 0.95 * amt * Math.max(0, Math.cos(p)) + 0.06 * amt;
    rig.sh[i].rotation.x = 0.4 * amt * Math.sin(p);
    rig.el[i].rotation.x = -0.12 - 0.3 * amt * (0.6 + 0.4 * Math.sin(p));
  }
  if (rig.g && !rig.sit) rig.g.position.y = rig.y0 + 0.008 * rig.H * amt * (Math.cos(2 * ph) - 1);
}
// 坐姿的人底下那件家具的座面高度（cm）；沒有家具回傳 0。從臀部、大腿中段兩點往下找，取較低的那個（背靠在椅背上時仍以座面為準）
const seatRay = new THREE.Raycaster();
function surfY(objs, x, z, maxY = 130) {                                // 從上往下找某一點的表面高度（看得見、低於 maxY 的第一個面）
  seatRay.set(new V3(x, 500, z), new V3(0, -1, 0));
  const hit = seatRay.intersectObjects(objs, true).find(q => q.object.visible && q.point.y > 3 && q.point.y < maxY);
  return hit ? hit.point.y : null;
}
function seatUnder(it) {
  const H = personHt(it), ry = -it.rot * deg, fx = Math.sin(ry), fz = Math.cos(ry), back = it.d / 2;
  const tg = state.items.filter(o => o !== it && TYPES[o.type] && !TYPES[o.type].person && !TYPES[o.type].flat && !TYPES[o.type].noHit && !TYPES[o.type].acc && !TYPES[o.type].ceil).map(o => objById.get(o.id)).filter(Boolean);
  if (!tg.length) return 0;
  const at = off => {                                                   // 左右各偏一點取最高的，避免剛好落在兩塊坐墊的縫裡；太高的（櫃頂）不算
    let y = null;
    for (const lat of [0, -9, 9]) { const v = surfY(tg, it.x - fx * off - fz * lat, it.z - fz * off + fx * lat); if (v !== null && (y === null || v > y)) y = v; }
    return y;
  };
  const hip = at(back - 0.08 * H), thigh = at(back - 0.2 * H);            // 臀部、大腿中段底下的高度
  const best = hip === null ? thigh : thigh !== null && hip - thigh > 25 ? thigh : hip;   // 臀部那點比大腿高很多：是靠在椅背上，以大腿底下的座面為準
  return best === null ? 0 : Math.round(best * 10) / 10;
}
function syncSeat(it) {                                                 // 座面高度變了就重建人物（身高體重不變，只改坐下來的高度）
  if (!TYPES[it.type] || !TYPES[it.type].person || it.pose !== 'sit') { if (it.seat) { delete it.seat; return true; } return false; }
  const g = objById.get(it.id); if (g) { g.position.set(it.x, it.elev || 0, it.z); g.updateMatrixWorld(true); }
  for (const o of state.items) { const og = objById.get(o.id); if (og && o !== it) og.updateMatrixWorld(true); }
  const sv = seatUnder(it);
  if (Math.abs((it.seat || 0) - sv) < 0.5) return false;
  if (sv) it.seat = sv; else delete it.seat;
  return true;
}
function syncSeats() { let n = 0; for (const it of state.items) if (TYPES[it.type] && TYPES[it.type].person && syncSeat(it)) { buildItem(it); n++; } return n; }
// 渲染動畫的「人物走動」：站著的人沿著面向的方向走，碰到牆或家具前轉身走回來
const walkers = () => state.items.filter(it => TYPES[it.type] && TYPES[it.type].person && it.pose !== 'sit' && objById.get(it.id) && objById.get(it.id).visible);
function walkPlans() {
  const W = state.room.w / 2, D = state.room.d / 2, obs = allBoxes(), R = 24;
  return walkers().map(it => {
    const g = objById.get(it.id), H = personHt(it), ry0 = -it.rot * deg;
    const blocked = (x, z) => Math.abs(x) > W - R || Math.abs(z) > D - R || obs.some(o => o.box.min.y < H * 0.9 && o.box.max.y > 8 && x > o.box.min.x - R && x < o.box.max.x + R && z > o.box.min.z - R && z < o.box.max.z + R);
    const reach = (fx, fz) => { let L = 0; while (L < 900 && !blocked(it.x + fx * (L + 5), it.z + fz * (L + 5))) L += 5; return L; };
    let best = null;                                                     // 八個方向裡挑空地最長的那條路線；原本面向的方向優先
    for (let n = 0; n < 8; n++) {
      const ry = ry0 + n * Math.PI / 4, fx = Math.sin(ry), fz = Math.cos(ry), a = reach(fx, fz), b = reach(-fx, -fz), score = (a + b) * (n ? 1 : 1.4) + a * 0.01;
      if (!best || score > best.score) best = { ry, fx, fz, a, b, score, turn0: n > 4 ? (n - 8) * Math.PI / 4 : n * Math.PI / 4 };
    }
    return { it, g, rig: g.userData.rig, ry0, ...best, v: 0.55 * H, stride: 0.75 * H };
  });
}
function walkStep(p, t) {                                               // t：動畫開始後的秒數
  if (p.a + p.b < 40) return;                                           // 沒有空間可以走
  const TURN = 0.9; let pos = 0, dir = 1, yaw = 0, dist = 0, left = t, amt = Math.min(1, t / 0.4);
  for (let n = 0; n < 400 && left > 0; n++) {
    const target = dir > 0 ? p.a : -p.b, need = Math.abs(target - pos) / p.v;
    if (left <= need) { pos += dir * p.v * left; dist += p.v * left; break; }
    pos = target; dist += need * p.v; left -= need;
    const tt = Math.min(TURN, left); left -= tt;
    yaw += Math.PI * ease(tt / TURN); if (tt < TURN) { amt = 0.25; break; }
    dir = -dir;
  }
  p.g.position.x = p.it.x + p.fx * pos; p.g.position.z = p.it.z + p.fz * pos; p.g.rotation.y = p.ry + yaw - p.turn0 * (1 - ease(Math.min(1, t / 0.7)));   // 一開始先從原本面向的方向轉過去
  personPose(p.rig, Math.PI * 2 * dist / p.stride, amt);
}
function walkReset(plans) { for (const p of plans || []) { p.g.position.set(p.it.x, p.it.elev || 0, p.it.z); p.g.rotation.y = p.ry0; personPose(p.rig, 0, 0); } }
/* ---------- 款式選項共用 ---------- */
// 每種家具可有多組選項（款式、桌面形狀、腳座、材質…）；選項可覆寫顏色標籤 c2 / c3，也可帶預設尺寸 size
const opt = (id, name, extra = {}) => ({ id, name, ...extra });
const PERSON_OPTS = [{ key: 'sex', label: '性別', list: [opt('m', '男性'), opt('f', '女性')] }, { key: 'pose', label: '姿勢', list: [opt('stand', '站立'), opt('sit', '坐姿（可放到沙發、椅子上）')] }];
const GLASS = new THREE.MeshStandardMaterial({ color: '#d6e6ea', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
function glassPane(g, w, h, d, x, y, z) { const m = add(g, new THREE.BoxGeometry(w, h, d), GLASS, x, y, z); m.castShadow = false; return m; }
function rod(g, a, b, r, m) {
  const dir = new V3().subVectors(b, a), len = dir.length();
  const mesh = add(g, new THREE.CylinderGeometry(r, r, len, 10), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
  return mesh;
}
function slats(g, x, y, fw, fh, z, m, dark) {
  B(g, fw, fh, 0.4, x, y, z - 0.9, dark);
  const n = Math.max(2, Math.floor(fw / 3.6)), step = fw / n;
  for (let i = 0; i < n; i++) B(g, step - 1.2, fh, 1.6, x - fw / 2 + step * (i + .5), y, z, m);
}
function mirrorIfLeft(it, g) { if (it.side !== 'left') return g; const o = new THREE.Group(); g.scale.x = -1; o.add(g); return o; }
const seatList = max => Array.from({ length: max }, (_, i) => opt(String(i + 1), `${i + 1} 人座`));
const SEATS_OPT = { key: 'seats', label: '座位數', list: seatList(4) };
const SEATS_OPT_L = { key: 'seats', label: '主座座位數', list: seatList(4) };
function seatsOf(it) { const T = TYPES[it.type] || {}; return Math.max(1, parseInt(it.seats || (T.def && T.def.seats) || 1, 10) || 1); }
const SIDE_OPT = { key: 'side', label: '貴妃位置', list: [opt('right', '貴妃在右'), opt('left', '貴妃在左')] };

/* ---------- L 型沙發（一般款） ---------- */
const LSOFA_STYLES = {
  modern: { name: '現代方正', legH: 10, aw: 18, cushR: 5, bcT: 14 },
  nordic: { name: '北歐細腳', legH: 20, aw: 9, cushR: 4, bcT: 11, taper: true },
  low:    { name: '低矮模組', legH: 0, aw: 14, cushR: 7, bcT: 20, seat: 38, cushT: 16 },
};
const LSOFA_OPTS = { key: 'style', label: '款式', list: Object.entries(LSOFA_STYLES).map(([id, v]) => opt(id, v.name)) };
function buildLSofa(it) {
  const st = LSOFA_STYLES[it.style] || LSOFA_STYLES.modern;
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), L = mat(it.color2, 0.55);
  const legH = st.legH ? Math.min(st.legH, h * 0.25) : 0, cushT = st.cushT || 12;
  const seatTop = Math.min(st.seat || 45, h * 0.6), baseTop = seatTop - cushT;
  const aw = Math.min(st.aw, w * 0.1), armH = Math.min(h * (legH ? 0.78 : 0.6), 62), bt = Math.min(20, d * 0.2);
  const sd = Math.min(95, d * 0.6), cw = Math.min(95, w * 0.4);
  const mainZ = -d / 2 + sd / 2, chL = d - sd, chX = w / 2 - cw / 2;
  RB(g, w, baseTop - legH, sd, 3, 0, (legH + baseTop) / 2, mainZ, F);
  if (chL > 1) RB(g, cw, baseTop - legH, chL, 3, chX, (legH + baseTop) / 2, -d / 2 + sd + chL / 2, F);
  RB(g, w, h - legH, bt, 4, 0, (legH + h) / 2, -d / 2 + bt / 2, F);
  RB(g, aw, armH - legH, sd, 5, -w / 2 + aw / 2, (legH + armH) / 2, mainZ, F);
  if (legH > 0) for (const [x, z] of [[-w / 2 + 6, -d / 2 + 6], [-w / 2 + 6, -d / 2 + sd - 6], [w / 2 - 6, -d / 2 + 6], [w / 2 - 6, d / 2 - 6], [w / 2 - cw + 6, d / 2 - 6]])
    C(g, st.taper ? 2.2 : 2.5, st.taper ? 1.1 : 2, legH, x, legH / 2, z, L, 12);
  const inner = w - aw - cw, n = seatsOf(it), ciw = inner / n, bh = (h - seatTop) * 0.9, t = st.bcT;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + aw + ciw * (i + .5);
    RB(g, ciw - 1.5, cushT, sd - bt - 1, st.cushR, x, baseTop + cushT / 2, -d / 2 + bt + (sd - bt) / 2, F);
    if (bh > 12) RB(g, ciw - 3, bh, t, Math.min(7, t / 2), x, seatTop + bh / 2, -d / 2 + bt + t / 2 - 1, F);
  }
  RB(g, cw - 1.5, cushT, d - bt - 1, st.cushR, chX, baseTop + cushT / 2, -d / 2 + bt + (d - bt) / 2, F);
  if (bh > 12) RB(g, cw - 3, bh, t, Math.min(7, t / 2), chX, seatTop + bh / 2, -d / 2 + bt + t / 2 - 1, F);
  return mirrorIfLeft(it, g);
}

/* ---------- 弧形沙發 ---------- */
const BAY_SEATS = { key: 'seats', label: '座位數', list: [opt('3', '3 人座'), opt('4', '4 人座'), opt('5', '5 人座')] };
const BAY_ARM = { key: 'arm', label: '扶手', list: [opt('arm', '兩側扶手'), opt('none', '無扶手')] };
const BAY_STYLE = { key: 'style', label: '款式', list: [opt('shell', '通道弧形', { size: { w: 230, d: 100, h: 78 }, c2: '椅腳顏色' }), opt('smooth', '圓弧一體', { size: { w: 240, d: 100, h: 75 }, c2: '底座顏色' }), opt('bay', '分座模組', { size: { w: 320, d: 150, h: 80 }, c2: '底座顏色' })] };
function buildBaySofa(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), L = mat(it.color2, 0.55);
  // 外弧：弦長 = 寬度、拱高 = 深度 − 坐深；圓心在前方，兩端往前包
  const shell = it.style !== 'bay';
  const sd = shell ? Math.min(80, d * 0.74) : Math.min(95, d * 0.75), sag = Math.max(5, d - sd);
  const R = (w * w / 4 + sag * sag) / (2 * sag), zc = -d / 2 + R, T = Math.asin(Math.min(1, w / 2 / R));
  const legH = Math.min(8, h * 0.1), seatTop = Math.min(44, h * 0.6), cushT = 13, baseTop = seatTop - cushT;
  const bt = Math.min(20, sd * 0.22), armH = Math.min(62, h * 0.78);
  // 環形扇區：rI~rO、角度 t0~t1、高度 y0~y1，bv = 圓角
  const sector = (rI, rO, t0, t1, y0, y1, m, bv = 2) => {
    bv = Math.max(0, Math.min(bv, (rO - rI) / 2.2, (y1 - y0) / 3, (t1 - t0) * Math.max(1, rI) / 2.5));
    const a = bv / rO, b = bv / Math.max(1, rI);
    const P = t => Math.PI / 2 - t, sh = new THREE.Shape();
    sh.absarc(0, -zc, rO - bv, P(t0 + a), P(t1 - a), true);
    sh.absarc(0, -zc, rI + bv, P(t1 - b), P(t0 + b), false);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.2, y1 - y0 - 2 * bv), bevelEnabled: bv > 0.2, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 48 });
    const mesh = add(g, geo, m, 0, y0 + bv, 0); mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };
  const Ri = R - sd, Rb = R - bt;
  const at = (r, t) => [r * Math.sin(t), zc - r * Math.cos(t)];          // 弧上一點（x, z）
  if (shell) {                                                           // 照片款：一體坐墊、通道車縫的靠背與扶手、細金屬腳
    const smooth = it.style === 'smooth';
    const lh = smooth ? 3 : Math.min(13, h * 0.17), wt = Math.min(22, sd * 0.26), Rw = R - wt, wh = Math.min(h * 0.86, 68), st = Math.min(45, h * 0.58);
    const M = mat(it.color2, 0.35, 0.7);
    if (smooth) sector(Ri + 5, R - 5, -T + 0.03, T - 0.03, 0, lh + 1, M, 0);   // 內縮踢腳底座
    else for (const [r, t] of [[Ri + 10, -T * 0.5], [Ri + 10, T * 0.5], [R - 12, -T * 0.8], [R - 12, T * 0.8]]) { const [x, z] = at(r, t); C(g, 1.4, 1.4, lh + 4, x, (lh + 4) / 2, z, M, 12); }
    sector(Ri, R, -T, T, lh + (smooth ? 1 : 0), st - 8, F, 7);                                       // 圓潤座身
    const armW = Math.min(26, w * 0.11), armT = armW / R;
    sector(Ri + 1.5, Rw, -T + armT, T - armT, st - 10, st, F, 4.5);             // 一體坐墊
    const midR = (R + Rw) / 2, nch = Math.max(6, Math.round((2 * T - 2 * armT) * midR / 17)), cs = (2 * T - 2 * armT) / nch;
    if (smooth) {                                                               // 平滑一體：靠背與扶手同高、圓潤包覆
      sector(Rw, R, -T + armT * 0.5, T - armT * 0.5, lh, h, F, 10);
      for (const sg of [-1, 1]) {                                               // 圓潤扶手
        const t = sg * (T - armT / 2), [x, z] = at((R + Ri) / 2, t);
        const m = RB(g, armW, h - lh, R - Ri, armW / 2 - 0.5, x, lh + (h - lh) / 2, z, F); m.rotation.y = -t;
      }
      for (const sg of [-1, 1]) {                                               // 圓形抱枕放兩端
        const t = sg * (T - armT - 0.06), [x, z] = at(Rw - 7, t);
        const m = add(g, new THREE.SphereGeometry(21, 24, 16), F, x, st + 19, z); m.scale.z = 0.36; m.rotation.order = 'YXZ'; m.rotation.y = -t; m.rotation.x = -0.25;
      }
      return g;
    }
    for (let i = 0; i < nch; i++) sector(Rw, R, -T + armT + cs * i, -T + armT + cs * (i + 1), lh + 2, wh, F, 6); // 靠背通道
    for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) {                     // 扶手：兩道通道往前延伸到前緣
      const t = sg * (T - armT * (k + 0.5) / 2), [x, z] = at((R + Ri) / 2, t), ah = wh - k * 3 - lh - 2;
      const m = RB(g, armW / 2, ah, R - Ri, armW / 4 - 0.3, x, lh + 2 + ah / 2, z, F); m.rotation.y = -t;
    }
    const n = seatsOf(it), span = (2 * T - 2 * armT) / n, ps = Math.min(52, span * midR * 0.9);
    for (let i = 0; i < n; i++) {                                               // 方形抱枕靠在椅背上
      const t = -T + armT + span * (i + 0.5), [x, z] = at(Rw - 8, t);
      const m = RB(g, ps, ps, 15, 6, x, st + ps / 2 - 4, z, F); m.rotation.order = 'YXZ'; m.rotation.y = -t; m.rotation.x = -0.22;
    }
    if (n >= 2) { const t = -T + armT + span * (n - 1), [x, z] = at(Rw - 24, t); const b = add(g, new THREE.SphereGeometry(12, 20, 14), F, x, st + 11, z); } // 圓球抱枕
    return g;
  }
  sector(Ri + 6, R - 6, -T + 0.02, T - 0.02, 0, legH, L, 0);                    // 內縮底座
  sector(Ri, R, -T, T, legH, baseTop, F, 3);                                    // 座框
  sector(Rb, R, -T, T, legH, h, F, 4);                                          // 靠背
  const arm = it.arm !== 'none', aT = arm ? Math.min(18, w * 0.07) / ((R + Ri) / 2) : 0;
  if (arm) for (const sg of [-1, 1]) { const t0 = sg < 0 ? -T : T - aT, t1 = sg < 0 ? -T + aT : T; sector(Ri, Rb + 1, t0, t1, legH, armH, F, 4); }
  // 坐墊與靠墊（依座位數平分弧度）
  const n = seatsOf(it), a0 = -T + aT, span = (2 * T - 2 * aT) / n, gap = 0.8 / ((R + Ri) / 2);
  const bh = (h - seatTop) * 0.88, tc = 16;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + span * i + gap, t1 = a0 + span * (i + 1) - gap;
    sector(Ri + 1, Rb - 0.5, t0, t1, baseTop, seatTop, F, 5);
    if (bh > 12) sector(Rb - tc, Rb + 0.5, t0 + gap, t1 - gap, seatTop - 1, seatTop + bh, F, 6);
  }
  return g;
}

/* ---------- 自家商品：依實品照片建模（固定造型，不提供款式變化） ---------- */
function buildReclinerSofa(it) { // 電動躺椅沙發：方塊扶手＋獨立座椅模組＋上下分段靠背
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), P = mat(it.color2, 0.95), dark = mat('#3d3a38', 0.8);
  const base = 3, seatTop = Math.min(47, h * 0.47), aw = Math.min(28, w * 0.13);
  const armTop = Math.min(64, h * 0.64), capT = 13, bt = Math.min(22, d * 0.22);
  B(g, w - 8, base, d - 10, 0, base / 2, -2, dark);
  RB(g, w - 2 * aw + 2, h - 22 - base, bt, 4, 0, base + (h - 22 - base) / 2, -d / 2 + bt / 2, F);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - aw / 2);
    RB(g, aw - 3, armTop - capT - base, d - 8, 2.5, x + s * 1.5, base + (armTop - capT - base) / 2, -3, F);
    RB(g, aw, capT, d - 2, 4, x, armTop - capT / 2, -1, F);
  }
  const inner = w - 2 * aw, n = seatsOf(it), cw = inner / n, cd = d - bt - 2;
  const backH = (h - seatTop) * 0.55, headH = (h - seatTop) * 0.5;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + cw * (i + .5);
    RB(g, cw - 1.2, seatTop - base, cd, 3, x, base + (seatTop - base) / 2, d / 2 - cd / 2, F);
    const m1 = RB(g, cw - 2, backH, 16, 5, x, seatTop + backH / 2 - 1, -d / 2 + bt + 6, F); m1.rotation.x = -0.1;
    const m2 = RB(g, cw - 2.5, headH, 20, 7, x, h - headH / 2, -d / 2 + bt / 2 + 6, F); m2.rotation.x = 0.12;
  }
  if (inner > 80) for (const s of [-1, 1]) {
    const m = RB(g, 44, 44, 12, 6, s * (inner / 2 - 30), seatTop + 22, -d / 2 + bt + 22, P); m.userData.pil = 1;
    m.rotation.x = -0.25; m.rotation.z = s * 0.15;
  }
  return g;
}
// 有壓線的蓬鬆靠墊：圓角的墊子，正面沿著縫線淺淺凹下去（cols 欄；橫線在高度 rowAt 的位置），直線會繞過上緣
function tuftPillowGeo(bw, bh, bt, cols, rowAt) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 54, 36, 8), P = geo.attributes.position, N = geo.attributes.normal;
  const A = bw / 2, Bh = bh / 2, Cc = bt / 2, R = Math.min(Cc * 0.86, 10), dep = Math.min(1.5, bt * 0.07), sg = 2.5, ys = (rowAt - 0.5) * bh;
  const cl = (v, m) => Math.max(-m, Math.min(m, v));
  for (let i = 0; i < P.count; i++) {
    let px = P.getX(i) * bw, py = P.getY(i) * bh, pz = P.getZ(i) * bt;
    const cx = cl(px, A - R), cy = cl(py, Bh - R), cz = cl(pz, Cc - R);
    let nx = px - cx, ny = py - cy, nz = pz - cz; const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
    px = cx + nx * R; py = cy + ny * R; pz = cz + nz * R;
    // 壓線：直線（正面＋上緣）、橫線（只在正面）
    const wf = Math.max(0, nz), wv = Math.min(1, wf + Math.max(0, ny) * 0.8);
    let ev = 0, dev = 0;
    for (let c = 1; c < cols; c++) { const t = (px - (-A + bw * c / cols)) / sg, e = Math.exp(-t * t); ev += e; dev += -2 * t / sg * e; }
    const th = (py - ys) / sg, eh = Math.exp(-th * th), deh = -2 * th / sg * eh;
    const D = dep * (wv * ev + wf * eh * (1 - ev * 0.5));
    px -= nx * D; py -= ny * D; pz -= nz * D;
    P.setXYZ(i, px, py, pz);
    const gx = dep * wv * dev, gy = dep * wf * deh; let mx = nx + gx * Math.max(wf, 0.3), my = ny + gy * wf, mz = nz; const ml = Math.hypot(mx, my, mz) || 1;
    N.setXYZ(i, mx / ml, my / ml, mz / ml);
  }
  P.needsUpdate = true; N.needsUpdate = true; geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
function buildDanishSofa(it) { // 丹麥沙發：布面底框＋圓錐木腳、後高前低的弧形扶手、厚坐墊、格紋車線的蓬鬆背墊
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), W = mat(it.color2, 0.55), dark = mat('#2a2826', 0.6);
  const seam = surfMat(it.fabric || 'fabric', '#' + new THREE.Color(it.color).multiplyScalar(0.87).getHexString());
  const legH = Math.min(15, h * 0.17), pH = Math.min(11, h * 0.12), baseTop = legH + pH;
  const seatTop = Math.min(45, h * 0.5), aw = Math.min(17, w * 0.085), ins = 1.5;
  const armF = Math.min(57, h * 0.635), armB = Math.min(68, h * 0.755), bt = Math.min(13, d * 0.15);
  // 木腳（上粗下細）＋中間的黑色支撐腳
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 1.9, 2.8, legH, sx * (w / 2 - 7), legH / 2, sz * (d / 2 - 7), W, 20).rotation.x = Math.PI;
  if (w > 150) C(g, 1.4, 1.4, legH, 0, legH / 2, d / 2 - 14, dark, 12);
  // 底框
  RB(g, w, pH, d, 2.6, 0, legH + pH / 2, 0, F);
  // 扶手：側面輪廓（後高、弧線下降、前段平、前上角圓）擠出成厚度
  const zb = -d / 2 + ins, zf = d / 2 - ins, L = zf - zb, bv = 2.6, y0 = baseTop - 0.3;
  const sh = new THREE.Shape();
  sh.moveTo(zb + bv, y0); sh.lineTo(zf - bv, y0);
  sh.lineTo(zf - bv, armF - bv - 5); sh.quadraticCurveTo(zf - bv, armF - bv, zf - bv - 6, armF - bv);
  sh.lineTo(zb + L * 0.52, armF - bv);
  sh.bezierCurveTo(zb + L * 0.34, armF - bv, zb + L * 0.3, armB - bv, zb + L * 0.1, armB - bv);
  sh.quadraticCurveTo(zb + bv, armB - bv, zb + bv, armB - bv - 5); sh.lineTo(zb + bv, y0);
  const at = aw - 2 * bv;
  for (const sx of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(sh, { depth: at, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 4, curveSegments: 16 });
    geo.translate(0, 0, -at / 2);
    const m = add(g, geo, F, sx * (w / 2 - ins - aw / 2), 0, 0); m.rotation.y = -Math.PI / 2;
    // 扶手外側的車線：一條橫的、兩條直的
    const xo = sx * (w / 2 - ins + 0.05), hy = baseTop + (armF - baseTop) * 0.45;
    B(g, 0.3, 0.35, L - 6, xo, hy, 0, seam);
    for (const k of [0.36, 0.7]) { const z = zf - L * k, top = k > 0.5 ? armF + (armB - armF) * 0.55 : armF; B(g, 0.3, top - baseTop - 5, 0.35, xo, baseTop + (top - baseTop - 5) / 2 + 1, z, seam); }
  }
  // 背框（和扶手後段一樣高）
  const inner = w - 2 * aw - 2 * ins;
  RB(g, inner + 2, armB - baseTop, bt, 3, 0, baseTop + (armB - baseTop) / 2, zb + bt / 2, F);
  // 坐墊、背墊
  const n = seatsOf(it), cw = inner / n, sd = zf - (zb + bt) - 0.5, st = seatTop - baseTop;
  const bH = h - seatTop + 1.1, bT = Math.min(25, d * 0.28), rows = [bH * 0.52, bH * 0.48];
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    RB(g, cw - 0.6, st, sd, 4.5, x, baseTop + st / 2, zf - sd / 2 - 0.5, F);
    // 背墊：一整塊蓬鬆的墊子往後靠，正面有兩條直的、一條橫的淺壓線（3 欄 × 2 列）
    const bg = new THREE.Group(); bg.position.set(x, seatTop - 3, zb + bt - 3); bg.rotation.x = -0.15; g.add(bg);
    add(bg, tuftPillowGeo(cw - 0.8, bH, bT, 3, 0.56), F, 0, bH / 2, bT / 2);
  }
  return g;
}
function softPillowGeo(pw, ph, pt) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 22, 22, 2), P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const u = P.getX(i) * 2, v = P.getY(i) * 2, q = P.getZ(i) * 2;
    const f = Math.pow(Math.max(0, 1 - u * u * u * u), 0.55) * Math.pow(Math.max(0, 1 - v * v * v * v), 0.55);
    P.setXYZ(i, u * pw / 2 * (1 - 0.055 * v * v), v * ph / 2 * (1 - 0.055 * u * u), q * pt / 2 * (0.1 + 0.9 * f));
  }
  P.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  geo.userData.pil = true;                                               // 抱枕、腰枕：可以個別點選換顏色
  return geo;
}
function buildLetItBeSofa(it) { // Let it be：皮革包覆的薄底框＋細不鏽鋼腳、厚坐墊、低矮分段靠背、大靠枕；轉角＋往前伸的貴妃（預設貴妃在右，選左時鏡射）
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), Lt = surfMat('leather', it.color2), Mt = mat('#d9dbde', 0.18, 0.95);
  const legH = Math.min(13, h * 0.16), fT = 4, pTop = legH + fT, cushT = Math.min(22, h * 0.28), seatTop = pTop + cushT;
  const sd = Math.min(105, d * 0.4), cwid = Math.min(110, w * 0.3), bt = 11, armW = Math.min(25, w * 0.07);
  const backTop = Math.min(57, h * 0.71), armTop = Math.min(seatTop + 17, backTop), zb = -d / 2, xL = -w / 2, xR = w / 2, wingL = xR - cwid;
  // 底框：皮革包覆的圓管圍一圈（上緣一道白色車線），管子兩端是亮面金屬蓋；裡面一片深色底板托著坐墊
  const Dk = mat('#2b2a2b', 0.7), St = mat('#f1e9da', 0.8), tr = fT / 2 + 0.3, ty = legH + fT / 2, cap = 0.9;
  const tubeX = (x0, x1, z, o) => {                                         // 左右向的管子：兩端有金屬蓋
    const len = x1 - x0 - 2 * cap, cx = (x0 + x1) / 2;
    C(g, tr, tr, len, cx, ty, z, Lt, 24).rotation.z = Math.PI / 2;
    for (const e of [x0 + cap / 2, x1 - cap / 2]) C(g, tr + 0.12, tr + 0.12, cap, e, ty, z, Mt, 24).rotation.z = Math.PI / 2;
    B(g, len - 1, 0.24, 0.3, cx, ty + tr * 0.80, z + o * tr * 0.62, St).rotation.x = o * 0.66;
  };
  const tubeZ = (z0, z1, x, o) => {                                         // 前後向的管子：接在左右向的管子之間
    C(g, tr, tr, z1 - z0, x, ty, (z0 + z1) / 2, Lt, 24).rotation.x = Math.PI / 2;
    B(g, 0.3, 0.24, z1 - z0 - 1, x + o * tr * 0.62, ty + tr * 0.80, (z0 + z1) / 2, St).rotation.z = -o * 0.66;
  };
  const zB = zb + tr + 0.15, zF = zb + sd - tr, zW = d / 2 - tr - 0.15;
  tubeX(xL, xR, zB, -1); tubeX(xL, wingL + tr, zF, 1); tubeX(wingL, xR, zW, 1);
  tubeZ(zB + tr, zF - tr, xL + tr + cap, -1); tubeZ(zB + tr, zW - tr, xR - tr - cap, 1); tubeZ(zF + tr, zW - tr, wingL + tr + cap, -1);
  B(g, wingL - xL - 8, 1.6, sd - 2 * tr - 6, (xL + wingL) / 2 + 1, ty - 0.6, zb + sd / 2, Dk);
  B(g, cwid - 10, 1.6, d - 2 * tr - 6, xR - cwid / 2, ty - 0.6, 0, Dk);
  // 不鏽鋼腳：和管子上的金屬套是一體的——套住圓管的金屬套往下收成一支上寬下窄的扁腳
  const sl = 7, legGeo = (() => {
    const hw = sl / 2, yT = ty - tr * 0.35, sh = new THREE.Shape();
    sh.moveTo(-hw, yT); sh.lineTo(hw, yT);
    sh.bezierCurveTo(hw, yT - 2.6, 2.05, yT - 2.4, 1.95, yT - 5.2);      // 肩部：從金屬套的寬度弧線收窄
    sh.lineTo(1.15, 1.25); sh.quadraticCurveTo(1.1, 0.8, 0.7, 0.8); sh.lineTo(-0.7, 0.8); sh.quadraticCurveTo(-1.1, 0.8, -1.15, 1.25);
    sh.lineTo(-1.95, yT - 5.2); sh.bezierCurveTo(-2.05, yT - 2.4, -hw, yT - 2.6, -hw, yT);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.5, bevelSegments: 3, curveSegments: 14 });
    geo.translate(0, 0, -0.75); return geo;
  })();
  const leg = (x, z) => {
    C(g, tr + 0.2, tr + 0.2, sl, x, ty, z, Mt, 28).rotation.z = Math.PI / 2;   // 套住圓管的金屬套
    add(g, legGeo, Mt, x, 0, z);                                               // 扁腳（寬的那一面順著管子）
    C(g, 0.95, 0.95, 0.25, x, 0.125, z, Dk, 14).scale.z = 0.8;                 // 腳底墊片
  };
  for (const z of [zB, zF]) { leg(xL + 22, z); leg(wingL - 18, z); if (wingL - xL > 200) leg((xL + wingL) / 2, z); }
  for (const x of [wingL + 16, xR - 16]) { leg(x, zW); leg(x, zB); }
  // 靠背（低矮、一段一段）、主座外端的扶手
  const seatL = xL + armW, inner = wingL - seatL, n = seatsOf(it), cw = inner / n, bh = backTop - pTop;
  for (let i = 0; i < n; i++) RB(g, cw - 1.2, bh, bt, 5, seatL + cw * (i + .5), pTop + bh / 2, zb + bt / 2 + 0.5, F);
  RB(g, cwid - bt - 1, bh, bt, 5, wingL + (cwid - bt) / 2, pTop + bh / 2, zb + bt / 2 + 0.5, F);
  RB(g, armW, armTop - pTop, sd - 1, 5, xL + armW / 2 + 0.5, pTop + (armTop - pTop) / 2, zb + sd / 2, F);
  // 貴妃外側的靠背（只到轉角那一段），外面包一片皮革
  const ws = d - sd > 130 ? Math.min(80, (d - sd) * 0.48) : 0, sideLen = ws ? sd + ws - 1.5 : Math.min(sd * 1.05, d * 0.5);   // 貴妃這一側：轉角後面再一個有靠背的座位，最前面才是沒有靠背的貴妃
  RB(g, bt, bh, sideLen, 5, xR - bt / 2 - 0.5, pTop + bh / 2, zb + sideLen / 2 + 0.5, F);
  RB(g, 1.4, bh - 6, sideLen - 8, 0.6, xR - 0.75, pTop + (bh - 6) / 2 + 1, zb + sideLen / 2 + 0.5, Lt);
  // 坐墊：主座每人一塊、轉角一塊、貴妃一塊
  const seatD = sd - bt - 2.5;
  for (let i = 0; i < n; i++) RB(g, cw - 1, cushT, seatD, 4.5, seatL + cw * (i + .5), pTop + cushT / 2, zb + bt + 1 + seatD / 2, F);
  const cornerW = cwid - bt - 2;
  RB(g, cornerW, cushT, seatD, 4.5, wingL + cornerW / 2 + 0.5, pTop + cushT / 2, zb + bt + 1 + seatD / 2, F);
  const chD = d - sd - ws - (ws ? 1.5 : 2);
  if (ws) RB(g, cornerW, cushT, ws - 1, 4.5, wingL + cornerW / 2 + 0.5, pTop + cushT / 2, zb + sd + ws / 2 - 0.5, F);
  RB(g, cwid - 2.4, cushT, chD, 4.5, xR - cwid / 2, pTop + cushT / 2, d / 2 - chD / 2 - 1.2, F);
  // 背墊：每個座位一塊方正的大背墊，靠在矮背板上、高出背板；轉角在後面和側面各一塊
  const bcH = h - seatTop + 1.5, bcT = 19, lean = 0.2;
  const backCush = (bw, x, z, ry) => { const o = new THREE.Group(); o.position.set(x, seatTop - 1.5, z); o.rotation.y = ry || 0; const q = RB(o, bw, bcH, bcT, 6.5, 0, bcH / 2, 0, F); q.rotation.x = -lean; q.position.z = bcT / 2 + 1 - Math.sin(lean) * bcH / 2 + Math.sin(lean) * bcH * 0.5; g.add(o); };
  for (let i = 0; i < n; i++) backCush(cw - 7, seatL + cw * (i + .5), zb + bt + 1);
  backCush(cornerW - 9, wingL + cornerW / 2 - 3, zb + bt + 1);
  if (ws) backCush(ws - 7, xR - bt - 1, zb + sd + ws / 2 - 0.5, -Math.PI / 2);
  else backCush(Math.min(sideLen - bt - 24, 78), xR - bt - 1, zb + bt + 22 + Math.min(sideLen - bt - 24, 78) / 2, -Math.PI / 2);
  // 抱枕：轉角兩個、扶手那端三個（小的、斜靠著）
  const pil = (pw, phh, pt, x, z, m, ln, ry, rz) => { const o = new THREE.Group(); o.position.set(x, seatTop - 1, z); o.rotation.y = ry || 0; const q = add(o, softPillowGeo(pw, phh, pt), m, 0, phh / 2, 0); q.rotation.x = -ln; q.rotation.z = rz || 0; q.position.z = Math.sin(ln) * phh / 2; g.add(o); };
  const pz = zb + bt + bcT + 9;
  // 左右各三顆、兩邊對稱：由外往內是橘色、深黃、綠色
  const PC = ['#d8672a', '#a8791a', '#5f7d55'].map(c => surfMat(it.fabric || 'fabric', c)), px = [13, 29, 46], pry = [0.75, 0.5, 0.35], pzz = [1, 7, 13], psz = [[44, 42, 12], [42, 40, 12], [40, 38, 11]], prz = [0.04, -0.05, 0.06], pln = [0.3, 0.36, 0.42];
  const xC = wingL + cornerW + 0.5;
  for (let k = 0; k < 3; k++) {
    if (n > 0) pil(psz[k][0], psz[k][1], psz[k][2], seatL + px[k], pz + pzz[k], PC[k], pln[k], pry[k], prz[k]);
    pil(psz[k][0], psz[k][1], psz[k][2], xC - px[k], pz + pzz[k], PC[k], pln[k], -pry[k], -prz[k]);
  }
  return mirrorIfLeft(it, g);
}
// 沿著平面上的一條外緣線掃出一片圓頭的厚殼（靠背、扶手連成一體）：pts 是外緣線 [x, z]，side 決定厚度往哪一邊長；
// tF(s, L)、hF(s, L) 給沿線每一處的厚度、頂高（s＝沿線距離、L＝全長），頭尾各在 r0、r1 的長度內收成圓頭
// o.bulge：外側面中段往外鼓多少；o.taper：內側面越往上越薄的比例；o.lift(s, L)：底緣離地多高
function sweepShellGeo(pts, side, y0, tF, hF, r0, r1, o = {}) {
  const n = pts.length, S = [0], A = 8, M = 2 * A + 3, pos = [], uv = [], idx = [];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = S[n - 1], cen = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = side * (b[1] - a[1]) / tl, nz = -side * (b[0] - a[0]) / tl, s = S[i];
    const k0 = s < r0 ? Math.sqrt(1 - (1 - s / r0) ** 2) : 1, k1 = L - s < r1 ? Math.sqrt(1 - (1 - (L - s) / r1) ** 2) : 1, k = Math.max(0.1, Math.min(k0, k1));
    const yb = y0 + (o.lift ? o.lift(s, L) : 0), t = tF(s, L), H = Math.max(yb + 2, hF(s, L)), c = t / 2, hw = k * t / 2, rr = Math.min(hw, (H - yb) * 0.45);
    const ring = [[c + hw, yb]];
    for (let j = 0; j <= 2 * A; j++) { const f = j / (2 * A) * Math.PI; ring.push([c + hw * Math.cos(f), H - rr + rr * Math.sin(f)]); }
    ring.push([c - hw, yb]);
    for (const q of ring) { const v = Math.min(1, Math.max(0, (q[1] - yb) / (H - yb))), wi = Math.min(1, Math.max(0, q[0] / t)); q[0] -= (o.bulge || 0) * k * Math.sin(Math.PI * Math.pow(v, 0.8)) * (1 - wi) + (o.taper || 0) * t * v * wi; }
    ring.forEach((q, j) => { pos.push(pts[i][0] + nx * q[0], q[1], pts[i][1] + nz * q[0]); uv.push(s / 60, j / M); });
    cen.push([pts[i][0] + nx * c, (yb + H) / 2, pts[i][1] + nz * c]);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + (j + 1) % M, c = a + M, e = b + M;
    idx.push(a, c, b, b, c, e);
  }
  const c0 = n * M, c1 = c0 + 1; pos.push(...cen[0], ...cen[n - 1]); uv.push(0, 0.5, L / 60, 0.5);
  for (let j = 0; j < M; j++) { idx.push(c0, j, (j + 1) % M); idx.push(c1, (n - 1) * M + (j + 1) % M, (n - 1) * M + j); }
  let vol = 0;                                                             // 面的正反看體積的正負：算出來是負的就整個翻面
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const q = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = q; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
const RCH_PIL_OPT = { key: 'rp', label: '圓抱枕', list: [opt('on', '放圓抱枕'), opt('off', '不放')] };
// 雷內沙發的造型參數（單位 cm）：要微調造型改這張表就好，不用動下面的建模程式
const RENE = {
  mainDepth: 80,     // 主座（一字型）的深度；圓貴妃的直徑＝家具的「深」
  seatH: 40,         // 座面高度
  seatEdge: 7,       // 座面上緣的圓角半徑
  seatInset: 5,      // 圓座比貴妃靠背的外緣內縮多少
  bite: 25,          // 主座靠貴妃那端內凹，最後面最多伸進圓座多少
  backT: 15,         // 主座靠背厚度
  armT: 22,          // 主座扶手厚度
  chaiseBackT: 14,   // 貴妃靠背厚度
  cornerR: 32,       // 靠背轉成扶手的轉角半徑
  bulge: 2.2,        // 靠背、扶手外側面中段往外鼓多少
  taper: 0.22,       // 靠背、扶手越往上越薄的比例（0＝上下一樣厚）
  armDrop: 30,       // 扶手前端從多長開始圓弧降低
  armEndH: 55,       // 扶手最前端（最低點）離地的高度；靠背最高點＝家具的「高」（預設 73）
  chaiseEnd: 0.16,   // 貴妃靠背繞到哪裡結束（弧度：0＝圓座正側邊，正值往前多繞一點，負值提早結束）
  chaiseDrop: 34,    // 貴妃靠背尾端從多長開始圓弧降低
  sqPillow: [62, 50, 21],   // 主座方抱枕：寬、高、厚
  sqPillowChaise: [72, 50, 21],   // 貴妃方抱枕：寬、高、厚
  sqPillowAt: [0.17, 0.68],   // 主座兩顆方抱枕的位置（0＝靠貴妃那端、1＝靠扶手那端）
  pillowLean: 0.24,  // 方抱枕往後靠的角度（弧度）
  roundPillowR: 23,  // 圓抱枕半徑
};
function buildRoundChaiseSofa(it) { // 雷內沙發：落地的整塊軟包主座＋圓形貴妃（雙色），靠背順著轉角彎成扶手、貴妃的靠背繞著圓座半圈；方形大背枕、圓抱枕（預設貴妃在右，選左時鏡射）
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), F2 = fabMat(it, 'color2'), Dk = mat('#232323', 0.7);
  const seamOf = c => surfMat(it.fabric || 'fabric', '#' + new THREE.Color(c).multiplyScalar(0.86).getHexString());
  const xL = -w / 2, xR = w / 2, zb = -d / 2;
  const P = RENE, R = Math.min(d / 2, w * 0.3), cx = xR - R, cz = zb + R, Rs = R - P.seatInset;          // 圓貴妃：直徑＝總深度，圓座比外圈的靠背內縮一點
  const sd = Math.min(P.mainDepth, d * 0.6), zf = zb + sd, xJ = xR - 2 * R + 4;              // 主座深度、主座和圓貴妃的交界
  const seatTop = Math.min(P.seatH, h * 0.58), y0 = 1.5, yw = 2.5, er = Math.min(P.seatEdge, seatTop * 0.2);
  const tb = P.backT, ta = Math.min(P.armT, (xJ - xL) * 0.15), tc = P.chaiseBackT, rc = Math.min(P.cornerR, sd * 0.42), bg = P.bulge;   // 靠背、扶手、貴妃靠背的厚度；殼的外側面中段微鼓（bg）
  const Rg = Rs + 0.8, xb = xJ + Math.min(P.bite, R * 0.33);                                 // 主座靠貴妃那端是內凹的弧，貼著圓座；越往後越伸進去，最多伸到 xb
  const line = (P, x0, z0, x1, z1) => { const m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4)); for (let i = 1; i <= m; i++) P.push([x0 + (x1 - x0) * i / m, z0 + (z1 - z0) * i / m]); };
  const arc = (P, ax, az, r, a0, a1) => { const m = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r / 3)); for (let i = 1; i <= m; i++) { const a = a0 + (a1 - a0) * i / m; P.push([ax + r * Math.cos(a), az + r * Math.sin(a)]); } };
  const drop = (s, L, len, top, low) => { const u = Math.min(1, Math.max(0, (s - (L - len)) / len)); return top - (top - low) * (1 - Math.sqrt(1 - u * u)); };   // 尾端的頂高用四分之一圓弧降下來
  // 主座：深色底座、底部一圈滾邊、整塊的軟包座體（前緣一道車線）；平面輪廓靠貴妃那端內凹
  const mx0 = xL + ta - 5, mz0 = zb + tb - 5;
  const aF = Math.PI - Math.asin(Math.max(-1, Math.min(1, (zf - cz) / Rg))), aB = Math.PI + Math.acos(Math.min(1, (cx - xb) / Rg));
  const xF = cx + Rg * Math.cos(aF), fl = Math.min(7, sd * 0.1);
  const slab = (y, ht, bv, grow) => {                                        // 照主座的平面輪廓擠出一塊：上下緣倒圓角
    const sh = new THREE.Shape(), a0 = aF + fl / Rg;
    sh.moveTo(mx0, -mz0); sh.lineTo(mx0, -zf); sh.lineTo(xF - fl, -zf); sh.quadraticCurveTo(xF, -zf, cx + Rg * Math.cos(a0), -(cz + Rg * Math.sin(a0)));
    for (let i = 1; i <= 28; i++) { const q = a0 + (aB - a0) * i / 28; sh.lineTo(cx + Rg * Math.cos(q), -(cz + Rg * Math.sin(q))); }
    sh.lineTo(xb, -mz0); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: ht - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelOffset: grow - bv, bevelSegments: 5, curveSegments: 10 }), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 60, uv.getY(i) / 60);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y + bv, 0); return geo;
  };
  B(g, xJ - xL - 14, yw, sd - 10, (xL + xJ) / 2, yw / 2, zb + sd / 2, Dk);
  add(g, slab(yw, 3.8, 1.4, -0.2), F, 0, 0, 0);
  add(g, slab(5.4, seatTop - 5.4, er, -0.6), F, 0, 0, 0);
  C(g, 0.22, 0.22, xF - fl - mx0 - er, (mx0 + er + xF - fl) / 2, seatTop - er - 0.3, zf - 0.62, seamOf(it.color), 6).rotation.z = Math.PI / 2;
  // 主座的靠背＋扶手：一片厚殼從交界沿著背面走、轉過圓角、順著側邊往前，扶手比靠背厚，前端圓弧收低、底緣微微離地
  const mp = [[xb, zb + bg]]; line(mp, xb, zb + bg, xL + bg + rc, zb + bg); arc(mp, xL + bg + rc, zb + bg + rc, rc, -Math.PI / 2, -Math.PI); line(mp, xL + bg, zb + bg + rc, xL + bg, zf + 2);
  const sC = xb - xL - bg - rc, eC = sC + Math.PI * rc / 2, tail = (s, L, len) => Math.min(1, Math.max(0, (s - (L - len)) / len));
  add(g, sweepShellGeo(mp, 1, y0, s => { const u = Math.min(1, Math.max(0, (s - sC + 14) / (eC - sC + 14))); return tb + (ta - tb) * u * u * (3 - 2 * u); },
    (s, L) => drop(s, L, Math.min(P.armDrop, sd * 0.4), h, Math.max(seatTop + 4, Math.min(P.armEndH, h))), 2, ta * 0.62, { bulge: bg, taper: P.taper, lift: (s, L) => 4 * tail(s, L, 26) ** 2 }), F, 0, 0, 0);
  // 圓貴妃：深色底座、圓座（上緣圓角、底部滾邊、側面一圈車線）、靠主座那個後角補一小塊
  C(g, Rs - 7, Rs - 7, yw, cx, yw / 2, cz, Dk, 48);
  const pr = [[0, yw], [Rs - 2.4, yw], [Rs - 0.6, 3.1], [Rs - 0.1, 4.4], [Rs - 0.6, 5.7], [Rs - 1.6, 6.3], [Rs - 0.5, 7.4], [Rs, 9.4]];
  for (let j = 0; j <= 8; j++) { const f = j / 8 * Math.PI / 2; pr.push([Rs - er + er * Math.cos(f), seatTop - er + er * Math.sin(f)]); }
  pr.push([0, seatTop]);
  add(g, new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), 96), F2, cx, 0, cz);
  const zc = cz - Math.sqrt(Math.max(0, Rs * Rs - (cx - xb) ** 2)) + 1.5;
  RB(g, cx - xb - 0.8, seatTop - 5.4, zc - zb - 6, 3, (xb + 0.8 + cx) / 2, 5.4 + (seatTop - 5.4) / 2, (zb + 6 + zc) / 2, F2);
  add(g, new THREE.TorusGeometry(Rs + 0.02, 0.22, 6, 120), seamOf(it.color2), cx, seatTop - er - 0.3, cz).rotation.x = Math.PI / 2;
  // 圓貴妃的靠背：從交界直直走到圓心正後方，再繞著圓座到外側，全程等高、尾端大圓角收下來
  const cp = [[xb, zb + bg]]; line(cp, xb, zb + bg, cx, zb + bg); arc(cp, cx, cz, R - bg, -Math.PI / 2, P.chaiseEnd);
  add(g, sweepShellGeo(cp, -1, y0, (s, L) => tc - 2 * tail(s, L, L * 0.4),
    (s, L) => drop(s, L, Math.min(P.chaiseDrop, R * 0.46), h, seatTop + 2), 2, 8, { bulge: bg, taper: P.taper, lift: (s, L) => 3 * tail(s, L, 22) ** 2 }), F2, 0, 0, 0);
  // 小黑腳
  for (const [x, z] of [[xL + 12, zb + 10], [xL + 12, zf - 10], [xJ - 12, zb + 10], [xJ - 12, zf - 10]]) C(g, 2.2, 2.2, 1.2, x, 0.6, z, Dk, 12);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; C(g, 2.2, 2.2, 1.2, cx + (Rs - 14) * Math.cos(a), 0.6, cz + (Rs - 14) * Math.sin(a), Dk, 12); }
  // 方抱枕：斜靠在靠背上、高出靠背；主座兩顆用貴妃的布色、貴妃一顆用主座的布色（跳色）
  const lean = (geo, nm, m, x, z, ry, ln, rz) => {                          // (x, z)＝枕頭上緣靠著的位置，底部往前滑出去；nm＝面板上顯示的名字
    geo.userData.pilName = nm; const o = new THREE.Group(), ph = geo.boundingBox.max.y - geo.boundingBox.min.y; o.position.set(x, seatTop - 1, z); o.rotation.y = ry || 0;
    const q = add(o, geo, m, 0, ph / 2 * Math.cos(ln), Math.sin(ln) * ph / 2); q.rotation.x = -ln; q.rotation.z = rz || 0; g.add(o);
  };
  const span = xJ - (xL + ta), bw = Math.min(P.sqPillow[0], span * 0.44), bz = zb + tb + 6;
  for (const f of P.sqPillowAt) lean(softPillowGeo(bw, P.sqPillow[1], P.sqPillow[2]), '方抱枕', F2, xJ - span * f, bz, 0, P.pillowLean, f < 0.5 ? 0.015 : -0.02);
  lean(softPillowGeo(Math.min(P.sqPillowChaise[0], R * 0.96), P.sqPillowChaise[1], P.sqPillowChaise[2]), '方抱枕', F, cx - R * 0.1, zb + tc + 6, 0, P.pillowLean, 0.02);
  // 圓抱枕：扶手那端一顆、貴妃外側一顆
  if (it.rp !== 'off') {
    const P3 = surfMat(it.fabric || 'fabric', it.color3 || '#d49a2e'), rp = Math.min(P.roundPillowR, R * 0.31);
    const rpGeo = () => {
      const pts = []; for (let j = 0; j <= 20; j++) { const a = -Math.PI / 2 + j / 20 * Math.PI; pts.push(new THREE.Vector2(Math.max(0, rp * Math.pow(Math.cos(a), 0.8)), rp * 0.33 * Math.sin(a))); }
      const geo = new THREE.LatheGeometry(pts, 40); geo.rotateX(Math.PI / 2); geo.computeBoundingBox(); geo.userData.pil = true; return geo;
    };
    lean(rpGeo(), '圓抱枕', P3, xL + ta + rp * 0.85, zb + tb + 25, 0.5, 0.28);
    const a = -0.72, rr = R - tc - 10;
    lean(rpGeo(), '圓抱枕', P3, cx + rr * Math.cos(a), cz + rr * Math.sin(a), Math.atan2(-Math.cos(a), -Math.sin(a)), 0.3);
  }
  return mirrorIfLeft(it, g);
}
const BED_MATT_OPT = { key: 'matt', label: '床墊', list: [opt('on', '放床墊'), opt('off', '不放（只看床台）')] };
// U 形的薄殼床頭（背板＋兩片側翼連成一體）：原點在背板外側的底邊中央，往 +z 是床的方向；depthAt(y)＝那個高度側翼往前伸多長，上緣、側翼前端都是圓的
function wingShellGeo(w, Hh, t, rc, depthAt) {
  const xc = w / 2 - t / 2, zc = t / 2, N1 = 6, NA = 8, NB = 14, E = 5, rt = Math.min(t / 2 - 0.2, 1.8), lv = [];
  for (let i = 0; i <= 14; i++) lv.push([(Hh - rt) * i / 14, t / 2]);
  for (let j = 1; j <= 4; j++) { const q = j / 4 * Math.PI / 2; lv.push([Hh - rt + rt * Math.sin(q), Math.max(0.2, t / 2 - rt * (1 - Math.cos(q)))]); }
  const slice = (y, ht) => {
    const zt = Math.max(zc + rc + 0.5, depthAt(y) - t / 2), c = [];
    for (let i = 0; i < N1; i++) c.push([xc, zt + (zc + rc - zt) * i / N1]);
    for (let i = 0; i < NA; i++) { const q = -Math.PI / 2 * i / NA; c.push([xc - rc + rc * Math.cos(q), zc + rc + rc * Math.sin(q)]); }
    for (let i = 0; i < NB; i++) c.push([(xc - rc) * (1 - 2 * i / NB), zc]);
    for (let i = 0; i < NA; i++) { const q = -Math.PI / 2 - Math.PI / 2 * i / NA; c.push([-(xc - rc) + rc * Math.cos(q), zc + rc + rc * Math.sin(q)]); }
    for (let i = 0; i <= N1; i++) c.push([-xc, zc + rc + (zt - zc - rc) * i / N1]);
    const n = c.length, T = c.map((_, i) => { const p = c[Math.max(0, i - 1)], q = c[Math.min(n - 1, i + 1)], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; }), ring = [];
    for (let i = 0; i < n; i++) ring.push([c[i][0] - T[i][1] * ht, c[i][1] + T[i][0] * ht]);
    for (let k = 1; k <= E; k++) { const f = k / (E + 1) * Math.PI, i = n - 1; ring.push([c[i][0] + ht * (-T[i][1] * Math.cos(f) + T[i][0] * Math.sin(f)), c[i][1] + ht * (T[i][0] * Math.cos(f) + T[i][1] * Math.sin(f))]); }
    for (let i = n - 1; i >= 0; i--) ring.push([c[i][0] + T[i][1] * ht, c[i][1] - T[i][0] * ht]);
    for (let k = 1; k <= E; k++) { const f = k / (E + 1) * Math.PI; ring.push([c[0][0] + ht * (T[0][1] * Math.cos(f) - T[0][0] * Math.sin(f)), c[0][1] + ht * (-T[0][0] * Math.cos(f) - T[0][1] * Math.sin(f))]); }
    return { ring, n };
  };
  const pos = [], uv = [], idx = []; let M = 0, n = 0, U = null;
  for (const [y, ht] of lv) {
    const sl = slice(y, ht); M = sl.ring.length; n = sl.n;
    if (!U) { U = [0]; for (let i = 1; i < M; i++) U.push(U[i - 1] + Math.hypot(sl.ring[i][0] - sl.ring[i - 1][0], sl.ring[i][1] - sl.ring[i - 1][1])); }
    sl.ring.forEach((q, i) => { pos.push(q[0], y, q[1]); uv.push(U[i] / 60, y / 60); });
  }
  for (let j = 0; j < lv.length - 1; j++) for (let i = 0; i < M; i++) { const p = j * M + i, q = j * M + (i + 1) % M; idx.push(p, p + M, q, q, p + M, q + M); }
  const cap = (base, flip) => {                                           // 上、下的封口：外圈和內圈一格一格對接，兩端的半圓用扇形補
    const tri = (p, q, r) => flip ? idx.push(base + p, base + r, base + q) : idx.push(base + p, base + q, base + r), inn = i => n + E + (n - 1 - i);
    for (let i = 0; i < n - 1; i++) { tri(i, i + 1, inn(i + 1)); tri(i, inn(i + 1), inn(i)); }
    for (let k = 0; k <= E; k++) tri(n - 1, n + k, n + k + 1 <= n + E ? n + k + 1 : inn(n - 1));
    for (let k = 0; k <= E; k++) tri(inn(0), 2 * n + E + k, k < E ? 2 * n + E + k + 1 : 0);
  };
  const b0 = pos.length / 3; for (let i = 0; i < M; i++) { pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); uv.push(uv[i * 2], uv[i * 2 + 1]); }   // 底面另外一組頂點：底邊才會是利落的折角
  cap(b0, false); cap((lv.length - 1) * M, true);
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) { const p = idx[i] * 3, q = idx[i + 1] * 3, r = idx[i + 2] * 3; vol += pos[p] * (pos[q + 1] * pos[r + 2] - pos[q + 2] * pos[r + 1]) - pos[p + 1] * (pos[q] * pos[r + 2] - pos[q + 2] * pos[r]) + pos[p + 2] * (pos[q] * pos[r + 1] - pos[q + 1] * pos[r]); }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const q = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = q; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
function buildAmisBed(it) { // 阿美族床台：布面床框浮在四支亮面金屬刀片腳上，床墊內嵌 5 cm；床頭是一片往後仰的布面薄殼，兩端圓角往前彎成淺淺的側翼（上窄、到床墊的高度最寬），裡面嵌一塊跳色的靠墊（中間一道車線）
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), F2 = fabMat(it, 'color2'), M = mat(it.color3 || '#c9ccd0', 0.14, 1), Dk = mat('#232323', 0.75);
  const seam = surfMat(it.fabric || 'fabric', '#' + new THREE.Color(it.color2).multiplyScalar(0.84).getHexString());
  const zb = -d / 2, zf = d / 2;
  const legH = Math.min(14, h * 0.14), fh = Math.min(17, h * 0.17), top = legH + fh, inset = Math.min(5, fh * 0.4), rim = 4;   // inset：床墊沉進床框的深度
  const mh = Math.min(27, h * 0.27), my = top - inset;                                                                      // 床墊厚度、床墊底的高度
  // 床頭的尺寸：外殼厚度、轉角半徑、靠墊厚度、往後仰的角度；整片床頭比床框的底再低一點
  const tw = 4, rc = Math.min(6, w * 0.04), padT = 7, lean = Math.min(0.09, 8 / h), hy0 = Math.max(4, legH - 4), Hh = (h - hy0 - Math.min(12, d * 0.06) * Math.sin(lean)) / Math.cos(lean) - 0.8, hz0 = zb + Hh * Math.sin(lean);
  const yk = (my + mh * 0.35 - hy0) / Math.cos(lean), dTop = Math.min(12, d * 0.06), dMid = Math.min(24, d * 0.12), dBot = Math.min(16, d * 0.08);   // 側翼的深度：最上面、床墊的高度（最寬）、最下面
  const depthAt = y => { const e = v => v * v * (3 - 2 * v); return y < yk ? dBot + (dMid - dBot) * e(y / yk) : dMid + (dTop - dMid) * e((y - yk) / (Hh - yk)); };
  const hb = new THREE.Group(); hb.position.set(0, hy0, hz0); hb.rotation.x = -lean; g.add(hb);
  add(hb, wingShellGeo(w, Hh, tw, rc, depthAt), F, 0, 0, 0);
  // 靠墊：嵌在外殼裡，比外殼矮一點；中間一道車線、上緣一圈滾邊
  const pw = w - 2 * tw - 1.2, py0 = (my - hy0) / Math.cos(lean) - 1, ph = Hh - 3.5 - py0, pz = tw - 0.6 + padT / 2;
  RB(hb, pw, ph, padT, 3.2, 0, py0 + ph / 2, pz, F2);
  B(hb, 0.35, ph - 6.5, 0.5, 0, py0 + ph / 2, pz + padT / 2 - 0.15, seam);
  { const c = C(hb, 0.3, 0.3, pw - 7, 0, py0 + ph - 3.1, pz + padT / 2 - 1.3, seam, 6); c.rotation.z = Math.PI / 2; }
  // 床框：四面圍板＋裡面的床板（比圍板低 inset）；後面那片藏在靠墊底下
  const bw = w - 2 * tw - 0.8, bz0 = zb + Hh * Math.sin(lean) + tw * 0.5, bl = zf - bz0, bzc = (bz0 + zf) / 2;
  for (const sd of [-1, 1]) RB(g, rim, fh, bl, 1.8, sd * (bw / 2 - rim / 2), legH + fh / 2, bzc, F);
  RB(g, bw, fh, rim, 1.8, 0, legH + fh / 2, zf - rim / 2, F); RB(g, bw, fh, rim, 1.8, 0, legH + fh / 2, bz0 + rim / 2, F);
  B(g, bw - rim, fh - inset - 1, bl - rim, 0, legH + 1 + (fh - inset - 1) / 2, bzc, F);
  B(g, bw - 10, 1.2, bl - 10, 0, legH + 0.4, bzc, Dk);
  // 金屬刀片腳：斜斜往外踩的腳掌
  const lg = new THREE.Shape(); lg.moveTo(-1.3, legH); lg.lineTo(1.3, legH); lg.lineTo(1.0, 4.2); lg.bezierCurveTo(1.0, 2.2, 2.6, 1.0, 9.5, 0.75); lg.lineTo(9.5, 0); lg.lineTo(-0.6, 0); lg.bezierCurveTo(-1.0, 1.5, -1.0, 4, -1.3, legH);
  const lgeo = new THREE.ExtrudeGeometry(lg, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2, curveSegments: 10 }); lgeo.translate(0, 0, -1.1);
  for (const sx of [-1, 1]) for (const [z, sz] of [[zf - 9, 1], [bz0 + 12, -1]]) add(g, lgeo, M, sx * (bw / 2 - 7), 0, z).rotation.y = Math.atan2(-sz, sx);
  // 床墊：深色側邊＋白色表布，沉進床框 inset；床頭那端貼著靠墊
  if (it.matt !== 'off') {
    const mzb = hz0 - (my - hy0 + 3) * Math.tan(lean) + (tw + padT) / Math.cos(lean) + 0.3, mw = bw - 2 * rim - 0.6, ml = zf - rim - 0.3 - mzb, mz = mzb + ml / 2;
    const Sd = surfMat('fabric', '#2e2f33'), Tp = surfMat('fabric', '#f4f3ef');
    RB(g, mw, mh - 5, ml, 3, 0, my + (mh - 5) / 2, mz, Sd);
    RB(g, mw, 7.5, ml, 3.4, 0, my + mh - 3.75, mz, Tp);
    RB(g, mw + 0.5, 0.7, ml + 0.5, 0.3, 0, my + mh - 7.3, mz, Dk);
  }
  return g;
}
function buildMilaBed(it) { // 米拉床台：深色皮革床框（總高 30、腳高 15）＋黑色床板，四支不鏽鋼扁腳；床頭往後仰、上寬下窄，側面看是下厚上薄的楔形，深色外殼包著淺色的正面軟包（八道直條車線，越往兩側越往外斜成扇形），淺色皮面翻過上緣
  const g = new THREE.Group(), { w, d, h } = it;
  const F1 = fabMat(it), F2 = fabMat(it, 'color2'), M = mat(it.color3 || '#b9b6b0', 0.12, 1), Dk = mat('#121212', 0.95), Gl = mat('#1a1a1a', 0.6);
  const zb = -d / 2, zf = d / 2, legH = Math.min(15, h * 0.14), top = Math.min(30, h * 0.28), fh = top - legH;
  // 床頭：y0～h，背面垂直；正面在底部離背面 Db、頂端 Dt（往後仰）；底部寬 Wb、頂端寬 Wt
  const y0 = Math.max(3, legH - 2), H = h - y0, Db = Math.min(22, d * 0.105), Dt = Math.min(6, d * 0.03), Wt = w, Wb = w - Math.min(8, w * 0.05), ct = 3.2, N = 8;
  const morph = (nx, ny, fn) => { const geo = new THREE.BoxGeometry(1, 1, 1, nx, ny, 1), P = geo.attributes.position, U = geo.attributes.uv;
    for (let i = 0; i < P.count; i++) { const u = P.getX(i), v = P.getY(i) + 0.5, q = fn(u, v, P.getZ(i) > 0); P.setXYZ(i, q[0], q[1], q[2]); U.setXY(i, q[0] / 60, q[1] / 60 + (P.getZ(i) > 0 ? 0 : 3)); }
    geo.computeVertexNormals(); return geo; };
  const Wv = v => Wb + (Wt - Wb) * v, Dv = v => Db + (Dt - Db) * v;
  add(g, morph(2, 6, (u, v, fr) => [u * Wv(v), y0 + v * H, zb + (fr ? Dv(v) - 0.2 : 0)]), F2, 0, 0, 0);            // 深色外殼（側面、背面）
  const chan = (x, v) => { const Wp = Wv(v) * (0.74 + 0.26 * v) - 3, t = (x / Wp + 0.5) * N, dc = Math.abs(t - Math.round(t)) * Wp / N; return (t < -0.5 || t > N + 0.5 ? 1.5 : 1.7 - 1.5 * Math.exp(-((dc / 0.9) ** 2)) + 0.5 * Math.cos(Math.PI * Math.min(1, dc / (Wp / N / 2))) * 0 + 0.45 * (1 - Math.min(1, dc / (Wp / N / 2)) ** 2)); };   // 一片片微鼓的皮面，片和片之間一道細細的凹線
  add(g, morph(240, 20, (u, v, fr) => { const W = Wv(v) - 1.2, x = u * W, e = Math.min(1, (0.5 - Math.abs(u)) * W / 1.6), rt = Math.min(1, Math.sqrt(Math.max(0, (1 - v) * (H - 1.4) / 1.8)) * 0.7 + 0.3);   // 兩側、上緣收圓
    return [x, y0 + 1 + v * (H - 1.4), zb + Dv(v) + (fr ? (ct - 2.6 + chan(x, v)) * Math.sqrt(Math.max(0, e)) * rt : -0.6)]; }), F1, 0, 0, 0);    // 淺色正面軟包
  RB(g, Wt - 0.4, 1.5, Dt + 1.6, 0.7, 0, h - 0.75, zb + (Dt + 1.6) / 2 + 0.3, F1);   // 淺色皮面翻過上緣（平的，只有邊緣倒圓）
  for (const sd of [-1, 1]) { const o = add(g, new THREE.CylinderGeometry(0.28, 0.28, Math.hypot(H - 6, Db - Dt), 6), F1, sd * (Wb + Wt) / 4, y0 + H / 2, zb + (Db + Dt) / 2 + 0.2); o.rotation.x = -Math.atan2(Db - Dt, H - 6); o.rotation.z = -sd * Math.atan2((Wt - Wb) / 2, H); }   // 側面前緣的淺色滾邊
  // 床框：四面圓角圍板＋黑色床板（比圍板低一點）；後面那片藏在床頭底下
  const bw = Wb - 2.4, rim = 4.5, bz0 = zb + Db * 0.45, bl = zf - bz0, bzc = (bz0 + zf) / 2;
  for (const sd of [-1, 1]) RB(g, rim, fh, bl, 2, sd * (bw / 2 - rim / 2), legH + fh / 2, bzc, F2);
  RB(g, bw, fh, rim, 2, 0, legH + fh / 2, zf - rim / 2, F2); RB(g, bw, fh, rim, 2, 0, legH + fh / 2, bz0 + rim / 2, F2);
  B(g, bw - rim, fh - 1.8, bl - rim, 0, legH + (fh - 1.8) / 2, bzc, Dk);
  B(g, 0.25, 0.12, bl - 2 * rim, 0, top - 1.75, bzc, mat('#060606', 1));                                              // 床板中間的接縫
  // 不鏽鋼扁腳：上寬下窄，斜 45° 站在四個角落，底下一顆黑色腳墊
  const lgeo = new THREE.CylinderGeometry(2.9, 1.9, legH - 0.5, 4, 1).toNonIndexed(); lgeo.rotateY(Math.PI / 4); lgeo.scale(1, 1, 0.32); lgeo.computeVertexNormals();
  for (const sx of [-1, 1]) for (const [z, sz] of [[zf - 6, 1], [bz0 + 14, -1]]) { add(g, lgeo, M, sx * (bw / 2 - 6.5), 0.5 + (legH - 0.5) / 2, z).rotation.y = sx * sz * Math.PI / 4; C(g, 0.7, 0.7, 0.5, sx * (bw / 2 - 6.5), 0.25, z, Gl, 10); }
  // 床墊：放在床框上
  if (it.matt !== 'off') {
    const mzb = zb + Dv((top - y0 + 12) / H) + ct + 0.6, mw = bw - 1, ml = zf - 0.5 - mzb, mz = mzb + ml / 2, mh = Math.min(25, h * 0.23);
    RB(g, mw, mh, ml, 4, 0, top - 1.8 + mh / 2, mz, surfMat('fabric', '#f4f3ef'));
    RB(g, mw + 0.4, 0.6, ml + 0.4, 0.3, 0, top - 1.8 + mh * 0.3, mz, surfMat('fabric', '#d9d6cf'));
  }
  return g;
}
function buildEmmaBed(it) { // Emma 床台：布面床框（寬邊的圍板、圓角，裡面黑色床板）架在四支往外斜、往下收細的深色木腳上；床頭是一片往後仰的布面厚板，立在床框後緣上面，四邊一圈車線
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), Wd = surfMat('wood', it.color2), Dk = mat('#121212', 0.95);
  const seam = surfMat(it.fabric || 'fabric', '#' + new THREE.Color(it.color).multiplyScalar(0.82).getHexString());
  const zb = -d / 2, zf = d / 2, top = Math.min(30, h * 0.3), legH = Math.min(15, top * 0.5), fh = top - legH, rim = Math.min(9, w * 0.06);
  // 床頭：往後仰的厚板，底下坐在床框上
  const ht = Math.min(11, d * 0.055), lean = Math.min(0.1, 9 / h), hw = w - 4, Hh = (h - top + 1.5 - ht * Math.sin(lean)) / Math.cos(lean), hz = zb + Hh * Math.sin(lean) + 0.2;
  const hb = new THREE.Group(); hb.position.set(0, top - 1.5, hz); hb.rotation.x = -lean; g.add(hb);
  RB(hb, hw, Hh, ht, 2.2, 0, Hh / 2, ht / 2, F);
  for (const sd of [-1, 1]) B(hb, 0.22, Hh - 5, 0.22, sd * (hw / 2 - 2.3), Hh / 2, ht + 0.02, seam);                    // 正面邊緣的車線
  B(hb, hw - 4.6, 0.22, 0.22, 0, Hh - 2.4, ht + 0.02, seam);
  // 床框：四面寬圍板＋黑色床板；床框後緣在床頭底下
  const bz0 = hz - 0.5, bl = zf - bz0, bzc = (bz0 + zf) / 2;
  for (const sd of [-1, 1]) RB(g, rim, fh, bl, 2.4, sd * (w / 2 - rim / 2), legH + fh / 2, bzc, F);
  RB(g, w, fh, rim, 2.4, 0, legH + fh / 2, zf - rim / 2, F); RB(g, w, fh, rim, 2.4, 0, legH + fh / 2, bz0 + rim / 2, F);
  B(g, w - rim, fh - 1.2, bl - rim, 0, legH + (fh - 1.2) / 2, bzc, Dk);
  B(g, 0.25, 0.12, bl - 2 * rim, 0, top - 1.15, bzc, mat('#050505', 1));
  // 木腳：方錐形，上粗下細，往外斜
  const lgeo = new THREE.CylinderGeometry(3.6, 2.2, legH, 4, 1).toNonIndexed(); lgeo.rotateY(Math.PI / 4);
  { const P = lgeo.attributes.position; for (let i = 0; i < P.count; i++) { const k = (legH / 2 - P.getY(i)) / legH * 2.6; P.setX(i, P.getX(i) + k); P.setZ(i, P.getZ(i) + k * 0.5); } lgeo.computeVertexNormals(); }
  for (const sx of [-1, 1]) for (const [z, sz] of [[zf - 9, 1], [bz0 + 9, -1]]) add(g, lgeo, Wd, sx * (w / 2 - 9), legH / 2, z).scale.set(sx, 1, sz);
  // 床墊
  if (it.matt !== 'off') {
    const mzb = hz + ht + 0.6 + 8 * Math.tan(lean), mw = w - 2, ml = zf - 1 - mzb, mh = Math.min(25, h * 0.23);
    RB(g, mw, mh, ml, 4, 0, top - 1.2 + mh / 2, mzb + ml / 2, surfMat('fabric', '#f4f3ef'));
    RB(g, mw + 0.4, 0.6, ml + 0.4, 0.3, 0, top - 1.2 + mh * 0.3, mzb + ml / 2, surfMat('fabric', '#d9d6cf'));
  }
  return g;
}
// 有車線的皮面軟墊：圓角的方塊，沿著指定的平面淺淺凹一圈（皮面拼接的車線），兩條線交會的地方凹得更深（像拉釦）
// seams：[{ a: 'x'|'y'|'z', at: 位置, f: 只在哪些面出現（傳入法線，回傳 0~1）}]；o.taper：下半段往內收
function seamBoxGeo(bw, bh, bd, R, seams, o = {}) {
  const dep = o.dep || 0.42, sg = o.sg || 0.75, dims = { x: bw, y: bh, z: bd };
  R = Math.max(0.3, Math.min(R, bw / 2 - 0.1, bh / 2 - 0.1, bd / 2 - 0.1));
  const cuts = a => {
    const L = dims[a], v = [-L / 2, L / 2], push = q => { if (q > -L / 2 + 0.05 && q < L / 2 - 0.05) v.push(q); };
    for (const k of [0.15, 0.4, 0.7, 1]) { push(-L / 2 + R * k); push(L / 2 - R * k); }
    for (const q of seams) if (q.a === a) for (const k of [-3.2, -2.2, -1.5, -1, -0.6, -0.3, 0, 0.3, 0.6, 1, 1.5, 2.2, 3.2]) push(q.at + k * sg);
    if (a === 'y' && o.taper) push(o.taper.y);
    v.sort((p, q) => p - q);
    const u = [v[0]]; for (const q of v) if (q - u[u.length - 1] > 0.08) u.push(q);
    const out = [u[0]]; for (let i = 1; i < u.length; i++) { const gap = u[i] - u[i - 1], n = Math.ceil(gap / 14); for (let j = 1; j <= n; j++) out.push(u[i - 1] + gap * j / n); }
    return out;
  };
  const X = cuts('x'), Y = cuts('y'), Z = cuts('z'), nx_ = X.length - 1, ny_ = Y.length - 1, nz_ = Z.length - 1;
  const geo = new THREE.BoxGeometry(1, 1, 1, nx_, ny_, nz_), P = geo.attributes.position, N = geo.attributes.normal;
  const A = bw / 2, Bh = bh / 2, Cc = bd / 2, cl = (v, m) => Math.max(-m, Math.min(m, v));
  for (let i = 0; i < P.count; i++) {
    let px = X[Math.round((P.getX(i) + 0.5) * nx_)], py = Y[Math.round((P.getY(i) + 0.5) * ny_)], pz = Z[Math.round((P.getZ(i) + 0.5) * nz_)];
    const cx = cl(px, A - R), cy = cl(py, Bh - R), cz = cl(pz, Cc - R);
    let nx = px - cx, ny = py - cy, nz = pz - cz; const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
    px = cx + nx * R; py = cy + ny * R; pz = cz + nz * R;
    let D = 0, gx = 0, gy = 0, gz = 0;
    for (const q of seams) {
      const nn = q.a === 'x' ? nx : q.a === 'y' ? ny : nz; let wt = 1 - nn * nn; if (q.f) wt *= q.f(nx, ny, nz);
      if (wt <= 0.001) continue;
      const t = ((q.a === 'x' ? px : q.a === 'y' ? py : pz) - q.at) / sg, e = Math.exp(-t * t) * wt * dep, ge = -2 * t / sg * e;
      D += e; if (q.a === 'x') gx += ge; else if (q.a === 'y') gy += ge; else gz += ge;
    }
    px -= nx * D; py -= ny * D; pz -= nz * D;
    let mx = nx + gx, my = ny + gy, mz = nz + gz;
    if (o.taper && py < o.taper.y) {
      const span = o.taper.y + Bh, t = (o.taper.y - py) / span, k = o.taper.amt * t * t;
      px *= 1 - k / A; pz *= 1 - k / Cc; my -= 2 * o.taper.amt * t / span * Math.hypot(nx, nz);
    }
    P.setXYZ(i, px, py, pz);
    const ml = Math.hypot(mx, my, mz) || 1; N.setXYZ(i, mx / ml, my / ml, mz / ml);
  }
  P.needsUpdate = true; N.needsUpdate = true; geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
function build171Sofa(it) { // 171 型：牛皮 L 型——懸浮的厚座體（整片坐面、車線分格）、矮胖扶手、可往後靠的三塊背墊、布面長腰枕、黑鐵翼型腳；預設貴妃在右，選左時鏡射
  const g = new THREE.Group(), { w, d, h } = it;
  const F = surfMat(it.fabric || 'leather', it.color), Pl = surfMat('fabric', it.color2), M = mat(it.color3 || '#232325', 0.5, 0.55);
  const legH = Math.min(13, h * 0.145), seatTop = Math.min(44, h * 0.49), armTop = Math.min(55, h * 0.61), bodyH = seatTop - legH;
  const awL = Math.min(20, w * 0.07), awR = awL, cwid = Math.min(101.67, w * 0.35673), sd = Math.min(102, d);
  const zb = -d / 2, xL = -w / 2, xR = w / 2, wingL = xR - cwid, seatL = xL + awL, n = seatsOf(it), inner = wingL - seatL, cw = inner / n;
  const ext = d - sd, ySeam = -bodyH / 2 + bodyH * 0.44, side = (nx, ny) => 1 - Math.max(0, ny);
  // 背墊：厚厚一塊往後靠，正面一條直線、一條橫線，交會處凹下去
  const lean = 0.3, bT = 15, by0 = seatTop + 2, bHs = (h - by0 - bT * Math.sin(lean)) / Math.cos(lean) + 1.35, bz = zb + bHs * Math.sin(lean) + 0.5;
  const zFace = bz + bT * Math.cos(lean);                                  // 背墊正面底部的位置
  const backCush = (bw, x) => { const o = new THREE.Group(); o.position.set(x, by0, bz); o.rotation.x = -lean; g.add(o);
    add(o, seamBoxGeo(bw, bHs, bT, 5, [{ a: 'x', at: 0 }, { a: 'y', at: -bHs / 2 + bHs * 0.47 }], { dep: 0.55, sg: 0.9 }), F, 0, bHs / 2, bT / 2); };
  // 腰枕：布面長方形，立在坐面上靠著背墊
  const lumbar = (pw, x) => { const ph = 22, o = new THREE.Group(); o.position.set(x, seatTop - 0.6, zFace + 2.5); g.add(o);
    const q = add(o, softPillowGeo(pw, ph, 12), Pl, 0, ph / 2, 0); q.rotation.x = -0.26; q.position.z = Math.sin(0.26) * ph / 2 + 3; };
  for (let i = 0; i < n; i++) { const x = seatL + cw * (i + .5); backCush(cw - 0.8, x); lumbar(cw * 0.93, x); }
  const cbw = cwid - awR; backCush(cbw - 0.8, wingL + cbw / 2); lumbar(cbw * 0.93, wingL + cbw / 2);
  // 背墊後面固定的矮背
  RB(g, xR - awR - seatL, armTop - 3 - legH, 7, 2.5, (seatL + xR - awR) / 2, legH + (armTop - 3 - legH) / 2, zb + 3.6, F);
  // 主座：一整片坐面，直的車線在每個座位中間，橫的一條；線順著前緣往下，正面下方再一條橫線，底部往內收
  const mz0 = zb + 5, mz1 = zb + sd - 2, mD = mz1 - mz0, mW = inner - 0.3, zs = (zFace + 12 + mz1) / 2;
  const ms = [{ a: 'z', at: zs - (mz0 + mz1) / 2 }, { a: 'y', at: ySeam, f: side }];
  for (let i = 0; i < n; i++) ms.push({ a: 'x', at: -inner / 2 + cw * (i + .5) });
  add(g, seamBoxGeo(mW, bodyH, mD, 6.5, ms, { taper: { y: ySeam, amt: 2.6 } }), F, seatL + mW / 2, legH + bodyH / 2, (mz0 + mz1) / 2);
  // 貴妃：比主座長，中間一條直線，橫線和主座對齊，前段再一條
  const cD = d - 5, cz = zb + 5 + cD / 2, cs = [{ a: 'x', at: -awR * 0.3 }, { a: 'z', at: zs - cz }, { a: 'y', at: ySeam, f: side }];
  if (ext > 50) cs.push({ a: 'z', at: zb + sd + ext * 0.3 - cz });
  add(g, seamBoxGeo(cwid - 0.9, bodyH, cD, 6.5, cs, { taper: { y: ySeam, amt: 2.6 } }), F, wingL + 0.3 + (cwid - 0.9) / 2, legH + bodyH / 2, cz);
  // 扶手：左右兩邊一樣——整塊落到底（和座體一樣懸空），外側一條橫線、一條直線，正面一條直線；右邊那支包在貴妃的後段外側
  const aH = armTop - legH;
  for (const sx of [-1, 1]) add(g, seamBoxGeo(awL, aH, sd, 5.5, [{ a: 'y', at: -aH / 2 + aH * 0.54, f: nx => nx * sx > -0.5 ? 1 : 0 }, { a: 'z', at: -sd * 0.03, f: nx => nx * sx > -0.5 ? 1 : 0 }, { a: 'x', at: sx * awL * 0.08, f: (nx, ny, nz) => Math.max(0, nz) }], { taper: { y: -aH / 2 + aH * 0.3, amt: 1.6 } }), F, sx * (w / 2 - awL / 2), legH + aH / 2, zb + sd / 2);
  // 黑鐵翼型腳：貼地的長桿（中間厚、兩端薄，兩端有腳墊）＋中間兩支扁立柱撐住座體
  const sled = (x, z, L, alongZ) => {
    const o = new THREE.Group(); o.position.set(x, 0, z); if (alongZ) o.rotation.y = Math.PI / 2; g.add(o);
    const px = L * 0.2, sh = new THREE.Shape();
    sh.moveTo(-L / 2, 0.6); sh.lineTo(L / 2, 0.6); sh.lineTo(L / 2, 2.4); sh.lineTo(px + 4, 4.3); sh.lineTo(-px - 4, 4.3); sh.lineTo(-L / 2, 2.4); sh.lineTo(-L / 2, 0.6);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 }); geo.translate(0, 0, -1.2);
    add(o, geo, M, 0, 0, 0);
    for (const sx of [-1, 1]) { B(o, 5, legH - 3.8, 1.2, sx * px, 4 + (legH - 3.8) / 2, 0, M); C(o, 0.8, 0.8, 0.6, sx * (L / 2 - 4), 0.3, 0, M, 12); }
    B(o, px * 2 + 5, 1.2, 2.4, 0, legH - 1.6, 0, M);
  };
  const lz = zb + sd / 2 + 1, lL = sd * 0.63;
  sled(seatL + 8, lz, lL, true); sled(wingL - 8, lz, lL, true);
  if (inner > 230) sled((seatL + wingL) / 2, lz, lL, true);
  if (ext > 40) sled(xR - cwid / 2, d / 2 - Math.min(24, ext * 0.4), cwid * 0.66, false); else sled(xR - 12, lz, lL, true);
  return mirrorIfLeft(it, g);
}
// 120 型的合成皮外殼：正面看是一個 U 形——底下一條薄底框，兩端往上彎成薄薄的扶手（微微外張、頂端圓、前上角是圓的）；沿著前緣一條車線
// arms：'both' 兩邊都有扶手；'right' 只有右邊（腳椅）。回傳坐墊可以放的範圍
function shell120(g, w, d, legH, armTop, M, St, arms) {
  const t = 4.5, R = 11, a = 0.17, yc = legH + t / 2, yT = armTop - t / 2, L = (yT - (yc + R - R * Math.sin(a))) / Math.cos(a);
  const xc = w / 2 - t / 2 - R * Math.cos(a) - L * Math.sin(a), right = [], P = [];
  right.push([xc, yc]);
  for (let i = 1; i <= 10; i++) { const th = -Math.PI / 2 + (Math.PI / 2 - a) * i / 10; right.push([xc + R * Math.cos(th), yc + R + R * Math.sin(th)]); }
  for (let i = 1; i <= 12; i++) { const e = right[10]; right.push([e[0] + Math.sin(a) * L * i / 12, e[1] + Math.cos(a) * L * i / 12]); }
  if (arms === 'both') for (let i = right.length - 1; i >= 0; i--) P.push([-right[i][0], right[i][1]]); else P.push([-w / 2 + t / 2, yc]);
  P.push([0, yc], ...right);
  const n = P.length - 1, zb = -d / 2 + 0.5, zf = d / 2, rz = Math.min(13, armTop - legH - t), zF = y => { const q = Math.min(1, Math.max(0, (y - (armTop - rz)) / rz)); return zf - rz * (1 - Math.sqrt(1 - q * q)); };
  const ring = k => {                                                       // 一圈斷面：外側走一趟、扶手頂繞半圈、內側走回來、另一端再繞半圈
    const out = [], inn = [], hh = t / 2 * k, N = [];
    for (let i = 0; i <= n; i++) { const A = P[Math.max(0, i - 1)], B_ = P[Math.min(n, i + 1)], tx = B_[0] - A[0], ty = B_[1] - A[1], l = Math.hypot(tx, ty); N.push([ty / l, -tx / l, tx / l, ty / l]); }
    for (let i = 0; i <= n; i++) { out.push([P[i][0] + N[i][0] * hh, P[i][1] + N[i][1] * hh]); inn.push([P[i][0] - N[i][0] * hh, P[i][1] - N[i][1] * hh]); }
    const cap = (i, sgn) => [1, 2, 3].map(q => { const th = q * Math.PI / 4, c = Math.cos(th) * sgn, s_ = Math.sin(th) * sgn; return [P[i][0] + (N[i][0] * c + N[i][2] * s_) * hh, P[i][1] + (N[i][1] * c + N[i][3] * s_) * hh]; });
    return [...out, ...cap(n, 1), ...inn.reverse(), ...cap(0, -1)];
  };
  const rings = [[0, 1], [0.5, 1], [1, 1], [2, 0.86], [3, 0.5]], pos = [], idx = [];
  let K = 0;
  rings.forEach(([u, k]) => { const r = ring(k); K = r.length; r.forEach(([x, y]) => { const f = zF(y); pos.push(x, y, u <= 1 ? zb + (f - 1.6 - zb) * u : u === 2 ? f - 0.6 : f); }); });
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < K; k++) { const a0 = j * K + k, b0 = j * K + (k + 1) % K, c0 = (j + 1) * K + (k + 1) % K, d0 = (j + 1) * K + k; idx.push(a0, b0, c0, a0, c0, d0); }
  const capFace = (o, front) => { const tri = (x, y, z) => front ? idx.push(o + x, o + y, o + z) : idx.push(o + x, o + z, o + y), inI = i => (n + 1) + 3 + (n - i);
    for (let i = 0; i < n; i++) { tri(i, i + 1, inI(i + 1)); tri(i, inI(i + 1), inI(i)); }
    tri(n, n + 1, n + 2); tri(n, n + 2, n + 3); tri(n, n + 3, inI(n));
    const e = inI(0); tri(e, e + 1, e + 2); tri(e, e + 2, e + 3); tri(e, e + 3, 0); };
  capFace(0, false); capFace((rings.length - 1) * K, true);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  add(g, geo, M, 0, 0, 0);
  // 外殼邊緣的鋸齒車線：一條直線上面疊一條鋸齒，沿著正面的邊走一圈，再順著扶手頂往後走
  const zig = (at, len) => { const A = [], Bz = [], m = Math.max(2, Math.round(len / 0.85)); for (let i = 0; i <= m; i++) { const [q, nrm] = at(i / m); A.push(q); Bz.push(q.clone().addScaledVector(nrm, i % 2 ? 0.5 : -0.5)); }
    for (const [pp, r] of [[A, 0.09], [Bz, 0.11]]) add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pp, false, 'catmullrom', 0.05), pp.length * 2, r, 4, false), St, 0, 0, 0).castShadow = false; };
  const seg = [0]; for (let i = 1; i <= n; i++) seg.push(seg[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  zig(u => { const sAt = u * seg[n]; let i = 1; while (i < n && seg[i] < sAt) i++; const f = (sAt - seg[i - 1]) / (seg[i] - seg[i - 1] || 1), x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f, tx = P[i][0] - P[i - 1][0], ty = P[i][1] - P[i - 1][1], l = Math.hypot(tx, ty) || 1;
    return [new V3(x, y, zF(y) + 0.06), new V3(ty / l, -tx / l, 0)]; }, seg[n]);
  for (const i of arms === 'both' ? [0, n] : [n]) { const z1 = zF(armTop) - 1.5; zig(u => [new V3(P[i][0], armTop + 0.04, z1 + (zb + 2 - z1) * u), new V3(1, 0, 0)], z1 - zb - 2); }
  return { xc, t, edge: xc + 9, top: legH + t };
}
function legs120(g, pts, legH, M) {                                         // 亮面鑄造金屬腳：外側是直的斜邊，往下收細；頂端往沙發內側彎出一片托座接底框
  const pad = mat('#1c1c1c', 0.8), sh = new THREE.Shape(), H = legH - 0.4;
  sh.moveTo(-0.75, 0.5); sh.lineTo(-1.9, H); sh.lineTo(7.2, H); sh.lineTo(7.2, H - 0.7); sh.bezierCurveTo(3.4, H - 0.9, 1.9, H - 2.6, 1.5, H - 6.5); sh.lineTo(0.75, 0.5); sh.lineTo(-0.75, 0.5);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.55, bevelSize: 0.5, bevelSegments: 3, curveSegments: 12 }); geo.translate(0, 0, -0.65);
  for (const [x, z, sx] of pts) { add(g, geo, M, x, 0, z).scale.x = -sx; C(g, 0.55, 0.55, 0.5, x + sx * 0.0, 0.25, z, pad, 10); }
}
function cushion120(g, cw, ct, cd, x, y, z, F) { return add(g, seamBoxGeo(cw, ct, cd, 6.5, [{ a: 'y', at: ct / 2 - 3.6, f: (nx, ny) => 1 - Math.abs(ny) }], { dep: 0.3, sg: 0.5, taper: { y: -ct / 2 + ct * 0.55, amt: 3.2 } }), F, x, y + ct / 2, z); }
function build120Sofa(it) { // 120 型：合成皮 U 形外殼（底框＋薄扶手）托著布面厚坐墊，高背墊各一顆釦子，細金屬腳；兩顆合成皮小腰枕
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), Lt = surfMat('leather', it.color2), M = mat(it.color3 || '#55524f', 0.16, 0.95);
  const St = mat('#' + new THREE.Color(it.color2).lerp(new THREE.Color('#d8c8ad'), 0.55).getHexString(), 0.8);
  const legH = Math.min(15, h * 0.15), seatTop = Math.min(45, h * 0.44), armTop = Math.min(58, h * 0.57);
  const sh = shell120(g, w, d, legH, armTop, Lt, St, 'both'), n = seatsOf(it), inner = 2 * sh.edge, cw = inner / n, zb = -d / 2;
  // 合成皮矮背板（背墊靠著它）
  RB(g, inner + 6, armTop - legH - 2, 5, 2.2, 0, legH + (armTop - legH - 2) / 2 + 1, zb + 3, Lt);
  // 坐墊：前上緣一圈車線，下半段往內收、窩在外殼裡
  const ct = seatTop - sh.top + 1.5, cd = d - 9;
  for (let i = 0; i < n; i++) cushion120(g, cw - 0.5, ct, cd, -inner / 2 + cw * (i + .5), sh.top - 1.5, d / 2 - cd / 2 - 0.6, F);
  // 高背墊：往後靠，上緣圓圓的，中間一顆包釦
  const lean = 0.2, bT = 16, by0 = seatTop - 3, bH = (h - by0 - bT * Math.sin(lean)) / Math.cos(lean) + 1.6, bz = zb + 0.6 + bH * Math.sin(lean);
  for (let i = 0; i < n; i++) { const o = new THREE.Group(); o.position.set(-inner / 2 + cw * (i + .5), by0, bz); o.rotation.x = -lean; g.add(o);
    // 背墊：上窄下寬、上薄下厚，上面兩個角是大圓角；釦子的位置微微凹下去
    const bg = seamBoxGeo(cw - 1, bH, bT, 7.6, [], {}), BP = bg.attributes.position, A = (cw - 1) / 2, Rc = Math.min(13, A * 0.4);
    for (let q = 0; q < BP.count; q++) { let px = BP.getX(q), py = BP.getY(q), pz = BP.getZ(q); const t = py / bH + 0.5;
      const dx = Math.abs(px) - (A - Rc), dy = py - (bH / 2 - Rc); if (dx > 0 && dy > 0) { const r = Math.hypot(dx, dy); if (r > Rc) { px = Math.sign(px) * (A - Rc + dx / r * Rc); py = bH / 2 - Rc + dy / r * Rc; } }
      px *= 1 - 0.07 * t; pz = -bT / 2 + (pz + bT / 2) * (1 - 0.28 * t * t);
      if (pz > 0) { const rr = Math.hypot(px, py) / 9; pz -= 1.1 * Math.exp(-rr * rr); }
      BP.setXYZ(q, px, py, pz); }
    BP.needsUpdate = true; bg.computeBoundingBox(); bg.computeBoundingSphere();
    add(o, bg, F, 0, bH / 2, bT / 2);
    add(o, new THREE.SphereGeometry(1.5, 16, 10), F, 0, bH * 0.5, bT * 0.93 - 0.75).scale.z = 0.45; }
  // 模組接縫（最右邊一個座位是獨立一座）
  const zFace = bz + bT * Math.cos(lean), jx = n > 1 ? inner / 2 - cw : null;
  if (jx !== null) B(g, 0.5, 4.7, d - 2, jx, legH + 2.3, 0.4, mat('#2a2a2c', 0.8));
  // 合成皮小腰枕：放在座位交界的地方
  const px = n === 1 ? [] : n === 2 ? [0] : [-inner / 2 + cw, inner / 2 - cw];
  for (const x of px) { const o = new THREE.Group(); o.position.set(x, seatTop - 0.8, zFace + 3); g.add(o);
    const q = add(o, softPillowGeo(44, 27, 11), Lt, 0, 13.5, 0); q.rotation.x = -0.3; q.position.z = Math.sin(0.3) * 13.5 + 2;
    const q2 = add(o, softPillowGeo(43.6, 26.6, 10.6), F, 0, 13.5, 0); q2.rotation.x = -0.3; q2.position.z = q.position.z - 0.5; }
  // 金屬腳：每座模組的四個角
  const lz = d / 2 - 10, xe = sh.xc - 2, pts = [];
  for (const sz of [-1, 1]) { pts.push([-xe, sz * lz, -1, sz], [xe, sz * lz, 1, sz]); if (jx !== null) pts.push([jx - 5, sz * lz, 1, sz], [jx + 5, sz * lz, -1, sz]); }
  legs120(g, pts, legH, M);
  return g;
}
function build120Ottoman(it) { // 120 型腳椅：同一款外殼，只有一側有扶手（預設在右，選左時鏡射）
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), Lt = surfMat('leather', it.color2), M = mat(it.color3 || '#55524f', 0.16, 0.95);
  const St = mat('#' + new THREE.Color(it.color2).lerp(new THREE.Color('#d8c8ad'), 0.55).getHexString(), 0.8);
  const legH = Math.min(15, h * 0.26), seatTop = Math.min(45, h * 0.78), sh = shell120(g, w, d, legH, h, Lt, St, 'right');
  const x0 = -w / 2 + 0.6, x1 = sh.edge, ct = seatTop - sh.top + 1.5;
  cushion120(g, x1 - x0, ct, d - 1.5, (x0 + x1) / 2, sh.top - 1.5, 0, F);
  const lz = d / 2 - 10, pts = [];
  for (const sz of [-1, 1]) pts.push([-w / 2 + 8, sz * lz, -1, sz], [sh.xc - 2, sz * lz, 1, sz]);
  legs120(g, pts, legH, M);
  return mirrorIfLeft(it, g);
}
function buildAthenaSofa(it) { // 雅典娜：全牛皮 L 型——厚厚一整片的座台（直條車線、後段一排拉點），座台比坐深還深，背後留一段平台；矮背靠塊＋斜靠的大背墊；
  // 轉角那一座的後外角是圓弧；單側矮扶手包著一條實木；亮面金屬刀腳。預設轉角＋貴妃在右，選左時鏡射
  const g = new THREE.Group(), { w, d, h } = it;
  const F = surfMat(it.fabric || 'leather', it.color), Wd = surfMat('wood', it.color2 || '#7a4a2b'), M = mat(it.color3 || '#4d4a48', 0.16, 0.95);
  const legH = Math.min(15, h * 0.17), seatTop = Math.min(40, h * 0.46), pH = seatTop - legH;
  const D = Math.min(110, d), Ww = Math.min(110, w * 0.28), aw = Math.min(8.5, w * 0.022), xL = -w / 2, xR = w / 2, zb = -d / 2, wingL = xR - Ww;
  const xs = xL + aw + 0.4, n = seatsOf(it), inner = wingL - xs, cw = inner / n, top = (nx, ny) => Math.max(0, ny), zT = zb + 64;   // xs：座台從扶手和實木條的內側開始
  const body = (x0, x1, z0, z1, seams, rc) => { const bw = x1 - x0 - 0.5, bd = z1 - z0 - 0.5, geo = seamBoxGeo(bw, pH, bd, 6.5, seams, { dep: 0.4, sg: 0.7, taper: { y: -pH / 2 + pH * 0.35, amt: 2 } });
    if (rc) { const P = geo.attributes.position, A = bw / 2, C = bd / 2; for (let i = 0; i < P.count; i++) { const dx = P.getX(i) - (A - rc), dz = (-C + rc) - P.getZ(i); if (dx > 0 && dz > 0) { const r = Math.hypot(dx, dz); if (r > rc) { P.setX(i, A - rc + dx / r * rc); P.setZ(i, -C + rc - dz / r * rc); } } } P.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere(); }
    add(g, geo, F, (x0 + x1) / 2, legH + pH / 2, (z0 + z1) / 2); };
  // 背靠塊（固定、矮矮一塊）和斜靠在上面的大背墊（邊緣一圈車線）
  const bz0 = zb + 16, bz1 = zb + 34, bkH = Math.min(24, (h - seatTop) * 0.5), lean = 0.3, cT = 22, cH = (h - seatTop + 1 - cT * 0.7 * Math.sin(lean)) / Math.cos(lean) + 0.7;
  const block = (x0, x1, z0, z1, alongZ) => { const bw = x1 - x0, bd = z1 - z0, L = alongZ ? bd : bw, k = Math.max(1, Math.round(L / 32)), sm = [];
    for (let i = 1; i < k; i++) sm.push({ a: alongZ ? 'z' : 'x', at: -L / 2 + L * i / k });
    add(g, seamBoxGeo(bw, bkH + 1, bd, 3, sm, { dep: 0.3, sg: 0.6 }), F, (x0 + x1) / 2, seatTop - 1 + (bkH + 1) / 2, (z0 + z1) / 2); };
  const cushion = (bw, x, z, ry) => { const o = new THREE.Group(); o.position.set(x, seatTop - 1, z); o.rotation.y = ry || 0; g.add(o);
    // 大背墊：像一顆飽滿的枕頭——邊緣一圈凸起的滾邊、上面兩個角微微翹起，上薄下厚
    const cg = seamBoxGeo(bw, cH, cT, 8.5, [{ a: 'z', at: 0 }], { dep: -0.7, sg: 0.55 }), CP = cg.attributes.position, A = bw / 2, Bh = cH / 2;
    for (let i = 0; i < CP.count; i++) { let px = CP.getX(i), py = CP.getY(i), pz = CP.getZ(i); const t = py / cH + 0.5, u = Math.abs(px) / A;
      pz *= (1 - 0.3 * t * t) * (1 - 0.16 * u * u * u * u);                // 上緣、左右兩側比較薄，中間鼓
      const e = Math.max(0, u - 0.86) / 0.14 * Math.max(0, t - 0.86) / 0.14; if (e > 0) { px += Math.sign(px) * 1.6 * e; py += 2.2 * e; }   // 上面兩個角的小耳朵
      CP.setXYZ(i, px, py, pz); }
    CP.needsUpdate = true; cg.computeBoundingBox(); cg.computeBoundingSphere();
    const q = add(o, cg, F, 0, cH / 2, cT / 2); const pv = new THREE.Group(); pv.rotation.x = -lean; o.add(pv); pv.add(q); };
  // 主座：靠扶手那一座是 n−1 人、靠轉角那一座是 1 人；每個座位三條直線，後段一條橫的拉點線
  const mods = n > 1 ? [[xs, wingL - cw], [wingL - cw, wingL]] : [[xs, wingL]];
  for (const [x0, x1] of mods) { const k = Math.round((x1 - x0) / cw) * 3, sm = [{ a: 'z', at: zT - (zb + D / 2), f: top }];
    for (let i = 1; i < k; i++) sm.push({ a: 'x', at: -(x1 - x0) / 2 + (x1 - x0) * i / k });
    body(x0, x1, zb, zb + D, sm); block(x0 + 2, x1 - 2, bz0, bz1); }
  for (let i = 0; i < n; i++) cushion(cw - 3, xs + cw * (i + .5), bz1 + 4);
  // 轉角：後外角是大圓弧，背靠塊和背墊短一點、避開圓角
  // 轉角那一座：扇形（四分之一圓）——尖端在 L 的內角，外緣是一道圓弧；由中間一條放射狀的縫分成兩片。背靠塊和背墊斜放 45°，面向內角
  const vx = wingL, vz = zb + D, gp = 0.5, bv = 2.6, ux = Math.SQRT1_2, uz = -Math.SQRT1_2;       // (vx, vz)：內角；(ux, uz)：由內角指向圓弧中點的方向
  for (const [a0, a1] of [[0, Math.PI / 4 - 0.004], [Math.PI / 4 + 0.004, Math.PI / 2]]) {
    const sh = new THREE.Shape(), am = (a0 + a1) / 2, ox = Math.cos(am) * (bv + gp) * 1.6, oy = Math.sin(am) * (bv + gp) * 1.6;
    sh.moveTo(ox, oy); sh.absellipse(0, 0, Ww - bv - gp, D - bv - gp, a0 + 0.03, a1 - 0.03, false, 0); sh.lineTo(ox, oy);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: pH - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 4, curveSegments: 14 });
    const m = add(g, geo, F, vx, legH + bv, vz); m.rotation.x = -Math.PI / 2;
  }
  const rp = Math.min(Ww, D) * 0.6, cwd = Math.min(74, Math.min(Ww, D) * 0.68);          // 背墊後緣離內角的距離、背墊寬度
  { const o = new THREE.Group(); o.position.set(vx + ux * (rp + 11), 0, vz + uz * (rp + 11)); o.rotation.y = -Math.PI / 4; g.add(o);
    const k = 4, sm = []; for (let i = 1; i < k; i++) sm.push({ a: 'x', at: -cwd / 2 + cwd * i / k });
    add(o, seamBoxGeo(cwd, bkH + 1, 17, 3, sm, { dep: 0.3, sg: 0.6 }), F, 0, seatTop - 1 + (bkH + 1) / 2, 0); }
  cushion(cwd + 4, vx + ux * (rp + 1), vz + uz * (rp + 1), -Math.PI / 4);
  // 貴妃：長長一片往前伸，車線是橫的；外側一塊背靠和背墊（只到一半），前段沒有靠背
  const ext = d - D;
  if (ext > 30) { const k = Math.max(1, Math.round(ext / 30)), sm = [{ a: 'x', at: Ww / 2 - 60, f: top }]; for (let i = 1; i < k; i++) sm.push({ a: 'z', at: -ext / 2 + ext * i / k });
    body(wingL, xR, zb + D, d / 2, sm);
    const Lc = Math.min(100, ext * 0.62); if (Lc > 40) { block(xR - 34, xR - 16, zb + D + 3, zb + D + 3 + Lc, true); cushion(Lc - 3, xR - 38, zb + D + 3 + Lc / 2, -Math.PI / 2); } }
  // 扶手：中間是一片實木立板，皮革從上面包下來——外側一片垂到座台底、內側一片只到坐面，上緣是圓的；前後端看得到夾在中間的實木
  const aTop = Math.min(seatTop + 17, h - 10), aH = aTop - legH - 2, wT = 2.4, pT = (aw - wT) / 2, ax = xL + aw / 2, az = zb + D / 2;
  RB(g, wT, aH - 5, D - 1, 0.9, ax, legH + 2 + (aH - 5) / 2, az, Wd);
  const sideSeam = sx => [{ a: 'z', at: -D * 0.17, f: nx => nx * sx > 0.3 ? 1 : 0 }, { a: 'z', at: D * 0.17, f: nx => nx * sx > 0.3 ? 1 : 0 }];
  add(g, seamBoxGeo(pT + 0.4, aH, D - 5, 1.5, sideSeam(-1), { dep: 0.3, sg: 0.6 }), F, xL + (pT + 0.4) / 2, legH + 2 + aH / 2, az - 0.5);   // 外側：薄薄一片垂到座台底
  RB(g, pT + 0.4, aH, D - 5, 1.5, xL + aw - (pT + 0.4) / 2, legH + 2 + aH / 2, az - 0.5, F);   // 內側（靠坐墊那一面）：皮革一樣整片包到底，看不到木頭；木頭只在正面和背面的斷面露出來
  RB(g, aw + 0.5, 6, D - 6, 2.9, ax, aTop - 2.9, az - 0.8, F);
  // 抱枕（布面）：轉角兩顆、扶手這端兩顆
  const PL = [surfMat('fabric', '#c9c8c4'), surfMat('fabric', '#8791a6')], pz = bz1 + 4 + cT + 6;
  const pil = (x, z, m, rz, ry) => { const o = new THREE.Group(); o.position.set(x, seatTop - 0.6, z); o.rotation.y = ry; g.add(o); const q = add(o, softPillowGeo(45, 45, 13), m, 0, 22.5, 0); q.rotation.x = -0.34; q.rotation.z = rz; q.position.z = Math.sin(0.34) * 22.5; };
  pil(xL + aw + 28, pz, PL[1], 0.05, 0.3); pil(xL + aw + 60, pz, PL[0], -0.04, 0.12);
  const pr = rp - cT - 5; for (const [sd, m, rz] of [[-1, PL[1], 0.05], [1, PL[0], -0.04]]) pil(vx + ux * pr + sd * uz * 17, vz + uz * pr - sd * ux * 17, m, rz, -Math.PI / 4 + sd * 0.15);
  // 金屬刀腳：每一座的四個角
  const pts = [], quad = (x0, x1, z0, z1, cut) => { for (const [x, sx] of [[x0 + 8, -1], [x1 - 8, 1]]) for (const [z, sz] of [[z0 + 9, -1], [z1 - 9, 1]]) pts.push([x, z, sx, sz]); };
  for (const [x0, x1] of mods) quad(x0, x1, zb, zb + D);
  pts.push([vx + 9, vz - 9, -1, 1], [vx + 9, zb + 12, -1, -1], [xR - 12, vz - 9, 1, 1], [vx + ux * (Math.min(Ww, D) - 14), vz + uz * (Math.min(Ww, D) - 14), 1, -1]);   // 轉角：內角、圓弧兩端、圓弧中點
  if (ext > 30) quad(wingL, xR, zb + D, d / 2);
  legs120(g, pts, legH, M);
  return mirrorIfLeft(it, g);
}
function buildFloatLSofa(it) { // 懸浮平台 L 型：雙色平台底座＋黑鐵雪橇腳（兩端鍍鉻）＋彎曲木ㄈ型邊几（玻璃立板）＋車線坐墊、大背墊、長腰枕
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), Bs = fabMat(it, 'color2'), Wd = surfMat('wood', it.color3 || '#d9bd94'), Mt = mat('#232325', 0.45, 0.6), Cr = mat('#d9dbde', 0.15, 0.95);
  const legH = 11, pT = 11, pTop = legH + pT, cushT = 19, seatTop = pTop + cushT, bt = 14;
  const sd = Math.min(100, d * 0.6), cwid = Math.min(105, w * 0.33), shelfW = Math.min(42, w * 0.13);
  const mainL = -w / 2, mainR = w / 2 - cwid - 2;
  // 平台底座（邊角圓潤）
  RB(g, mainR - mainL, pT, sd, 3.6, (mainL + mainR) / 2, legH + pT / 2, -d / 2 + sd / 2, Bs);
  RB(g, cwid, pT, d, 3.6, w / 2 - cwid / 2, legH + pT / 2, 0, Bs);
  // 黑鐵雪橇腳：兩支扁立柱＋貼地的扁鐵，扁鐵兩端各一塊鍍鉻腳墊
  const sled = (x, z, len, alongZ) => { const o = new THREE.Group(); o.position.set(x, 0, z); if (alongZ) o.rotation.y = Math.PI / 2; g.add(o);
    B(o, len + 12, 1, 4.2, 0, 1.3, 0, Mt);
    for (const s of [-1, 1]) { B(o, 4.2, legH - 1.6, 1.4, s * len / 2, 1.8 + (legH - 1.6) / 2, 0, Mt); RB(o, 6, 1.6, 4.6, 0.5, s * (len / 2 + 7.5), 0.8, 0, Cr); } };
  const sl = sd - 40;
  sled(mainL + shelfW + 30, -d / 2 + sd / 2, sl, true);
  sled(mainR - 25, -d / 2 + sd / 2, sl, true);
  sled(w / 2 - cwid / 2, d / 2 - 22, cwid - 40, false);
  // 彎曲木ㄈ型邊几（主座外端）：底板貼在平台上、靠坐墊那一面是立板、上面是檯面，轉角是彎的；裡面一片玻璃立板（正面＋外側）
  const sz = -d / 2 + sd / 2, shH = Math.min(60, h * 0.68), wt = 2, br = 3.2, x0 = mainL + 1, x1 = mainL + shelfW, yb = pTop, zF = -d / 2 + sd - 0.5, zB = -d / 2 + 0.5;
  { const sh = new THREE.Shape(), xi = x1 - wt;
    sh.moveTo(x0, yb); sh.lineTo(x1 - br, yb); sh.quadraticCurveTo(x1, yb, x1, yb + br); sh.lineTo(x1, shH - br); sh.quadraticCurveTo(x1, shH, x1 - br, shH); sh.lineTo(x0, shH);
    sh.lineTo(x0, shH - wt); sh.lineTo(xi - br * 0.4, shH - wt); sh.quadraticCurveTo(xi, shH - wt, xi, shH - wt - br * 0.4); sh.lineTo(xi, yb + wt + br * 0.4); sh.quadraticCurveTo(xi, yb + wt, xi - br * 0.4, yb + wt); sh.lineTo(x0, yb + wt); sh.lineTo(x0, yb);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: zF - zB, bevelEnabled: false, curveSegments: 10 }), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 60, uv.getY(i) / 60);
    add(g, geo, Wd, 0, 0, zB); }
  const gx = x0 + Math.min(10, shelfW * 0.25), gz = zF - 9, gh = shH - yb - 2 * wt;
  glassPane(g, x1 - wt - gx, gh, 0.8, (gx + x1 - wt) / 2, yb + wt + gh / 2, gz);
  glassPane(g, 0.8, gh, gz - zB - 8, gx, yb + wt + gh / 2, (gz + zB + 8) / 2);
  // 矮背框（底座布料），背墊靠在前面
  const seatL = mainL + shelfW + 1, inner = mainR - seatL, n = seatsOf(it), cw = inner / n, fbH = Math.min(h - 16, seatTop + 30) - pTop;
  RB(g, w / 2 - seatL, fbH, 8, 3, (seatL + w / 2) / 2, pTop + fbH / 2, -d / 2 + 4, Bs);
  // 坐墊（上下緣各一圈車線，前緣比平台多出一點）、背墊（正面一圈內縮的車線）、長腰枕
  const seat = (cw_, dep, x, z) => add(g, seamBoxGeo(cw_, cushT, dep, 5.5, [{ a: 'y', at: cushT / 2 - 3.2, f: (nx, ny) => 1 - Math.abs(ny) }, { a: 'y', at: -cushT / 2 + 3.2, f: (nx, ny) => 1 - Math.abs(ny) }], { dep: 0.35, sg: 0.55 }), F, x, pTop + cushT / 2, z);
  const backH = Math.min(50, h - seatTop + 2), bT = 16;
  const back = (bw, x) => { const o = new THREE.Group(); o.position.set(x, h - backH * Math.cos(0.1) - bT * Math.sin(0.1), -d / 2 + 8.5); o.rotation.x = -0.1; g.add(o);
    const q = Math.min(4.5, bw * 0.08); add(o, seamBoxGeo(bw, backH, bT, 6, [{ a: 'x', at: -bw / 2 + q, f: (nx, ny, nz) => Math.max(0, nz) }, { a: 'x', at: bw / 2 - q, f: (nx, ny, nz) => Math.max(0, nz) }, { a: 'y', at: backH / 2 - q, f: (nx, ny, nz) => Math.max(0, nz) }], { dep: 0.3, sg: 0.5 }), F, 0, backH / 2, bT / 2); };
  const lumbar = (lw, x) => { const m = RB(g, lw, 21, 15, 7.4, x, seatTop + 10.5, -d / 2 + 8.5 + bT + 6.5, F); m.rotation.x = -0.22; m.userData.pil = 1; };
  for (let i = 0; i < n; i++) { const x = seatL + cw * (i + .5); seat(cw - 1.2, sd - bt + 1, x, -d / 2 + bt + (sd - bt + 1) / 2); back(cw - 2, x); lumbar(cw - 5, x); }
  // 貴妃
  const cx = w / 2 - cwid / 2, aw = 16;
  seat(cwid - 1.2, d - bt, cx, -d / 2 + bt + (d - bt) / 2);
  back(cwid - aw - 2, cx - aw / 2); lumbar(cwid - aw - 5, cx - aw / 2);
  const armH = seatTop + 20, al = sd * 0.85;
  RB(g, aw, armH - pTop, al, 4, w / 2 - aw / 2, pTop + (armH - pTop) / 2, -d / 2 + al / 2, F);
  return mirrorIfLeft(it, g);
}

/* ---------- 桌類共用：桌面形狀、腳座、腳材質 ---------- */
const SHAPES = [opt('rect', '方形'), opt('round', '圓形'), opt('oval', '橢圓形')];
const BASES = { legs: '四腳', sled: '雪橇腳', x: '交叉腳', panel: '板腳', pedestal: '單柱底座', tulip: '喇叭底座', cross: '十字腳', drum: '實心底座' };
const baseList = ids => ids.map(id => opt(id, BASES[id]));
const LEGMATS = [opt('wood', '木頭'), opt('metal', '鐵件')];
const legMat = it => surfMat(it.legmat === 'metal' ? 'metal' : 'wood', it.color2);
function tableTop(g, shape, w, d, t, y, m) {
  if (shape === 'oval') return roundedTop(g, w, d, t, y - t / 2, m, Math.min(w, d) / 2 - 0.01); // 橢圓形＝長圓形（兩端半圓）
  if (shape === 'round') { const c = C(g, .5, .5, t, 0, y, 0, m, 64); c.scale.set(w, 1, d); return c; }
  return RB(g, w, t, d, Math.min(1.5, t / 2), 0, y, 0, m);
}
function tableBase(g, base, shape, w, d, lh, M, metal) { // 腳座由地面長到 lh（桌面下緣）
  const rnd = shape !== 'rect', th = metal ? 2.5 : 5;
  if (base === 'sled') {
    const x = rnd ? w * 0.3 : w / 2 - 10, zl = rnd ? d * 0.6 : d - 16;
    for (const s of [-1, 1]) {
      for (const zs of [-1, 1]) B(g, th, lh, th, s * x, lh / 2, zs * (zl / 2 - th / 2), M);
      B(g, th, th, zl, s * x, th / 2, 0, M);
      B(g, th, th, zl, s * x, lh - th / 2, 0, M);
    }
  } else if (base === 'x') {
    const x = rnd ? w * 0.3 : w / 2 - 10, span = (rnd ? d * 0.62 : d - 14) - th, L = Math.hypot(lh, span), a = Math.atan2(lh, span);
    for (const s of [-1, 1]) for (const r of [-1, 1]) { const m = B(g, th, th, L, s * x, lh / 2, 0, M); m.rotation.x = r * a; }
    B(g, 2 * x, th, th, 0, lh - th / 2, 0, M);
  } else if (base === 'panel') {
    const pt = metal ? 1.5 : 4, x = (rnd ? w * 0.3 : w / 2 - pt / 2 - 1), pd = rnd ? d * 0.55 : d - 4;
    for (const s of [-1, 1]) B(g, pt, lh, pd, s * x, lh / 2, 0, M);
  } else if (base === 'pedestal') {
    if (w > 1.6 * d) {
      for (const s of [-1, 1]) { C(g, th * 1.2, th * 1.2, lh, s * w * 0.28, lh / 2, 0, M, 20); B(g, 8, 2.5, d * 0.6, s * w * 0.28, 1.25, 0, M); }
      B(g, w * 0.56, 4, 5, 0, lh - 6, 0, M);
    } else {
      C(g, th * 1.3, th * 1.3, lh, 0, lh / 2, 0, M, 20);
      if (rnd) C(g, .5, .5, 2.5, 0, 1.25, 0, M, 40).scale.set(w * 0.5, 1, d * 0.5);
      else B(g, w * 0.5, 2.5, d * 0.5, 0, 1.25, 0, M);
    }
  } else if (base === 'tulip') {
    const r = Math.min(w, d) * 0.28;
    C(g, th * 0.9, r, lh * 0.9, 0, lh * 0.45, 0, M, 40);
    C(g, th * 1.2, th * 0.9, lh * 0.12, 0, lh * 0.94, 0, M, 20);
  } else if (base === 'cross') {
    const L = Math.min(w, d) * 0.62;
    C(g, th * 1.1, th * 1.1, lh, 0, lh / 2, 0, M, 20);
    B(g, L, 3, 6, 0, 1.5, 0, M); B(g, 6, 3, L, 0, 1.5, 0, M);
  } else if (base === 'drum') {
    if (rnd) C(g, .5, .5, lh, 0, lh / 2, 0, M, 48).scale.set(w * 0.62, 1, d * 0.62);
    else B(g, w * 0.7, lh, d * 0.7, 0, lh / 2, 0, M);
  } else {
    const pts = rnd ? [[.33, .33], [-.33, .33], [.33, -.33], [-.33, -.33]].map(([a, b]) => [a * w, b * d])
      : [[w / 2 - 6, d / 2 - 6], [-(w / 2 - 6), d / 2 - 6], [w / 2 - 6, -(d / 2 - 6)], [-(w / 2 - 6), -(d / 2 - 6)]];
    for (const [x, z] of pts) metal ? C(g, 1.2, 1.2, lh, x, lh / 2, z, M, 10) : B(g, th, lh, th, x, lh / 2, z, M);
  }
}
const COFFEE_OPTS = [
  { key: 'shape', label: '桌面形狀', list: SHAPES },
  { key: 'base', label: '腳座', list: baseList(['legs', 'sled', 'x', 'panel', 'pedestal', 'drum']) },
  { key: 'legmat', label: '腳材質', list: LEGMATS },
];
function buildCoffee(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const t = Math.min(4, h * 0.1), shape = it.shape || 'rect';
  tableTop(g, shape, w, d, t, h - t / 2, topMat(it));
  tableBase(g, it.base || 'legs', shape, w, d, h - t, legMat(it), it.legmat === 'metal');
  return g;
}
function buildCoffeeSet(it) { // 組合茶几：一大一小、高低錯落
  const g = new THREE.Group(), { w, d, h } = it;
  const bw = w * 0.64, sw = w * 0.46, sd = d * 0.72;
  const a = buildCoffee({ ...it, w: bw, d, h }), b = buildCoffee({ ...it, w: sw, d: sd, h: h * 0.8 });
  a.position.set(-w / 2 + bw / 2, 0, 0); b.position.set(w / 2 - sw / 2, 0, d / 2 - sd / 2);
  g.add(a, b);
  return g;
}
const DINING_OPTS = [
  { key: 'shape', label: '桌面形狀', list: [opt('rect', '長方形'), opt('oval', '橢圓形')] },
  { key: 'base', label: '腳座', list: baseList(['legs', 'sled', 'x', 'panel', 'pedestal']) },
  { key: 'legmat', label: '腳材質', list: LEGMATS },
];
function buildDining(it) {
  const g = new THREE.Group(), { w, d, h } = it, t = 4;
  const base = it.base || (it.style === 'frame' ? 'sled' : 'legs');
  const metal = it.legmat ? it.legmat === 'metal' : it.style === 'frame';
  const shape = it.shape || 'rect', M = metal ? mat(it.color2, 0.32, 0.75) : mat(it.color2, 0.55);
  tableTop(g, shape, w, d, t, h - t / 2, topMat(it));
  if (base === 'legs' && shape === 'rect' && !metal) {
    legs4(g, w, d, h - t, 7, 6, M, false);
    for (const s of [-1, 1]) { B(g, w - 14, 8, 2, 0, h - t - 4, s * (d / 2 - 7), M); B(g, 2, 8, d - 14, s * (w / 2 - 7), h - t - 4, 0, M); }
  } else tableBase(g, base, shape, w, d, h - t, M, metal);
  return g;
}
const ROUND_OPTS = [
  { key: 'top', label: '桌面', list: [opt('single', '單桌面'), opt('inset', '內崁式桌面', { c3: '內崁面顏色' }), opt('lazy', '附轉盤', { c3: '轉盤顏色' })] },
  { key: 'base', label: '腳座', list: baseList(['pedestal', 'tulip', 'cross', 'legs']) },
  { key: 'legmat', label: '腳材質', list: LEGMATS },
];
function buildRound(it) {
  const g = new THREE.Group(), { w, d, h } = it, t = 4, top = it.top || 'single', M = legMat(it);
  const C3 = mat(it.color3 || '#e3ddd3', 0.25);
  tableTop(g, 'round', w, d, t, h - t / 2, topMat(it));
  if (top === 'inset') {
    C(g, .5, .5, t + 0.3, 0, h - t / 2, 0, mat('#3a3430', 0.6), 64).scale.set(w * 0.72, 1, d * 0.72);
    C(g, .5, .5, t + 0.5, 0, h - t / 2, 0, C3, 64).scale.set(w * 0.7, 1, d * 0.7);
  } else if (top === 'lazy') {
    C(g, 6, 6, 1.5, 0, h + 0.75, 0, M, 20);
    C(g, .5, .5, 1.5, 0, h + 2.25, 0, C3, 64).scale.set(w * 0.55, 1, d * 0.55);
  }
  tableBase(g, it.base || 'pedestal', 'round', w, d, h - t, M, it.legmat === 'metal');
  return g;
}

/* ---------- 餐椅 ---------- */
const CHAIR_OPTS = [{ key: 'style', label: '款式', list: [opt('wood', '實木椅'), opt('soft', '布面軟包'), opt('metal', '鐵件椅'), opt('arm', '扶手餐椅')] }];
function buildChair(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'wood';
  const S = fabMat(it), L = legMat(it);
  const seatH = Math.min(46, h * 0.55);
  if (style === 'soft' || style === 'arm') {
    const t = 9;
    RB(g, w, t, d, 3.5, 0, seatH - t / 2, 0, S);
    legs4(g, w, d, seatH - t, 4, 3, L, true);
    RB(g, w - 2, h - seatH + 2, 7, 3.2, 0, seatH + (h - seatH + 2) / 2 - 1, -d / 2 + 3.5, S);
    if (style === 'arm') for (const s of [-1, 1]) RB(g, 5, 22, d - 8, 2.4, s * (w / 2 - 2.5), seatH + 11 - 2, 2, S);
    return g;
  }
  if (style === 'metal') {
    const M = mat(it.color2, 0.3, 0.75);
    for (const x of [-w / 2 + 3, w / 2 - 3]) for (const z of [-d / 2 + 3, d / 2 - 3]) rod(g, new V3(x * 0.85, seatH - 3, z * 0.85), new V3(x, 0, z), 1, M);
    RB(g, w, 3, d, 1.2, 0, seatH - 1.5, 0, S);
    for (const s of [-1, 1]) rod(g, new V3(s * (w / 2 - 6), seatH, -d / 2 + 3), new V3(s * (w / 2 - 6), h - 10, -d / 2 - 1), 0.8, M);
    const bk = RB(g, w - 2, Math.min(24, (h - seatH) * 0.55), 2.5, 1.2, 0, h - Math.min(24, (h - seatH) * 0.55) / 2, -d / 2 - 1, S);
    bk.rotation.x = -0.12;
    return g;
  }
  const t = 5;
  RB(g, w, t, d, 2, 0, seatH - t / 2, 0, S);
  legs4(g, w, d, seatH - t, 3, 3.5, L, false);
  for (const s of [-1, 1]) B(g, 3.5, h - seatH + t, 3.5, s * (w / 2 - 3), seatH - t + (h - seatH + t) / 2, -d / 2 + 3, L);
  const ph = Math.min(30, (h - seatH) * 0.6);
  RB(g, w - 4, ph, 3, 1.2, 0, h - ph / 2 - 2, -d / 2 + 3, S);
  return g;
}

/* ---------- 吧檯桌、吧檯椅 ---------- */
const BAR_BASES = { key: 'base', label: '腳座', list: baseList(['legs', 'sled', 'panel']) };
const BARROUND_BASES = { key: 'base', label: '腳座', list: baseList(['pedestal', 'tulip', 'cross']) };
const BAR_LEGMAT = { key: 'legmat', label: '腳材質', list: [opt('metal', '鐵件'), opt('wood', '木頭')] };
function buildBarTable(it, kind) {
  const g = new THREE.Group(), { w, d, h } = it, t = 4, metal = it.legmat !== 'wood', M = metal ? mat(it.color2, 0.32, 0.75) : mat(it.color2, 0.55);
  const fy = Math.min(28, h * 0.27), fr = metal ? 2.2 : 3.5;                 // 踏腳桿的高度、粗細
  if (kind === 'island') {                                                    // 中島吧檯：櫃體＋往座位那一側伸出去的檯面
    const Bd = bodyMat(it), Tp = surfMat(it.topmat || 'slate', it.color3 || it.color), Dk = mat('#2b2a2a', 0.7), St = mat('#8a8d91', 0.3, 0.8);
    const over = Math.min(28, d * 0.38), bd = d - over - 1.5, bz = -d / 2 + 1.5 + bd / 2, kick = 8, bh = h - t - kick;
    B(g, w - 4, kick, bd - 6, 0, kick / 2, bz - 1, Dk);
    B(g, w, bh, bd, 0, kick + bh / 2, bz, Bd);
    const nd = Math.max(2, Math.round(w / 45)), dw = w / nd;                  // 工作那一側的門片
    for (let i = 1; i < nd; i++) B(g, 0.4, bh - 1, 0.3, -w / 2 + dw * i, kick + bh / 2, -d / 2 + 1.45, Dk);
    for (let i = 0; i < nd; i++) B(g, 1.2, 12, 1.2, -w / 2 + dw * (i + (i % 2 ? 0.14 : 0.86)), kick + bh - 12, -d / 2 + 0.9, St);
    RB(g, w, t, d, 1, 0, h - t / 2, 0, Tp);
    const rz = -d / 2 + 1.5 + bd + 5;                                               // 座位這一側的踏腳桿
    C(g, 1.3, 1.3, w - 16, 0, 20, rz, St, 14).rotation.z = Math.PI / 2;
    for (const sx of [-1, 0, 1]) B(g, 1.6, 1.6, 5, sx * (w / 2 - 14), 20, rz - 2.5, St);
    return g;
  }
  if (kind === 'wall') {                                                      // 靠牆吧檯：固定在牆上的檯面＋三角支架
    tableTop(g, 'rect', w, d, t, h - t / 2, topMat(it));
    B(g, w - 4, 7, 1.8, 0, h - t - 3.5, -d / 2 + 0.9, M);
    const bl = Math.min(30, h * 0.3);
    for (const sx of [-1, 1]) { const x = sx * (w / 2 - Math.min(18, w * 0.15));
      B(g, 2.4, bl, 2.4, x, h - t - bl / 2, -d / 2 + 1.2, M); B(g, 2.4, 2.4, d - 6, x, h - t - 1.2, -1, M);
      rod(g, new V3(x, h - t - bl + 1.5, -d / 2 + 1.5), new V3(x, h - t - 2, d / 2 - 6), 1, M); }
    return g;
  }
  if (kind === 'round') {                                                     // 圓形高腳桌
    const base = it.base || 'pedestal';
    tableTop(g, 'round', w, d, t, h - t / 2, topMat(it));
    tableBase(g, base, 'round', w, d, h - t, M, metal);
    if (base !== 'tulip') { const r = Math.min(w, d) * 0.3;
      add(g, new THREE.TorusGeometry(r, 1.1, 10, 44), M, 0, fy, 0).rotation.x = Math.PI / 2;
      B(g, 2 * r, 1.5, 1.5, 0, fy, 0, M); B(g, 1.5, 1.5, 2 * r, 0, fy, 0, M); }
    return g;
  }
  const base = it.base || 'legs';                                             // 長型吧檯桌
  tableTop(g, 'rect', w, d, t, h - t / 2, topMat(it));
  tableBase(g, base, 'rect', w, d, h - t, M, metal);
  if (base === 'legs') { for (const sz of [-1, 1]) B(g, w - 12, fr, fr, 0, fy, sz * (d / 2 - 6), M); for (const sx of [-1, 1]) B(g, fr, fr, d - 12, sx * (w / 2 - 6), fy + 12, 0, M); }
  else if (base === 'sled') for (const sz of [-1, 1]) B(g, w - 20, fr, fr, 0, fy, sz * ((d - 16) / 2 - (metal ? 1.25 : 2.5)), M);
  else B(g, w - 4, fr + 1, fr, 0, fy, 0, M);
  return g;
}
function buildBarStool(it, style) {
  const g = new THREE.Group(), { w, d, h } = it, S = fabMat(it), metal = it.legmat !== 'wood';
  const L = metal ? mat(it.color2, 0.3, 0.75) : mat(it.color2, 0.55), lr = metal ? 1.1 : 1.7;
  const seatH = style === 'round' ? h : Math.min(76, h * 0.76), fy = Math.max(18, seatH - 45);
  // 四支外張的腳＋一圈踏腳：top／bot 是腳在坐面下和地面的位置（相對寬深的比例）
  const splay = (top, bot, yTop, ring) => {
    const at = y => { const k = (yTop - y) / yTop, f = top + (bot - top) * k; return [w * f, d * f]; };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(g, new V3(sx * w * top, yTop, sz * d * top), new V3(sx * w * bot, 0, sz * d * bot), lr, L);
    const [fx, fz] = at(fy);
    if (ring) { const m = add(g, new THREE.TorusGeometry(Math.SQRT2 * fx, lr * 0.8, 10, 44), L, 0, fy, 0); m.rotation.x = Math.PI / 2; m.scale.y = fz / fx; }
    else for (const s of [-1, 1]) { rod(g, new V3(-fx, fy, s * fz), new V3(fx, fy, s * fz), lr * 0.8, L); rod(g, new V3(s * fx, fy, -fz), new V3(s * fx, fy, fz), lr * 0.8, L); }
  };
  if (style === 'round') {                                                    // 圓凳：圓形軟墊、沒有靠背
    C(g, .5, .5, 2, 0, seatH - 8.2, 0, L, 40).scale.set(w * 0.9, 1, d * 0.9);
    const m = add(g, new THREE.CylinderGeometry(.5, .5, 6, 40), S, 0, seatH - 4.2, 0); m.scale.set(w, 1, d);
    add(g, new THREE.SphereGeometry(.5, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), S, 0, seatH - 1.25, 0).scale.set(w * 0.985, 2.4, d * 0.985);
    splay(0.26, 0.45, seatH - 8.2, true);
    return g;
  }
  if (style === 'swivel') {                                                   // 升降旋轉：圓盤底座＋中柱＋踏腳環
    const Mt = mat(it.color2, 0.2, 0.85), r = Math.min(w, d) * 0.5;
    C(g, r * 0.9, r, 2, 0, 1, 0, Mt, 44); C(g, 2.6, 2.6, seatH - 12, 0, 2 + (seatH - 12) / 2, 0, Mt, 20); C(g, 4.2, 4.6, 22, 0, 13, 0, Mt, 20);
    add(g, new THREE.TorusGeometry(r * 0.78, 1, 10, 44), Mt, 0, fy, 0).rotation.x = Math.PI / 2;
    B(g, r * 1.56, 1.4, 1.4, 0, fy, 0, Mt);
    C(g, 9, 6, 3, 0, seatH - 10.5, 0, Mt, 20);
    RB(g, w, 9, d - 3, 4, 0, seatH - 4.5, 1.5, S);
    const bk = RB(g, w, Math.min(26, h - seatH + 4), 6, 2.8, 0, seatH - 4 + Math.min(26, h - seatH + 4) / 2, -d / 2 + 4, S); bk.rotation.x = -0.12;
    return g;
  }
  if (style === 'wood') {                                                     // 實木高腳椅：後腳往上延伸成椅背
    const W = L, ps = metal ? 2.6 : 3.6, x = w / 2 - ps / 2 - 1, z = d / 2 - ps / 2 - 1;
    RB(g, w, 4.5, d - 2, 1.6, 0, seatH - 2.25, 1, S);
    for (const sx of [-1, 1]) { B(g, ps, seatH - 4.5, ps, sx * x, (seatH - 4.5) / 2, z, W); B(g, ps, h, ps, sx * x, h / 2, -z, W); B(g, ps * 0.7, ps * 0.7, 2 * z, sx * x, fy + 14, 0, W); }
    B(g, 2 * x, ps * 0.8, ps * 0.8, 0, fy, z, W); B(g, 2 * x, ps * 0.7, ps * 0.7, 0, fy + 8, -z, W);
    B(g, 2 * x, 4, ps * 0.7, 0, seatH - 6.5, z, W);
    RB(g, 2 * x + ps, 9, ps * 0.8, 1.2, 0, h - 5.5, -z, W);
    const sh = h - 11 - seatH - 4; if (sh > 8) for (let i = -1; i <= 1; i++) B(g, 3.2, sh, 1.6, i * x * 0.55, seatH + 2 + sh / 2, -z, W);
    return g;
  }
  // 低背吧檯椅：軟包坐墊＋一段矮靠背
  RB(g, w, 8, d - 4, 3.2, 0, seatH - 4, 2, S);
  const bh = Math.min(22, h - seatH + 2);
  const bk = RB(g, w - 2, bh, 5, 2.4, 0, h - bh / 2, -d / 2 + 3.5, S); bk.rotation.x = -0.1;
  for (const sx of [-1, 1]) rod(g, new V3(sx * (w / 2 - 8), seatH - 6, -d / 2 + 5), new V3(sx * (w / 2 - 8), h - bh + 3, -d / 2 + 3), lr * 0.8, L);
  splay(0.36, 0.47, seatH - 8, false);
  return g;
}

/* ---------- 床 ---------- */
const BED_OPTS = [{ key: 'style', label: '款式', list: [opt('wood', '木作床頭'), opt('floor', '落地式'), opt('inset', '內崁式'), opt('soft', '直條軟包'), opt('arch', '弧形床頭'), opt('wing', '翼式床頭'), opt('platform', '日式低床')] }];
function buildBed(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'wood';
  const padded = style === 'soft' || style === 'arch' || style === 'wing';
  const FR = surfMat(it.framemat || (padded ? 'fabric' : 'wood'), it.color), BD = mat(it.color2, 0.95), PW = mat('#fbfaf7', 0.95), dark = mat('#4b4540', 0.8);
  const hbT = padded ? 12 : 8, mattH = Math.min(24, h * 0.3), fd = d - hbT, fz = hbT / 2;
  const fw = style === 'wing' ? w - 2 * hbT - 8 : w;
  let frameH = Math.min(30, h * 0.35), mattY, mw = fw - 4, md = fd - 4, mz = fz, drape = true;
  if (style === 'platform') {
    frameH = Math.min(16, h * 0.25);
    B(g, w - 16, frameH - 4, fd - 16, 0, (frameH - 4) / 2, fz, dark);
    RB(g, w, 5, fd, 2, 0, frameH - 2.5, fz, FR);
    mattY = frameH; mw = w - 2; md = fd - 2;
  } else if (style === 'floor' || style === 'arch') {
    B(g, w - 4, 3, fd - 4, 0, 1.5, fz, dark);
    RB(g, w, frameH - 3, fd, style === 'arch' ? 5 : 3, 0, 3 + (frameH - 3) / 2, fz, FR);
    mattY = frameH;
  } else if (style === 'inset') {
    const rim = 6, rimTop = frameH + 6, platTop = rimTop - mattH * 0.6;
    B(g, w - 4, 3, fd - 4, 0, 1.5, fz, dark);
    for (const s of [-1, 1]) B(g, rim, rimTop - 3, fd, s * (w / 2 - rim / 2), 3 + (rimTop - 3) / 2, fz, FR);
    B(g, w - 2 * rim, rimTop - 3, rim, 0, 3 + (rimTop - 3) / 2, d / 2 - rim / 2, FR);
    B(g, w - 2 * rim, platTop - 3, fd - rim, 0, 3 + (platTop - 3) / 2, (hbT - rim) / 2, FR);
    mattY = platTop; mw = w - 2 * rim - 1; md = fd - rim - 1; mz = (hbT - rim) / 2; drape = false;
  } else {
    legs4(g, fw, d, 6, 6, 5, FR, false);
    RB(g, fw, frameH - 6, fd, padded ? 5 : 2, 0, 6 + (frameH - 6) / 2, fz, FR);
    mattY = frameH;
  }
  const hz = -d / 2 + hbT / 2;
  if (style === 'soft') {
    RB(g, w, h, 5, 2, 0, h / 2, -d / 2 + 2.5, FR);
    const n = Math.max(3, Math.round(w / 28)), pw = w / n;
    for (let i = 0; i < n; i++) RB(g, pw - 0.8, h - frameH - 4, hbT - 5, 3.2, -w / 2 + pw * (i + .5), frameH + (h - frameH - 4) / 2 + 2, -d / 2 + 5 + (hbT - 5) / 2, FR);
  } else if (style === 'arch') {
    const ah = Math.min(w * 0.22, h * 0.4);
    RB(g, w, h - ah, hbT, 3, 0, (h - ah) / 2, hz, FR);
    const c = C(g, .5, .5, hbT, 0, h - ah, hz, FR, 64);
    c.rotation.x = Math.PI / 2; c.scale.set(w, 1, ah * 2);
  } else if (style === 'wing') {
    RB(g, w, h, hbT, 4, 0, h / 2, hz, FR);
    for (const s of [-1, 1]) { const m = RB(g, hbT, h * 0.9, 28, 4, s * (w / 2 - hbT / 2 - 4), h * 0.45, -d / 2 + hbT + 12, FR); m.rotation.y = s * 0.28; }
  } else {
    const hh = style === 'platform' ? Math.min(h, 75) : h;
    RB(g, w, hh, hbT, 2, 0, hh / 2, hz, FR);
  }
  RB(g, mw, mattH, md, 5, 0, mattY + mattH / 2, mz, PW);
  const dd = md * 0.68, dz = mz + md / 2 - dd / 2;
  RB(g, mw + 2, 4, dd, 2, 0, mattY + mattH + 1, dz, BD);
  if (drape) for (const s of [-1, 1]) B(g, 1.5, mattH * 0.8, dd, s * (mw / 2 + 1.5), mattY + mattH * 0.6, dz, BD);
  const np = mw >= 116 ? 2 : 1, pw = (mw - 10) / np;
  for (let i = 0; i < np; i++) RB(g, pw - 4, 11, 40, 5, -mw / 2 + 5 + pw * (i + .5), mattY + mattH + 5, -d / 2 + hbT + 25, PW);
  return g;
}

/* ---------- 櫃類 ---------- */
const CAB_OPTS = [{ key: 'style', label: '門板款式', list: [opt('flat', '平板門'), opt('groove', '無把手'), opt('slat', '格柵門'), opt('glass', '玻璃門')] }];
const KITCHEN_OPTS = [{ key: 'style', label: '門板款式', list: [opt('flat', '平板門'), opt('groove', '無把手'), opt('slat', '格柵門')] }];
function buildCabinet(it, o = {}) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'flat';
  const Body = bodyMat(it), HD = mat(o.counter ? '#9a9a9a' : it.color2, 0.35, 0.6), dark = mat('#4b4540', 0.8);
  const plinth = Math.min(8, h * 0.08), topT = o.counter ? 4 : o.top ? 2.5 : 0, bodyTop = h - topT, dh = bodyTop - plinth;
  B(g, w - 4, plinth, d - 6, 0, plinth / 2, -3, dark);
  if (style === 'glass') { // 中空櫃體才看得到層板
    B(g, w, dh, 1.5, 0, plinth + dh / 2, -d / 2 + 0.75, Body);
    for (const s of [-1, 1]) B(g, 1.8, dh, d - 2, s * (w / 2 - 0.9), plinth + dh / 2, -1, Body);
    B(g, w, 1.8, d - 2, 0, bodyTop - 0.9, -1, Body);
    B(g, w, 1.8, d - 2, 0, plinth + 0.9, -1, Body);
    const ns = Math.max(1, Math.round(dh / 38));
    for (let i = 1; i < ns; i++) B(g, w - 3.6, 1.5, d - 5, 0, plinth + dh * i / ns, -1.5, Body);
  } else B(g, w, dh, d - 2, 0, plinth + dh / 2, -1, Body);
  const n = Math.max(1, Math.round(w / (o.doorW || 50))), dw = w / n;
  const tall = h > 140, hl = Math.min(tall ? 30 : 12, dh * 0.3), cy = plinth + dh / 2, zf = d / 2 - 0.9;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + .5);
    const side = n === 1 ? -1 : (i % 2 === 0 ? 1 : -1), hx = x + side * (dw / 2 - 4);
    const handle = () => {
      if (o.counter) B(g, Math.min(16, dw * 0.4), 1.2, 1.5, x, bodyTop - 6, d / 2 + 0.7, HD);
      else B(g, 1.5, hl, 2, hx, tall ? plinth + dh * 0.5 : bodyTop - 5 - hl / 2, d / 2 + 1, HD);
    };
    if (style === 'slat') { slats(g, x, cy, dw - 1, dh - 1, d / 2 - 0.8, Body, dark); continue; }
    if (style === 'glass') {
      const f = 4, z = d / 2 - 1;
      B(g, dw - 0.6, f, 2, x, plinth + dh - f / 2 - 0.3, z, Body);
      B(g, dw - 0.6, f, 2, x, plinth + f / 2 + 0.3, z, Body);
      for (const s of [-1, 1]) B(g, f, dh - 0.6, 2, x + s * (dw / 2 - f / 2 - 0.3), cy, z, Body);
      glassPane(g, dw - 2 * f, dh - 2 * f, 0.5, x, cy, z);
      handle(); continue;
    }
    B(g, dw - 0.6, dh - 0.6, 1.8, x, cy, zf, Body);
    if (style === 'groove') B(g, dw - 0.6, 1, 0.3, x, bodyTop - 2.5, d / 2 + 0.05, dark);
    else handle();
  }
  if (o.top) RB(g, w + 0.6, topT, d + 0.6, 0.8, 0, h - topT / 2, 0, topMat(it, 'color3'));
  if (o.counter) {
    B(g, w + 1, topT, d + 1, 0, h - topT / 2, 0, topMat(it, 'color2'));
    if (w > 100) {
      B(g, Math.min(60, w * 0.3), 0.4, d * 0.6, -w * 0.18, h + 0.1, -2, mat('#b8bcc0', 0.25, 0.8));
      C(g, 1.2, 1.2, 25, -w * 0.18, h + 12.5, -d / 2 + 8, mat('#b8bcc0', 0.25, 0.8), 12);
    }
  }
  return g;
}
function buildFridge(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const Bd = mat(it.color, 0.35, 0.3), HD = mat(it.color2, 0.3, 0.7);
  RB(g, w, h - 2, d - 3, 2, 0, 2 + (h - 2) / 2, -1.5, Bd);
  const top = (h - 2) * 0.32;
  B(g, w - 1, top - 0.8, 2, 0, h - top / 2, d / 2 - 1, Bd);
  B(g, w - 1, h - 2 - top - 0.8, 2, 0, 2 + (h - 2 - top) / 2, d / 2 - 1, Bd);
  B(g, 2, Math.min(25, top * 0.6), 2.5, -w / 2 + 6, h - top + top * 0.3, d / 2 + 1, HD);
  B(g, 2, Math.min(40, h * 0.25), 2.5, -w / 2 + 6, h - top - 30, d / 2 + 1, HD);
  return g;
}
const BOOK_OPTS = [{ key: 'style', label: '款式', list: [opt('open', '開放層架'), opt('grid', '格子櫃'), opt('ladder', '梯形斜靠架')] }];
function buildBookshelf(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'open';
  const M = bodyMat(it), t = 2;
  const cols = ['#9e4a3a', '#3d5a80', '#d9a441', '#5f7d63', '#e9e4da', '#4a4d52', '#c98b8b'];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const books = (x0, x1, y0, maxH, dep) => {
    if (maxH < 8) return;
    let x = x0 + 1;
    const end = x0 + (x1 - x0) * (0.45 + rnd() * 0.45);
    while (x < end) {
      const bw = 2 + rnd() * 3, bh = maxH * (0.65 + rnd() * 0.33);
      B(g, bw, bh, dep, x + bw / 2, y0 + bh / 2, 0, mat(cols[Math.floor(rnd() * cols.length)], 0.8));
      x += bw + 0.2;
    }
  };
  if (style === 'ladder') { // 斜靠牆的梯形架：越往上越淺
    const a = Math.atan2(d, h), L = Math.hypot(d, h);
    for (const s of [-1, 1]) { const r = B(g, 3, L, 4, s * (w / 2 - 1.5), h / 2, 0, M); r.rotation.x = -a; }
    const n = Math.max(2, Math.round(h / 38));
    for (let i = 0; i < n; i++) {
      const y = 8 + (h - 16) * i / (n - 1), zr = d / 2 - d * y / h, dep = zr + d / 2;
      if (dep < 6) continue;
      B(g, w - 6, t, dep, 0, y, (-d / 2 + zr) / 2, M);
    }
    return g;
  }
  for (const s of [-1, 1]) B(g, t, h, d, s * (w / 2 - t / 2), h / 2, 0, M);
  B(g, w - 2 * t, t, d, 0, h - t / 2, 0, M);
  B(g, w - 2 * t, 6, d, 0, 3, 0, M);
  B(g, w - 2 * t, h - t - 6, 1, 0, 6 + (h - t - 6) / 2, -d / 2 + .5, M);
  const n = Math.max(1, Math.round((h - 8) / 35)), sp = (h - t - 6) / n;
  for (let i = 1; i < n; i++) B(g, w - 2 * t, t, d - 1, 0, 6 + sp * i, .5, M);
  const nc = style === 'grid' ? Math.max(1, Math.round((w - 2 * t) / 36)) : 1, cwid = (w - 2 * t) / nc;
  for (let c = 1; c < nc; c++) B(g, t, h - t - 6, d - 1, -w / 2 + t + cwid * c, 6 + (h - t - 6) / 2, .5, M);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    if (style === 'grid' && (i + c) % 2) continue;
    const x0 = -w / 2 + t + cwid * c + (c ? t / 2 : 0);
    books(x0, x0 + cwid - t, 6 + sp * i + (i ? t / 2 : 0), Math.min(30, sp - 4), d * 0.72);
  }
  return g;
}
const TVCAB_OPTS = [{ key: 'style', label: '款式', list: [opt('legs', '腳架抽屜'), opt('float', '懸浮式'), opt('open', '開放格'), opt('slat', '格柵門')] }];
function buildTvCab(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'legs';
  const Bd = bodyMat(it), L = mat(it.color2, 0.5), dark = mat('#3b3632', 0.85);
  const lift = style === 'float' ? Math.min(20, h * 0.35) : Math.min(10, h * 0.2), tt = 2.5, hb = h - tt;
  if (style !== 'float') legs4(g, w, d, lift, 5, 3, L, false);
  B(g, w, hb - lift, d - 2, 0, lift + (hb - lift) / 2, -1, Bd);
  RB(g, w + 0.6, tt, d + 0.6, 0.8, 0, h - tt / 2, 0, topMat(it, 'color3'));
  const n = Math.max(1, Math.round(w / 60)), dw = w / n, fh = hb - lift, fy = lift + fh / 2;
  const openIdx = style === 'open' ? (n >= 3 ? Math.floor(n / 2) : n - 1) : -1;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + .5);
    if (i === openIdx) { B(g, dw - 3, fh - 3, 0.4, x, fy, d / 2 - 1.9, dark); continue; }
    if (style === 'slat') { slats(g, x, fy, dw - 1, fh - 1, d / 2 - 0.8, Bd, dark); continue; }
    B(g, dw - 0.6, fh - 0.6, 1.8, x, fy, d / 2 - 0.9, Bd);
    if (style === 'float') B(g, dw - 0.6, 1, 0.3, x, hb - 2.5, d / 2 + 0.05, dark);
    else B(g, Math.min(20, dw * 0.4), 1.2, 1.5, x, hb - 6, d / 2 + 0.7, L);
  }
  return g;
}
function buildTV(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const Bm = mat(it.color, 0.4, 0.2), S = mat('#0b0e14', 0.15, 0.4);
  const standH = Math.min(8, h * 0.12), t = Math.min(d, 5), sh = h - standH;
  B(g, w * 0.4, 1.2, Math.max(d, 4), 0, 0.6, 0, Bm);
  B(g, 6, standH, 2.5, 0, standH / 2, 0, Bm);
  B(g, w, sh, t, 0, standH + sh / 2, 0, Bm);
  B(g, w - 2, sh - 2, 0.3, 0, standH + sh / 2, t / 2 + 0.1, S);
  return g;
}
const DESK_OPTS = [{ key: 'style', label: '款式', list: [opt('panel', '板腳'), opt('metal', '鐵件細腳'), opt('drawer', '抽屜櫃'), opt('lift', '電動升降桌', { size: { w: 140, d: 70, h: 75 } }), opt('hutch', '附書架桌', { size: { w: 120, d: 60, h: 150 } }), opt('xleg', '工業風 X 腳'), opt('writing', '復古寫字桌', { size: { w: 110, d: 55, h: 76 } })] }];
function buildDesk(it) {
  const g = new THREE.Group(), { w, d } = it, hFull = it.h, style = it.style || 'panel', h = hFull > 100 ? Math.min(76, hFull) : hFull;   // 附書架款：桌面 76cm，上面是書架
  const T = mat(it.color, 0.5), L = legMat(it), t = 3;
  RB(g, w, t, d, 1, 0, h - t / 2, 0, topMat(it));
  if (style === 'lift') {                                               // 電動升降桌：雙立柱＋T 字腳
    const M = mat(it.color2, 0.3, 0.75);
    for (const sd of [-1, 1]) { const x = sd * (w / 2 - 14); B(g, 7, h - t - 6, 5, x, (h - t - 6) / 2 + 3, 0, M); B(g, 8.5, (h - t) * 0.45, 6.5, x, (h - t) * 0.22 + 3, 0, M); B(g, 7, 3, d - 6, x, 1.5, 0, M); }
    B(g, w - 28, 5, 4, 0, h - t - 4, 0, M); B(g, 12, 2, 5, w / 2 - 20, h - t - 1.5, d / 2 - 6, mat('#2b2b2b', 0.5));
    return g;
  }
  if (style === 'xleg') {                                               // 工業風 X 腳
    const M = mat(it.color2, 0.35, 0.7);
    for (const sd of [-1, 1]) { const x = sd * (w / 2 - 8); rod(g, new V3(x, 0, -d / 2 + 4), new V3(x, h - t, d / 2 - 4), 1.6, M); rod(g, new V3(x, 0, d / 2 - 4), new V3(x, h - t, -d / 2 + 4), 1.6, M); }
    B(g, w - 16, 3, 3, 0, (h - t) / 2, 0, M);
    return g;
  }
  if (style === 'writing') {                                            // 復古寫字桌：錐形木腳＋抽屜
    const Lw = surfMat('wood', it.color2), ah = 11;
    for (const x of [-w / 2 + 4, w / 2 - 4]) for (const z of [-d / 2 + 4, d / 2 - 4]) C(g, 2.2, 1.3, h - t, x, (h - t) / 2, z, Lw, 12);
    B(g, w - 6, ah, d - 6, 0, h - t - ah / 2, 0, Lw);
    B(g, w * 0.4, ah - 3, 0.8, 0, h - t - ah / 2, d / 2 - 2.6, topMat(it));
    add(g, new THREE.SphereGeometry(1.3, 12, 8), mat('#b08d57', 0.3, 0.8), 0, h - t - ah / 2, d / 2 - 1.8);
    return g;
  }
  if (style === 'hutch') {                                              // 附書架：桌面後方的上層書架
    for (const sd of [-1, 1]) B(g, 3, h - t, d - 4, sd * (w / 2 - 4), (h - t) / 2, 0, L);
    B(g, w - 11, (h - t) * 0.4, 1.5, 0, h - t - (h - t) * 0.2, -d / 2 + 6, L);
    const hd = Math.min(28, d * 0.45), hh = hFull - h, z = -d / 2 + hd / 2, Tm = topMat(it);
    for (const sd of [-1, 1]) B(g, 2, hh, hd, sd * (w / 2 - 1), h + hh / 2, z, Tm);
    B(g, w, 2, hd, 0, hFull - 1, z, Tm); B(g, w - 4, 1.8, hd, 0, h + hh * 0.55, z, Tm); B(g, w - 4, hh, 1, 0, h + hh / 2, -d / 2 + 0.5, Tm);
    return g;
  }
  if (style === 'metal') {
    const M = mat(it.color2, 0.3, 0.75);
    for (const x of [-w / 2 + 4, w / 2 - 4]) for (const z of [-d / 2 + 4, d / 2 - 4]) B(g, 3, h - t, 3, x, (h - t) / 2, z, M);
    for (const s of [-1, 1]) { B(g, w - 8, 4, 2, 0, h - t - 2, s * (d / 2 - 4), M); B(g, 2, 4, d - 8, s * (w / 2 - 4), h - t - 2, 0, M); }
    return g;
  }
  if (style === 'drawer') {
    const pw = Math.min(42, w * 0.35), px = -w / 2 + pw / 2 + 1;
    B(g, pw, h - t, d - 4, px, (h - t) / 2, -1, T);
    const nd = 3, fh = (h - t - 4) / nd;
    for (let i = 0; i < nd; i++) {
      const y = 4 + fh * (i + .5);
      B(g, pw - 0.6, fh - 0.6, 1.5, px, y, d / 2 - 2.2, T);
      B(g, Math.min(12, pw * 0.3), 1.2, 1.5, px, y + fh * 0.25, d / 2 - 0.8, L);
    }
    B(g, 3, h - t, d - 4, w / 2 - 4, (h - t) / 2, 0, L);
    return g;
  }
  for (const s of [-1, 1]) B(g, 3, h - t, d - 4, s * (w / 2 - 4), (h - t) / 2, 0, L);
  B(g, w - 11, (h - t) * 0.4, 1.5, 0, h - t - (h - t) * 0.2, -d / 2 + 6, L);
  return g;
}
// L 型書桌：主桌＋轉角延伸桌
const LDESK_OPTS = [
  { key: 'style', label: '款式', list: [opt('metal', '鐵件腳'), opt('panel', '板腳'), opt('drawer', '附抽屜櫃')] },
  { key: 'side', label: '轉角方向', list: [opt('right', '轉角在右'), opt('left', '轉角在左')] },
];
function buildLDesk(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'metal', t = 3, Tm = topMat(it);
  const dm = Math.min(65, d * 0.46), rw = Math.min(60, w * 0.4), z0 = -d / 2 + dm / 2, rz = -d / 2 + dm + (d - dm) / 2, rx = w / 2 - rw / 2;
  RB(g, w, t, dm, 1, 0, h - t / 2, z0, Tm); RB(g, rw, t, d - dm + 1, 1, rx, h - t / 2, rz - 0.5, Tm);
  const hl = h - t;
  if (style === 'metal') {
    const M = mat(it.color2, 0.3, 0.75);
    for (const [x, z] of [[-w / 2 + 3, -d / 2 + 3], [-w / 2 + 3, -d / 2 + dm - 3], [w / 2 - 3, -d / 2 + 3], [w / 2 - 3, d / 2 - 3], [w / 2 - rw + 3, d / 2 - 3]]) B(g, 3, hl, 3, x, hl / 2, z, M);
    B(g, w - 6, 4, 2, 0, hl - 2, -d / 2 + 3, M); B(g, 2, 4, d - 6, w / 2 - 3, hl - 2, 0, M);
  } else {
    const L = legMat(it);
    B(g, 3, hl, dm - 4, -w / 2 + 3, hl / 2, z0, L);                     // 主桌左側板
    B(g, rw - 4, hl, 3, rx, hl / 2, d / 2 - 3, L);                       // 延伸桌前側板
    B(g, w - 8, hl * 0.4, 1.5, -rw / 2, hl * 0.8, -d / 2 + 5, L);          // 背板
    if (style === 'drawer') {
      const pw = Math.min(42, rw - 6), pz = rz + (d - dm) * 0.1, nd = 3, fh = (hl - 4) / nd;
      B(g, pw, hl, Math.min(50, d - dm - 8), rx, hl / 2, pz - 4, L);
      for (let i = 0; i < nd; i++) { const y = 4 + fh * (i + .5); B(g, pw - 0.6, fh - 0.6, 1.2, rx - pw / 2 - 0.6, y, pz - 4, L).rotation.y = Math.PI / 2; }
    }
  }
  return mirrorIfLeft(it, g);
}
// ---------- 玄關 ----------
const CONSOLE_OPTS = [{ key: 'style', label: '款式', list: [opt('slim', '細腳木桌'), opt('metal', '鐵件雙層'), opt('drawer', '抽屜款')] }];
function buildConsole(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'slim', Tm = topMat(it), t = 3;
  RB(g, w, t, d, 0.8, 0, h - t / 2, 0, Tm);
  if (style === 'metal') {                                              // 鐵件框＋下層檯面
    const M = mat(it.color2, 0.3, 0.75);
    for (const x of [-w / 2 + 2, w / 2 - 2]) for (const z of [-d / 2 + 2, d / 2 - 2]) B(g, 2.2, h - t, 2.2, x, (h - t) / 2, z, M);
    for (const y of [h - t - 1.5, 20]) { B(g, w - 4, 2.5, 2, 0, y, d / 2 - 2, M); B(g, w - 4, 2.5, 2, 0, y, -d / 2 + 2, M); }
    B(g, w - 6, 2, d - 5, 0, 22, 0, Tm);
    return g;
  }
  const Lw = surfMat('wood', it.color2);
  const ah = style === 'drawer' ? 14 : 6;
  for (const x of [-w / 2 + 3, w / 2 - 3]) for (const z of [-d / 2 + 3, d / 2 - 3]) C(g, 2, 1.2, h - t, x, (h - t) / 2, z, Lw, 12);
  B(g, w - 5, ah, d - 5, 0, h - t - ah / 2, 0, Lw);
  if (style === 'drawer') for (const sd of [-1, 1]) {
    B(g, w * 0.42, ah - 3, 0.8, sd * w * 0.23, h - t - ah / 2, d / 2 - 2.1, Tm);
    add(g, new THREE.SphereGeometry(1.2, 12, 8), mat('#b08d57', 0.3, 0.8), sd * w * 0.23, h - t - ah / 2, d / 2 - 1.3);
  }
  return g;
}
const ENTRY_OPTS = [
  { key: 'style', label: '款式', list: [opt('low', '矮櫃'), opt('tall', '高櫃（中間平台）', { size: { w: 100, d: 38, h: 210 } }), opt('float', '懸浮櫃', { size: { w: 120, d: 35, h: 90 } }), opt('bench', '穿鞋椅櫃', { size: { w: 100, d: 40, h: 48 } })] },
  { key: 'bodymat', label: '櫃體材質', list: [opt('wood', '木紋'), opt('lacquer', '烤漆')] },
];
function buildEntryCab(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'low', Bd = bodyMat(it), Hm = mat(it.color2, 0.4, 0.6), dark = mat('#2f2b27', 0.85);
  if (style === 'bench') {                                              // 穿鞋椅：上面坐墊、下面開放鞋架
    const ch = h - 8;
    for (const sd of [-1, 1]) B(g, 2.5, ch, d, sd * (w / 2 - 1.25), ch / 2, 0, Bd);
    B(g, w, 2.5, d, 0, ch - 1.25, 0, Bd); B(g, w - 5, 2, d - 2, 0, ch * 0.45, 0, Bd); B(g, w - 5, 2, d - 2, 0, 3, 0, Bd);
    RB(g, w, 8, d, 2.5, 0, ch + 4, 0, surfMat('fabric', it.color2));
    return g;
  }
  const y0 = style === 'float' ? 25 : 8, bh = h - y0;
  if (style === 'float') B(g, w - 6, 0.8, 1, 0, y0 - 0.5, d / 2 - 4, glowMat('#fff1d6'));   // 懸浮櫃下方間接燈
  else B(g, w - 6, y0, d - 6, 0, y0 / 2, -2, dark);                        // 內縮踢腳
  RB(g, w, bh, d, 0.6, 0, y0 + bh / 2, 0, Bd);
  const n = Math.max(1, Math.round(w / 45)), dw = w / n;
  for (let i = 1; i < n; i++) B(g, 0.4, bh - 2, 0.3, -w / 2 + dw * i, y0 + bh / 2, d / 2 + 0.05, dark);   // 門片分縫
  if (style === 'tall') {                                               // 中間開放平台（放鑰匙、擺飾）
    const ny = y0 + bh * 0.42, nh = Math.min(36, bh * 0.18);
    B(g, w - 3, nh, d - 3, 0, ny + nh / 2, 1.6, dark);
    B(g, w - 3, 1.5, d - 3, 0, ny + 0.75, 1.6, surfMat('wood', '#c49a6c'));
  }
  for (let i = 0; i < n; i++) { const hx = -w / 2 + dw * (i + (i % 2 ? 0.12 : 0.88)); B(g, 1.2, Math.min(24, bh * 0.3), 1.6, hx, y0 + bh * (style === 'tall' ? 0.3 : 0.6), d / 2 + 0.8, Hm); }
  return g;
}
/* ---------- 鞋櫃（玄關）：矮鞋櫃、高鞋櫃、薄型翻板、百葉門、開放鞋架、穿鞋椅 ---------- */
const SHOE_OPTS = [
  { key: 'style', label: '款式', list: [opt('low', '雙門矮鞋櫃', { size: { w: 100, d: 35, h: 100 } }), opt('tall', '高鞋櫃', { size: { w: 80, d: 35, h: 200 } }), opt('slim', '薄型翻板鞋櫃', { size: { w: 80, d: 20, h: 120 } }),
    opt('louver', '百葉門鞋櫃', { size: { w: 100, d: 35, h: 110 } }), opt('open', '開放鞋架', { size: { w: 80, d: 30, h: 90 } }), opt('bench', '穿鞋椅鞋櫃', { size: { w: 100, d: 35, h: 48 }, c2: '坐墊顏色' })] },
  { key: 'bodymat', label: '櫃體材質', list: [opt('wood', '木紋'), opt('lacquer', '烤漆')] },
];
function buildShoeCab(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'low', Bd = bodyMat(it), Hm = mat(it.color2, 0.4, 0.6), dark = mat('#2f2b27', 0.85);
  const SHOES = ['#2b2b2b', '#f1ebe1', '#8b5a3c', '#3d5a80', '#9e4a3a', '#8e9099'];
  const shoes = (y, x0, x1, z, n0 = 0) => {                              // 在層板上擺幾雙鞋
    const n = Math.max(1, Math.floor((x1 - x0) / 24)), step = (x1 - x0) / n, len = Math.min(26, d - 6);
    for (let i = 0; i < n; i++) for (const sd of [-1, 1]) { const m = mat(SHOES[(i + n0) % SHOES.length], 0.7), x = x0 + step * (i + 0.5) + sd * 5; RB(g, 8.5, 5, len, 2.4, x, y + 2.5, z, m); RB(g, 8, 5, len * 0.45, 2.4, x, y + 6, z - len * 0.25, m); }
  };
  if (style === 'bench' || style === 'open') {                          // 開放式：側板＋層板，看得到鞋子
    const top = style === 'bench' ? h - 8 : h, t = 2.2, tiers = Math.max(2, Math.round(top / 24));
    for (const sd of [-1, 1]) B(g, t, top, d, sd * (w / 2 - t / 2), top / 2, 0, Bd);
    B(g, w, t, d, 0, top - t / 2, 0, Bd);
    for (let k = 0; k < tiers; k++) { const y = 3 + (top - t - 3) * k / tiers; B(g, w - 2 * t, 1.8, d - 1.5, 0, y + 0.9, 0, Bd); if (top - t - y > 14) shoes(y + 1.8, -w / 2 + t + 2, w / 2 - t - 2, 0, k * 2); }
    if (style === 'bench') RB(g, w, 8, d, 2.5, 0, top + 4, 0, surfMat('fabric', it.color2));   // 坐墊
    else B(g, w - 2 * t, top - 4, 0.6, 0, top / 2, -d / 2 + 0.3, Bd);   // 背板
    return g;
  }
  if (style === 'slim') {                                               // 薄型：三層往外翻的斗
    const legH = 10, bh = h - legH, n = Math.max(2, Math.round(bh / 37)), fh = bh / n;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 2.5, legH, 2.5, sx * (w / 2 - 3), legH / 2, sz * (d / 2 - 2.5), dark);
    RB(g, w, bh, d - 1.8, 0.5, 0, legH + bh / 2, -0.9, Bd);
    for (let k = 0; k < n; k++) { const y = legH + fh * (k + 0.5); B(g, w - 0.6, fh - 0.6, 1.8, 0, y, d / 2 - 0.9, Bd); B(g, Math.min(40, w * 0.5), 1.4, 0.5, 0, y + fh / 2 - 3, d / 2 + 0.1, Hm); }
    return g;
  }
  // 有門的鞋櫃：矮櫃、高櫃、百葉門
  const y0 = style === 'louver' ? 12 : 8, bh = h - y0;
  if (style === 'louver') for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 2, 1.4, y0, sx * (w / 2 - 5), y0 / 2, sz * (d / 2 - 5), dark, 12);
  else B(g, w - 6, y0, d - 6, 0, y0 / 2, -2, dark);                        // 內縮踢腳
  RB(g, w, bh, d - 1.8, 0.6, 0, y0 + bh / 2, -0.9, Bd);
  const n = Math.max(1, Math.round(w / 45)), dw = w / n, rows = style === 'tall' ? [[0, 0.55], [0.55, 1]] : [[0, 1]];
  for (const [f0, f1] of rows) for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5), ya = y0 + bh * f0, yb = y0 + bh * f1, dh = yb - ya, cy = (ya + yb) / 2;
    if (style === 'louver') { B(g, dw - 0.6, dh - 0.6, 1.2, x, cy, d / 2 - 1.2, Bd); slats(g, x, cy, dw - 7, dh - 7, d / 2 - 0.2, Bd, dark); }
    else B(g, dw - 0.6, dh - 0.6, 1.8, x, cy, d / 2 - 0.9, Bd);
    const hx = x + (n === 1 ? 1 : i % 2 ? -1 : 1) * (dw / 2 - 4), hl = Math.min(22, dh * 0.3);
    B(g, 1.2, hl, 1.6, hx, style === 'tall' ? (f0 ? ya + 6 + hl / 2 : yb - 6 - hl / 2) : cy + dh * 0.12, d / 2 + 0.8, Hm);
  }
  return g;
}
/* ---------- 抱枕（配件）：方形、腰枕、圓形、圓筒、坐墊 ---------- */
const PILLOW_OPTS = [
  { key: 'style', label: '款式', list: [opt('square', '方形抱枕', { size: { w: 45, d: 14, h: 45 } }), opt('lumbar', '長方形腰枕', { size: { w: 50, d: 12, h: 30 } }), opt('round', '圓形抱枕', { size: { w: 40, d: 12, h: 40 } }),
    opt('bolster', '圓筒抱枕', { size: { w: 45, d: 18, h: 18 } }), opt('seat', '坐墊', { size: { w: 45, d: 45, h: 8 } })] },
  { key: 'cmat', label: '布料', list: [opt('fabric', '棉麻'), opt('velvet', '絨布'), opt('leather', '皮革')] },
];
function buildPillow(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'square', F = surfMat(it.cmat || 'fabric', it.color), T2 = mat(it.color2, 0.8);
  if (style === 'bolster') {                                            // 圓筒：橫躺，兩端有包釦
    const r = Math.min(d, h) / 2, c = C(g, r, r, w - 2, 0, r, 0, F, 28); c.rotation.z = Math.PI / 2;
    for (const sd of [-1, 1]) { const e = add(g, new THREE.SphereGeometry(r, 24, 12), F, sd * (w / 2 - 1), r, 0); e.scale.x = 0.18; add(g, new THREE.SphereGeometry(1.6, 12, 8), T2, sd * (w / 2 + 0.2), r, 0); }
    return g;
  }
  if (style === 'seat') {                                               // 坐墊：平放，四角有綁帶釦
    RB(g, w, h, d, Math.min(3.5, h / 2 - 0.2), 0, h / 2, 0, F);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.SphereGeometry(1.3, 10, 8), T2, sx * w * 0.28, h + 0.2, sz * d * 0.28).scale.y = 0.4;
    return g;
  }
  const p = new THREE.Group(); p.rotation.x = -0.2; g.add(p);            // 立著、稍微往後靠
  if (style === 'round') {
    const r = Math.min(w, h) / 2, b = add(p, new THREE.SphereGeometry(r, 32, 20), F, 0, r, 0); b.scale.z = d / 2 / r;
    for (const sd of [-1, 1]) add(p, new THREE.SphereGeometry(1.8, 12, 8), T2, 0, r, sd * (d / 2 - 0.4));
  } else {                                                              // 方形、腰枕：中間鼓、四邊收，邊上有滾邊
    const b = add(p, new THREE.SphereGeometry(1, 28, 18), F, 0, h / 2, 0), ps = b.geometry.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), sq = v => Math.sign(v) * Math.pow(Math.abs(v), 0.38); ps.setXYZ(i, sq(x) * w / 2, sq(y) * h / 2, z * d / 2 * (1 - 0.55 * Math.max(Math.abs(x), Math.abs(y)) ** 3)); }
    b.geometry.computeVertexNormals();
    for (const sd of [-1, 1]) { B(p, w * 0.9, 0.7, 0.9, 0, h / 2 + sd * (h / 2 - 0.5), 0, T2); B(p, 0.7, h * 0.9, 0.9, sd * (w / 2 - 0.5), h / 2, 0, T2); }
  }
  return g;
}
const SOFA_LIKE = ['ownRecliner', 'ownDanSofa', 'ownLetItBe', 'ownRoundChaise', 'own171', 'ownAthena', 'own120', 'ownFloatL', 'ownAmis', 'ownMila', 'ownEmma', 'armchair', 'sofa2', 'sofa', 'baysofa', 'lsofa', 'lounge', 'shellchair', 'wingchair', 'woodchair', 'bench', 'bed', 'queen', 'single'];   // 抱枕會自動放到這些家具上
const NIGHT_OPTS = [{ key: 'style', label: '款式', list: [opt('drawer', '雙抽屜'), opt('open', '抽屜＋開放格'), opt('round', '圓形邊櫃')] }];
function buildNight(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'drawer';
  const Bd = bodyMat(it), L = mat(it.color2, 0.45, 0.3), dark = mat('#3b3632', 0.85), Tp = topMat(it, 'color3'), tt = 2.5, hb = h - tt;
  if (style === 'round') {
    const r = Math.min(w, d) / 2;
    C(g, r * 0.9, r * 0.9, 3, 0, 1.5, 0, dark, 32);
    C(g, r * 0.96, r * 0.96, hb - 3, 0, 3 + (hb - 3) / 2, 0, Bd, 40);
    C(g, r, r, tt, 0, h - tt / 2, 0, Tp, 40);
    B(g, 1.2, (h - 6) * 0.25, 1.2, 0, h * 0.62, r * 0.96 + 0.4, L);
    return g;
  }
  const legH = Math.min(8, h * 0.15);
  legs4(g, w, d, legH, 3, 2.5, L, false);
  B(g, w, hb - legH, d - 2, 0, legH + (hb - legH) / 2, -1, Bd);
  RB(g, w + 0.6, tt, d + 0.6, 0.8, 0, h - tt / 2, 0, Tp);
  if (style === 'open') {
    const fh = (hb - legH) * 0.4, y = hb - fh / 2;
    B(g, w - 0.6, fh - 0.6, 1.8, 0, y, d / 2 - 0.9, Bd);
    B(g, Math.min(12, w * 0.3), 1.2, 1.5, 0, y, d / 2 + 0.7, L);
    B(g, w - 3, hb - legH - fh - 3, 0.4, 0, legH + (hb - legH - fh) / 2, d / 2 - 1.9, dark);
    return g;
  }
  const n = hb - legH > 35 ? 2 : 1, fh = (hb - legH) / n;
  for (let i = 0; i < n; i++) {
    const y = legH + fh * (i + .5);
    B(g, w - 0.6, fh - 0.6, 1.8, 0, y, d / 2 - 0.9, Bd);
    B(g, Math.min(12, w * 0.3), 1.2, 1.5, 0, y + fh * 0.2, d / 2 + 0.7, L);
  }
  return g;
}
function buildRug(it) {
  const g = new THREE.Group(), { w, d } = it, hh = Math.max(0.6, it.h);
  const b = Math.min(10, w * 0.06, d * 0.06);
  B(g, w, hh, d, 0, hh / 2, 0, mat(it.color2, 1));
  B(g, w - 2 * b, hh + 0.15, d - 2 * b, 0, (hh + 0.15) / 2, 0, mat(it.color, 1));
  g.traverse(o => { o.castShadow = false; });
  return g;
}
const PLANT_OPTS = [{ key: 'style', label: '款式', list: [opt('tall', '大型綠植'), opt('ball', '圓球盆栽'), opt('snake', '虎尾蘭')] }];
function buildPlant(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'tall';
  const P = surfMat(it.potmat || 'ceramic', it.color), Lf = mat(it.color2, 0.85);
  const r = Math.min(w, d) / 2, potH = Math.min(h * 0.3, 40), pr = r * 0.6;
  C(g, pr, pr * 0.78, potH, 0, potH / 2, 0, P, 24);
  const fh = h - potH;
  if (style === 'ball') {
    const R = Math.min(r * 0.95, fh / 2 - 2);
    C(g, 1.2, 1.5, fh - 2 * R + 2, 0, potH + (fh - 2 * R + 2) / 2, 0, mat('#6b4f3a', 0.9), 8);
    add(g, new THREE.IcosahedronGeometry(R, 2), Lf, 0, h - R, 0);
    return g;
  }
  if (style === 'snake') {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, rr = pr * 0.5 * ((i % 3) / 2), bh = fh * (0.55 + ((i * 37) % 45) / 100);
      const m = B(g, 3.5, bh, 0.8, Math.cos(a) * rr, potH + bh / 2, Math.sin(a) * rr, Lf);
      m.rotation.y = a; m.rotation.z = Math.cos(a) * 0.12; m.rotation.x = Math.sin(a) * 0.12;
    }
    return g;
  }
  C(g, 1.2, 1.5, h * 0.35, 0, potH + h * 0.15, 0, mat('#6b4f3a', 0.9), 8);
  const fr = Math.min(r * 0.62, fh * 0.28);
  const pts = [[0, .72, 0, 1], [.45, .5, .2, .8], [-.4, .55, -.25, .8], [.1, .5, -.45, .75], [-.2, .42, .42, .72], [0, .92, 0, .6]];
  for (const [px, py, pz, s] of pts) add(g, new THREE.IcosahedronGeometry(fr * s, 1), Lf, px * (r - fr * s), potH + fh * py - fr * s * 0.3, pz * (r - fr * s));
  return g;
}
const LAMP_OPTS = [{ key: 'style', label: '款式', list: [opt('drum', '直筒燈罩'), opt('tripod', '三腳燈'), opt('arc', '弧形釣魚燈', { size: { w: 120, d: 40, h: 190 } })] }];
function buildLamp(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'drum';
  const L = mat(it.color2, 0.4, 0.5), r = Math.min(w, d) / 2;
  const shade = new THREE.MeshStandardMaterial({ color: it.color, emissive: it.color, emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide });
  shade.userData.own = true;
  if (style === 'tripod') {
    const sh = Math.min(45, h * 0.3), top = h - sh * 0.75;
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.5; rod(g, new V3(0, top, 0), new V3(Math.cos(a) * r * 0.85, 0, Math.sin(a) * r * 0.85), 0.9, L); }
    add(g, new THREE.CylinderGeometry(r * 0.5, r * 0.95, sh, 24, 1, true), shade, 0, h - sh / 2, 0).castShadow = false;
    return g;
  }
  if (style === 'arc') {
    const R = Math.min(20, w * 0.16), bx = -w / 2 + 12, sx = w / 2 - R - 2;
    B(g, 22, 5, Math.min(30, d), bx, 2.5, 0, mat('#e9e4da', 0.4));
    const curve = new THREE.QuadraticBezierCurve3(new V3(bx, 5, 0), new V3(bx, h + 40, 0), new V3(sx, h - 2, 0));
    add(g, new THREE.TubeGeometry(curve, 40, 1.1, 8, false), L, 0, 0, 0);
    add(g, new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shade, sx, h - R - 2, 0).castShadow = false;
    return g;
  }
  C(g, r * 0.6, r * 0.65, 2.5, 0, 1.25, 0, L, 28);
  const sh = Math.min(30, h * 0.2);
  C(g, 1.2, 1.2, h - sh - 2, 0, 2 + (h - sh - 2) / 2, 0, L, 10);
  add(g, new THREE.CylinderGeometry(r * 0.65, r, sh, 32, 1, true), shade, 0, h - sh / 2, 0).castShadow = false;
  return g;
}

/* ---------- 桌面材質：木頭／大理石／陶板(岩板)／玻璃 ---------- */
const TOPMAT_LIST = [opt('wood', '木頭'), opt('marble', '大理石'), opt('slate', '陶板(岩板)'), opt('glass', '玻璃')];
const TOPMAT_OPT = { key: 'topmat', label: '桌面材質', list: TOPMAT_LIST };
const COUNTER_OPT = { key: 'topmat', label: '檯面材質', list: TOPMAT_LIST };
const TEX = {};
function surfTex(kind) {
  if (TEX[kind]) return TEX[kind];
  if (kind.endsWith('-inv')) { // 深色石材：深底白紋（把淺底深紋反轉）
    const src = surfTex(kind.slice(0, -4)).image, c2 = document.createElement('canvas'); c2.width = c2.height = 512;
    const x2 = c2.getContext('2d'); x2.drawImage(src, 0, 0);
    const img = x2.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.min(255, 22 + (255 - img.data[i]) * 3.2); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
    x2.putImageData(img, 0, 0);
    const t2 = new THREE.CanvasTexture(c2);
    t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.anisotropy = 4;
    return TEX[kind] = t2;
  }
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512);
  let seed = { marble: 11, slate: 29, fabric: 41, cement: 53, rattan: 67 }[kind] || 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const noise = amp => {
    const img = x.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) { const v = 255 - amp / 2 + (rnd() - 0.5) * amp; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
    x.putImageData(img, 0, 0);
  };
  if (kind === 'marble') { // 大理石紋
    for (let k = 0; k < 16; k++) {
      x.strokeStyle = `rgba(95,95,100,${0.08 + rnd() * 0.28})`; x.lineWidth = 0.6 + rnd() * 2.4;
      x.beginPath(); let px = rnd() * 512, py = -10; x.moveTo(px, py);
      while (py < 522) { px += (rnd() - 0.5) * 46; py += 8 + rnd() * 22; x.lineTo(px, py); }
      x.stroke();
    }
  } else if (kind === 'slate') {                   // 陶板（岩板）：細顆粒＋淡淡的石紋
    noise(18);
    for (let k = 0; k < 12; k++) {
      x.strokeStyle = `rgba(110,110,115,${0.05 + rnd() * 0.14})`; x.lineWidth = 0.5 + rnd() * 1.6;
      x.beginPath(); let px = rnd() * 512, py = -10; x.moveTo(px, py);
      while (py < 522) { px += (rnd() - 0.5) * 60; py += 10 + rnd() * 26; x.lineTo(px, py); }
      x.stroke();
    }
  }
  else if (kind === 'fabric') noise(16);           // 布料織紋
  else if (kind === 'cement') {                    // 水泥
    noise(40);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.04})`; x.beginPath(); x.arc(rnd() * 512, rnd() * 512, 10 + rnd() * 50, 0, 7); x.fill(); }
  } else if (kind === 'rattan') {                  // 藤編
    x.strokeStyle = 'rgba(80,50,20,.35)'; x.lineWidth = 3;
    for (let k = -512; k < 1024; k += 14) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 512, 512); x.stroke(); x.beginPath(); x.moveTo(k + 512, 0); x.lineTo(k, 512); x.stroke(); }
  } else { // 木紋
    for (let yy = 0; yy < 512; yy += 2) {
      x.fillStyle = `rgba(90,55,25,${0.03 + 0.07 * Math.abs(Math.sin(yy * 0.06 + Math.sin(yy * 0.011) * 3))})`;
      x.fillRect(0, yy, 512, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return TEX[kind] = t;
}
// 依材質種類產生材質（同種類同顏色共用）
function surfMat(kind, col) {
  col = col || '#ffffff';
  const tx = kind === 'glass' ? null : customTex(col, kind === 'leather' || kind === 'velvet' || kind === 'fabric'), k = 'surf|' + kind + '|' + col + (tx ? '|' + tx.uuid + '|' + TRI_CUR + '|' + TRI_MAX : '');
  if (MATS.has(k)) return MATS.get(k);
  let m;
  switch (kind) {
    case 'glass': m = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2 }); break;
    case 'lacquer': case 'ceramic': m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 }); break;
    case 'marble': case 'slate': { // 深色時改用深底白紋
      const dark = hslOf(col).l < 0.3;
      m = new THREE.MeshStandardMaterial({ color: dark ? new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.75) : col, map: surfTex(kind + (dark ? '-inv' : '')), roughness: kind === 'marble' ? 0.18 : 0.4 });
      break;
    }
    case 'cement': m = new THREE.MeshStandardMaterial({ color: col, map: surfTex('cement'), roughness: 0.95 }); break;
    case 'rattan': m = new THREE.MeshStandardMaterial({ color: col, map: surfTex('rattan'), roughness: 0.85 }); break;
    case 'fabric': m = new THREE.MeshStandardMaterial({ color: col, map: surfTex('fabric'), roughness: 0.95 }); break;
    case 'leather': m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5 }); break;
    case 'velvet': m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.8, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.4) }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.32, metalness: 0.75 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: col, map: surfTex('wood'), roughness: 0.55 });
  }
  if (GRAIN[kind] || kind === 'wood' || !['glass', 'lacquer', 'ceramic', 'marble', 'slate', 'cement', 'rattan', 'metal'].includes(kind)) m.userData.grain = GRAIN[kind] || 4;   // 皮革的皮紋、布料的織紋、絨布的細毛、木頭的木紋起伏
  if (tx) triMat(m, tx, kind === 'marble' || kind === 'slate' ? 'slab' : kind === 'leather' || kind === 'velvet' || kind === 'fabric'); else if (m.userData.grain) fxMat(m);
  if (kind === 'marble' || kind === 'slate' || kind === 'lacquer' || kind === 'ceramic') m.envMapIntensity = 1.6;   // 石材、烤漆的檯面：環境的反光明顯一點
  MATS.set(k, m);
  return m;
}
const topMat = (it, key = 'color') => surfMat(it.topmat || 'wood', it[key]);
const bodyMat = (it, key = 'color') => surfMat(it.bodymat || ((TYPES[it.type] || {}).def || {}).bodymat || 'wood', it[key]);
const fabMat = (it, key = 'color') => surfMat(it.fabric || 'fabric', it[key]);
COFFEE_OPTS.push(TOPMAT_OPT); LDESK_OPTS.push(TOPMAT_OPT); CONSOLE_OPTS.push(TOPMAT_OPT); DINING_OPTS.push(TOPMAT_OPT); ROUND_OPTS.push(TOPMAT_OPT); DESK_OPTS.push(TOPMAT_OPT); KITCHEN_OPTS.push(COUNTER_OPT);
const MIRROR = new THREE.MeshStandardMaterial({ color: '#dfe7ea', roughness: 0.04, metalness: 0.95 });

/* ---------- 單椅 ---------- */
const ACCENT_OPTS = [{ key: 'style', label: '款式', list: [opt('lounge', '休閒扶手椅'), opt('shell', '貝殼椅'), opt('wing', '高背單椅'), opt('wood', '木框單椅')] }];
function buildAccent(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'lounge';
  const F = fabMat(it), L = surfMat('wood', it.color2);
  const seatH = Math.min(42, h * 0.5);
  if (style === 'shell') {
    const M = mat(it.color2, 0.3, 0.75), r = Math.min(w, d) / 2;
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; rod(g, new V3(Math.cos(a) * r * 0.4, seatH - 9, Math.sin(a) * r * 0.4), new V3(Math.cos(a) * r * 0.78, 0, Math.sin(a) * r * 0.78), 1, M); }
    C(g, .5, .5, 10, 0, seatH - 5, 0.04 * d, F, 40).scale.set(w * 0.88, 1, d * 0.82);
    const shell = F.clone(); shell.side = THREE.DoubleSide; shell.userData.own = true;
    const bh = h - seatH + 10;
    const b = add(g, new THREE.CylinderGeometry(w / 2, w * 0.4, bh, 48, 1, true, Math.PI / 2 - 0.35, Math.PI + 0.7), shell, 0, seatH - 10 + bh / 2, 0);
    b.scale.z = d / w;
    return g;
  }
  if (style === 'wing') {
    const legH = 12;
    legs4(g, w, d, legH, 6, 4.5, L, true);
    RB(g, w, seatH - legH - 8, d, 3, 0, legH + (seatH - legH - 8) / 2, 0, F);
    RB(g, w - 26, 10, d - 16, 5, 0, seatH - 3, 6, F);
    RB(g, w - 8, h - legH, 14, 5, 0, legH + (h - legH) / 2, -d / 2 + 7, F);
    for (const s of [-1, 1]) {
      RB(g, 13, 22, d - 10, 4, s * (w / 2 - 6.5), seatH + 5, 3, F);
      const wg = RB(g, 11, h * 0.42, d * 0.42, 4, s * (w / 2 - 6), h - h * 0.21 - 2, -d / 2 + 14 + d * 0.21, F);
      wg.rotation.y = s * 0.18;
    }
    return g;
  }
  if (style === 'wood') {
    const armH = Math.min(h * 0.72, 60);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 2.5);
      B(g, 4, armH, 4, x, armH / 2, d / 2 - 5, L);
      B(g, 4, armH - 4, 4, x, (armH - 4) / 2, -d / 2 + 5, L);
      B(g, 6, 3, d - 2, x, armH, 0, L);
      B(g, 3, 4, d - 12, x, 16, 0, L);
    }
    B(g, w - 6, 3, 4, 0, seatH - 14, d / 2 - 6, L); B(g, w - 6, 3, 4, 0, seatH - 14, -d / 2 + 6, L);
    RB(g, w - 10, 12, d - 10, 5, 0, seatH - 6, 2, F);
    const bk = RB(g, w - 12, h - seatH - 2, 13, 6, 0, seatH + (h - seatH - 2) / 2, -d / 2 + 10, F); bk.rotation.x = -0.18;
    return g;
  }
  return buildSofa({ ...it, type: 'armchair', seats: '1', style: 'nordic' });
}

/* ---------- 椅凳 ---------- */
const STOOL_OPTS = [{ key: 'style', label: '款式', list: [opt('round', '圓形軟凳', { size: { w: 45, d: 45, h: 42 } }), opt('cube', '方形軟凳', { size: { w: 45, d: 45, h: 42 } }), opt('bench', '長凳', { size: { w: 110, d: 40, h: 45 } })] }];
function buildStool(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'round';
  const F = fabMat(it), L = surfMat('wood', it.color2);
  if (style === 'round') {
    C(g, .5, .5, 3, 0, 1.5, 0, mat('#4b4540', 0.8), 40).scale.set(w * 0.9, 1, d * 0.9);
    C(g, .5, .5, h - 5, 0, 3 + (h - 5) / 2, 0, F, 48).scale.set(w, 1, d);
    const top = add(g, new THREE.SphereGeometry(.5, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), F, 0, h - 2, 0);
    top.scale.set(w, 4, d);
    return g;
  }
  if (style === 'cube') { RB(g, w, h, d, 6, 0, h / 2, 0, F); return g; }
  legs4(g, w, d, h - 14, 5, 4, L, false);
  B(g, w - 4, 4, d - 4, 0, h - 16, 0, L);
  RB(g, w, 13, d, 4, 0, h - 6.5, 0, F);
  return g;
}

/* ---------- 地毯 ---------- */
const RUG_OPTS = [{ key: 'shape', label: '形狀', list: [opt('rect', '長方形', { size: { w: 200, d: 140, h: 1 } }), opt('round', '圓形', { size: { w: 160, d: 160, h: 1 } })] }];
function buildRugShaped(it) {
  if ((it.shape || 'rect') === 'rect') return buildRug(it);
  const g = new THREE.Group(), { w, d } = it, hh = Math.max(0.6, it.h), b = Math.min(10, w * 0.06);
  C(g, .5, .5, hh, 0, hh / 2, 0, mat(it.color2, 1), 64).scale.set(w, 1, d);
  C(g, .5, .5, hh + 0.15, 0, (hh + 0.15) / 2, 0, mat(it.color, 1), 64).scale.set(w - 2 * b, 1, d - 2 * b);
  g.traverse(o => { o.castShadow = false; });
  return g;
}

/* ---------- 推門衣櫃 ---------- */
const SLIDE_OPTS = [{ key: 'style', label: '門片款式', list: [opt('flat', '平板推門'), opt('mirror', '鏡面推門'), opt('frame', '格框推門')] }];
function buildSlideWardrobe(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'flat';
  const Body = bodyMat(it), Tr = mat(it.color2, 0.35, 0.6), dark = mat('#3b3632', 0.85);
  const plinth = Math.min(6, h * 0.05), dh = h - plinth - 5;
  B(g, w - 4, plinth, d - 8, 0, plinth / 2, -4, dark);
  B(g, w, h - plinth, d - 6, 0, plinth + (h - plinth) / 2, -3, Body);
  B(g, w, 4, 6, 0, h - 2, d / 2 - 3, Tr);
  const n = Math.max(2, Math.round(w / 90)), step = w / n, pw = step + 2;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + step * (i + .5), z = i % 2 ? d / 2 - 1.3 : d / 2 - 3.7, y = plinth + dh / 2;
    B(g, pw, dh, 2, x, y, z, Body);
    for (const e of [-1, 1]) B(g, 0.5, dh, 0.3, x + e * (pw / 2 - 0.25), y, z + 1.05, dark); // 門片邊線
    B(g, 1.4, dh * 0.55, 0.4, x + (i % 2 ? -1 : 1) * (pw / 2 - 3), y, z + 1.1, Tr);
    if (style === 'mirror' && i % 2 === 1) B(g, pw - 10, dh - 12, 0.3, x, y, z + 1.15, MIRROR);
    if (style === 'frame') for (const f of [0.25, 0.5, 0.75]) B(g, pw - 4, 1, 0.3, x, plinth + dh * f, z + 1.1, Tr);
  }
  return g;
}

/* ---------- 化妝台、化妝椅 ---------- */
const VANITY_OPTS = [{ key: 'style', label: '鏡子', list: [opt('rect', '方形立鏡'), opt('round', '圓鏡'), opt('none', '無鏡', { size: { w: 100, d: 45, h: 76 } })] }, TOPMAT_OPT];
function buildVanity(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'rect';
  const Bd = bodyMat(it, 'color2'), knob = mat('#b08d57', 0.3, 0.8);
  const deskH = style === 'none' ? h : Math.min(76, h * 0.55);
  RB(g, w, 3, d, 1, 0, deskH - 1.5, 0, topMat(it));
  legs4(g, w, d, deskH - 3, 3, 3.5, Bd, false);
  B(g, w - 6, 13, d - 6, 0, deskH - 3 - 6.5, -1, Bd);
  const nd = w > 90 ? 2 : 1, dw = (w - 6) / nd;
  for (let i = 0; i < nd; i++) {
    const x = -w / 2 + 3 + dw * (i + .5);
    B(g, dw - 1, 11, 1, x, deskH - 3 - 6.5, d / 2 - 3.5, Bd);
    add(g, new THREE.SphereGeometry(1.2, 10, 8), knob, x, deskH - 3 - 6.5, d / 2 - 2.6);
  }
  if (style === 'rect') {
    const mw = Math.min(w * 0.6, 70), mh = h - deskH - 6, y = deskH + 3 + mh / 2, z = -d / 2 + 4;
    B(g, mw, mh, 3, 0, y, z, Bd);
    B(g, mw - 5, mh - 5, 0.4, 0, y, z + 1.7, MIRROR);
  } else if (style === 'round') {
    const R = Math.min(w * 0.3, (h - deskH - 6) / 2), y = deskH + 4 + R, z = -d / 2 + 4;
    B(g, 6, 6, 3, 0, deskH + 3, z, Bd);
    const f = C(g, R, R, 3, 0, y, z, Bd, 48); f.rotation.x = Math.PI / 2;
    const m = C(g, R - 2.5, R - 2.5, 0.4, 0, y, z + 1.7, MIRROR, 48); m.rotation.x = Math.PI / 2;
  }
  return g;
}
const VSTOOL_OPTS = [{ key: 'style', label: '款式', list: [opt('round', '圓凳'), opt('back', '小靠背椅', { size: { w: 42, d: 42, h: 75 } })] }];
function buildVanityStool(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'round';
  const F = fabMat(it), M = mat(it.color2, 0.3, 0.75);
  const seatH = style === 'back' ? Math.min(47, h * 0.62) : h;
  const r = Math.min(w, d) / 2;
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; rod(g, new V3(Math.cos(a) * r * 0.5, seatH - 9, Math.sin(a) * r * 0.5), new V3(Math.cos(a) * r * 0.85, 0, Math.sin(a) * r * 0.85), 0.9, M); }
  C(g, .5, .5, 9, 0, seatH - 4.5, 0, F, 40).scale.set(w, 1, d);
  if (style === 'back') {
    for (const s of [-1, 1]) rod(g, new V3(s * w * 0.28, seatH, -d * 0.38), new V3(s * w * 0.3, h - 8, -d * 0.45), 0.8, M);
    const b = RB(g, w * 0.85, Math.min(20, h - seatH - 2), 5, 2.4, 0, h - Math.min(20, h - seatH - 2) / 2, -d * 0.45, F); b.rotation.x = -0.1;
  }
  return g;
}

/* ---------- 餐櫃 ---------- */
const SIDEBOARD_OPTS = [{ key: 'style', label: '款式', list: [opt('low', '矮櫃'), opt('slat', '格柵門矮櫃'), opt('tall', '高餐櫃（上玻璃櫃）', { size: { w: 120, d: 45, h: 200 } })] }, COUNTER_OPT];
function buildSideboard(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'low';
  const Bd = bodyMat(it, 'color2'), knob = mat('#b08d57', 0.3, 0.8), dark = mat('#3b3632', 0.85);
  const lowH = style === 'tall' ? Math.min(86, h * 0.45) : h, legH = style === 'tall' ? 6 : Math.min(14, lowH * 0.16), topT = 3;
  if (style === 'tall') B(g, w - 4, legH, d - 6, 0, legH / 2, -3, dark); else legs4(g, w, d, legH, 5, 3.5, Bd, false);
  const bh = lowH - legH - topT;
  B(g, w, bh, d - 2, 0, legH + bh / 2, -1, Bd);
  RB(g, w + 1, topT, d + 1, 1, 0, lowH - topT / 2, 0, topMat(it));
  const n = Math.max(2, Math.round(w / 45)), dw = w / n, y = legH + bh / 2;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + .5);
    if (style === 'slat') { slats(g, x, y, dw - 1, bh - 1, d / 2 - 0.8, Bd, dark); continue; }
    B(g, dw - 0.6, bh - 0.6, 1.8, x, y, d / 2 - 0.9, Bd);
    add(g, new THREE.SphereGeometry(1.3, 10, 8), knob, x + (i % 2 ? -1 : 1) * (dw / 2 - 5), y + bh * 0.25, d / 2 + 0.6);
  }
  if (style === 'tall') { // 上層玻璃展示櫃（內縮）
    const ud = d * 0.7, uz = -d / 2 + ud / 2, uy0 = lowH, uh = h - lowH;
    B(g, w, uh, 1.5, 0, uy0 + uh / 2, -d / 2 + 0.75, Bd);
    for (const s of [-1, 1]) B(g, 2, uh, ud, s * (w / 2 - 1), uy0 + uh / 2, uz, Bd);
    B(g, w, 3, ud, 0, h - 1.5, uz, Bd);
    const ns = Math.max(1, Math.round(uh / 35));
    for (let i = 1; i < ns; i++) B(g, w - 4, 1.5, ud - 3, 0, uy0 + uh * i / ns, uz, Bd);
    const nu = Math.max(2, Math.round(w / 50)), uw = w / nu, zf = -d / 2 + ud;
    for (let i = 0; i < nu; i++) {
      const x = -w / 2 + uw * (i + .5);
      B(g, uw - 0.6, 3, 2, x, h - 4.5, zf, Bd); B(g, uw - 0.6, 3, 2, x, uy0 + 1.5, zf, Bd);
      for (const s of [-1, 1]) B(g, 3, uh - 6, 2, x + s * (uw / 2 - 1.8), uy0 + uh / 2 - 1.5, zf, Bd);
      glassPane(g, uw - 6, uh - 9, 0.5, x, uy0 + uh / 2 - 1.5, zf);
    }
  }
  return g;
}

/* ---------- 辦公椅 ---------- */
const OFFICE_OPTS = [{ key: 'style', label: '款式', list: [opt('mesh', '網背電腦椅'), opt('exec', '高背主管椅', { size: { w: 68, d: 68, h: 120 } }), opt('task', '無扶手工作椅', { size: { w: 55, d: 55, h: 92 } })] }];
function buildOffice(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'mesh';
  const S = fabMat(it), M = mat(it.color2, 0.35, 0.6), blk = mat('#222222', 0.5);
  const seatH = Math.min(48, h * 0.44), R = Math.min(w, d) / 2 * 0.95;
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5;
    const leg = B(g, 4, 3, R, Math.sin(a) * R / 2, 6, Math.cos(a) * R / 2, M); leg.rotation.y = a;
    add(g, new THREE.SphereGeometry(3, 10, 8), blk, Math.sin(a) * R, 3, Math.cos(a) * R);
  }
  C(g, 4, 4, 5, 0, 7, 0, M, 16);
  C(g, 2, 2, seatH - 16, 0, 8 + (seatH - 16) / 2, 0, blk, 12);
  RB(g, w * 0.82, 8, d * 0.78, 3.5, 0, seatH - 4, d * 0.04, S);
  const bz = -d * 0.36;
  if (style === 'exec') {
    const bh = h - seatH;
    const b = RB(g, w * 0.78, bh, 11, 5, 0, seatH + bh / 2 - 1, bz, S); b.rotation.x = -0.12;
  } else {
    const bh = (h - seatH) * (style === 'task' ? 0.62 : 0.88), by = seatH + 6 + bh / 2;
    B(g, 4, 14, 3, 0, seatH + 3, bz + 2, M);
    const b = RB(g, w * (style === 'task' ? 0.68 : 0.76), bh, style === 'task' ? 6 : 3, style === 'task' ? 2.5 : 1.4, 0, by, bz, S); b.rotation.x = -0.1;
  }
  if (style !== 'task') for (const s of [-1, 1]) {
    B(g, 3, 18, 3, s * w * 0.42, seatH + 7, 0, blk);
    RB(g, 6, 3, d * 0.45, 1.2, s * w * 0.42, seatH + 17, 0, blk);
  }
  return g;
}

/* ---------- 窗簾 ---------- */
function curtMat(kind, col) {
  const k = 'curt|' + kind + '|' + col;
  if (MATS.has(k)) return MATS.get(k);
  let m;
  if (kind === 'sheer') m = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.45, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false });
  else if (kind === 'velvet') m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.8, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.4), side: THREE.DoubleSide });
  else if (kind === 'linen') m = new THREE.MeshStandardMaterial({ color: col, map: surfTex('fabric'), roughness: 0.95, side: THREE.DoubleSide });
  else m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, side: THREE.DoubleSide });
  MATS.set(k, m);
  return m;
}
function wavePanel(g, w, h, folds, amp, x, y, z, m) { // 波浪褶的布片
  const geo = new THREE.PlaneGeometry(w, h, Math.max(8, folds * 10), 1), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w + 0.5) * folds * Math.PI * 2) * amp);
  geo.computeVertexNormals();
  const mesh = add(g, geo, m, x, y, z);
  if (m.transparent) mesh.castShadow = false;
  return mesh;
}
const DRAPE_OPTS = [
  { key: 'style', label: '款式', list: [opt('drape', '單層布簾'), opt('layered', '布加紗', { c3: '紗簾顏色' }), opt('sheer', '紗簾')] },
  { key: 'open', label: '開合', list: [opt('closed', '全關'), opt('half', '半開'), opt('open', '兩側收合')] },
  { key: 'cmat', label: '布料材質', list: [opt('blackout', '遮光布'), opt('linen', '棉麻'), opt('velvet', '絨布')] },
];
function buildDrape(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'drape', open = it.open || 'half';
  const Rod = surfMat('metal', it.color2), ph = h - 5;
  const rod = z => {
    const r = C(g, 1.2, 1.2, w, 0, h - 2, z, Rod, 12); r.rotation.z = Math.PI / 2;
    for (const sd of [-1, 1]) add(g, new THREE.SphereGeometry(2.2, 12, 8), Rod, sd * w / 2, h - 2, z);
  };
  const cover = open === 'closed' ? 1 : open === 'half' ? 0.62 : 0.3;
  const layer = (m, cov, z, k) => {
    const pw = w * cov / 2, folds = Math.max(3, Math.round(pw / 11)), amp = Math.min(d * 0.3, (1.6 + (1 - cov) * 5) * k);
    for (const sd of [-1, 1]) wavePanel(g, pw, ph, folds, amp, sd * (w / 2 - pw / 2), ph / 2, z, m);
  };
  const zf = d / 2 - 5;
  rod(zf);
  if (style === 'sheer') layer(curtMat('sheer', it.color), cover, zf, 1);
  else {
    layer(curtMat(it.cmat || 'blackout', it.color), cover, zf, 1);
    if (style === 'layered') { const zb = -d / 2 + 4; rod(zb); layer(curtMat('sheer', it.color3 || '#f5f3ee'), 1, zb, 0.6); }
  }
  return g;
}
const ROLLER_OPTS = [
  { key: 'style', label: '款式', list: [opt('zebra', '調光捲簾（斑馬簾）'), opt('roller', '一般捲簾'), opt('roman', '羅馬簾')] },
  { key: 'cmat', label: '簾布材質', list: [opt('blackout', '遮光'), opt('linen', '棉麻'), opt('sheer', '半透光')] },
];
function buildRoller(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'zebra', box = Math.min(9, d);
  const Cas = surfMat('lacquer', it.color2), F = curtMat(it.cmat || 'blackout', it.color);
  const fh = h - box, fw = w - 2;
  B(g, w, box, box, 0, h - box / 2, 0, Cas);
  if (style === 'roman') { // 羅馬簾：上段平整、下段層層折起
    const bottom = fh * 0.45;
    B(g, fw, fh - bottom - 20, 0.4, 0, fh - (fh - bottom - 20) / 2, 0, F);
    for (let i = 0; i < 4; i++) RB(g, fw, 6.5, 4, 2.4, 0, bottom + 3 + i * 5, 1 + (i % 2) * 0.8, F);
    B(g, fw, 1.5, 1.5, 0, bottom, 1.5, Cas);
    return g;
  }
  if (style === 'zebra') { // 斑馬簾：遮光與透光橫條交錯
    const S = curtMat('sheer', it.color), band = 7;
    for (let y = 3, k = 0; y < fh; y += band, k++) { const bh = Math.min(band, fh - y); B(g, fw, bh, 0.3, 0, y + bh / 2, k % 2 ? 0.4 : 0, k % 2 ? S : F); }
  } else B(g, fw, fh - 3, 0.3, 0, 3 + (fh - 3) / 2, 0, F);
  B(g, fw, 3, 1.6, 0, 1.5, 0, Cas);
  return g;
}
const BLIND_OPTS = [
  { key: 'style', label: '款式', list: [opt('wood', '木百葉'), opt('alu', '鋁百葉')] },
  { key: 'tilt', label: '葉片角度', list: [opt('open', '全開'), opt('half', '半開'), opt('closed', '全關')] },
];
function buildBlinds(it) {
  const g = new THREE.Group(), { w, d, h } = it, wood = (it.style || 'wood') === 'wood';
  const M = surfMat(wood ? 'wood' : 'lacquer', it.color), cord = mat('#dcd6cc', 0.9);
  const sw = wood ? 5 : 2.5, step = sw * 0.85, tilt = { open: 0, half: 0.7, closed: 1.35 }[it.tilt || 'half'];
  B(g, w, 5, Math.min(7, d), 0, h - 2.5, 0, M);
  for (let y = h - 8; y > 4; y -= step) { const sl = B(g, w - 2, 0.35, sw, 0, y, 0, M); sl.rotation.x = tilt; sl.castShadow = false; }
  B(g, w - 2, 1.5, sw, 0, 1.5, 0, M);
  for (const x of [-w * 0.3, w * 0.3]) B(g, 0.4, h - 5, 0.4, x, (h - 5) / 2, 0, cord);
  return g;
}

/* ---------- 燈具 ---------- */
function glowMat(col) {
  const k = 'glow|' + col;
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, roughness: 0.8, side: THREE.DoubleSide }));
  return MATS.get(k);
}
const BULB = () => glowMat('#fff4d6');
function canopy(g, h, M) { C(g, 6, 6, 2, 0, h - 1, 0, M, 20); }
const PENDANT_OPTS = [{ key: 'style', label: '款式', list: [opt('dome', '金屬圓罩'), opt('globe', '玻璃球'), opt('cone', '錐形罩'), opt('linear', '長型吊燈', { size: { w: 120, d: 20, h: 90 } }), opt('chandelier', '多頭吊燈', { size: { w: 70, d: 70, h: 90 } })] }];
function buildPendant(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'dome';
  const S = surfMat('metal', it.color), M = surfMat('metal', it.color2), r = Math.min(w, d) / 2;
  canopy(g, h, M);
  if (style === 'linear') {
    B(g, w, 5, Math.min(d, 8), 0, 2.5, 0, S);
    B(g, w - 4, 0.6, Math.min(d, 8) - 2, 0, -0.1, 0, BULB());
    for (const sd of [-1, 1]) B(g, 0.3, h - 5, 0.3, sd * w * 0.35, 5 + (h - 5) / 2, 0, M);
    return g;
  }
  if (style === 'chandelier') {
    add(g, new THREE.SphereGeometry(4, 16, 12), M, 0, 14, 0);
    B(g, 0.6, h - 16, 0.6, 0, 16 + (h - 16) / 2, 0, M);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, ex = Math.cos(a) * (r - 4), ez = Math.sin(a) * (r - 4);
      rod(g, new V3(0, 14, 0), new V3(ex, 8, ez), 0.6, M);
      C(g, 1.6, 1.6, 4, ex, 10, ez, M, 12);
      add(g, new THREE.SphereGeometry(2.4, 12, 10), BULB(), ex, 14, ez);
    }
    return g;
  }
  let top;
  if (style === 'globe') { add(g, new THREE.SphereGeometry(r, 32, 20), glowMat(it.color), 0, r, 0); top = 2 * r; }
  else if (style === 'cone') { const sh = r * 1.2; add(g, new THREE.CylinderGeometry(r * 0.2, r, sh, 32, 1, true), S, 0, sh / 2, 0); top = sh; }
  else { add(g, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), S, 0, 0, 0); top = r; }
  add(g, new THREE.SphereGeometry(Math.min(4, r * 0.3), 12, 10), BULB(), 0, style === 'globe' ? r : top * 0.3, 0);
  B(g, 0.4, h - top, 0.4, 0, top + (h - top) / 2, 0, M);
  return g;
}
const CEIL_OPTS = [{ key: 'style', label: '款式', list: [opt('disk', '圓形'), opt('square', '方形'), opt('ring', '環形')] }];
function buildCeilLight(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'disk', F = surfMat('lacquer', it.color2);
  if (style === 'ring') {
    C(g, 5, 5, 2, 0, h - 1, 0, F, 20);
    for (let k = 0; k < 3; k++) rod(g, new V3(0, h - 1, 0), new V3(Math.cos(k * 2.1) * w * 0.4, h * 0.3, Math.sin(k * 2.1) * d * 0.4), 0.3, F);
    const t = add(g, new THREE.TorusGeometry(Math.min(w, d) * 0.4, 2.5, 12, 64), glowMat(it.color), 0, h * 0.3, 0); t.rotation.x = Math.PI / 2;
    return g;
  }
  if (style === 'square') { RB(g, w, h - 2, d, 2, 0, 1 + (h - 2) / 2, 0, F); B(g, w - 2, 0.5, d - 2, 0, 0.8, 0, glowMat(it.color)); }
  else { C(g, .5, .5, h - 2, 0, 1 + (h - 2) / 2, 0, F, 48).scale.set(w, 1, d); C(g, .5, .5, 0.5, 0, 0.8, 0, glowMat(it.color), 48).scale.set(w - 2, 1, d - 2); }
  return g;
}
const TABLELAMP_OPTS = [{ key: 'style', label: '款式', list: [opt('drum', '布罩檯燈'), opt('dome', '金屬圓罩'), opt('mushroom', '蘑菇燈'), opt('ceramic', '陶瓷底座')] }];
function buildTableLamp(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'drum', r = Math.min(w, d) / 2;
  const Base = surfMat(style === 'ceramic' ? 'ceramic' : 'metal', it.color2);
  if (style === 'mushroom') {
    C(g, r * 0.5, r * 0.6, h * 0.62, 0, h * 0.31, 0, Base, 32);
    add(g, new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(it.color), 0, h * 0.62, 0).scale.y = (h * 0.38) / r;
    return g;
  }
  if (style === 'ceramic') {
    add(g, new THREE.SphereGeometry(r * 0.55, 24, 16), Base, 0, r * 0.55, 0).scale.y = 1.25;
    C(g, 0.8, 0.8, h * 0.25, 0, r * 1.35 + h * 0.1, 0, surfMat('metal', '#b08d57'), 8);
  } else {
    C(g, r * 0.5, r * 0.55, 2, 0, 1, 0, Base, 24);
    C(g, 0.8, 0.8, h * 0.62, 0, 2 + h * 0.31, 0, Base, 8);
  }
  const sh = h * 0.36;
  if (style === 'dome') add(g, new THREE.SphereGeometry(r * 0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), surfMat('metal', it.color), 0, h - sh * 0.9, 0);
  else add(g, new THREE.CylinderGeometry(r * 0.62, r, sh, 32, 1, true), glowMat(it.color), 0, h - sh / 2, 0);
  return g;
}
const WALLLAMP_OPTS = [{ key: 'style', label: '款式', list: [opt('globe', '球形壁燈'), opt('up', '上照壁燈'), opt('arm', '懸臂壁燈')] }];
function buildWallLamp(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'globe', M = surfMat('metal', it.color2);
  const zb = -d / 2 + 1;
  C(g, 5, 5, 2, 0, h / 2, zb, M, 20).rotation.x = Math.PI / 2;
  if (style === 'up') { add(g, new THREE.CylinderGeometry(w / 2, w * 0.2, h * 0.5, 24, 1, true), glowMat(it.color), 0, h * 0.6, -d / 2 + w / 2); return g; }
  if (style === 'arm') {
    rod(g, new V3(0, h / 2, zb), new V3(0, h * 0.75, d / 2 - w / 2), 0.7, M);
    add(g, new THREE.CylinderGeometry(w * 0.25, w / 2, h * 0.35, 24, 1, true), glowMat(it.color), 0, h * 0.62, d / 2 - w / 2);
    return g;
  }
  B(g, 1.5, 1.5, d * 0.4, 0, h / 2, zb + d * 0.2, M);
  add(g, new THREE.SphereGeometry(Math.min(w, h) * 0.35, 24, 16), glowMat(it.color), 0, h / 2, d / 2 - Math.min(w, h) * 0.35);
  return g;
}


/* ---------- 衛浴設備 ---------- */
const CHROME = () => surfMat('metal', '#d6d9dc');
const dsMat = col => { const m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 0.8, side: THREE.DoubleSide }); m.userData.own = true; return m; };   // 雙面陶瓷（看得到內側）
const TOILET_OPTS = [{ key: 'style', label: '款式', list: [opt('floor', '單體式', { size: { w: 40, d: 70, h: 78 } }), opt('wall', '壁掛式（隱藏水箱）', { size: { w: 40, d: 75, h: 100 } })] }];
function buildToilet(it) {
  const g = new THREE.Group(), { w, d, h } = it, wall = it.style === 'wall', Cm = surfMat('ceramic', it.color), S = surfMat('ceramic', it.color2);
  const seatY = wall ? 42 : Math.min(42, h * 0.54), bd = d * (wall ? 0.7 : 0.62), bz = d / 2 - bd / 2, base0 = wall ? 20 : 0;
  if (!wall) { const p = C(g, 1, 0.8, seatY - 8, 0, (seatY - 8) / 2, bz - 2, Cm, 32); p.scale.set(w * 0.28, 1, bd * 0.32); }   // 底座
  const bowl = add(g, new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), Cm, 0, seatY - 1, bz); bowl.scale.set(w / 2, seatY - 1 - base0, bd / 2);   // 馬桶本體（下半球）
  const seat = add(g, new THREE.TorusGeometry(1, 0.1, 12, 40), S, 0, seatY + 0.6, bz); seat.rotation.x = Math.PI / 2; seat.scale.set(w / 2 * 0.9, bd / 2 * 0.9, 1.2);
  const lid = C(g, 1, 1, 1.4, 0, seatY + 2.4, bz, S, 40); lid.scale.set(w / 2 * 0.98, 1, bd / 2 * 0.98);
  if (wall) {                                                           // 隱藏水箱的矮牆與沖水面板
    const td = d - bd; RB(g, w, h, td, 1, 0, h / 2, -d / 2 + td / 2, surfMat('lacquer', '#ece8e1'));
    B(g, 22, 15, 1, 0, h * 0.78, -d / 2 + td + 0.5, CHROME());
  } else {
    const td = d * 0.3, th = h - seatY + 6; RB(g, w * 0.9, th, td, 3, 0, seatY - 6 + th / 2, -d / 2 + td / 2, Cm);
    RB(g, w * 0.55, seatY - 6, d - bd - td + 8, 3, 0, (seatY - 6) / 2, -d / 2 + td + (d - bd - td) / 2, Cm);
    C(g, 2.2, 2.2, 1, 0, h + 0.4, -d / 2 + td / 2, CHROME(), 20);
  }
  return g;
}
const TUB_OPTS = [{ key: 'style', label: '款式', list: [opt('built', '嵌入式'), opt('free', '獨立式')] }];
function buildBathtub(it) {
  const g = new THREE.Group(), { w, d, h } = it, Cm = surfMat('ceramic', it.color), M = surfMat('metal', it.color2);
  if (it.style === 'free') {                                            // 獨立式橢圓浴缸
    const D = dsMat(it.color);
    const o = add(g, new THREE.CylinderGeometry(1, 0.86, h - 4, 48, 1, true), D, 0, 4 + (h - 4) / 2, 0); o.scale.set(w / 2, 1, d / 2);
    const i = add(g, new THREE.CylinderGeometry(0.9, 0.72, h - 12, 48, 1, true), D, 0, 12 + (h - 12) / 2, 0); i.scale.set(w / 2, 1, d / 2);
    const rim = add(g, new THREE.RingGeometry(0.9, 1, 48), D, 0, h, 0); rim.rotation.x = -Math.PI / 2; rim.scale.set(w / 2, d / 2, 1);
    const bot = add(g, new THREE.CircleGeometry(0.72, 48), D, 0, 12, 0); bot.rotation.x = -Math.PI / 2; bot.scale.set(w / 2, d / 2, 1);
    const b0 = C(g, 1, 1, 4, 0, 2, 0, surfMat('ceramic', it.color), 40); b0.scale.set(w / 2 * 0.8, 1, d / 2 * 0.75);
    rod(g, new V3(w / 2 + 12, 0, 0), new V3(w / 2 + 12, h + 22, 0), 1.3, M);   // 落地龍頭
    rod(g, new V3(w / 2 + 12, h + 22, 0), new V3(w / 2 - 8, h + 18, 0), 1, M);
    return g;
  }
  const t = 8, fl = Math.max(6, h - 45);                                // 嵌入式：四面缸壁＋缸底
  RB(g, w, h, t, 1.5, 0, h / 2, d / 2 - t / 2, Cm); RB(g, w, h, t, 1.5, 0, h / 2, -d / 2 + t / 2, Cm);
  RB(g, t, h, d - 2 * t, 1.5, -w / 2 + t / 2, h / 2, 0, Cm); RB(g, t * 1.8, h, d - 2 * t, 1.5, w / 2 - t * 0.9, h / 2, 0, Cm);
  B(g, w - 2 * t, fl, d - 2 * t, 0, fl / 2, 0, Cm);
  C(g, 2.5, 2.5, 0.4, -w / 2 + t + 12, fl + 0.2, 0, M, 20);             // 排水孔
  rod(g, new V3(w / 2 - t * 0.9, h, 0), new V3(w / 2 - t * 0.9, h + 10, 0), 1.2, M);
  rod(g, new V3(w / 2 - t * 0.9, h + 10, 0), new V3(w / 2 - t * 1.8 - 6, h + 8, 0), 1, M);
  return g;
}
const SHOWER_OPTS = [{ key: 'style', label: '款式', list: [opt('corner', 'L 型轉角'), opt('line', '一字型'), opt('walkin', '半截玻璃（無門）')] }];
function buildShower(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'corner', M = surfMat('metal', it.color2);
  B(g, w, 4, d, 0, 2, 0, surfMat('ceramic', it.color));                 // 止水底盤
  C(g, 3, 3, 0.4, 0, 4.2, 0, M, 20);
  const gh = h - 6, y = 4 + gh / 2;
  const panel = (pw, x, z, along) => { glassPane(g, along ? pw : 1, gh, along ? 1 : pw, x, y, z); B(g, along ? pw : 1.6, 1.6, along ? 1.6 : pw, x, h - 1, z, M); B(g, along ? 1.6 : 1.6, gh, 1.6, along ? x + pw / 2 : x, y, along ? z : z + pw / 2, M); };
  if (style === 'walkin') panel(w * 0.6, -w * 0.2, d / 2 - 1, true);
  else {
    panel(w * 0.45, -w * 0.275, d / 2 - 1, true); panel(w * 0.55, w * 0.225, d / 2 + 0.5, true);   // 固定片＋拉門
    B(g, 1.2, 20, 2, w * 0.02, 100, d / 2 + 2.5, M);                      // 把手
    if (style === 'corner') panel(d, w / 2 - 1, 0, false);
  }
  const px = -w / 2 + 6, pz = -d / 2 + 5;                               // 淋浴柱＋頂噴
  rod(g, new V3(px, 90, pz), new V3(px, h - 12, pz), 1.1, M);
  rod(g, new V3(px, h - 12, pz), new V3(px + 25, h - 12, pz + 20), 0.9, M);
  C(g, 12, 12, 1.2, px + 25, h - 13, pz + 20, M, 32);
  B(g, 14, 6, 4, px + 4, 105, pz + 1, M);
  return g;
}
const BASIN_OPTS = [
  { key: 'style', label: '款式', list: [opt('float', '懸吊式'), opt('floor', '落地式')] },
  { key: 'sink', label: '臉盆', list: [opt('vessel', '檯上盆'), opt('under', '檯下盆')] },
];
function buildBasin(it) {
  const g = new THREE.Group(), { w, d, h } = it, body = surfMat('wood', it.color), top = surfMat('marble', it.color2), M = CHROME();
  const y0 = it.style === 'floor' ? 0 : Math.max(0, h - 50), ch = h - 3 - y0;
  if (it.style === 'floor') B(g, w - 4, 6, d - 6, 0, 3, -1, surfMat('lacquer', '#2b2b2b'));
  RB(g, w, ch - (it.style === 'floor' ? 6 : 0), d - 2, 1, 0, y0 + (it.style === 'floor' ? 6 : 0) + (ch - (it.style === 'floor' ? 6 : 0)) / 2, -1, body);
  B(g, 0.6, ch - 10, 0.5, 0, y0 + ch / 2, d / 2 - 1.8, surfMat('lacquer', '#2b2b2b'));   // 兩扇門的分縫
  B(g, w, 3, d, 0, h - 1.5, 0, top);                                    // 檯面
  const r = Math.min(w * 0.22, d * 0.4);
  if ((it.sink || 'vessel') === 'vessel') {
    const bowl = add(g, new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dsMat('#ffffff'), 0, h + 13, 3); bowl.scale.set(r, 13, r * 0.8);
  } else { const s2 = C(g, 1, 1, 0.3, 0, h + 0.05, 3, surfMat('ceramic', '#dfe3e6'), 32); s2.scale.set(r, 1, r * 0.75); }
  rod(g, new V3(0, h, -d / 2 + 6), new V3(0, h + 26, -d / 2 + 6), 1.2, M);   // 龍頭
  rod(g, new V3(0, h + 26, -d / 2 + 6), new V3(0, h + 24, -d / 2 + 16), 1, M);
  return g;
}
function buildMirrorCab(it) {
  const g = new THREE.Group(), { w, d, h } = it, body = surfMat('lacquer', it.color);
  RB(g, w, h, d, 1, 0, h / 2, 0, body);
  const n = w > 70 ? 2 : 1;
  for (let i = 0; i < n; i++) B(g, w / n - 1.5, h - 4, 0.6, -w / 2 + (w / n) * (i + 0.5), h / 2, d / 2 + 0.3, MIRROR);
  if (it.led !== 'none') B(g, w - 6, 0.8, 1, 0, 1, d / 2 - 2, glowMat('#fff4dc'));   // 下方間接燈
  return g;
}
const MCAB_OPTS = [{ key: 'led', label: '燈光', list: [opt('led', '下方 LED 燈'), opt('none', '無')] }];
function buildTowelRack(it) {
  const g = new THREE.Group(), { w, d, h } = it, M = surfMat('metal', it.color), T = surfMat('fabric', it.color2);
  for (const x of [-w / 2 + 2, w / 2 - 2]) { B(g, 3, 6, d, x, h - 6, 0, M); }
  const bar = C(g, 0.9, 0.9, w - 2, 0, h - 5, d / 2 - 2, M, 12); bar.rotation.z = Math.PI / 2;
  const bar2 = C(g, 0.9, 0.9, w - 2, 0, h - 5, -d / 2 + 3, M, 12); bar2.rotation.z = Math.PI / 2;
  RB(g, w * 0.55, h - 8, 1.6, 0.7, -w * 0.08, (h - 8) / 2 + 1, d / 2 - 0.4, T);   // 掛著的毛巾
  RB(g, w * 0.55, 10, 1.6, 0.7, -w * 0.08, h - 7, d / 2 - 3, T);
  return g;
}
function buildBathMat(it) { const g = new THREE.Group(); RB(g, it.w, Math.max(0.6, it.h), it.d, 0.5, 0, Math.max(0.6, it.h) / 2, 0, surfMat('fabric', it.color)); return g; }
function buildLaundry(it) {
  const g = new THREE.Group(), { w, d, h } = it, R = surfMat(it.basket === 'fabric' ? 'fabric' : 'rattan', it.color);
  const o = add(g, new THREE.CylinderGeometry(1, 0.85, h, 32, 1, true), R, 0, h / 2, 0); o.scale.set(w / 2, 1, d / 2); o.material = R.clone(); o.material.side = THREE.DoubleSide; o.material.userData.own = true;
  const b = C(g, 0.85, 0.85, 1, 0, 0.5, 0, R, 32); b.scale.set(w / 2, 1, d / 2);
  const tor = add(g, new THREE.TorusGeometry(1, 0.03, 8, 40), R, 0, h, 0); tor.rotation.x = Math.PI / 2; tor.scale.set(w / 2, d / 2, 30);
  const F = surfMat('fabric', it.color2);                                // 裡面的衣物
  for (const [x, z, s] of [[-0.25, 0.1, 0.45], [0.2, -0.15, 0.5], [0.05, 0.25, 0.4]]) { const m = add(g, new THREE.IcosahedronGeometry(1, 1), F, x * w, h - 8, z * d); m.scale.set(w * s * 0.5, 7, d * s * 0.5); }
  return g;
}
const LAUNDRY_OPTS = [{ key: 'basket', label: '材質', list: [opt('rattan', '藤編'), opt('fabric', '布質')] }];
function buildBathFan(it) {
  const g = new THREE.Group(), { w, d, h } = it, P = surfMat('lacquer', it.color);
  RB(g, w, h, d, 1, 0, h / 2, 0, P);
  for (let i = 0; i < 6; i++) B(g, w * 0.7, 0.4, 1.4, 0, 0.1, -d * 0.3 + i * d * 0.12, surfMat('lacquer', '#9aa0a6'));
  B(g, 6, 0.3, 3, w * 0.36, 0.1, d * 0.38, glowMat('#7fd1ff'));
  return g;
}

/* ---------- 餐具・鍋具・調味料 ---------- */
const handleRing = (g, r, x, y, z, m, rotY = 0) => { const t = add(g, new THREE.TorusGeometry(r, r * 0.22, 8, 20, Math.PI), m, x, y, z); t.rotation.set(0, rotY, 0); return t; };
const POT_OPTS = [{ key: 'style', label: '款式', list: [opt('steel', '不鏽鋼湯鍋'), opt('cast', '琺瑯鑄鐵鍋'), opt('clay', '砂鍋', { size: { w: 30, d: 26, h: 16 } }), opt('pressure', '壓力鍋', { size: { w: 38, d: 24, h: 24 } })] }];
function buildPot(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'steel';
  const Bd = style === 'steel' || style === 'pressure' ? surfMat('metal', it.color) : surfMat('ceramic', it.color), K = surfMat(style === 'steel' ? 'metal' : 'lacquer', it.color2);
  const r = Math.min(d / 2, (w - 8) / 2), bh = style === 'clay' ? h * 0.55 : h * 0.72;
  C(g, r, style === 'clay' ? r * 0.75 : r * 0.96, bh, 0, bh / 2, 0, Bd, 40);
  if (style === 'clay') add(g, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), Bd, 0, bh, 0).scale.y = (h - bh - 2) / r;
  else C(g, r * 1.02, r * 1.02, 1.2, 0, bh + 0.6, 0, style === 'steel' ? surfMat('glass', '#dfe9ec') : Bd, 40);   // 鍋蓋
  const top = style === 'clay' ? h - 2 : bh + 1.2;
  C(g, 2, 2.6, 2.2, 0, top + 1.1, 0, K, 16);                            // 蓋鈕
  if (style === 'pressure') { const hd = B(g, w / 2 - r + 4, 2.4, 4, r + (w / 2 - r) / 2, bh + 2, 0, K); B(g, 8, 2, 4, 0, bh + 2.5, 0, K); }
  else for (const sd of [-1, 1]) handleRing(g, 3, sd * (r + 1), bh * 0.8, 0, style === 'steel' ? Bd : K, sd > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}
const PAN_OPTS = [{ key: 'style', label: '款式', list: [opt('fry', '平底鍋'), opt('wok', '中式炒鍋', { size: { w: 55, d: 34, h: 12 } })] }];
function buildPan(it) {
  const g = new THREE.Group(), { w, d, h } = it, M = surfMat('metal', it.color), H = surfMat('lacquer', it.color2), r = d / 2;
  if (it.style === 'wok') {
    const WM = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.32, metalness: 0.75, side: THREE.DoubleSide }); WM.userData.own = true;
    const b = add(g, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), WM, 0, h, 0); b.scale.y = h / r;   // 下半球壓扁成鍋身
  } else {
    C(g, r, r * 0.9, h * 0.6, 0, h * 0.3, 0, M, 40);
    C(g, r * 0.92, r * 0.92, 0.3, 0, h * 0.6, 0, surfMat('lacquer', '#2b2b2b'), 40);   // 不沾塗層
  }
  const hl = w - d; const hd = B(g, hl, 2.2, 3, r + hl / 2, h * 0.55 + hl * 0.08, 0, H); hd.rotation.z = 0.16;   // 長柄
  return g;
}
const KETTLE_OPTS = [{ key: 'style', label: '款式', list: [opt('kettle', '煮水壺'), opt('teapot', '陶瓷茶壺')] }];
function buildKettle(it) {
  const g = new THREE.Group(), { w, d, h } = it, tea = it.style === 'teapot', Bd = surfMat(tea ? 'ceramic' : 'metal', it.color), H = surfMat(tea ? 'ceramic' : 'lacquer', it.color2);
  const r = Math.min(d / 2, w * 0.35);
  const body = add(g, new THREE.SphereGeometry(r, 32, 20), Bd, 0, r * (tea ? 0.8 : 0.9), 0); body.scale.y = tea ? 0.8 : 1.05;
  C(g, r * 0.55, r * 0.6, 1.5, 0, r * (tea ? 1.45 : 1.85), 0, Bd, 24); C(g, 1.2, 1.5, 1.6, 0, r * (tea ? 1.45 : 1.85) + 1.5, 0, H, 12);
  rod(g, new V3(r * 0.8, r * 0.6, 0), new V3(w / 2, r * (tea ? 1.3 : 1.6), 0), tea ? 1.2 : 1.4, Bd);   // 壺嘴
  const hd = add(g, new THREE.TorusGeometry(r * 0.55, 1, 8, 20, Math.PI * 1.1), H, -r * 0.95, r * (tea ? 0.85 : 1.1), 0); hd.rotation.z = Math.PI / 2;
  return g;
}
const PLATES_OPTS = [{ key: 'style', label: '款式', list: [opt('round', '圓盤組'), opt('square', '方盤組'), opt('bowls', '碗組', { size: { w: 24, d: 24, h: 14 } })] }];
function buildPlates(it) {
  const g = new THREE.Group(), { w, d, h } = it, P = surfMat('ceramic', it.color), R = surfMat('ceramic', it.color2), r = Math.min(w, d) / 2, style = it.style || 'round';
  if (style === 'bowls') {
    for (let i = 0; i < 3; i++) {
      const rr = r * (1 - i * 0.04), y = h * 0.55 + i * 2.4, m = dsMat(i % 2 ? it.color2 : it.color);
      const b = add(g, new THREE.SphereGeometry(rr, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m, 0, y, 0); b.scale.y = (h * 0.55) / r;
      const rim = add(g, new THREE.TorusGeometry(rr, 0.45, 8, 40), m, 0, y, 0); rim.rotation.x = Math.PI / 2;   // 碗口
    }
    return g;
  }
  const n = Math.max(3, Math.round(h / 1.6));
  for (let i = 0; i < n; i++) {
    const rr = r * (i === n - 1 ? 0.72 : 1);
    if (style === 'square') RB(g, rr * 2, 1.2, rr * 2, 0.5, 0, 0.6 + i * 1.5, 0, i % 3 === 2 ? R : P);
    else C(g, rr, rr * 0.82, 1.2, 0, 0.6 + i * 1.5, 0, i % 3 === 2 ? R : P, 40);
  }
  return g;
}
const CUPS_OPTS = [{ key: 'style', label: '款式', list: [opt('mug', '馬克杯'), opt('glass', '玻璃杯'), opt('coffee', '咖啡杯盤'), opt('wine', '紅酒杯', { size: { w: 22, d: 12, h: 22 } })] }];
function buildCups(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'mug', P = surfMat('ceramic', it.color), S = surfMat('ceramic', it.color2), Gl = surfMat('glass', '#eef6f8');
  const n = style === 'wine' ? 2 : style === 'coffee' ? 2 : 3, sp = w / n, r = Math.min(sp * 0.36, d * 0.36);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + sp * (i + 0.5);
    if (style === 'wine') {
      C(g, r * 0.8, r * 0.8, 0.4, x, 0.2, 0, Gl, 20); C(g, 0.4, 0.4, h * 0.45, x, h * 0.225, 0, Gl, 8);
      const b = add(g, new THREE.SphereGeometry(r, 20, 14, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), Gl, x, h * 0.7, 0); b.castShadow = false; b.rotation.x = Math.PI;
      const wn = add(g, new THREE.SphereGeometry(r * 0.9, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(it.color2, 0.3), x, h * 0.66, 0); wn.scale.y = 0.6;
    } else if (style === 'glass') { const c = C(g, r, r * 0.85, h * 0.8, x, h * 0.4, 0, Gl, 24); c.castShadow = false; }
    else {
      const ch = style === 'coffee' ? h * 0.45 : h * 0.8;
      if (style === 'coffee') C(g, r * 1.6, r * 1.4, 0.8, x, 0.4, 0, S, 32);
      C(g, r, r * 0.8, ch, x, (style === 'coffee' ? 0.8 : 0) + ch / 2, 0, i % 2 && style === 'mug' ? S : P, 28);
      handleRing(g, ch * 0.28, x + r, (style === 'coffee' ? 0.8 : 0) + ch * 0.55, 0, P, 0).rotation.z = -Math.PI / 2;
    }
  }
  return g;
}
const COND_OPTS = [{ key: 'style', label: '款式', list: [opt('grinder', '研磨罐組'), opt('bottles', '油醋醬油瓶'), opt('rack', '調味罐架', { size: { w: 30, d: 10, h: 16 } })] }];
function buildCondiments(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'grinder', W = surfMat('wood', it.color), Gl = surfMat('glass', '#e8f0f2');
  if (style === 'rack') {
    B(g, w, 1.2, d, 0, 0.6, 0, W); B(g, w, h * 0.35, 1.2, 0, h * 0.2, -d / 2 + 0.6, W);
    for (const sd of [-1, 1]) B(g, 1.2, h * 0.5, d, sd * (w / 2 - 0.6), h * 0.25, 0, W);
    const n = 4, sp = (w - 3) / n;
    for (let i = 0; i < n; i++) { const x = -w / 2 + 1.5 + sp * (i + 0.5); C(g, sp * 0.4, sp * 0.4, h * 0.75, x, 1.2 + h * 0.37, 0, Gl, 16).castShadow = false; C(g, sp * 0.36, sp * 0.36, h * 0.4, x, 1.2 + h * 0.2, 0, mat(['#c0392b', '#e8d3b0', '#5f7d63', '#2b2b2b'][i], 0.9), 16); C(g, sp * 0.42, sp * 0.42, 1.5, x, h * 0.85, 0, surfMat('metal', it.color2), 16); }
    return g;
  }
  if (style === 'bottles') {
    [['#c9a24a', 0.9], ['#5a2a1a', 0.8], ['#2b1d14', 0.7]].forEach(([c, k], i) => {
      const x = -w / 2 + w * (i + 0.5) / 3, r = Math.min(w / 7, d / 2.4), bh = h * k;
      C(g, r, r, bh * 0.65, x, bh * 0.33, 0, surfMat('glass', '#eef6f8'), 20).castShadow = false;
      C(g, r * 0.92, r * 0.92, bh * 0.5, x, bh * 0.26, 0, mat(c, 0.3), 20);
      C(g, r * 0.35, r * 0.9, bh * 0.25, x, bh * 0.78, 0, surfMat('glass', '#eef6f8'), 16); C(g, r * 0.38, r * 0.38, bh * 0.1, x, bh * 0.95, 0, surfMat('metal', it.color2), 12);
    });
    return g;
  }
  for (const [i, col] of [[0, it.color], [1, it.color2]]) {             // 鹽、胡椒研磨罐
    const x = (i ? 1 : -1) * w * 0.22, r = Math.min(w * 0.18, d / 2);
    C(g, r, r * 1.05, h * 0.45, x, h * 0.225, 0, surfMat('wood', col), 20);
    C(g, r * 0.8, r * 0.9, h * 0.35, x, h * 0.62, 0, surfMat('wood', col), 20);
    C(g, r * 0.3, r * 0.5, h * 0.12, x, h * 0.86, 0, surfMat('metal', '#b8bcc0'), 12);
  }
  return g;
}
function buildBoardKnife(it) {
  const g = new THREE.Group(), { w, d, h } = it, W = surfMat('wood', it.color), M = surfMat('metal', '#d6d9dc');
  RB(g, w * 0.82, Math.min(2.5, h * 0.5), d, 1, -w * 0.09, 1.25, 0, W);
  B(g, w * 0.12, 1.6, 4, w * 0.39, 0.8, 0, W);                          // 砧板把手
  B(g, w * 0.45, 0.3, 4.5, -w * 0.05, 2.7, d * 0.18, M);                 // 菜刀刀身
  RB(g, w * 0.2, 1.8, 2.2, 0.6, w * 0.3, 3.2, d * 0.18, surfMat('lacquer', it.color2));
  return g;
}
function buildFruitBowl(it) {
  const g = new THREE.Group(), { w, d, h } = it, r = Math.min(w, d) / 2, bh = h * 0.45;
  const b = add(g, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dsMat(it.color), 0, bh, 0); b.scale.y = bh / r;
  const fr = [['#f28c28', 4.2], ['#c0392b', 4], ['#9bc53d', 3.8], ['#f5d547', 4.4], ['#f28c28', 4], ['#c0392b', 3.8]];
  fr.forEach(([c, s], i) => { const a = i * 1.1; add(g, new THREE.SphereGeometry(s, 16, 12), mat(c, 0.5), Math.cos(a) * r * (i < 4 ? 0.45 : 0.1), bh * 0.6 + s + (i < 4 ? 0 : s * 1.4), Math.sin(a) * r * (i < 4 ? 0.45 : 0.1)); });
  const ban = add(g, new THREE.TorusGeometry(r * 0.4, 1.6, 8, 20, Math.PI * 0.7), mat('#f2d04a', 0.6), r * 0.1, bh + 4, 0); ban.rotation.x = -Math.PI / 2;
  return g;
}
function buildTeaSet(it) {
  const g = new THREE.Group(), { w, d, h } = it, P = surfMat('ceramic', it.color), T = surfMat('wood', it.color2);
  RB(g, w, 2, d, 0.8, 0, 1, 0, T);                                      // 茶盤
  const r = Math.min(d * 0.28, h * 0.4);
  const pot = add(g, new THREE.SphereGeometry(r, 28, 18), P, -w * 0.18, 2 + r * 0.8, 0); pot.scale.y = 0.8;
  C(g, r * 0.4, r * 0.45, 1.2, -w * 0.18, 2 + r * 1.45, 0, P, 16);
  rod(g, new V3(-w * 0.18 + r * 0.8, 2 + r * 0.6, 0), new V3(-w * 0.18 + r * 1.5, 2 + r * 1.2, 0), 0.9, P);
  const hd = add(g, new THREE.TorusGeometry(r * 0.45, 0.8, 8, 16, Math.PI), P, -w * 0.18 - r * 0.95, 2 + r * 0.9, 0); hd.rotation.z = Math.PI / 2;
  for (const [x, z] of [[w * 0.18, -d * 0.2], [w * 0.36, -d * 0.2], [w * 0.18, d * 0.2], [w * 0.36, d * 0.2]]) C(g, 2.6, 2, 3.5, x, 3.75, z, P, 18);
  return g;
}
function buildUtensils(it) {
  const g = new THREE.Group(), { w, d, h } = it, r = Math.min(w, d) / 2, ch = h * 0.45;
  C(g, r, r * 0.9, ch, 0, ch / 2, 0, surfMat('ceramic', it.color), 24);
  const Wd = surfMat('wood', it.color2), M = surfMat('metal', '#c9cdd1');
  [[-0.35, 0.1, 0.12, Wd, 'spat'], [0.3, -0.2, -0.1, M, 'ladle'], [0.05, 0.35, 0.05, Wd, 'spoon'], [-0.1, -0.35, -0.15, M, 'whisk']].forEach(([x, z, tilt, m, k]) => {
    const top = new V3(x * r * 2, h - 4, z * r * 2); rod(g, new V3(x * r, ch * 0.5, z * r), top, 0.5, m);
    if (k === 'spat') { const p = B(g, 3.5, 5, 0.4, top.x, top.y + 2, top.z, m); p.rotation.z = tilt; }
    else if (k === 'whisk') { const p = add(g, new THREE.SphereGeometry(2, 10, 8), M, top.x, top.y + 2, top.z); p.scale.y = 1.6; }
    else add(g, new THREE.SphereGeometry(k === 'ladle' ? 2.6 : 1.6, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m, top.x, top.y + 2.4, top.z);
  });
  return g;
}
/* ---------- 家電（新增） ---------- */
function buildDehumid(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color), M = surfMat('metal', it.color2);
  RB(g, w, h, d, 3, 0, h / 2, 0, Bd);
  for (let i = 0; i < 7; i++) B(g, w - 8, 0.5, 1.2, 0, h + 0.1, -d / 2 + 4 + i * (d - 8) / 6, M);
  B(g, w - 8, h * 0.35, 0.4, 0, h * 0.22, d / 2 + 0.1, surfMat('lacquer', '#dfe3e6'));   // 水箱
  B(g, 8, 2.5, 0.4, 0, h - 8, d / 2 + 0.1, glowMat('#7fd1ff'));
  return g;
}
function buildWaterHeater(it) {
  const g = new THREE.Group(), { w, d, h } = it, r = Math.min(w, d) / 2, Bd = surfMat('lacquer', it.color), M = CHROME();
  C(g, r, r, h, 0, h / 2, 0, Bd, 32);
  add(g, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), Bd, 0, h, 0).scale.y = 0.25;
  C(g, 5, 5, 1.2, 0, h * 0.55, r + 0.2, surfMat('metal', it.color2), 24).rotation.x = Math.PI / 2;
  for (const x of [-8, 8]) rod(g, new V3(x, 0, 0), new V3(x, -18, 0), 1.2, M);
  return g;
}
function buildOven(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color), M = surfMat('metal', it.color2);
  RB(g, w, h, d, 1.5, 0, h / 2, 0, Bd);
  B(g, w * 0.72, h * 0.62, 0.5, -w * 0.1, h * 0.46, d / 2 + 0.1, DARKGLASS());
  const hb = C(g, 0.8, 0.8, w * 0.6, -w * 0.1, h * 0.83, d / 2 + 2, M, 10); hb.rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) C(g, 1.8, 1.8, 1.5, w * 0.37, h * (0.25 + i * 0.25), d / 2 + 0.7, M, 16).rotation.x = Math.PI / 2;
  return g;
}
function buildDishwasher(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('metal', it.color), M = surfMat('metal', it.color2);
  RB(g, w, h, d, 1, 0, h / 2, 0, Bd);
  B(g, w - 2, 8, 0.6, 0, h - 5, d / 2 + 0.2, surfMat('lacquer', '#2b2b2b'));
  B(g, 5, 1, 0.3, w * 0.3, h - 5, d / 2 + 0.6, glowMat('#7fd1ff'));
  const hb = C(g, 0.9, 0.9, w * 0.7, 0, h - 14, d / 2 + 2.5, M, 10); hb.rotation.z = Math.PI / 2;
  B(g, w - 2, 9, 0.5, 0, 4.5, d / 2 - 2, surfMat('lacquer', '#2b2b2b'));
  return g;
}
function buildProjector(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color);
  RB(g, w, h, d, 2, 0, h / 2, 0, Bd);
  C(g, h * 0.35, h * 0.35, 2, -w * 0.22, h / 2, d / 2 + 1, surfMat('metal', it.color2), 24).rotation.x = Math.PI / 2;
  C(g, h * 0.26, h * 0.26, 0.4, -w * 0.22, h / 2, d / 2 + 2.1, DARKGLASS(), 24).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) B(g, 0.6, h * 0.5, 0.4, w * 0.1 + i * 2.2, h / 2, d / 2 + 0.1, surfMat('lacquer', '#555'));
  return g;
}
function buildSoundbar(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  RB(g, w, h, d, Math.min(h, d) / 2 - 0.3, 0, h / 2, 0, surfMat('lacquer', it.color));
  B(g, w - 4, h - 2, 0.4, 0, h / 2, d / 2 - 0.1, surfMat('fabric', it.color2));
  return g;
}
/* ---------- 擺飾（新增） ---------- */
function buildCandle(it) {
  const g = new THREE.Group(), { w, d, h } = it, r = Math.min(w, d) / 2;
  const jar = add(g, new THREE.CylinderGeometry(r, r, h, 32, 1, true), surfMat('glass', it.color2), 0, h / 2, 0); jar.castShadow = false;
  C(g, r * 0.93, r * 0.93, h * 0.65, 0, h * 0.33, 0, surfMat('ceramic', it.color), 32);
  C(g, 0.15, 0.15, 1.5, 0, h * 0.65 + 0.7, 0, mat('#2b2b2b', 0.9), 6);
  const f = add(g, new THREE.SphereGeometry(0.7, 12, 8), glowMat('#ffb347'), 0, h * 0.65 + 2.3, 0); f.scale.y = 1.8; f.castShadow = false;
  return g;
}
function buildDiffuser(it) {
  const g = new THREE.Group(), { w, d, h } = it, r = Math.min(w, d) / 2, bh = h * 0.35;
  const pts = [[0.001, 0], [1, 0.05], [1, 0.7], [0.45, 0.92], [0.3, 1]].map(([a, b]) => new THREE.Vector2(a * r, b * bh));
  const b = add(g, new THREE.LatheGeometry(pts, 32), surfMat('glass', it.color), 0, 0, 0); b.castShadow = false;
  C(g, r * 0.95, r * 0.95, bh * 0.45, 0, bh * 0.25, 0, surfMat('ceramic', it.color), 24);
  const Rd = mat(it.color2, 0.9);
  for (let k = 0; k < 7; k++) { const a = k * 0.9, t = 0.12 + (k % 3) * 0.05; rod(g, new V3(0, bh, 0), new V3(Math.cos(a) * h * t, h - (k % 2) * 3, Math.sin(a) * h * t), 0.25, Rd); }
  return g;
}
const FRAME_OPTS = [{ key: 'style', label: '款式', list: [opt('stand', '桌上立框'), opt('wall', '壁掛相框', { size: { w: 30, d: 3, h: 40 } })] }];
function buildPhotoFrame(it) {
  const g = new THREE.Group(), { w, d, h } = it, F = surfMat('wood', it.color), stand = (it.style || 'stand') === 'stand';
  const fr = new THREE.Group(); g.add(fr);
  RB(fr, w, h, 1.6, 0.4, 0, h / 2, 0, F);
  B(fr, w * 0.78, h * 0.78, 0.3, 0, h / 2, 0.85, surfMat('lacquer', '#f4f1ea'));
  B(fr, w * 0.6, h * 0.6, 0.3, 0, h / 2, 1.05, mat(it.color2, 0.6));
  if (stand) { fr.rotation.x = -0.18; fr.position.z = 0.5; B(g, 1.5, h * 0.8, 1, 0, h * 0.4, -d / 2 + 0.5, F).rotation.x = 0.35; }
  return g;
}
function buildTray(it) {
  const g = new THREE.Group(), { w, d, h } = it, T = surfMat(it.traymat || 'wood', it.color);
  RB(g, w, 1.2, d, 0.5, 0, 0.6, 0, T);
  for (const [x, z, ww, dd] of [[0, d / 2 - 0.6, w, 1.2], [0, -d / 2 + 0.6, w, 1.2], [w / 2 - 0.6, 0, 1.2, d], [-w / 2 + 0.6, 0, 1.2, d]]) B(g, ww, 3, dd, x, 1.5, z, T);
  const c = C(g, 3.5, 3.5, 7, -w * 0.28, 4.7, 0, surfMat('ceramic', '#f4f1ea'), 24);        // 小蠟燭
  const vs = add(g, new THREE.LatheGeometry([[0.4, 0], [1, 0.3], [0.8, 0.8], [0.35, 1]].map(([a, b]) => new THREE.Vector2(a * 3.5, b * (h - 1.2))), 24), surfMat('ceramic', it.color2), w * 0.05, 1.2, -d * 0.1);
  RB(g, w * 0.3, 3, d * 0.55, 0.3, w * 0.28, 2.7, 0, surfMat('lacquer', '#3d5a80'));        // 小書
  return g;
}
const TRAY_OPTS = [{ key: 'traymat', label: '材質', list: [opt('wood', '木頭'), opt('marble', '大理石'), opt('metal', '金屬')] }];
function buildTowelSet(it) {
  const g = new THREE.Group(), { w, d, h } = it, A = surfMat('fabric', it.color), Bt = surfMat('fabric', it.color2);
  const th = Math.min(6, h / 3);
  for (let i = 0; i < 3; i++) RB(g, w * 0.55, th - 0.3, d * 0.9, th / 2 - 0.3, -w * 0.2, th * i + th / 2, 0, i % 2 ? Bt : A);
  for (const z of [-d * 0.22, d * 0.22]) { const r = C(g, th * 0.8, th * 0.8, d * 0.4, w * 0.3, th * 0.8, z, Bt, 20); r.rotation.x = Math.PI / 2; }
  return g;
}
function buildSucculent(it) {
  const g = new THREE.Group(), { w, d, h } = it, r = Math.min(w, d) / 2, ph = h * 0.45;
  C(g, r, r * 0.8, ph, 0, ph / 2, 0, surfMat(it.potmat || 'ceramic', it.color), 24);
  C(g, r * 0.9, r * 0.9, 0.5, 0, ph - 0.3, 0, mat('#6b5a45', 0.95), 24);
  const L = mat(it.color2, 0.7);
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + ring * 0.4, rr = r * (0.75 - ring * 0.22), m = add(g, new THREE.SphereGeometry(1, 10, 8), L, Math.cos(a) * rr * 0.6, ph + 1 + ring * 1.6, Math.sin(a) * rr * 0.6);
    m.scale.set(rr * 0.35, 1.2 + ring * 0.4, rr * 0.18); m.rotation.y = -a; m.rotation.z = 0.5 - ring * 0.2;
  }
  return g;
}

/* ---------- 家電 ---------- */
const APPL = () => surfMat('lacquer', '#f4f4f2');
const DARKGLASS = () => surfMat('glass', '#1b1f24');
const WASHER_OPTS = [{ key: 'style', label: '款式', list: [opt('front', '滾筒式'), opt('top', '直立式')] }];
function buildWasher(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color), M = surfMat('metal', it.color2);
  RB(g, w, h, d, 2, 0, h / 2, 0, Bd);
  if ((it.style || 'front') === 'top') {
    B(g, w - 6, 1, d * 0.6, 0, h + 0.3, 2, DARKGLASS());
    B(g, w - 4, 8, 3, 0, h + 3, -d / 2 + 3, Bd);
    return g;
  }
  B(g, w - 4, 10, 0.5, 0, h - 7, d / 2 + 0.1, M);
  const r = Math.min(w, h) * 0.3, y = h * 0.42;
  const t = add(g, new THREE.TorusGeometry(r, 2.2, 12, 40), M, 0, y, d / 2 + 0.8);
  const gl = C(g, r, r, 0.6, 0, y, d / 2 + 0.5, DARKGLASS(), 40); gl.rotation.x = Math.PI / 2;
  return g;
}
function buildAircon(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  RB(g, w, h, d, 4, 0, h / 2, 0, surfMat('lacquer', it.color));
  B(g, w - 8, 2, 1, 0, 5, d / 2 - 0.3, surfMat('metal', '#3b3f45'));
  B(g, 8, 1, 0.3, w / 2 - 10, h - 6, d / 2 + 0.05, glowMat('#7fd1ff'));
  return g;
}
function buildFan(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color), r = Math.min(w, d) / 2;
  C(g, r * 0.7, r * 0.75, 3, 0, 1.5, 0, Bd, 32);
  C(g, 1.5, 1.5, h - r * 1.1, 0, (h - r * 1.1) / 2, 0, Bd, 12);
  const cy = h - r * 0.95;
  C(g, 5, 5, 10, 0, cy, -4, Bd, 20).rotation.x = Math.PI / 2;
  const guard = add(g, new THREE.TorusGeometry(r * 0.9, 0.6, 8, 48), Bd, 0, cy, 3);
  for (let k = 0; k < 5; k++) { const bl = B(g, 5, r * 0.8, 0.4, 0, cy, 2, surfMat('glass', it.color2)); bl.rotation.z = k * Math.PI * 2 / 5; bl.geometry.translate(0, r * 0.4, 0); bl.position.y = cy; }
  return g;
}
function buildCeilingFan(it) {
  const g = new THREE.Group(), { w, d, h } = it, M = surfMat('metal', it.color2), Bl = surfMat('wood', it.color), r = Math.min(w, d) / 2;
  C(g, 6, 6, 2, 0, h - 1, 0, M, 20);
  C(g, 1.2, 1.2, h - 14, 0, 14 + (h - 14) / 2, 0, M, 10);
  C(g, 9, 9, 10, 0, 9, 0, M, 24);
  add(g, new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glowMat('#fff4d6'), 0, 4, 0);
  for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5, bl = B(g, r - 8, 0.8, 13, Math.cos(a) * (r / 2 + 4), 9, Math.sin(a) * (r / 2 + 4), Bl); bl.rotation.y = -a; }
  return g;
}
function buildPurifier(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  RB(g, w, h, d, 5, 0, h / 2, 0, surfMat('lacquer', it.color));
  B(g, w - 6, 0.5, d - 6, 0, h + 0.1, 0, surfMat('metal', it.color2));
  B(g, w * 0.3, 1.5, 0.3, 0, h - 10, d / 2 + 0.05, glowMat('#7fd1ff'));
  return g;
}
function buildMicrowave(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color);
  RB(g, w, h, d, 1.5, 0, h / 2, 0, Bd);
  B(g, w * 0.68, h - 6, 0.5, -w * 0.13, h / 2, d / 2 + 0.1, DARKGLASS());
  B(g, w * 0.2, h - 6, 0.5, w * 0.37, h / 2, d / 2 + 0.1, surfMat('metal', it.color2));
  return g;
}
function buildRiceCooker(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('lacquer', it.color), M = surfMat('metal', '#b8bcc0'), r = Math.min(w, d) / 2;
  C(g, r, r * 0.9, h * 0.7, 0, h * 0.35, 0, Bd, 32);
  add(g, new THREE.SphereGeometry(r * 0.95, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M, 0, h * 0.7, 0).scale.y = (h * 0.3) / (r * 0.95);
  for (const sd of [-1, 1]) B(g, 3, 2, 6, sd * r, h * 0.62, 0, surfMat('metal', it.color2));
  return g;
}
function buildCoffeeMaker(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat('metal', it.color), blk = surfMat('lacquer', it.color2);
  RB(g, w, h, d * 0.55, 2, 0, h / 2, -d * 0.22, Bd);
  B(g, w, 4, d, 0, 2, 0, blk);
  B(g, w, h * 0.2, d, 0, h - h * 0.1, 0, Bd);
  C(g, 1.5, 1.5, 4, 0, h * 0.72, d * 0.15, blk, 10);
  C(g, 3.5, 3, 7, 0, 7.5, d * 0.15, surfMat('ceramic', '#ffffff'), 20);
  return g;
}
function buildSpeaker(it) {
  const g = new THREE.Group(), { w, d, h } = it, Bd = surfMat(it.style === 'wood' ? 'wood' : 'lacquer', it.color), K = surfMat('metal', it.color2);
  RB(g, w, h - 4, d, 1.5, 0, 4 + (h - 4) / 2, 0, Bd);
  legs4(g, w, d, 4, 3, 2, K, true);
  for (const [f, rr] of [[0.82, 0.18], [0.6, 0.32], [0.3, 0.32]]) { const c = C(g, w * rr, w * rr, 1, 0, 4 + (h - 4) * f, d / 2 + 0.1, K, 32); c.rotation.x = Math.PI / 2; }
  return g;
}
const SPEAKER_OPTS = [{ key: 'style', label: '箱體材質', list: [opt('lacquer', '烤漆'), opt('wood', '木頭')] }];
function buildRobot(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  C(g, .5, .5, h - 1, 0, 1 + (h - 1) / 2, 0, surfMat('lacquer', it.color), 40).scale.set(w, 1, d);
  C(g, 3.5, 3.5, 1.5, 0, h + 0.5, -d * 0.15, surfMat('metal', it.color2), 20);
  return g;
}

/* ---------- 配件 ---------- */
const STAND_OPTS = [{ key: 'style', label: '款式', list: [opt('tier', '階梯花架'), opt('tall', '高腳花架', { size: { w: 30, d: 30, h: 80 } }), opt('ladder', '梯形花架', { size: { w: 70, d: 40, h: 110 } })] }, { key: 'legmat', label: '材質', list: LEGMATS }];
function buildPlantStand(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'tier', M = legMat(it), P = surfMat('ceramic', it.color);
  const pot = (x, y, z) => { const r = 8; C(g, r, r * 0.8, 13, x, y + 6.5, z, P, 20); add(g, new THREE.IcosahedronGeometry(10, 1), mat('#5f7d63', 0.85), x, y + 20, z); };
  if (style === 'tall') {
    for (const [x, z] of [[-w / 2 + 2, -d / 2 + 2], [w / 2 - 2, -d / 2 + 2], [-w / 2 + 2, d / 2 - 2], [w / 2 - 2, d / 2 - 2]]) B(g, 2, h, 2, x, h / 2, z, M);
    B(g, w, 2, d, 0, h - 1, 0, M); B(g, w - 2, 1.5, d - 2, 0, h * 0.3, 0, M);
    pot(0, h, 0); return g;
  }
  if (style === 'ladder') {
    const a = Math.atan2(d, h), L = Math.hypot(d, h);
    for (const sd of [-1, 1]) { const r = B(g, 3, L, 3, sd * (w / 2 - 1.5), h / 2, 0, M); r.rotation.x = -a; }
    for (let i = 0; i < 3; i++) { const y = h * (0.2 + i * 0.3), zr = d / 2 - d * y / h, dep = zr + d / 2; B(g, w - 4, 2, dep, 0, y, (-d / 2 + zr) / 2, M); pot(0, y + 1, (-d / 2 + zr) / 2); }
    return g;
  }
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const y = h * (i + 1) / steps, sd = d / steps, z = d / 2 - sd * (i + .5);
    B(g, w, 2, sd - 2, 0, y - 1, z, M);
    for (const sx of [-1, 1]) B(g, 2.5, y, 2.5, sx * (w / 2 - 1.5), y / 2, z + sd / 2 - 2, M);
    pot(-w * 0.25, y, z); pot(w * 0.25, y, z);
  }
  return g;
}
const PEDESTAL_OPTS = [{ key: 'style', label: '形狀', list: [opt('round', '圓柱'), opt('square', '方柱')] }, { key: 'pmat', label: '材質', list: [opt('marble', '大理石'), opt('slate', '岩板'), opt('cement', '水泥'), opt('wood', '木頭'), opt('lacquer', '烤漆')] }];
function buildPedestal(it) {
  const g = new THREE.Group(), { w, d, h } = it, M = surfMat(it.pmat || 'marble', it.color);
  if ((it.style || 'round') === 'square') { B(g, w, 3, d, 0, 1.5, 0, M); B(g, w * 0.85, h - 6, d * 0.85, 0, h / 2, 0, M); B(g, w, 3, d, 0, h - 1.5, 0, M); }
  else { C(g, .5, .5, 3, 0, 1.5, 0, M, 40).scale.set(w, 1, d); C(g, .5, .5, h - 6, 0, h / 2, 0, M, 40).scale.set(w * 0.8, 1, d * 0.8); C(g, .5, .5, 3, 0, h - 1.5, 0, M, 40).scale.set(w, 1, d); }
  return g;
}
function buildCoatRack(it) {
  const g = new THREE.Group(), { w, d, h } = it, M = legMat(it), r = Math.min(w, d) / 2;
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; rod(g, new V3(0, h * 0.25, 0), new V3(Math.cos(a) * r, 0, Math.sin(a) * r), 1.2, M); }
  C(g, 1.6, 1.6, h, 0, h / 2, 0, M, 12);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; rod(g, new V3(0, h - 12, 0), new V3(Math.cos(a) * 12, h - 4, Math.sin(a) * 12), 0.7, M); }
  add(g, new THREE.SphereGeometry(2.2, 12, 10), M, 0, h, 0);
  return g;
}
const SCREEN_OPTS = [{ key: 'style', label: '款式', list: [opt('wood', '木格屏風'), opt('fabric', '布面屏風'), opt('rattan', '藤編屏風')] }];
function buildScreen(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'wood', F = surfMat('wood', it.color2);
  const n = Math.max(2, Math.round(w / 45)), pw = w / n;
  const infill = style === 'fabric' ? surfMat('fabric', it.color) : style === 'rattan' ? surfMat('rattan', it.color) : null;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Group(), x = -w / 2 + pw * (i + .5);
    B(p, 3, h - 2, 3, -pw / 2 + 1.5, (h - 2) / 2 + 2, 0, F); B(p, 3, h - 2, 3, pw / 2 - 1.5, (h - 2) / 2 + 2, 0, F);
    B(p, pw, 3, 3, 0, h - 1.5, 0, F); B(p, pw, 3, 3, 0, 8, 0, F);
    if (infill) B(p, pw - 6, h - 14, 0.6, 0, (h - 14) / 2 + 9.5, 0, infill);
    else for (let k = 1; k < 5; k++) { B(p, pw - 6, 1.5, 1.5, 0, 8 + (h - 10) * k / 5, 0, F); B(p, 1.5, h - 12, 1.5, -pw / 2 + pw * k / 5, (h - 12) / 2 + 9, 0, F); }
    p.position.set(x, 0, (i % 2 ? 1 : -1) * Math.max(0, d / 2 - 2));
    p.rotation.y = (i % 2 ? -1 : 1) * 0.25;
    g.add(p);
  }
  return g;
}
const MIRROR_OPTS = [{ key: 'style', label: '款式', list: [opt('rect', '方形立鏡'), opt('arch', '拱形立鏡'), opt('round', '圓鏡', { size: { w: 80, d: 4, h: 80 } })] }];
function buildFloorMirror(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'rect', F = surfMat('metal', it.color);
  if (style === 'round') { const f = C(g, w / 2, w / 2, d, 0, h / 2, 0, F, 48); f.rotation.x = Math.PI / 2; const m = C(g, w / 2 - 2.5, w / 2 - 2.5, 0.4, 0, h / 2, d / 2 + 0.1, MIRROR, 48); m.rotation.x = Math.PI / 2; return g; }
  const bh = style === 'arch' ? h - w / 2 : h;
  B(g, w, bh, d, 0, bh / 2, 0, F); B(g, w - 5, bh - 2.5, 0.4, 0, bh / 2 + 1.25, d / 2 + 0.1, MIRROR);
  if (style === 'arch') {
    const top = C(g, w / 2, w / 2, d, 0, bh, 0, F, 48); top.rotation.x = Math.PI / 2;
    const mt = C(g, w / 2 - 2.5, w / 2 - 2.5, 0.4, 0, bh, d / 2 + 0.1, MIRROR, 48); mt.rotation.x = Math.PI / 2;
  }
  return g;
}

/* ---------- 擺飾 ---------- */
function artTex(style, c1, c2) {
  const key = 'art|' + style + '|' + c1 + '|' + c2;
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f3efe8'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = c1; x.beginPath(); x.arc(96, 150, 70, 0, Math.PI * 2); x.fill();
  x.fillStyle = c2; x.fillRect(140, 40, 70, 150);
  x.strokeStyle = '#2b2b2b'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 220); x.bezierCurveTo(90, 160, 160, 250, 236, 190); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return TEX[key] = t;
}
const ART_OPTS = [{ key: 'style', label: '款式', list: [opt('single', '單幅'), opt('triptych', '三聯幅', { size: { w: 150, d: 3, h: 60 } }), opt('round', '圓形', { size: { w: 60, d: 3, h: 60 } })] }];
function buildWallArt(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'single', F = surfMat('wood', it.color3 || '#2b2b2b');
  const canvasMat = new THREE.MeshStandardMaterial({ map: artTex(style, it.color, it.color2), roughness: 0.9 }); canvasMat.userData.own = true;
  const panel = (x, pw) => { B(g, pw, h, d, x, h / 2, 0, F); add(g, new THREE.PlaneGeometry(pw - 4, h - 4), canvasMat, x, h / 2, d / 2 + 0.05); };
  if (style === 'round') { const f = C(g, w / 2, w / 2, d, 0, h / 2, 0, F, 48); f.rotation.x = Math.PI / 2; const cv = add(g, new THREE.CircleGeometry(w / 2 - 2, 48), canvasMat, 0, h / 2, d / 2 + 0.05); }
  else if (style === 'triptych') { const pw = (w - 8) / 3; for (let i = 0; i < 3; i++) panel(-w / 2 + pw / 2 + i * (pw + 4), pw); }
  else panel(0, w);
  return g;
}
const SCULPT_OPTS = [{ key: 'style', label: '款式', list: [opt('knot', '抽象雕塑'), opt('stack', '疊石擺件'), opt('ring', '圓環雕塑')] }, { key: 'smat', label: '材質', list: [opt('ceramic', '陶瓷'), opt('metal', '金屬'), opt('marble', '大理石'), opt('wood', '木頭')] }];
function buildSculpture(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'knot', M = surfMat(it.smat || 'ceramic', it.color), Bs = surfMat('marble', it.color2);
  const r = Math.min(w, d) / 2;
  B(g, w * 0.7, 3, d * 0.7, 0, 1.5, 0, Bs);
  if (style === 'stack') { let y = 3; for (const s of [1, 0.8, 0.6, 0.42]) { const sr = r * s, m = add(g, new THREE.SphereGeometry(sr, 24, 16), M, (s - 0.7) * 3, y + sr * 0.55, 0); m.scale.y = 0.55; y += sr * 1.05; } return g; }
  if (style === 'ring') { const t = add(g, new THREE.TorusGeometry(Math.min(r, (h - 3) / 2) * 0.8, Math.min(r, h) * 0.12, 20, 64), M, 0, 3 + (h - 3) / 2, 0); return g; }
  const k = add(g, new THREE.TorusKnotGeometry(Math.min(r, (h - 3) / 2) * 0.55, Math.min(r, h) * 0.12, 120, 16), M, 0, 3 + (h - 3) / 2, 0);
  k.scale.y = (h - 3) / (Math.min(r, (h - 3) / 2) * 2.2);
  return g;
}
const VASE_OPTS = [{ key: 'style', label: '款式', list: [opt('flowers', '花束'), opt('branches', '枝條'), opt('empty', '花瓶')] }];
function buildVase(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'flowers', r = Math.min(w, d) / 2;
  const vh = style === 'empty' ? h : h * 0.45, V = surfMat('ceramic', it.color);
  const pts = [[0.5, 0], [1, 0.2], [0.95, 0.55], [0.45, 0.85], [0.55, 1]].map(([a, b]) => new THREE.Vector2(a * r, b * vh));
  add(g, new THREE.LatheGeometry(pts, 32), new THREE.MeshPhysicalMaterial({ color: it.color, roughness: 0.28, clearcoat: 0.8, side: THREE.DoubleSide }), 0, 0, 0).material.userData.own = true;
  if (style === 'empty') return g;
  const Stem = mat('#5f7d63', 0.85), Fl = mat(it.color2, 0.8);
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9, top = new V3(Math.cos(a) * r * 1.2 * (k % 3) / 2, h - (k % 3) * h * 0.08, Math.sin(a) * r * (k % 3) / 2);
    rod(g, new V3(0, vh * 0.8, 0), top, 0.35, style === 'branches' ? mat('#6b4f3a', 0.9) : Stem);
    if (style === 'flowers') add(g, new THREE.IcosahedronGeometry(Math.min(4, r * 0.5), 1), Fl, top.x, top.y, top.z);
    else for (let j = 0; j < 3; j++) add(g, new THREE.SphereGeometry(1.1, 8, 6), Fl, top.x * (0.6 + j * 0.15), vh + (top.y - vh) * (0.6 + j * 0.15), top.z * (0.6 + j * 0.15));
  }
  return g;
}
const TABLEWARE_OPTS = [{ key: 'style', label: '款式', list: [opt('western', '西式餐具'), opt('chinese', '中式碗筷')] }];
function buildTableware(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'western';
  const P = surfMat('ceramic', it.color), M = surfMat('metal', it.color2), Gl = surfMat('glass', '#eef6f8');
  const r = Math.min(w * 0.3, d * 0.42);
  C(g, r, r * 0.85, 1.4, 0, 0.7, 0, P, 40);
  if (style === 'chinese') {
    add(g, new THREE.SphereGeometry(r * 0.55, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P, 0, 1.4 + r * 0.5, 0).material = P;
    for (const sx of [0.5, 0.7]) B(g, 0.6, 0.6, d * 0.8, r + 4 + sx * 2, 1.8, 0, surfMat('wood', '#5a3a28'));
    C(g, 3.5, 3.2, 6, -r - 6, 3, -d * 0.2, P, 20);
    return g;
  }
  C(g, r * 0.62, r * 0.55, 1.2, 0, 2, 0, P, 32);
  B(g, 1, 0.4, d * 0.7, -r - 3, 0.6, 0, M); B(g, 1.2, 0.4, d * 0.7, r + 3, 0.6, 0, M); B(g, 1.2, 0.4, d * 0.6, r + 5.5, 0.6, 0, M);
  C(g, 3.2, 2.4, Math.min(h, 16), r + 6, Math.min(h, 16) / 2, -d / 2 + 5, Gl, 20).castShadow = false;
  return g;
}
function buildClock(it) {
  const g = new THREE.Group(), { w, d, h } = it, F = surfMat('metal', it.color2), r = Math.min(w, h) / 2;
  const f = C(g, r, r, d, 0, h / 2, 0, F, 48); f.rotation.x = Math.PI / 2;
  const face = C(g, r - 2, r - 2, 0.4, 0, h / 2, d / 2 + 0.1, surfMat('lacquer', it.color), 48); face.rotation.x = Math.PI / 2;
  const hand = (len, ang, t) => { const m = B(g, t, len, 0.3, 0, h / 2, d / 2 + 0.5, mat('#222222', 0.5)); m.geometry.translate(0, len / 2, 0); m.position.y = h / 2; m.rotation.z = ang; };
  hand(r * 0.5, -1.0, 1.2); hand(r * 0.75, 2.3, 0.8);
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; B(g, 0.6, k % 3 ? 1.5 : 3, 0.3, Math.sin(a) * (r - 5), h / 2 + Math.cos(a) * (r - 5), d / 2 + 0.4, mat('#222222', 0.5)).rotation.z = -a; }
  return g;
}
/* ---------- 自家商品：丹麥餐桌（薄陶板圓角桌面＋內縮木框＋錐形實木腳） ---------- */
function buildDanishTable(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const T = topMat(it), L = surfMat('wood', it.color2), pad = mat('#3b3632', 0.8);
  const tt = 1, apH = 6, sT = Math.min(6.5, w * 0.08, d * 0.12), cr = Math.min(2.6, sT * 0.42);
  // 圓角桌面：用圓角矩形擠出，並把貼圖座標換算成 0～1
  const sh = new THREE.Shape(), x0 = -w / 2, y0 = -d / 2;
  sh.moveTo(x0 + cr, y0); sh.lineTo(x0 + w - cr, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + cr);
  sh.lineTo(x0 + w, y0 + d - cr); sh.quadraticCurveTo(x0 + w, y0 + d, x0 + w - cr, y0 + d);
  sh.lineTo(x0 + cr, y0 + d); sh.quadraticCurveTo(x0, y0 + d, x0, y0 + d - cr);
  sh.lineTo(x0, y0 + cr); sh.quadraticCurveTo(x0, y0, x0 + cr, y0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: tt, bevelEnabled: false, curveSegments: 8 });
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, (uv.getY(i) + d / 2) / d);
  const top = add(g, geo, T, 0, h - tt, 0); top.rotation.x = -Math.PI / 2;
  // 木框：外緣和桌面邊緣、桌腳平齊，兩端接在桌腳上段的方塊之間（看得到接縫）
  const yA = h - tt - apH, ay = yA + apH / 2;
  for (const s of [-1, 1]) {
    B(g, w - 2 * sT, apH, 2.4, 0, ay, s * (d / 2 - 1.2 - 0.12), L);
    B(g, 2.4, apH, d - 2 * sT, s * (w / 2 - 1.2 - 0.12), ay, 0, L);
  }
  // 實木腳：上段是和木框等高的圓角方塊，往下內側以弧線收窄，再一路收細到接近圓形；外側兩面是直的、和桌面平齊
  const fil = Math.min(7, yA * 0.12), sB = sT * 0.5, sM = sT * 0.74, ys = [0.6];
  for (let y = 8; y < yA - fil - 1; y += 9) ys.push(y);
  for (let i = 0; i <= 8; i++) ys.push(yA - fil + fil * i / 8);
  ys.push(h - tt);
  const M = 32, pos = [], uvs = [], idx = [];
  ys.forEach((y, j) => {
    const lin = sB + (sM - sB) * Math.min(1, y / yA), t = Math.max(0, Math.min(1, (y - (yA - fil)) / fil));
    const sz = y >= yA ? sT : lin + (sT - lin) * (1 - Math.sqrt(1 - t * t)), k = Math.min(1, y / yA), r = Math.min(sz / 2, cr + (sz * 0.46 - cr) * (1 - k) * (1 - k));
    for (let i = 0; i <= M; i++) {
      const q = Math.min(3, Math.floor(i / (M / 4))) , a = (i / M) * Math.PI * 2, cx = [1, -1, -1, 1][q] * (sz / 2 - r), cz = [1, 1, -1, -1][q] * (sz / 2 - r);
      pos.push(sz / 2 + cx + Math.cos(a) * r, y, sz / 2 + cz + Math.sin(a) * r); uvs.push(i / M * 0.35, y / 70);
    }
    if (j) for (let i = 0; i < M; i++) { const p0 = (j - 1) * (M + 1) + i, p1 = j * (M + 1) + i; idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); }
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); lg.setIndex(idx); lg.computeVertexNormals();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, lg, L, sx * w / 2, 0, sz * d / 2).scale.set(-sx, 1, -sz);
    C(g, sB * 0.42, sB * 0.42, 0.6, sx * (w / 2 - sB / 2), 0.3, sz * (d / 2 - sB / 2), pad, 12);
  }
  return g;
}
/* ---------- 自家商品：鉛筆腳餐桌（薄陶板圓角桌面＋黑色鐵框＋錐形鉛筆腳與三角補強片） ---------- */
function roundedTop(g, w, d, tt, y, m, cr) {
  const sh = new THREE.Shape(), x0 = -w / 2, y0 = -d / 2;
  sh.moveTo(x0 + cr, y0); sh.lineTo(x0 + w - cr, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + cr);
  sh.lineTo(x0 + w, y0 + d - cr); sh.quadraticCurveTo(x0 + w, y0 + d, x0 + w - cr, y0 + d);
  sh.lineTo(x0 + cr, y0 + d); sh.quadraticCurveTo(x0, y0 + d, x0, y0 + d - cr);
  sh.lineTo(x0, y0 + cr); sh.quadraticCurveTo(x0, y0, x0 + cr, y0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: tt, bevelEnabled: false, curveSegments: 8 });
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, (uv.getY(i) + d / 2) / d);
  const mesh = add(g, geo, m, 0, y, 0); mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
function buildPencilTable(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const T = topMat(it), M = surfMat('metal', it.color2), pad = mat('#1a1a1a', 0.8);
  const tt = 0.7, st = 2, cr = Math.min(3, w * 0.04, d * 0.04);
  roundedTop(g, w, d, tt, h - tt, T, cr);
  roundedTop(g, w - 0.6, d - 0.6, st, h - tt - st, M, cr); // 薄陶板下面的黑色底板
  // 鉛筆腳：粗圓腳、頂端是平的，比桌面底下低一點；往下收細。靠桌角、比桌緣略內縮
  const y0 = h - tt - st, r = Math.min(2.8, w * 0.03), lx = w / 2 - r - 1.6, lz = d / 2 - r - 1.6, top = y0 - 2.4;
  // 鐵框：長邊對著桌腳中心，兩端由補強片接到桌腳；短邊在補強片後面
  const fh = 5, fy = y0 - fh / 2, bl = Math.min(10, w * 0.08), fx = lx - bl + 0.75;
  for (const s of [-1, 1]) { B(g, 2 * fx, fh, 1.5, 0, fy, s * lz, M); B(g, 1.5, fh, 2 * lz, s * fx, fy, 0, M); }
  // 補強片：一片厚鐵板，上緣貼桌底、靠桌腳那端往下斜到腳頂；下緣由鐵框底斜斜收到桌腳上
  const tri = new THREE.Shape(), bd = Math.min(17, h * 0.23);
  tri.moveTo(r - 0.4, top - y0 + 0.3); tri.lineTo(r + 2.4, 0); tri.lineTo(bl, 0); tri.lineTo(bl, -fh); tri.lineTo(bl - 1.2, -fh); tri.lineTo(r - 0.4, -bd); tri.lineTo(r - 0.4, top - y0 + 0.3);
  const tg = new THREE.ExtrudeGeometry(tri, { depth: 1.7, bevelEnabled: false }); tg.translate(0, 0, -0.85);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    C(g, r, 1.35, top - 0.8, sx * lx, 0.8 + (top - 0.8) / 2, sz * lz, M, 28);
    C(g, 1.1, 1.1, 0.8, sx * lx, 0.4, sz * lz, pad, 12);
    add(g, tg, M, sx * lx, y0, sz * lz).scale.x = -sx;
  }
  return g;
}
/* ---------- 自家商品：V型餐椅（一體成型合成皮座椅＋外斜圓木腳，後腳往上交會成倒 V） ---------- */
function buildVChair(it) { // 依正面、背面、側面照：一體成型曲面皮面座椅＋外斜木腳，後腳在椅背上段交會成倒 V
  const g = new THREE.Group(), { w, d, h } = it;
  const S = fabMat(it), L = surfMat('wood', it.color2), pad = mat('#2b2b2b', 0.8);
  const seatH = Math.min(45, h * 0.54), tilt = 0.26, sz0 = -d / 2 + 13;
  // 側面輪廓中心線（z, y）：前緣 → 微凹坐面 → 大弧轉角 → 後傾椅背
  const topZ = sz0 - 1.5 - Math.sin(tilt) * (h - seatH - 12);
  const path = new THREE.SplineCurve([
    new THREE.Vector2(d / 2 - 2.5, seatH - 2.2), new THREE.Vector2(d / 2 - 12, seatH - 3.3), new THREE.Vector2(0, seatH - 3.9),
    new THREE.Vector2(sz0 + 9, seatH - 3.2), new THREE.Vector2(sz0 + 2.5, seatH + 1.5), new THREE.Vector2(sz0 - 1.5, seatH + 12),
    new THREE.Vector2(topZ, h - 2.6),
  ]).getSpacedPoints(90);
  const N = path.length, up = [], lo = [];
  const thick = u => 6.2 - 1.8 * u;                         // 前緣較厚、往椅背漸薄
  const tan = i => { const a = path[Math.max(0, i - 1)], b = path[Math.min(N - 1, i + 1)]; return new THREE.Vector2(b.x - a.x, b.y - a.y).normalize(); };
  for (let i = 0; i < N; i++) {
    const t = tan(i), n = new THREE.Vector2(-t.y, t.x), hw = thick(i / (N - 1)) / 2;
    up.push(path[i].clone().addScaledVector(n, -hw)); lo.push(path[i].clone().addScaledVector(n, hw));
  }
  const cap = (i, dirSign) => { // 兩端半圓收邊
    const t = tan(i).multiplyScalar(dirSign), n = new THREE.Vector2(-tan(i).y, tan(i).x), hw = thick(i / (N - 1)) / 2, out = [];
    for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8; out.push(path[i].clone().addScaledVector(n, -Math.cos(a) * hw).addScaledVector(t, Math.sin(a) * hw)); }
    return out;
  };
  const outline = [...up, ...cap(N - 1, 1), ...lo.reverse(), ...cap(0, -1).reverse()];
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(-p.x, p.y)));
  const shellGeo = new THREE.ExtrudeGeometry(shape, { depth: w - 4, bevelEnabled: true, bevelThickness: 2, bevelSize: 1.6, bevelSegments: 5, curveSegments: 4 });
  const shell = add(g, shellGeo, S, -w / 2 + 2, 0, 0); shell.rotation.y = Math.PI / 2;
  // 後腳：由地面往後斜上，交會在椅背上段背後成倒 V
  const ay = seatH + (h - seatH) * 0.72, k = (ay - (seatH + 12)) / (h - 2.6 - (seatH + 12));
  const backZ = (sz0 - 1.5) + (topZ - (sz0 - 1.5)) * k;
  const apex = new V3(0, ay, backZ - 2.5 - 2);
  const footX = w / 2 - 2.5, footZ = -d / 2 + 1.5;
  // 座下木框：後橫木只在兩支後腳之間，兩側木框斜接到前腳（依背面照）
  const fy = seatH - 9.5, zfr = d / 2 - 9, fxr = w / 2 - 6;
  const t = (fy - 0.8) / (ay - 0.8), rx = footX * (1 - t) - 1.2, rz = footZ + (apex.z - footZ) * t;
  const beam = (x1, z1, x2, z2) => { const len = Math.hypot(x2 - x1, z2 - z1), m = B(g, 2.5, 4.5, len, (x1 + x2) / 2, fy, (z1 + z2) / 2, L); m.rotation.y = Math.atan2(x2 - x1, z2 - z1); };
  B(g, 2 * rx, 4.5, 2.5, 0, fy, rz, L);
  B(g, 2 * fxr, 4.5, 2.5, 0, fy, zfr, L);
  for (const s of [-1, 1]) beam(s * rx, rz, s * fxr, zfr);
  // 前腳：由座框往前、往外斜到地面
  for (const s of [-1, 1]) {
    rod(g, new V3(s * fxr, fy + 2, zfr), new V3(s * (w / 2 - 2.5), 0.8, d / 2 - 1.5), 1.9, L);
    C(g, 1.5, 1.5, 0.8, s * (w / 2 - 2.5), 0.4, d / 2 - 1.5, pad, 12);
  }
  for (const s of [-1, 1]) {
    rod(g, new V3(s * (w / 2 - 2.5), 0.8, -d / 2 + 1.5), apex, 1.9, L);
    C(g, 1.5, 1.5, 0.8, s * (w / 2 - 2.5), 0.4, -d / 2 + 1.5, pad, 12);
  }
  add(g, new THREE.SphereGeometry(2.7, 16, 12), L, apex.x, apex.y, apex.z);
  return g;
}
/* ---------- 自家商品：宮崎餐椅（依正面、側面、背面照） ---------- */
// 木座框＋直立前腳；後腳是一支直木件，由地面往前上方斜伸，頂端接往後伸的扶手，扶手末端撐住後傾的弧形皮面靠背
function buildDollChair(it) { // 娃娃餐椅：一體成型的皮革椅殼——坐墊厚、前緣圓，兩側從坐面往後一路包上去變成椅背，椅背在腰的位置內縮、往上又放寬，整圈邊緣一條滾邊；內側（坐面＋椅背正面）和外側（椅底＋椅背背面）各一色。椅背正面腰部一道橫車線，背面正中一道直縫線加拉鍊；黑色金屬錐形腳微微外張，接在座下的方框上
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), F2 = fabMat(it, 'color2'), M = surfMat('metal', it.color3 || '#1e1e20'), Gl = mat('#8d8d8d', 0.6), Zp = mat('#141414', 0.7);
  const sx = w / 48.6, sy = h / 83.65, sz = d / 48.65;
  // 從坐墊前緣（0）沿著椅殼到椅背頂（1）的十三個斷面：內側中線 z,y｜邊緣 x,y,z｜外側中線 z,y｜內、外側橫向的飽滿程度
  const ST = [
    [22.6, 37.0, 17.0, 37.0, 22.6, 22.6, 37.0, 6, 8],
    [24.3, 41.0, 21.2, 37.1, 21.2, 21.8, 35.6, 6, 8],
    [23.2, 44.6, 22.8, 37.5, 17.0, 18.0, 35.0, 6, 8],
    [17.0, 45.5, 22.9, 38.6, 9.0, 10.0, 34.9, 6, 8],
    [5.0, 45.0, 23.0, 41.0, 0.0, 0.0, 34.9, 5, 8],
    [-6.0, 44.8, 23.4, 45.6, -7.5, -10.0, 35.0, 3.5, 8],
    [-12.5, 46.0, 23.2, 50.5, -12.0, -17.5, 35.4, 2.6, 7],
    [-15.6, 50.5, 21.8, 56.0, -13.6, -20.6, 37.8, 2.4, 5],
    [-17.2, 58.5, 20.3, 60.5, -14.6, -21.5, 50.0, 2.4, 3],
    [-19.0, 68.0, 22.3, 66.5, -16.6, -22.6, 62.0, 2.4, 3],
    [-20.6, 76.5, 23.6, 75.0, -19.4, -23.6, 72.5, 2.4, 3],
    [-21.4, 80.6, 23.7, 79.6, -20.8, -24.1, 79.6, 2.6, 3],
    [-22.1, 82.4, 22.6, 82.0, -21.5, -23.9, 82.1, 2.8, 3],
    [-22.6, 82.95, 19.0, 82.95, -22.1, -22.6, 82.95, 3, 3],
  ], NS = ST.length - 1;
  const cur = fn => new THREE.CatmullRomCurve3(ST.map(fn), false, 'centripetal');
  const cC = cur(q => new V3(0, q[1], q[0])), cE = cur(q => new V3(q[2], q[3], q[4])), cO = cur(q => new V3(0, q[6], q[5]));
  const lin = (t, k) => { const f = t * NS, i = Math.min(NS - 1, Math.floor(f)); return ST[i][k] + (ST[i + 1][k] - ST[i][k]) * (f - i); };
  const gs = (a, s) => Math.exp(-((a / s) ** 2));
  const shell = (out, nu, nt) => { const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nt; j++) { const t = j / nt, e = cE.getPoint(t), c = (out ? cO : cC).getPoint(t), n = lin(t, out ? 8 : 7);
      for (let i = 0; i <= nu; i++) { const u = i / nu * 2 - 1, f = 1 - Math.pow(Math.abs(u), n); let y = e.y + (c.y - e.y) * f, z = e.z + (c.z - e.z) * f, x = e.x * u;
        if (!out) { const q = Math.min(1, Math.max(0, (5.5 - t * NS) / 2)); x += Math.sign(u) * 2.4 * Math.min(1, t * NS) * q * q * (3 - 2 * q) * 4 * f * (1 - f); }   // 坐墊兩側比滾邊再鼓出來一點
        if (!out) { const k = 1 - u ** 4, a = gs(t - 8 / NS, 0.007), b = gs(t - (6.1 - 1.1 * u * u) / NS, 0.007), lum = t * NS > 6.1 && t * NS < 8 ? Math.sin(Math.PI * (t * NS - 6.1) / 1.9) : 0, up = t * NS > 8 ? Math.sin(Math.PI * Math.min(1, (t * NS - 8) / 3.6)) : 0;
          z += k * (0.7 * lum + 0.5 * up - 0.7 * a - 0.45 * b); y -= k * 0.55 * b;
          const pb = Math.min(1, Math.max(0, (t * NS - 6.5) / 1.5)); z += 1.8 * pb * pb * (3 - 2 * pb) * Math.sqrt(Math.min(1, (NS - t * NS) / 0.6)) * (1 - Math.pow(Math.abs(u), 12)); }   // 椅背的泡棉：邊緣一進來就鼓起，比滾邊厚一截                      // 腰部橫車線、坐面後緣的 U 形車線，車線之間的皮面微微鼓起
        pos.push(x * sx, y * sy, z * sz); uv.push(e.x * u / 40, t * 3); } }
    for (let j = 0; j < nt; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e2 = c + 1; out ? idx.push(a, c, b, b, c, e2) : idx.push(a, b, c, b, e2, c); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo; };
  add(g, shell(false, 40, 220), F, 0, 0, 0);
  add(g, shell(true, 32, 120), F2, 0, 0, 0);
  // 滾邊：沿著整圈邊緣
  const loop = [], ep = (t, sd) => { const e = cE.getPoint(t); return new V3(sd * e.x * sx, e.y * sy, e.z * sz); };
  for (let i = 0; i <= 90; i++) loop.push(ep(i / 90, 1));
  for (let i = 90; i >= 0; i--) loop.push(ep(i / 90, -1));
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 360, 0.45, 8, true), F2, 0, 0, 0);
  // 背面正中的縫線與拉鍊
  const spine = (t0, t1, r, m, off) => { const pts = []; for (let i = 0; i <= 30; i++) { const c = cO.getPoint((t0 + (t1 - t0) * i / 30) / NS); pts.push(new V3(0, c.y * sy, (c.z - off) * sz)); } add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, r, 6, false), m, 0, 0, 0); };
  spine(6.7, 12.9, 0.14, F2, 0.02); spine(7.25, 10.7, 0.14, Zp, 0.06);
  // 座下方框與四支錐形腳：上粗下細，離地一小段再收細一階，腳底塑膠墊
  const fy = 33.8 * sy, fx = 16.2 * sx, zf = 15.5 * sz, zb = -13.5 * sz, bx = 15.4 * sx;
  B(g, 2 * fx, 1.6, 2.2, 0, fy, zf, M); B(g, 2 * bx, 1.6, 2.2, 0, fy, zb, M);
  for (const sd of [-1, 1]) { const m = B(g, 2.2, 1.6, Math.hypot(zf - zb, fx - bx), sd * (fx + bx) / 2, fy, (zf + zb) / 2, M); m.rotation.y = sd * Math.atan2(fx - bx, zf - zb); }
  B(g, 2 * bx - 2, 1.2, zf - zb, 0, fy + 1.1, (zf + zb) / 2, Zp);                                       // 椅殼底下的底板
  const leg = (a, b) => { const dir = new V3().subVectors(b, a), len = dir.length(), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize()), k = Math.min(0.3, 9 / len), mid = a.clone().addScaledVector(dir, k);
    const seg = (p0, p1, r0, r1, m) => { const c = add(g, new THREE.CylinderGeometry(r1, r0, p0.distanceTo(p1), 16), m, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); c.quaternion.copy(q); };
    seg(a.clone().addScaledVector(dir, 0.6 / len), mid, 0.82, 0.98, M); seg(mid, b, 1.2, 1.6, M); seg(a, a.clone().addScaledVector(dir, 0.6 / len), 0.7, 0.7, Gl); };
  for (const sd of [-1, 1]) { leg(new V3(sd * 18 * sx, 0.25, 19.3 * sz), new V3(sd * fx, fy + 0.6, zf)); leg(new V3(sd * 17.4 * sx, 0.25, -21.3 * sz), new V3(sd * bx, fy + 0.6, zb)); }
  return g;
}
function buildCY127Chair(it) { // CY127 餐椅：厚坐墊（前寬後窄、後緣圓，側邊一圈車線）＋一片往前包的椅背殼。椅背正面是內側皮革，上窄下寬，兩側往前收成尖尖的翼尖；翼尖以下往內勾回去，變成兩支細頸接到坐墊後角，中間留一個拱形的鏤空。背面與側緣是外側皮革，一路往下包住坐墊後角。椅背正中一道雙車線；金屬腳前後外張
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), F2 = fabMat(it, 'color2'), M = surfMat('metal', it.color3 || '#1c1c1e'), Gl = mat('#2a2a2a', 0.7), Zp = mat('#161616', 0.8);
  const sx = w / 43.7, sy = h / 84.25, sz = d / 56.05, sm = q => { q = Math.min(1, Math.max(0, q)); return q * q * (3 - 2 * q); };
  const mesh = (pos, uv, idx, m) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return add(g, geo, m, 0, 0, 0); };
  // 坐墊：外框（前寬後窄、後緣圓）往內縮出側面的輪廓
  const ZC = 3.77, NA = 96, ring = a => { const c = Math.cos(a), s = Math.sin(a), n = s > 0 ? 7 : 3, zr = Math.sign(s) * Math.pow(Math.abs(s), 2 / n); return [22.5 * Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (1 - 0.07 * (1 - zr)), ZC + 24.25 * zr]; };
  { const prof = [[2.6, 37], [0.7, 37.5], [0.1, 38.8], [0, 42.5], [0.28, 42.85], [0, 43.2], [0.3, 44.3], [1.2, 44.95], [3.5, 45.3], [9, 45.5]], pos = [], uv = [], idx = [];
    prof.forEach(([ins, y]) => { for (let i = 0; i < NA; i++) { const q = ring(i / NA * Math.PI * 2), x = q[0] * (1 - ins / 22.5), z = ZC + (q[1] - ZC) * (1 - ins / 24.25); pos.push(x * sx, y * sy, z * sz); uv.push(x / 40, z / 40); } });
    for (let k = 0; k < prof.length - 1; k++) for (let i = 0; i < NA; i++) { const a = k * NA + i, b = k * NA + (i + 1) % NA; idx.push(a, a + NA, b, b, a + NA, b + NA); }
    const c0 = pos.length / 3; pos.push(0, 45.55 * sy, ZC * sz, 0, 37 * sy, ZC * sz); uv.push(0, ZC / 40, 0, ZC / 40);
    for (let i = 0; i < NA; i++) { idx.push((prof.length - 1) * NA + i, c0, (prof.length - 1) * NA + (i + 1) % NA); idx.push(i, (i + 1) % NA, c0 + 1); }
    mesh(pos, uv, idx, F); }
  const rear = []; for (let i = 0; i <= 120; i++) rear.push(ring(Math.PI * 1.5 + i / 120 * Math.PI / 2));
  const seatRear = x => { x = Math.min(18, Math.abs(x)); let i = 1; while (i < 120 && rear[i][0] < x) i++; const a = rear[i - 1], b = rear[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0] || 1); };
  // 椅背殼：每個 x 位置從下緣到上緣；平面上是往前彎的拋物線，最彎的地方在翼尖的高度
  const XT = 21, YT = 57, top = x => 82.6 + 1.5 * (x / 16) ** 2;
  const yTop = x => { const a = top(x), b = YT + (XT - x) / 5 * (84.1 - YT); return -1.2 * Math.log(Math.exp(-a / 1.2) + Math.exp(-b / 1.2)); };
  const hook = x => 45 + 12 * Math.pow(Math.max(0, x - 16) / 5, 1.6);
  const yBotIn = x => x < 12 ? 45 + 7 * Math.pow(1 - Math.pow(x / 12, 2.5), 0.5) : hook(x);
  const yBotOut = x => x < 11.5 ? yBotIn(x) : x < 18 ? 38.3 : hook(x);
  const zS = (x, y) => { const wv = sm((y - 45) / 9), t = Math.max(0, (y - 45) / 39.5), k = y > YT ? 0.036 - 0.015 * (y - YT) / 27.5 : 0.036; return (seatRear(x) - 0.4) * (1 - wv) + (seatRear(0) - 0.7 - 6.4 * Math.pow(t, 1.15) + k * x * x) * wv; };
  const xs = []; for (let i = 0; i <= 84; i++) xs.push((i / 84 * 2 - 1) * XT); for (const sd of [-1, 1]) for (const q of [11.49, 11.51, 12.01, 17.99, 18.01]) xs.push(sd * q); xs.sort((a, b) => a - b);   // 下緣有落差的地方多切兩刀，邊才會直
  const NX = xs.length - 1, NY = 40, pIn = [], pOut = [];
  for (let i = 0; i <= NX; i++) { const x = xs[i], ax = Math.abs(x), yt = yTop(ax); pIn.push([]); pOut.push([]);
    for (let j = 0; j <= NY; j++) { const v = j / NY;
      for (const out of [0, 1]) { const yb = out ? yBotOut(ax) : yBotIn(ax), y = yb + (yt - yb) * v, de = Math.min(Math.min(v, 1 - v) * (yt - yb), (XT - ax) * 1.2), pl = 1 - (1 - Math.min(1, de / 2.2)) ** 2;
        (out ? pOut : pIn)[i].push(out ? [x * 1.04, y, zS(x * 1.04, y) - 0.5 - 0.6 * pl] : [x, y, zS(x, y) + 0.5 + 2 * pl]); } } }
  const sheet = (P, front, m) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= NX; i++) for (let j = 0; j <= NY; j++) { const q = P[i][j]; pos.push(q[0] * sx, q[1] * sy, q[2] * sz); uv.push(q[0] / 40, q[1] / 40); }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) { const a = i * (NY + 1) + j, b = a + NY + 1; front ? idx.push(a, b, a + 1, a + 1, b, b + 1) : idx.push(a, a + 1, b, a + 1, b + 1, b); }
    return mesh(pos, uv, idx, m); };
  sheet(pIn, true, F); sheet(pOut, false, F2);
  // 側緣：把正面和背面的邊接起來（外側皮革），正面邊緣再壓一條細滾邊
  const per = []; for (let i = 0; i <= NX; i++) per.push([i, 0]); for (let i = NX - 1; i > 0; i--) per.push([i, NY]);
  for (const fl of [0, 1]) { const pos = [], uv = [], idx = []; per.forEach(([i, j], k) => { for (const q of [pIn[i][j], pOut[i][j]]) { pos.push(q[0] * sx, q[1] * sy, q[2] * sz); uv.push(k / 40, 0); } });
    for (let k = 0; k < per.length; k++) { const a = 2 * k, b = 2 * ((k + 1) % per.length); fl ? idx.push(a, b, a + 1, a + 1, b, b + 1) : idx.push(a, a + 1, b, a + 1, b + 1, b); }
    mesh(pos, uv, idx, F2); }
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(per.map(([i, j]) => { const q = pIn[i][j]; return new V3(q[0] * sx, q[1] * sy, (q[2] - 0.1) * sz); }), true, 'centripetal'), 420, 0.3, 6, true), F2, 0, 0, 0);
  // 椅背正中的雙車線
  const St = mat('#' + new THREE.Color(it.color).multiplyScalar(0.8).getHexString(), 0.8);
  for (const sd of [-1, 1]) { const pts = []; for (let k = 0; k <= 24; k++) { const y = 52.6 + (yTop(0) - 0.6 - 52.6) * k / 24; pts.push(new V3(sd * 0.5 * sx, y * sy, (zS(0.5, y) + 2.52) * sz)); } add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.1, 5, false), St, 0, 0, 0); }
  // 座下底板、連桿與四支外張的金屬腳（扁圓管，上粗下細）
  const fy = 36.6 * sy, T = [[14.2 * sx, 18 * sz], [12.7 * sx, -9 * sz]], Ft = [[20 * sx, 26.4 * sz], [19.6 * sx, -26.6 * sz]];
  B(g, 30 * sx, 0.8, 31 * sz, 0, fy + 0.5, 4.5 * sz, Zp);
  for (const [tx, tz] of T) B(g, 2 * tx, 1.6, 2, 0, fy - 0.6, tz, M);
  for (const sd of [-1, 1]) { const m = B(g, 2, 1.6, Math.hypot(T[0][1] - T[1][1], T[0][0] - T[1][0]), sd * (T[0][0] + T[1][0]) / 2, fy - 0.6, (T[0][1] + T[1][1]) / 2, M); m.rotation.y = sd * Math.atan2(T[0][0] - T[1][0], T[0][1] - T[1][1]);
    T.forEach(([tx, tz], k) => { const a = new V3(sd * Ft[k][0], 0.9, Ft[k][1]), b = new V3(sd * tx, fy, tz), dir = new V3().subVectors(b, a), lg = new THREE.CylinderGeometry(2.3, 1.3, dir.length(), 14);
      lg.scale(0.78, 1, 1); lg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize())); lg.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); add(g, lg, M, 0, 0, 0); C(g, 0.8, 0.8, 0.9, a.x, 0.45, a.z, Gl, 10); }); }
  return g;
}
function buildMiyazakiChair(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const S = fabMat(it), L = surfMat('wood', it.color2), pad = mat('#2b2b2b', 0.8);
  const seatH = Math.min(46, h * 0.62), fh = 7, ft = 2.4;
  const fx = w / 2 - 3, zf = d / 2 - 3, zb = -d / 2 + 16;           // 座框前後位置
  const fy = seatH - 3 - fh / 2;
  // 座框
  B(g, 2 * fx, fh, ft, 0, fy, zf, L); B(g, 2 * fx, fh, ft, 0, fy, zb, L);
  for (const s of [-1, 1]) B(g, ft, fh, zf - zb, s * fx, fy, (zf + zb) / 2, L);
  // 皮面坐墊（中間微凹，嵌在座框上）
  RB(g, 2 * fx - 1, 5, zf - zb + 1, 2.2, 0, seatH - 1.5, (zf + zb) / 2, S);
  // 前腳：直立、上粗下細，頂端與座框齊平並有圓形端面
  for (const s of [-1, 1]) {
    C(g, 2.3, 1.6, seatH - 3.8, s * fx, 0.8 + (seatH - 3.8) / 2, zf, L, 20);
    C(g, 1.4, 1.4, 0.8, s * fx, 0.4, zf, pad, 12);
  }
  // 後腳：直木件，地面（後）→ 往前上方到扶手前端
  const armY = Math.min(h - 13, 61), foot = -d / 2 + 8, top = -d / 2 + 25;
  // 弧形靠背參數（先算好，扶手末端要收在椅背後緣）
  const bw = 2 * fx + 5, bh = Math.min(26, h - armY + 12), bt2 = 5, cr = bh * 0.46, Rb = 42, tilt = 0.32;
  const cy = h - bh / 2 * Math.cos(tilt) - 0.5, cz = -d / 2 + 3 + Math.sin(tilt) * bh / 2 + 1.5;
  const bendZ = Rb * (1 - Math.cos(fx / Rb));                                  // 椅背在扶手位置向前彎的量
  const backRear = cz + bendZ - Math.sin(tilt) * (armY + 1 - cy) - bt2 / 2;  // 扶手高度處的椅背後緣
  const armEnd = backRear + 0.8;
  for (const s of [-1, 1]) {
    const x = s * fx;
    rod(g, new V3(x, 0.8, foot), new V3(x, armY, top), 2, L);
    C(g, 1.4, 1.4, 0.8, x, 0.4, foot, pad, 12);
    // 扶手：由後腳頂端往後伸，末端加寬貼住椅背側邊，不超出椅背
    const armLen = top - armEnd;
    RB(g, 4, 3.4, armLen, 1.4, x, armY + 1, (top + armEnd) / 2, L);
    RB(g, 5, 5, 4, 1.6, x, armY + 0.8, armEnd + 2, L);
  }
  const bg = new THREE.BoxGeometry(bw, bh, bt2, 64, 8, 1), bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const ex = Math.abs(x) - (bw / 2 - cr);
    if (ex > 0) { const k = Math.sqrt(Math.max(0, 1 - (ex / cr) ** 2)); y *= k; z *= 0.55 + 0.45 * k; }
    const a = x / Rb;
    bp.setXYZ(i, Rb * Math.sin(a), y, z + Rb * (1 - Math.cos(a)));
  }
  bg.computeVertexNormals();
  const bk = add(g, bg, S, 0, cy, cz); bk.rotation.x = -tilt;
  return g;
}
/* ---------- 自家商品：丹麥長凳（與丹麥餐桌同系列：木框＋上粗下細方腳，上放合成皮坐墊） ---------- */
function buildDanishBench(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const S = fabMat(it), L = surfMat('wood', it.color2), pad = mat('#3b3632', 0.8);
  const ct = Math.min(6, h * 0.14), ap = 7, frameTop = h - ct, fy = frameTop - ap / 2;
  const lt = 4.4, lb = 3;                                   // 腳頂、腳底寬度
  // 合成皮坐墊
  RB(g, w, ct, d, 1.6, 0, h - ct / 2, 0, S);
  // 木框：外緣與桌腳切齊
  for (const s of [-1, 1]) {
    B(g, w - 2 * lt, ap, 2, 0, fy, s * (d / 2 - 1), L);
    B(g, 2, ap, d - 2 * lt, s * (w / 2 - 1), fy, 0, L);
  }
  // 上粗下細的方腳（外側垂直、內側收細）
  const legH = frameTop - 0.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = add(g, new THREE.CylinderGeometry(lt / Math.SQRT2, lb / Math.SQRT2, legH, 4), L, 0, 0, 0);
    leg.rotation.y = Math.PI / 4;
    leg.position.set(sx * (w / 2 - lt / 2), 0.6 + legH / 2, sz * (d / 2 - lt / 2));
    C(g, 1.3, 1.3, 0.6, sx * (w / 2 - lt / 2), 0.3, sz * (d / 2 - lt / 2), pad, 12);
  }
  return g;
}
/* ---------- 自家商品：橢圓陶板邊几（跑道形陶板桌面＋C 字型扁鐵立柱＋同形金屬底板） ---------- */
function buildTawuNight(it) { // 塔烏床頭櫃：圓形陶板桌面坐在黑色的底板上；兩片直立的實木側板（邊緣倒圓）夾著一個無把手抽屜，抽屜上方是開放的置物格
  const g = new THREE.Group(), { w, d, h } = it;
  const T = topMat(it), Wd = surfMat('wood', it.color2), Tr = mat(it.color3 || '#1b1b1c', 0.45, 0.35), Dk = mat('#0e0e0e', 0.9), Gl = mat('#161616', 0.6);
  const tt = Math.min(1, h * 0.03), trH = Math.min(2.4, h * 0.05), cr = Math.min(w, d) / 2 - 0.01;
  roundedTop(g, w, d, tt, h - tt, T, cr);                                  // 陶板桌面
  roundedTop(g, w - 0.5, d - 0.5, 0.45, h - tt - 0.45, Tr, cr - 0.25);     // 底板上緣：和陶板之間一道細溝
  { const c = C(g, 0.5, 0.455, trH, 0, h - tt - 0.45 - trH / 2, 0, Tr, 64); c.scale.set(w - 1.6, 1, d - 1.6); }   // 底板：往下收小的淺盤
  // 側板：左右各一片，前後緣倒圓，底下各兩顆調整腳
  const top = h - tt - 0.45 - trH, gl = 0.8, pt = Math.min(2.6, w * 0.055), px = w * 0.34, pd = d * 0.66;
  for (const sd of [-1, 1]) {
    RB(g, pt, top - gl, pd, 1.1, sd * (px - pt / 2), gl + (top - gl) / 2, 0, Wd);
    for (const z of [-1, 1]) C(g, 1.1, 1.1, gl, sd * (px - pt / 2), gl / 2, z * (pd / 2 - 3.2), Gl, 14);
  }
  // 抽屜櫃：夾在兩片側板中間；櫃頂是置物格的底，正面一整片無把手的抽屜面板（四周留細縫）
  const iw = 2 * (px - pt), by0 = h * 0.365, by1 = h * 0.61, bh = by1 - by0, bd = pd - 1.6;
  B(g, iw, bh, bd - 1.6, 0, by0 + bh / 2, -0.8, Wd);
  B(g, iw, 1.4, bd, 0, by1 - 0.7, 0, Wd);
  B(g, iw - 0.3, bh - 1.6, 0.6, 0, by0 + (bh - 1.4) / 2, bd / 2 - 1.5, Dk);
  RB(g, iw - 0.7, bh - 1.9, 1.5, 0.25, 0, by0 + (bh - 1.4) / 2, bd / 2 - 0.75, Wd);
  return g;
}
function buildLacquerNight(it) { // 烤漆床頭櫃：圓角的烤漆櫃身，檯面一圈凸起的邊框、陶板內嵌在裡面；正面整片是抽屜面板，往兩側繞過前面的圓角（側面、邊框上各一道接縫）；底下是深色實木腳架，四支往下收細的腳
  const g = new THREE.Group(), { w, d, h } = it;
  const T = topMat(it), L = surfMat('lacquer', it.color2), Wd = surfMat('wood', it.color3 || '#3b302b'), Dk = mat('#141414', 0.9);
  const baseH = h * 0.43, railH = Math.min(3.2, baseH * 0.2), gap = 0.9, by0 = baseH, bh = h - by0, rimH = Math.min(0.9, bh * 0.05), rimW = Math.min(2.6, w * 0.05), cr = Math.min(3.2, w * 0.07, d * 0.07);
  const rr = (sh, W, D, r) => { const x0 = -W / 2, y0 = -D / 2; sh.moveTo(x0 + r, y0); sh.lineTo(x0 + W - r, y0); sh.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + r); sh.lineTo(x0 + W, y0 + D - r); sh.quadraticCurveTo(x0 + W, y0 + D, x0 + W - r, y0 + D); sh.lineTo(x0 + r, y0 + D); sh.quadraticCurveTo(x0, y0 + D, x0, y0 + D - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0); return sh; };
  // 櫃身、檯面邊框、內嵌的陶板
  roundedTop(g, w, d, bh - rimH, by0, L, cr);
  { const sh = rr(new THREE.Shape(), w, d, cr); sh.holes.push(rr(new THREE.Path(), w - 2 * rimW, d - 2 * rimW, Math.max(0.6, cr - rimW * 0.6)));
    add(g, new THREE.ExtrudeGeometry(sh, { depth: rimH, bevelEnabled: false, curveSegments: 8 }), L, 0, h - rimH, 0).rotation.x = -Math.PI / 2; }
  roundedTop(g, w - 2 * rimW - 0.5, d - 2 * rimW - 0.5, 0.45, h - rimH - 0.02, T, Math.max(0.5, cr - rimW * 0.6));
  // 抽屜面板的接縫：兩側各一道直縫（面板繞過前面的圓角）、邊框上各一個缺口、底下一道橫縫
  const sz = d / 2 - Math.min(7, d * 0.15);
  for (const sd of [-1, 1]) { B(g, 0.12, bh - 0.6, 0.32, sd * (w / 2 - 0.03), by0 + bh / 2, sz, Dk); B(g, rimW + 0.1, rimH + 0.06, 0.4, sd * (w / 2 - rimW / 2), h - rimH / 2, sz, Dk); }
  // 腳架：櫃身和腳架之間內縮一圈陰影縫；橫桿在腳的上端，腳往下收細
  const fw = w - 2.4, fd = d - 2.4, ft = 3.2, legH = baseH - gap;
  B(g, fw - 3, gap, fd - 3, 0, baseH - gap / 2, 0, Dk);
  for (const sd of [-1, 1]) { RB(g, fw - ft, railH, 2, 0.5, 0, legH - railH / 2, sd * (fd / 2 - 1.2), Wd); RB(g, 2, railH, fd - ft, 0.5, sd * (fw / 2 - 1.2), legH - railH / 2, 0, Wd); }
  const lgeo = new THREE.CylinderGeometry(ft / Math.SQRT2, ft * 0.6 / Math.SQRT2, legH, 4, 1).toNonIndexed(); lgeo.rotateY(Math.PI / 4); lgeo.computeVertexNormals();
  { const P = lgeo.attributes.position; for (let i = 0; i < P.count; i++) { const k = (legH / 2 - P.getY(i)) / legH * ft * 0.2; P.setX(i, P.getX(i) + k); P.setZ(i, P.getZ(i) + k); } lgeo.computeVertexNormals(); }   // 外側兩面保持垂直，只收內側
  for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) add(g, lgeo, Wd, sx * (fw / 2 - ft / 2), legH / 2, sz2 * (fd / 2 - ft / 2)).scale.set(sx, 1, sz2);
  return g;
}
const DESK_SIDE_OPT = { key: 'side', label: '抽屜位置', list: [opt('left', '抽屜在左'), opt('right', '抽屜在右')] };
function buildDaliDesk(it) { // 大理書桌：厚實木桌面；一側吊著三抽的抽屜櫃（木頭櫃身、烤漆抽屜面板、每個抽屜正中一支直立的金屬把手），櫃子底下是一個方管金屬框腳；另一側是到桌面的方管金屬框腳（預設抽屜在右，選左時鏡射）
  const g = new THREE.Group(), { w, d, h } = it;
  const Wd = surfMat('wood', it.color), L = surfMat('lacquer', it.color2), M = surfMat('metal', it.color3 || '#1d1e21'), Dk = mat('#101010', 0.9), Gl = mat('#141414', 0.7);
  const tt = Math.min(5, h * 0.07), top = h - tt, tw = 4.5, tk = 2.5, gl = 0.4;                        // 桌面厚度；方管：寬 4.5、厚 2.5；腳墊高度
  RB(g, w, tt, d, 0.5, 0, top + tt / 2, 0, Wd);
  // 抽屜櫃：吊在桌面下，和桌面之間內縮一道陰影縫
  const cw = Math.min(46, w * 0.31), cd = d - 5, gap = 1.6, cy1 = top - gap, cy0 = Math.max(12, h * 0.25), ch = cy1 - cy0, cx = w / 2 - cw / 2 - 1.5, zf = cd / 2;
  B(g, cw - 2.4, gap, cd - 2.4, cx, top - gap / 2, 0, Dk);
  B(g, cw, ch, cd - 1.9, cx, cy0 + ch / 2, -0.95, Wd);
  const dh = ch / 3;
  for (let i = 0; i < 3; i++) { const y = cy0 + dh * (i + 0.5);
    B(g, cw - 0.2, dh - 0.2, 0.5, cx, y, zf - 1.7, Dk);                                               // 抽屜之間的細縫
    RB(g, cw - 0.5, dh - 0.7, 1.7, 0.3, cx, y, zf - 0.85, L);
    RB(g, tw, dh - 1.6, 1.5, 0.35, cx, y, zf + 0.6, M);                                               // 把手：直立的金屬扁條
  }
  // 方管框腳：一個立著的長方形框（前後各一支立柱、地上一支橫桿、上面一支橫桿）
  const frame = (x, yTop, len) => { const zc = (zf + 1.35 - tk / 2) - len / 2 + 0;
    B(g, tw, tk, len, x, gl + tk / 2, zc, M); B(g, tw, tk, len - 2 * tk, x, yTop - tk / 2, zc, M);
    for (const sd of [-1, 1]) { B(g, tw, yTop - gl, tk, x, gl + (yTop - gl) / 2, zc + sd * (len / 2 - tk / 2), M); C(g, 0.9, 0.9, gl, x, gl / 2, zc + sd * (len / 2 - 3), Gl, 10); }
  };
  frame(cx, cy0, cd - 3);                                                                              // 抽屜櫃底下：前立柱正好接在把手下面
  frame(-(w / 2 - tw / 2 - 2.5), top, cd - 3);
  return mirrorIfLeft(it, g);
}
function buildEggerDesk(it) { // 艾格書桌：厚實木桌面；一側吊著兩抽的抽屜櫃（深色木櫃身、胡桃木抽屜面板上小下大，偏一邊各一支直立的金屬方條把手），細方管金屬腳架：櫃子底下一個矮框、另一側一個到桌面的高框，兩個框之間地上一支橫桿相連（預設抽屜在右，選左時鏡射）
  const g = new THREE.Group(), { w, d, h } = it;
  const Wd = surfMat('wood', it.color), Wf = surfMat('wood', it.color2), M = surfMat('metal', it.color3 || '#1d1e21'), Dk = mat('#0e0e0e', 0.9), Gl = mat('#141414', 0.7);
  const tt = Math.min(5, h * 0.07), top = h - tt, tk = 2.5, gl = 0.5;
  RB(g, w, tt, d, 0.4, 0, top + tt / 2, 0, Wd);
  // 抽屜櫃：貼著桌面下緣；面板蓋在櫃身前面，上小下大
  const cw = Math.min(50, w * 0.33), cd = d - 6, cy0 = Math.max(12, h * 0.265), ch = top - 0.4 - cy0, cx = w / 2 - cw / 2 - 1, zf = cd / 2;
  B(g, cw - 0.6, ch, cd - 2.2, cx, cy0 + ch / 2, -1.1, Wd);
  B(g, cw - 1, ch - 0.6, 0.6, cx, cy0 + ch / 2, zf - 2.1, Dk);
  const h1 = ch * 0.63, h2 = ch - h1, hx = cx - cw / 2 + cw * 0.76;
  for (const [y0, hh] of [[cy0, h1], [cy0 + h1, h2]]) {
    RB(g, cw, hh - 0.6, 1.8, 0.25, cx, y0 + hh / 2, zf - 0.9, Wf);
    RB(g, 3, hh - 0.9, 2.6, 0.4, hx, y0 + hh / 2, zf + 1.3, M);                                       // 把手：直立的金屬方條，和下面的前腳連成一直線
  }
  // 腳架：細方管
  const zF = zf + 1.3, zB = -cd / 2 + 2, len = zF - zB + tk, zc = (zF + zB) / 2, xl = -(w / 2 - Math.min(12, w * 0.08));
  const loop = (x, yTop) => { B(g, tk, tk, len, x, gl + tk / 2, zc, M); B(g, tk, tk, len - 2 * tk, x, yTop - tk / 2, zc, M);
    for (const z of [zF, zB]) { B(g, tk, yTop - gl, tk, x, gl + (yTop - gl) / 2, z, M); C(g, 0.6, 0.6, gl, x, gl / 2, z, Gl, 8); } };
  loop(hx, cy0); loop(xl, top);
  B(g, hx - xl - tk, tk, tk, (hx + xl) / 2, gl + tk / 2, zc, M);                                       // 地上連接兩個框的橫桿
  return mirrorIfLeft(it, g);
}
const VAN_SIDE_OPT = { key: 'side', label: '櫃子位置', list: [opt('left', '櫃子在左'), opt('right', '櫃子在右')] };
const VAN_MIRROR_OPT = { key: 'mir', label: '鏡子', list: [opt('on', '放鏡子'), opt('off', '不放')] };
function buildHemingwayVanity(it) { // 海明威化妝台：烤漆檯面是一顆「膠囊」（兩端半圓，正面兩個抽屜、圓鈕把手），一端疊在圓角的烤漆櫃子上（上小下大兩個抽屜，下抽是鑰匙孔形把手），櫃子底下兩支金色矮框腳；另一端是並排兩個金色方管高框腳；檯面中間靠後立一面金框圓鏡（預設櫃子在右，選左時鏡射；h 含鏡子）
  const g = new THREE.Group(), { w, d, h } = it;
  const L = surfMat('lacquer', it.color), M = surfMat('metal', it.color2 || '#c9a659'), Dk = mat('#1a1a1a', 0.9), Gl = mat('#161616', 0.7);
  const tH = h * 76 / 126, uh = tH * 13 / 76, yb = tH - uh, uw = w * 121 / 140, cwid = w * 48 / 140, kn = 2.9, bd = d - kn, bz = -kn / 2, zf = d / 2 - kn;   // 把手凸出 kn：櫃身往後讓，整體深度才會剛好是 d
  const rrs = (W, H2, r) => { const sh = new THREE.Shape(), x0 = -W / 2, y0 = -H2 / 2; sh.moveTo(x0 + r, y0); sh.lineTo(x0 + W - r, y0); sh.absarc(x0 + W - r, y0 + r, r, -Math.PI / 2, 0); sh.lineTo(x0 + W, y0 + H2 - r); sh.absarc(x0 + W - r, y0 + H2 - r, r, 0, Math.PI / 2); sh.lineTo(x0 + r, y0 + H2); sh.absarc(x0 + r, y0 + H2 - r, r, Math.PI / 2, Math.PI); sh.lineTo(x0, y0 + r); sh.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5); return sh; };
  const slab = (W, H2, r, dep, x, y, z, m) => { const geo = new THREE.ExtrudeGeometry(rrs(W, H2, r), { depth: dep, bevelEnabled: false, curveSegments: 16 }), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 60, uv.getY(i) / 60); geo.translate(0, 0, -dep / 2); return add(g, geo, m, x, y, z); };
  const knob = (x, y, z) => { C(g, 0.5, 0.5, 1.6, x, y, z + 0.8, M, 10).rotation.x = Math.PI / 2; C(g, 1.5, 1.3, 0.9, x, y, z + 2, M, 20).rotation.x = Math.PI / 2; };
  // 檯面：膠囊形的抽屜箱
  const ux = -w / 2 + uw / 2, ur = uh / 2 - 0.01;
  slab(uw, uh, ur, bd, ux, yb + uh / 2, bz, L);
  { const fl = uw - 2 * ur - 1.5, fh = uh - 3.2, fw = (fl - 0.5) / 2;
    B(g, fl + 0.5, fh + 0.5, 0.12, ux, yb + uh / 2, zf + 0.03, Dk);
    for (const sd of [-1, 1]) { RB(g, fw, fh, 0.6, 0.15, ux + sd * (fw / 2 + 0.25), yb + uh / 2, zf + 0.2, L); knob(ux + sd * (fw / 2 + 0.25), yb + uh / 2, zf + 0.5); } }
  // 櫃子：圓角的筒狀櫃身，正面一圈細框，裡面上小下大兩片抽屜面板
  const legc = Math.min(8, tH * 0.11), ch = yb - 0.3 - legc, cx = w / 2 - cwid / 2, cy = legc + ch / 2, cr = Math.min(6.5, cwid * 0.14);
  slab(cwid, ch, cr, bd, cx, cy, bz, L);
  slab(cwid - 1.8, ch - 1.8, cr - 0.9, 0.14, cx, cy, zf + 0.03, Dk);
  { const pw = cwid - 2.6, ph = ch - 2.6, h2 = ph * 0.32, geoF = (y0, y1) => { const sh = rrs(pw, ph, cr - 1.3), geo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 12 }), P = geo.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, Math.min(y1, Math.max(y0, P.getY(i)))); geo.computeVertexNormals(); return geo; };
    add(g, geoF(ph / 2 - h2 + 0.25, ph / 2), L, cx, cy, zf);  add(g, geoF(-ph / 2, ph / 2 - h2 - 0.25), L, cx, cy, zf);
    knob(cx, cy + ph / 2 - h2 / 2, zf + 0.5);
    const ky = cy - h2 / 2 + 1.5; C(g, 1.6, 1.6, 0.9, cx, ky, zf + 1.4, M, 20).rotation.x = Math.PI / 2; RB(g, 1.3, 4.6, 0.9, 0.4, cx, ky - 2.6, zf + 1.4, M); C(g, 0.5, 0.5, 1, cx, ky, zf + 0.7, M, 8).rotation.x = Math.PI / 2; }   // 鑰匙孔形把手
  // 腳：方管框（前後各一支立柱、地上和上面各一支橫桿）
  const loop = (x, yTop, len, tk) => { const gl = 0.4; B(g, tk, tk, len, x, gl + tk / 2, bz, M); B(g, tk, tk, len - 2 * tk, x, yTop - tk / 2, bz, M);
    for (const sd of [-1, 1]) { B(g, tk, yTop - gl, tk, x, gl + (yTop - gl) / 2, bz + sd * (len / 2 - tk / 2), M); C(g, 0.6, 0.6, gl, x, gl / 2, bz + sd * (len / 2 - 3), Gl, 8); } };
  for (const sd of [-1, 1]) loop(cx + sd * (cwid / 2 - 7), legc, d - 9, 2.6);
  for (const k of [0, 1]) loop(-w / 2 + 9 + k * 4.4, yb + 0.6, d - 12, 2.2);
  // 鏡子：金色底板＋拱形立片夾住一面金框圓鏡
  if (it.mir !== 'off') {
    const sc = Math.max(0.5, (h - tH) / 50), R = 22 * sc, mz = -d / 2 + Math.min(11, d * 0.2), my = tH + 6 * sc + R;
    B(g, 16 * sc, 0.8, 9 * sc, ux, tH + 0.4, mz, M);
    B(g, 7 * sc, 6.5 * sc, 1.2, ux, tH + 0.8 + 3.25 * sc, mz + 1.6, M); C(g, 3.5 * sc, 3.5 * sc, 1.2, ux, tH + 0.8 + 6.5 * sc, mz + 1.6, M, 24).rotation.x = Math.PI / 2;
    B(g, 3 * sc, 6 * sc, 2.2, ux, tH + 0.8 + 3 * sc, mz - 0.4, M);
    C(g, R, R, 2.6, ux, my, mz, M, 64).rotation.x = Math.PI / 2;
    C(g, R - 0.8, R - 0.8, 0.3, ux, my, mz + 1.25, MIRROR, 64).rotation.x = Math.PI / 2;
  }
  return mirrorIfLeft(it, g);
}
function buildPuffStool(it) { // 泡芙化妝椅：圓筒形的布面椅身坐在深色圓底座上，圓坐墊跳色、邊緣一圈滾邊；矮椅背從椅身後面一路包上來，越往上越寬、往後仰，內側跳色有三道直車線，外側正中一道交叉縫線
  const g = new THREE.Group(), { w, d, h } = it;
  const F = fabMat(it), F2 = fabMat(it, 'color2'), Bs = mat(it.color3 || '#4a3f3a', 0.55, 0.3), Gl = mat('#161616', 0.7), St = mat('#6b2f33', 0.8);
  const R = Math.min(w / 2 - 1.5, d * 0.43), zc = d / 2 - R, st = Math.min(45, h * 0.7), pb = Math.min(4, h * 0.06);
  // 底座、圓筒椅身、坐墊
  C(g, R - 2.6, R - 2.6, pb, 0, 0.5 + pb / 2, zc, Bs, 48); for (let i = 0; i < 4; i++) C(g, 0.9, 0.9, 0.5, (R - 6) * Math.cos(i * Math.PI / 2 + 0.6), 0.25, zc + (R - 6) * Math.sin(i * Math.PI / 2 + 0.6), Gl, 8);
  const lathe = (pts, m) => add(g, new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), 64), m, 0, 0, zc);
  lathe([[R - 2.6, pb + 0.3], [R - 0.9, pb + 0.7], [R - 0.15, pb + 2], [R, pb + 4.5], [R, st - 3.2], [R - 0.3, st - 1.8], [R - 1.2, st - 1.2], [0, st - 1.2]], F);
  lathe([[R - 0.8, st - 1.6], [R - 0.7, st - 1.1], [R - 1.4, st - 0.35], [R - 3, st], [0, st]], F2);
  add(g, new THREE.TorusGeometry(R - 0.45, 0.48, 8, 72), F, 0, st - 1.45, zc).rotation.x = Math.PI / 2;      // 坐墊邊的滾邊
  // 椅背：角度 u（-1～1）× 高度 v（0＝底座上緣、1＝頂）的曲面
  const y0 = pb + 0.8, rB = R + 1.1, rT = d / 2 + zc, aT = Math.asin(Math.min(0.98, (w / 2 - 0.7) / rT)), e = t => t * t * (3 - 2 * t);
  const Hu = u => h - 0.8 - Math.min(6, h * 0.09) * Math.pow(Math.abs(u), 5);
  const shape = (u, v) => { const y = y0 + v * (Hu(u) - y0), t = Math.max(0, (y - st) / (Hu(u) - st)), A = y < st ? 0.6 + 0.42 * Math.pow((y - y0) / (st - y0), 1.4) : 1.02 + (aT - 1.02) * e(Math.min(1, t)); return { y, a: u * A, r: rB + (rT - rB) * Math.pow(Math.min(1, t), 1.25), t }; };
  const grid = (nu, nv, fn, flip) => { const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const q = fn(i / nu * 2 - 1, j / nv); pos.push(q[0], q[1], q[2]); uv.push(q[0] / 40, q[1] / 40); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e2 = c + 1; flip ? idx.push(a, c, b, b, c, e2) : idx.push(a, b, c, b, e2, c); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo; };
  const P = (a, y, r) => [r * Math.sin(a), y, zc - r * Math.cos(a)];
  add(g, grid(48, 28, (u, v) => { const q = shape(u, v); return P(q.a, q.y, q.r); }, true), F, 0, 0, 0);                      // 外側
  const v0 = (st - 2 - y0) / (h - y0);
  add(g, grid(72, 20, (u, v) => { const q = shape(u, v0 + v * (1 - v0)), th = 3.4 * (1 - Math.pow(Math.abs(u), 6)) * Math.min(1, (1 - v) * 9 + 0.12) + 0.5;
    let gr = 0; for (const su of [-0.5, 0, 0.5]) gr += Math.exp(-(((u - su) * q.r * 0.9 / 0.55) ** 2)); return P(q.a, q.y, q.r - th + 0.55 * gr); }, false), F2, 0, 0, 0);   // 內側（跳色、三道車線）
  const edge = []; for (let i = 0; i <= 26; i++) { const q = shape(-1, i / 26); edge.push(new V3(...P(q.a, q.y, q.r - 0.25))); }
  for (let i = 1; i <= 40; i++) { const q = shape(-1 + i / 20, 1); edge.push(new V3(...P(q.a, q.y, q.r - 0.25))); }
  for (let i = 25; i >= 0; i--) { const q = shape(1, i / 26); edge.push(new V3(...P(q.a, q.y, q.r - 0.25))); }
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 160, 0.62, 8, false), F, 0, 0, 0);                           // 椅背邊緣的滾邊
  const sp = []; for (let i = 0; i <= 20; i++) { const q = shape(0, i / 20 * 0.985); sp.push(new V3(...P(0, q.y, q.r + 0.12))); }
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 40, 0.22, 6, false), St, 0, 0, 0);                             // 背後正中的交叉縫線
  return g;
}
function buildHeartTable(it) { // 愛心腳餐桌：酒桶形的陶板桌面（長邊微微外鼓、圓角）貼在黑色底板上，底下一圈金屬橫框；桌腳是兩片金屬帶從地上的底板兩端彎上來、在半空交叉（正面看像愛心），帶子在地面是整個深度寬，越往上越窄、一前一後錯開
  const g = new THREE.Group(), { w, d, h } = it;
  const T = topMat(it), M = surfMat('metal', it.color2), Bk = mat(it.color3 || '#1b1b1c', 0.5, 0.2);
  const tt = 1, ut = 1.7, ah = Math.min(5.5, h * 0.08), yU = h - tt - ut, yA = yU - ah;
  // 桌面：圓角長方形再把四邊往外鼓
  const slab = (W, D, th, y, m) => { const r = Math.min(9, D * 0.09), sh0 = new THREE.Shape(), x0 = -W / 2, z0 = -D / 2;
    sh0.moveTo(x0 + r, z0); sh0.lineTo(-x0 - r, z0); sh0.absarc(-x0 - r, z0 + r, r, -Math.PI / 2, 0); sh0.lineTo(-x0, -z0 - r); sh0.absarc(-x0 - r, -z0 - r, r, 0, Math.PI / 2); sh0.lineTo(x0 + r, -z0); sh0.absarc(x0 + r, -z0 - r, r, Math.PI / 2, Math.PI); sh0.lineTo(x0, z0 + r); sh0.absarc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5);
    const pts = sh0.getSpacedPoints(160).map(q => new THREE.Vector2(q.x * (1 - 0.012 * (q.y / (D / 2)) ** 2), q.y * (1 - 0.085 * (q.x / (W / 2)) ** 2)));
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: th, bevelEnabled: false }), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + W / 2) / W, (uv.getY(i) + D / 2) / D);
    const mesh = add(g, geo, m, 0, y, 0); mesh.rotation.x = -Math.PI / 2; return mesh; };
  slab(w, d, tt, h - tt, T);
  slab(w - 0.8, d - 0.8, 0.5, h - tt - 0.5, Bk); slab(w - 2.6, d - 2.6, ut - 0.5, yU, Bk);        // 底板：上緣和陶板齊、往下內收一階
  // 橫框
  const aw = w * 0.71, ad = d * 0.5;
  for (const sd of [-1, 1]) { B(g, aw, ah, 2.2, 0, yA + ah / 2, sd * (ad / 2 - 1.1), M); B(g, 2.2, ah, ad - 4.4, sd * (aw / 2 - 1.1), yA + ah / 2, 0, M); }
  B(g, aw - 4, 1, ad - 4, 0, yU - 0.5, 0, Bk);
  // 桌腳：一片扭轉的金屬帶（四個面各自平滑、稜線銳利）
  const bx = Math.min(47, w * 0.2), zs = Math.min(22, d * 0.21), th = 2.6, tm = 1.22, A = (bx + bx * 0.74) / (1 - Math.cos(tm)), Y = yA / Math.sin(tm), N = 44;
  const ribbon = sg => { const ring = [];
    for (let i = 0; i <= N; i++) { const t = i / N, q = t * tm, x = -bx + A * (1 - Math.cos(q)), y = Y * Math.sin(q), tx = A * Math.sin(q), ty = Y * Math.cos(q), tl = Math.hypot(tx, ty), nx = -ty / tl, ny = tx / tl;
      const u = Math.min(1, Math.max(0, (t - 0.12) / 0.5)), e = u * u * (3 - 2 * u), za = -zs + (zs + 1.2) * e, zb = zs - 1.5 * e, k = th / 2 * (1 - 0.25 * t);
      ring.push([[x + nx * k, y + ny * k, za], [x + nx * k, y + ny * k, zb], [x - nx * k, y - ny * k, zb], [x - nx * k, y - ny * k, za]].map(([X, Yy, Z]) => [sg * X, Math.min(yA, Math.max(0, Yy)), sg * Z])); }
    const pos = [], idx = [];
    for (let f = 0; f < 4; f++) { const o = pos.length / 3; for (let i = 0; i <= N; i++) pos.push(...ring[i][f], ...ring[i][(f + 1) % 4]); for (let i = 0; i < N; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    for (const [i, fl] of [[0, 0], [N, 1]]) { const o = pos.length / 3; for (const q of ring[i]) pos.push(...q); fl ? idx.push(o, o + 1, o + 2, o, o + 2, o + 3) : idx.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    let vol = 0; for (let i = 0; i < idx.length; i += 3) { const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3; vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]); }
    if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const q = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = q; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    add(g, geo, M, 0, 0, 0);
    const xe = sg * (-bx + A * (1 - Math.cos(tm))); B(g, 20, 1.2, zs - 1, xe - sg * 7, yA - 0.6, sg * (zs / 2 + 0.5), M);       // 接橫框的托片
  };
  ribbon(1); ribbon(-1);
  RB(g, 2 * bx + 1, 1.8, 2 * zs, 0.6, 0, 0.9, 0, M);                                                 // 地上的底板
  for (const sd of [-1, 1]) { const f = B(g, 9, 1.4, 2 * zs - 1, sd * (bx - 5), 2.6, 0, M); f.rotation.z = sd * 0.5; }   // 底板兩端往上翹、接到帶子上
  return g;
}
function buildOvalSideTable(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const T = topMat(it), M = surfMat('metal', it.color2), edge = mat('#6a6a6c', 0.6);
  const tt = 1.2, cr = Math.min(w, d) / 2 - 0.01;
  roundedTop(g, w, d, tt, h - tt, T, cr);                          // 陶板桌面
  roundedTop(g, w - 1, d - 1, 0.7, h - tt - 0.7, edge, cr - 0.5);  // 桌面下緣灰邊
  roundedTop(g, w * 0.95, d * 0.92, 1, 0, M, Math.min(w * 0.95, d * 0.92) / 2 - 0.01); // 金屬底板
  // 扁鐵立柱：在一端，底部彎折成平貼底板的腳
  const bw = 6, bt = 1.6, zc = -d / 2 + 9, top = h - tt - 0.7;
  B(g, bw, top - 1, bt, 0, 1 + (top - 1) / 2, zc, M);
  B(g, bw, bt, 14, 0, 1 + bt / 2, zc + 7 - bt / 2, M);
  const bend = C(g, bt * 1.2, bt * 1.2, bw, 0, 1 + bt * 1.2, zc + bt * 0.2, M, 12); bend.rotation.z = Math.PI / 2;
  B(g, bw + 4, 0.8, 12, 0, top - 0.4, zc + 5, M);                 // 桌面下的固定片
  return g;
}
/* ---------- 自家商品：Ash 陶板大小茶几（實木圓框＋內崁陶板，上粗下細外斜方腳；大茶几另有圓筒裙圍） ---------- */
function sqLeg(g, top, bot, t1, t2, m) { // 上粗下細的方腳，由 top 斜到 bot
  const dir = new V3().subVectors(top, bot), len = dir.length();
  const geo = new THREE.CylinderGeometry(t1 / Math.SQRT2, t2 / Math.SQRT2, len, 4); geo.rotateY(Math.PI / 4);
  const mesh = add(g, geo, m, (top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2);
  mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
  return mesh;
}
function buildAshTable(it) {
  const g = new THREE.Group(), { w, d, h } = it, big = it.type === 'ownAshBig';
  const Wd = surfMat('wood', it.color), Cer = surfMat('slate', it.color2), glide = mat('#9a9a9c', 0.5);
  const R = w / 2, tt = 4.2, rim = big ? 2.2 : 2.6, Rin = R - rim, ez = d / w;
  // 木框：外緣上段垂直、下段往內斜切（旋轉輪廓）
  const prof = [[Rin, h - 1.4], [Rin, h], [R - 0.7, h], [R, h - 0.7], [R, h - 2.2], [R - 2.2, h - tt], [Rin - 3, h - tt], [Rin - 3, h - 1.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const rimM = Wd.clone(); rimM.side = THREE.DoubleSide; rimM.userData.own = true;
  add(g, new THREE.LatheGeometry(prof, 64), rimM, 0, 0, 0).scale.z = ez;
  C(g, Rin - 2.9, Rin - 2.9, tt - 1.4, 0, h - tt + (tt - 1.4) / 2, 0, Wd, 48).scale.z = ez;       // 桌面底板
  C(g, Rin, Rin, 1.1, 0, h - 0.3 - 0.55, 0, Cer, 64).scale.z = ez;                                  // 內崁陶板（略低於木框）
  const legTopY = h - tt;
  if (big) {
    // 圓筒抽屜櫃：弧形抽屜面板位在前方兩支腳之間，四周留細縫、無外露把手
    const Ra = R * 0.55, ab = Math.min(11, h * 0.3), seam = mat('#3a3028', 0.8);
    C(g, Ra, Ra, ab, 0, legTopY - ab / 2, 0, Wd, 48).scale.z = ez;
    const dc = 0.70, dl = 1.92, dh = ab - 1.4, dy = legTopY - ab / 2;          // 抽屜中心角、弧長、高度
    const front = add(g, new THREE.CylinderGeometry(Ra + 0.5, Ra + 0.5, dh, 40, 1, false, dc - dl / 2, dl), Wd, 0, dy, 0); front.scale.z = ez;
    for (const a of [dc - dl / 2, dc + dl / 2]) B(g, 0.35, dh, 0.35, Math.sin(a) * (Ra + 0.55), dy, Math.cos(a) * (Ra + 0.55) * ez, seam);
    for (const yy of [dy - dh / 2, dy + dh / 2]) add(g, new THREE.CylinderGeometry(Ra + 0.56, Ra + 0.56, 0.3, 40, 1, true, dc - dl / 2, dl), seam, 0, yy, 0).scale.z = ez;
    // 3 支腳，每 120° 一支，上端接裙圍外側、往外斜到接近桌緣
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + 0.35 + k * Math.PI * 2 / 3, cx = Math.cos(a), cz = Math.sin(a) * ez;
      const top = new V3(cx * (Ra + 1), legTopY - 0.5, cz * (Ra + 1)), bot = new V3(cx * R * 0.9, 0.8, cz * R * 0.9);
      sqLeg(g, top, bot, 4.6, 3, Wd);
      C(g, 1.3, 1.3, 0.8, bot.x, 0.4, bot.z, glide, 12);
    }
  } else {
    // 桌面下的細圓框，4 支腳斜伸
    const Ra = R * 0.5;
    C(g, Ra + 1, Ra + 1, 4, 0, legTopY - 2, 0, Wd, 40).scale.z = ez;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, cx = Math.cos(a), cz = Math.sin(a) * ez;
      const top = new V3(cx * Ra, legTopY - 0.5, cz * Ra), bot = new V3(cx * R * 0.84, 0.8, cz * R * 0.84);
      sqLeg(g, top, bot, 4.4, 2.8, Wd);
      C(g, 1.3, 1.3, 0.8, bot.x, 0.4, bot.z, glide, 12);
    }
  }
  return g;
}
function buildAshSet(it) { // 家具庫縮圖：依照片擺法，小茶几在左、大茶几在右
  const g = new THREE.Group();
  const b = buildAshTable({ ...TYPES.ownAshBig, type: 'ownAshBig' }), s = buildAshTable({ ...TYPES.ownAshSmall, type: 'ownAshSmall' });
  b.position.set(22, 0, 0); s.position.set(-53, 0, 8);
  g.add(b, s);
  return g;
}
/* ---------- 自家商品：多恩茶几（上層卵石形陶板＋下層不規則金屬板，大圓柱金屬腳） ---------- */
function blobPlate(g, pts, sx, sz, y, t, m) { // 以平滑閉合曲線做不規則板（pts 為 100×96 基準的 x,z）
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new V3(x * sx, 0, z * sz)), true, 'centripetal');
  const sh = new THREE.Shape(curve.getPoints(96).map(p => new THREE.Vector2(p.x, -p.z)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 1 });
  geo.computeBoundingBox();
  const bb = geo.boundingBox, uv = geo.attributes.uv, bw = bb.max.x - bb.min.x, bd = bb.max.y - bb.min.y;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - bb.min.x) / bw, (uv.getY(i) - bb.min.y) / bd);
  const mesh = add(g, geo, m, 0, y, 0); mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
function buildDornTable(it) {
  const g = new THREE.Group(), { w, d, h } = it, sx = w / 100, sz = d / 96;
  const Cer = topMat(it), Mt = surfMat('metal', it.color2);
  // 兩片桌面大小相近：陶板在左前、金屬板往右後延伸
  const cer = [[-49, 2], [-38, -24], [-8, -34], [18, -26], [30, 4], [24, 34], [2, 47], [-26, 36]];
  const met = [[-22, -36], [8, -47], [36, -42], [50, -18], [49, 10], [36, 30], [14, 26], [-6, 2]];
  const tc = 1.2, tu = 0.5, tm = 0.8;
  blobPlate(g, met, sx, sz, h - tc - tu - tm - 0.1, tm, Mt);            // 下層金屬板（略低）
  blobPlate(g, cer, sx, sz, h - tc - tu, tu, Mt);                        // 陶板底下的金屬薄片
  blobPlate(g, cer, sx, sz, h - tc, tc, Cer);                            // 上層陶板
  // 大圓柱金屬腳：直徑約桌寬一半，位於中央偏右
  const r = Math.min(w, d) * 0.27;
  C(g, r, r, h - tc - tu - tm - 0.1, 3 * sx, (h - tc - tu - tm - 0.1) / 2, 2 * sz, Mt, 64);
  return g;
}
/* ---------- 電腦 ---------- */
const PC_OPTS = [{ key: 'style', label: '款式', list: [
  opt('laptop', '筆記型電腦', { size: { w: 34, d: 24, h: 22 } }),
  opt('desktop', '桌上型電腦（螢幕＋鍵盤）', { size: { w: 60, d: 35, h: 45 } }),
  opt('aio', '一體機', { size: { w: 55, d: 20, h: 45 } }),
  opt('dual', '雙螢幕', { size: { w: 110, d: 35, h: 45 } }),
] }];
function buildComputer(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'laptop';
  const Bd = surfMat('metal', it.color), K = surfMat('lacquer', it.color2), Scr = DARKGLASS();
  if (style === 'laptop') {
    B(g, w, 1.6, d, 0, 0.8, 0, Bd);
    B(g, w - 4, 0.3, d * 0.45, 0, 1.7, -d * 0.12, K);
    const lid = new THREE.Group(); lid.position.set(0, 1.6, -d / 2); lid.rotation.x = -0.28; g.add(lid);
    B(lid, w, h - 2, 0.8, 0, (h - 2) / 2, 0, Bd);
    B(lid, w - 2, h - 4, 0.2, 0, (h - 2) / 2, 0.5, Scr);
    return g;
  }
  const monitor = (x, mw, mh, thin) => {
    const st = Math.min(12, h * 0.25);
    B(g, mw * 0.35, 1, Math.min(18, d * 0.5), x, 0.5, -d / 2 + Math.min(18, d * 0.5) / 2, Bd);
    B(g, 4, st, 2, x, st / 2 + 1, -d / 2 + 6, Bd);
    B(g, mw, mh, thin, x, st + mh / 2, -d / 2 + 7, Bd);
    B(g, mw - 1.5, mh - 1.5, 0.2, x, st + mh / 2, -d / 2 + 7 + thin / 2 + 0.1, Scr);
    if (style === 'aio') B(g, mw, mh * 0.12, thin + 0.5, x, st + mh * 0.06, -d / 2 + 7, Bd);
  };
  const mh = h - Math.min(12, h * 0.25);
  if (style === 'dual') { const mw = (w - 4) / 2; monitor(-mw / 2 - 1, mw, mh, 2); monitor(mw / 2 + 1, mw, mh, 2); }
  else monitor(0, style === 'aio' ? w : w * 0.95, mh, style === 'aio' ? 3 : 2);
  if (style !== 'aio' || d > 25) {
    RB(g, Math.min(44, w * 0.7), 1.5, 14, 0.6, 0, 0.75, d / 2 - 9, K);
    RB(g, 6, 2, 10, 2.5, Math.min(44, w * 0.7) / 2 + 8, 1, d / 2 - 9, K);
  }
  return g;
}
/* ---------- 書本 ---------- */
const BOOK_ITEM_OPTS = [{ key: 'style', label: '款式', list: [
  opt('row', '直立一排', { size: { w: 40, d: 20, h: 25 } }),
  opt('stack', '平放一疊', { size: { w: 28, d: 20, h: 18 } }),
  opt('open', '翻開的書', { size: { w: 34, d: 24, h: 4 } }),
] }];
function buildBookItem(it) {
  const g = new THREE.Group(), { w, d, h } = it, style = it.style || 'row';
  const pal = [it.color, it.color2, '#e9e4da', '#4a4d52', '#9e4a3a', '#d9a441', '#5f7d63'];
  let seed = 13;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const cover = () => mat(pal[Math.floor(rnd() * pal.length)], 0.8), paper = mat('#f4efe4', 0.9);
  if (style === 'open') {
    for (const s of [-1, 1]) {
      const pg = B(g, w / 2 - 0.5, h * 0.5, d, s * (w / 4), h * 0.25, 0, paper); pg.rotation.z = -s * 0.06;
      const cv = B(g, w / 2, 0.4, d + 1, s * (w / 4), 0.2, 0, mat(it.color, 0.8)); cv.rotation.z = -s * 0.06;
    }
    return g;
  }
  if (style === 'stack') {
    let y = 0;
    while (y < h - 1.5) {
      const bh = Math.min(2 + rnd() * 2.5, h - y), bw = w * (0.8 + rnd() * 0.2), bd = d * (0.8 + rnd() * 0.2);
      const b = B(g, bw, bh, bd, (rnd() - 0.5) * 2, y + bh / 2, (rnd() - 0.5) * 2, cover()); b.rotation.y = (rnd() - 0.5) * 0.2;
      B(g, bw - 1, bh - 0.6, 0.2, b.position.x, y + bh / 2, b.position.z + bd / 2 + 0.05, paper).rotation.y = b.rotation.y;
      y += bh;
    }
    return g;
  }
  let x = -w / 2;
  while (x < w / 2 - 1.5) {
    const bw = Math.min(1.5 + rnd() * 3, w / 2 - x), bh = h * (0.7 + rnd() * 0.3), bd = d * (0.75 + rnd() * 0.25);
    B(g, bw - 0.15, bh, bd, x + bw / 2, bh / 2, -d / 2 + bd / 2, cover());
    x += bw;
  }
  return g;
}
function buildBooks(it) {
  const g = new THREE.Group(), { w, d, h } = it;
  const cols = [it.color, it.color2, '#e9e4da', '#4a4d52'];
  let y = 0;
  for (let i = 0; i < 4 && y < h - 2; i++) { const bh = Math.min(4 + (i % 2) * 2, h - y); const b = B(g, w * (0.95 - i * 0.08), bh, d * (0.95 - i * 0.06), (i % 2 ? 1 : -1) * 1.5, y + bh / 2, 0, mat(cols[i], 0.8)); b.rotation.y = (i % 2 ? 0.08 : -0.05); y += bh; }
  if (h - y > 5) add(g, new THREE.SphereGeometry(Math.min(4, (h - y) / 2), 16, 12), surfMat('metal', '#b08d57'), 0, y + Math.min(4, (h - y) / 2), 0);
  return g;
}
/* ================= 系統櫃（家具庫下方獨立的大類別） ================= */
const numList = (a, b, unit) => Array.from({ length: b - a + 1 }, (_, i) => opt(String(a + i), `${a + i}${unit}`));
const SC_DOOR = { key: 'door', label: '門片', list: [opt('swing', '開門'), opt('slide', '拉門'), opt('open', '無門（開放）'), opt('glass', '玻璃門'), opt('flip', '上掀門')] };
const SC_HANDLE = { key: 'handle', label: '把手', list: [opt('bar', '一字把手'), opt('groove', '斜切無把手'), opt('push', '按壓式')] };
const SC_FINISH = { key: 'finish', label: '門片表面', list: [opt('wood', '木紋'), opt('plain', '素面'), opt('lacquer', '烤漆'), opt('stone', '仿石紋')] };
const SC_BODY = { key: 'bodyfin', label: '櫃體表面', list: [opt('plain', '素面'), opt('wood', '木紋')] };
const SC_SHELF = { key: 'shelves', label: '內建層板數', list: numList(0, 6, ' 片').map(o => ({ ...o, name: '層板 ' + o.name })) };
const SC_DRAWER = { key: 'drawers', label: '外抽屜數', list: numList(0, 4, ' 個').map(o => ({ ...o, name: '外抽 ' + o.name })) };
const SC_IDRAWER = { key: 'idrawers', label: '內抽屜數', list: numList(0, 4, ' 個').map(o => ({ ...o, name: '內抽 ' + o.name })) };   // 門片裡面的抽屜（每一格各放這麼多個）
const SC_ROD = { key: 'rod', label: '內建吊衣桿', list: [opt('yes', '有吊衣桿'), opt('no', '無吊衣桿')] };
const SC_OPTS = [SC_DOOR, SC_HANDLE, SC_FINISH, SC_BODY, SC_SHELF, SC_DRAWER, SC_IDRAWER];
const SC_DECO = { key: 'deco', label: '拉門飾條', list: [opt('none', '無'), opt('stripe', '黑玻飾條')] };
const SC_THICK = { key: 'thick', label: '板材厚度', list: [opt('0.8', '8mm'), opt('1.8', '18mm'), opt('2.5', '25mm')] };
const SC_BACK = { key: 'backt', label: '背板厚度', list: [opt('0.8', '8mm'), opt('1.8', '18mm'), opt('2.5', '25mm')] };
const backOf = it => parseFloat(it && it.backt) || 0.8;              // 背板厚度（cm），預設 8mm
const SC_DOORT = { key: 'doort', label: '門片厚度', list: [opt('0.8', '8mm'), opt('1.8', '18mm'), opt('2.5', '25mm')] };
const doorOf = it => parseFloat(it && it.doort) || 1.8;             // 門片、抽屜面板厚度（cm），預設 18mm
const thickOf = it => parseFloat(it && it.thick) || 1.8;              // 櫃體、層板的板材厚度（cm）
const SC_SW = [['#f4f3ef', '雪白'], ['#ece6da', '暖白'], ['#e3dccd', '米白'], ['#cfcdc8', '淺灰'], ['#a9a7a2', '水泥灰'], ['#5b5d60', '石墨灰'], ['#2c2c2e', '霧黑'],
  ['#dcc29a', '北美楓木'], ['#d8c3a2', '白橡木'], ['#c9a77c', '淺橡木'], ['#a8764a', '柚木'], ['#7a5538', '胡桃木'], ['#5d4331', '深木紋'], ['#4e3627', '黑胡桃']];   // 系統板材常用色
const sysOpts = { inside: false, thick: '1.8', backt: '0.8', doort: '1.8' };                          // 透視櫃內：隱藏門片
function buildSysCab(it) {
  const g = new THREE.Group(), { w, d, h } = it, T = TYPES[it.type] || {};
  let pk = null, pn = 0; const part = k => { if (pk) for (let i = pn; i < g.children.length; i++) g.children[i].userData.part = pk; pn = g.children.length; pk = k; };   // 之後建出來的板子都算這個部位
  const t = thickOf(it), kick = T.kick ? 8 : 0, lift = T.floatBottom || 0, hb = T.counter ? h - 4 : h;
  const y0 = kick + lift, H = hb - y0;
  const fin = it.finish || 'wood', bf = it.bodyfin || 'plain';
  const DoorM = fin === 'plain' ? mat(it.color, 0.75) : surfMat(fin === 'stone' ? 'slate' : fin, it.color);
  const BodyM = bf === 'plain' ? mat(it.color2, 0.75) : surfMat('wood', it.color2);
  const Hd = mat('#9a9da2', 0.3, 0.8), dark = mat('#3b3632', 0.85);
  let door = it.door || 'swing'; const handle = it.handle || 'bar';
  const shelves = parseInt(it.shelves || 0, 10), drawers = parseInt(it.drawers || 0, 10), rod = it.rod === 'yes';
  const DT = doorOf(it), bd = d - 2, bz = -1, zf = d / 2 - DT / 2, inside = sysOpts.inside;   // DT：門片、抽屜面板厚度
  const done = () => { part(null); cabParts(it, g, new Map([[DoorM, c => fin === 'plain' ? mat(c, 0.75) : surfMat(fin === 'stone' ? 'slate' : fin, c)], [BodyM, c => bf === 'plain' ? mat(c, 0.75) : surfMat('wood', c)], [dark, c => mat(c, 0.85)]])); return g; };
  part('kick');
  if (kick) B(g, w - 4, kick, d - 8, 0, kick / 2, -3, dark);                         // 踢腳板
  // 櫃體
  for (const s of [-1, 1]) { part(s < 0 ? 'L' : 'R'); B(g, t, H, bd, s * (w / 2 - t / 2), y0 + H / 2, bz, BodyM); }
  part('top'); B(g, w, t, bd, 0, hb - t / 2, bz, BodyM);
  part('bottom'); B(g, w - 2 * t, t, bd, 0, y0 + t / 2, bz, BodyM);
  part('back'); B(g, w - 2 * t, H - 2 * t, backOf(it), 0, y0 + H / 2, -d / 2 + backOf(it) / 2, BodyM);
  part(null);
  const nCol = it.ncol || T.ncol || Math.max(1, Math.round(w / 60)), colW = (w - 2 * t) / nCol, colX = c => -w / 2 + t + colW * (c + 0.5);
  const own = !it.interior;                                  // 舊檔：內部直接畫在櫃子上；新櫃：內部是可移動的配件
  if (own) for (let c = 1; c < nCol; c++) B(g, t, H - 2 * t, bd - 1, -w / 2 + t + colW * c, y0 + H / 2, bz - 0.5, BodyM);
  // 外抽屜區
  const drH = T.drawerFull && drawers ? H / drawers : Math.min(22, (H - 10) / Math.max(1, drawers + 1)), drZone = drawers * drH;  // 抽屜櫃：整座都是抽屜
  if (drawers) B(g, w - 2 * t, t, bd - 1, 0, y0 + drZone + t / 2, bz - 0.5, BodyM);
  // 鏤空格（玄關平台、電器格）：以櫃體高度比例定義
  const niches = (T.niches || []).map(([f0, f1]) => [y0 + H * f0, y0 + H * f1]);
  for (const [a, b] of niches) { B(g, w - 2 * t, t, bd - 1, 0, a + t / 2, bz - 0.5, BodyM); B(g, w - 2 * t, t, bd - 1, 0, b - t / 2, bz - 0.5, BodyM); }
  // 內建吊衣桿、層板
  const yA = y0 + drZone + t, yB = hb - t;
  let shelfTop = yB;
  if (rod && own) {
    const hat = yB - 30;
    for (let c = 0; c < nCol; c++) {
      B(g, colW - 0.4, t, bd - 3, colX(c), hat, bz - 0.5, BodyM);
      const r = C(g, 1.2, 1.2, colW - 2, colX(c), hat - 6, bz, Hd, 12); r.rotation.z = Math.PI / 2;
    }
    shelfTop = hat - 110;
  }
  if (own && shelves && shelfTop - yA > 20) for (let c = 0; c < nCol; c++) for (let k = 1; k <= shelves; k++) {
    const y = yA + (shelfTop - yA) * k / (shelves + 1);
    if (niches.some(([a, b]) => y > a - 2 && y < b + 2)) continue;
    B(g, colW - 0.4, t, bd - 3, colX(c), y, bz - 0.5, BodyM);
  }
  // 廚房檯面
  if (T.counter) { part('counter'); const ob = T.over || 0; B(g, w + 1, 4, d + 1 + ob, 0, h - 2, -ob / 2, topMat({ topmat: 'slate', color: it.color3 || '#e9e6e1' })); } // 中島檯面往後延伸當吧台
  part(null);
  const St = surfMat('metal', '#c9ccd0');
  if (T.sink) {                                                     // 水槽與龍頭
    const sw = Math.min(w - 16, 72), sd = Math.min(d - 16, 44);
    B(g, sw, 0.5, sd, 0, h + 0.2, 1, St); B(g, sw - 5, 0.3, sd - 5, 0, h + 0.5, 1, mat('#5d6166', 0.3, 0.8));
    const fz = 1 - sd / 2 - 5; C(g, 1.5, DT, 28, 0, h + 14, fz, St, 16);
    const sp = C(g, 1.1, 1.1, 18, 0, h + 27, fz + 8, St, 12); sp.rotation.x = Math.PI / 2;
  }
  if (T.hob) {                                                      // 嵌入式爐台（黑玻璃面板＋爐圈）
    const hw = Math.min(w - 12, 62), hd = Math.min(d - 12, 50);
    B(g, hw, 0.6, hd, 0, h + 0.3, 0, mat('#15171a', 0.08, 0.2));
    for (const [a, b, r] of [[-1, -1, 9], [1, -1, 7], [-1, 1, 7], [1, 1, 9]]) { C(g, r, r, 0.2, a * hw / 4, h + 0.7, b * hd / 4, mat('#5a5e64', 0.4), 32); C(g, r - 0.8, r - 0.8, 0.2, a * hw / 4, h + 0.8, b * hd / 4, mat('#15171a', 0.08, 0.2), 32); }
  }
  if (T.hood) {                                                     // 吊櫃下方的隱藏式排油煙機
    B(g, w - 2, 9, d + 12, 0, -4.5, 6, St); B(g, w - 8, 0.4, d + 4, 0, -9.1, 6, mat('#3b3f44', 0.4, 0.6));
  }
  if (inside) return done();                               // 透視櫃內：不畫門片與抽屜面板
  // 抽屜面板
  const fw = w / nCol;
  const hBar = (x, y, len) => B(g, len, 1.2, 1.5, x, y, d / 2 + 0.7, Hd);
  for (let c = 0; c < nCol; c++) for (let k = 0; k < drawers; k++) {
    const x = -w / 2 + fw * (c + 0.5), y = y0 + drH * (k + 0.5);
    part('f' + c + '-' + k);
    B(g, fw - 0.4, drH - 0.4, DT, x, y, zf, DoorM);
    if (handle === 'bar') hBar(x, y + drH * 0.22, Math.min(20, fw * 0.4));
    else if (handle === 'groove') B(g, fw - 0.4, 0.8, 0.3, x, y + drH / 2 - 0.8, d / 2 + 0.05, dark);
  }
  part(null);
  // 門片分段：扣除鏤空格
  let zi = -1;
  const zones = []; let cur = y0 + drZone;
  for (const [a, b] of niches.sort((p, q) => p[0] - q[0])) { if (a - cur > 5) zones.push([cur, a]); cur = b; }
  if (hb - cur > 5) zones.push([cur, hb]);
  if (door === 'slide' && zones.length > 1) door = 'swing';
  for (const [yD, yE] of zones) {
    zi++;
    const DH = yE - yD, cy = yD + DH / 2, tall = DH > 120, hl = Math.min(tall ? 30 : 14, DH * 0.35);
    const vHandle = (x, side, dw) => {
      const hx = x + side * (dw / 2 - 4);
      const hy = T.upper || yD > 120 ? yD + 4 + hl / 2 : tall ? Math.min(yD + 100 - it.elev, yD + DH * 0.5) : yE - 5 - hl / 2;
      if (handle === 'bar') B(g, 1.5, hl, 2, hx, hy, d / 2 + 1, Hd);
      else if (handle === 'groove') B(g, 0.8, DH * 0.9, 0.3, x + side * (dw / 2 - 0.8), cy, d / 2 + 0.05, dark);
    };
    if (T.blind && door === 'swing') {                               // 轉角櫃：左側封板、右側一扇門
      const bw = w * 0.45, dw = w - bw, x = -w / 2 + bw + dw / 2;
      part('d' + zi + '-0'); B(g, bw - 0.4, DH - 0.4, DT, -w / 2 + bw / 2, cy, zf, DoorM); part('d' + zi + '-1'); B(g, dw - 0.4, DH - 0.4, DT, x, cy, zf, DoorM); vHandle(x, -1, dw); part(null); continue;
    }
    if (door === 'swing' || door === 'glass') {
      const nd = Math.max(1, Math.round(w / 45)), dw = w / nd;
      for (let i = 0; i < nd; i++) {
        const x = -w / 2 + dw * (i + 0.5), side = nd === 1 ? -1 : (i % 2 === 0 ? 1 : -1);
        part('d' + zi + '-' + i);
        if (door === 'glass') {
          const f = 4;
          B(g, dw - 0.4, f, DT, x, yE - f / 2 - 0.2, zf, DoorM); B(g, dw - 0.4, f, DT, x, yD + f / 2 + 0.2, zf, DoorM);
          for (const s of [-1, 1]) B(g, f, DH - 0.4, DT, x + s * (dw / 2 - f / 2 - 0.2), cy, zf, DoorM);
          glassPane(g, dw - 2 * f, DH - 2 * f, 0.5, x, cy, zf);
        } else B(g, dw - 0.4, DH - 0.4, DT, x, cy, zf, DoorM);
        vHandle(x, side, dw);
      }
    } else if (door === 'slide') {
      const np = w > 200 ? 3 : 2, step = w / np, pw = step + 2;       // 200cm 以內兩片拉門
      part('rail' + zi);
      B(g, w, 3, 5, 0, yE - 1.5, d / 2 - 2.5, DoorM);                   // 上軌道飾板與門片同色
      for (let i = 0; i < np; i++) {
        const x = -w / 2 + step * (i + 0.5), z = i % 2 ? d / 2 - 1 : d / 2 - 3.4;
        part('d' + zi + '-' + i);
        B(g, pw, DH - 3, DT, x, yD + (DH - 3) / 2, z, DoorM);
        for (const e of [-1, 1]) B(g, 0.4, DH - 3, 0.3, x + e * (pw / 2 - 0.2), yD + (DH - 3) / 2, z + 0.95, dark);
        if (it.deco === 'stripe') B(g, pw - 0.8, Math.max(4, DH * 0.055), 0.3, x, yD + DH * 0.3, z + 1, mat('#16181b', 0.12, 0.2)); // 黑玻飾條
        if (handle !== 'push') B(g, 1.4, Math.min(60, DH * 0.5), 0.4, x + (i % 2 ? -1 : 1) * (pw / 2 - 3), yD + DH * 0.5, z + 1.05, handle === 'bar' ? Hd : dark);
      }
    } else if (door === 'flip') {
      for (let c = 0; c < nCol; c++) {
        const x = -w / 2 + fw * (c + 0.5);
        part('d' + zi + '-' + c);
        B(g, fw - 0.4, DH - 0.4, DT, x, cy, zf, DoorM);
        const y = T.upper ? yD + 3 : yE - 3;
        if (handle === 'bar') hBar(x, y, Math.min(30, fw * 0.5));
        else if (handle === 'groove') B(g, fw - 0.4, 0.8, 0.3, x, y, d / 2 + 0.05, dark);
      }
    }
    part(null);
  }
  return done();
}
/* ---------- 個別板材：櫃體的每一片（側板、頂板、底板、背板、踢腳板、檯面、門片、抽屜面板）可以單獨改顏色或隱藏 ---------- */
function partLocalBox(meshes) {                                         // 一片板材（可能含把手、玻璃等好幾塊）在櫃子自身座標裡的範圍
  const box = new THREE.Box3();
  for (const m of meshes) { if (!m.geometry) continue; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); m.updateMatrix(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix)); }
  return box;
}
const isTrim = (m, makers) => /^(d|f)/.test(m.userData.part || '') && m.material !== GLASS && [...makers.keys()].indexOf(m.material) !== 0;   // 門片、抽屜面板上的把手與溝槽（不是門片材質的那些）
function cabParts(it, g, makers) {                                      // 建完櫃體後套用 it.parts 裡的修改（顏色、拿掉、尺寸、位置）
  for (const m of g.children) if (m.userData.part && isTrim(m, makers)) m.userData.trim = true;
  const P = it.parts; if (!P) return;
  for (const m of g.children) {
    const ov = P[m.userData.part]; if (!ov) continue;
    if (ov.hide) m.visible = false;
    if (ov.color) { const mk = makers.get(m.material); if (mk) m.material = mk(ov.color); else if (m.userData.part === 'counter') m.material = topMat({ topmat: 'slate', color: ov.color }); }
  }
  for (const [key, ov] of Object.entries(P)) {                          // 單片改尺寸、微調位置
    if (!(ov.w > 0 || ov.h > 0 || ov.d > 0 || ov.dx || ov.dy || ov.dz)) continue;
    const ms = g.children.filter(m => m.userData.part === key); if (!ms.length) continue;
    const body = ms.filter(m => !isTrim(m, makers)), b = partLocalBox(body.length ? body : ms), sz = b.getSize(new V3());
    const kx = ov.w > 0 && sz.x > 0.01 ? ov.w / sz.x : 1, ky = ov.h > 0 && sz.y > 0.01 ? ov.h / sz.y : 1, kz = ov.d > 0 && sz.z > 0.01 ? ov.d / sz.z : 1;
    // 固定哪一邊：左側板固定外側、右側板固定外側，其他左右置中；高度固定底部（頂板、檯面固定頂部）；深度固定背面（門片、抽屜面板固定正面）
    const front = /^(d|f|rail)/.test(key);
    const ax = key === 'L' ? b.min.x : key === 'R' ? b.max.x : (b.min.x + b.max.x) / 2, ay = key === 'top' || key === 'counter' ? b.max.y : b.min.y, az = front ? b.max.z : b.min.z;
    for (const m of ms) {
      const trim = body.length && !body.includes(m);                    // 把手、溝槽：跟著板子移動，但不放大、不變厚
      m.position.set(ax + (m.position.x - ax) * kx + (ov.dx || 0), ay + (m.position.y - ay) * ky + (ov.dy || 0), (trim ? m.position.z : az + (m.position.z - az) * kz) + (ov.dz || 0));
      if (!trim) m.scale.set(m.scale.x * kx, m.scale.y * ky, m.scale.z * kz);
    }
  }
}
function partSize(it, key) {                                            // 目前這片板材的寬、高、深（cm）
  const g = objById.get(it.id); if (!g) return null;
  const ms = g.children.filter(m => m.userData.part === key); if (!ms.length) return null;
  const body = ms.filter(m => !m.userData.trim), sz = partLocalBox(body.length ? body : ms).getSize(new V3()), r1 = v => Math.round(v * 10) / 10;
  return { w: r1(sz.x), h: r1(sz.y), d: r1(sz.z) };
}
function partName(k, custom) {                                          // custom：自訂櫃體以「第幾格」命名
  const fixed = { kick: '踢腳板', L: '左側板', R: '右側板', top: '頂板', bottom: '底板', back: '背板', counter: '檯面' };
  if (fixed[k]) return fixed[k];
  let m = /^f(\d+)-(\d+)$/.exec(k); if (m) return custom ? `第 ${+m[1] + 1} 格抽屜面板 ${+m[2] + 1}` : `抽屜面板 ${+m[1] + 1}-${+m[2] + 1}`;
  m = /^d(\d+)-(\d+)$/.exec(k); if (m) return custom ? `第 ${+m[1] + 1} 格門片 ${+m[2] + 1}` : `門片 ${+m[2] + 1}` + (+m[1] ? `（第 ${+m[1] + 1} 段）` : '');
  if (/^rail/.test(k)) return '上軌道';
  m = /^mid(\d+)$/.exec(k); if (m) return `中立板 ${+m[1]}`;
  m = /^s(\d+)-(\d+)$/.exec(k); if (m) return `第 ${+m[1] + 1} 格層板 ${+m[2] + 1}`;
  m = /^hat(\d+)$/.exec(k); if (m) return `第 ${+m[1] + 1} 格帽架層板`;
  m = /^rod(\d+)$/.exec(k); if (m) return `第 ${+m[1] + 1} 格吊衣桿`;
  m = /^dz(\d+)$/.exec(k); if (m) return `第 ${+m[1] + 1} 格抽屜上蓋板`;
  return k;
}
const partKeys = it => { const g = objById.get(it.id), out = []; if (g) for (const m of g.children) { const k = m.userData.part; if (k && !out.includes(k)) out.push(k); } for (const k of Object.keys(it.parts || {})) if (it.parts[k].hide && !out.includes(k)) out.push(k); return out; };
/* ---------- 自訂櫃體：每一格可自行設定寬度、門片、層板、抽屜、吊衣桿 ---------- */
const CC_DOORS = [opt('swing', '開門'), opt('glass', '玻璃門'), opt('none', '無門')];
const CC_BASE = { key: 'base', label: '底座', list: [opt('kick', '踢腳板'), opt('floor', '落地'), opt('float', '懸空 15cm')] };
const CC_TOP = { key: 'top', label: '檯面', list: [opt('none', '無檯面', { c3: null }), opt('stone', '石材檯面', { c3: '檯面顏色' })] };
const CC_OPTS = [CC_BASE, CC_TOP, SC_HANDLE, SC_FINISH, SC_BODY];
const ccDefCol = (T, i) => T.empty ? { wd: 0, door: 'none', sh: 0, dr: 0, rod: 0 } : ({ wd: 0, door: 'swing', sh: T.h > 150 ? 4 : 1, dr: 0, rod: 0, ...((T.defCols || [])[i] || {}) });   // 空櫃體：新增的格子也是空的
function ccCols(it) {
  const T = TYPES[it.type];
  if (!Array.isArray(it.cols) || !it.cols.length) it.cols = Array.from({ length: (T.defCols || []).length || Math.max(1, Math.round(it.w / 60)) }, (_, i) => ccDefCol(T, i));
  return it.cols;
}
const isCab = T => !!T && (T.build === buildSysCab || T.build === buildCustomCab);
const cabLike = T => isCab(T) || (!!T && !T.acc && /櫃|書架|廚具/.test(T.name));   // 櫃子類（含家具庫的櫃子）
const wallable = T => !!T && !T.acc && !T.ceil && !T.flat && T.cat !== '窗簾';        // 可以靠牆擺的家具（排除櫃內配件、吊掛燈具、地毯、窗簾）
// 櫃體幾何（櫃子自身座標）：底座高度、頂部、每一格的位置與抽屜區
function cabGeo(it) {
  const T = TYPES[it.type], t = thickOf(it), { w, h } = it;
  let base, hb, cols;
  if (T.custom) { const b = it.base || 'kick'; base = (b === 'kick' ? 8 : 0) + (b === 'float' ? 15 : 0); hb = it.top === 'stone' ? h - 4 : h; cols = ccCols(it); }
  else { base = (T.kick ? 8 : 0) + (T.floatBottom || 0); hb = T.counter ? h - 4 : h; const dr = parseInt(it.drawers || 0, 10); cols = Array.from({ length: it.interior ? 1 : T.ncol || Math.max(1, Math.round(w / 60)) }, () => ({ wd: 0, dr })); }
  const H = hb - base, n = cols.length, free = w - 2 * t - (n - 1) * t;
  const fixed = cols.reduce((a, c) => a + (c.wd > 0 ? c.wd : 0), 0), nf = cols.filter(c => !(c.wd > 0)).length;
  const scale = fixed > 0 && fixed > free - nf * 10 ? Math.max(0.05, free - nf * 10) / fixed : (nf === 0 && fixed > 0 ? free / fixed : 1), rest = free - fixed * scale;
  let x = -w / 2 + t;
  const spans = cols.map((c, i) => {
    const cw = c.wd > 0 ? c.wd * scale : Math.max(10, rest / nf), dr = c.dr || 0;
    const drH = T.drawerFull && dr ? H / dr : Math.min(T.custom ? 20 : 22, (H - 10) / Math.max(1, dr + 1));
    const sp = { i, c, x0: x, x1: x + cw, cx: x + cw / 2, cw, dr, drH, zoneTop: base + dr * drH };
    x += cw + t; return sp;
  });
  return { t, base, hb, H, spans };
}
function buildCustomCab(it) {
  const g = new THREE.Group(), { w, d, h } = it, G = cabGeo(it), { t, base: y0, hb, H } = G;
  const fin = it.finish || 'wood', bf = it.bodyfin || 'plain', handle = it.handle || 'bar';
  const DoorM = fin === 'plain' ? mat(it.color, 0.75) : surfMat(fin === 'stone' ? 'slate' : fin, it.color);
  const BodyM = bf === 'plain' ? mat(it.color2, 0.75) : surfMat('wood', it.color2);
  const Hd = mat('#9a9da2', 0.3, 0.8), dark = mat('#3b3632', 0.85);
  const DT = doorOf(it), bd = d - 2, bz = -1, zf = d / 2 - DT / 2, inside = sysOpts.inside;   // DT：門片、抽屜面板厚度
  let pk = null, pn = 0; const part = k => { if (pk) for (let i = pn; i < g.children.length; i++) g.children[i].userData.part = pk; pn = g.children.length; pk = k; };
  const done = () => { part(null); cabParts(it, g, new Map([[DoorM, c => fin === 'plain' ? mat(c, 0.75) : surfMat(fin === 'stone' ? 'slate' : fin, c)], [BodyM, c => bf === 'plain' ? mat(c, 0.75) : surfMat('wood', c)], [dark, c => mat(c, 0.85)], [Hd, c => mat(c, 0.3, 0.8)]])); return g; };
  part('kick');
  if ((it.base || 'kick') === 'kick') B(g, w - 4, 8, d - 8, 0, 4, -3, dark);   // 踢腳板
  for (const s of [-1, 1]) { part(s < 0 ? 'L' : 'R'); B(g, t, H, bd, s * (w / 2 - t / 2), y0 + H / 2, bz, BodyM); }
  part('top'); B(g, w, t, bd, 0, hb - t / 2, bz, BodyM);
  part('bottom'); B(g, w - 2 * t, t, bd, 0, y0 + t / 2, bz, BodyM);
  part('back'); B(g, w - 2 * t, H - 2 * t, backOf(it), 0, y0 + H / 2, -d / 2 + backOf(it) / 2, BodyM);
  part(null);
  const own = !it.interior;                                             // 舊檔：內部直接畫在櫃子上；新櫃：內部是可移動的配件
  if (own) G.spans.forEach((sp, i) => { if (i) { part('mid' + i); B(g, t, H - 2 * t, bd - 1, sp.x0 - t / 2, y0 + H / 2, bz - 0.5, BodyM); } });
  part(null);
  const yB = hb - t;
  for (const sp of G.spans) {
    const { c, cx, cw, dr } = sp, yA = sp.zoneTop + (dr ? t : 0), ci = sp.i;
    if (dr) { part('dz' + ci); B(g, cw, t, bd - 1, cx, sp.zoneTop + t / 2, bz - 0.5, BodyM); }
    part(null);
    if (!own) continue;
    let shelfTop = yB;
    if (c.rod) {
      const hat = Math.max(yA + 40, yB - 30);
      if (hat < yB - 5) { part('hat' + ci); B(g, cw - 0.4, t, bd - 3, cx, hat, bz - 0.5, BodyM); }
      part('rod' + ci);
      const r = C(g, 1.2, 1.2, cw - 1, cx, hat - 6, bz, Hd, 12); r.rotation.z = Math.PI / 2;
      shelfTop = Math.max(yA, hat - 110);
    }
    const sh = c.sh || 0;
    if (sh && shelfTop - yA > 15) for (let k = 1; k <= sh; k++) { part('s' + ci + '-' + (k - 1)); B(g, cw - 0.4, t, bd - 3, cx, yA + (shelfTop - yA) * k / (sh + 1), bz - 0.5, BodyM); }
    part(null);
  }
  if (it.top === 'stone') { part('counter'); B(g, w + 1, 4, d + 1, 0, h - 2, 0, topMat({ topmat: 'slate', color: it.color3 || '#e9e6e1' })); part(null); }
  if (inside) return done();
  const hBar = (x, y, len) => B(g, len, 1.2, 1.5, x, y, d / 2 + 0.7, Hd);
  G.spans.forEach((sp, i) => {
    const { c, dr, drH } = sp, last = i === G.spans.length - 1;
    const fx0 = i === 0 ? -w / 2 : sp.x0 - t / 2, fx1 = last ? w / 2 : sp.x1 + t / 2, fw = fx1 - fx0, fcx = (fx0 + fx1) / 2;
    for (let k = 0; k < dr; k++) {                                         // 抽屜面板
      const y = y0 + drH * (k + 0.5);
      part('f' + i + '-' + k);
      B(g, fw - 0.4, drH - 0.4, DT, fcx, y, zf, DoorM);
      if (handle === 'bar') hBar(fcx, y + drH * 0.22, Math.min(20, fw * 0.4));
      else if (handle === 'groove') B(g, fw - 0.4, 0.8, 0.3, fcx, y + drH / 2 - 0.8, d / 2 + 0.05, dark);
    }
    part(null);
    if (c.door === 'none') return;
    const yD = sp.zoneTop, DH = hb - yD; if (DH < 5) return;
    const cy = yD + DH / 2, tall = DH > 120, hl = Math.min(tall ? 30 : 14, DH * 0.35);
    const nd = fw > 65 ? 2 : 1, dw = fw / nd;
    for (let k = 0; k < nd; k++) {
      const x = fx0 + dw * (k + 0.5);
      // 單門的把手開在靠櫃子中央那一側，雙門開在中間
      const side = nd === 2 ? (k === 0 ? 1 : -1) : (fcx < 0 ? 1 : -1);
      part('d' + i + '-' + k);
      if (c.door === 'glass') {
        const f = 4;
        B(g, dw - 0.4, f, DT, x, hb - f / 2 - 0.2, zf, DoorM); B(g, dw - 0.4, f, DT, x, yD + f / 2 + 0.2, zf, DoorM);
        for (const s2 of [-1, 1]) B(g, f, DH - 0.4, DT, x + s2 * (dw / 2 - f / 2 - 0.2), cy, zf, DoorM);
        glassPane(g, dw - 2 * f, DH - 2 * f, 0.5, x, cy, zf);
      } else B(g, dw - 0.4, DH - 0.4, DT, x, cy, zf, DoorM);
      const hx = x + side * (dw / 2 - 4), hy = (it.elev || 0) > 100 ? yD + 4 + hl / 2 : tall ? Math.min(yD + 100, yD + DH * 0.5) : hb - 5 - hl / 2;
      if (handle === 'bar') B(g, 1.5, hl, 2, hx, hy, d / 2 + 1, Hd);
      else if (handle === 'groove') B(g, 0.8, DH * 0.9, 0.3, x + side * (dw / 2 - 0.8), cy, d / 2 + 0.05, dark);
    }
    part(null);
  });
  return done();
}
/* ---------- 系統櫃配件：可放進櫃內，尺寸與高度都能調整 ---------- */
function buildScAcc(it) {
  const g = new THREE.Group(), { w, d, h } = it, kind = TYPES[it.type].acc;
  const Bd = mat(it.color, 0.75), Mt = surfMat('metal', ['rod', 'basket', 'pants'].includes(kind) ? it.color : '#b8bcc0');
  if (kind === 'shelf' || kind === 'divider' || kind === 'mid') { B(g, w, h, d, 0, h / 2, 0, Bd); return g; }
  if (kind === 'rod') {
    const r = C(g, Math.min(h, d) / 2, Math.min(h, d) / 2, w - 1, 0, h / 2, 0, Mt, 16); r.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) B(g, 0.6, h + 2, h + 2, s * (w / 2 - 0.3), h / 2, 0, Mt);
    return g;
  }
  if (kind === 'drawer') {
    B(g, w, 1.2, d - 2, 0, 0.6, -1, Bd);
    for (const s of [-1, 1]) B(g, 1.2, h - 2, d - 2, s * (w / 2 - 0.6), (h - 2) / 2 + 1.2, -1, Bd);
    B(g, w, h - 2, 1.2, 0, (h - 2) / 2 + 1.2, -d / 2 + 0.6, Bd);
    B(g, w, h, 1.8, 0, h / 2, d / 2 - 0.9, Bd);
    B(g, Math.min(14, w * 0.3), 1.2, 0.4, 0, h - 3, d / 2 + 0.05, mat('#3b3632', 0.85));
    return g;
  }
  if (kind === 'basket') {
    for (const s of [-1, 1]) { B(g, 0.8, h, d, s * (w / 2 - 0.4), h / 2, 0, Mt); B(g, w, h, 0.8, 0, h / 2, s * (d / 2 - 0.4), Mt); }
    for (let x = -w / 2 + 4; x < w / 2 - 2; x += 4) B(g, 0.35, 0.35, d, x, 0.3, 0, Mt);
    for (let y = 4; y < h - 1; y += 5) for (const s of [-1, 1]) B(g, w, 0.3, 0.3, 0, y, s * (d / 2 - 0.4), Mt);
    return g;
  }
  if (kind === 'pants') {
    for (const s of [-1, 1]) B(g, 1, h, d, s * (w / 2 - 0.5), h / 2, 0, Mt);
    for (let z = -d / 2 + 3; z < d / 2 - 1; z += 4) { const r = C(g, 0.5, 0.5, w - 1, 0, h - 1, z, Mt, 8); r.rotation.z = Math.PI / 2; }
    return g;
  }
  return g;
}
// 配件放進選取中的系統櫃：自動挑較空的那一格，抽屜往上疊、層板放在最大空隙中間
function fitAccessoryInto(it, cab) {
  const T = TYPES[it.type], G = cabGeo(cab), t = G.t, E = cab.elev || 0;
  const top = E + G.hb - t, innerD = cab.d - 4 - Math.max(0, backOf(cab) - 0.8);
  const r = cab.rot * deg, cs = Math.cos(r), sn = Math.sin(r);
  // 找出已經放在這個櫃子裡的配件，換算成櫃子座標
  const inCab = [];
  for (const o of state.items) {
    if (o === it || !TYPES[o.type].acc) continue;
    const ox = o.x - cab.x, oz = o.z - cab.z, lx = ox * cs + oz * sn, lz = -ox * sn + oz * cs;
    if (Math.abs(lx) > cab.w / 2 || Math.abs(lz) > cab.d / 2 || o.elev < E + G.base - 1 || o.elev > top + 1) continue;
    inCab.push({ o, lx });
  }
  // 已加的中立板會把那一格再分成左右兩格
  let spans = G.spans;
  for (const { o, lx } of inCab) if (TYPES[o.type].acc === 'mid') {
    spans = spans.flatMap(sp => lx > sp.x0 + 5 && lx < sp.x1 - 5
      ? [{ ...sp, x1: lx - o.w / 2, cw: lx - o.w / 2 - sp.x0, cx: (sp.x0 + lx - o.w / 2) / 2 }, { ...sp, x0: lx + o.w / 2, cw: sp.x1 - lx - o.w / 2, cx: (lx + o.w / 2 + sp.x1) / 2 }]
      : [sp]);
  }
  const cols = spans.map(() => []);
  for (const { o, lx } of inCab) { if (TYPES[o.type].acc === 'mid') continue; let c = spans.findIndex(sp => lx >= sp.x0 - t && lx <= sp.x1 + t); if (c < 0) c = 0; cols[c].push(o); }
  const kind = T.acc, stackK = ['drawer', 'basket', 'pants'];
  const same = c => cols[c].filter(o => stackK.includes(kind) ? stackK.includes(TYPES[o.type].acc) : TYPES[o.type].acc === kind).length;
  let col = 0;
  if (kind === 'mid') { for (let c = 1; c < spans.length; c++) if (spans[c].cw > spans[col].cw) col = c; } // 中立板放在最寬的那一格中間
  else for (let c = 1; c < spans.length; c++) if (same(c) < same(col)) col = c;
  const sp = spans[col], innerW = sp.cw, y0 = E + sp.zoneTop + (sp.dr ? t : 0);   // 避開抽屜區
  const hasRod = cab.rod === 'yes' || !!(sp.c && sp.c.rod);
  const dx = sp.cx, dz = -1;
  it.x = cab.x + dx * cs - dz * sn; it.z = cab.z + dx * sn + dz * cs; it.rot = cab.rot;
  const inCol = cols[col];
  if (kind === 'shelf') {
    it.w = Math.round(innerW - 0.4); it.d = Math.round(innerD - 1); it.thick = String(t); it.h = t;
    const ys = [y0 + t, ...inCol.map(o => o.elev + (stackK.includes(TYPES[o.type].acc) ? o.h : 0)).filter(y => y > y0), top].sort((a, b) => a - b);
    let best = 0; for (let i = 1; i < ys.length - 1; i++) if (ys[i + 1] - ys[i] > ys[best + 1] - ys[best]) best = i;
    it.elev = Math.round((ys[best] + ys[best + 1]) / 2);
  } else if (kind === 'mid') { it.thick = String(t); it.w = t; it.d = Math.round(innerD - 1); it.h = Math.round(top - y0 - t); it.elev = Math.round(y0 + t); }
  else if (kind === 'divider') { it.thick = String(t); it.w = t; it.d = Math.round(innerD - 1); it.h = Math.min(35, Math.round(top - y0 - t)); it.elev = Math.round(y0 + t); } // 短隔板，放在層板上分隔物品
  else if (kind === 'rod') { it.w = Math.round(innerW - 1); it.elev = Math.round(same(col) || hasRod ? y0 + (top - y0) / 2 : top - 10); } // 第二支桿放在中段（上下兩段吊衣）
  else if (stackK.includes(kind)) {
    it.w = Math.round(innerW - 1); it.d = Math.round(innerD - 3);
    const stack = inCol.filter(o => stackK.includes(TYPES[o.type].acc));
    it.elev = Math.round(stack.length ? Math.max(...stack.map(o => o.elev + o.h)) + 1 : y0 + t + 1);
  }
}
// 櫃內配件跟著櫃子移動、旋轉：記下配件相對櫃子的位置
function accInside(cab) {
  if (!isCab(TYPES[cab.type])) return null;
  const r = cab.rot * deg, cs = Math.cos(r), sn = Math.sin(r), out = [];
  for (const o of state.items) {
    if (!TYPES[o.type].acc) continue;
    const ox = o.x - cab.x, oz = o.z - cab.z, lx = ox * cs + oz * sn, lz = -ox * sn + oz * cs;
    const own = o.auto != null || o.host != null ? (o.auto === cab.id || o.host === cab.id)   // 記得自己屬於哪座櫃子
      : Math.abs(lx) <= cab.w / 2 && Math.abs(lz) <= cab.d / 2 && o.elev >= (cab.elev || 0) - 1 && o.elev <= (cab.elev || 0) + cab.h + 1;
    if (own) out.push({ o, lx, lz, dr: o.rot - cab.rot });
  }
  return out.length ? out : null;
}
// 配件在櫃內的相對位置（比例），櫃子改尺寸、移動時依這個重新擺放，輸入到一半的數字也不會弄丟
function relOf(c, o) {
  const G = cabGeo(c), t = G.t, E = c.elev || 0, { lx, lz } = cabLocal(c, o);
  const ix = -c.w / 2 + t, iw = Math.max(1, c.w - 2 * t), iy = E + G.base + t, ih = Math.max(1, G.hb - G.base - 2 * t);
  return { fx0: (lx - o.w / 2 - ix) / iw, fx1: (lx + o.w / 2 - ix) / iw, fcx: (lx - ix) / iw, fy: (o.elev - iy) / ih, fh: o.h / ih, back: lz - o.d / 2 + c.d / 2, dd: o.d - c.d };
}
function syncRel() {                                                   // 每次確定操作後記下配件的相對位置
  for (const r of state.items) if (r.rideOn != null) {
    const c = getItem(r.rideOn); if (!c) { delete r.rideOn; continue; }
    const { lx, lz } = cabLocal(c, r); r.rideRel = { lx, lz, dr: r.rot - c.rot };
    if (r.rideSingle && Math.abs(r.w - c.w) > 0.5) r.rideSingle = false;    // 使用者自己改過寬度就不再自動同寬
  }
  for (const c of state.items) if (isCab(TYPES[c.type])) for (const { o } of accInside(c) || []) {
    if (o.auto == null && o.host == null) o.host = c.id;
    o.rel = relOf(c, o);
  }
}
function moveRiders(c) {                                              // 衣櫃上方的背櫃跟著衣櫃走
  for (const r of state.items) {
    if (r.rideOn !== c.id) continue;
    const R = r.rideRel || { lx: 0, lz: 0, dr: 0 }, a = c.rot * deg;
    if (r.rideSingle) { r.w = c.w; r.d = c.d; }
    r.elev = (c.elev || 0) + c.h; r.rot = ((c.rot + R.dr) % 360 + 360) % 360;
    r.x = Math.round((c.x + R.lx * Math.cos(a) - R.lz * Math.sin(a)) * 10) / 10; r.z = Math.round((c.z + R.lx * Math.sin(a) + R.lz * Math.cos(a)) * 10) / 10;
    buildItem(r); refitMembers(r);
  }
}
function followCab(c) { refitMembers(c); moveRiders(c); }
function refitMembers(c) {
  if (!isCab(TYPES[c.type])) return;
  const G = cabGeo(c), t = G.t, E = c.elev || 0, r1 = v => Math.round(v * 10) / 10;
  const ix = -c.w / 2 + t, iw = Math.max(1, c.w - 2 * t), iy = E + G.base + t, ih = Math.max(1, G.hb - G.base - 2 * t);
  for (const { o, dr } of accInside(c) || []) {
    const R = o.rel; if (!R) continue;
    const k = TYPES[o.type].acc;
    let lx = ix + R.fcx * iw;
    if (k !== 'mid' && k !== 'divider') { const x0 = ix + R.fx0 * iw, x1 = ix + R.fx1 * iw; o.w = Math.max(1, r1(x1 - x0)); lx = (x0 + x1) / 2; }
    if (k === 'mid') o.h = Math.max(1, r1(R.fh * ih));
    o.elev = r1(iy + R.fy * ih);
    if (k !== 'rod') o.d = Math.max(1, r1(c.d + R.dd));
    o.rot = ((c.rot + dr) % 360 + 360) % 360;
    buildItem(o); setCabLocal(c, o, lx, -c.d / 2 + R.back + o.d / 2);
  }
}
// 配件所在的櫃子，以及櫃內座標換算
function hostCab(o) {
  if (!TYPES[o.type].acc) return null;
  if (o.auto != null || o.host != null) { const c = getItem(o.auto ?? o.host); return c && isCab(TYPES[c.type]) ? c : null; }
  for (const c of state.items) {
    if (c === o || !isCab(TYPES[c.type])) continue;
    const r = c.rot * deg, ox = o.x - c.x, oz = o.z - c.z, lx = ox * Math.cos(r) + oz * Math.sin(r), lz = -ox * Math.sin(r) + oz * Math.cos(r);
    if (Math.abs(lx) <= c.w / 2 && Math.abs(lz) <= c.d / 2 && o.elev >= (c.elev || 0) - 1 && o.elev <= (c.elev || 0) + c.h + 1) return c;
  }
  return null;
}
const cabLocal = (c, o) => { const r = c.rot * deg, ox = o.x - c.x, oz = o.z - c.z; return { lx: ox * Math.cos(r) + oz * Math.sin(r), lz: -ox * Math.sin(r) + oz * Math.cos(r) }; };
function setCabLocal(c, o, lx, lz) {
  const r = c.rot * deg;
  o.x = Math.round((c.x + lx * Math.cos(r) - lz * Math.sin(r)) * 10) / 10; o.z = Math.round((c.z + lx * Math.sin(r) + lz * Math.cos(r)) * 10) / 10;
  const g = objById.get(o.id); if (g) g.position.set(o.x, o.elev || 0, o.z);
}
// 中立板旁邊貼著它的層板、抽屜等（高度有重疊），移動中立板時一起改寬度
function midLinks(c, mid) {
  const m = cabLocal(c, mid).lx, out = [];
  for (const { o, lx } of accInside(c) || []) {
    if (o === mid || TYPES[o.type].acc === 'mid') continue;
    if (o.elev > mid.elev + mid.h || o.elev + o.h < mid.elev) continue;
    const x0 = lx - o.w / 2, x1 = lx + o.w / 2;
    if (Math.abs(x0 - (m + mid.w / 2)) < 2.5) out.push({ o, side: 'L', fixed: x1 });       // 在中立板右邊
    else if (Math.abs(x1 - (m - mid.w / 2)) < 2.5) out.push({ o, side: 'R', fixed: x0 });  // 在中立板左邊
  }
  return out;
}
// 在櫃內左右移動配件；中立板會帶著兩側配件一起調整寬度
function slideAcc(c, o, lx, links) {
  const t = thickOf(c), lz = cabLocal(c, o).lz;
  let lo = -c.w / 2 + t + o.w / 2, hi = c.w / 2 - t - o.w / 2;
  if (links) for (const k of links) { if (k.side === 'L') hi = Math.min(hi, k.fixed - 5 - o.w / 2); else lo = Math.max(lo, k.fixed + 5 + o.w / 2); }
  lx = Math.round(clamp(lx, lo, Math.max(lo, hi)) * 10) / 10;
  setCabLocal(c, o, lx, lz);
  if (links) for (const k of links) {
    const a = k.side === 'L' ? lx + o.w / 2 : k.fixed, b = k.side === 'L' ? k.fixed : lx - o.w / 2;
    k.o.w = Math.round((b - a) * 10) / 10;
    buildItem(k.o); setCabLocal(c, k.o, (a + b) / 2, cabLocal(c, k.o).lz);
  }
}
// 系統櫃內部（中立板、層板、帽架、吊衣桿）拆成可移動的配件，auto 記住屬於哪座櫃子
// 修復舊資料：櫃內配件被留在櫃體外面（先前「先選牆再加櫃體」時櫃體搬走、配件沒跟上，分開的位置還被存了下來）→ 排回櫃內
function fixStrayParts() {
  let n = 0;
  for (const c of [...state.items]) {
    if (!TYPES[c.type] || !isCab(TYPES[c.type])) continue;
    if (TYPES[c.type].custom && !c.interior) { for (const k of Object.keys(c.parts || {})) if (/^(mid|s\d|hat|rod)/.test(k)) delete c.parts[k]; genInterior(c); n++; }   // 舊的自訂櫃體：櫃內層板轉成可點選的配件
    const r = c.rot * deg, cs = Math.cos(r), sn = Math.sin(r);
    const stray = state.items.filter(o => TYPES[o.type].acc && (o.auto === c.id || o.host === c.id)).filter(o => { const ox = o.x - c.x, oz = o.z - c.z; return Math.abs(ox * cs + oz * sn) > c.w / 2 + 2 || Math.abs(-ox * sn + oz * cs) > c.d / 2 + 2; });
    // 中心還在櫃內、但前後或左右凸出櫃體的配件（舊版複製時往旁邊偏了 25cm 又拉不回來）：推回櫃內
    const t = thickOf(c);
    for (const o of state.items) {
      if (!TYPES[o.type].acc || (o.auto !== c.id && o.host !== c.id) || stray.includes(o)) continue;
      const ox = o.x - c.x, oz = o.z - c.z, lx = ox * cs + oz * sn, lz = -ox * sn + oz * cs;
      const mx = Math.max(0, c.w / 2 - t - o.w / 2), mz = Math.max(0, (c.d - o.d) / 2);
      if (Math.abs(lx) <= mx + 1 && Math.abs(lz) <= mz + 1) continue;
      delete o.rel; o.rot = c.rot; buildItem(o); setCabLocal(c, o, clamp(lx, -mx, mx), clamp(lz, -mz, Math.min(mz, -Math.min(1.5, mz)))); n++;
    }
    if (!stray.length) continue;
    n++;
    if (stray.some(o => o.auto === c.id)) genInterior(c);               // 自動產生的層板、抽屜、吊衣桿：重新排一次
    for (const o of stray) if (o.host === c.id && state.items.includes(o)) { delete o.rel; o.rot = c.rot; fitAccessoryInto(o, c); buildItem(o); }   // 自己加的配件：放回這座櫃子
  }
  if (n) syncRel();
  return n;
}
function dropAuto(cab) {
  for (const o of state.items) if (o.auto === cab.id) { const g = objById.get(o.id); if (g) { furnGroup.remove(g); disposeObj(g); objById.delete(o.id); } }
  state.items = state.items.filter(o => o.auto !== cab.id);
}
function genInterior(cab) {
  const T = TYPES[cab.type]; if (!isCab(T) || T.acc) return;
  dropAuto(cab); cab.interior = 1; if (!T.custom) cab.ncol = T.ncol || Math.max(1, Math.round(cab.w / 60)); buildItem(cab);
  const G = cabGeo(cab), t = G.t, E = cab.elev || 0, d = cab.d, y0 = G.base, H = G.H, n = cab.ncol;
  const cw = (cab.w - 2 * t - (n - 1) * t) / n;
  if (!T.custom) G.spans = Array.from({ length: n }, (_, i) => { const x0 = -cab.w / 2 + t + i * (cw + t); return { x0, x1: x0 + cw, cx: x0 + cw / 2, cw }; });
  const drawers = parseInt(cab.drawers || 0, 10), drH = T.drawerFull && drawers ? H / drawers : Math.min(22, (H - 10) / Math.max(1, drawers + 1));
  const yA = y0 + drawers * drH + t, yB = G.hb - t, shelves = parseInt(cab.shelves || 0, 10);
  const niches = (T.niches || []).map(([f0, f1]) => [y0 + H * f0, y0 + H * f1]);
  const mk = (type, lx, lz, w, dd, h, elev) => {
    const Ty = TYPES[type];
    const it = { id: state.nextId++, type, name: Ty.name, w, d: dd, h, color: Ty.acc === 'rod' ? Ty.color : cab.color2, color2: Ty.color2, rot: cab.rot, elev: Math.round(elev * 10) / 10, x: 0, z: 0, auto: cab.id };
    applyDefaults(it, Ty); if (Ty.acc !== 'rod') it.thick = String(t);
    state.items.push(it); buildItem(it); setCabLocal(cab, it, lx, lz);
  };
  G.spans.forEach((sp, i) => { if (i) mk('scAccMid', sp.x0 - t / 2, -1.5, t, d - 3, Math.round((H - 2 * t) * 10) / 10, E + y0 + t); });
  if (T.custom) {                                                       // 自訂櫃體：依「櫃內設計」每一格的設定產生層板、吊衣桿（都是可以點選、拖曳的配件）
    const r1 = v => Math.round(v * 10) / 10;
    for (const sp of G.spans) {
      const c = sp.c, a0 = sp.zoneTop + (sp.dr ? t : 0); let top = yB;
      if (c.rod) {
        const hat = Math.max(a0 + 40, yB - 30);
        if (hat < yB - 5) mk('scAccShelf', sp.cx, -1.5, r1(sp.cw - 0.4), d - 5, t, E + hat - t / 2);
        mk('scAccRod', sp.cx, -1, r1(sp.cw - 2), 3, 3, E + hat - 6 - 1.5);
        top = Math.max(a0, hat - 110);
      }
      const sh = c.sh || 0;
      if (sh && top - a0 > 15) for (let k = 1; k <= sh; k++) mk('scAccShelf', sp.cx, -1.5, r1(sp.cw - 0.4), d - 5, t, E + a0 + (top - a0) * k / (sh + 1) - t / 2);
    }
    return;
  }
  let shelfTop = yB, shelfBot = yA;
  if (cab.rod === 'yes') {
    const hat = yB - 30;
    for (const sp of G.spans) {
      mk('scAccShelf', sp.cx, -1.5, Math.round((sp.cw - 0.4) * 10) / 10, d - 5, t, E + hat - t / 2);
      mk('scAccRod', sp.cx, -1, Math.round((sp.cw - 2) * 10) / 10, 3, 3, E + hat - 6 - 1.5);
    }
    shelfTop = hat - 110;
  }
  // 內抽屜：疊在外抽屜上方（門片裡面），每一格各放；放不下就少放幾個，層板排在內抽屜上面
  const IH = 18, IG = 2, room = (cab.rod === 'yes' ? yB - 30 - 60 : yB) - yA;   // 有吊衣桿時上面留 60cm 掛衣服
  const idr = T.drawerFull && drawers ? 0 : Math.max(0, Math.min(parseInt(cab.idrawers || 0, 10) || 0, Math.floor((room - 4) / (IH + IG))));
  if (idr) {
    for (const sp of G.spans) for (let k = 0; k < idr; k++) {
      if (niches.some(([a, b]) => yA + k * (IH + IG) + IH > a - 2 && yA + k * (IH + IG) < b + 2)) continue;
      mk('scAccDrawer', sp.cx, -1, Math.round((sp.cw - 1) * 10) / 10, Math.max(10, d - 6), IH, E + yA + 1 + k * (IH + IG));
    }
    shelfBot = yA + 1 + idr * (IH + IG);
    if (cab.rod === 'yes') shelfTop = Math.max(shelfTop, shelfBot);       // 內抽屜比較高時，層板區不會被擠成負的
  }
  if (shelves && shelfTop - shelfBot > 20) for (const sp of G.spans) for (let k = 1; k <= shelves; k++) {
    const y = shelfBot + (shelfTop - shelfBot) * k / (shelves + 1);
    if (niches.some(([a, b]) => y > a - 2 && y < b + 2)) continue;
    mk('scAccShelf', sp.cx, -1.5, Math.round((sp.cw - 0.4) * 10) / 10, d - 5, t, E + y - t / 2);
  }
}
// 櫃子改尺寸（寬深高、離地）時，櫃內配件依比例跟著調整，之後使用者可再微調
function cabSnap(c) { return isCab(TYPES[c.type]) ? { w: c.w, d: c.d, h: c.h, elev: c.elev || 0, G: cabGeo(c), list: accInside(c) } : null; }
function cabResize(c, s) {
  if (!s || !s.list) return;
  const G = cabGeo(c), t = G.t, E = c.elev || 0;
  const ix0 = -s.w / 2 + s.G.t, iw0 = s.w - 2 * s.G.t, ix = -c.w / 2 + t, iw = c.w - 2 * t;
  const iy0 = s.elev + s.G.base + s.G.t, ih0 = s.G.hb - s.G.base - 2 * s.G.t, iy = E + G.base + t, ih = G.hb - G.base - 2 * t;
  const kx = iw0 > 0 ? iw / iw0 : 1, ky = ih0 > 0 ? ih / ih0 : 1, dd = c.d - s.d, r1 = v => Math.round(v * 10) / 10;
  for (const { o, lx, lz } of s.list) {
    const k = TYPES[o.type].acc;
    let nlx = ix + (lx - ix0) * kx;
    if (k !== 'mid' && k !== 'divider') { const x0 = ix + (lx - o.w / 2 - ix0) * kx, x1 = ix + (lx + o.w / 2 - ix0) * kx; o.w = r1(x1 - x0); nlx = (x0 + x1) / 2; }
    if (k === 'mid') o.h = r1(o.h * ky);
    o.elev = r1(iy + (o.elev - iy0) * ky);
    const back = lz - o.d / 2 + s.d / 2;                                  // 與背板的距離保持不變
    if (k !== 'rod') o.d = Math.max(1, r1(o.d + dd));
    buildItem(o); setCabLocal(c, o, nlx, -c.d / 2 + back + o.d / 2);
  }
}
function carryAcc(cab, list) {
  if (!list) return;
  const r = cab.rot * deg, cs = Math.cos(r), sn = Math.sin(r);
  for (const { o, lx, lz, dr } of list) {
    o.x = Math.round((cab.x + lx * cs - lz * sn) * 10) / 10; o.z = Math.round((cab.z + lx * sn + lz * cs) * 10) / 10;
    o.rot = ((cab.rot + dr) % 360 + 360) % 360;
    const g = objById.get(o.id); if (g) { g.position.set(o.x, o.elev || 0, o.z); g.rotation.y = -o.rot * deg; }
  }
}
const CATS = ['全部', '自家商品', '客廳', '餐廳', '臥室', '書房', '玄關', '衛浴', '窗簾', '燈具', '家電', '配件', '擺飾'];
const TYPES = {
  ownRecliner: { name: '131型沙發', cat: '自家商品', w: 276, d: 105, h: 105, color: '#b9bcc2', color2: '#86aecb', c1: '布料顏色', c2: '抱枕顏色', build: buildReclinerSofa, opts: [SEATS_OPT], def: { seats: '3' }, wall: true, own: true },
  ownDanSofa:  { name: '丹麥沙發', cat: '自家商品', w: 210, d: 90, h: 90, color: '#cfc8b8', color2: '#d9b382', c1: '布料顏色', c2: '木腳顏色', build: buildDanishSofa, opts: [SEATS_OPT], def: { seats: '2' }, wall: true, own: true },
  ownLetItBe:  { name: 'Let it be沙發', cat: '自家商品', w: 368, d: 267, h: 80, color: '#e3e1dc', color2: '#9a6038', c1: '布料顏色', c2: '底框皮革顏色', build: buildLetItBeSofa, opts: [SEATS_OPT_L, SIDE_OPT], def: { seats: '3', side: 'left' }, wall: true, own: true },
  ownRoundChaise: { name: '雷內沙發', cat: '自家商品', w: 300, d: 138, h: 73, color: '#dedad4', color2: '#6d6f73', color3: '#d49a2e', c1: '主座布料', c2: '貴妃布料', c3: '圓抱枕顏色', build: buildRoundChaiseSofa, opts: [SIDE_OPT, RCH_PIL_OPT], def: { side: 'left', rp: 'on' }, wall: true, own: true },
  own171:      { name: '171型沙發', cat: '自家商品', w: 285, d: 185, h: 90, color: '#8f9291', color2: '#b5b1b2', color3: '#232325', c1: '牛皮顏色', c2: '腰枕顏色', c3: '鐵腳顏色', build: build171Sofa, opts: [SEATS_OPT_L, SIDE_OPT], def: { seats: '2', side: 'right' }, wall: true, own: true },
  own120:      { name: '120型沙發', cat: '自家商品', w: 250, d: 90, h: 102, color: '#d3d2cf', color2: '#67666a', color3: '#55524f', c1: '布料顏色', c2: '合成皮顏色', c3: '金屬腳顏色', build: build120Sofa, opts: [SEATS_OPT], def: { seats: '3' }, wall: true, own: true },
  own120Ott:   { name: '120型腳椅', cat: '自家商品', w: 85, d: 90, h: 58, color: '#d3d2cf', color2: '#67666a', color3: '#55524f', c1: '布料顏色', c2: '合成皮顏色', c3: '金屬腳顏色', build: build120Ottoman, opts: [{ key: 'side', label: '扶手位置', list: [opt('right', '扶手在右'), opt('left', '扶手在左')] }], def: { side: 'right' }, own: true },
  ownAthena:   { name: '雅典娜沙發', cat: '自家商品', w: 392, d: 271, h: 87, color: '#969896', color2: '#7a4a2b', color3: '#4d4a48', c1: '牛皮顏色', c2: '扶手實木顏色', c3: '金屬腳顏色', build: buildAthenaSofa, opts: [SEATS_OPT_L, SIDE_OPT], def: { seats: '3', side: 'left' }, wall: true, own: true },
  ownFloatL:   { name: '103型沙發', cat: '自家商品', w: 306, d: 180, h: 95,  color: '#dcd6cf', color2: '#8e7472', color3: '#d9bd94', c1: '坐墊布料', c2: '底座布料', c3: '邊几木色', build: buildFloatLSofa, opts: [SEATS_OPT_L, SIDE_OPT], def: { seats: '2', side: 'left' }, wall: true, own: true },
  ownAmis:     { name: '阿美族床台', cat: '自家商品', w: 170, d: 206, h: 100, color: '#8d8c8a', color2: '#e6e1d4', color3: '#c9ccd0', c1: '床架布料', c2: '床頭靠墊布料', c3: '金屬腳顏色', build: buildAmisBed, opts: [BED_MATT_OPT], def: { matt: 'on' }, wall: true, own: true },
  ownMila:     { name: '米拉床台', cat: '自家商品', w: 163, d: 210, h: 110, color: '#c5cad2', color2: '#565a60', color3: '#b9b6b0', c1: '床頭皮革顏色', c2: '床架皮革顏色', c3: '不鏽鋼腳顏色', build: buildMilaBed, opts: [BED_MATT_OPT], def: { matt: 'on', fabric: 'leather' }, wall: true, own: true },
  ownEmma:     { name: 'Emma床台', cat: '自家商品', w: 154, d: 200, h: 107, color: '#8f9394', color2: '#1f1c1b', c1: '布料顏色', c2: '木腳顏色', build: buildEmmaBed, opts: [BED_MATT_OPT], def: { matt: 'on' }, wall: true, own: true },
  ownDanish:   { name: '丹麥餐桌', cat: '自家商品', w: 180, d: 90, h: 75, color: '#f2f0ec', color2: '#dcc39c', c1: '桌面顏色', c2: '木腳顏色', build: buildDanishTable, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  ownPencil:   { name: '鉛筆腳餐桌', cat: '自家商品', w: 150, d: 85, h: 75, color: '#f2f0ec', color2: '#1f1f1f', c1: '桌面顏色', c2: '鐵件顏色', build: buildPencilTable, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  ownHeart:    { name: '愛心腳餐桌', cat: '自家商品', w: 240, d: 105, h: 75, color: '#6f6862', color2: '#3d322d', color3: '#1b1b1c', c1: '陶板顏色', c2: '金屬顏色', c3: '底板顏色', build: buildHeartTable, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  ownVChair:   { name: 'V型餐椅', cat: '自家商品', w: 46, d: 62, h: 84, color: '#b8aa9e', color2: '#dcc39c', c1: '皮面顏色', c2: '木腳顏色', build: buildVChair, own: true },
  ownMiyazaki: { name: '宮崎餐椅', cat: '自家商品', w: 50, d: 56, h: 74, color: '#a9a39c', color2: '#e6cfa6', c1: '皮面顏色', c2: '木腳顏色', build: buildMiyazakiChair, own: true },
  ownDoll:     { name: '娃娃餐椅', cat: '自家商品', w: 50, d: 49.5, h: 84, color: '#8a7868', color2: '#8a7868', color3: '#1e1e20', c1: '內側皮革（坐面與椅背正面）', c2: '外側皮革（椅背背面與椅底）', c3: '金屬腳顏色', build: buildDollChair, own: true },
  ownCY127:    { name: 'CY127餐椅', cat: '自家商品', w: 45, d: 57, h: 84.5, color: '#9c8a68', color2: '#4f4944', color3: '#1c1c1e', c1: '內側皮革（坐墊與椅背正面）', c2: '外側皮革（椅背背面）', c3: '金屬腳顏色', build: buildCY127Chair, own: true },
  ownDanishBench: { name: '丹麥長凳', cat: '自家商品', w: 150, d: 38, h: 45, color: '#a9a39c', color2: '#dcb98c', c1: '皮面顏色', c2: '木腳顏色', build: buildDanishBench, own: true },
  ownOvalSide: { name: '橢圓陶板邊几', cat: '自家商品', w: 34, d: 56, h: 52, color: '#1f1f21', color2: '#1f1f1f', c1: '桌面顏色', c2: '金屬顏色', build: buildOvalSideTable, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  ownDali:     { name: '大理書桌', cat: '自家商品', w: 150, d: 70, h: 75, color: '#2f2b2a', color2: '#c9c8cc', color3: '#1d1e21', c1: '桌面木頭顏色', c2: '抽屜烤漆顏色', c3: '金屬顏色（把手與腳座）', build: buildDaliDesk, opts: [DESK_SIDE_OPT], def: { side: 'left' }, wall: true, own: true },
  ownEgger:    { name: '艾格書桌', cat: '自家商品', w: 150, d: 70, h: 75, color: '#2a2625', color2: '#6b4a38', color3: '#1d1e21', c1: '桌面木頭顏色', c2: '抽屜木頭顏色', c3: '金屬顏色（把手與腳座）', build: buildEggerDesk, opts: [DESK_SIDE_OPT], def: { side: 'right' }, wall: true, own: true },
  ownHemingway: { name: '海明威化妝台', cat: '自家商品', w: 140, d: 55, h: 126, color: '#77726f', color2: '#c9a659', c1: '烤漆顏色', c2: '金屬顏色（把手、腳座、鏡框）', build: buildHemingwayVanity, opts: [VAN_SIDE_OPT, VAN_MIRROR_OPT], def: { side: 'left', mir: 'on' }, wall: true, own: true },
  ownPuff:     { name: '泡芙化妝椅', cat: '自家商品', w: 47, d: 52, h: 65, color: '#ecd2c0', color2: '#b98289', color3: '#4a3f3a', c1: '椅身布料', c2: '坐墊與椅背布料', c3: '底座顏色', build: buildPuffStool, own: true },
  ownTawu:     { name: '塔烏床頭櫃', cat: '自家商品', w: 50, d: 50, h: 51, color: '#f2f0ec', color2: '#1c1b1a', color3: '#1b1b1c', c1: '陶板顏色', c2: '木頭顏色', c3: '底板顏色', build: buildTawuNight, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  ownTawuBox:  { name: '哈克床頭櫃', cat: '自家商品', w: 52, d: 46, h: 50, color: '#f2f0ec', color2: '#c9c5bf', color3: '#3b302b', c1: '陶板顏色', c2: '烤漆顏色', c3: '木腳顏色', build: buildLacquerNight, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  ownDorn:     { name: '多恩茶几', cat: '自家商品', w: 100, d: 96, h: 35, color: '#cbc2b6', color2: '#2f2b28', c1: '陶板顏色', c2: '金屬顏色', build: buildDornTable, opts: [TOPMAT_OPT], def: { topmat: 'slate' }, own: true },
  scEntryTall: { name: '玄關高櫃',   cat: '系統櫃', sub: '玄關櫃', w: 100, d: 40, h: 240, color: '#c49a6c', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, floatBottom: 20, niches: [[0.40, 0.55]], wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'push', finish: 'wood', shelves: '4', drawers: '0' } },
  scEntryLow:  { name: '玄關矮櫃',   cat: '系統櫃', sub: '玄關櫃', w: 120, d: 38, h: 90, color: '#c49a6c', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, floatBottom: 15, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'groove', finish: 'wood', shelves: '2', drawers: '0' } },
  scShoeTall:  { name: '高鞋櫃',     cat: '系統櫃', sub: '鞋櫃', w: 90, d: 35, h: 220, color: '#e9e4da', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'groove', finish: 'wood', shelves: '6', drawers: '0' } },
  scShoeLow:   { name: '矮鞋櫃',     cat: '系統櫃', sub: '鞋櫃', w: 90, d: 35, h: 110, color: '#e9e4da', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'groove', finish: 'wood', shelves: '3', drawers: '0' } },
  scStoreTall: { name: '收納高櫃',   cat: '系統櫃', sub: '收納櫃', w: 60, d: 40, h: 240, color: '#f1ebe1', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'groove', finish: 'plain', shelves: '5', drawers: '0' } },
  scStoreLow:  { name: '收納矮櫃',   cat: '系統櫃', sub: '收納櫃', w: 120, d: 40, h: 85, color: '#c49a6c', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'bar', finish: 'wood', shelves: '1', drawers: '1' } },
  scUpper:     { name: '吊櫃',       cat: '系統櫃', sub: '收納櫃', w: 90, d: 35, h: 70, elev: 170, color: '#f1ebe1', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, upper: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'push', finish: 'plain', shelves: '1', drawers: '0' } },
  scBook:      { name: '開放書櫃',   cat: '系統櫃', sub: '收納櫃', w: 90, d: 35, h: 200, color: '#c49a6c', color2: '#c49a6c', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'open', handle: 'bar', finish: 'wood', bodyfin: 'wood', shelves: '5', drawers: '0' } },
  scDisplay:   { name: '玻璃展示櫃', cat: '系統櫃', sub: '收納櫃', w: 90, d: 40, h: 200, color: '#4a4d52', color2: '#e9e4da', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'glass', handle: 'bar', finish: 'lacquer', shelves: '4', drawers: '2' } },
  scTV:        { name: '懸浮電視櫃', cat: '系統櫃', sub: '收納櫃', w: 180, d: 45, h: 40, elev: 20, color: '#8b5a3c', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, wall: true, opts: SC_OPTS, def: { door: 'flip', handle: 'groove', finish: 'wood', shelves: '0', drawers: '0' } },
  scWardSwing: { name: '開門衣櫃',   cat: '系統櫃', sub: '衣櫃', w: 120, d: 60, h: 240, color: '#e9e4da', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: [...SC_OPTS, SC_ROD], def: { door: 'swing', handle: 'bar', finish: 'wood', shelves: '1', drawers: '2', rod: 'yes' } },
  scWardSlide: { name: '拉門衣櫃',   cat: '系統櫃', sub: '衣櫃', w: 180, d: 62, h: 240, color: '#e9e4da', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: [...SC_OPTS, SC_ROD], def: { door: 'slide', handle: 'groove', finish: 'wood', shelves: '1', drawers: '0', rod: 'yes' } },
  scWardOpen:  { name: '開放式衣櫃', cat: '系統櫃', sub: '衣櫃', w: 120, d: 55, h: 240, color: '#c49a6c', color2: '#c49a6c', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: [...SC_OPTS, SC_ROD], def: { door: 'open', handle: 'bar', finish: 'wood', bodyfin: 'wood', shelves: '1', drawers: '2', rod: 'yes' } },
  scKBase:     { name: '廚房下櫃',   cat: '系統櫃', sub: '櫥櫃', w: 120, d: 60, h: 86, color: '#f4f2ee', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', c3: '檯面顏色', build: buildSysCab, kick: true, counter: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '1', drawers: '1' } },
  scKUpper:    { name: '廚房吊櫃',   cat: '系統櫃', sub: '櫥櫃', w: 120, d: 35, h: 70, elev: 150, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, upper: true, wall: true, opts: SC_OPTS, def: { door: 'flip', handle: 'bar', finish: 'lacquer', shelves: '1', drawers: '0' } },
  scKSink:     { name: '水槽下櫃',   cat: '系統櫃', sub: '櫥櫃', w: 80, d: 60, h: 86, color: '#f4f2ee', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', c3: '檯面顏色', build: buildSysCab, kick: true, counter: true, wall: true, opts: SC_OPTS, sink: true, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '0', drawers: '0' } },
  scKHob:      { name: '爐台下櫃',   cat: '系統櫃', sub: '櫥櫃', w: 80, d: 60, h: 86, color: '#f4f2ee', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', c3: '檯面顏色', build: buildSysCab, kick: true, counter: true, wall: true, opts: SC_OPTS, hob: true, drawerFull: true, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '0', drawers: '3' } },
  scKDrawer:   { name: '抽屜下櫃',   cat: '系統櫃', sub: '櫥櫃', w: 60, d: 60, h: 86, color: '#f4f2ee', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', c3: '檯面顏色', build: buildSysCab, kick: true, counter: true, wall: true, opts: SC_OPTS, drawerFull: true, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '0', drawers: '4' } },
  scKCorner:   { name: '轉角下櫃',   cat: '系統櫃', sub: '櫥櫃', w: 100, d: 60, h: 86, color: '#f4f2ee', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', c3: '檯面顏色', build: buildSysCab, kick: true, counter: true, wall: true, opts: SC_OPTS, blind: true, ncol: 1, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '1', drawers: '0' } },
  scKIsland:   { name: '中島櫃',     cat: '系統櫃', sub: '櫥櫃', w: 180, d: 60, h: 90, color: '#f4f2ee', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', c3: '檯面顏色', build: buildSysCab, kick: true, counter: true, opts: SC_OPTS, over: 30, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '1', drawers: '1' } },
  scKHood:     { name: '油煙機吊櫃', cat: '系統櫃', sub: '櫥櫃', w: 80, d: 35, h: 40, elev: 185, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, upper: true, wall: true, opts: SC_OPTS, hood: true, def: { door: 'flip', handle: 'push', finish: 'lacquer', shelves: '0', drawers: '0' } },
  scKGlass:    { name: '玻璃吊櫃',   cat: '系統櫃', sub: '櫥櫃', w: 90, d: 35, h: 70, elev: 150, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, upper: true, wall: true, opts: SC_OPTS, def: { door: 'glass', handle: 'bar', finish: 'lacquer', shelves: '1', drawers: '0' } },
  scKOpenUp:   { name: '開放吊櫃',   cat: '系統櫃', sub: '櫥櫃', w: 60, d: 30, h: 70, elev: 150, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, upper: true, wall: true, opts: SC_OPTS, def: { door: 'open', handle: 'bar', finish: 'lacquer', shelves: '2', drawers: '0' } },
  scKFridge:   { name: '冰箱高櫃',   cat: '系統櫃', sub: '櫥櫃', w: 95, d: 65, h: 240, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, ncol: 1, niches: [[0, 0.76]], def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '0', drawers: '0' } },
  scKPantry:   { name: '餐櫃高櫃',   cat: '系統櫃', sub: '櫥櫃', w: 60, d: 60, h: 240, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '5', drawers: '2' } },
  scKTall:     { name: '電器高櫃',   cat: '系統櫃', sub: '櫥櫃', w: 60, d: 60, h: 220, color: '#f4f2ee', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, kick: true, niches: [[0.36, 0.56], [0.58, 0.76]], wall: true, opts: SC_OPTS, def: { door: 'swing', handle: 'bar', finish: 'lacquer', shelves: '1', drawers: '1' } },
  scWardBack:  { name: '衣櫃背櫃',   cat: '系統櫃', sub: '衣櫃', w: 180, d: 60, h: 40, elev: 200, color: '#e9e4da', color2: '#f1ebe1', c1: '門片顏色', c2: '櫃體顏色', build: buildSysCab, upper: true, wall: true, backOf: '衣櫃', opts: SC_OPTS, def: { door: 'swing', handle: 'push', finish: 'wood', shelves: '0', drawers: '0' } },
  scCustom:    { name: '自訂高櫃',   cat: '系統櫃', sub: '自訂櫃體', w: 120, d: 60, h: 240, color: '#e9e4da', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', build: buildCustomCab, custom: true, wall: true, opts: CC_OPTS, def: { base: 'kick', top: 'none', handle: 'bar', finish: 'wood' }, defCols: [{ rod: 1, sh: 1, dr: 2 }, { sh: 5 }] },
  scCustomLow: { name: '自訂矮櫃',   cat: '系統櫃', sub: '自訂櫃體', w: 150, d: 45, h: 90, color: '#c49a6c', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', build: buildCustomCab, custom: true, wall: true, opts: CC_OPTS, def: { base: 'kick', top: 'none', handle: 'groove', finish: 'wood' }, defCols: [{ sh: 1 }, { door: 'none', sh: 1 }, { dr: 3, sh: 0 }] },
  scCustomEmpty: { name: '空櫃體（無門無配件）', cat: '系統櫃', sub: '自訂櫃體', w: 80, d: 40, h: 200, color: '#e9e4da', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', build: buildCustomCab, custom: true, empty: true, wall: true, opts: CC_OPTS, def: { base: 'kick', top: 'none', handle: 'bar', finish: 'wood' }, defCols: [{ door: 'none', sh: 0, dr: 0, rod: 0 }] },
  scCustomUp:  { name: '自訂吊櫃',   cat: '系統櫃', sub: '自訂櫃體', w: 120, d: 35, h: 70, elev: 170, color: '#e9e4da', color2: '#f1ebe1', color3: '#e9e6e1', c1: '門片顏色', c2: '櫃體顏色', build: buildCustomCab, custom: true, wall: true, opts: CC_OPTS, def: { base: 'floor', top: 'none', handle: 'push', finish: 'plain' }, defCols: [{ sh: 1 }, { sh: 1, door: 'none' }] },
  scAccShelf:  { name: '層板',       cat: '系統櫃', sub: '配件', w: 58, d: 35, h: 1.8, color: '#f1ebe1', color2: '#b8bcc0', c1: '板材顏色', c2: null, build: buildScAcc, acc: 'shelf', noHit: true },
  scAccMid:    { name: '中立板',     cat: '系統櫃', sub: '配件', w: 1.8, d: 55, h: 200, color: '#f1ebe1', color2: '#b8bcc0', c1: '板材顏色', c2: null, build: buildScAcc, acc: 'mid', noHit: true },
  scAccDivider:{ name: '直立隔板',   cat: '系統櫃', sub: '配件', w: 1.8, d: 35, h: 60, color: '#f1ebe1', color2: '#b8bcc0', c1: '板材顏色', c2: null, build: buildScAcc, acc: 'divider', noHit: true },
  scAccDrawer: { name: '內抽屜',     cat: '系統櫃', sub: '配件', w: 56, d: 45, h: 18, color: '#f1ebe1', color2: '#b8bcc0', c1: '板材顏色', c2: null, build: buildScAcc, acc: 'drawer', noHit: true },
  scAccRod:    { name: '吊衣桿',     cat: '系統櫃', sub: '配件', w: 58, d: 3, h: 3, color: '#b8bcc0', color2: '#b8bcc0', c1: '金屬顏色', c2: null, build: buildScAcc, acc: 'rod', noHit: true },
  scAccBasket: { name: '拉籃',       cat: '系統櫃', sub: '配件', w: 56, d: 45, h: 15, color: '#b8bcc0', color2: '#b8bcc0', c1: '金屬顏色', c2: null, build: buildScAcc, acc: 'basket', noHit: true },
  scAccPants:  { name: '褲架',       cat: '系統櫃', sub: '配件', w: 56, d: 45, h: 8, color: '#b8bcc0', color2: '#b8bcc0', c1: '金屬顏色', c2: null, build: buildScAcc, acc: 'pants', noHit: true },
  ownAshBig:   { name: 'Ash陶板大茶几', cat: '自家商品', w: 90, d: 90, h: 36, color: '#d6b98a', color2: '#eeece8', c1: '木頭顏色（桌框與桌腳）', c2: '陶板顏色', build: buildAshTable, own: true },
  ownAshSmall: { name: 'Ash陶板小茶几', cat: '自家商品', w: 52, d: 52, h: 52, color: '#2e2724', color2: '#3b3b3d', c1: '木頭顏色（桌框與桌腳）', c2: '陶板顏色', build: buildAshTable, own: true },
  armchair: { name: '單人沙發',   cat: '客廳', w: 90,  d: 88,  h: 80,  color: '#8e9099', color2: '#3a2c22', c1: '布料顏色', c2: '椅腳顏色', build: buildSofa, opts: [SEATS_OPT, ...SOFA_OPTS], def: { seats: '1' } },
  sofa2:    { name: '雙人沙發',   cat: '客廳', w: 160, d: 88,  h: 80,  color: '#8e9099', color2: '#3a2c22', c1: '布料顏色', c2: '椅腳顏色', build: buildSofa, opts: [SEATS_OPT, ...SOFA_OPTS], def: { seats: '2' }, wall: true },
  sofa:     { name: '三人沙發',   cat: '客廳', w: 210, d: 90,  h: 80,  color: '#8e9099', color2: '#3a2c22', c1: '布料顏色', c2: '椅腳顏色', build: buildSofa, opts: [SEATS_OPT, ...SOFA_OPTS], def: { seats: '3' }, wall: true },
  baysofa:  { name: '弧形沙發',   cat: '客廳', w: 230, d: 100, h: 78,  color: '#9c9ea3', color2: '#4a4a4d', c1: '布料顏色', c2: '椅腳顏色', build: buildBaySofa, opts: [BAY_STYLE, BAY_SEATS, BAY_ARM], def: { style: 'shell', seats: '3', arm: 'arm' }, wall: true },
  lsofa:    { name: 'L型沙發',    cat: '客廳', w: 260, d: 160, h: 80,  color: '#c9bfae', color2: '#3a2c22', c1: '布料顏色', c2: '椅腳顏色', build: buildLSofa, opts: [SEATS_OPT_L, LSOFA_OPTS, SIDE_OPT], def: { seats: '2' }, wall: true },
  lounge:   { name: '休閒單椅',   cat: '客廳', w: 78,  d: 82,  h: 82,  color: '#c9bfae', color2: '#8b5a3c', c1: '布料顏色', c2: '椅腳顏色', build: buildAccent, opts: ACCENT_OPTS, def: { style: 'lounge' } },
  shellchair:{ name: '貝殼單椅',  cat: '客廳', w: 75,  d: 72,  h: 78,  color: '#d9a441', color2: '#b08d57', c1: '布料顏色', c2: '椅腳顏色', build: buildAccent, opts: ACCENT_OPTS, def: { style: 'shell' } },
  wingchair:{ name: '高背單椅',   cat: '客廳', w: 80,  d: 85,  h: 105, color: '#3d5a80', color2: '#5a3a28', c1: '布料顏色', c2: '椅腳顏色', build: buildAccent, opts: ACCENT_OPTS, def: { style: 'wing' } },
  woodchair:{ name: '木框單椅',   cat: '客廳', w: 70,  d: 78,  h: 78,  color: '#e9e4da', color2: '#c49a6c', c1: '坐墊顏色', c2: '木框顏色', build: buildAccent, opts: ACCENT_OPTS, def: { style: 'wood' } },
  pouf:     { name: '圓形軟凳',   cat: '客廳', w: 45,  d: 45,  h: 45,  color: '#c98b8b', color2: '#5a3a28', c1: '布料顏色', c2: '凳腳顏色', build: buildStool, opts: STOOL_OPTS, def: { style: 'round' } },
  bench:    { name: '長凳',       cat: '客廳', w: 110, d: 40,  h: 45,  color: '#8e9099', color2: '#5a3a28', c1: '布料顏色', c2: '凳腳顏色', build: buildStool, opts: STOOL_OPTS, def: { style: 'bench' } },
  coffee:   { name: '茶几',       cat: '客廳', w: 120, d: 60,  h: 42,  color: '#c49a6c', color2: '#222222', c1: '桌面',     c2: '桌腳',     build: buildCoffee, opts: COFFEE_OPTS },
  coffeeset:{ name: '組合茶几',   cat: '客廳', w: 130, d: 80,  h: 42,  color: '#e9e4da', color2: '#b08d57', c1: '桌面',     c2: '桌腳',     build: buildCoffeeSet, opts: COFFEE_OPTS, def: { shape: 'round', base: 'legs', legmat: 'metal' } },
  side:     { name: '小茶几',     cat: '客廳', w: 45,  d: 45,  h: 55,  color: '#5a3a28', color2: '#222222', c1: '桌面',     c2: '桌腳',     build: buildCoffee, opts: COFFEE_OPTS, def: { shape: 'round', base: 'pedestal', legmat: 'metal' } },
  tvcab:    { name: '電視櫃',     cat: '客廳', w: 180, d: 40,  h: 50,  color: '#f1ebe1', color2: '#8b5a3c', c1: '櫃體',     c2: '腳與把手', build: buildTvCab, opts: TVCAB_OPTS, wall: true },
  tv:       { name: '電視',       cat: '家電', w: 123, d: 8,   h: 72,  elev: 50, color: '#1c1c1e', color2: '#1c1c1e', c1: '機身', c2: null, build: buildTV, wall: true },
  rug:      { name: '長方形地毯', cat: '配件', w: 200, d: 140, h: 1,   color: '#d8cfc0', color2: '#8a8f98', c1: '主色',     c2: '邊框',     build: buildRugShaped, opts: RUG_OPTS, flat: true },
  rugRound: { name: '圓形地毯',   cat: '配件', w: 160, d: 160, h: 1,   color: '#e9e4da', color2: '#b9b4ad', c1: '主色',     c2: '邊框',     build: buildRugShaped, opts: RUG_OPTS, def: { shape: 'round' }, flat: true },
  person:   { name: '人物',       cat: '人物', w: 50,  d: 28,  h: 172, color: '#7d8a99', color2: '#3b3f45', c1: '上衣顏色', c2: '褲子顏色', build: buildPerson, opts: PERSON_OPTS, def: { sex: 'm', pose: 'stand' }, noHit: true, person: true },   // 從「空間設定」加入，不在家具庫
  lamp:     { name: '落地燈',     cat: '燈具', w: 40,  d: 40,  h: 160, color: '#f3ead8', color2: '#2b2b2b', c1: '燈罩',     c2: '燈架',     build: buildLamp, opts: LAMP_OPTS },
  plant:    { name: '植栽',       cat: '擺飾', w: 45,  d: 45,  h: 120, color: '#e9e4da', color2: '#5f7d63', c1: '盆器',     c2: '葉色',     build: buildPlant, opts: PLANT_OPTS },
  dining:   { name: '餐桌',       cat: '餐廳', w: 160, d: 90,  h: 75,  color: '#c49a6c', color2: '#5a3a28', c1: '桌面',     c2: '桌腳',     build: buildDining, opts: DINING_OPTS },
  round:    { name: '圓餐桌',     cat: '餐廳', w: 110, d: 110, h: 75,  color: '#f1ebe1', color2: '#222222', color3: '#e3ddd3', c1: '桌面', c2: '桌腳', build: buildRound, opts: ROUND_OPTS },
  chair:    { name: '餐椅',       cat: '餐廳', w: 45,  d: 50,  h: 85,  color: '#e9e4da', color2: '#8b5a3c', c1: '椅面',     c2: '椅腳',     build: buildChair, opts: CHAIR_OPTS },
  bartable: { name: '長型吧檯桌', cat: '餐廳', w: 140, d: 50,  h: 105, color: '#c49a6c', color2: '#222222', c1: '桌面', c2: '桌腳', build: it => buildBarTable(it, 'long'), opts: [BAR_BASES, BAR_LEGMAT, TOPMAT_OPT] },
  barround: { name: '圓形高腳桌', cat: '餐廳', w: 60,  d: 60,  h: 105, color: '#f1ebe1', color2: '#222222', c1: '桌面', c2: '桌腳', build: it => buildBarTable(it, 'round'), opts: [BARROUND_BASES, BAR_LEGMAT, TOPMAT_OPT], def: { topmat: 'marble' } },
  barisland:{ name: '中島吧檯',   cat: '系統櫃', sub: '櫥櫃', w: 180, d: 75,  h: 95,  color: '#f2f0ec', color2: '#4a4d52', color3: '#3a3c40', c1: '櫃體', c2: null, build: it => buildBarTable(it, 'island') },
  barwall:  { name: '靠牆吧檯',   cat: '餐廳', w: 120, d: 38,  h: 105, color: '#c49a6c', color2: '#222222', c1: '檯面', c2: '支架', build: it => buildBarTable(it, 'wall'), opts: [TOPMAT_OPT], wall: true },
  barstool: { name: '圓凳吧檯椅', cat: '餐廳', w: 36,  d: 36,  h: 75,  color: '#8b5a3c', color2: '#222222', c1: '椅面', c2: '椅腳', build: it => buildBarStool(it, 'round'), opts: [BAR_LEGMAT] },
  barstoolBack: { name: '低背吧檯椅', cat: '餐廳', w: 42, d: 46, h: 95, color: '#b9b4ad', color2: '#222222', c1: '椅面', c2: '椅腳', build: it => buildBarStool(it, 'back'), opts: [BAR_LEGMAT] },
  barstoolWood: { name: '實木吧檯椅', cat: '餐廳', w: 42, d: 44, h: 102, color: '#3d3a38', color2: '#c49a6c', c1: '椅面', c2: '椅架', build: it => buildBarStool(it, 'wood'), opts: [BAR_LEGMAT], def: { legmat: 'wood' } },
  barstoolSwivel: { name: '升降旋轉吧椅', cat: '餐廳', w: 42, d: 42, h: 95, color: '#2f2f31', color2: '#c9cdd1', c1: '椅面', c2: '金屬', build: it => buildBarStool(it, 'swivel') },
  sideboard:{ name: '餐櫃',       cat: '餐廳', w: 160, d: 45,  h: 85,  color: '#f2f0ec', color2: '#5a3a28', c1: '檯面', c2: '櫃體', build: buildSideboard, opts: SIDEBOARD_OPTS, def: { topmat: 'marble' }, wall: true },
  kitchen:  { name: '廚具流理台', cat: '餐廳', w: 240, d: 60,  h: 86,  color: '#f4f2ee', color2: '#4a4d52', c1: '門板',     c2: '檯面',     build: it => buildCabinet(it, { counter: true, doorW: 45 }), opts: KITCHEN_OPTS, def: { topmat: 'slate' }, wall: true },
  fridge:   { name: '冰箱',       cat: '家電', w: 70,  d: 70,  h: 180, color: '#d9dcdf', color2: '#8a8f98', c1: '機身',     c2: '把手',     build: buildFridge, wall: true },
  bed:      { name: '雙人床',     cat: '臥室', w: 152, d: 188, h: 100, color: '#c49a6c', color2: '#9fb3c8', c1: '床架',     c2: '寢具',     build: buildBed, opts: BED_OPTS, wall: true },
  queen:    { name: '加大雙人床', cat: '臥室', w: 182, d: 188, h: 105, color: '#4a4d52', color2: '#d8cfc0', c1: '床架',     c2: '寢具',     build: buildBed, opts: BED_OPTS, wall: true },
  single:   { name: '單人床',     cat: '臥室', w: 91,  d: 188, h: 90,  color: '#e8d3b0', color2: '#c98b8b', c1: '床架',     c2: '寢具',     build: buildBed, opts: BED_OPTS, wall: true },
  night:    { name: '床頭櫃',     cat: '臥室', w: 45,  d: 40,  h: 50,  color: '#c49a6c', color2: '#2b2b2b', c1: '櫃體',     c2: '把手',     build: buildNight, opts: NIGHT_OPTS, wall: true },
  wardrobe: { name: '衣櫃',       cat: '臥室', w: 120, d: 60,  h: 220, color: '#f1ebe1', color2: '#8a8f98', c1: '櫃體',     c2: '把手',     build: it => buildCabinet(it, { doorW: 50 }), opts: CAB_OPTS, wall: true },
  slidewardrobe: { name: '推門衣櫃', cat: '臥室', w: 180, d: 62, h: 220, color: '#e9e4da', color2: '#4a4d52', c1: '櫃體', c2: '把手與飾條', build: buildSlideWardrobe, opts: SLIDE_OPTS, wall: true },
  vanity:   { name: '化妝台',     cat: '臥室', w: 100, d: 45,  h: 140, color: '#f2f0ec', color2: '#e9e4da', c1: '桌面', c2: '櫃體與鏡框', build: buildVanity, opts: VANITY_OPTS, def: { topmat: 'marble' }, wall: true },
  vstool:   { name: '化妝椅',     cat: '臥室', w: 42,  d: 42,  h: 45,  color: '#c98b8b', color2: '#b08d57', c1: '椅面', c2: '椅腳', build: buildVanityStool, opts: VSTOOL_OPTS },
  ldesk:    { name: 'L型書桌',    cat: '書房', w: 160, d: 140, h: 75, color: '#e8d3b0', color2: '#2b2b2b', c1: '桌面', c2: '桌腳', build: buildLDesk, opts: LDESK_OPTS, def: { style: 'metal', side: 'right' }, wall: true },
  consoletable:{ name: '玄關桌',  cat: '玄關', w: 120, d: 35, h: 80, color: '#c49a6c', color2: '#5a3a28', c1: '桌面', c2: '桌腳', build: buildConsole, opts: CONSOLE_OPTS, def: { style: 'slim' }, wall: true },
  shoecab:  { name: '矮鞋櫃',     cat: '玄關', w: 100, d: 35, h: 100, color: '#e9e4da', color2: '#2b2b2b', c1: '櫃體', c2: '把手', build: buildShoeCab, opts: SHOE_OPTS, def: { style: 'low', bodymat: 'wood' }, wall: true },
  shoecabTall: { name: '高鞋櫃',  cat: '玄關', w: 80, d: 35, h: 200, color: '#c49a6c', color2: '#2b2b2b', c1: '櫃體', c2: '把手', build: buildShoeCab, opts: SHOE_OPTS, def: { style: 'tall', bodymat: 'wood' }, wall: true },
  shoecabSlim: { name: '薄型翻板鞋櫃', cat: '玄關', w: 80, d: 20, h: 120, color: '#f1ebe1', color2: '#b08d57', c1: '櫃體', c2: '把手', build: buildShoeCab, opts: SHOE_OPTS, def: { style: 'slim', bodymat: 'lacquer' }, wall: true },
  shoecabLouver: { name: '百葉門鞋櫃', cat: '玄關', w: 100, d: 35, h: 110, color: '#c49a6c', color2: '#2b2b2b', c1: '櫃體', c2: '把手', build: buildShoeCab, opts: SHOE_OPTS, def: { style: 'louver', bodymat: 'wood' }, wall: true },
  shoerack: { name: '開放鞋架',   cat: '玄關', w: 80, d: 30, h: 90, color: '#c49a6c', color2: '#2b2b2b', c1: '櫃體', c2: null, build: buildShoeCab, opts: SHOE_OPTS, def: { style: 'open', bodymat: 'wood' }, wall: true },
  shoebench: { name: '穿鞋椅鞋櫃', cat: '玄關', w: 100, d: 35, h: 48, color: '#c49a6c', color2: '#8e9099', c1: '櫃體', c2: '坐墊顏色', build: buildShoeCab, opts: SHOE_OPTS, def: { style: 'bench', bodymat: 'wood' }, wall: true },
  pillowSq: { name: '方形抱枕',   cat: '配件', w: 45, d: 14, h: 45, color: '#c98b8b', color2: '#f1ebe1', c1: '布料顏色', c2: '滾邊／包釦', build: buildPillow, opts: PILLOW_OPTS, def: { style: 'square', cmat: 'fabric' }, noHit: true, pillow: true, on: SOFA_LIKE },
  pillowLumbar: { name: '長方形腰枕', cat: '配件', w: 50, d: 12, h: 30, color: '#3d5a80', color2: '#d8cfc0', c1: '布料顏色', c2: '滾邊／包釦', build: buildPillow, opts: PILLOW_OPTS, def: { style: 'lumbar', cmat: 'velvet' }, noHit: true, pillow: true, on: SOFA_LIKE },
  pillowRound: { name: '圓形抱枕', cat: '配件', w: 40, d: 12, h: 40, color: '#d9a441', color2: '#8b5a3c', c1: '布料顏色', c2: '滾邊／包釦', build: buildPillow, opts: PILLOW_OPTS, def: { style: 'round', cmat: 'velvet' }, noHit: true, pillow: true, on: SOFA_LIKE },
  pillowBolster: { name: '圓筒抱枕', cat: '配件', w: 45, d: 18, h: 18, color: '#5f7d63', color2: '#f1ebe1', c1: '布料顏色', c2: '滾邊／包釦', build: buildPillow, opts: PILLOW_OPTS, def: { style: 'bolster', cmat: 'fabric' }, noHit: true, pillow: true, on: SOFA_LIKE },
  seatpad:  { name: '坐墊',       cat: '配件', w: 45, d: 45, h: 8, color: '#b9b4ad', color2: '#5a3a28', c1: '布料顏色', c2: '滾邊／包釦', build: buildPillow, opts: PILLOW_OPTS, def: { style: 'seat', cmat: 'fabric' }, noHit: true, pillow: true, on: ['chair', 'barstoolBack', 'barstoolWood', 'ownVChair', 'ownMiyazaki', 'ownDanishBench', 'bench', 'pouf', 'vstool', 'office', ...SOFA_LIKE] },
  entrycab: { name: '玄關櫃',     cat: '玄關', w: 120, d: 38, h: 100, color: '#e9e4da', color2: '#2b2b2b', c1: '櫃體', c2: '把手／坐墊', build: buildEntryCab, opts: ENTRY_OPTS, def: { style: 'low', bodymat: 'wood' }, wall: true },
  desk:     { name: '書桌',       cat: '書房', w: 120, d: 60, h: 75,  color: '#e8d3b0', color2: '#2b2b2b', c1: '桌面', c2: '桌架', build: buildDesk, opts: DESK_OPTS, wall: true },
  bookshelf:{ name: '書櫃',       cat: '書房', w: 80,  d: 30, h: 180, color: '#e8d3b0', color2: '#2b2b2b', c1: '櫃體', c2: null,   build: buildBookshelf, opts: BOOK_OPTS, wall: true },
  office:   { name: '辦公椅',     cat: '書房', w: 62,  d: 62,  h: 110, color: '#2b2b2b', color2: '#8e9099', c1: '椅面與椅背', c2: '椅腳', build: buildOffice, opts: OFFICE_OPTS },
  pendant:  { name: '吊燈',       cat: '燈具', w: 45,  d: 45,  h: 100, color: '#2b2b2b', color2: '#2b2b2b', c1: '燈罩顏色', c2: '吊線與燈座', build: buildPendant, opts: PENDANT_OPTS, ceil: true, noHit: true },
  ceillight:{ name: '吸頂燈',     cat: '燈具', w: 50,  d: 50,  h: 10,  color: '#fff8ea', color2: '#ffffff', c1: '發光面', c2: '燈座', build: buildCeilLight, opts: CEIL_OPTS, ceil: true, noHit: true },
  tablelamp:{ name: '檯燈',       cat: '燈具', w: 35,  d: 35,  h: 55,  color: '#f3ead8', color2: '#b08d57', c1: '燈罩', c2: '燈座', build: buildTableLamp, opts: TABLELAMP_OPTS, noHit: true },
  walllamp: { name: '壁燈',       cat: '燈具', w: 20,  d: 20,  h: 30,  elev: 170, color: '#fff4d6', color2: '#2b2b2b', c1: '燈罩', c2: '燈座', build: buildWallLamp, opts: WALLLAMP_OPTS, noHit: true },
  washer:   { name: '洗衣機',     cat: '家電', w: 60,  d: 65,  h: 85,  color: '#f4f4f2', color2: '#b8bcc0', c1: '機身', c2: '門框與面板', build: buildWasher, opts: WASHER_OPTS, wall: true },
  aircon:   { name: '冷氣（室內機）', cat: '家電', w: 90, d: 22, h: 30, elev: 230, color: '#f4f4f2', color2: '#f4f4f2', c1: '機身', c2: null, build: buildAircon, noHit: true },
  fan:      { name: '電風扇',     cat: '家電', w: 40,  d: 35,  h: 110, color: '#f4f4f2', color2: '#cfe3e8', c1: '機身', c2: '扇葉', build: buildFan },
  ceilfan:  { name: '吊扇',       cat: '家電', w: 120, d: 120, h: 40,  color: '#c49a6c', color2: '#2b2b2b', c1: '扇葉', c2: '機身', build: buildCeilingFan, ceil: true, noHit: true },
  purifier: { name: '空氣清淨機', cat: '家電', w: 30,  d: 30,  h: 65,  color: '#f4f4f2', color2: '#8e9099', c1: '機身', c2: '出風口', build: buildPurifier },
  microwave:{ name: '微波爐',     cat: '家電', w: 50,  d: 40,  h: 30,  color: '#f4f4f2', color2: '#4a4d52', c1: '機身', c2: '面板', build: buildMicrowave, noHit: true },
  ricecooker:{ name: '電鍋',      cat: '家電', w: 32,  d: 32,  h: 30,  color: '#9fb3c8', color2: '#2b2b2b', c1: '鍋身', c2: '把手', build: buildRiceCooker, noHit: true },
  coffeemaker:{ name: '咖啡機',   cat: '家電', w: 25,  d: 40,  h: 36,  color: '#b8bcc0', color2: '#2b2b2b', c1: '機身', c2: '底座', build: buildCoffeeMaker, noHit: true },
  speaker:  { name: '落地音響',   cat: '家電', w: 25,  d: 30,  h: 100, color: '#2b2b2b', color2: '#8e9099', c1: '箱體', c2: '喇叭', build: buildSpeaker, opts: SPEAKER_OPTS },
  robot:    { name: '掃地機器人', cat: '家電', w: 35,  d: 35,  h: 10,  color: '#2b2b2b', color2: '#8e9099', c1: '機身', c2: '感測器', build: buildRobot, noHit: true },
  plantstand:{ name: '花架',      cat: '配件', w: 60,  d: 30,  h: 90,  color: '#e9e4da', color2: '#2b2b2b', c1: '盆器', c2: '架子', build: buildPlantStand, opts: STAND_OPTS, def: { legmat: 'metal' } },
  pedestal: { name: '石柱展示台', cat: '配件', w: 35,  d: 35,  h: 90,  color: '#f2f0ec', color2: '#f2f0ec', c1: '柱體顏色', c2: null, build: buildPedestal, opts: PEDESTAL_OPTS },
  coatrack: { name: '衣帽架',     cat: '配件', w: 45,  d: 45,  h: 175, color: '#c49a6c', color2: '#c49a6c', c1: '（同架子）', c2: '架子', build: buildCoatRack, opts: [{ key: 'legmat', label: '材質', list: LEGMATS }] },
  screen:   { name: '屏風',       cat: '配件', w: 150, d: 20,  h: 170, color: '#e9e4da', color2: '#c49a6c', c1: '面料', c2: '框架', build: buildScreen, opts: SCREEN_OPTS },
  floormirror:{ name: '穿衣鏡',   cat: '配件', w: 50,  d: 4,   h: 170, color: '#b08d57', color2: '#b08d57', c1: '鏡框', c2: null, build: buildFloorMirror, opts: MIRROR_OPTS, wall: true },
  wallart:  { name: '掛畫',       cat: '擺飾', w: 90,  d: 3,   h: 60,  elev: 140, color: '#c98b8b', color2: '#3d5a80', color3: '#2b2b2b', c1: '畫作主色', c2: '畫作輔色', c3: '畫框顏色', build: buildWallArt, opts: ART_OPTS, noHit: true },
  sculpture:{ name: '藝術品',     cat: '擺飾', w: 25,  d: 25,  h: 45,  color: '#e9e4da', color2: '#4a4d52', c1: '主體', c2: '底座', build: buildSculpture, opts: SCULPT_OPTS, noHit: true },
  vase:     { name: '花瓶花藝',   cat: '擺飾', w: 22,  d: 22,  h: 55,  color: '#e9e4da', color2: '#e8a0a8', c1: '花瓶', c2: '花朵', build: buildVase, opts: VASE_OPTS, noHit: true },
  tableware:{ name: '餐具組',     cat: '擺飾', w: 50,  d: 35,  h: 16,  elev: 0, color: '#ffffff', color2: '#b8bcc0', c1: '餐盤', c2: '刀叉', build: buildTableware, opts: TABLEWARE_OPTS, noHit: true },
  clock:    { name: '掛鐘',       cat: '擺飾', w: 35,  d: 4,   h: 35,  elev: 180, color: '#ffffff', color2: '#2b2b2b', c1: '鐘面', c2: '外框', build: buildClock, noHit: true },
  computer: { name: '電腦',       cat: '家電', w: 34,  d: 24,  h: 22,  color: '#b8bcc0', color2: '#2b2b2b', c1: '機身顏色', c2: '鍵盤顏色', build: buildComputer, opts: PC_OPTS, noHit: true, on: ['desk', 'ldesk', 'dining', 'round', 'coffee', 'side'] },
  bookitem: { name: '書本',       cat: '擺飾', w: 40,  d: 20,  h: 25,  color: '#3d5a80', color2: '#c49a6c', c1: '書封主色', c2: '書封輔色', build: buildBookItem, opts: BOOK_ITEM_OPTS, noHit: true, on: ['desk', 'ldesk', 'bookshelf', 'night', 'coffee', 'side'] },
  toilet:   { name: '馬桶',       cat: '衛浴', w: 40,  d: 70,  h: 78,  color: '#ffffff', color2: '#ffffff', c1: '陶瓷', c2: '馬桶蓋', build: buildToilet, opts: TOILET_OPTS, def: { style: 'floor' }, wall: true },
  bathtub:  { name: '浴缸',       cat: '衛浴', w: 170, d: 75,  h: 58,  color: '#ffffff', color2: '#d6d9dc', c1: '浴缸', c2: '龍頭', build: buildBathtub, opts: TUB_OPTS, def: { style: 'built' }, wall: true },
  shower:   { name: '淋浴間',     cat: '衛浴', w: 90,  d: 90,  h: 200, color: '#ffffff', color2: '#2b2b2b', c1: '底盤', c2: '五金框', build: buildShower, opts: SHOWER_OPTS, def: { style: 'corner' }, wall: true },
  basin:    { name: '浴櫃洗手台', cat: '衛浴', w: 80,  d: 48,  h: 85,  color: '#c49a6c', color2: '#f2f0ec', c1: '櫃體', c2: '檯面', build: buildBasin, opts: BASIN_OPTS, def: { style: 'float', sink: 'vessel' }, wall: true },
  mirrorcab:{ name: '浴室鏡櫃',   cat: '衛浴', w: 80,  d: 15,  h: 70,  elev: 110, color: '#ffffff', color2: '#ffffff', c1: '櫃體', c2: null, build: buildMirrorCab, opts: MCAB_OPTS, def: { led: 'led' }, wall: true, noHit: true },
  towelrack:{ name: '毛巾架',     cat: '衛浴', w: 60,  d: 12,  h: 50,  elev: 90, color: '#d6d9dc', color2: '#e9e4da', c1: '金屬', c2: '毛巾', build: buildTowelRack, wall: true, noHit: true },
  bathmat:  { name: '浴室腳踏墊', cat: '衛浴', w: 60,  d: 40,  h: 1,   color: '#b9b4ad', color2: '#b9b4ad', c1: '顏色', c2: null, build: buildBathMat, flat: true },
  laundry:  { name: '洗衣籃',     cat: '衛浴', w: 40,  d: 32,  h: 55,  color: '#c9a57a', color2: '#9fb3c8', c1: '籃子', c2: '衣物', build: buildLaundry, opts: LAUNDRY_OPTS, def: { basket: 'rattan' } },
  bathfan:  { name: '浴室暖風機', cat: '衛浴', w: 40,  d: 40,  h: 12,  color: '#f4f4f2', color2: '#f4f4f2', c1: '面板', c2: null, build: buildBathFan, ceil: true, noHit: true },
  dryer:    { name: '烘衣機',     cat: '家電', w: 60,  d: 65,  h: 85,  color: '#e9e9ea', color2: '#4a4d52', c1: '機身', c2: '門框與面板', build: buildWasher, def: { style: 'front' }, wall: true },
  dehumid:  { name: '除濕機',     cat: '家電', w: 32,  d: 25,  h: 60,  color: '#f4f4f2', color2: '#8e9099', c1: '機身', c2: '出風口', build: buildDehumid },
  heater:   { name: '電熱水器',   cat: '家電', w: 45,  d: 45,  h: 80,  elev: 150, color: '#f4f4f2', color2: '#b8bcc0', c1: '桶身', c2: '溫控', build: buildWaterHeater, wall: true, noHit: true },
  oven:     { name: '烤箱',       cat: '家電', w: 50,  d: 40,  h: 32,  color: '#2b2b2b', color2: '#b8bcc0', c1: '機身', c2: '把手旋鈕', build: buildOven, noHit: true, on: ['kitchen', 'sideboard', 'cabinet'] },
  dishwasher:{ name: '洗碗機',    cat: '家電', w: 60,  d: 60,  h: 85,  color: '#c9cdd1', color2: '#8e9099', c1: '門板', c2: '把手', build: buildDishwasher, wall: true },
  projector:{ name: '投影機',     cat: '家電', w: 30,  d: 25,  h: 10,  color: '#f4f4f2', color2: '#2b2b2b', c1: '機身', c2: '鏡頭', build: buildProjector, noHit: true, on: ['coffee', 'side', 'tvcab', 'desk', 'ldesk', 'night'] },
  soundbar: { name: '聲霸音響',   cat: '家電', w: 90,  d: 10,  h: 7,   color: '#2b2b2b', color2: '#3b3f45', c1: '機身', c2: '網布', build: buildSoundbar, noHit: true, on: ['tvcab'] },
  candle:   { name: '香氛蠟燭',   cat: '擺飾', w: 9,   d: 9,   h: 11,  color: '#f4f1ea', color2: '#c9a57a', c1: '蠟', c2: '玻璃杯', build: buildCandle, noHit: true, on: ['consoletable', 'entrycab', 'coffee', 'side', 'night', 'tvcab', 'sideboard', 'dining', 'basin'] },
  diffuser: { name: '擴香瓶',     cat: '擺飾', w: 9,   d: 9,   h: 28,  color: '#b08d57', color2: '#3a2c22', c1: '瓶身', c2: '擴香棒', build: buildDiffuser, noHit: true, on: ['consoletable', 'entrycab', 'side', 'night', 'tvcab', 'sideboard', 'basin', 'desk', 'ldesk'] },
  photoframe:{ name: '相框',      cat: '擺飾', w: 18,  d: 8,   h: 23,  color: '#c49a6c', color2: '#9fb3c8', c1: '框', c2: '照片主色', build: buildPhotoFrame, opts: FRAME_OPTS, noHit: true, on: ['consoletable', 'entrycab', 'night', 'side', 'tvcab', 'sideboard', 'desk', 'ldesk', 'bookshelf'] },
  tray:     { name: '托盤擺件',   cat: '擺飾', w: 40,  d: 25,  h: 14,  color: '#c49a6c', color2: '#e8a0a8', c1: '托盤', c2: '花器', build: buildTray, opts: TRAY_OPTS, noHit: true, on: ['consoletable', 'entrycab', 'coffee', 'side', 'dining', 'sideboard', 'tvcab'] },
  towelset: { name: '浴巾組',     cat: '擺飾', w: 40,  d: 30,  h: 18,  color: '#f4f1ea', color2: '#b9b4ad', c1: '浴巾 1', c2: '浴巾 2', build: buildTowelSet, noHit: true, on: ['basin', 'bed', 'queen', 'single', 'bench'] },
  succulent:{ name: '桌上多肉盆栽', cat: '擺飾', w: 14, d: 14, h: 15, color: '#f4f1ea', color2: '#8fae8a', c1: '盆器', c2: '葉色', build: buildSucculent, opts: [{ key: 'potmat', label: '盆器材質', list: [opt('ceramic', '陶瓷'), opt('cement', '水泥')] }], noHit: true, on: ['consoletable', 'entrycab', 'coffee', 'side', 'desk', 'ldesk', 'night', 'tvcab', 'dining', 'basin'] },
  cookpot:  { name: '湯鍋鍋具',   cat: '擺飾', w: 34,  d: 26,  h: 20,  color: '#c9cdd1', color2: '#2b2b2b', c1: '鍋身', c2: '蓋鈕把手', build: buildPot, opts: POT_OPTS, def: { style: 'steel' }, noHit: true, on: ['scKHob', 'kitchen', 'scKBase', 'scKIsland', 'dining', 'round'] },
  fryingpan:{ name: '平底鍋炒鍋', cat: '擺飾', w: 48,  d: 28,  h: 6,   color: '#3b3f45', color2: '#2b2b2b', c1: '鍋身', c2: '握柄', build: buildPan, opts: PAN_OPTS, def: { style: 'fry' }, noHit: true, on: ['scKHob', 'kitchen', 'scKBase', 'scKIsland'] },
  kettle:   { name: '水壺茶壺',   cat: '擺飾', w: 24,  d: 16,  h: 22,  color: '#c9cdd1', color2: '#2b2b2b', c1: '壺身', c2: '把手與蓋鈕', build: buildKettle, opts: KETTLE_OPTS, def: { style: 'kettle' }, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  plateset: { name: '餐盤組',     cat: '擺飾', w: 28,  d: 28,  h: 10,  color: '#ffffff', color2: '#9fb3c8', c1: '盤子', c2: '點綴色', build: buildPlates, opts: PLATES_OPTS, def: { style: 'round' }, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  cupset:   { name: '杯子組',     cat: '擺飾', w: 30,  d: 12,  h: 11,  color: '#f4f1ea', color2: '#6b2b3a', c1: '杯子', c2: '點綴色／酒', build: buildCups, opts: CUPS_OPTS, def: { style: 'mug' }, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  condiment:{ name: '調味料組',   cat: '擺飾', w: 16,  d: 8,   h: 18,  color: '#c49a6c', color2: '#2b2b2b', c1: '主色', c2: '蓋子', build: buildCondiments, opts: COND_OPTS, def: { style: 'grinder' }, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  boardknife:{ name: '砧板刀具',  cat: '擺飾', w: 42,  d: 26,  h: 5,   color: '#c49a6c', color2: '#2b2b2b', c1: '砧板', c2: '刀柄', build: buildBoardKnife, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  fruitbowl:{ name: '水果盤',     cat: '擺飾', w: 30,  d: 30,  h: 16,  color: '#f4f1ea', color2: '#f4f1ea', c1: '果盤', c2: null, build: buildFruitBowl, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  teaset:   { name: '茶具組',     cat: '擺飾', w: 40,  d: 24,  h: 12,  color: '#e9e4da', color2: '#5a3a28', c1: '茶具', c2: '茶盤', build: buildTeaSet, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKDrawer', 'scKCorner', 'scKIsland', 'dining', 'round', 'sideboard', 'coffee', 'side'] },
  utensils: { name: '廚具筒',     cat: '擺飾', w: 12,  d: 12,  h: 32,  color: '#f4f1ea', color2: '#c49a6c', c1: '筒子', c2: '木鏟', build: buildUtensils, noHit: true, on: ['kitchen', 'scKBase', 'scKHob', 'scKSink', 'scKIsland'] },
  books:    { name: '書本擺件',   cat: '擺飾', w: 28,  d: 20,  h: 22,  color: '#3d5a80', color2: '#c49a6c', c1: '書本 1', c2: '書本 2', build: buildBooks, noHit: true },
  drape:    { name: '布簾',       cat: '窗簾', w: 220, d: 20, h: 250, elev: 5,  color: '#d8cfc0', color2: '#8a8f98', color3: '#f5f3ee', c1: '布料顏色', c2: '窗簾桿顏色', build: buildDrape, opts: DRAPE_OPTS, def: { style: 'drape', open: 'half', cmat: 'blackout' }, noHit: true },
  layered:  { name: '布加紗',     cat: '窗簾', w: 220, d: 24, h: 250, elev: 5,  color: '#8e9099', color2: '#4a4d52', color3: '#f5f3ee', c1: '布料顏色', c2: '窗簾桿顏色', build: buildDrape, opts: DRAPE_OPTS, def: { style: 'layered', open: 'half', cmat: 'linen' }, noHit: true },
  sheer:    { name: '紗簾',       cat: '窗簾', w: 220, d: 16, h: 250, elev: 5,  color: '#f5f3ee', color2: '#b8bcc0', color3: '#f5f3ee', c1: '紗簾顏色', c2: '窗簾桿顏色', build: buildDrape, opts: DRAPE_OPTS, def: { style: 'sheer', open: 'closed' }, noHit: true },
  zebra:    { name: '調光捲簾',   cat: '窗簾', w: 160, d: 9,  h: 170, elev: 70, color: '#e9e4da', color2: '#f1ebe1', c1: '簾布顏色', c2: '捲盒顏色', build: buildRoller, opts: ROLLER_OPTS, def: { style: 'zebra' }, noHit: true },
  roller:   { name: '一般捲簾',   cat: '窗簾', w: 160, d: 9,  h: 170, elev: 70, color: '#b9b4ad', color2: '#f1ebe1', c1: '簾布顏色', c2: '捲盒顏色', build: buildRoller, opts: ROLLER_OPTS, def: { style: 'roller' }, noHit: true },
  roman:    { name: '羅馬簾',     cat: '窗簾', w: 160, d: 9,  h: 170, elev: 70, color: '#c9bfae', color2: '#f1ebe1', c1: '簾布顏色', c2: '上軌顏色', build: buildRoller, opts: ROLLER_OPTS, def: { style: 'roman', cmat: 'linen' }, noHit: true },
  woodblind:{ name: '木百葉簾',   cat: '窗簾', w: 150, d: 7,  h: 150, elev: 80, color: '#c49a6c', color2: '#c49a6c', c1: '葉片顏色', c2: null, build: buildBlinds, opts: BLIND_OPTS, def: { style: 'wood' }, noHit: true },
  alublind: { name: '鋁百葉簾',   cat: '窗簾', w: 150, d: 7,  h: 150, elev: 80, color: '#d9dcdf', color2: '#d9dcdf', c1: '葉片顏色', c2: null, build: buildBlinds, opts: BLIND_OPTS, def: { style: 'alu' }, noHit: true },
  cabinet:  { name: '收納櫃',     cat: '書房', w: 90,  d: 40, h: 85,  color: '#f1ebe1', color2: '#8b5a3c', c1: '櫃體', c2: '把手', build: it => buildCabinet(it, { doorW: 45, top: true }), opts: CAB_OPTS, wall: true },
};
const SETS = {
  set123: { name: '1+2+3 沙發組', cat: '客廳', size: '三人＋雙人＋單人', types: ['sofa', 'sofa2', 'armchair'] },
  ashSet: { name: 'Ash陶板大小茶几', cat: '自家商品', size: '大 Ø90×36＋小 Ø52×52', types: ['ownAshBig', 'ownAshSmall'] },
};
// 材質選項（附加在各家具的款式選項之後）
const BODYMAT_OPT = { key: 'bodymat', label: '櫃體材質', list: [opt('wood', '木頭'), opt('lacquer', '烤漆'), opt('glass', '玻璃')] };
const FABRIC_OPT = { key: 'fabric', label: '面料', list: [opt('fabric', '布料'), opt('leather', '皮革'), opt('velvet', '絨布')] };
const FRAMEMAT_OPT = { key: 'framemat', label: '床架材質', list: [opt('wood', '木頭'), opt('lacquer', '烤漆'), opt('fabric', '布料'), opt('leather', '皮革')] };
const LEGMAT_OPT = { key: 'legmat', label: '腳材質', list: LEGMATS };
const POT_OPT = { key: 'potmat', label: '盆器材質', list: [opt('ceramic', '陶瓷'), opt('cement', '水泥'), opt('rattan', '藤編')] };
const CAB_TOP = { key: 'topmat', label: '檯面材質', list: TOPMAT_LIST, c3: '檯面顏色' };
const EXTRA_OPTS = {
  ownRecliner: [FABRIC_OPT], ownDanSofa: [FABRIC_OPT], ownLetItBe: [FABRIC_OPT], ownRoundChaise: [FABRIC_OPT], own171: [FABRIC_OPT], ownAthena: [FABRIC_OPT], own120: [FABRIC_OPT], own120Ott: [FABRIC_OPT], ownFloatL: [FABRIC_OPT], ownAmis: [FABRIC_OPT], ownMila: [FABRIC_OPT], ownEmma: [FABRIC_OPT], ownVChair: [FABRIC_OPT], ownMiyazaki: [FABRIC_OPT], ownDoll: [FABRIC_OPT], ownCY127: [FABRIC_OPT], ownDanishBench: [FABRIC_OPT], armchair: [FABRIC_OPT], sofa2: [FABRIC_OPT], sofa: [FABRIC_OPT], lsofa: [FABRIC_OPT], baysofa: [FABRIC_OPT],
  lounge: [FABRIC_OPT], shellchair: [FABRIC_OPT], wingchair: [FABRIC_OPT], woodchair: [FABRIC_OPT], pouf: [FABRIC_OPT], bench: [FABRIC_OPT],
  chair: [FABRIC_OPT, LEGMAT_OPT], barstool: [FABRIC_OPT], barstoolBack: [FABRIC_OPT], barstoolWood: [FABRIC_OPT], barstoolSwivel: [FABRIC_OPT], barisland: [BODYMAT_OPT, CAB_TOP], vstool: [FABRIC_OPT], ownPuff: [FABRIC_OPT], office: [FABRIC_OPT], desk: [LEGMAT_OPT], plant: [POT_OPT],
  bed: [FRAMEMAT_OPT], queen: [FRAMEMAT_OPT], single: [FRAMEMAT_OPT],
  tvcab: [BODYMAT_OPT, CAB_TOP], cabinet: [BODYMAT_OPT, CAB_TOP], night: [BODYMAT_OPT, CAB_TOP],
  wardrobe: [BODYMAT_OPT], slidewardrobe: [BODYMAT_OPT], bookshelf: [BODYMAT_OPT], kitchen: [BODYMAT_OPT], sideboard: [BODYMAT_OPT], vanity: [BODYMAT_OPT],
};
const EXTRA_DEF = { // 白色系櫃體預設烤漆，木色系預設木頭；檯面顏色預設同櫃體
  own171: { fabric: 'leather' }, ownAthena: { fabric: 'leather' }, barstool: { fabric: 'leather' }, barstoolBack: { fabric: 'fabric' }, barstoolWood: { fabric: 'leather' }, barstoolSwivel: { fabric: 'leather' }, barisland: { bodymat: 'lacquer', topmat: 'slate' },
  ownVChair: { fabric: 'leather' }, ownMiyazaki: { fabric: 'leather' }, ownDoll: { fabric: 'leather' }, ownCY127: { fabric: 'leather' }, ownDanishBench: { fabric: 'leather' },
  tvcab: { bodymat: 'lacquer' }, cabinet: { bodymat: 'lacquer' }, wardrobe: { bodymat: 'lacquer' }, slidewardrobe: { bodymat: 'lacquer' },
  kitchen: { bodymat: 'lacquer' }, vanity: { bodymat: 'lacquer' },
};
for (const [k, list] of Object.entries(EXTRA_OPTS)) {
  const T = TYPES[k];
  T.opts = [...(T.opts || []), ...list];
  T.def = { ...(T.def || {}), ...(EXTRA_DEF[k] || {}) };
  if (list.includes(CAB_TOP)) { T.c3 = T.c3 || '檯面顏色'; if (!T.color3) T.color3 = T.color; }
}
// 桌上小物可以自動放上的家具
const ON_TOP = {
  tablelamp: ['desk', 'night', 'side', 'sideboard'], tableware: ['dining', 'round', 'ownDanish', 'ownPencil'], vase: ['dining', 'round', 'ownDanish', 'ownPencil', 'coffee', 'sideboard', 'side'],
  microwave: ['kitchen', 'sideboard'], ricecooker: ['kitchen', 'sideboard'], coffeemaker: ['kitchen', 'sideboard'],
  sculpture: ['pedestal', 'sideboard', 'coffee', 'side'], books: ['coffee', 'desk', 'side', 'night'],
};
for (const [k, v] of Object.entries(ON_TOP)) if (TYPES[k]) TYPES[k].on = v;
const optsOf = T => T.opts || [];
const optEntry = (it, g) => g.list.find(x => x.id === it[g.key]) || g.list[0];
function applyDefaults(it, T) {
  for (const g of optsOf(T)) if (!it[g.key] || !g.list.some(x => x.id === it[g.key])) it[g.key] = (T.def && T.def[g.key]) || g.list[0].id;
  if (T.color3 && !it.color3) it.color3 = T.color3;
  return it;
}
// 無門的系統櫃不顯示把手、門片表面
const visOpts = it => optsOf(TYPES[it.type]).filter(g => !(it.door === 'open' && (g.key === 'handle' || g.key === 'finish')) && !(g.key === 'deco' && it.door !== 'slide') && !(g.key === 'arm' && it.type === 'baysofa' && it.style !== 'bay') && !(g.key === 'idrawers' && TYPES[it.type].drawerFull));   // 整面都是外抽屜的櫃子沒有內抽屜
const styleName = it => visOpts(it).map(g => optEntry(it, g).name).join('・');
function colorLabel(it, n) {
  const T = TYPES[it.type]; let lbl = T['c' + n] || null;
  for (const g of optsOf(T)) { const e = optEntry(it, g); if (e['c' + n] !== undefined) lbl = e['c' + n]; }
  return lbl;
}
function sizeFor(it) {
  const T = TYPES[it.type]; let s = { w: T.w, d: T.d, h: T.h };
  for (const g of optsOf(T)) { const e = optEntry(it, g); if (e.size) s = e.size; }
  return { ...s };
}
const PALETTE = ['#ffffff', '#f1ebe1', '#d8cfc0', '#b9b4ad', '#8e9099', '#4a4d52', '#222222', '#e8d3b0', '#c49a6c', '#8b5a3c', '#5a3a28', '#3d5a80', '#9fb3c8', '#5f7d63', '#c98b8b', '#d9a441', '#9e4a3a'];

function hslOf(hex) { const h = {}; new THREE.Color(hex || '#ffffff').getHSL(h, THREE.SRGBColorSpace); return h; }

/* ===== AR 試擺間用：依尺寸重建 ===== */
export function ownList() { return Object.entries(TYPES).filter(([k, T]) => T.own && T.build).map(([k, T]) => ({ k, n: T.name, w: T.w, d: T.d, h: T.h })); }
export function buildOwn(k, size, cols) {
  const T = TYPES[k]; const it = applyDefaults({ ...T, type: k, id: 0, rot: 0 }, T);
  if (size) { it.w = size.w; it.d = size.d; it.h = size.h; }
  if (cols) { if (cols[0]) it.color = cols[0]; if (cols[1]) it.color2 = cols[1]; if (cols[2]) it.color3 = cols[2]; }
  let g; try { TRI_CUR = triSize(it); TRI_MAX = Math.max(it.w || 0, it.d || 0); } catch (e) {}
  try { g = T.build(it); } finally { TRI_CUR = TRI_MAX = 0; }
  g.updateMatrixWorld(true); return g;
}
export { THREE, TYPES };
