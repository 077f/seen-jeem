/* مؤثرات الحركة: كونفيتي الفوز، العدّاد المتحرك للنقاط، المؤقت الدائري */
(function (SJ) {
  'use strict';

  const { h } = SJ.dom;
  const { utils } = SJ;

  /* ---------- الكونفيتي ---------- */
  function confetti({ duration = 4200, count = 240, colors = ['#f8cd57', '#ffffff', '#22cd88', '#12d3c2', '#18c6ef', '#f5b729', '#57e3a6'] } = {}) {
    if (utils.prefersReducedMotion()) return;
    const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // قصاصات تنطلق من الزاويتين السفليتين نحو الوسط
    const parts = Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? -10 : W + 10,
        y: H * (0.7 + Math.random() * 0.25),
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 10),
        vy: -(14 + Math.random() * 12),
        size: 6 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length],
        shape: Math.random() < 0.3 ? 'circle' : 'rect',
        delay: Math.random() * 600,
      };
    });
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      parts.forEach((p) => {
        if (elapsed < p.delay) { alive++; return; }
        p.vy += 0.38;
        p.vx *= 0.985;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < H + 40) alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      });
      if (alive && elapsed < duration + 2500) requestAnimationFrame(frame);
      else {
        window.removeEventListener('resize', resize);
        canvas.remove();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- العدّاد المتحرك ---------- */
  function animateNumber(el, from, to, duration = 750) {
    if (utils.prefersReducedMotion() || from === to) {
      el.textContent = utils.formatNumber(to);
      return;
    }
    const start = performance.now();
    const token = {};
    el._countToken = token;
    function step(now) {
      if (el._countToken !== token) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = utils.formatNumber(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- المؤقت الدائري ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RADIUS = 54;
  const CIRC = 2 * Math.PI * RADIUS;

  function createTimer({ seconds, onEnd }) {
    const total = seconds * 1000;
    let remaining = total;
    let running = false;
    let lastTs = 0;
    let raf = 0;
    let lastSecond = null;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(SVG_NS, 'circle');
    const ring = document.createElementNS(SVG_NS, 'circle');
    [track, ring].forEach((c) => {
      c.setAttribute('cx', '60');
      c.setAttribute('cy', '60');
      c.setAttribute('r', String(RADIUS));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke-width', '10');
    });
    track.setAttribute('class', 'timer__track');
    ring.setAttribute('class', 'timer__ring');
    ring.setAttribute('stroke-linecap', 'round');
    ring.setAttribute('stroke-dasharray', String(CIRC));
    svg.append(track, ring);
    const valueEl = h('span', { class: 'timer__value' });
    const el = h('div', { class: 'timer', role: 'timer', 'aria-label': 'المؤقت' }, svg, valueEl);

    function render() {
      const fraction = total ? remaining / total : 0;
      ring.style.strokeDashoffset = String(CIRC * (1 - fraction));
      valueEl.textContent = String(Math.ceil(remaining / 1000));
      el.classList.toggle('is-warning', remaining > 0 && remaining <= 5000);
      el.classList.toggle('is-ended', remaining <= 0);
      el.classList.toggle('is-paused', !running && remaining > 0);
    }

    function loop(ts) {
      remaining -= ts - lastTs;
      lastTs = ts;
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastSecond) {
        lastSecond = sec;
        if (sec <= 5 && sec > 0) SJ.sound.play('tick');
      }
      if (remaining <= 0) {
        remaining = 0;
        running = false;
        render();
        SJ.sound.play('timeUp');
        if (onEnd) onEnd();
        return;
      }
      render();
      raf = requestAnimationFrame(loop);
    }

    const api = {
      el,
      start() {
        if (running || remaining <= 0) return;
        running = true;
        lastTs = performance.now();
        raf = requestAnimationFrame(loop);
        render();
      },
      pause() {
        running = false;
        cancelAnimationFrame(raf);
        render();
      },
      toggle() {
        if (remaining <= 0) api.restart();
        else if (running) api.pause();
        else api.start();
      },
      restart() {
        api.pause();
        remaining = total;
        lastSecond = null;
        api.start();
      },
      destroy() {
        running = false;
        cancelAnimationFrame(raf);
      },
      isRunning: () => running,
    };
    render();
    return api;
  }

  Object.assign(SJ.ui, { confetti, animateNumber, createTimer });
})(window.SJ);
