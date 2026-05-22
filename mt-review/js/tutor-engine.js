/**
 * tutor-engine.js — Session FSM + TTS + STT orchestration
 * Drives the entire session lifecycle:
 *   INIT → GENERATING → READING_PASSAGE → ASKING_QUESTION
 *   → LISTENING → EVALUATING → CELEBRATING / SOCRATIC_HINT
 *   → FOLLOW_UP → SESSION_COMPLETE
 */

const TutorEngine = (() => {

  /* ── State Machine ── */
  const STATE = {
    INIT:             'init',
    GENERATING:       'generating',
    READING_PASSAGE:  'reading_passage',
    ASKING_QUESTION:  'asking_question',
    LISTENING:        'listening',
    EVALUATING:       'evaluating',
    CELEBRATING:      'celebrating',
    SOCRATIC_HINT:    'socratic_hint',
    FOLLOW_UP:        'follow_up',
    SESSION_COMPLETE: 'session_complete',
  };

  let state = STATE.INIT;
  let student, wrongAnswers, currentIndex;
  let currentContent = null;   // GeneratedContent
  let attemptCount   = 0;
  let scores         = [];     // 3|2|1 per question

  /* ── Silence Timer ── */
  let _silenceTimer = null;
  let _silenceIndex = 0;

  const SILENCE_PROMPTS = [
    '생각할 시간이 필요하니? 천천히 해도 괜찮아!',
    'A, B, C, D 중에 어떤 게 정답일거 같아? 어렵게 생각하지 말고 편하게 말해보자',
    '어려운 게 있으면 언제든지 물어봐! 같이 생각해보자.',
    '힌트가 필요해? 이야기 속에 답이 있을꺼야! 우리 지문을 다시 읽어볼까?',
  ];

  /* ── DOM refs ── */
  const $ = id => document.getElementById(id);

  /* ── TTS ── */
  const TTS = {
    speaking: false,
    _audio: null,   // ElevenLabs용 Audio 인스턴스

    speak(text, { onEnd } = {}) {
      if (CONFIG.ELEVENLABS_API_KEY) {
        this._speakElevenLabs(text, onEnd);
      } else {
        this._speakWebSpeech(text, onEnd);
      }
    },

    async _speakElevenLabs(text, onEnd) {
      this.speaking = true;

      let resolved = false;
      const resolve = () => {
        if (resolved) return;
        resolved = true;
        this.speaking = false;
        onEnd?.();
      };
      const timer = setTimeout(resolve, Math.max(8000, text.length * 160));

      try {
        const resp = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.ELEVENLABS_VOICE_ID}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': CONFIG.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_turbo_v2_5',   // multilingual: 영어·한국어 모두 자연스럽게
              voice_settings: {
                stability: 0.4,
                similarity_boost: 0.8,
                style: 0.35,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}`);

        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this._audio = audio;

        audio.onended = () => { URL.revokeObjectURL(url); clearTimeout(timer); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); clearTimeout(timer); resolve(); };
        await audio.play();

      } catch (err) {
        console.warn('[TTS] ElevenLabs 실패, Web Speech로 전환:', err.message);
        clearTimeout(timer);
        this._speakWebSpeech(text, onEnd);
      }
    },

    _speakWebSpeech(text, onEnd) {
      if (!window.speechSynthesis) { setTimeout(() => onEnd?.(), 1200); return; }

      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      this.speaking = true;

      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US'; utt.rate = 0.90; utt.pitch = 1.0; utt.volume = 1.0;

      // UK Female sounds more mature/warm than US English on Android Chrome
      const FEMALE_PREFS = [
        'Google UK English Female',
        'Microsoft Aria', 'Microsoft Jenny',
        'Google US English',
        'Microsoft Ana', 'Microsoft Zira', 'Samantha', 'Karen', 'Moira',
      ];
      const voices = speechSynthesis.getVoices();
      let preferred = null;
      for (const name of FEMALE_PREFS) {
        preferred = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
        if (preferred) break;
      }
      if (!preferred) preferred = voices.find(v => v.lang === 'en-US' && !v.localService);
      if (!preferred) preferred = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'));
      if (!preferred) preferred = voices.find(v => v.lang.startsWith('en'));
      if (preferred) utt.voice = preferred;

      let resolved = false;
      const resolve = () => {
        if (resolved) return;
        resolved = true;
        this.speaking = false;
        onEnd?.();
      };
      setTimeout(resolve, Math.max(4000, text.length * 120));
      utt.onend   = resolve;
      utt.onerror = () => resolve();
      speechSynthesis.speak(utt);
    },

    // 한국어/영어 모두 — ElevenLabs 멀티링구얼 우선, 없으면 Web Speech ko-KR
    speakKo(text, { onEnd } = {}) {
      if (CONFIG.ELEVENLABS_API_KEY) {
        this._speakElevenLabs(text, onEnd);
      } else {
        this._speakWebSpeechKo(text, onEnd);
      }
    },

    _speakWebSpeechKo(text, onEnd) {
      if (!window.speechSynthesis) { setTimeout(() => onEnd?.(), 1200); return; }

      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      this.speaking = true;

      const utt    = new SpeechSynthesisUtterance(text);
      utt.lang     = 'ko-KR';
      utt.rate     = 0.95;
      utt.pitch    = 1.1;
      utt.volume   = 1.0;

      const voices = speechSynthesis.getVoices();
      const koVoice = voices.find(v =>
        v.lang.startsWith('ko') && (
          v.name.includes('Google') || v.name.includes('Microsoft') || !v.localService
        )
      ) || voices.find(v => v.lang.startsWith('ko'));
      if (koVoice) utt.voice = koVoice;

      let resolved = false;
      const resolve = () => {
        if (resolved) return;
        resolved = true;
        this.speaking = false;
        onEnd?.();
      };
      setTimeout(resolve, Math.max(4000, text.length * 160));
      utt.onend   = resolve;
      utt.onerror = () => resolve();
      speechSynthesis.speak(utt);
    },

    stop() {
      if (this._audio) { this._audio.pause(); this._audio = null; }
      window.speechSynthesis?.cancel();
      this.speaking = false;
    },
  };


  /* ── STT ── */
  const STT = {
    recognition: null,
    active: false,
    _onResult: null,
    _onSpeechDetected: null,

    init() {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) { console.warn('Speech Recognition not supported'); return; }
      this.recognition = new Ctor();
      this.recognition.lang = 'en-US';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;

      this.recognition.onresult = (e) => {
        let final = '', interim = '';
        for (const r of e.results) {
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        const text = (final || interim).trim();
        if (text) {
          this._onSpeechDetected?.();   // 발화 감지 시 침묵 타이머 리셋
        }
        if (final && this._onResult) this._onResult(final.trim());
      };

      this.recognition.onerror = (e) => {
        console.warn('[STT] error:', e.error);
        // not-allowed / audio-capture: 복구 불가 — active 해제
        if (e.error === 'not-allowed' || e.error === 'audio-capture') {
          this.active = false;
        }
        // 그 외 (no-speech, network 등)는 onend 에서 재시작
      };

      // onend: active가 true면 계속 듣는 중 → 즉시 재시작
      // stop()은 active를 먼저 false로 바꾼 뒤 recognition.stop()을 호출하므로
      // 여기 도달할 때는 이미 false → 재시작 안 함
      this.recognition.onend = () => {
        if (!this.active) return;
        setTimeout(() => {
          if (!this.active) return;
          try { this.recognition.start(); } catch (_) {}
        }, 200);
      };
    },

    listen(onResult) {
      if (!this.recognition) { console.warn('STT not available'); return; }
      this._onResult = onResult;
      this.active = true;
      try { this.recognition.start(); } catch (_) {}
    },

    stop() {
      this.active = false;          // 먼저 false → onend가 재시작하지 않도록
      this._onResult = null;
      this._onSpeechDetected = null;
      try { this.recognition?.stop(); } catch (_) {}
    },

    _restart() {
      if (!this.active || !this._onResult) return;
      setTimeout(() => {
        if (!this.active) return;
        try { this.recognition.start(); } catch (_) {}
      }, 200);
    },
  };

  /* ── UI helpers ── */

  function setStatus() {}

  function buildProgressBar() {
    const bar = $('progress-bar');
    bar.innerHTML = '';
    wrongAnswers.forEach((_, i) => {
      const pill = document.createElement('div');
      pill.className = 'progress-pill';
      pill.id = `pill-${i}`;
      bar.appendChild(pill);
    });
    $('q-total').textContent = wrongAnswers.length;
  }

  function updateProgress(index) {
    $('q-current').textContent = index + 1;
    // Mark previous as done
    for (let i = 0; i < index; i++) {
      const pill = $(`pill-${i}`);
      if (pill) {
        const score = scores[i];
        pill.className = 'progress-pill ' + (score === 3 ? 'done-gold' : 'done');
      }
    }
    // Mark current
    const cur = $(`pill-${index}`);
    if (cur) cur.className = 'progress-pill current';
  }

  function showPassage(text) {
    const div = $('passage-text');
    div.textContent = '';
    return Utils.typewriter(div, text, 28);  // returns Promise
  }

  function showQuestionCard(content) {
    const card = $('question-card');
    $('question-text').textContent = content.question;

    const list = $('options-list');
    list.innerHTML = '';
    ['A','B','C','D'].forEach(key => {
      const li  = document.createElement('li');
      li.className = 'option-item';
      li.id = `opt-${key}`;
      li.innerHTML = `<span class="opt-key">${key}</span><span>${content.options[key]}</span>`;
      list.appendChild(li);
    });

    card.classList.remove('hidden');
    card.classList.add('fade-in');
  }

  function highlightCorrect(answerKey) {
    const el = $(`opt-${answerKey}`);
    if (el) el.classList.add('correct');
  }

  function shakeWrong(transcript) {
    // Try to detect which option the student picked
    const t = transcript.toUpperCase();
    const keys = ['A','B','C','D'];
    for (const key of keys) {
      if (t.includes(key) || (currentContent.options[key] &&
          t.includes(currentContent.options[key].toUpperCase().split(' ')[0]))) {
        const el = $(`opt-${key}`);
        if (el) {
          el.classList.add('shake');
          setTimeout(() => el.classList.remove('shake'), 500);
        }
        break;
      }
    }
  }

  function showLoading(show, msg) {
    const overlay = $('loading-overlay');
    if (show) {
      overlay.classList.remove('hidden');
      const p = overlay.querySelector('p');
      if (p && msg) p.textContent = msg;
    } else {
      overlay.classList.add('hidden');
    }
  }

  function resetCards() {
    $('passage-card').classList.add('hidden');
    $('question-card').classList.add('hidden');
    $('passage-text').textContent = '';
    $('question-text').textContent = '';
    $('options-list').innerHTML = '';
  }

  /* ── Score Helper ── */
  function scoreFromAttempts(attempts) {
    if (attempts <= 1) return 3;
    if (attempts === 2) return 2;
    return 1;
  }

  /* ── Main Flow ── */

  async function startSession() {
    const session = loadSession();
    student      = session.student;
    wrongAnswers = session.wrongAnswers;
    currentIndex = 0;
    scores       = [];

    // Start background music
    BackgroundManager.init();
    const music = $('bg-music');
    if (music) {
      music.volume = CONFIG.MUSIC_VOLUME;
      music.play().catch(() => {});  // May be blocked until user gesture
    }

    STT.init();
    buildProgressBar();
    await runQuestion(currentIndex);
  }

  async function runQuestion(index) {
    if (index >= wrongAnswers.length) {
      endSession();
      return;
    }

    updateProgress(index);
    resetCards();
    attemptCount  = 0;
    _silenceIndex = 0;
    _clearSilenceTimer();
    ClaudeAPI.resetHistory();

    const item = wrongAnswers[index];

    // Generate content — demo mode uses pre-baked data, live mode calls Claude API
    showLoading(true, 'Luna is preparing your story…');
    setStatus('thinking', 'Preparing…');

    if (isDemoMode() && typeof SAMPLE_GENERATED_CONTENT !== 'undefined' && SAMPLE_GENERATED_CONTENT[index]) {
      currentContent = SAMPLE_GENERATED_CONTENT[index];
    } else {
      try {
        currentContent = await ClaudeAPI.generateContent(item, student);
      } catch (err) {
        console.error(err);
        showError('API 연결 실패: ' + err.message);
        showLoading(false);
        return;
      }
    }

    showLoading(false);

    BackgroundManager.setBackground(currentContent.bgKeyword);
    setStatus('reading', 'Luna is reading…');

    // Show passage card immediately (text starts empty)
    $('passage-card').classList.remove('hidden');
    $('passage-text').textContent = '';

    // TTS and typewriter start at the same time — run in parallel
    // TTS chain runs independently (fire-and-forget)
    runPassageVoiceFlow();

    // Typewriter fills in the passage text while Luna speaks
    await showPassage(currentContent.passage);
  }

  // Voice flow runs independently of the typewriter so they overlap
  async function runPassageVoiceFlow() {
    await wait(200);
    // 한국어: 지문 소개
    await speakKoAndWait(currentContent.tutorIntro);
    // 영어 여성 성우로 지문 낭독
    await speakEnAndWait(currentContent.passage);
    await wait(400);

    // 영어 여성 성우로 문제 낭독
    showQuestionCard(currentContent);
    await speakEnAndWait(currentContent.question);
    await wait(300);

    // 한국어: 정답 유도
    setStatus('reading', '…');
    await speakKoAndWait('자, 이제 정답이 뭘까? A, B, C, D 중에 하나를 말해줘!');
    await wait(200);

    startListening();
  }

  function _clearSilenceTimer() {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
  }

  function _resetSilenceTimer(onTimeout) {
    _clearSilenceTimer();
    _silenceTimer = setTimeout(async () => {
      STT.stop();
      setStatus('reading', '…');
      const msg = SILENCE_PROMPTS[_silenceIndex % SILENCE_PROMPTS.length];
      _silenceIndex++;
      await speakKoAndWait(msg);
      onTimeout();   // 말 건 뒤 다시 듣기 시작
    }, 3000);
  }

  function listenWithTimer(statusText, onResult) {
    setStatus('listening', statusText);
    const restart = () => listenWithTimer(statusText, onResult);
    _resetSilenceTimer(restart);
    STT._onSpeechDetected = () => _resetSilenceTimer(restart);
    STT.listen(async (transcript) => {
      _clearSilenceTimer();
      STT.stop();
      await onResult(transcript);
    });
  }

  function startListening() {
    listenWithTimer('Your turn! Speak now…', handleStudentAnswer);
  }

  async function handleStudentAnswer(transcript) {
    setStatus('thinking', 'Thinking…');

    let result;
    try {
      result = await ClaudeAPI.evaluateAnswer({
        passage:     currentContent.passage,
        question:    currentContent.question,
        options:     currentContent.options,
        answer:      currentContent.answer,
        concept:     currentContent.concept,
        studentName: student.name,
        grade:       student.grade,
        attemptCount,
      }, transcript);
    } catch (err) {
      console.error(err);
      setStatus('listening');
      startListening();
      return;
    }

    if (result.correct) {
      await handleCorrect(result);
    } else {
      attemptCount++;
      await handleWrong(result, transcript);
    }
  }

  async function handleCorrect(result) {
    highlightCorrect(currentContent.answer);
    Utils.confettiBurst($('confetti-canvas'));

    const starScore = scoreFromAttempts(attemptCount + 1);
    scores[currentIndex] = starScore;

    setStatus('reading', 'Great job! 🌟');
    await speakKoAndWait(result.tutorMessage);

    // Follow-up question
    if (result.followUpQuestion) {
      await wait(400);
      await speakKoAndWait(result.followUpQuestion);
      await wait(200);
      listenWithTimer('Tell me your thoughts…', handleFollowUp);
    } else {
      await wait(800);
      nextQuestion();
    }
  }

  async function handleFollowUp(transcript) {
    setStatus('thinking', 'Thinking…');
    let result;
    try {
      result = await ClaudeAPI.evaluateFollowUp({
        passage: currentContent.passage,
        question: currentContent.question,
        answer:  currentContent.answer,
        options: currentContent.options,
        studentName: student.name,
        grade:   student.grade,
      }, transcript);
    } catch (_) {
      nextQuestion();
      return;
    }

    setStatus('reading', '…');
    await speakKoAndWait(result.tutorMessage);
    await wait(600);
    nextQuestion();
  }

  async function handleWrong(result, transcript) {
    shakeWrong(transcript);
    setStatus('reading', '…');
    await speakKoAndWait(result.tutorMessage);
    await wait(400);
    if (result.hint && result.hint !== result.tutorMessage) {
      await speakKoAndWait(result.hint);
    }
    await wait(300);
    startListening();
  }

  function nextQuestion() {
    currentIndex++;
    runQuestion(currentIndex);
  }

  function endSession() {
    // Mark last pill as done
    const last = $(`pill-${wrongAnswers.length - 1}`);
    if (last) {
      const score = scores[wrongAnswers.length - 1] || 1;
      last.className = 'progress-pill ' + (score === 3 ? 'done-gold' : 'done');
    }

    TTS.stop();
    STT.stop();

    // Save scores and navigate to results
    sessionStorage.setItem('mt_scores', JSON.stringify(scores));
    sessionStorage.setItem('mt_student', JSON.stringify(student));

    setTimeout(() => {
      window.location.href = 'results.html';
    }, 600);
  }

  /* ── Helpers ── */

  function speakEnAndWait(text) {
    return new Promise(resolve => TTS.speak(text, { onEnd: resolve }));
  }

  function speakKoAndWait(text) {
    return new Promise(resolve => TTS.speakKo(text, { onEnd: resolve }));
  }

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function showError(msg) {
    const overlay = $('loading-overlay');
    const p = overlay && overlay.querySelector('p');
    if (p) p.textContent = msg;
    const spinner = overlay && overlay.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', () => {
    const gate   = $('start-gate');
    const btn    = $('start-btn');
    if (!gate || !btn) { startAfterGesture(); return; }

    btn.addEventListener('click', () => {
      gate.classList.add('hidden');
      // Remove from DOM after fade so it doesn't block interaction
      setTimeout(() => gate.remove(), 700);
      startAfterGesture();
    });
  });

  function startAfterGesture() {
    showLoading(true, "Luna is preparing your story…");

    // voiceschanged may fire before or after DOMContentLoaded — use timeout fallback
    let started = false;
    function doStart() {
      if (started) return;
      started = true;
      startSession();
    }

    if (window.speechSynthesis) {
      if (speechSynthesis.getVoices().length > 0) {
        doStart();
      } else {
        speechSynthesis.addEventListener('voiceschanged', doStart, { once: true });
        setTimeout(doStart, 1200);
      }
    } else {
      doStart();
    }
  }

  return { STATE };

})();
