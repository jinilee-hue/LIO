/**
 * claude-api.js — Anthropic API wrapper
 * Two functions:
 *   generateContent(wrongAnswerItem, student) → GeneratedContent
 *   evaluateAnswer(ctx, studentAnswer)        → EvalResult
 */

const ClaudeAPI = (() => {

  const API_URL = 'https://api.anthropic.com/v1/messages';

  /** Per-question conversation history for Socratic loop */
  let _history = [];

  function resetHistory() {
    _history = [];
  }

  /**
   * Core fetch wrapper
   * @param {string} model
   * @param {string} systemPrompt
   * @param {Array}  messages
   * @param {number} maxTokens
   * @returns {Promise<string>}
   */
  async function callAPI(model, systemPrompt, messages, maxTokens = 600) {
    if (!CONFIG.ANTHROPIC_API_KEY) {
      throw new Error('API key not set. Add ?key=sk-ant-... to the URL.');
    }

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.content[0].text;
  }

  /**
   * Parse JSON from Claude response (with one retry on failure)
   */
  function parseJSON(text) {
    // Strip any markdown code fences
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      // Try to extract first {...} block
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Failed to parse JSON from Claude response:\n' + text);
    }
  }

  /* ──────────────────────────────────────────────
     1. Generate Passage + Question + Options
     ────────────────────────────────────────────── */

  /**
   * @param {WrongAnswerItem} item
   * @param {StudentProfile}  student
   * @returns {Promise<GeneratedContent>}
   */
  async function generateContent(item, student) {
    const system = `You are a creative English teacher at POLY English academy in Korea.
Your task is to create an engaging, age-appropriate reading passage and question for a Grade ${student.grade} student named ${student.name}.

The student got this question WRONG on their midterm test:
- Topic: ${item.topic}
- Original question: ${item.originalQuestion}
- Student's wrong answer: ${item.studentAnswer}
- Correct answer: ${item.correctAnswer}
- Concept being tested: ${item.concept}

Create a NEW short story (3-5 sentences) that:
- Features an animal or young child as the main character
- Has a clear emotional moment or situation kids care about
- Uses simple vocabulary appropriate for Grade ${student.grade}
- Naturally leads to a question testing the SAME concept (${item.concept})

Then create ONE multiple-choice question (A/B/C/D) testing that concept.

IMPORTANT: Respond ONLY with valid JSON, no other text. Use this exact format:
{
  "passage": "...",
  "question": "...",
  "options": {
    "A": "...",
    "B": "...",
    "C": "...",
    "D": "..."
  },
  "answer": "A",
  "concept": "${item.concept}",
  "bgKeyword": "forest",
  "tutorIntro": "${student.name}야, 같이 스토리 빠르게 읽어보자!"
}

Rules for tutorIntro: Write in KOREAN. Always use the pattern "[이름]야/아, 같이 스토리 빠르게 읽어보자!" — keep this phrase consistent every time. Use the student name with "야" (e.g. "지수야") or "아" depending on the final consonant.
For bgKeyword choose ONE of: forest, ocean, city, farm, school, space — pick whichever best fits the passage setting.`;

    const messages = [{ role: 'user', content: 'Generate the passage and question now.' }];
    const raw = await callAPI(CONFIG.MODEL_CONTENT, system, messages, 700);
    return parseJSON(raw);
  }

  /* ──────────────────────────────────────────────
     2. Evaluate Answer + Socratic Response
     ────────────────────────────────────────────── */

  /**
   * @param {{ passage:string, question:string, options:Object, answer:string,
   *            concept:string, studentName:string, grade:number, attemptCount:number }} ctx
   * @param {string} studentAnswer  — raw STT transcript
   * @returns {Promise<EvalResult>}
   */
  async function evaluateAnswer(ctx, studentAnswer) {
    const isScaffold = ctx.attemptCount >= CONFIG.MAX_ATTEMPTS_BEFORE_SCAFFOLD;

    const system = `You are Luna, a warm and encouraging English tutor for Grade ${ctx.grade} Korean students.
Your personality: playful, patient, never condescending, genuinely curious, loves when students think hard.
Your method: pure Socratic — you NEVER say "틀렸어", "아니야", "wrong", "incorrect", or any negative judgment.

IMPORTANT: ALL output text (tutorMessage, hint, followUpQuestion) must be written in KOREAN (한국어).
Write naturally and warmly like a friendly Korean teacher speaking to a young student.

Current question context:
- Passage: "${ctx.passage}"
- Question: "${ctx.question}"
- Options: A) ${ctx.options.A}  B) ${ctx.options.B}  C) ${ctx.options.C}  D) ${ctx.options.D}
- Correct answer: ${ctx.answer} (${ctx.options[ctx.answer]})
- Concept being tested: ${ctx.concept}
- Student name: ${ctx.studentName}
- Student's answer (spoken): "${studentAnswer}"
- Attempt number: ${ctx.attemptCount + 1}
${isScaffold ? '- NOTE: This is attempt 3+. Gently guide the student to the answer together. Make it feel collaborative, not like giving up.' : ''}

Determine if the student's spoken answer matches option ${ctx.answer} or its text "${ctx.options[ctx.answer]}".
Be flexible: accept "A", "option A", the text content, paraphrases, or partial correct answers.

Respond ONLY with valid JSON, no other text:
{
  "correct": true or false,
  "tutorMessage": "...",
  "hint": "...",
  "followUpQuestion": "..."
}

Rules (all text in KOREAN):
- "tutorMessage": Luna가 실제로 말하는 내용. Grade 1-2는 최대 2문장, Grade 3은 최대 3문장.
- 정답일 때: 구체적으로 칭찬! 학생이 무엇을 잘 이해했는지 언급. 예: "${ctx.studentName}야, 정말 잘했어! 토끼가 비 때문에 집에 있었다는 걸 찾았구나~" 그 다음 followUpQuestion.
- 오답이고 attemptCount < 3: 지문 근거로 유도하는 질문 1개. 절대 정답 알려주지 말 것. 예: "음, 이야기에서 토끼가 집에 있을 때 밖에 어떤 날씨였는지 기억해?"
- 오답이고 attemptCount >= 3: 함께 푸는 방식으로. 예: "같이 생각해봐! 이야기에서 이렇게 나왔잖아... 그럼 어떤 것 같아?"
- "hint": 오답일 때만. 유도 질문 1개 (tutorMessage와 다른 내용, 내부 추적용).
- "followUpQuestion": 정답일 때만. 왜/어떻게 생각했는지 묻는 질문. 예: "왜 그 답을 골랐는지 말해줄 수 있어?"
- tutorMessage에 정답 글자(A/B/C/D)나 정답 내용을 직접 포함하지 말 것 (스캐폴딩 제외).`;

    // Add student's answer to conversation history
    _history.push({ role: 'user', content: studentAnswer });

    const raw = await callAPI(CONFIG.MODEL_EVAL, system, _history, 400);
    const result = parseJSON(raw);

    // Add Luna's response to history for continued Socratic loop
    _history.push({ role: 'assistant', content: result.tutorMessage });

    return result;
  }

  /**
   * After a correct answer, evaluate the student's follow-up "why" explanation.
   * @param {{ passage:string, question:string, answer:string, options:Object,
   *            studentName:string, grade:number }} ctx
   * @param {string} studentExplanation
   * @returns {Promise<{understood:boolean, tutorMessage:string}>}
   */
  async function evaluateFollowUp(ctx, studentExplanation) {
    const system = `You are Luna, a warm English tutor. The student just answered a question correctly and you asked them WHY.
Evaluate if their explanation shows genuine understanding of the concept.

IMPORTANT: tutorMessage must be written in KOREAN (한국어). Write warmly like a friendly Korean teacher.

Passage: "${ctx.passage}"
Correct answer was: ${ctx.answer} — "${ctx.options[ctx.answer]}"
Student's explanation: "${studentExplanation}"

Respond ONLY with valid JSON:
{
  "understood": true or false,
  "tutorMessage": "..."
}

이해했을 때: 따뜻하고 구체적인 칭찬 + 다음 문제 넘어간다고 말하기.
이해가 부족할 때: 핵심 개념을 1-2문장으로 부드럽게 설명 + 다음으로 넘어간다고 말하기.
tutorMessage는 3문장 이내로.`;

    const messages = [..._history, { role: 'user', content: studentExplanation }];
    const raw = await callAPI(CONFIG.MODEL_EVAL, system, messages, 250);
    return parseJSON(raw);
  }

  return { generateContent, evaluateAnswer, evaluateFollowUp, resetHistory };

})();
