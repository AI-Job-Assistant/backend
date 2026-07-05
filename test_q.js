async function main() {
  const res = await fetch("http://localhost:5000/api/interview/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobName: "데이터 분석가",
      questionType: "직무기술형",
    }),
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
main();