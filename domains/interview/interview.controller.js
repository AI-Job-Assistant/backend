const interviewService = require('./interview.service');

const VALID_TYPES = ["경험행동형", "직무기술형", "상황판단형"];

const generateQuestions = async (req, res) => {
  try {
    const { jobId, jobName, questionType, interviewStyle, count, mode, sessionType } = req.body;
    const userId = req.user?.id ?? null;

    if (!jobId && !jobName) {
      return res.status(400).json({ error: "jobId 또는 jobName이 필요합니다." });
    }
    if (!VALID_TYPES.includes(questionType)) {
      return res.status(400).json({ error: "questionType이 올바르지 않습니다. (경험행동형/직무기술형/상황판단형)" });
    }

    const result = await interviewService.generateQuestions({ jobId, jobName, questionType, userId, interviewStyle, count, mode, sessionType });
    res.json(result);
  } catch (err) {
    if (err.message === "JOB_NOT_FOUND") {
      return res.status(404).json({ error: "직무를 찾을 수 없습니다." });
    }
    if (err.message === "QUESTION_GENERATION_FAILED") {
      return res.status(503).json({ error: "AI 질문 생성에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
    console.error(err);
    res.status(500).json({ error: "질문 생성에 실패했습니다." });
  }
};

const evaluateAnswer = async (req, res) => {
  try {
    const { answer, questionType } = req.body;

  
    if (!VALID_TYPES.includes(questionType)) {
      return res.status(400).json({ error: "questionType이 올바르지 않습니다." });
    }

    const result = await interviewService.evaluateAnswer(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "피드백 생성에 실패했습니다." });
  }
};

module.exports = { generateQuestions, evaluateAnswer };