const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                console.log('Authorization failed: User not found in DB');
                return res.status(401).json({ message: 'Not authorized' });
            }
            if (req.user.isSuspended) {
                console.log(`Authorization failed: User ${req.user.phone} is suspended`);
                return res.status(403).json({ message: 'User suspended' });
            }
            next();
        } catch (error) {
            console.log('Authorization failed: Token verification error', error.message);
            res.status(401).json({ message: 'Not authorized' });
        }
    } else {
        console.log('Authorization failed: No token provided');
        res.status(401).json({ message: 'No token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            console.error('=========================================');
            console.error('AUTHORIZATION FORBIDDEN (403)');
            console.error(`URL: ${req.method} ${req.originalUrl}`);
            console.error(`User: ${req.user.phone} (${req.user._id})`);
            console.error(`Role: ${req.user.role}`);
            console.error(`Required Roles: ${roles}`);
            console.error('=========================================');
            return res.status(403).json({
                message: `Role ${req.user.role} not authorized for this action`,
                required: roles
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
