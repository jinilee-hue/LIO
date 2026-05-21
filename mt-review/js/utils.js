/**
 * utils.js — Typewriter, confetti, STT toast
 */

const Utils = (() => {

  /* ─────────────────────────────────────────────
     Typewriter Effect
     ───────────────────────────────────────────── */

  /**
   * Types text into an element character by character.
   * @param {HTMLElement} el
   * @param {string} text
   * @param {number} delay  ms between characters
   * @returns {Promise<void>}
   */
  function typewriter(el, text, delay = 28) {
    return new Promise(resolve => {
      el.textContent = '';
      el.classList.add('typing-cursor');
      let i = 0;
      const tick = () => {
        if (i < text.length) {
          el.textContent += text[i++];
          setTimeout(tick, delay);
        } else {
          el.classList.remove('typing-cursor');
          resolve();
        }
      };
      tick();
    });
  }

  /* ─────────────────────────────────────────────
     Confetti Burst (Canvas particle system)
     ───────────────────────────────────────────── */

  function confettiBurst(canvas) {
    if (!canvas) return;

    const ctx  = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const COLORS = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8'];
    const COUNT  = 80;

    const particles = Array.from({ length: COUNT }, () => ({
      x:    canvas.width  * (0.2 + Math.random() * 0.6),
      y:    canvas.height * (0.3 + Math.random() * 0.2),
      vx:   (Math.random() - 0.5) * 10,
      vy:   -(Math.random() * 8 + 4),
      size: Math.random() * 8 + 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
      alpha: 1,
    }));

    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.28;      // gravity
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.alpha -= 0.013;

        if (p.alpha <= 0) return;
        alive = true;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });

      if (alive) {
        frame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (frame) cancelAnimationFrame(frame);
    draw();
  }

  /* ─────────────────────────────────────────────
     STT Toast
     ───────────────────────────────────────────── */

  let _toastTimer = null;

  /**
   * Shows a brief toast at the bottom of the screen with STT result.
   * @param {string} text
   * @param {number} duration  ms to show (default 2000)
   */
  function showSttToast(text, duration = 2000) {
    const toast = document.getElementById('stt-toast');
    if (!toast) return;

    clearTimeout(_toastTimer);
    toast.textContent = `"${text}"`;
    toast.classList.remove('hidden');

    _toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  return { typewriter, confettiBurst, showSttToast };

})();
