# JobCoach(새싹) API 명세서

**프론트엔드 ↔ 백엔드 연동 계약 문서**
최종 업데이트: 2026-08-13 · 작성: 백엔드 A (박시현)

> NCS 기반 AI 모의면접 시뮬레이터. 직무 선택 → AI 질문 생성 → 답변 → AI 채점 → 성장 추적.

---

## 1. 개요 & 기본 설정

- **Base URL (배포):** `https://jobcoach-backend-e0yl.onrender.com`
- **Base URL (로컬):** `http://localhost:5000`
- **프론트 배포:** `https://sprout-interview.web.app`
- **응답 형식:** JSON

! **Render 슬립 안내:** 무료 플랜은 15분 미사용 시 서버가 잠듭니다. 첫 호출은 30초~1분 소요될 수 있으니 시연 전 미리 한 번 호출해 깨워두세요.

**인증 (JWT):**
- 요청 헤더에 `Authorization: Bearer <토큰>` 필수 (없으면 401). 토큰 유효기간 **30일**.
- 마이페이지 API(stats/history/heatmap/analysis)는 로그인 사용자 본인 데이터만 응답.
- ! **[중요]** 면접 API(questions/feedback) 호출 시에도 반드시 JWT를 포함해야 세션에 userId가 기록되어 마이페이지 이력에 반영됩니다. (미포함 시 userId=null로 저장되어 이력 누락)

---

## 2. 공통 Enum 값 (Exact Match)

| 구분 | 값 | 비고 |
|------|----|----|
| `questionType` | `경험행동형` · `직무기술형` · `상황판단형` | Figma 표기와 다를 수 있음, 정확히 일치 필요 |
| `interviewStyle` | `일반` · `압박` | 생략 시 `일반` |
| `mode` | `텍스트` · `스피킹` · `도전` | 생략 시 `텍스트` |

! 백엔드 문자열 파싱이 엄격하므로 오탈자 없이 위 값과 100% 일치시켜 전송.

---

## 3. 면접 API

### 3.1 질문 생성 — `POST /api/interview/questions`

직무·질문 유형에 따라 NCS 기반 질문 5개(도전 모드는 1개)를 생성하고 세션을 저장.

**Request Body** — `jobId` 또는 `jobName` 중 하나 필수

```json
{ "jobId": 102, "questionType": "직무기술형" }
```
또는
```json
{ "jobName": "AI 엔지니어", "questionType": "직무기술형" }
```

**선택 파라미터:**
- `mode`: `"스피킹"` / `"텍스트"` / `"도전"` (이력 뱃지용)
- `interviewStyle`: `"압박"` (압박 면접)
- `sessionType`: `"challenge"` (도전 모드 - 질문 1개, 통계 제외)
- `count`: `1` (도전 모드용)

> 도전 모드는 `sessionType:"challenge"`, `mode:"도전"`, `count:1` 중 하나만 보내도 자동 처리 (셋 다 같은 결과). 정식 면접(5문제)은 이 파라미터를 아무것도 안 보내면 됨.

**Response 200:**
```json
{
  "sessionId": 1,
  "jobName": "데이터분석가(빅데이터분석가)",
  "questionType": "직무기술형",
  "questions": [
    { "id": 1, "orderNo": 1, "content": "질문 내용 1..." }
  ]
}
```
`sessionId`와 각 질문 `id`는 답변 채점 시 사용하므로 저장 필요.

---

### 3.2 답변 채점 — `POST /api/interview/feedback`

**Request Body:**
```json
{
  "questionId": 1,
  "question": "질문 내용",
  "answer": "사용자 답변",
  "questionType": "직무기술형",
  "sessionId": 1,
  "smileCount": 5,          // [스피킹] 선택
  "eyeContactRatio": 0.7,   // [스피킹] 선택 (0~1)
  "extraTimeUsed": 1        // [압박] 선택 (추가시간 횟수 0/1/2)
}
```
`extraTimeUsed`: 추가 시간 1회당 1점 감점(최대 2점). `penalty` 필드와 개선지표에 자동 반영.

#### 점수 체계
- **각 문제 20점 만점** — `score`는 0~20 정수
- **총점 100점** — 5문제 × 20점. 총점은 프론트에서 5개 `score` 합산
- **도전 모드**: 질문 1개(최대 20점)라 백엔드가 **응답 점수를 ×5 해서 100점 스케일로 반환** (12점→60점). DB엔 20점 원본 저장 (통계 안 꼬임)
  - ! **프론트 주의**: 도전 모드 점수는 백엔드가 이미 ×5 했으므로 **프론트에서 다시 ×5 하면 안 됨** (중복 시 450점 등 발생). ×5는 백엔드에서만.

#### 채점 기준 (내용 기준, 0~20점)
| 점수 | 기준 |
|------|------|
| **0** | 답변 아님 — 무의미한 입력("ㅇㅇㅇ"), 무관한 문구·UI 텍스트, 상투적 답변("열심히 하겠습니다") |
| **5~7** | 얕은 답 — 구체적 상황·수치·방법 없음 (길어도 동일) |
| **8~10** | 구체적 디테일 하나 있으나 얕음 |
| **11~13** | 내용·구조 있으나 결과 미비 |
| **14~17** | 상황+행동+결과 (STAR 거의 완성) |
| **18~20** | 수치·결과까지 포함한 완성형 STAR |

> 채점은 먼저 유효성 게이트로 "실제 답변인지" 판정(비유효 시 0점, strengths=[]) 후 통과한 답변에만 구간 적용. 길이만으로는 점수를 주지 않음.

**방어 로직:**
- 빈 답변 → 400 없이 200으로 0점 처리 (Groq 호출 안 함)
- 명백한 비답변/placeholder → 코드에서 0점 (Groq 호출 안 함)
- 한자 포함/JSON 파싱 실패 → 최대 6회 재시도(점진적 대기), 최종 실패 시 기본 피드백(0점+지연안내)으로 폴백 (서버 500 안 남)

**Response 200 (일반):**
```json
{
  "answerId": 1,
  "questionType": "직무기술형",
  "score": 16,
  "penalty": 0,
  "strengths": ["구체적인 사례로 설명함", "측정 가능한 결과 제시"],
  "improvements": ["팀 협력 언급 부족"],
  "suggestion": "상황과 결과를 조금 더 구체적으로 보완해 보세요.",
  "modelAnswer": "이전 프로젝트에서 ... 처리 지연을 5초에서 0.5초로 줄였습니다."
}
```

**Response 200 (빈 답변):**
```json
{
  "answerId": 11, "score": 0, "penalty": 0, "strengths": [],
  "improvements": ["답변을 입력하지 않았습니다.", "시간 내에 답변 작성 연습이 필요합니다."],
  "suggestion": "이 질문에 답변하지 않았습니다. 짧더라도 생각을 정리해 답변해 보세요.",
  "modelAnswer": "답변이 없어 모범답안을 제공하지 않습니다."
}
```

---

### 3.3 면접 완료 — `POST /api/interview/complete` (auth)

세션을 완료 처리. 요약 통계는 완료된 세션만 집계. (제출하기 버튼 시 호출)

```json
// Request
{ "sessionId": 1 }
// Response
{ "sessionId": 1, "completed": true }
```

---

### 3.4 세션 결과 조회 — `GET /api/interview/result/:sessionId` (auth)

한 세션의 질문·답변·채점 결과 조회. (도전 모드는 각 문제 score가 ×5되어 반환)

```json
{
  "session": { "id": 1, "jobName": "데이터 엔지니어", "questionType": "직무기술형", "mode": "텍스트", "completed": 1, "createdAt": "..." },
  "results": [
    { "questionId": 1, "orderNo": 1, "question": "...", "answer": "...", "score": 16, "strengths": ["..."], "improvements": ["..."], "suggestion": "...", "modelAnswer": "..." }
  ]
}
```

! **프론트 주의:** 이력 클릭으로 결과 조회 시 **Base URL을 반드시 붙일 것**. 상대경로만 쓰면 index.html이 반환됨.

---

## 4. 마이페이지 API (모두 auth 필요)

### 4.1 요약 통계 — `GET /api/mypage/stats`
```json
{ "totalSessions": 12, "avgScore": 78, "monthlyChange": 11, "goal": "데이터 엔지니어로 취업하기" }
```
- `avgScore`: 세션별 총점(100점 기준)의 평균
- `monthlyChange`: 이번 달 평균 − 지난달 평균 (한쪽 데이터 없으면 0)
- `goal`: 별도 GET 불필요, 여기서 함께 반환
- ! 도전 모드는 통계(총횟수·평균)에서 **제외** — 정식 면접만 집계

### 4.2 최근 이력 — `GET /api/mypage/history`
최근 10개 반환.
```json
[
  { "id": 1, "jobName": "데이터 엔지니어", "questionType": "직무기술형", "mode": "텍스트",
    "createdAt": "...", "avgScore": "78.0000", "durationMin": 4,
    "smileCount": 5, "eyeContactRatio": "0.700", "isIncomplete": false }
]
```
- `avgScore`: 해당 면접 **총점(100점)**. 첫 문항 점수 아님. **도전 모드는 ×5 적용됨**
- ! `avgScore`, `eyeContactRatio`는 **문자열**로 리턴 → 프론트에서 `Number()` 파싱 필수
- `isIncomplete`: 미완료 뱃지용. 미완결 세션은 avgScore/durationMin이 null일 수 있음

### 4.3 잔디(히트맵) — `GET /api/mypage/heatmap`
전체 날짜별 기록 (LIMIT 없음). 잔디는 history 아닌 이 API로 그려야 전체 표시.
```json
[ { "date": "2026-06-22", "sessionCount": 1, "avgScore": "78.0000" } ]
```
! `avgScore`는 `Number()` 파싱 필요.

### 4.4 강약점 AI 분석 — `GET /api/mypage/analysis`
누적 피드백을 AI가 종합 분석.
```json
{
  "hasData": true, "basedOn": 24,
  "topStrengths": ["구체적 문제해결 과정 기술", "측정 가능한 성과 제시"],
  "topWeaknesses": ["팀 협업 과정 설명 부족"],
  "summary": "기술 역량은 우수하나 협업 경험을 구체화하면 더 좋습니다."
}
```
! Groq 호출로 3~8초 소요 → 다른 마이페이지 API와 `Promise.all`로 묶지 말고 **별도 로딩** 권장. `basedOn`은 피드백 개수 → "답변 N개 기반"으로 표기.

### 4.5 목표 저장 — `PUT /api/mypage/goal`
```json
// Request
{ "goal": "데이터 엔지니어로 취업하기" }   // 100자 이내
// Response
{ "goal": "데이터 엔지니어로 취업하기" }
```
> 저장은 이 엔드포인트, 불러오기는 `/api/mypage/stats`의 `goal` 필드.

---

## 5. 조회용 공통 API

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/api/jobs` | GET | 전체 직무 목록 |
| `/api/departments` | GET | 전체 학과 목록 |
| `/api/jobs/:id/ncs` | GET | 특정 직무의 NCS 능력단위 목록 |

---

## 6. 프론트 연동 체크리스트

- **점수 스케일**: 각 문항 20점 만점, 총점은 5개 합산 100점. **도전 모드는 백엔드가 이미 ×5했으니 프론트에서 재차 ×5 금지** (중복 시 450점 발생)
- **숫자 파싱**: history·heatmap의 `avgScore`, `eyeContactRatio`는 문자열 → `Number()` 필수
- **JWT 필수**: questions·feedback 호출에도 Authorization 헤더 포함 (이력 누락 방지)
- **결과/이력 조회 Base URL**: 상대경로만 쓰면 index.html 반환됨
- **강약점 분석 별도 로딩**: analysis는 느리므로 분리

---

## 7. 에러 응답

| 코드 | 상황 |
|------|------|
| 400 | 잘못된 요청 (필수 필드 누락) |
| 401 | 인증 실패 / 토큰 만료 |
| 404 | 존재하지 않는 리소스 (세션·직무) |
| 500 | 서버 오류 (Groq 장애 시 기본 피드백 폴백) |

---

## 8. 기술 참고

- 질문 생성: Groq `llama-3.1-8b-instant` / 채점: `llama-3.3-70b-versatile`
- 채점 = 유효성 게이트(STEP1) → 점수 구간(STEP2) 2단계
- 인증(로그인/회원가입)은 별도 담당(백엔드 B). 로그인 성공 시 JWT(30일) 발급
