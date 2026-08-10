const bcrypt = require('bcrypt');
const userService = require('./user.service');
const jwt = require('jsonwebtoken');
const mailService = require('../../services/mail.service');

const getAllUsers = async (req, res, next) => {
    try {
        const users = await userService.getAllUsers();

        res.json({
            success: true,
            data: users
        });
    } catch (err) {
        next(err);
    }
};

const signup = async (req, res, next) => {
    try {
        const {  studentId, name, email, password, departmentId } = req.body;

        if (!studentId || !name || !departmentId || !email || !password) {
            return res.status(400).json({
                success: false,
                error: '필수 입력값이 누락되었습니다.'
            });
        }

        if (!/^\d{8}$/.test(studentId)) {
             return res.status(400).json({
                success: false,
                error: '학번은 8자리 숫자여야 합니다.'
             });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: '비밀번호는 8자 이상이어야 합니다.'
            });
        }

        const existingUser = await userService.findByStudentId(studentId);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: '이미 사용 중인 학번입니다.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await userService.createUser({
            studentId,
            name,
            email,
            passwordHash,
            departmentId
        });

        const token = jwt.sign(
            {
                id: user.id,
                studentId: user.studentId
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '30d'
            }
        );

        res.status(201).json({
            success: true,
            data: {
                token,
                user
            }
        });
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { studentId, password } = req.body;

        if (!studentId || !password) {
            return res.status(400).json({
                success: false,
                error: '학번과 비밀번호를 입력해주세요.'
            });
        }

        const user = await userService.findByStudentId(studentId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: '학번 또는 비밀번호가 올바르지 않습니다.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: '비밀번호가 일치하지 않습니다.',
                redirectTo: 'password-reset'
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                studentId: user.studentId
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '30d'
            }
        );

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    studentId: user.studentId,
                    name: user.name,
                    email: user.email,
                    departmentId: user.departmentId
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

const getMe = async (req, res, next) => {
    try {
        const user = await userService.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: '사용자를 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (err) {
        next(err);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        const { studentId, email } = req.body;
        if (!studentId || !email) {
            return res.status(400).json({ success: false, error: '학번과 이메일을 입력해주세요.' });
        }

        const user = await userService.findByStudentIdAndEmail(studentId, email);

        // 계정 존재 여부를 숨기기 위해 있든 없든 항상 같은 응답
        const genericResponse = {
            success: true,
            data: { message: '입력한 정보와 일치하는 계정이 있다면 비밀번호 재설정 이메일을 발송했습니다.' },
        };

        if (!user) return res.json(genericResponse);

        const resetToken = jwt.sign(
            { id: user.id, purpose: 'password-reset' },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

        await mailService.sendPasswordResetEmail({ email: user.email, resetUrl });
        return res.json(genericResponse);
    } catch (err) {
        next(err);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, error: '재설정 토큰과 새 비밀번호를 입력해주세요.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: '새 비밀번호는 8자 이상이어야 합니다.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ success: false, error: '비밀번호 재설정 링크가 만료되었거나 유효하지 않습니다.' });
        }
        if (decoded.purpose !== 'password-reset') {
            return res.status(401).json({ success: false, error: '유효하지 않은 재설정 토큰입니다.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        const updated = await userService.updatePassword(decoded.id, passwordHash);
        if (!updated) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        return res.json({ success: true, data: { message: '비밀번호가 성공적으로 변경되었습니다.' } });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAllUsers,
    signup,
    login,
    getMe,
    forgotPassword,
    resetPassword
};
