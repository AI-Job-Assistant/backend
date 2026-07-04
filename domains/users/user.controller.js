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

module.exports = {
    getAllUsers,
    signup,
    login,
    getMe
};