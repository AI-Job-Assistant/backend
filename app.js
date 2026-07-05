require('dotenv').config();

const express = require('express');
const cors = require('cors');

const db = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const app = express();

const userRouter = require('./domains/users/user.router');
const authRouter = require('./domains/users/auth.router');

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS result');

    res.json({
      success: true,
      message: 'Server is running',
      db: rows
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.use('/api/auth', authRouter);

const jobsRouter = require('./domains/jobs/jobs.router');
app.use('/api', jobsRouter);

const interviewRouter = require('./domains/interview/interview.router');
app.use('/api/interview', interviewRouter);

const mypageRouter = require('./domains/mypage/mypage.router');
app.use('/api/mypage', mypageRouter);
app.use('/api/users', userRouter);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});