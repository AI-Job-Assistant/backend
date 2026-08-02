require("dotenv").config();
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// interview.service.js의 질문 생성 프롬프트를 그대로 복사해서 테스트
const FEWSHOT = {
  "직무기술형": [
    "테스트 코드를 짜야 하는 이유에 관해서 말씀해 주세요.",
    "본인께서는 개발 능력 향상을 위해 어떤 것을 하고 계신가요?",
    "고객이 개발 기간을 촉박하게 요구하는 경우라면 어떻게 대응하시겠습니까?",
  ],
};

async function main() {
  const examples = FEWSHOT["직무기술형"];
  const fewshotText = examples.map((q) => `- ${q}`).join("\n");

  const prompt = `You are an experienced Korean job interviewer conducting a real interview for the role of "AI 엔지니어".
Generate exactly 5 interview questions.
Question type: 직무 지식과 기술 역량을 확인하는 질문

Real interview questions of this type (match this natural spoken tone):
${fewshotText}

Rules:
- Write ALL questions in Korean Hangul only. Do NOT use any Chinese characters.
- Return ONLY a JSON array of 5 strings, nothing else.`;

  const c = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
  });
  console.log("=== Groq 원본 응답 ===");
  console.log(c.choices[0].message.content);
}
main();