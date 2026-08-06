const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

// 채점 프롬프트에 넣기 전 답변 정리 — 마크다운/특수문자가 프롬프트·JSON을 흔드는 것 방지
const sanitizeForPrompt = (raw) => {
  return String(raw)
    .replace(/\*\*/g, "")      // 볼드 마크(**) 제거
    .replace(/[""]/g, '"')     // 스마트 따옴표 → 일반
    .replace(/['']/g, "'")     // 스마트 홑따옴표 → 일반
    .replace(/["`]/g, "")      // 프롬프트/JSON 흔드는 따옴표·백틱 제거
    .replace(/\s+/g, " ")       // 연속 공백/줄바꿈 정리
    .trim();
};

// 짧은 대기 (재시도 사이 Groq에 숨 돌릴 시간)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 명백히 답변이 아닌 입력(placeholder, 테스트 문구 등) 판별
const JUNK_PATTERNS = [
  "녹음 중", "녹음중", "녹음 중입니다",
  "테스트", "test", "테스트입니다",
  "아무말", "몰라요", "모르겠어요", "모르겠습니다",
  "없음", "없어요", "패스", "스킵", "skip",
];
const isJunkAnswer = (raw) => {
  const s = raw.trim().toLowerCase().replace(/[.。,!?~\s]/g, "");
  if (s.length < 4) return true; // 4자 미만은 사실상 답변 아님
  // 아래 단어가 "포함"만 돼도 junk (실전 면접 답변엔 나오지 않는 단어/UI 안내 문구)
  const CONTAINS_JUNK = [
    "녹음", "다시누르", "테스트중", "마이크테스트",
    "음성인식", "인식된답변", "직접수정", "직접입력",
    "카메라사용안", "카메라사용", "누적돼요", "여기에",
  ];
  if (CONTAINS_JUNK.some((p) => s.includes(p.replace(/\s/g, "")))) return true;
  return JUNK_PATTERNS.some((p) => {
    const pp = p.toLowerCase().replace(/\s/g, "");
    return s === pp || (s.length <= pp.length + 2 && s.includes(pp));
  });
};

const safeParse = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
};

// IT 직군과 무관한 NCS 제외 (농업/축산/수산 등)
const EXCLUDE = "unitName NOT LIKE '%생육%' AND unitName NOT LIKE '%병충해%' AND unitName NOT LIKE '%재배%' AND unitName NOT LIKE '%작물%' AND unitName NOT LIKE '%농업%' AND unitName NOT LIKE '%축산%' AND unitName NOT LIKE '%양식%' AND unitName NOT LIKE '%어업%' AND unitName NOT LIKE '%임업%' AND unitName NOT LIKE '%원예%'";

const TYPE_GUIDE = {
  "경험행동형": "지원자의 과거 경험과 행동을 묻는 질문 (예: ~한 경험을 말해보세요)",
  "직무기술형": "직무 지식과 기술 역량을 확인하는 질문",
  "상황판단형": "구체적인 문제 상황이나 딜레마를 시나리오로 먼저 제시한 뒤, '이런 상황이라면 어떻게 판단하고 대응하겠는가'를 묻는 질문.",
};


const JOB_KEYWORDS = {
  // 데이터 계열
  "데이터분석": ["데이터", "빅데이터"],
  "데이터 시스템": ["데이터", "빅데이터"],
  "데이터 엔지니어": ["데이터", "빅데이터"],
  "데이터": ["데이터", "빅데이터"],
  // AI 계열
  "머신러닝": ["인공지능", "머신러닝"],
  "AI 엔지니어": ["인공지능"],
  "AI 서비스": ["인공지능"],
  "AI": ["인공지능"],
  "인공지능": ["인공지능"],
  // 게임
  "게임": ["게임"],
  // 보안
  "보안": ["보안", "정보보호"],
  // 네트워크
  "네트워크": ["네트워크"],
  // 시스템 계열 (구체적인 것 먼저)
  "컴퓨터시스템설계": ["소프트웨어", "아키텍처"],
  "시스템 소프트웨어": ["소프트웨어"],
  "정보 시스템 운영": ["소프트웨어", "운영", "네트워크"],
  "소프트웨어": ["소프트웨어"],
  "시스템": ["소프트웨어", "시스템"],
};

const EVAL_GUIDE = {
  "경험행동형": `Evaluate with the STAR method. Check if the answer clearly shows the Situation, the Task/goal, the specific Actions the candidate took, and the measurable Result. Penalize vague answers with no concrete action or outcome.`,
  "직무기술형": `Evaluate technical accuracy and depth. Check if the answer is factually correct, shows real understanding (not just buzzwords), and gives concrete examples or trade-offs. Penalize shallow or wrong answers.`,
  "상황판단형": `Evaluate judgment and reasoning. Check if the answer analyzes the situation, weighs options, justifies the decision, and considers consequences/stakeholders.`,
};

// 질문 생성
const generateQuestions = async ({ jobId, jobName, questionType, userId, interviewStyle, count, mode, sessionType }) => {
  if (!jobName) {
    const [jobs] = await pool.query("SELECT jobName FROM jobs WHERE id = ?", [jobId]);
    if (jobs.length === 0) throw new Error("JOB_NOT_FOUND");
    jobName = jobs[0].jobName;
  }

  let words = null;
  for (const key in JOB_KEYWORDS) {
    if (jobName.includes(key)) { words = JOB_KEYWORDS[key]; break; }
  }

  let skills = [];
  if (words) {
    const conds = words.map(() => "unitName LIKE ?").join(" OR ");
    const vals = words.map((w) => `%${w}%`);
    [skills] = await pool.query(
      `SELECT unitName, knowledge FROM ncs_skills WHERE (${conds}) AND ${EXCLUDE} ORDER BY RAND() LIMIT 6`,
      vals
    );
  }
  if (skills.length === 0) {
    [skills] = await pool.query(
      `SELECT unitName, knowledge FROM ncs_skills WHERE ${EXCLUDE} ORDER BY RAND() LIMIT 6`
    );
  }

  const skillText = skills.map((s) => `- ${s.unitName}: ${s.knowledge}`).join("\n");
  const guide = TYPE_GUIDE[questionType] || TYPE_GUIDE["직무기술형"];

  const isChallenge = (sessionType === "challenge" || mode === "도전" || count === 1);
  const numQuestions = isChallenge ? 1 : 5;
  const sessionMode =
    isChallenge ? "도전"
    : (mode === "스피킹") ? "스피킹"
    : "텍스트";

  const styleInstruction = interviewStyle === "압박"
    ? `

PRESSURE MODE (this overrides the neutral tone above):
Every question must challenge the candidate, not just ask for information.
Each question MUST do one of these:
- Question their judgment: "그 판단이 옳았다고 보시나요?"
- Assume failure: "그 방법이 실패했다면 어떻게 하시겠어요?"
- Demand justification: "왜 하필 그 방식을 선택하셨나요?"
- Present opposition: "팀에서 반대했다면 어떻게 설득하시겠어요?"
- Point out a weakness: "그 접근의 한계는 무엇이라고 보시나요?"
Never write a neutral "~는 무엇인가요?" question in this mode.
Keep 존댓말. Never 반말 or fragments.`
    : "";

  const prompt = `You are an experienced Korean job interviewer conducting a real interview for the role of "${jobName}".
Generate exactly ${numQuestions} interview questions.
Question type: ${guide}

Background knowledge (use as inspiration only, NEVER quote directly):
${skillText}

CRITICAL WRITING RULES — follow these strictly, they override everything above:
1. Write like a real interviewer speaking face-to-face. NOT like a written exam or certification test.
2. NEVER put standard names or acronyms in the question: ISO/IEC, ITIL, SLM, ISMS-P, BSC, SPI, CRUD, ETL, BPMN. These make it sound like a textbook.
3. NEVER copy phrases from the background knowledge above. Absorb the idea, then ask in your own natural words.
4. NEVER end with stiff written-exam endings like "설명해 주십시오" / "기술해 주십시오" / "제시해 주십시오" / "무엇인지요?" / "무엇입니까?" / "어떠한가?". End conversationally like a real person speaking: "~있나요?", "~궁금합니다", "~말씀해 주세요", "~어떻게 하시겠어요?", "~어떻게 보시나요?".
5. ONE topic per question. Never use "~하고, ~하는지" to stack two topics.
6. Under 60 Korean characters. Complete polite sentences (존댓말), never 반말.
7. Every question must clearly relate to the role "${jobName}". Do NOT ask about unrelated fields (agriculture, farming, etc).

Target style:
- "데이터 품질 때문에 곤란했던 경험이 있나요?"
- "대용량 로그를 수집한다면 어디서부터 시작하시겠어요?"
- "분석 결과를 비전문가에게 설명해야 했던 적이 있는지 궁금합니다."
${styleInstruction}

Output:
- Korean Hangul only. No Chinese characters.
- Return ONLY a JSON array of ${numQuestions} strings, nothing else.`;

  let questions = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) text = match[0];
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some(hasCJK)) {
        questions = parsed;
        break;
      }
      console.log(`질문 생성 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`질문 생성 재시도 ${i + 1}회 (JSON 파싱 실패)`);
    }
  }

  if (!questions) throw new Error("QUESTION_GENERATION_FAILED");

  const [sessionResult] = await pool.query(
    "INSERT INTO interview_sessions (userId, jobId, jobName, questionType, mode) VALUES (?, ?, ?, ?, ?)",
    [userId ?? null, jobId ?? null, jobName, questionType, sessionMode]
  );
  const sessionId = sessionResult.insertId;

  const savedQuestions = [];
  for (let i = 0; i < questions.length; i++) {
    const [q] = await pool.query(
      "INSERT INTO questions (sessionId, orderNo, content) VALUES (?, ?, ?)",
      [sessionId, i + 1, questions[i]]
    );
    savedQuestions.push({ id: q.insertId, orderNo: i + 1, content: questions[i] });
  }

  return { sessionId, jobName, questionType, questions: savedQuestions };
};

// 답변 평가
const evaluateAnswer = async ({ questionId, question, answer, questionType, sessionId, smileCount, eyeContactRatio, extraTimeUsed }) => {
  if (!answer || answer.trim().length === 0) {
    const emptyFeedback = {
      score: 0, strengths: [],
      improvements: ["답변을 입력하지 않았습니다.", "시간 내에 답변을 작성하는 연습이 필요합니다."],
      suggestion: "이 질문에 답변하지 않았습니다. 짧더라도 자신의 생각을 정리해 답변해 보세요.",
      modelAnswer: "답변이 없어 모범답안을 제공하지 않습니다.",
    };
    const [r] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, ""]);
    const emptyAnswerId = r.insertId;
    await pool.query(
      "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
      [emptyAnswerId, 0, JSON.stringify([]), JSON.stringify(emptyFeedback.improvements), emptyFeedback.suggestion, emptyFeedback.modelAnswer]
    );
    if (sessionId && (smileCount != null || eyeContactRatio != null)) {
      await pool.query("UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?", [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]);
    }
    return { answerId: emptyAnswerId, questionType, penalty: 0, ...emptyFeedback };
  }

  // 명백한 junk/placeholder → Groq 호출 없이 0점
  if (isJunkAnswer(answer)) {
    const junkFeedback = {
      score: 0, strengths: [],
      improvements: ["질문에 대한 실질적인 답변이 아닙니다.", "질문의 요지에 맞춰 구체적으로 답변해 주세요."],
      suggestion: "이 답변은 질문과 관련된 내용을 담고 있지 않습니다. 자신의 경험이나 지식을 바탕으로 구체적으로 답변해 보세요.",
      modelAnswer: "실질적인 답변이 아니어서 모범답안을 제공하지 않습니다.",
    };
    const [r] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, answer]);
    const junkAnswerId = r.insertId;
    await pool.query(
      "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
      [junkAnswerId, 0, JSON.stringify([]), JSON.stringify(junkFeedback.improvements), junkFeedback.suggestion, junkFeedback.modelAnswer]
    );
    if (sessionId && (smileCount != null || eyeContactRatio != null)) {
      await pool.query("UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?", [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]);
    }
    return { answerId: junkAnswerId, questionType, penalty: 0, ...junkFeedback };
  }

  const guide = EVAL_GUIDE[questionType] || EVAL_GUIDE["직무기술형"];
  const cleanAnswer = sanitizeForPrompt(answer);
  const prompt = `You are a strict Korean interview coach evaluating a candidate's answer.

Question (${questionType}): ${question}
Candidate's answer: ${cleanAnswer}

Evaluation criteria for this question type:
${guide}

Return ONLY a JSON object in exactly this shape, all text in Korean:
{
  "score": <integer 0-20>,
  "strengths": ["<잘한 점>", "..."],
  "improvements": ["<개선할 점>", "..."],
  "suggestion": "<답변을 어떻게 보완하면 좋을지 2~3문장>",
  "modelAnswer": "<지원자가 실제 면접에서 말하듯 1인칭 존댓말 경험담으로. STAR 흐름을 자연스럽게 녹이되 당위(~해야 합니다) 아닌 경험(~했습니다)으로. 영어 단어 금지. 3~4문장.>"
}

Scoring rules (VERY IMPORTANT - MAX SCORE IS 20 POINTS):

STEP 1 — VALIDITY GATE (do this FIRST, before scoring):
Before scoring, judge whether this is a genuine attempt to answer THIS specific question.
The gate is STRICT. When in doubt, the answer is INVALID (score 0). It is better to give 0 to a weak answer than to give points to a non-answer.
An answer is INVALID (score exactly 0, strengths = []) if ANY of these is true:
- It is shorter than a real sentence a candidate would actually say in an interview.
- It restates the topic without any actual content (e.g. "잘 계획한다", "카메라 사용하는", "열심히 하겠습니다").
- It is a fragment, note-to-self, UI text, or clearly not spoken to an interviewer (e.g. "녹음 중", "다시 누르는 중", "테스트", "직접 수정 가능해요", "여기에 음성 인식", "카메라 사용 안 할 거고요").
- It does not contain at least ONE concrete detail that actually answers the question: a specific method, tool, example, number, or personal experience.
- IMPORTANT: Merely sharing a word or two with the question topic is NOT enough. If the candidate did not make a real attempt to explain, decide, or describe something relevant, it is INVALID even if a keyword overlaps by coincidence. (e.g. answer "여기에 음성 인식" to a question about software design shares the word "음성/인식" but is NOT an answer → 0.)
If INVALID → score 0, strengths [], and put "질문에 대한 구체적인 답변이 아닙니다." in improvements. Do NOT praise anything. Do NOT invent strengths. NEVER quote the invalid answer back as if it were a strength.

STEP 2 — Only if the answer passes the gate, apply the scoring rules below.
- Meaningless answers (single characters like "ㅇ", "ㅁ", "asdf", "없음", "모름", repeated characters like "ㅇㅇㅇ", random text, OR grammatically-valid but content-empty phrases that do not actually answer the question — e.g. "녹음 중", "테스트", "안녕하세요", "그냥 해봤습니다") MUST score exactly 0. Do NOT invent strengths — leave strengths as []. If the answer does not attempt to address the question's topic at all, it is 0 regardless of grammar.
- Generic filler answers with no real content (e.g. "열심히 하겠습니다", "최선을 다하겠습니다", "잘하겠습니다", "노력하겠습니다") MUST score exactly 0. strengths must be [].

SCORE BANDS (judge by CONTENT, not by length. A long answer with no substance is still shallow):
- 5-7 points: SHALLOW answer. It addresses the question but gives NO concrete detail — no specific situation, no numbers, no named tool/method, no real outcome. This is the correct band even if the answer is several sentences long. (e.g. "자료를 찾고 전문가에게 물어봤습니다" names vague actions but has no situation or result → 6 points. "규칙 때문에 추가가 힘들었어요" states a difficulty but no specifics → 6 points.) Length alone NEVER earns points.
- 8-10 points: the answer has ONE concrete detail (a specific example, method, or reasoning) but is thin overall.
- 11-13 points: the answer has some concrete content AND partial structure, but is missing a clear or measurable result.
- 14-17 points: concrete situation + specific actions + a clear or measurable result (STAR mostly complete).
- 18-20 points: fully developed STAR with specific numbers/outcomes and strong reasoning.
- Do NOT inflate scores. Be strict and honest. When unsure between two bands, choose the LOWER one.

Other rules:
- Write ALL text in Korean only. Do NOT use Chinese characters.
- strengths and improvements: 2-3 specific items each referring to the actual answer. (Exception: meaningless answers, strengths = [].)
- NEVER write a strength that just repeats the candidate's words back (e.g. answer "카메라 사용하는" → strength "카메라 사용하는 부분이 적절합니다"). A strength must point to genuine substance, or be omitted.
- Return ONLY the JSON. No markdown, no extra text.`;

  let feedback = null;
  for (let i = 0; i < 4; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      if (typeof parsed.score === "number" && typeof parsed.modelAnswer === "string" && !hasCJK(JSON.stringify(parsed))) {
        feedback = parsed;
        break;
      }
      console.log(`피드백 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`피드백 재시도 ${i + 1}회 실패: ${err.message}`);
    }
    if (i < 3) await sleep(600 * (i + 1)); // 0.6s, 1.2s, 1.8s — 갈수록 더 기다림
  }

  if (!feedback) {
    console.log("⚠️ Groq 4회 실패 → 기본 피드백으로 대체");
    feedback = {
      score: 0, strengths: [],
      improvements: ["AI 분석이 일시적으로 지연되었습니다. 다시 시도해 주세요."],
      suggestion: "일시적인 오류로 상세 피드백을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      modelAnswer: "일시적인 오류로 모범답안을 생성하지 못했습니다.",
    };
  }

  // 추가 시간 감점 (1회당 1점, 최대 2회)
  const penalty = Math.min(extraTimeUsed ?? 0, 2) * 1;
  if (penalty > 0) {
    feedback.score = Math.max(0, feedback.score - penalty);
    feedback.improvements = [...feedback.improvements, `추가 시간을 ${Math.min(extraTimeUsed, 2)}회 사용하여 ${penalty}점 감점되었습니다.`];
  }

  const [answerResult] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, answer]);
  const answerId = answerResult.insertId;
  await pool.query(
    "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
    [answerId, feedback.score, JSON.stringify(feedback.strengths), JSON.stringify(feedback.improvements), feedback.suggestion, feedback.modelAnswer]
  );
  if (sessionId && (smileCount != null || eyeContactRatio != null)) {
    await pool.query("UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?", [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]);
  }

  // 도전 모드는 질문이 1개뿐이라 최대 20점 → 화면의 "100점 만점"에 맞춰 응답 점수만 5배로 환산.
  // (DB에는 위에서 이미 20점 원본을 저장했으므로 통계/결과조회는 영향 없음)
  let responseScore = feedback.score;
  if (sessionId) {
    const [sess] = await pool.query("SELECT mode FROM interview_sessions WHERE id = ?", [sessionId]);
    if (sess.length > 0 && sess[0].mode === "도전") {
      responseScore = feedback.score * 5;
    }
  }

  return { answerId, questionType, penalty, ...feedback, score: responseScore };
};

// 면접 완료 처리
const completeSession = async ({ sessionId, userId }) => {
  const [result] = await pool.query(
    "UPDATE interview_sessions SET completed = TRUE WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (result.affectedRows === 0) throw new Error("SESSION_NOT_FOUND");
  return { sessionId, completed: true };
};

// 세션 결과 조회
const getSessionResult = async ({ sessionId, userId }) => {
  const [sessions] = await pool.query(
    "SELECT id, jobName, questionType, mode, completed, createdAt FROM interview_sessions WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (sessions.length === 0) throw new Error("SESSION_NOT_FOUND");

  const [rows] = await pool.query(`
    SELECT q.id AS questionId, q.orderNo, q.content AS question,
           a.content AS answer,
           f.score, f.strengths, f.improvements, f.suggestion, f.modelAnswer
    FROM questions q
    LEFT JOIN answers a ON a.questionId = q.id
    LEFT JOIN feedbacks f ON f.answerId = a.id
    WHERE q.sessionId = ?
    ORDER BY q.orderNo
  `, [sessionId]);

  const results = rows.map((r) => ({
    questionId: r.questionId,
    orderNo: r.orderNo,
    question: r.question,
    answer: r.answer,
    score: r.score,
    strengths: safeParse(r.strengths),
    improvements: safeParse(r.improvements),
    suggestion: r.suggestion,
    modelAnswer: r.modelAnswer,
  }));

  return { session: sessions[0], results };
};

module.exports = { generateQuestions, evaluateAnswer, completeSession, getSessionResult };