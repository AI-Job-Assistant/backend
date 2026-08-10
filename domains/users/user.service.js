const db = require('../../config/db');

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

const findByStudentIdAndEmail = async (studentId, email) => {
    const [rows] = await db.query(
        'SELECT id, studentId, email FROM users WHERE studentId = ? AND email = ? LIMIT 1',
        [studentId, email]
    );
    return rows[0] || null;
};

const updatePassword = async (userId, passwordHash) => {
    const [result] = await db.query(
        'UPDATE users SET passwordHash = ? WHERE id = ?',
        [passwordHash, userId]
    );
    return result.affectedRows > 0;
};

module.exports = {
    getAllUsers,
    findByStudentId,
    createUser,
    findById,
    findByStudentIdAndEmail,
    updatePassword
};