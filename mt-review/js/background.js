/**
 * background.js — Background video mapping + gradient fallbacks
 * Maps bgKeyword from Claude → video file or CSS gradient
 */

const BackgroundManager = (() => {

  /* Map keyword → video URL (external URL or local assets/videos/ filename) */
  const VIDEO_MAP = {
    forest: 'https://jinilee-hue.github.io/LIO/mp_.mp4',
    ocean:  'ocean.mp4',
    city:   'city.mp4',
    farm:   'farm.mp4',
    school: 'school.mp4',
    space:  'space.mp4',
  };

  /* CSS gradient fallbacks when video not available */
  const GRADIENT_MAP = {
    forest: 'linear-gradient(135deg, #0d2b1a 0%, #1a4d2e 50%, #0d2b1a 100%)',
    ocean:  'linear-gradient(135deg, #0a1628 0%, #0e3460 50%, #0a1628 100%)',
    city:   'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 50%, #1a1a2e 100%)',
    farm:   'linear-gradient(135deg, #1e2b0d 0%, #3d5a1a 50%, #1e2b0d 100%)',
    school: 'linear-gradient(135deg, #1a1a30 0%, #2e2e50 50%, #1a1a30 100%)',
    space:  'linear-gradient(135deg, #000010 0%, #0a0a2e 50%, #000010 100%)',
  };

  let currentKeyword = '';
  const videoEl   = document.getElementById('bg-video');
  const fallbackEl = document.getElementById('bg-fallback');

  function init() {
    // Try to set a default background
    setBackground('forest');
  }

  function setBackground(keyword) {
    if (keyword === currentKeyword) return;
    currentKeyword = keyword;

    const gradient = GRADIENT_MAP[keyword] || GRADIENT_MAP.forest;
    fallbackEl.style.background = gradient;

    const filename = VIDEO_MAP[keyword];
    if (!filename || !videoEl) return;

    const src = filename.startsWith('http') ? filename : `assets/videos/${filename}`;
    console.log('[BG] loading video:', src);

    videoEl.classList.add('fade-out');

    setTimeout(() => {
      videoEl.muted      = true;   // must be set in JS for autoplay to work
      videoEl.loop       = true;
      videoEl.playsInline = true;
      videoEl.src        = src;
      videoEl.load();
      videoEl.play()
        .then(() => {
          console.log('[BG] video playing');
          videoEl.classList.remove('fade-out');
        })
        .catch((err) => {
          console.warn('[BG] video play failed:', err.message);
          videoEl.removeAttribute('src');
          videoEl.classList.remove('fade-out');
        });
    }, 300);
  }

  return { init, setBackground };

})();
