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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
        const { name, phone, password, role, city, serviceCategory } = req.body;
=======
=======
>>>>>>> Stashed changes
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
        
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
        if (lat && lng) {
            userData.location = {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)]
            };
            console.log(`[Registration] Location captured: [${lat}, ${lng}]`);
        }

>>>>>>> Stashed changes
        if (role === 'provider') {
            userData.serviceCategory = serviceCategory;
            console.log(`[Registration] Provider Category: ${serviceCategory}`);
            
            if (req.file) {
<<<<<<< Updated upstream
                userData.aadharUrl = `/uploads/${req.file.filename}`;
=======
                userData.aadharUrl = req.file.path;
                console.log(`[Registration] Aadhar uploaded to: ${req.file.path}`);
            } else {
                console.log(`[Registration] Warning: No Aadhar file uploaded for provider.`);
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
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
            console.log(`[Verification] Failed: Provider with ID ${req.params.id} not found.`);
            return res.status(404).json({ message: 'Provider not found' });
        }
        
        provider.isVerified = true;
        await provider.save();
        
        console.log(`[Verification] Provider ${provider.name} (ID: ${provider._id}) has been verified by admin ${req.user.name}.`);
        res.json({ message: 'Provider verified successfully', provider });
    } catch (error) {
        console.error(`[Verification] Error:`, error);
<<<<<<< Updated upstream
=======
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
>>>>>>> Stashed changes
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
