# JobCoach Backend API

> NCS 기반 AI 모의면접 시뮬레이터 (프론트명: **새싹**)

성신여대 교내 경진대회 출품작. 직무 선택 → AI 질문 생성 → 답변 → AI 채점 → 마이페이지 통계까지의 흐름을 제공하는 REST API 서버입니다.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 런타임 | Node.js + Express |
| 데이터베이스 | MySQL (로컬 개발 / Railway 클라우드) |
| AI | Groq API — 질문 생성 `llama-3.1-8b-instant`, 채점 `llama-3.3-70b-versatile` |
| 인증 | JWT (`Authorization: Bearer <token>`) |
| 배포 | Render (백엔드) / Firebase Hosting (프론트) |

**배포 URL**

- 백엔드: `https://jobcoach-backend-e0yl.onrender.com`
- 프론트: `https://sprout-interview.web.app`

> Render 무료 티어는 15분 미사용 시 슬립 상태가 됩니다. 슬립에서 깨어나는 첫 요청은 30~50초가 걸릴 수 있습니다.

---

## 공통 사항

**Base URL**

```
https://jobcoach-backend-e0yl.onrender.com
```

**인증**

인증이 필요한 엔드포인트는 요청 헤더에 JWT를 포함해야 합니다.

```
Authorization: Bearer <accessToken>
```

토큰 만료 시 `401`이 반환됩니다. 토큰 유효기간은 30일입니다.

**응답 형식**

모든 응답은 JSON입니다. 아래 표기에서 `(auth)`는 인증이 필요한 엔드포인트를 의미합니다.

---

## 면접 (Interview)

### 1. 질문 생성

선택한 직무·질문 유형에 맞춰 NCS 기반 면접 질문을 생성하고 세션을 시작합니다.

```
POST /api/interview/questions
```

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jobId` | number | △ | 직무 ID. `jobName`이 없으면 필수 |
| `jobName` | string | △ | 직무명. `jobId`가 없으면 필수 |
| `questionType` | string | O | `경험행동형` \| `직무기술형` \| `상황판단형` |
| `interviewStyle` | string | X | `압박` 지정 시 압박면접 모드 |
| `mode` | string | X | `텍스트` \| `스피킹` \| `도전` (이력 뱃지 구분용) |
| `sessionType` | string | X | `challenge` 지정 시 도전모드(질문 1개, 통계 제외) |
| `count` | number | X | `1` 지정 시 도전모드와 동일 처리 |
| `userId` | number | X | 세션에 연결할 사용자 ID |

**Response `200`**

```json
{
  "sessionId": 123,
  "jobName": "데이터 엔지니어",
  "questionType": "직무기술형",
  "questions": [
    { "id": 1, "orderNo": 1, "content": "대용량 로그를 수집한다면 어디서부터 시작하시겠어요?" }
  ]
}
```

일반 모드는 질문 5개, 도전모드(`sessionType: "challenge"` 또는 `count: 1`)는 1개를 반환합니다.

---

### 2. 답변 채점

한 문항의 답변을 AI가 채점하고 피드백을 반환합니다.

```
POST /api/interview/feedback
```

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `questionId` | number | O | 질문 ID |
| `question` | string | O | 질문 내용 |
| `answer` | string | O | 답변 내용 (빈 문자열이면 채점 없이 0점) |
| `questionType` | string | O | 질문 유형 |
| `sessionId` | number | X | 세션 ID |
| `extraTimeUsed` | number | X | 추가 시간 사용 횟수 (1회당 1점 감점, 최대 2회) |
| `smileCount` | number | X | 표정(웃음) 감지 횟수 |
| `eyeContactRatio` | number | X | 응시율 |

**Response `200`**

```json
{
  "answerId": 456,
  "questionType": "직무기술형",
  "score": 16,
  "penalty": 0,
  "strengths": ["구체적인 사례를 들어 설명했습니다."],
  "improvements": ["수치화된 결과를 덧붙이면 더 좋습니다."],
  "suggestion": "상황과 결과를 조금 더 구체적으로 보완해 보세요.",
  "modelAnswer": "이전 프로젝트에서 ... 처리 지연을 5초에서 0.5초로 줄였습니다."
}
```

**채점 기준 (20점 만점)**

| 점수 | 기준 |
|------|------|
| `0` | 답변이 아님 (무의미한 입력, 질문과 무관한 문구, 상투적 답변) |
| `5~7` | 답은 했으나 구체성 없음 (구체 상황·수치·방법 없음) |
| `8~10` | 구체적 디테일 하나 있음, 얕음 |
| `11~13` | 내용·구조 있으나 결과 미비 |
| `14~17` | 상황+행동+결과 (STAR 거의 완성) |
| `18~20` | 수치·결과까지 포함한 완성형 STAR |

> `penalty`는 추가 시간 사용에 따른 감점이며 최종 `score`에 이미 반영되어 있습니다.

---

### 3. 면접 완료 처리 `(auth)`

세션을 완료 상태로 표시합니다. 통계(`getStats`) 집계는 완료된 세션만 대상으로 합니다.

```
POST /api/interview/complete
```

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `sessionId` | number | O | 완료 처리할 세션 ID |

**Response `200`**

```json
{ "sessionId": 123, "completed": true }
```

---

### 4. 세션 결과 조회 `(auth)`

한 세션의 모든 질문·답변·채점 결과를 조회합니다.

```
GET /api/interview/result/:sessionId
```

**Response `200`**

```json
{
  "session": {
    "id": 123,
    "jobName": "데이터 엔지니어",
    "questionType": "직무기술형",
    "mode": "텍스트",
    "completed": 1,
    "createdAt": "2026-08-04T10:00:00.000Z"
  },
  "results": [
    {
      "questionId": 1,
      "orderNo": 1,
      "question": "대용량 로그를 수집한다면 어디서부터 시작하시겠어요?",
      "answer": "...",
      "score": 16,
      "strengths": ["..."],
      "improvements": ["..."],
      "suggestion": "...",
      "modelAnswer": "..."
    }
  ]
}
```

> 프론트 주의: 이력 클릭으로 결과를 조회할 때 Base URL을 반드시 붙여야 합니다. 상대경로만 쓰면 `index.html`이 반환됩니다.

---

## 마이페이지 (My Page)

### 5. 통계 조회 `(auth)`

```
GET /api/mypage/stats
```

**Response `200`**

```json
{
  "totalSessions": 12,
  "avgScore": 78,
  "monthlyChange": 5,
  "goal": "데이터 엔지니어로 취업하기"
}
```

| 필드 | 설명 |
|------|------|
| `totalSessions` | 완료된 세션 수 |
| `avgScore` | 세션별 총점(SUM)의 평균 (100점 기준) |
| `monthlyChange` | 전월 대비 변화 |
| `goal` | 사용자 목표 (별도 GET 불필요, 여기서 함께 반환) |

---

### 6. 이력 조회 `(auth)`

```
GET /api/mypage/history
```

최근 면접 이력을 최대 10개 반환합니다.

**Response `200`**

```json
[
  {
    "sessionId": 123,
    "jobName": "데이터 엔지니어",
    "avgScore": 78,
    "mode": "텍스트",
    "isIncomplete": false,
    "createdAt": "2026-08-04T10:00:00.000Z"
  }
]
```

| 필드 | 설명 |
|------|------|
| `avgScore` | 해당 면접의 총점(SUM, 최대 100). **첫 문항 점수가 아님** |
| `mode` | `텍스트` \| `스피킹` \| `도전` (뱃지 표시용) |
| `isIncomplete` | 미완료 세션 여부 (미완료 뱃지용) |

---

### 7. 잔디(히트맵) 조회 `(auth)`

```
GET /api/mypage/heatmap
```

전체 날짜별 면접 기록을 반환합니다 (LIMIT 없음).

> 프론트 주의: 잔디는 `history`(10개 제한)가 아니라 이 `heatmap` API로 그려야 전체 기록이 표시됩니다.

---

### 8. 강약점 분석 `(auth)`

```
GET /api/mypage/analysis
```

누적된 피드백을 AI가 분석해 강점·약점을 요약합니다. Groq 호출을 포함하므로 응답이 3~8초 걸릴 수 있습니다.

**Response `200`**

```json
{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "basedOn": 24
}
```

| 필드 | 설명 |
|------|------|
| `basedOn` | 분석에 사용된 피드백(답변) 개수 |

> 프론트 주의: 이 API만 Groq 호출로 느립니다. 다른 마이페이지 API와 `Promise.all`로 묶지 말고 별도 로딩 처리를 권장합니다. `basedOn`은 피드백 개수이므로 "답변 N개 기반"으로 표기하세요.

---

### 9. 목표 저장 `(auth)`

```
PUT /api/mypage/goal
```

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `goal` | string | O | 사용자 목표 (100자 이내) |

**Response `200`**

```json
{ "goal": "데이터 엔지니어로 취업하기" }
```

> 저장은 이 엔드포인트, 불러오기는 `GET /api/mypage/stats`의 `goal` 필드를 사용합니다.

---

## 인증 (Auth) — 담당: Backend B

로그인·회원가입·유저 관련 엔드포인트는 별도 담당자가 관리합니다. 로그인 성공 시 JWT(유효기간 30일)를 발급받아 이후 요청의 `Authorization` 헤더에 사용합니다.

---

## 에러 응답

| 상태 코드 | 상황 |
|-----------|------|
| `400` | 잘못된 요청 (필수 필드 누락 등) |
| `401` | 인증 실패 / 토큰 만료 |
| `404` | 존재하지 않는 리소스 (세션·직무 등) |
| `500` | 서버 오류 (Groq 장애 시 기본 피드백으로 폴백 처리) |

Groq API가 3회 연속 실패하면 채점은 기본 피드백을 반환합니다 (서버가 500으로 죽지 않음).

---

## 팀

| 역할 | 담당 |
|------|------|
| Backend A | 면접 세션 / 마이페이지 / AI 프롬프트 / 채점 로직 / 데이터 |
| Backend B | 인증 / 유저 |
| Frontend | 화면 / STT / 카메라 |
