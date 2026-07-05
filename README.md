# JobCoach Backend

AI 모의면접 서비스 JobCoach 백엔드 서버입니다.

## 담당 기능 (BE B)

- 회원가입 API
- 로그인 API
- JWT 기반 인증
- 사용자 정보 조회 API

## 기술 스택

- Node.js
- Express
- MySQL
- JWT
- bcrypt

## 프로젝트 구조

```
config/
 └── db.js

domains/
 └── users/
     ├── auth.router.js
     ├── user.router.js
     ├── user.controller.js
     └── user.service.js

middleware/
 ├── auth.js
 └── errorHandler.js

app.js
```

## 설치 방법

패키지 설치

```bash
npm install
```

## 환경 변수 설정

프로젝트 루트에 `.env` 파일 생성

```env
PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jobcoach_db

JWT_SECRET=your_secret_key
```

※ `.env` 파일은 보안상 GitHub에 업로드하지 않습니다.

## 실행 방법

```bash
npm start
```

## API 문서

자세한 API 요청/응답 형식은 아래 문서를 참고합니다.

- BE_B_API_명세서.md
- JobCoach_API_명세서.md