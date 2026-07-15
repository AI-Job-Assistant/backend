const interviewService = require('./interview.service');

const VALID_TYPES = ["경험행동형", "직무기술형", "상황판단형"];

const generateQuestions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId, jobName, questionType } = req.body;

    // 검증 1: jobId나 jobName 중 하나는 있어야 함
    if (!jobId && !jobName) {
      return res.status(400).json({ success: false, error: "jobId 또는 jobName이 필요합니다." });
    }
    // 검증 2: questionType이 정해진 3개 중 하나여야 함
    if (!VALID_TYPES.includes(questionType)) {
      return res.status(400).json({ success: false, error: "questionType이 올바르지 않습니다. (경험행동형/직무기술형/상황판단형)" });
    }

    const result = await interviewService.generateQuestions({ userId, jobId, jobName, questionType });
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.message === "JOB_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "직무를 찾을 수 없습니다." });
    }
    if (err.message === "QUESTION_GENERATION_FAILED") {
      return res.status(503).json({ success: false, error: "AI 질문 생성에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
    console.error(err);
    res.status(500).json({ success: false, error: "질문 생성에 실패했습니다." });
  }
};

const evaluateAnswer = async (req, res) => {
  try {
    const { questionId, answer, questionType } = req.body;

    if (!questionId) {
      return res.status(400).json({success: false, error: "questionId가 필요합니다." });
    }
    // 검증 1: 답변이 비어있지 않아야 함
    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({ success: false, error: "답변이 비어 있습니다." });
    }
    // 검증 2: questionType 확인
    if (!VALID_TYPES.includes(questionType)) {
      return res.status(400).json({ success: false, error: "questionType이 올바르지 않습니다." });
    }

    const result = await interviewService.evaluateAnswer({
      userId: req.user.id,
       ...req.body,
       });
    return res.status(200).json({
      success: true,
      data: result,
      });
  } catch (err) {
    if (err.message === "QUESTION_ACCESS_DENIED") {
      return res.status(403).json({
        success: false,
        error: "해당 질문에 접근할 권한이 없습니다.",
         });
        }

    if (err.message === "FEEDBACK_GENERATION_FAILED") {
       return res.status(503).json({
        success: false,
        error: "AI 피드백 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
       });
      }

    console.error(err);
    return res.status(500).json({ success: false, error: "피드백 생성에 실패했습니다." });
  }
};

const getInterviewById = async (req, res) => {
  try {
    const userId = req.user.id;
    const interviewId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(interviewId) || interviewId <= 0) {
      return res.status(400).json({
        success: false,
        error: "올바른 면접 ID가 필요합니다.",
      });
    }

    const data = await interviewService.getInterviewById(
      interviewId,
      userId
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    if (err.message === "INTERVIEW_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "면접 기록을 찾을 수 없습니다.",
      });
    }

    if (err.message === "INTERVIEW_ACCESS_DENIED") {
      return res.status(403).json({
        success: false,
        error: "해당 면접 기록에 접근할 권한이 없습니다.",
      });
    }

    console.error(err);

    return res.status(500).json({
      success: false,
      error: "면접 기록 조회에 실패했습니다.",
    });
  }
};

module.exports = { generateQuestions, evaluateAnswer, getInterviewById };