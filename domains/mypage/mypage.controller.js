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

const getAnalysis = async (req, res) => {
  try {
    res.json(await mypageService.getAnalysis(req.user.id));
  } catch (err) {
    if (err.message === "ANALYSIS_GENERATION_FAILED") {
      return res.status(503).json({ error: "AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
    console.error(err);
    res.status(500).json({ error: "강점·약점 분석에 실패했습니다." });
  }
};

module.exports = { getStats, getHistory, getHeatmap, getAnalysis };