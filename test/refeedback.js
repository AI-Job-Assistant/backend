require("dotenv").config();

const BASE = "http://localhost:5000"; // 로컬 테스트. 배포 확인은 https://jobcoach-backend-e0yl.onrender.com

async function main() {
  const res = await fetch(`${BASE}/api/interview/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: 1108,          // ← 다시 채점할 질문 id
      question: "질문 내용 그대로",  // ← 그 질문 텍스트
      answer: "다시 채점할 답변",     // ← 답변
      questionType: "경험행동형",     // ← 유형
      sessionId: 270,             // ← 세션 id
    }),
  });
  const data = await res.json();
  console.log("점수:", data.score);
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e => console.error("❌", e.message));