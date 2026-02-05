const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { aadharStorage } = require('../config/cloudinary');
const multer = require('multer');
const upload = multer({ storage: aadharStorage });

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [customer, provider] }
 *               city: { type: string }
 *               serviceCategory: { type: string, description: "Only for providers" }
 *               lat: { type: number }
 *               lng: { type: number }
 *               aadhar: { type: string, format: binary, description: "Aadhar card image (Only for providers)" }
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists
 */
router.post('/register', upload.single('aadhar'), async (req, res) => {
    try {
        console.log('--- Raw Registration Data ---');
        console.log('Body:', JSON.stringify(req.body, null, 2));
        console.log('File:', req.file ? {
            filename: req.file.filename,
            path: req.file.path,
            mimetype: req.file.mimetype
        } : 'No file uploaded');
        console.log('-----------------------------');

        const { name, phone, password, role, city, serviceCategory, lat, lng } = req.body;
        console.log(`[Registration] New request: ${role} - ${name} (${phone})`);
        
        let user = await User.findOne({ phone });
        if (user) {
            console.log(`[Registration] Failed: Phone number ${phone} already exists.`);
            return res.status(400).json({ message: 'User already exists' });
        }

        const userData = {
            name,
            phone,
            password,
            role,
            city
        };

        if (lat && lng) {
            userData.location = {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)]
            };
            console.log(`[Registration] Location captured: [${lat}, ${lng}]`);
        }

        if (role === 'provider') {
            userData.serviceCategory = serviceCategory;
            console.log(`[Registration] Provider Category: ${serviceCategory}`);
            
            if (req.file) {
                userData.aadharUrl = req.file.path; // Cloudinary secure URL
                console.log(`[Registration] Aadhar uploaded to Cloudinary: ${userData.aadharUrl}`);
            } else {
                console.log(`[Registration] Warning: No Aadhar file uploaded for provider.`);
            }
        }

        user = await User.create(userData);
        console.log(`[Registration] Success! User ID: ${user._id}`);
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
        res.status(201).json({ token, user: { id: user._id, name, phone, role } });
    } catch (error) {
        console.error(`[Registration] Error:`, error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login to account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });

        if (!user) return res.status(401).json({ message: 'Invalid credentials' });
        
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        if (user.role === 'provider' && !user.isVerified) {
            return res.status(403).json({ message: 'Provider not yet verified by admin' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
        res.json({ token, user: { id: user._id, name: user.name, phone: user.phone, role: user.role } });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /auth/providers:
 *   get:
 *     summary: Get all provider profiles (Admin)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of providers
 */
router.get('/providers', protect, authorize('admin'), async (req, res) => {
    try {
        const providers = await User.find({ role: 'provider' });
        res.json(providers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /auth/verify/{id}:
 *   patch:
 *     summary: Verify a provider profile (Admin)
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider verified
 */
router.patch('/verify/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const provider = await User.findById(req.params.id);
        if (!provider || provider.role !== 'provider') {
            console.log(`[Verification] Failed: Provider with ID ${req.params.id} not found.`);
            return res.status(404).json({ message: 'Provider not found' });
        }
        
        provider.isVerified = true;
        await provider.save();
        
        console.log(`[Verification] Provider ${provider.name} (ID: ${provider._id}) has been verified by admin ${req.user.name}.`);
        res.json({ message: 'Provider verified successfully', provider });
    } catch (error) {
        console.error(`[Verification] Error:`, error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /auth/push-token:
 *   patch:
 *     summary: Update notification push token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               pushToken: { type: string }
 *     responses:
 *       200:
 *         description: Token updated
 */
router.patch('/push-token', protect, async (req, res) => {
    try {
        const { pushToken } = req.body;
        const user = await User.findById(req.user._id);
        user.pushToken = pushToken;
        await user.save();
        res.json({ message: 'Push token updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /auth/location:
 *   patch:
 *     summary: Update user GPS location
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               lat: { type: number }
 *               lng: { type: number }
 *     responses:
 *       200:
 *         description: Location updated
 */
router.patch('/location', protect, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const user = await User.findById(req.user._id);
        user.location = {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
        };
        await user.save();
        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
