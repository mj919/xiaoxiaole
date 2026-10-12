/* ===========================================================
 *  SFX — WebAudio 实时合成音效，不需要任何音频素材文件
 * =========================================================== */
window.SFX = (function () {
  let ctx = null;
  let master = null;
  let enabled = true;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f1, f2) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(f1 || 1400, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  return {
    init,
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; if (enabled) init(); return enabled; },

    pick()    { tone(720, 0.07, 'triangle', 0.14); },
    blocked() { tone(180, 0.1, 'square', 0.1); },
    match()   { [784, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.17), i * 62)); },
    win()     { [523, 659, 784, 1046, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.18), i * 95)); },
    lose()    { [440, 370, 294, 220].forEach((f, i) => setTimeout(() => tone(f, 0.26, 'sawtooth', 0.14), i * 135)); },
    undo()    { tone(560, 0.12, 'sine', 0.15, 320); },
    shuffle() { noise(0.34, 0.2, 2600, 500); },
    remove()  { tone(420, 0.2, 'sine', 0.16, 880); },
    click()   { tone(660, 0.06, 'square', 0.11); }
  };
})();
