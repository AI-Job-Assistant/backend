const mypageService = require('./mypage.service');

const getStats = async (req, res) => {
  try {
    res.json(await mypageService.getStats(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "통계 조회에 실패했습니다." });
  }
};

const getHistory = async (req, res) => {
  try {
    res.json(await mypageService.getHistory(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "이력 조회에 실패했습니다." });
  }
};

const getHeatmap = async (req, res) => {
  try {
    res.json(await mypageService.getHeatmap(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "히트맵 조회에 실패했습니다." });
  }
};

const getAnalysis = async (userId) => {
  // ... (기존 DB에서 유저 면접 데이터 가져오는 로직) ...

  const prompt = `...`; // (기존 프롬프트)

  let analysisData = null;

  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }, // 1. Groq에 JSON 형식 강제
      });

      let rawContent = completion.choices[0]?.message?.content || "";

      // 2. 백틱 및 불필요한 텍스트 제거 후 순수 JSON 객체만 추출
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        rawContent = match[0];
      }

      const parsed = JSON.parse(rawContent);

      if (parsed) {
        analysisData = parsed;
        break;
      }
    } catch (err) {
      console.log(`분석 재시도 ${i + 1}회 (JSON 파싱 실패)`);
    }
  }

  // 3. 3회 실패 시 에러를 던져 화면을 깨뜨리는 대신 기본 데이터 반환 (핵심)
  if (!analysisData) {
    console.log("⚠️ Groq 분석 실패 -> 기본 템플릿 반환");
    return {
      strengths: ["면접 답변에 대한 분석 데이터가 수집 중입니다."],
      improvements: ["답변을 더 구체적이고 길게 작성해 주시면 정밀한 분석이 가능합니다."],
      summary: "일시적인 AI 응답 지연으로 기본 분석 결과를 표시합니다."
    };
  }

  return analysisData;
};

const updateGoal = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;
    const { goal } = req.body;
    if (typeof goal !== "string" || goal.length > 100) {
      return res.status(400).json({ error: "goal은 100자 이내 문자열이어야 합니다." });
    }
    const result = await mypageService.updateGoal(userId, goal);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "목표 저장에 실패했습니다." });
  }
};

module.exports = { getStats, getHistory, getHeatmap, getAnalysis, updateGoal };