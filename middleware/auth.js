const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Debug logging
        // console.log('🔐 Auth Debug:', {
        //     userId: user._id,
        //     role: user.role,
        //     email: user.email,
        //     tokenPayload: decoded
        // });

        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Auth Error:', error.message);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin
};
