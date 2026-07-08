async function main() {
  const res = await fetch("http://localhost:5000/api/interview/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
  questionId: 26,
  question: "데이터 아키텍처 구축 계획을 수립할 때 기술 참조 모델과 데이터 아키텍처 구성요소를 어떻게 고려하시나요?",
  answer: "저는 데이터 아키텍처 구축 계획을 수립할 때 기술 참조 모델을 최대한 고려한다.",
  questionType: "직무기술형",
}),
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
main();