/**
 * tutor-engine.js — Session orchestration using Gemini Live for voice
 * GeminiLive handles TTS + STT + evaluation all in one real-time session.
 */

const TutorEngine = (() => {

  const $ = id => document.getElementById(id);

  let student, wrongAnswers, currentIndex;
  let currentContent   = null;
  let scores           = [];
  let _questionShown   = false;

  /* ── Gemini tool: signals end of a question ── */
  const ADVANCE_TOOL = {
    name: 'advance_question',
    description: 'Call this when the student has finished the current question — either answered correctly (after the follow-up exchange) or after exhaustive Socratic scaffolding.',
    parameters: {
      type: 'OBJECT',
      properties: {
        score: {
          type: 'INTEGER',
          description: '3 = correct on 1st attempt, 2 = correct on 2nd attempt, 1 = correct with hints or guided through',
        },
      },
      required: ['score'],
    },
  };

  /* ── Build per-question system prompt ── */
  function buildSystemPrompt(stu, content) {
    return `You are Luna, a warm and encouraging English tutor for Grade ${stu.grade} Korean students at POLY English academy in Korea.
Student name: ${stu.name}

PERSONALITY: Playful, patient, genuinely curious. You NEVER say "틀렸어", "아니야", "wrong", "incorrect", or any negative judgment.

LANGUAGE RULES:
- Use KOREAN for all conversation, encouragement, hints, praise, and questions to the student.
- Use ENGLISH (clear, natural pronunciation) ONLY for reading the passage and the multiple-choice question aloud.

YOUR SCRIPT — follow this order exactly, starting the moment you receive "START":
1. Say in Korean: "${content.tutorIntro}"
2. Read the passage in English (naturally, not robotically):
   "${content.passage}"
3. Say in Korean: "자, 이제 문제야!"
4. Read the question in English: "${content.question}"
5. Read the options in English: "A. ${content.options.A}  B. ${content.options.B}  C. ${content.options.C}  D. ${content.options.D}"
6. Ask in Korean: "A, B, C, D 중에 어떤 게 정답일거 같아? 편하게 말해봐!"
7. Wait for the student's spoken answer.

EVALUATION:
- Correct answer: ${content.answer} — "${content.options[content.answer]}"
- Accept the letter (A/B/C/D), the full text, paraphrases, or close matches.
- If CORRECT:
  - Praise specifically in Korean (mention what they understood well).
  - Ask a follow-up in Korean like "왜 그렇게 생각했어? 말해줄 수 있어?"
  - Listen to their explanation and respond warmly in Korean (1-2 sentences).
  - Call advance_question with score=3 if correct on 1st attempt, 2 if 2nd, 1 if 3rd+.
- If WRONG:
  - Use Socratic method — ask a guiding question based on the passage. NEVER reveal the answer.
  - After 3+ wrong attempts: guide together gently ("같이 생각해봐! 지문에서 이렇게 나왔는데…").
  - After fully exhausting attempts: call advance_question(score=1).

Concept being tested: ${content.concept}

Start IMMEDIATELY when you receive "START". Do not wait for further instruction.`;
  }

  /* ── UI helpers ── */

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
    for (let i = 0; i < index; i++) {
      const pill = $(`pill-${i}`);
      if (pill) {
        pill.className = 'progress-pill ' + (scores[i] === 3 ? 'done-gold' : 'done');
      }
    }
    const cur = $(`pill-${index}`);
    if (cur) cur.className = 'progress-pill current';
  }

  function showPassage(text) {
    const div = $('passage-text');
    div.textContent = '';
    return Utils.typewriter(div, text, 28);
  }

  function showQuestionCard(content) {
    if (_questionShown) return;
    _questionShown = true;

    $('question-text').textContent = content.question;
    const list = $('options-list');
    list.innerHTML = '';
    ['A','B','C','D'].forEach(key => {
      const li = document.createElement('li');
      li.className = 'option-item';
      li.id = `opt-${key}`;
      li.innerHTML = `<span class="opt-key">${key}</span><span>${content.options[key]}</span>`;
      list.appendChild(li);
    });
    const card = $('question-card');
    card.classList.remove('hidden');
    card.classList.add('fade-in');
  }

  function highlightCorrect(answerKey) {
    const el = $(`opt-${answerKey}`);
    if (el) el.classList.add('correct');
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

  /* ── Main flow ── */

  async function startSession() {
    const session  = loadSession();
    student        = session.student;
    wrongAnswers   = session.wrongAnswers;
    currentIndex   = 0;
    scores         = [];

    BackgroundManager.init();
    const music = $('bg-music');
    if (music) { music.volume = CONFIG.MUSIC_VOLUME; music.play().catch(() => {}); }

    buildProgressBar();
    await runQuestion(0);
  }

  async function runQuestion(index) {
    if (index >= wrongAnswers.length) { endSession(); return; }

    GeminiLive.disconnect();   // clean up previous session

    updateProgress(index);
    resetCards();
    _questionShown = false;

    // Generate content
    showLoading(true, 'Luna is preparing your story…');
    const item = wrongAnswers[index];

    if (isDemoMode() && typeof SAMPLE_GENERATED_CONTENT !== 'undefined' && SAMPLE_GENERATED_CONTENT[index]) {
      currentContent = SAMPLE_GENERATED_CONTENT[index];
    } else {
      try {
        currentContent = await ClaudeAPI.generateContent(item, student);
      } catch (err) {
        console.error('[Claude] Content generation failed:', err.message);
        showLoading(false);
        return;
      }
    }

    showLoading(false);
    BackgroundManager.setBackground(currentContent.bgKeyword);

    // Show passage card + typewriter
    $('passage-card').classList.remove('hidden');
    const typewriterDone = showPassage(currentContent.passage);

    // Show question card when typewriter finishes
    typewriterDone.then(() => showQuestionCard(currentContent));

    if (!CONFIG.GEMINI_API_KEY) {
      console.error('[Gemini] No API key — set GEMINI_API_KEY or pass ?gkey=');
      return;
    }

    // Connect Gemini Live (runs concurrently with typewriter)
    try {
      await GeminiLive.connect({
        apiKey: CONFIG.GEMINI_API_KEY,
        systemPrompt: buildSystemPrompt(student, currentContent),
        tools: [ADVANCE_TOOL],
        onToolCall: (name, args) => {
          if (name === 'advance_question') {
            const score = Math.min(3, Math.max(1, parseInt(args.score) || 1));
            scores[currentIndex] = score;
            showQuestionCard(currentContent);     // ensure card & elements exist
            highlightCorrect(currentContent.answer);
            if (score >= 3) Utils.confettiBurst($('confetti-canvas'));
            setTimeout(() => nextQuestion(), 2500);
          }
        },
      });

      await GeminiLive.startMic();
      GeminiLive.sendText('START');

    } catch (err) {
      console.error('[Gemini] Connection failed:', err.message);
    }
  }

  function nextQuestion() {
    currentIndex++;
    runQuestion(currentIndex);
  }

  function endSession() {
    const last = $(`pill-${wrongAnswers.length - 1}`);
    if (last) {
      last.className = 'progress-pill ' + ((scores[wrongAnswers.length - 1] === 3) ? 'done-gold' : 'done');
    }
    GeminiLive.disconnect();
    sessionStorage.setItem('mt_scores', JSON.stringify(scores));
    sessionStorage.setItem('mt_student', JSON.stringify(student));
    setTimeout(() => { window.location.href = 'results.html'; }, 600);
  }

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', () => {
    const gate = $('start-gate');
    const btn  = $('start-btn');
    if (!gate || !btn) { showLoading(true, 'Luna is preparing your story…'); startSession(); return; }

    btn.addEventListener('click', () => {
      gate.classList.add('hidden');
      setTimeout(() => gate.remove(), 700);
      showLoading(true, 'Luna is preparing your story…');
      GeminiLive.warmUpAudio();   // pre-warm AudioContext during user gesture
      startSession();
    });
  });

  return {};
})();
