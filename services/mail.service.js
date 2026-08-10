const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

const sendPasswordResetEmail = async ({ email, resetUrl }) => {
  await transporter.sendMail({
    from: `"새싹" <${process.env.MAIL_USER}>`,
    to: email,
    subject: '[새싹] 비밀번호 재설정 안내',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>비밀번호 재설정</h2>
        <p>아래 버튼을 눌러 새 비밀번호를 설정해주세요. (15분 유효)</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background-color:#35633f;color:white;text-decoration:none;border-radius:6px;">비밀번호 재설정</a>
        <p>본인이 요청하지 않았다면 이 이메일을 무시해주세요.</p>
      </div>
    `,
  });
};

module.exports = { sendPasswordResetEmail };