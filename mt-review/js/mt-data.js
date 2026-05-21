/**
 * mt-data.js — Student data, wrong-answer structures, and session config
 */

const CONFIG = {
  ANTHROPIC_API_KEY: '',
  ELEVENLABS_API_KEY: '',
  ELEVENLABS_VOICE_ID: '21m00Tcm4TlvDq8ikWAM', // Rachel — 따뜻하고 친근한 여성
  MODEL_CONTENT: 'claude-sonnet-4-5',
  MODEL_EVAL:    'claude-haiku-4-5-20251001',
  MAX_ATTEMPTS_BEFORE_SCAFFOLD: 3,
  MUSIC_VOLUME: 0.12,
};

/* ── Load API keys from URL or localStorage ── */
(function loadKeys() {
  const params = new URLSearchParams(window.location.search);

  const urlKey = params.get('key');
  if (urlKey) { CONFIG.ANTHROPIC_API_KEY = urlKey; localStorage.setItem('mt_api_key', urlKey); }
  else { const s = localStorage.getItem('mt_api_key'); if (s) CONFIG.ANTHROPIC_API_KEY = s; }

  const elKey = params.get('elkey');
  if (elKey) { CONFIG.ELEVENLABS_API_KEY = elKey; localStorage.setItem('mt_el_key', elKey); }
  else { const s = localStorage.getItem('mt_el_key'); if (s) CONFIG.ELEVENLABS_API_KEY = s; }
})();

/* ─────────────────────────────────────────────
   Type Definitions (JSDoc)
   ───────────────────────────────────────────── */

/**
 * @typedef {Object} StudentProfile
 * @property {string} id
 * @property {string} name
 * @property {number} grade  — 1 | 2 | 3
 * @property {string} classCode
 * @property {string} mtDate
 */

/**
 * @typedef {Object} WrongAnswerItem
 * @property {string} id
 * @property {string} topic
 * @property {string} originalPassage
 * @property {string} originalQuestion
 * @property {string} correctAnswer
 * @property {string} studentAnswer
 * @property {string} concept  — "main idea" | "vocabulary" | "inference" | "detail"
 * @property {number} questionNumber
 */

/**
 * @typedef {Object} GeneratedContent
 * @property {string} passage
 * @property {string} question
 * @property {{A:string,B:string,C:string,D:string}} options
 * @property {string} answer   — "A" | "B" | "C" | "D"
 * @property {string} concept
 * @property {string} bgKeyword  — "forest"|"ocean"|"city"|"farm"|"school"|"space"
 * @property {string} tutorIntro
 */

/**
 * @typedef {Object} EvalResult
 * @property {boolean} correct
 * @property {string}  tutorMessage
 * @property {string}  [hint]
 * @property {string}  [followUpQuestion]
 */

/* ─────────────────────────────────────────────
   Sample Data (for demo / ?demo=true)
   ───────────────────────────────────────────── */

/** @type {StudentProfile} */
const SAMPLE_STUDENT = {
  id: 'student-demo',
  name: 'Jisu',
  grade: 2,
  classCode: 'P2-A',
  mtDate: '2026-05-15',
};

/** @type {WrongAnswerItem[]} */
const SAMPLE_WRONG_ANSWERS = [
  {
    id: 'wa-001',
    topic: 'forest animals',
    originalPassage: 'A little rabbit lived in a cozy burrow under a big oak tree. One rainy day, she stayed inside and looked out at the wet leaves.',
    originalQuestion: 'Why did the rabbit stay in her burrow?',
    correctAnswer: 'Because it was raining outside',
    studentAnswer: 'Because she was sleeping',
    concept: 'detail',
    questionNumber: 3,
  },
  {
    id: 'wa-002',
    topic: 'seasons',
    originalPassage: 'In autumn, the leaves turn red and yellow. The air becomes cool, and apples are ready to pick.',
    originalQuestion: 'What is the main idea of this passage?',
    correctAnswer: 'Autumn brings many colorful changes',
    studentAnswer: 'Leaves fall from trees',
    concept: 'main idea',
    questionNumber: 7,
  },
  {
    id: 'wa-003',
    topic: 'ocean',
    originalPassage: 'The deep ocean is very dark and cold. Strange fish with glowing lights live there. They use the lights to find food and each other.',
    originalQuestion: 'Why do the deep-sea fish have glowing lights?',
    correctAnswer: 'To find food and each other',
    studentAnswer: 'Because it is pretty',
    concept: 'inference',
    questionNumber: 12,
  },
];

/* ─────────────────────────────────────────────
   Pre-generated Demo Content (no API key needed)
   ───────────────────────────────────────────── */

/** @type {GeneratedContent[]} */
const SAMPLE_GENERATED_CONTENT = [
  {
    passage: "One rainy afternoon, a little rabbit named Pip sat in her warm burrow. Outside, the rain fell hard on the leaves. Pip looked out and saw the wet, muddy ground. She decided to stay inside and read her favorite book.",
    question: "Why did Pip stay in her burrow?",
    options: {
      A: "Because she was tired and sleepy",
      B: "Because it was raining outside",
      C: "Because she wanted to eat",
      D: "Because she was scared of the dark",
    },
    answer: "B",
    concept: "detail",
    bgKeyword: "forest",
    tutorIntro: "지수야, 같이 스토리 빠르게 읽어보자!",
  },
  {
    passage: "When autumn comes, the world changes beautifully. Trees turn gold, red, and orange. The cool wind blows fallen leaves across the path. Animals gather food and prepare for winter.",
    question: "What is the main idea of this passage?",
    options: {
      A: "Animals eat a lot of food in winter",
      B: "The wind blows hard in October",
      C: "Autumn brings many beautiful changes to nature",
      D: "Leaves fall from trees every day",
    },
    answer: "C",
    concept: "main idea",
    bgKeyword: "forest",
    tutorIntro: "지수야, 이번 스토리도 빠르게 읽어보자!",
  },
  {
    passage: "Deep in the dark ocean, where sunlight never reaches, strange fish glow with soft blue and green lights. A little anglerfish uses her glowing light like a lantern. She waves it gently to attract tiny fish and shrimp. When they swim close, she catches them for dinner.",
    question: "Why does the anglerfish use her glowing light?",
    options: {
      A: "To make the ocean look pretty",
      B: "To scare away big sharks",
      C: "To help her see in the dark",
      D: "To attract food and catch it",
    },
    answer: "D",
    concept: "inference",
    bgKeyword: "ocean",
    tutorIntro: "지수야, 마지막 스토리 빠르게 읽어보자!",
  },
];

/* ─────────────────────────────────────────────
   Session Loader
   ───────────────────────────────────────────── */

/**
 * Returns { student, wrongAnswers } from sessionStorage or demo data.
 * @returns {{ student: StudentProfile, wrongAnswers: WrongAnswerItem[] }}
 */
function loadSession() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === 'true') {
    return { student: SAMPLE_STUDENT, wrongAnswers: SAMPLE_WRONG_ANSWERS };
  }
  try {
    const raw = sessionStorage.getItem('mt_session');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  // Fallback to demo
  return { student: SAMPLE_STUDENT, wrongAnswers: SAMPLE_WRONG_ANSWERS };
}

/**
 * Returns true when running in demo mode (no API key needed).
 */
function isDemoMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('demo') === 'true';
}
