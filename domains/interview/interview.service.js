const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ===== 사용 모델 (한 곳에서 관리) =====
// Groq가 llama-3.1 / llama-3.3 계열을 서비스 종료(decommission)해서 gpt-oss로 교체.
const MODEL_GENERATE = "openai/gpt-oss-120b";  // 질문 생성 (품질 우선 → 120b)
const MODEL_GRADE = "openai/gpt-oss-120b";     // 채점 (정확)

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const sanitizeForPrompt = (raw) => {
  return String(raw)
    .replace(/\*\*/g, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/["`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const extractJson = (raw) => {
  let text = String(raw).trim();
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return text;
};

const JUNK_PATTERNS = [
  "녹음 중", "녹음중", "녹음 중입니다",
  "테스트", "test", "테스트입니다",
  "아무말", "몰라요", "모르겠어요", "모르겠습니다",
  "없음", "없어요", "패스", "스킵", "skip",
];
const isJunkAnswer = (raw) => {
  const s = raw.trim().toLowerCase().replace(/[.。,!?~\s]/g, "");
  if (s.length < 4) return true;
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

// IT 직군과 무관한 NCS 제외 (농업/축산/수산 등) + 로봇 하드웨어 능력단위 제외
// (소프트웨어 직무에 '로봇 제어' 같은 하드웨어성 단위가 섞여 들어오는 것을 방지)
const EXCLUDE = "unitName NOT LIKE '%생육%' AND unitName NOT LIKE '%병충해%' AND unitName NOT LIKE '%재배%' AND unitName NOT LIKE '%작물%' AND unitName NOT LIKE '%농업%' AND unitName NOT LIKE '%축산%' AND unitName NOT LIKE '%양식%' AND unitName NOT LIKE '%어업%' AND unitName NOT LIKE '%임업%' AND unitName NOT LIKE '%원예%' AND unitName NOT LIKE '%로봇%' AND unitName NOT LIKE '%기계%' AND unitName NOT LIKE '%전기%' AND unitName NOT LIKE '%전자기기%' AND unitName NOT LIKE '%설비%' AND unitName NOT LIKE '%제조%'";

const TYPE_GUIDE = {
  "경험행동형": "지원자의 과거 경험과 행동을 묻는 질문 (예: ~한 경험을 말해보세요)",
  "직무기술형": "직무 지식과 기술 역량을 확인하는 질문",
  "상황판단형": "구체적인 문제 상황이나 딜레마를 시나리오로 먼저 제시한 뒤, '이런 상황이라면 어떻게 판단하고 대응하겠는가'를 묻는 질문.",
};

// 직무명 → NCS 검색 키워드 매핑.
// 주의: 아래 for 루프가 위에서부터 순서대로 includes()를 검사하므로,
//       더 구체적인(긴) 직무명을 먼저 두어야 정확히 매칭된다.
//       실제 직무명은 띄어쓰기 없이 붙여오는 경우가 많아 붙여쓴 형태를 우선 등록.
const JOB_KEYWORDS = {
  // 데이터 계열
  "데이터분석": ["데이터", "빅데이터"],
  "데이터엔지니어": ["데이터", "빅데이터"],
  "빅데이터": ["데이터", "빅데이터"],
  "데이터": ["데이터", "빅데이터"],
  // AI 계열
  "머신러닝": ["인공지능", "머신러닝"],
  "AI서비스기획": ["인공지능"],
  "AI엔지니어": ["인공지능"],
  "AI": ["인공지능"],
  "인공지능": ["인공지능"],
  // 게임
  "게임": ["게임"],
  // 보안
  "정보보안": ["보안", "정보보호"],
  "보안": ["보안", "정보보호"],
  // 네트워크
  "네트워크": ["네트워크"],
  // 시스템/SW 계열 — 로봇/하드웨어로 새지 않도록 SW 중심 키워드로 좁힘
  "시스템소프트웨어": ["소프트웨어", "운영체제", "시스템프로그래밍"],
  "컴퓨터시스템설계": ["소프트웨어", "아키텍처"],
  "정보시스템운영": ["소프트웨어", "운영", "네트워크"],
  "응용소프트웨어": ["소프트웨어", "응용"],
  "소프트웨어": ["소프트웨어"],
  "웹": ["웹", "소프트웨어"],
  // '시스템' 단독은 가장 마지막 (가장 넓은 매칭이라 fallback)
  "시스템": ["소프트웨어", "운영체제"],
};

// 매핑 비교 시 공백을 무시하고 비교 (직무명이 "시스템 소프트웨어"로 와도 매칭되도록)
const normalize = (s) => String(s).replace(/\s/g, "");

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

  // 직무명 공백 무시하고 키워드 매칭
  const normalizedJob = normalize(jobName);
  let words = null;
  for (const key in JOB_KEYWORDS) {
    if (normalizedJob.includes(normalize(key))) { words = JOB_KEYWORDS[key]; break; }
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
Make each question challenging and probing, not just informational.
CRITICAL: Each question must be ONE single sentence. Do NOT stack two questions together (never "~하시겠습니까? 왜 ~하셨습니까?" style with two question marks). Exactly one sharp question per item, one question mark only.
Across the ${numQuestions} questions, use a DIFFERENT pressure angle for each — do not repeat the same angle twice:
- challenge their judgment, OR
- assume their approach already failed, OR
- demand justification for a choice, OR
- introduce opposition or a hard constraint, OR
- point out a limitation of their likely approach, OR
- force a trade-off between two concrete options.
Vary the sentence structure too — they must NOT all follow the same template or end the same way.
Keep formal 존댓말 ("~하시겠습니까?", "~보십니까?"). Never 반말, never fragments, never two questions in one.`
    : "";

  const varietyRule = questionType === "상황판단형"
    ? `9. VARIETY (CRITICAL): The ${numQuestions} questions MUST NOT all follow the same template. Do NOT make every question "상황 제시 + 어떻게 하시겠어요?". Vary the framing across the set — some ask for a decision, some ask which option they would prioritize and why, some ask how they would diagnose a cause, some ask what trade-offs they would weigh, some ask how they would persuade or handle disagreement. Each of the ${numQuestions} questions must feel clearly different from the others in structure and ending.`
    : `9. VARIETY (CRITICAL): The ${numQuestions} questions MUST cover different aspects and use different sentence structures. Do NOT repeat the same template or ending across questions. Each question should feel distinct.`;

  const prompt = `You are an experienced Korean job interviewer conducting a real interview for the role of "${jobName}".
Generate exactly ${numQuestions} interview questions.
Question type: ${guide}

Background knowledge (use as inspiration only, NEVER quote directly):
${skillText}

CRITICAL WRITING RULES — follow these strictly, they override everything above:
1. Write like a real interviewer speaking face-to-face. NOT like a written exam or certification test.
2. NEVER put standard names or acronyms in the question: ISO/IEC, ITIL, SLM, ISMS-P, BSC, SPI, CRUD, ETL, BPMN.
3. NEVER copy phrases from the background knowledge above. Absorb the idea, then ask in your own natural words.
4. Use FORMAL, professional 존댓말 endings. Preferred endings: "~있으신가요?", "~궁금합니다", "~말씀해 주시겠어요?", "~어떻게 대응하시겠습니까?", "~어떻게 보시나요?", "~어떤 점을 고려하시겠습니까?". STRICTLY AVOID casual/soft endings like "~겠어요?", "~했어요?", "~하시겠어요?", "~찾아보시겠어요?". Replace them with "~하시겠습니까?" style.
5. ONE topic per question, and only ONE question mark per item. Never use "~하고, ~하는지" to stack two topics, and never put two separate questions in one item.
6. Under 60 Korean characters. Complete polite sentences (존댓말), never 반말.
7. Every question MUST clearly relate to the software/IT role "${jobName}". Focus on software, systems, data, and development topics. Do NOT ask about hardware, robots, machinery, manufacturing, or unrelated fields (agriculture, farming).
8. Do NOT start every question with a scenario. Mix scenario-based and direct questions unless the type strictly requires scenarios.
${varietyRule}

Target style (note the variety in structure and formal endings):
- "데이터 품질 때문에 곤란했던 경험이 있으신가요?"
- "대용량 로그를 수집한다면 어디서부터 시작하시겠습니까?"
- "분석 결과를 비전문가에게 설명해야 했던 적이 궁금합니다."
- "두 방식 중 하나를 골라야 한다면 무엇을 우선하시겠습니까?"
${styleInstruction}

Output:
- Korean Hangul only. No Chinese characters.
- Return ONLY a JSON object with a single key "questions" whose value is an array of ${numQuestions} strings. Example: {"questions": ["질문1", "질문2"]}. No other text.`;

  let questions = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: MODEL_GENERATE,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
      const text = extractJson(completion.choices[0].message.content);
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.questions;
      if (Array.isArray(arr) && arr.length > 0 && !arr.some(hasCJK)) {
        questions = arr;
        break;
      }
      console.log(`질문 생성 재시도 ${i + 1}회 (형식/한자 문제)`);
    } catch (err) {
      console.log(`질문 생성 재시도 ${i + 1}회 실패:`, err.message);
    }
    if (i < 2) await sleep(600 * (i + 1));
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
The gate is STRICT. When in doubt, the answer is INVALID (score 0).
An answer is INVALID (score exactly 0, strengths = []) if ANY of these is true:
- It is shorter than a real sentence a candidate would actually say in an interview.
- It restates the topic without any actual content.
- It is a fragment, note-to-self, UI text, or clearly not spoken to an interviewer.
- It does not contain at least ONE concrete detail that actually answers the question.
- Merely sharing a word or two with the question topic is NOT enough.
If INVALID -> score 0, strengths [], and put "질문에 대한 구체적인 답변이 아닙니다." in improvements. Do NOT invent strengths.

STEP 2 — Only if the answer passes the gate, apply the scoring rules below.
- Meaningless or generic filler answers ("열심히 하겠습니다" 등) MUST score exactly 0, strengths [].

SCORE BANDS (judge by CONTENT, not by length):
- 5-7: SHALLOW, no concrete detail. Length alone NEVER earns points.
- 8-10: ONE concrete detail but thin.
- 11-13: some concrete content + partial structure, missing clear result.
- 14-17: situation + specific actions + clear/measurable result (STAR mostly complete).
- 18-20: fully developed STAR with numbers/outcomes.
- When unsure between two bands, choose the LOWER one.

Other rules:
- All text in Korean only. No Chinese characters.
- strengths/improvements: 2-3 specific items referring to the actual answer.
- NEVER repeat the candidate's words back as a strength.
- Return ONLY the JSON. No markdown, no extra text.`;

  let feedback = null;
  for (let i = 0; i < 6; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: MODEL_GRADE,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });
      const text = extractJson(completion.choices[0].message.content);
      const parsed = JSON.parse(text);
      if (typeof parsed.score === "number" && typeof parsed.modelAnswer === "string" && !hasCJK(JSON.stringify(parsed))) {
        feedback = parsed;
        break;
      }
      console.log(`피드백 재시도 ${i + 1}회 (형식/한자 문제)`);
    } catch (err) {
      console.log(`피드백 재시도 ${i + 1}회 실패:`, err.message);
    }
    if (i < 5) await sleep(Math.min(600 * (i + 1), 2000));
  }

  if (!feedback) {
    console.log("⚠️ Groq 6회 실패 → 기본 피드백으로 대체");
    feedback = {
      score: 0, strengths: [],
      improvements: ["AI 분석이 일시적으로 지연되었습니다. 다시 시도해 주세요."],
      suggestion: "일시적인 오류로 상세 피드백을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      modelAnswer: "일시적인 오류로 모범답안을 생성하지 못했습니다.",
    };
  }

  const penalty = Math.min(extraTimeUsed ?? 0, 2) * 1;
  if (penalty > 0) {
    feedback.score = Math.max(0, feedback.score - penalty);
    feedback.improvements = [...feedback.improvements, `추가 시간을 ${Math.min(extraTimeUsed, 2)}회 사용하여 ${penalty}점 감점되었습니다.`];
  }

  feedback.score = Math.max(0, Math.min(20, Math.round(feedback.score)));

  const [answerResult] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, answer]);
  const answerId = answerResult.insertId;
  await pool.query(
    "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
    [answerId, feedback.score, JSON.stringify(feedback.strengths), JSON.stringify(feedback.improvements), feedback.suggestion, feedback.modelAnswer]
  );
  if (sessionId && (smileCount != null || eyeContactRatio != null)) {
    await pool.query("UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?", [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]);
  }

  let responseScore = feedback.score;
  if (sessionId) {
    const [sess] = await pool.query("SELECT mode FROM interview_sessions WHERE id = ?", [sessionId]);
    if (sess.length > 0 && sess[0].mode === "도전") {
      responseScore = feedback.score * 5;
    }
  }

  return { answerId, questionType, penalty, ...feedback, score: responseScore };
};

const completeSession = async ({ sessionId, userId }) => {
  const [result] = await pool.query(
    "UPDATE interview_sessions SET completed = TRUE WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (result.affectedRows === 0) throw new Error("SESSION_NOT_FOUND");
  return { sessionId, completed: true };
};

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

  const isChallenge = sessions[0].mode === "도전";

  const results = rows.map((r) => ({
    questionId: r.questionId,
    orderNo: r.orderNo,
    question: r.question,
    answer: r.answer,
    score: (isChallenge && r.score != null) ? r.score * 5 : r.score,
    strengths: safeParse(r.strengths),
    improvements: safeParse(r.improvements),
    suggestion: r.suggestion,
    modelAnswer: r.modelAnswer,
  }));

  return { session: sessions[0], results };
};

module.exports = { generateQuestions, evaluateAnswer, completeSession, getSessionResult };