const mypageService = require('./mypage.service');

// 로그인 사용자의 통계 조회
const getStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await mypageService.getStats(userId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('통계 조회 오류:', err);

    return res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다.',
    });
  }
};

// 로그인 사용자의 면접 이력 조회
const getHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
      50
    );

    const data = await mypageService.getHistory(
      userId,
      page,
      limit
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('이력 조회 오류:', err);

    return res.status(500).json({
      success: false,
      error: '이력 조회에 실패했습니다.',
    });
  }
};

// 로그인 사용자의 히트맵 조회
const getHeatmap = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await mypageService.getHeatmap(userId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('히트맵 조회 오류:', err);

    return res.status(500).json({
      success: false,
      error: '히트맵 조회에 실패했습니다.',
    });
  }
};

// 로그인 사용자의 잔디 캘린더 활동 데이터 조회
const getActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await mypageService.getHeatmap(userId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("활동 데이터 조회 오류:", err);

    return res.status(500).json({
      success: false,
      error: "활동 데이터를 조회하지 못했습니다.",
    });
  }
};

// 로그인 사용자의 강점·약점 분석
const getAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await mypageService.getAnalysis(userId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    if (err.message === 'ANALYSIS_GENERATION_FAILED') {
      return res.status(503).json({
        success: false,
        error: 'AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.',
      });
    }

    console.error('강점·약점 분석 오류:', err);

    return res.status(500).json({
      success: false,
      error: '강점·약점 분석에 실패했습니다.',
    });
  }
};

module.exports = {
  getStats,
  getHistory,
  getHeatmap,
  getAnalysis,
  getActivity,
};