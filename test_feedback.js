async function main() {
  const res = await fetch("http://localhost:5000/api/interview/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: 1,
      question: "빅데이터 서비스 운영 관리에서 ITSM과 SLA의 역할을 설명하고...",
      answer: "ITSM은 IT 서비스를 체계적으로 관리하는 프레임워크이고, SLA는 서비스 수준 합의로 가용성·응답시간 기준을 정합니다.",
      questionType: "직무기술형",
    }),
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
main();