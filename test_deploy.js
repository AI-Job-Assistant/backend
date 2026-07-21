async function main() {
  const BASE = "https://jobcoach-backend-e0yl.onrender.com";

  // 새 학번으로 회원가입
  const signupRes = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: "20259999",
      name: "배포테스트",
      departmentId: 638,
      email: "20259999@sungshin.ac.kr",
      password: "12345678",
    }),
  });
  console.log("회원가입:", JSON.stringify(await signupRes.json(), null, 2));

  // 로그인
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: "20259999", password: "12345678" }),
  });
  console.log("로그인:", JSON.stringify(await loginRes.json(), null, 2));
}
main();