const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');

// Multer storage for service images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, 'service-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// @route   GET /services
// @desc    Get all enabled services (for customers)
router.get('/', async (req, res) => {
    try {
        const query = req.query.all === 'true' ? {} : { isEnabled: true };
        if (req.query.city) {
            query.cities = req.query.city;
        }
        const services = await Service.find(query);
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   POST /services
// @desc    Create a service (Admin only)
router.post('/', protect, authorize('admin'), upload.array('images', 10), async (req, res) => {
    try {
        const { name, pricing, cities } = req.body;

        const imageUrls = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

        const service = await Service.create({
            name,
            cities: Array.isArray(cities) ? cities : JSON.parse(cities || '[]'),
            pricing: typeof pricing === 'string' ? JSON.parse(pricing) : pricing,
            tasks: typeof req.body.tasks === 'string' ? JSON.parse(req.body.tasks) : req.body.tasks,
            exclusions: typeof req.body.exclusions === 'string' ? JSON.parse(req.body.exclusions) : req.body.exclusions,
            images: imageUrls
        });

        res.status(201).json(service);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @route   PATCH /services/:id
// @desc    Update a service (Admin only)
router.patch('/:id', protect, authorize('admin'), upload.array('images', 10), async (req, res) => {
    try {
        const { name, pricing, cities, isEnabled } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
        if (cities) updateData.cities = Array.isArray(cities) ? cities : JSON.parse(cities);
        if (pricing) updateData.pricing = typeof pricing === 'string' ? JSON.parse(pricing) : pricing;
        if (req.body.tasks) updateData.tasks = typeof req.body.tasks === 'string' ? JSON.parse(req.body.tasks) : req.body.tasks;
        if (req.body.exclusions) updateData.exclusions = typeof req.body.exclusions === 'string' ? JSON.parse(req.body.exclusions) : req.body.exclusions;

        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => `/uploads/${file.filename}`);
            // Note: In a real app, you might want to merge or delete old images
            updateData.images = newImages;
        }

        const service = await Service.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!service) return res.status(404).json({ message: 'Service not found' });
        res.json(service);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @route   DELETE /services/:id
// @desc    Delete a service (Admin only)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const service = await Service.findByIdAndDelete(req.params.id);
        if (!service) return res.status(404).json({ message: 'Service not found' });
        res.json({ message: 'Service deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
