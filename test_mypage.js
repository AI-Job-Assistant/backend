async function main() {
  const BASE = "http://localhost:5000";

  // 1. 회원가입 (이미 있으면 에러 나는데, 그럼 로그인으로 건너뜀)
  const signupRes = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: "20250001",
      name: "테스트",
      departmentId: 1,
      email: "20250001@test.ac.kr",
      password: "12345678",
    }),
  });
  const signupData = await signupRes.json();
  console.log("회원가입:", JSON.stringify(signupData, null, 2));

  // 2. 로그인해서 토큰 받기
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: "20250001",
      password: "12345678",
    }),
  });
  const loginData = await loginRes.json();
  console.log("로그인:", JSON.stringify(loginData, null, 2));

  const token = loginData?.data?.token;
  if (!token) {
    console.log("❌ 토큰을 못 받음. 위 로그인 응답 확인.");
    return;
  }

  // 3. 토큰으로 마이페이지 stats 호출
  const statsRes = await fetch(`${BASE}/api/mypage/stats`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  console.log("마이페이지 stats:", JSON.stringify(await statsRes.json(), null, 2));
}
main();