📄 JobCoach API 명세서 (프론트엔드 ↔ 백엔드 연동 계약 문서)최종 업데이트: 2026-08-02작성자: 백엔드 A (시현)📌 1. 개요 & 기본 설정Base URL: [https://jobcoach-backend-e0yl.onrender.com](https://jobcoach-backend-e0yl.onrender.com) (Render 배포 완료)로컬 개발 시: http://localhost:5000⚠️ 서버 슬립 안내: 무료 플랜 특성상 15분 미사용 시 서버가 잠듭니다. 첫 호출 시 30초 ~ 1분 정도 소요될 수 있으니 시연 전 미리 한 번 호출해 깨워두세요.응답 형식: JSON인증 (JWT):마이페이지 API(stats, history, heatmap, analysis)는 로그인 사용자 본인 데이터만 응답합니다.요청 헤더에 Authorization: Bearer <토큰> 전송 필수 (없으면 401 Unauthorized).⚠️ [중요] 면접 API(questions, feedback) 호출 시에도 반드시 JWT 토큰을 포함해야 세션에 userId가 기록되며, 그래야 마이페이지 이력에 정상 반영됩니다. (토큰 미포함 시 userId: null로 저장되어 이력에서 누락됨)🎨 2. 공통 Enum 값구분값 (Exact Match)비고questionType경험행동형 · 직무기술형 · 상황판단형Figma 표기("직무·기술형" 등)와 차이가 있으니 주의interviewStyle일반 · 압박생략 시 기본값: 일반mode텍스트 · 스피킹 · 도전생략 시 기본값: 텍스트⚠️ 주의: 백엔드 문자열 파싱 규칙이 엄격하므로, 프론트엔드에서 보낼 때 오탈자 없이 위 값과 100% 일치시켜 전송해 주세요.🎯 3. 면접 진행 API3.1 질문 생성Endpoint: POST /api/interview/questions설명: 직무 및 질문 유형에 따라 NCS 기반 질문 5개를 생성하고, 면접 세션을 DB에 저장합니다.📩 Request BodyjobId (DB 내 직무) 또는 jobName (직접 입력 직무) 중 하나를 전송합니다.JSON// Case A: DB에 등록된 직무 (jobId 사용)
{
  "jobId": 102,
  "questionType": "직무기술형"
}

// Case B: DB에 없는 직무 (jobName 사용)
{
  "jobName": "AI 엔지니어",
  "questionType": "직무기술형"
}
선택 파라미터 (Option)sessionType: "challenge" (도전 모드 - 질문 1개, 통계 제외) / "practice" (정식 면접 - 질문 5개)mode: "스피킹" / "텍스트" (마이페이지 이력 뱃지 표시용)interviewStyle: "압박" (압박 면접 모드)count: 1 (도전 모드용 질문 1개 생성)※ sessionType: "challenge", mode: "도전", count: 1 중 하나만 보내도 도전 모드로 자동 처리됩니다.📤 Response (200 OK)JSON{
  "sessionId": 1,
  "jobName": "데이터분석가(빅데이터분석가)",
  "questionType": "직무기술형",
  "questions": [
    { "id": 1, "orderNo": 1, "content": "질문 내용 1..." },
    { "id": 2, "orderNo": 2, "content": "질문 내용 2..." }
  ]
}
sessionId 및 질문별 id는 답변 제출/평가 API 호출 시 사용되므로 프론트엔드에 저장해 두어야 합니다.3.2 답변 평가 & 피드백Endpoint: POST /api/interview/feedback설명: 질문 유형별 평가 기준(STAR / 기술 / 판단)에 맞춰 답변을 채점하고 피드백을 DB에 저장합니다.📩 Request BodyJSON{
  "questionId": 1,
  "question": "질문 내용",
  "answer": "사용자 답변",
  "questionType": "직무기술형",
  "sessionId": 1,
  "smileCount": 5,          // [스피킹 전용] 선택
  "eyeContactRatio": 0.7,   // [스피킹 전용] 선택 (0~1 사이 소수)
  "extraTimeUsed": 1        // [압박 전용] 선택 (추가시간 사용 횟수: 0, 1, 2)
}
extraTimeUsed: 20점 만점 기준 추가 시간 1회당 1점 감점 (최대 2점 감점). 감점 시 개선사항 지표에 자동 반영됩니다.🚨 평가 점수 및 방어 로직 (Fail-Safe)20점 만점 채점: score 범위는 0 ~ 20 (숫자형). AI가 100점 스케일로 출력하더라도 백엔드에서 자동으로 5로 나누어 20점 스케일로 보정 저장합니다.빈 답변 처리: answer가 공백/빈 문자열이어도 400 에러 없이 200 OK 응답하며 0점 처리됩니다.AI 파싱 방어: 한자(CJK) 포함 또는 JSON 파싱 오류 시 최대 3회 재시도하며, 최종 실패 시에도 기본 피드백(0점 및 지연 안내)을 안심 반환합니다.📤 Response (200 OK - 일반 응답 예시)JSON{
  "answerId": 1,
  "questionType": "직무기술형",
  "score": 16,
  "strengths": [
    "체계적인 분석 도구 활용과 알고리즘 개선에 대한 구체적인 예시 제공",
    "측정 가능한 결과를 명확하게 제시"
  ],
  "improvements": [
    "해결 과정에서 팀원들의 역할이나 협력에 대한 언급이 부족"
  ],
  "suggestion": "팀워크와 기술적인 세부 사항에 대한 설명을 추가하면 답변을 더욱 보완할 수 있습니다.",
  "modelAnswer": "실시간 데이터 수집 시 발생하는 동기화 오버헤드를 해결하기 위해..."
}
📤 Response (200 OK - 빈 답변 응답 예시)JSON{
  "answerId": 11,
  "questionType": "직무기술형",
  "score": 0,
  "strengths": [],
  "improvements": [
    "답변을 입력하지 않았습니다.",
    "시간 내에 답변을 작성하는 연습이 필요합니다."
  ],
  "suggestion": "이 질문에 답변하지 않았습니다. 짧더라도 자신의 생각을 정리해 답변해 보세요.",
  "modelAnswer": "답변이 없어 모범답안을 제공하지 않습니다."
}
📊 4. 마이페이지 API4.1 요약 통계Endpoint: GET /api/mypage/stats헤더: Authorization: Bearer <토큰> 필수📤 Response (200 OK)JSON{
  "totalSessions": 12,
  "avgScore": 16,
  "monthlyChange": 2
}
totalSessions: 총 연습 횟수avgScore: 전체 평균 점수 (20점 만점 기준)monthlyChange: 이번 달 평균 − 지난달 평균 (양수: 상승, 음수: 하락, 데이터 없을 시 0)⚠️ 참고: 도전 모드(mode: "도전") 세션은 요약 통계(총 횟수·평균 점수) 수치 산출에서 제외됩니다.4.2 최근 면접 이력Endpoint: GET /api/mypage/history헤더: Authorization: Bearer <토큰> 필수설명: 최근 순으로 최대 10개의 면접 세션 이력을 반환합니다.📤 Response (200 OK)JSON[
  {
    "id": 1,
    "jobName": "데이터 엔지니어",
    "questionType": "직무기술형",
    "mode": "텍스트",
    "createdAt": "2026-06-22T09:13:41.000Z",
    "avgScore": "16.0000",
    "durationMin": 4,
    "smileCount": 5,
    "eyeContactRatio": "0.700"
  }
]
⚠️ avgScore, eyeContactRatio는 DB 연산 특성상 문자열형으로 리턴되므로 프론트엔드에서 Number(avgScore)로 파싱하여 사용해야 합니다.답변을 완결하지 않은 세션은 avgScore, durationMin이 null일 수 있습니다.4.3 점수 히트맵 (잔디 시각화)Endpoint: GET /api/mypage/heatmap헤더: Authorization: Bearer <토큰> 필수📤 Response (200 OK)JSON[
  {
    "date": "2026-06-22",
    "sessionCount": 1,
    "avgScore": "16.0000"
  }
]
⚠️ avgScore는 Number(avgScore) 파싱 필요 (20점 만점 기준).4.4 강점·약점 AI 분석Endpoint: GET /api/mypage/analysis헤더: Authorization: Bearer <토큰> 필수설명: 누적 피드백 데이터를 기반으로 AI가 강점/약점 패턴을 종합 분석합니다.📤 Response (200 OK)JSON{
  "hasData": true,
  "basedOn": 3,
  "topStrengths": [
    "구체적인 문제 해결 과정 기술",
    "측정 가능한 성과 지표 제시"
  ],
  "topWeaknesses": [
    "팀원과의 협력 및 의사소통 과정 설명 부족"
  ],
  "summary": "기술적인 문제 해결 역량은 훌륭하나, 조직 내 협업 경험을 조금 더 구체화하면 좋은 평가를 받을 수 있습니다."
}
🔍 5. 조회용 공통 APIEndpointMethod설명/api/jobsGET전체 직무 목록 조회/api/departmentsGET전체 학과 목록 조회/api/jobs/:id/ncsGET특정 직무 ID에 해당하는 NCS 능력단위 목록 조회🛠️ 6. 프론트엔드 핵심 변경 & 연동 체크리스트점수 스케일 (20점 만점):백엔드가 제공하는 점수 스케일은 20점 만점입니다.UI 화면 상에 적용되어 있던 score * 5 연산 로직을 제거하고, 20점 만점 기준으로 연동해 주세요.숫자 파싱 (Number()):history 및 heatmap API의 avgScore, eyeContactRatio는 문자열(string) 형태이므로 반드시 Number() 형변환을 거친 후 렌더링하세요.JWT 토큰 필수 전달:질문 생성(POST /api/interview/questions) 및 피드백(POST /api/interview/feedback) 호출 시에도 Header에 Authorization: Bearer <token>을 반드시 넣어야 마이페이지 누락을 방지할 수 있습니다.
