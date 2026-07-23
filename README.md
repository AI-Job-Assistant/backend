# JobCoach API 명세서

> 프론트엔드 ↔ 백엔드 연동 계약 문서  
> 최종 업데이트: 2026-06-23 · 작성: 백엔드 A (시현)

---

## 개요

- **Base URL**: `https://jobcoach-backend-e0yl.onrender.com` (배포 완료 · Render)
  - 로컬 개발 시엔 `http://localhost:5000`
  - ⚠️ 무료 플랜이라 15분 미사용 시 서버가 잠듦 → 첫 호출이 30초~1분 느릴 수 있음(정상). 데모 전 미리 한 번 호출해 깨워둘 것.
- **응답 형식**: JSON
- **인증**: **JWT 적용 완료.** 마이페이지 API(stats·history·heatmap·analysis)는 **로그인한 사용자 본인 데이터만** 응답한다. 요청 시 헤더에 `Authorization: Bearer <토큰>` 필수 (없으면 401).
  - ⚠️ **중요**: 면접 API(질문 생성·답변 평가)도 **토큰을 함께 보내야** 세션에 `userId`가 저장되고, 그래야 마이페이지에 기록이 뜬다. 토큰 없이 면접을 보면 `userId: null`로 저장되어 마이페이지에 안 나타남.

## 공통 Enum

| 항목 | 값 |
|---|---|
| `questionType` | `경험행동형` · `직무기술형` · `상황판단형` |
| `interviewStyle` | `일반` · `압박` (생략 시 `일반`) |
| `mode` | `텍스트` · `스피킹` · `도전` (생략 시 `텍스트`) |

> ⚠️ Figma 표기("직무·기술형" 등)와 글자가 다르니, 프론트에서 보낼 땐 위 값과 **한 글자도 안 틀리게 일치**시킬 것.

---

## 1. 질문 생성

**POST** `/api/interview/questions`

직무·질문유형으로 NCS 기반 질문 5개를 생성하고, 면접 세션을 DB에 저장한다.

**요청 Body** — `jobId` 또는 `jobName` 중 하나를 보낸다.

DB에 있는 직무는 `jobId`로:

```json
{
  "jobId": 102,
  "questionType": "직무기술형"
}
```

DB에 없는 AI 직무는 `jobName`으로:

```json
{
  "jobName": "AI 엔지니어",
  "questionType": "직무기술형"
}
```

- `jobId`: DB에 있는 직무 (예: 데이터분석가 = 102)
- `jobName`: 직무명 직접 지정 (DB에 없는 AI 엔지니어·머신러닝 엔지니어 등)
- `questionType`: 위 Enum

**선택 파라미터** (안 보내면 기존 동작 그대로 — 하위 호환)

| 필드 | 값 | 설명 |
|---|---|---|
| `interviewStyle` | `"압박"` | 압박 면접. 더 날카롭고 파고드는, 근거를 요구하는 질문이 생성됨. 생략하면 일반 난이도 |
| `count` | `1` | 질문을 1개만 생성 (**도전 모드**용). 생략하면 5개 |
| `mode` | `"스피킹"` / `"텍스트"` | 이 세션이 어떤 화면에서 진행됐는지 기록. 마이페이지 이력에 표시됨 |

**모드별 요청 예시**

```json
// 압박 면접
{ "jobName": "AI 엔지니어", "questionType": "직무기술형", "interviewStyle": "압박" }

// 도전 모드 (질문 1개)  → mode는 자동으로 "도전"이 됨
{ "jobName": "AI 엔지니어", "questionType": "경험행동형", "count": 1 }

// 스피킹 면접
{ "jobName": "AI 엔지니어", "questionType": "직무기술형", "mode": "스피킹" }
```

> **도전 모드 주의** — `count: 1`을 보내면 세션이 자동으로 `mode: "도전"`으로 저장되고, 마이페이지의 **총 연습 횟수·평균 점수에서 제외**된다 (이력·잔디에는 표시됨).

**응답 200**

```json
{
  "sessionId": 1,
  "jobName": "데이터분석가(빅데이터분석가)",
  "questionType": "직무기술형",
  "questions": [
    { "id": 1, "orderNo": 1, "content": "질문 내용..." },
    { "id": 2, "orderNo": 2, "content": "..." }
  ]
}
```

> `sessionId`와 각 질문 `id`는 답변 제출 시 필요하니 프론트에서 보관할 것.

---

## 2. 답변 평가

**POST** `/api/interview/feedback`

답변을 질문유형별 기준(STAR / 기술 / 판단)으로 평가하고, 점수·피드백을 DB에 저장한다.

**요청 Body**

```json
{
  "questionId": 1,
  "question": "질문 내용",
  "answer": "사용자 답변",
  "questionType": "직무기술형",
  "sessionId": 1,
  "smileCount": 5,
  "eyeContactRatio": 0.7
}
```

- `sessionId`·`smileCount`·`eyeContactRatio`: **스피킹(카메라) 면접에서만** 함께 전송. 보내면 해당 세션에 카메라 지표가 저장됨. 텍스트 면접은 생략 가능(저장 단계 자동 skip).
- `eyeContactRatio`: 0~1 사이 소수 (예: 0.7 = 70%)

**응답 200**

```json
{
  "answerId": 1,
  "questionType": "직무기술형",
  "score": 60,
  "strengths": ["잘한 점 1", "잘한 점 2"],
  "improvements": ["개선점 1", "개선점 2", "개선점 3"],
  "suggestion": "보완 방향 제안...",
  "modelAnswer": "이 질문에 대한 모범답안 예시 (3~4문장, 경험행동형이면 STAR 구조)"
}
```

- `score`: 0~100 (숫자형)
- `modelAnswer`: 해당 질문의 모범답안 예시. 사용자 답변이 부실해도 질문 기반으로 이상적인 답을 생성 → "이렇게 답하면 좋다"를 보여주는 용도. 화면에 접기/펼치기로 표시 권장.

---

## 3. 마이페이지 — 통계

**GET** `/api/mypage/stats`

**응답 200**

```json
{
  "totalSessions": 12,
  "avgScore": 78,
  "monthlyChange": 12
}
```

- `totalSessions`: 총 연습 횟수 (숫자형)
- `avgScore`: 전체 평균 점수 (숫자형)
- `monthlyChange`: 이번 달 평균 − 지난달 평균 (숫자형)
  - **양수(+12, 상승) / 음수(-5, 하락) 둘 다 가능** → 프론트에서 부호 보고 색·화살표 처리
  - 이번 달 또는 지난달 데이터가 없으면 `0`
- ⚠️ **도전 모드(`mode: "도전"`) 세션은 이 통계에서 제외**된다. 총 연습 횟수·평균 점수 모두 해당. (단, 이력·잔디에는 표시됨)

---

## 4. 마이페이지 — 최근 이력

**GET** `/api/mypage/history`

세션별 직무·유형·날짜·평균 점수·소요시간을 최근순(최대 10개)으로 반환한다.

**응답 200**

```json
[
  {
    "id": 1,
    "jobName": "데이터 엔지니어",
    "questionType": "직무기술형",
    "mode": "텍스트",
    "createdAt": "2026-06-22T09:13:41.000Z",
    "avgScore": "60",
    "durationMin": 4,
    "smileCount": 5,
    "eyeContactRatio": "0.700"
  }
]
```

- `mode`: 면접 종류 — `텍스트` · `스피킹` · `도전`. 이력 카드에 뱃지로 표시하면 됨
- `durationMin`: 면접 시작(질문 생성)부터 마지막 답변 제출까지 걸린 시간 (분, 숫자형)
- `smileCount`: 면접 중 웃음 횟수 (숫자형). 스피킹(카메라) 면접에서만 측정 → 텍스트 면접은 `0`
- `eyeContactRatio`: 카메라 응시율 (문자열 "0.700" = 70%) → 프론트에서 `Number()` 변환 후 ×100. 텍스트 면접은 `0`
- ⚠️ `avgScore`·`eyeContactRatio`는 **문자열**로 옴 → `Number()` 변환 필요
- ⚠️ 질문만 생성하고 답변을 안 한 세션은 `avgScore`·`durationMin`이 **`null`** 일 수 있음 → 프론트에서 방어 처리(예: "기록 없음" 표시)

---

## 5. 마이페이지 — 점수 히트맵

**GET** `/api/mypage/heatmap`

날짜별 면접 횟수·평균 점수를 반환한다. (GitHub 잔디 스타일 시각화용)

**응답 200**

```json
[
  { "date": "2026-06-22", "sessionCount": 1, "avgScore": "60" }
]
```

- `date`: `YYYY-MM-DD` (한국시간 기준 문자열)
- `sessionCount`: 그날 면접 횟수 (숫자형)
- ⚠️ `avgScore`는 여기서도 **문자열**("60")로 옴 → `Number()` 변환 필요

---

## 6. 마이페이지 — 강점·약점 AI 분석

**GET** `/api/mypage/analysis`

누적된 모든 피드백(`strengths`·`improvements`)을 종합해 반복되는 강점·약점 패턴을 AI가 분석한다.

**응답 200** (데이터 있을 때)

```json
{
  "hasData": true,
  "basedOn": 1,
  "topStrengths": ["...", "..."],
  "topWeaknesses": ["...", "..."],
  "summary": "..."
}
```

**응답 200** (면접 기록이 아직 없을 때)

```json
{
  "hasData": false,
  "message": "아직 분석할 면접 기록이 없어요. 모의면접을 먼저 진행해보세요.",
  "topStrengths": [],
  "topWeaknesses": [],
  "summary": ""
}
```

- `hasData`: 분석할 데이터 유무 → 프론트는 이 값으로 분석 영역 표시/숨김 결정
- `basedOn`: 분석에 사용된 면접(피드백) 개수. 적으면(1~2개) 분석이 얄팍할 수 있으니 화면에 "N회 기반" 표시 권장
- `topStrengths`·`topWeaknesses`: 대표 강점·약점 2~3개 배열
- `summary`: 종합 코멘트 1~2문장
- ⚠️ AI 생성이라 응답까지 1~3초 걸릴 수 있음 → 프론트에서 로딩 표시

---

## 7. 조회 API (기존 구현)

- **GET** `/api/jobs` — 직무 목록
- **GET** `/api/departments` — 학과 목록
- **GET** `/api/jobs/:id/ncs` — 직무별 NCS 능력단위

> 응답 형식은 실제 구현 확인 후 이 문서에 보완 예정.

---

## 프론트 연동 참고사항

1. **질문 생성** — DB 직무는 `jobId`, AI 직무(AI 엔지니어·머신러닝 엔지니어·AI 서비스 기획자 등)는 `jobName`으로 보낸다.
2. **avgScore 타입 주의** — `history`·`heatmap`의 `avgScore`는 문자열("60"), `stats`의 `avgScore`는 숫자. 헷갈리면 **항상 `Number()`로 감싸서** 쓰는 게 안전.
3. **createdAt은 UTC** → 한국시간 표시는 프론트에서 변환.
4. **questionType은 Enum과 정확히 일치** (Figma 표기와 다름).
5. **면접 흐름**: 질문 생성(`sessionId`·`questionId` 받기) → 답변 입력 → 답변 평가(`questionId`로 제출) → 결과 표시 → 마이페이지 누적.
6. **강점·약점 분석**은 AI 호출이라 1~3초 지연 가능 → 로딩 표시. `hasData: false`면 분석 영역 숨김 처리.
7. **마이페이지 개인화 완료** — stats·history·heatmap·analysis는 **로그인한 본인 데이터만** 응답. 모든 마이페이지 요청에 `Authorization: Bearer <토큰>` 헤더 필수. **면접 API(질문 생성·답변 평가)에도 토큰을 보내야** 세션에 userId가 저장되어 마이페이지에 뜬다.
8. **프로필 영역**(데이터 분석가·신입·가입 N개월차)은 회원 정보라 **BE B 회원 API** 담당. 이 문서 범위 밖.

---

## 사용 가능한 직무 (프론트 직무 선택지 후보)

데이터가 충분해 깨끗한 질문이 나오는 직무들. 프론트 화면에 자유롭게 추가 가능.

| 분야 | 직무 (전달 방식) |
|---|---|
| 데이터 | 데이터 분석가 `jobId 102` · 데이터 엔지니어 `jobName` · 데이터시스템전문가 `jobId 103` |
| AI | AI 엔지니어 · 머신러닝 엔지니어 · AI 서비스 기획자 (모두 `jobName`) |
| 시스템 | 시스템소프트웨어개발자 `jobId 92` · 정보시스템운영자 `jobId 106` · 컴퓨터시스템설계·분석가 `jobId 90` |
| 보안·네트워크·게임 | 정보보안전문가 `jobId 100` · 네트워크시스템개발자 `jobId 101` · 게임프로그래머 `jobId 99` |
