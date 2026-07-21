async function main() {
  const res = await fetch("http://localhost:5000/api/interview/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: 1,
      question: "데이터 분석 경험을 말해주세요.",
      answer: "파이썬 pandas로 3개월간 매출 데이터를 분석해서 이상치를 찾고 리포트를 만든 경험이 있습니다.",
      questionType: "직무기술형",
    }),
  });
  
  console.log(JSON.stringify(await res.json(), null, 2));
}

main();