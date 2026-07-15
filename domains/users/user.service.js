const db = require('../../config/db');
const bcrypt = require('bcrypt');

const getAllUsers = async () => {
    const [rows] = await db.query('SELECT * FROM users');
    return rows;
};

const findByStudentId = async (studentId) => {
    const [rows] = await db.query(
        'SELECT * FROM users WHERE studentId = ?',
        [studentId]
    );

    return rows[0];
};

const createUser = async ({ studentId, name, email, passwordHash, departmentId }) => {
    const [result] = await db.query(
        `INSERT INTO users
        (studentId, name, email, passwordHash, departmentId)
        VALUES (?, ?, ?, ?, ?)`,
        [studentId, name, email, passwordHash, departmentId]
    );

    return {
        id: result.insertId,
        studentId,
        name,
        email,
        departmentId
    };
};

const findById = async (id) => {
    const [rows] = await db.query(
        'SELECT id, studentId, name, email, departmentId FROM users WHERE id = ?',
        [id]
    );

    return rows[0];
};

const changePassword = async (userId, currentPassword, newPassword) => {
    const [rows] = await db.query(
        'SELECT id, passwordHash FROM users WHERE id = ?',
        [userId]
    );

    if (rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
    }

    const user = rows[0];

    const isCurrentPasswordCorrect = await bcrypt.compare(
        currentPassword,
        user.passwordHash
    );

    if (!isCurrentPasswordCorrect) {
        throw new Error('CURRENT_PASSWORD_INCORRECT');
    }

    const isSamePassword = await bcrypt.compare(
        newPassword,
        user.passwordHash
    );

    if (isSamePassword) {
        throw new Error('SAME_AS_CURRENT_PASSWORD');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await db.query(
        'UPDATE users SET passwordHash = ? WHERE id = ?',
        [newPasswordHash, userId]
    );

    return {
        message: '비밀번호가 변경되었습니다.'
    };
};

const updateProfile = async (userId, { name, email, departmentId }) => {
    const [rows] = await db.query(
        'SELECT id FROM users WHERE id = ?',
        [userId]
    );

    if (rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
    }

    const [emailRows] = await db.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
    );

    if (emailRows.length > 0) {
        throw new Error('EMAIL_ALREADY_EXISTS');
    }

    await db.query(
        `
        UPDATE users
        SET name = ?,
            email = ?,
            departmentId = ?
        WHERE id = ?
        `,
        [name, email, departmentId, userId]
    );

    return {
        id: userId,
        name,
        email,
        departmentId
    };
};

module.exports = {
    getAllUsers,
    findByStudentId,
    createUser,
    findById,
    changePassword,
    updateProfile
};