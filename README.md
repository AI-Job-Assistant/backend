JobCoach API 명세서프론트엔드 ↔ 백엔드 연동 계약 문서최종 업데이트: 2026-08-02 · 작성: 백엔드 A (시현)개요Base URL: [https://jobcoach-backend-e0yl.onrender.com](https://jobcoach-backend-e0yl.onrender.com) (배포 완료 · Render)로컬 개발 시엔 http://localhost:5000⚠️ 무료 플랜이라 15분 미사용 시 서버가 잠듦 → 첫 호출이 30초~1분 느릴 수 있음(정상). 데모 전 미리 한 번 호출해 깨워둘 것.응답 형식: JSON인증: JWT 적용 완료. 마이페이지 API(stats·history·heatmap·analysis)는 로그인한 사용자 본인 데이터만 응답한다. 요청 시 헤더에 Authorization: Bearer <토큰> 필수 (없으면 401).⚠️ 중요: 면접 API(질문 생성·답변 평가)도 토큰을 함께 보내야 세션에 userId가 저장되고, 그래야 마이페이지에 기록이 뜬다. 토큰 없이 면접을 보면 userId: null로 저장되어 마이페이지에 안 나타남.공통 Enum항목값questionType경험행동형 · 직무기술형 · 상황판단형interviewStyle일반 · 압박 (생략 시 일반)mode텍스트 · 스피킹 · 도전 (생략 시 텍스트)⚠️ Figma 표기("직무·기술형" 등)와 글자가 다르니, 프론트에서 보낼 땐 위 값과 한 글자도 안 틀리게 일치시킬 것.1. 질문 생성POST /api/interview/questions직무·질문유형으로 NCS 기반 질문 5개를 생성하고, 면접 세션을 DB에 저장한다.요청 Body — jobId 또는 jobName 중 하나를 보낸다.DB에 있는 직무는 jobId로:JSON{
  "jobId": 102,
  "questionType": "직무기술형"
}
DB에 없는 AI 직무는 jobName으로:JSON{
  "jobName": "AI 엔지니어",
  "questionType": "직무기술형"
}
jobId: DB에 있는 직무 (예: 데이터분석가 = 102)jobName: 직무명 직접 지정 (DB에 없는 AI 엔지니어·머신러닝 엔지니어 등)questionType: 위 Enum선택 파라미터 (안 보내면 기존 동작 그대로 — 하위 호환)필드값설명sessionType"challenge" / "practice"권장. challenge = 도전 모드(질문 1개 + 통계 제외 자동 적용), practice = 정식 면접(질문 5개)mode"스피킹" / "텍스트"이 세션이 어떤 화면에서 진행됐는지 기록. 마이페이지 이력에 뱃지로 표시됨interviewStyle"압박"압박 면접. 지원자의 판단·근거를 파고드는 도전적인 질문이 생성됨. 생략하면 일반 난이도count1질문 1개만 생성. sessionType: "challenge"와 동일한 효과 (구버전 호환용)sessionType: "challenge" · mode: "도전" · count: 1 중 아무거나 하나만 보내도 도전 모드로 처리된다.응답 200JSON{
  "sessionId": 1,
  "jobName": "데이터분석가(빅데이터분석가)",
  "questionType": "직무기술형",
  "questions": [
    { "id": 1, "orderNo": 1, "content": "질문 내용..." },
    { "id": 2, "orderNo": 2, "content": "..." }
  ]
}
sessionId와 각 질문 id는 답변 제출 시 필요하니 프론트에서 보관할 것.2. 답변 평가POST /api/interview/feedback답변을 질문유형별 기준(STAR / 기술 / 판단)으로 평가하고, 점수·피드백을 DB에 저장한다.요청 BodyJSON{
  "questionId": 1,
  "question": "질문 내용",
  "answer": "사용자 답변",
  "questionType": "직무기술형",
  "sessionId": 1,
  "smileCount": 5,
  "eyeContactRatio": 0.7,
  "extraTimeUsed": 1
}
sessionId·smileCount·eyeContactRatio: 스피킹(카메라) 면접에서만 함께 전송. 보내면 해당 세션에 카메라 지표가 저장됨. 텍스트 면접은 생략 가능.eyeContactRatio: 0~1 사이 소수 (예: 0.7 = 70%)extraTimeUsed: 압박 면접 추가 시간 감점용 (선택). 20점 만점 기준 추가 시간을 쓴 횟수(0/1/2)에 따라 1회당 1점, 최대 2점 감점된다. 감점 시 개선점에 안내 문구가 자동으로 붙는다. (일반 면접은 생략 또는 0).🚨 평가 점수 및 방어 로직 (최신 업데이트)20점 만점 채점 스케일 적용score 범위: 0 ~ 20 (숫자형)💡 자동 보정(Fail-safe): AI가 순간적으로 기존 습관 때문에 100점 스케일(예: 80점)로 응답하더라도, 백엔드에서 자동으로 5로 나누어 20점 만점(16점)으로 보정하여 저장·반환합니다.빈 답변 처리 (400 예외 없음)answer가 빈 문자열이거나 공백만 있어도 200 OK 응답하며 0점 처리됩니다.Groq AI 예외 및 필터링 방어한자(CJK) 문자가 포함되거나 JSON 파싱에 실패할 경우 최대 3회 재시도합니다.3회 실패 시에도 앱이 멈추지 않고 200 OK + 기본 피드백(0점 및 지연 안내)을 안전하게 반환합니다.modelAnswer가 누락되거나 배열 구조가 깨져도 기본값으로 보정하여 전달합니다.응답 200 (일반 응답 예시)JSON{
  "answerId": 1,
  "questionType": "직무기술형",
  "score": 16,
  "strengths": ["체계적인 분석 도구 활용과 알고리즘 개선에 대한 구체적인 예시 제공", "측정 가능한 결과를 명확하게 제시"],
  "improvements": ["해결 과정에서 팀원들의 역할이나 협력에 대한 언급이 부족"],
  "suggestion": "팀워크와 기술적인 세부 사항에 대한 설명을 추가하면 답변을 더욱 보완할 수 있습니다.",
  "modelAnswer": "실시간 데이터 수집 시 발생하는 동기화 오버헤드를 해결하기 위해..."
}
응답 200 (빈 답변 응답 예시)JSON{
  "answerId": 11,
  "questionType": "직무기술형",
  "score": 0,
  "strengths": [],
  "improvements": ["답변을 입력하지 않았습니다.", "시간 내에 답변을 작성하는 연습이 필요합니다."],
  "suggestion": "이 질문에 답변하지 않았습니다. 짧더라도 자신의 생각을 정리해 답변해 보세요.",
  "modelAnswer": "답변이 없어 모범답안을 제공하지 않습니다."
}
3. 마이페이지 — 통계GET /api/mypage/stats응답 200JSON{
  "totalSessions": 12,
  "avgScore": 16,
  "monthlyChange": 2
}
totalSessions: 총 연습 횟수 (숫자형)avgScore: 전체 평균 점수 (숫자형, 20점 만점 기준)monthlyChange: 이번 달 평균 − 지난달 평균 (숫자형)양수(+2, 상승) / 음수(-1, 하락) 둘 다 가능 → 프론트에서 부호 보고 색·화살표 처리이번 달 또는 지난달 데이터가 없으면 0⚠️ 도전 모드(mode: "도전") 세션은 이 통계에서 제외된다. 총 연습 횟수·평균 점수 모두 해당. (단, 이력·잔디에는 표시됨)4. 마이페이지 — 최근 이력GET /api/mypage/history세션별 직무·유형·날짜·평균 점수·소요시간을 최근순(최대 10개)으로 반환한다.응답 200JSON[
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
mode: 면접 종류 — 텍스트 · 스피킹 · 도전. 이력 카드에 뱃지로 표시durationMin: 면접 시작부터 마지막 답변 제출까지 걸린 시간 (분, 숫자형)smileCount: 면접 중 웃음 횟수 (숫자형). 텍스트 면접은 0eyeContactRatio: 카메라 응시율 (문자열 "0.700" = 70%) → 프론트에서 Number() 변환 후 ×100. 텍스트 면접은 0⚠️ avgScore·eyeContactRatio는 문자열로 옴 → Number() 변환 필요 (20점 만점 기준)⚠️ 답변을 안 한 세션은 avgScore·durationMin이 null 일 수 있음 → 프론트 방어 처리5. 마이페이지 — 점수 히트맵GET /api/mypage/heatmap날짜별 면접 횟수·평균 점수를 반환한다. (GitHub 잔디 스타일 시각화용)응답 200JSON[
  { "date": "2026-06-22", "sessionCount": 1, "avgScore": "16.0000" }
]
date: YYYY-MM-DD (한국시간 기준 문자열)sessionCount: 그날 면접 횟수 (숫자형)⚠️ avgScore는 여기서도 문자열로 옴 → Number() 변환 필요 (20점 만점 기준)6. 마이페이지 — 강점·약점 AI 분석GET /api/mypage/analysis누적된 모든 피드백(strengths·improvements)을 종합해 반복되는 강점·약점 패턴을 AI가 분석한다.응답 200 (데이터 있을 때)JSON{
  "hasData": true,
  "basedOn": 3,
  "topStrengths": ["구체적인 문제 해결 과정 기술", "측정 가능한 성과 지표 제시"],
  "topWeaknesses": ["팀원과의 협력 및 의사소통 과정 설명 부족"],
  "summary": "기술적인 문제 해결 역량은 훌륭하나, 조직 내 협업 경험을 조금 더 구체화하면 좋은 평가를 받을 수 있습니다."
}
7. 조회 APIGET /api/jobs — 직무 목록GET /api/departments — 학과 목록GET /api/jobs/:id/ncs — 직무별 NCS 능력단위프론트 연동 주요 변경 및 주의사항 요약점수 스케일 변경 (0 ~ 20점 만점)백엔드 평가 점수가 20점 만점으로 변경되었습니다.프론트엔드 UI 렌더링 시 기존에 존재하던 score * 5 연산 및 100점 만점 고정 텍스트를 20점 만점 기준으로 맞춰주세요.추가 시간 감점 기준 변경extraTimeUsed 감점이 20점 스케일에 맞추어 1회당 1점, 최대 2점 감점으로 조정되었습니다.avgScore 파싱history·heatmap에서 전달되는 avgScore는 DB 소수점 연산으로 인해 문자열로 리턴되므로 반드시 Number(avgScore) 로 파싱해 사용하세요.
