async function main() {
  const res = await fetch("http://localhost:5000/api/interview/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: 1,
      question: "데이터 분석 경험을 말해주세요.",
      answer: "파이썬으로 매출 데이터를 분석한 경험이 있습니다.",
      questionType: "직무기술형",
      sessionId: 1,           // ← 카메라 값을 저장할 세션
      smileCount: 5,          // ← 가짜 웃음 횟수
      eyeContactRatio: 0.7,   // ← 가짜 응시율 (70%)
    }),
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
main();