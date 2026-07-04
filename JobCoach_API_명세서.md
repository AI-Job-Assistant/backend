# JobCoach API 명세서

> 프론트엔드 ↔ 백엔드 연동 계약 문서  
> 최종 업데이트: 2026-07-04 · 작성: 백엔드 A (시현), 백엔드 B (수안)

---

## 개요

- **Base URL**: `http://localhost:5000` (배포 후 공용 주소로 교체)
- **응답 형식**: JSON
- **인증**: 현재 미적용. 마이페이지 API는 지금은 전체 데이터 기준으로 응답한다. 추후 JWT 연동 시 userId 기반 개인별 필터 추가 예정 (BE B 담당).
+ JWT 인증 적용. 로그인/회원가입 성공 시 토큰 발급. 인증이 필요한 API는 `Authorization: Bearer <token>` 헤더 사용.

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

## 8. 회원가입

**POST** `/api/auth/signup`

학번, 이름, 학과, 이메일, 비밀번호를 입력받아 회원 정보를 저장하고 JWT 토큰을 발급한다.

**요청 Body**

```json
{
  "studentId": "20241234",
  "name": "홍길동",
  "departmentId": 1,
  "email": "20241234@sungshin.ac.kr",
  "password": "12345678"
}
```

- `studentId`: 학번, 8자리 숫자
- `name`: 사용자 이름
- `departmentId`: 학과 ID
- `email`: 이메일
- `password`: 비밀번호, 8자 이상

**응답 201**

```json
{
  "success": true,
  "data": {
    "token": "eyJ...",
    "user": {
      "id": 1,
      "studentId": "20241234",
      "name": "홍길동",
      "email": "20241234@sungshin.ac.kr",
      "departmentId": 1
    }
  }
}
```

**에러**

필수 입력값 누락:

```json
{
  "success": false,
  "error": "필수 입력값이 누락되었습니다."
}
```

학번 형식 오류:

```json
{
  "success": false,
  "error": "학번은 8자리 숫자여야 합니다."
}
```

비밀번호 길이 오류:

```json
{
  "success": false,
  "error": "비밀번호는 8자 이상이어야 합니다."
}
```

이미 사용 중인 학번:

```json
{
  "success": false,
  "error": "이미 사용 중인 학번입니다."
}
```

---

## 9. 로그인

**POST** `/api/auth/login`

학번과 비밀번호로 로그인하고 JWT 토큰을 발급한다.

**요청 Body**

```json
{
  "studentId": "20241234",
  "password": "12345678"
}
```

**응답 200**

```json
{
  "success": true,
  "data": {
    "token": "eyJ...",
    "user": {
      "id": 1,
      "studentId": "20241234",
      "name": "홍길동",
      "email": "20241234@sungshin.ac.kr",
      "departmentId": 1
    }
  }
}
```

**에러**

학번 또는 비밀번호 누락:

```json
{
  "success": false,
  "error": "학번과 비밀번호를 입력해주세요."
}
```

학번이 없거나 비밀번호가 틀린 경우:

```json
{
  "success": false,
  "error": "학번 또는 비밀번호가 올바르지 않습니다."
}
```

---

## 10. 내 정보 조회

**GET** `/api/users/me`

JWT 토큰을 검증한 뒤 로그인한 사용자의 정보를 반환한다.

**요청 Header**

```http
Authorization: Bearer <token>
```

**응답 200**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "studentId": "20241234",
    "name": "홍길동",
    "email": "20241234@sungshin.ac.kr",
    "departmentId": 1
  }
}
```

**에러**

토큰이 없거나 형식이 잘못된 경우:

```json
{
  "success": false,
  "error": "No token"
}
```

토큰이 유효하지 않은 경우:

```json
{
  "success": false,
  "error": "Invalid token"
}
```

---

## 프론트 연동 참고사항

1. **질문 생성** — DB 직무는 `jobId`, AI 직무(AI 엔지니어·머신러닝 엔지니어·AI 서비스 기획자 등)는 `jobName`으로 보낸다.
2. **avgScore 타입 주의** — `history`·`heatmap`의 `avgScore`는 문자열("60"), `stats`의 `avgScore`는 숫자. 헷갈리면 **항상 `Number()`로 감싸서** 쓰는 게 안전.
3. **createdAt은 UTC** → 한국시간 표시는 프론트에서 변환.
4. **questionType은 Enum과 정확히 일치** (Figma 표기와 다름).
5. **면접 흐름**: 질문 생성(`sessionId`·`questionId` 받기) → 답변 입력 → 답변 평가(`questionId`로 제출) → 결과 표시 → 마이페이지 누적.
6. **강점·약점 분석**은 AI 호출이라 1~3초 지연 가능 → 로딩 표시. `hasData: false`면 분석 영역 숨김 처리.
7. **마이페이지 개인화 미적용** — 현재 stats·history·heatmap·analysis는 전체 데이터 기준. 로그인 연동(BE B) 후 개인별로 바뀔 예정.
8. **프로필 영역**(데이터 분석가·신입·가입 N개월차)은 회원 정보라 **BE B 회원 API** 담당. 이 문서 범위 밖.
->  기본 회원 정보는 `GET /api/users/me`에서 조회한다. 데이터 분석가·신입·가입 N개월차 등 추가 프로필 정보는 추후 확장 예정.
9. **회원가입/로그인 토큰 처리** — `POST /api/auth/signup`, `POST /api/auth/login` 성공 시 `data.token`을 저장한다.
10. **인증 API 호출** — `GET /api/users/me` 같은 인증 필요 API는 Header에 `Authorization: Bearer <token>`을 포함해야 한다.

---

## 사용 가능한 직무 (프론트 직무 선택지 후보)

데이터가 충분해 깨끗한 질문이 나오는 직무들. 프론트 화면에 자유롭게 추가 가능.

| 분야 | 직무 (전달 방식) |
|---|---|
| 데이터 | 데이터 분석가 `jobId 102` · 데이터 엔지니어 `jobName` · 데이터시스템전문가 `jobId 103` |
| AI | AI 엔지니어 · 머신러닝 엔지니어 · AI 서비스 기획자 (모두 `jobName`) |
| 시스템 | 시스템소프트웨어개발자 `jobId 92` · 정보시스템운영자 `jobId 106` · 컴퓨터시스템설계·분석가 `jobId 90` |
| 보안·네트워크·게임 | 정보보안전문가 `jobId 100` · 네트워크시스템개발자 `jobId 101` · 게임프로그래머 `jobId 99` |
