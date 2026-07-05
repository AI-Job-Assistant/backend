# JobCoach BE B API 명세서

> 회원 인증 API 연동 계약 문서  
> 최종 업데이트: 2026-07-05 · 작성: 백엔드 B (수안)

---

## 개요

- **Base URL**: `http://localhost:5000` (통합 후 Render 배포 주소 적용 예정)
- **응답 형식**: JSON
- **인증**: JWT 기반 인증 적용
  - 회원가입/로그인 성공 시 JWT 토큰 발급
  - 인증이 필요한 API는 요청 Header에 `Authorization: Bearer <token>` 포함

---

## 1. 회원가입

**POST** `/api/auth/signup`

사용자의 학번, 이름, 학과, 이메일, 비밀번호를 입력받아 회원 정보를 저장한다.

비밀번호는 암호화하여 저장하며, 회원가입 성공 시 JWT 토큰을 발급한다.

---

### 요청 Body

```json
{
  "studentId": "20241234",
  "name": "홍길동",
  "departmentId": 1,
  "email": "20241234@sungshin.ac.kr",
  "password": "12345678"
}
```

- `studentId`: 학번 (8자리 숫자)
- `name`: 사용자 이름
- `departmentId`: 학과 ID
- `email`: 이메일
- `password`: 비밀번호 (8자 이상)

---

### 응답 201

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1...",
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

> 발급된 `token`은 로그인 상태 유지 및 인증 API 호출 시 사용한다.

---

### 에러 응답

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

이미 존재하는 학번:

```json
{
  "success": false,
  "error": "이미 사용 중인 학번입니다."
}
```

---

## 2. 로그인

**POST** `/api/auth/login`

학번과 비밀번호를 검증하여 로그인 처리하고 JWT 토큰을 발급한다.

---

### 요청 Body

```json
{
  "studentId": "20241234",
  "password": "12345678"
}
```

- `studentId`: 가입된 학번
- `password`: 사용자 비밀번호

---

### 응답 200

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1...",
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

---

### 에러 응답

학번 또는 비밀번호 누락:

```json
{
  "success": false,
  "error": "학번과 비밀번호를 입력해주세요."
}
```

로그인 실패:

```json
{
  "success": false,
  "error": "학번 또는 비밀번호가 올바르지 않습니다."
}
```

---

## 3. 내 정보 조회

**GET** `/api/users/me`

JWT 토큰을 검증한 뒤 현재 로그인한 사용자 정보를 반환한다.

---

### 요청 Header

```http
Authorization: Bearer <token>
```

---

### 응답 200

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

---

### 에러 응답

토큰 없음:

```json
{
  "success": false,
  "error": "No token"
}
```

유효하지 않은 토큰:

```json
{
  "success": false,
  "error": "Invalid token"
}
```

---

## 프론트 연동 참고사항

1. **회원가입 / 로그인 성공 시**

응답으로 받은 JWT 토큰 저장

예:

```javascript
localStorage.setItem("token", response.data.token);
```

---

2. **로그인이 필요한 API 호출**

Header에 토큰 추가

```http
Authorization: Bearer <token>
```

---

3. **사용자 정보 사용 흐름**

회원가입 또는 로그인  
→ JWT 저장  
→ `/api/users/me` 요청  
→ 사용자 프로필 정보 표시

---

4. **마이페이지 개인화 연동 예정**

현재 마이페이지 API는 전체 데이터 기준.

JWT 적용 후 인증된 사용자 ID(`user.id`) 기준으로 개인별:

- 면접 기록
- 평균 점수
- 히트맵
- AI 분석

마이페이지 개인화는 A 파트 API와 통합 후 `req.user.id` 기준으로 필터링 예정
