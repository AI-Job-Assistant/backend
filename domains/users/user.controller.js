const bcrypt = require('bcrypt');
const userService = require('./user.service');
const jwt = require('jsonwebtoken');

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
                expiresIn: '1h'
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
                error: '학번 또는 비밀번호가 올바르지 않습니다.'
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                studentId: user.studentId
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '1h'
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

const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: '새 비밀번호는 8자 이상이어야 합니다.'
            });
        }

        const result = await userService.changePassword(
            userId,
            currentPassword,
            newPassword
        );

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        if (err.message === 'USER_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: '사용자를 찾을 수 없습니다.'
            });
        }

        if (err.message === 'CURRENT_PASSWORD_INCORRECT') {
            return res.status(401).json({
                success: false,
                error: '현재 비밀번호가 일치하지 않습니다.'
            });
        }

        if (err.message === 'SAME_AS_CURRENT_PASSWORD') {
            return res.status(400).json({
                success: false,
                error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.'
            });
        }

        console.error('비밀번호 변경 오류:', err);

        return res.status(500).json({
            success: false,
            error: '비밀번호 변경에 실패했습니다.'
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email, departmentId } = req.body;

        if (!name || !email || departmentId == null) {
            return res.status(400).json({
                success: false,
                error: '이름, 이메일, 학과 정보를 모두 입력해주세요.'
            });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return res.status(400).json({
                success: false,
                error: '올바른 이메일 형식을 입력해주세요.'
            });
        }

        const result = await userService.updateProfile(
            userId,
            {
                name,
                email,
                departmentId
            }
        );

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        if (err.message === 'USER_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: '사용자를 찾을 수 없습니다.'
            });
        }

        if (err.message === 'EMAIL_ALREADY_EXISTS') {
            return res.status(409).json({
                success: false,
                error: '이미 사용 중인 이메일입니다.'
            });
        }

        console.error('프로필 수정 오류:', err);

        return res.status(500).json({
            success: false,
            error: '프로필 수정에 실패했습니다.'
        });
    }
};

module.exports = {
    getAllUsers,
    signup,
    login,
    getMe,
    changePassword,
    updateProfile
};