# JobCoach API 명세서

> 프론트엔드 ↔ 백엔드 연동 계약 문서  
> 최종 업데이트: 2026-06-23 · 작성: 백엔드 A (시현)

---

## 개요

- **Base URL**: `http://localhost:5000` (배포 후 공용 주소로 교체)
- **응답 형식**: JSON
- **인증**: 현재 미적용. 마이페이지 API는 지금은 **전체 데이터 기준**으로 응답한다. 추후 JWT 연동 시 `userId` 기반 개인별 필터 추가 예정 (BE B 담당).

## 공통 Enum

| 항목 | 값 |
|---|---|
| `questionType` | `경험행동형` · `직무기술형` · `상황판단형` |

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
  "questionType": "직무기술형"
}
```

**응답 200**

```json
{
  "answerId": 1,
  "questionType": "직무기술형",
  "score": 60,
  "strengths": ["잘한 점 1", "잘한 점 2"],
  "improvements": ["개선점 1", "개선점 2", "개선점 3"],
  "suggestion": "보완 방향 제안..."
}
```

- `score`: 0~100 (숫자형)

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
    "createdAt": "2026-06-22T09:13:41.000Z",
    "avgScore": "60",
    "durationMin": 4
  }
]
```

- `durationMin`: 면접 시작(질문 생성)부터 마지막 답변 제출까지 걸린 시간 (분, 숫자형)
- ⚠️ `avgScore`는 **문자열**("60")로 옴 → 프론트에서 `Number()` 변환 필요
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

## 6. 조회 API (기존 구현)

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
6. **마이페이지 개인화 미적용** — 현재 stats·history·heatmap은 전체 데이터 기준. 로그인 연동(BE B) 후 개인별로 바뀔 예정.
7. **프로필 영역**(데이터 분석가·신입·가입 N개월차)은 회원 정보라 **BE B 회원 API** 담당. 이 문서 범위 밖.

---

## 사용 가능한 직무 (프론트 직무 선택지 후보)

데이터가 충분해 깨끗한 질문이 나오는 직무들. 프론트 화면에 자유롭게 추가 가능.

| 분야 | 직무 (전달 방식) |
|---|---|
| 데이터 | 데이터 분석가 `jobId 102` · 데이터 엔지니어 `jobName` · 데이터시스템전문가 `jobId 103` |
| AI | AI 엔지니어 · 머신러닝 엔지니어 · AI 서비스 기획자 (모두 `jobName`) |
| 시스템 | 시스템소프트웨어개발자 `jobId 92` · 정보시스템운영자 `jobId 106` · 컴퓨터시스템설계·분석가 `jobId 90` |
| 보안·네트워크·게임 | 정보보안전문가 `jobId 100` · 네트워크시스템개발자 `jobId 101` · 게임프로그래머 `jobId 99` |
