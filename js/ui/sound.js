/* أصوات اللعبة مولّدة بالكامل عبر Web Audio API (بلا ملفات صوتية) */
(function (SJ) {
  'use strict';

  let ctx = null;
  let master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  const isEnabled = () => SJ.repo.Settings.get().sounds !== false;

  function tone(freq, { at = 0, dur = 0.15, type = 'sine', gain = 0.3, to = null, attack = 0.01 } = {}) {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ at = 0, dur = 0.4, gain = 0.15, from = 400, to = 4000 } = {}) {
    const t0 = ctx.currentTime + at;
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const SOUNDS = {
    // فتح سؤال: صعود نغمي
    open() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.28, type: 'triangle', gain: 0.22 }));
    },
    // كشف الإجابة
    reveal() {
      noise({ dur: 0.35, gain: 0.12, from: 600, to: 5000 });
      tone(392, { at: 0.12, dur: 0.35, type: 'sine', gain: 0.22, to: 784 });
    },
    tick() {
      tone(1250, { dur: 0.06, type: 'square', gain: 0.1 });
    },
    timeUp() {
      tone(220, { dur: 0.7, type: 'sawtooth', gain: 0.2 });
      tone(164.8, { dur: 0.7, type: 'sawtooth', gain: 0.16 });
    },
    correct() {
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.4, type: 'triangle', gain: 0.26 }));
      tone(1046.5, { at: 0.27, dur: 0.6, type: 'sine', gain: 0.22 });
    },
    wrong() {
      tone(196, { dur: 0.25, type: 'square', gain: 0.14 });
      tone(146.8, { at: 0.22, dur: 0.5, type: 'square', gain: 0.14 });
    },
    win() {
      const notes = [[523.25, 0], [523.25, 0.14], [523.25, 0.28], [659.25, 0.42], [783.99, 0.62], [659.25, 0.86], [783.99, 1.0], [1046.5, 1.2]];
      notes.forEach(([f, at], i) => tone(f, { at, dur: i === notes.length - 1 ? 1.0 : 0.22, type: 'triangle', gain: 0.25 }));
      notes.forEach(([f, at]) => tone(f / 2, { at, dur: 0.2, type: 'sine', gain: 0.12 }));
    },
    click() {
      tone(880, { dur: 0.05, type: 'sine', gain: 0.08 });
    },
  };

  function play(name) {
    if (!isEnabled() || !SOUNDS[name]) return;
    if (!ensure()) return;
    try { SOUNDS[name](); } catch (e) { /* تجاهل أخطاء الصوت */ }
  }

  // المتصفحات تتطلب تفاعلًا من المستخدم قبل تشغيل الصوت
  function init() {
    const unlock = () => ensure();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  }

  async function toggle() {
    const next = !isEnabled();
    await SJ.repo.Settings.update({ sounds: next });
    if (next) play('click');
    return next;
  }

  SJ.sound = { play, init, toggle, isEnabled };
})(window.SJ);
