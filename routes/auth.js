const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// Multer storage for Aadhar cards
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// @route   POST /auth/register
router.post('/register', upload.single('aadhar'), async (req, res) => {
    try {
        const { name, phone, password, role, city, serviceCategory } = req.body;
        let user = await User.findOne({ phone });
        if (user) return res.status(400).json({ message: 'User already exists' });

        const userData = {
            name,
            phone,
            password,
            role,
            city
        };

        if (role === 'provider') {
            userData.serviceCategory = serviceCategory;
            if (req.file) {
                userData.aadharUrl = `/uploads/${req.file.filename}`;
            }
        }

        user = await User.create(userData);
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
        res.status(201).json({ token, user: { id: user._id, name, phone, role } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });

        if (user && (await user.comparePassword(password))) {
            console.log(`Login attempt: user=${user.phone}, role=${user.role}, verified=${user.isVerified}`);
            if (user.role === 'provider' && !user.isVerified) {
                console.log('Login blocked: Provider not verified');
                return res.status(403).json({ message: 'Provider not yet verified by admin' });
            }

            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
            res.json({ token, user: { id: user._id, name: user.name, phone: user.phone, role: user.role } });
        } else {
            console.log(`Login failed: Invalid credentials for ${phone}`);
            res.status(401).json({ message: 'Invalid phone or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /auth/me
// @desc    Get current user data
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /auth/providers
// @desc    Get all providers (Admin only)
router.get('/providers', protect, authorize('admin'), async (req, res) => {
    try {
        const providers = await User.find({ role: 'provider' });
        res.json(providers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PATCH /auth/verify/:id
// @desc    Verify a provider (Admin only)
router.patch('/verify/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const provider = await User.findById(req.params.id);
        if (!provider || provider.role !== 'provider') {
            return res.status(404).json({ message: 'Provider not found' });
        }
        provider.isVerified = true;
        await provider.save();
        res.json({ message: 'Provider verified successfully', provider });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
