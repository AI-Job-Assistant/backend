const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'No token'
        });
    }

    try {
        const token = authHeader.split(' ')[1];

        req.user = jwt.verify(token, process.env.JWT_SECRET);

        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
};