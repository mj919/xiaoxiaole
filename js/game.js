/* ==========================================================================
 *  照片消消乐 —— 羊了个羊式三消
 *  纯 DOM + 原生 JS，无第三方库
 * ========================================================================== */
(function () {
'use strict';

/* ============================== 配置 ============================== */
const CFG = {
  slotCount: 7,        // 卡槽格数（放满即输）
  fillRatio: 0.94,     // 牌堆占可用空间的比例
};

/* 关卡：每层 cols×rows；层与层之间自动错开半格，形成堆叠遮挡
 * 牌数 = Σ cols*rows，会按 3 张一组分配，保证一定有解 */
const LEVELS = [
  { layers: [{ c: 5, r: 8 }, { c: 4, r: 6 }, { c: 2, r: 4 }] },                                  // 40+24+8  = 72
  { layers: [{ c: 6, r: 8 }, { c: 5, r: 6 }, { c: 3, r: 4 }, { c: 2, r: 3 }] },                   // 48+30+12+6 = 96
  { layers: [{ c: 6, r: 9 }, { c: 5, r: 6 }, { c: 4, r: 4 }, { c: 3, r: 4 }, { c: 2, r: 4 }] },   // 54+30+16+12+8 = 120
];

/* ============================== DOM ============================== */
const $ = (id) => document.getElementById(id);
const dom = {
  board: $('board'), stage: $('stage'), slots: $('slots'), flyLayer: $('flyLayer'),
  levelNum: $('levelNum'), remainNum: $('remainNum'),
  startScreen: $('startScreen'), winScreen: $('winScreen'), loseScreen: $('loseScreen'),
  winSub: $('winSub'),
  btnStart: $('btnStart'), btnNext: $('btnNext'), btnReplay1: $('btnReplay1'),
  btnRetry: $('btnRetry'), btnBackHome: $('btnBackHome'),
  toolUndo: $('toolUndo'), toolShuffle: $('toolShuffle'), toolRemove: $('toolRemove'),
};

const CARD_IMAGES = window.CARDS && window.CARDS.length ? window.CARDS : ['card_1.png'];

/* ============================== 状态 ============================== */
const S = {
  level: 0,
  cards: [],          // {id,type,x,y,layer,removed,el}
  slots: [],          // {type,cardId}
  unit: 40,           // 一格的像素边长
  bounds: { minX: 0, minY: 0, w: 0, h: 0 },
  busy: false,
  over: false,
  history: [],        // 撤销栈：{cardId}
  tools: { undo: 1, shuffle: 1, remove: 1 },
};

/* ============================== 工具函数 ============================== */
const shuffleArr = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const overlap = (a, b) =>
  a.x < b.x + 1 && a.x + 1 > b.x && a.y < b.y + 1 && a.y + 1 > b.y;

/* ============================== 关卡生成 ============================== */

/* 1) 按层生成所有格子位置 */
function buildPositions(def) {
  let maxC = 0, maxR = 0;
  def.layers.forEach((L) => { maxC = Math.max(maxC, L.c); maxR = Math.max(maxR, L.r); });
  const cx = (maxC - 1) / 2, cy = (maxR - 1) / 2;   // 所有层的中心对齐到同一点

  const pos = [];
  def.layers.forEach((L, li) => {
    const ox = cx - (L.c - 1) / 2;
    const oy = cy - (L.r - 1) / 2;
    for (let j = 0; j < L.r; j++) {
      for (let i = 0; i < L.c; i++) {
        pos.push({ x: ox + i, y: oy + j, layer: li });
      }
    }
  });
  return pos;
}

/* 2) 判断某张牌当前是否"没被压住" */
function isFree(card, all) {
  for (let i = 0; i < all.length; i++) {
    const o = all[i];
    if (o === card || o.removed) continue;
    if (o.layer > card.layer && overlap(card, o)) return false;
  }
  return true;
}

/* 3) 生成一条合法的取牌顺序（每次从当前可点的牌里随机挑）
 *    按这条顺序每 3 张配同一种牌，就必然存在通关路径 → 保证有解 */
function legalOrder(positions) {
  const remain = positions.slice();
  const order = [];
  while (remain.length) {
    const free = remain.filter((p) => isFree(p, remain));
    if (!free.length) break;
    const pick = free[Math.floor(Math.random() * free.length)];
    order.push(pick);
    remain.splice(remain.indexOf(pick), 1);
  }
  // 极端情况下（不该发生）补齐剩余
  remain.forEach((p) => order.push(p));
  return order;
}

/* 4) 分配牌面种类：每 3 张一组，同一组三张 = 同一种 */
function assignTypes(order, typeCount) {
  const groups = Math.floor(order.length / 3);
  const groupType = [];
  for (let g = 0; g < groups; g++) groupType.push(g % typeCount);
  shuffleArr(groupType);                       // 打乱"哪种牌在第几组"，让分布更随机

  for (let g = 0; g < groups; g++) {
    const t = groupType[g];
    for (let k = 0; k < 3; k++) order[g * 3 + k].type = t;
  }
  // 不足 3 张的余数（正常不会出现）随便补
  for (let i = groups * 3; i < order.length; i++) {
    order[i].type = Math.floor(Math.random() * typeCount);
  }
}

/* ============================== 渲染 ============================== */
function computeLayout() {
  const { minX, minY, w, h } = S.bounds;
  const stageW = dom.stage.clientWidth;
  const stageH = dom.stage.clientHeight;
  const unit = Math.min(
    (stageW * CFG.fillRatio) / w,
    (stageH * CFG.fillRatio) / h
  );
  S.unit = Math.max(24, unit);

  const bw = w * S.unit, bh = h * S.unit;
  dom.board.style.width = bw + 'px';
  dom.board.style.height = bh + 'px';
  dom.board.style.left = Math.round((stageW - bw) / 2) + 'px';
  // 牌堆整体略偏下：上方留白多、下方离卡槽近，视觉重心更稳
  dom.board.style.top = Math.round((stageH - bh) * 0.5 + stageH * 0.03) + 'px';
}

function cardStyle(el, card) {
  el.style.width = S.unit + 'px';
  el.style.height = S.unit + 'px';
  el.style.left = ((card.x - S.bounds.minX) * S.unit) + 'px';
  el.style.top = ((card.y - S.bounds.minY) * S.unit) + 'px';
  // 层级：层号越大越靠上；同层按 y 排，下面的盖上面的
  el.style.zIndex = String(card.layer * 1000 + Math.round(card.y * 10) + 10);
}

function createCardEl(card) {
  const el = document.createElement('div');
  el.className = 'pcard';
  el.style.backgroundImage = `url(assets/cards/${CARD_IMAGES[card.type]})`;
  cardStyle(el, card);
  el.addEventListener('click', () => onPick(card));
  dom.board.appendChild(el);
  card.el = el;
  return el;
}

function refreshFreeState() {
  const alive = S.cards.filter((c) => !c.removed);
  for (const c of alive) {
    const free = isFree(c, alive);
    if (c.el) {
      c.el.classList.toggle('locked', !free);
      c.el.classList.toggle('free', free);
    }
  }
}

/* ============================== 卡槽 ============================== */
function buildSlotEls() {
  dom.slots.innerHTML = '';
  for (let i = 0; i < CFG.slotCount; i++) {
    const d = document.createElement('div');
    d.className = 'slot';
    dom.slots.appendChild(d);
  }
}

function renderSlots(animateIdx) {
  const els = dom.slots.children;
  for (let i = 0; i < CFG.slotCount; i++) {
    const el = els[i];
    const s = S.slots[i];
    if (s) {
      el.className = 'slot filled';
      el.style.backgroundImage = `url(assets/cards/${CARD_IMAGES[s.type]})`;
    } else {
      el.className = 'slot';
      el.style.backgroundImage = '';
    }
  }
  if (animateIdx != null && els[animateIdx]) {
    els[animateIdx].classList.add('pop');
  }
}

/* 同种类的牌自动靠在一起（保持一致的出现顺序，避免来回跳） */
function sortSlots() {
  const order = [];
  S.slots.forEach((s) => { if (!order.includes(s.type)) order.push(s.type); });
  S.slots.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/* ============================== 取牌 ============================== */
function onPick(card) {
  SFX.init();
  if (S.busy || S.over || card.removed) return;
  if (!isFree(card, S.cards)) { SFX.blocked(); nudge(card); return; }
  if (S.slots.length >= CFG.slotCount) return;

  SFX.pick();
  card.removed = true;
  S.history.push({ cardId: card.id });
  if (card.el) {
    card.el.classList.add('locked');
    card.el.style.transition = 'opacity .16s, transform .16s';
    card.el.style.opacity = '0';
    card.el.style.transform = 'scale(.72)';
    const el = card.el;
    setTimeout(() => el.remove(), 170);
    card.el = null;
  }

  S.slots.push({ type: card.type, cardId: card.id });
  sortSlots();
  renderSlots();
  refreshFreeState();
  updateHUD();

  S.busy = true;
  setTimeout(() => { S.busy = false; settle(); }, 190);
}

function nudge(card) {
  if (!card.el) return;
  card.el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
     { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
    { duration: 190 });
}

/* ============================== 结算 ============================== */
function settle() {
  if (S.over) return;

  // 找有没有凑齐 3 张的
  const count = {};
  S.slots.forEach((s) => { count[s.type] = (count[s.type] || 0) + 1; });
  const hit = Object.keys(count).find((t) => count[t] >= 3);

  if (hit != null) {
    const type = Number(hit);
    const idxs = [];
    S.slots.forEach((s, i) => { if (s.type === type && idxs.length < 3) idxs.push(i); });

    SFX.match();
    const els = dom.slots.children;
    idxs.forEach((i) => els[i] && els[i].classList.add('gone'));

    S.history = S.history.filter((h) => !idxs.some((i) => S.slots[i].cardId === h.cardId));
    S.busy = true;
    setTimeout(() => {
      idxs.sort((a, b) => b - a).forEach((i) => S.slots.splice(i, 1));
      renderSlots();
      updateHUD();
      S.busy = false;
      settle();                       // 递归处理连锁
    }, 280);
    return;
  }

  updateHUD();
  if (S.slots.length >= CFG.slotCount) { lose(); return; }
  checkWin();
}

function checkWin() {
  const alive = S.cards.filter((c) => !c.removed);
  if (alive.length === 0 && S.slots.length === 0) win();
}

function updateHUD() {
  dom.remainNum.textContent = S.cards.filter((c) => !c.removed).length;
  dom.levelNum.textContent = S.level + 1;
}

/* ============================== 胜负 ============================== */
function win() {
  S.over = true;
  SFX.win();
  confetti();
  dom.winSub.textContent = `第 ${S.level + 1} 关 · 全部消除完毕`;
  const last = S.level >= LEVELS.length - 1;
  dom.btnNext.textContent = last ? '再玩一次' : '下一关';
  dom.winScreen.classList.remove('hidden');
}

function lose() {
  S.over = true;
  SFX.lose();
  dom.loseScreen.classList.remove('hidden');
}

function confetti() {
  const colors = ['#ffd23f', '#ff5fa8', '#4fe3ff', '#4ade80', '#ffffff'];
  for (let i = 0; i < 44; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colors[i % colors.length];
    d.style.animationDuration = (1.5 + Math.random() * 1.4) + 's';
    d.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3400);
  }
}

/* ============================== 道具 ============================== */
function useTool(name) {
  if (S.busy || S.over) return;
  if (S.tools[name] <= 0) return;
  if (name === 'undo' && !S.history.length) { SFX.blocked(); return; }
  if (name === 'remove' && !S.slots.length) { SFX.blocked(); return; }

  S.tools[name]--;
  updateTools();

  if (name === 'undo') doUndo();
  else if (name === 'shuffle') doShuffle();
  else doRemove();
}

/* 撤销：把最后放进卡槽的牌退回牌堆 */
function doUndo() {
  const rec = S.history.pop();
  if (!rec) return;
  const idx = S.slots.findIndex((s) => s.cardId === rec.cardId);
  if (idx < 0) return;
  const [slot] = S.slots.splice(idx, 1);
  const card = S.cards.find((c) => c.id === slot.cardId);
  if (card) {
    card.removed = false;
    createCardEl(card);
  }
  SFX.undo();
  renderSlots();
  refreshFreeState();
  updateHUD();
}

/* 洗牌：把牌堆里剩余牌的种类重新随机分配（种类总数不变，所以每种仍是 3 的倍数） */
function doShuffle() {
  const alive = S.cards.filter((c) => !c.removed);
  if (alive.length < 3) return;
  const types = alive.map((c) => c.type);
  shuffleArr(types);
  alive.forEach((c, i) => {
    c.type = types[i];
    if (c.el) c.el.style.backgroundImage = `url(assets/cards/${CARD_IMAGES[c.type]})`;
  });
  SFX.shuffle();
  refreshFreeState();
}

/* 移出：把卡槽里的牌全部退回牌堆 */
function doRemove() {
  const back = S.slots.slice();
  S.slots = [];
  back.forEach((s) => {
    const card = S.cards.find((c) => c.id === s.cardId);
    if (card) { card.removed = false; createCardEl(card); }
  });
  S.history = [];
  SFX.remove();
  renderSlots();
  refreshFreeState();
  updateHUD();
}

function updateTools() {
  const map = { undo: dom.toolUndo, shuffle: dom.toolShuffle, remove: dom.toolRemove };
  Object.keys(map).forEach((k) => {
    const el = map[k];
    el.classList.toggle('used', S.tools[k] <= 0);
    const c = el.querySelector('.tc');
    if (c) c.textContent = S.tools[k];
  });
}

/* ============================== 开局 ============================== */
function startLevel(idx) {
  S.level = Math.max(0, Math.min(idx, LEVELS.length - 1));
  S.cards = [];
  S.slots = [];
  S.history = [];
  S.busy = false;
  S.over = false;
  S.tools = { undo: 1, shuffle: 1, remove: 1 };
  dom.board.innerHTML = '';
  dom.startScreen.classList.add('hidden');
  dom.winScreen.classList.add('hidden');
  dom.loseScreen.classList.add('hidden');

  const positions = buildPositions(LEVELS[S.level]);
  const order = legalOrder(positions);
  assignTypes(order, CARD_IMAGES.length);
  // 记下这条合法解的顺序（调试用：可以按它自动通关验证）
  order.forEach((p, i) => { p.orderIdx = i; });

  // 计算边界
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  S.bounds = { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };

  computeLayout();
  buildSlotEls();

  S.cards = positions.map((p, i) => ({
    id: i, type: p.type, x: p.x, y: p.y, layer: p.layer,
    orderIdx: p.orderIdx != null ? p.orderIdx : i,
    removed: false, el: null,
  }));
  S.cards.forEach(createCardEl);
  refreshFreeState();
  renderSlots();
  updateHUD();
  updateTools();
}

/* ============================== 事件 ============================== */
dom.btnStart.addEventListener('click', () => { SFX.init(); SFX.click(); startLevel(0); });
dom.btnReplay1.addEventListener('click', () => { SFX.click(); startLevel(S.level); });
dom.btnRetry.addEventListener('click', () => { SFX.click(); startLevel(S.level); });
dom.btnBackHome.addEventListener('click', () => { SFX.click(); startLevel(0); });
dom.btnNext.addEventListener('click', () => {
  SFX.click();
  const last = S.level >= LEVELS.length - 1;
  startLevel(last ? 0 : S.level + 1);
});
dom.toolUndo.addEventListener('click', () => useTool('undo'));
dom.toolShuffle.addEventListener('click', () => useTool('shuffle'));
dom.toolRemove.addEventListener('click', () => useTool('remove'));

window.addEventListener('resize', () => {
  if (!S.cards.length) return;
  computeLayout();
  S.cards.forEach((c) => { if (c.el) cardStyle(c.el, c); });
});
window.addEventListener('orientationchange', () => setTimeout(() => {
  if (!S.cards.length) return;
  computeLayout();
  S.cards.forEach((c) => { if (c.el) cardStyle(c.el, c); });
}, 150));

/* ============================== 调试自动试玩 ============================== */
function autoPick() {
  const free = S.cards.filter((c) => !c.removed && isFree(c, S.cards));
  if (!free.length) return null;
  const cnt = {};
  S.slots.forEach((s) => { cnt[s.type] = (cnt[s.type] || 0) + 1; });
  return free.find((c) => cnt[c.type] === 2)          // 能立刻凑三张的最优先
      || free.find((c) => cnt[c.type] === 1)
      || (S.slots.length < CFG.slotCount - 1 ? free.find((c) => !cnt[c.type]) : null)
      || free[0];
}

/* 按生成时的合法解顺序取牌（调试用，必定能通关） */
function solvePick() {
  const alive = S.cards.filter((c) => !c.removed);
  if (!alive.length) return null;
  alive.sort((a, b) => a.orderIdx - b.orderIdx);
  return alive[0];
}

/* 预加载所有牌面图片：进页面就开始下载，避免开局后牌面一片空白 */
function preloadCards() {
  const btn = dom.btnStart;
  const total = CARD_IMAGES.length;
  let done = 0;
  btn.disabled = true;
  btn.textContent = `加载牌面 0%`;

  return Promise.all(CARD_IMAGES.map((name) => new Promise((res) => {
    const im = new Image();
    const fin = () => {
      done++;
      btn.textContent = done >= total ? '开始游戏' : `加载牌面 ${Math.round(done / total * 100)}%`;
      res();
    };
    im.onload = fin;
    im.onerror = fin;          // 单张失败也不卡住流程
    im.src = 'assets/cards/' + name;
  }))).then(() => { btn.disabled = false; });
}

/* ============================== 启动 ============================== */
(function boot() {
  // 调试：?level=2 直接进第 3 关
  const m = location.search.match(/[?&]level=(\d+)/);
  if (m) startLevel(Math.max(0, parseInt(m[1], 10) - 1));
  else dom.startScreen.classList.remove('hidden');

  preloadCards();

  // 调试：?auto=N 自动试玩 N 步；?solve=1 按预设解法自动通关
  const am = location.search.match(/[?&]auto=(\d+)/);
  const solve = /[?&]solve\b/.test(location.search);

  if ((am || solve) && m) {
    const total = solve ? 9999 : parseInt(am[1], 10);
    const wantTools = /[?&]tools\b/.test(location.search);   // 顺便把三个道具都点一遍
    let k = 0;
    const timer = setInterval(() => {
      if (k++ >= total || S.over) { clearInterval(timer); return; }
      if (S.busy) return;
      if (wantTools && k === 3) { useTool('shuffle'); return; }
      if (wantTools && k === 6) { useTool('undo'); return; }
      if (wantTools && k === 9) { useTool('remove'); return; }
      const c = solve ? solvePick() : autoPick();
      if (!c) { clearInterval(timer); return; }
      onPick(c);
    }, solve ? 60 : 300);
  }
})();

})();
