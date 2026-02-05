const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');
const { serviceStorage } = require('../config/cloudinary');
const multer = require('multer');
const upload = multer({ storage: serviceStorage });

const User = require('../models/User');

/**
 * @swagger
 * /services:
 *   get:
 *     summary: Get all services
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         schema: { type: number }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of services
 */
router.get('/', async (req, res) => {
    try {
        const { lat, lng, city, all } = req.query;
        let query = all === 'true' ? {} : { isEnabled: true };

        // If lat/lng available, look for services with nearby providers
        if (lat && lng) {
            const providersNear = await User.find({
                role: 'provider',
                isVerified: true,
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [parseFloat(lng), parseFloat(lat)]
                        },
                        $maxDistance: 40000 // 40km
                    }
                }
            }).distinct('serviceCategory');

            // If we want to be strictly radius-based, filter services by these categories
            if (providersNear.length > 0) {
                query.name = { $in: providersNear };
            } else if (all !== 'true') {
                // If no providers nearby, return empty (or we could return all but with "unavailable" flag)
                return res.json([]);
            }
        } else if (city) {
            query.cities = city;
        }

        const services = await Service.find(query);
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /services:
 *   post:
 *     summary: Create new service (Admin)
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             properties:
 *               name: { type: string }
 *               pricing: { type: string, description: "JSON string of pricing array" }
 *               cities: { type: string, description: "JSON string of cities array" }
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Service created
 */
router.post('/', protect, authorize('admin'), upload.array('images', 10), async (req, res) => {
    try {
        const { name, pricing, cities } = req.body;

        const imageUrls = req.files ? req.files.map(file => file.path) : [];

        const service = await Service.create({
            name: name.trim(),
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

/**
 * @swagger
 * /services/{id}:
 *   patch:
 *     summary: Update service (Admin)
 *     tags: [Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service updated
 */
router.patch('/:id', protect, authorize('admin'), upload.array('images', 10), async (req, res) => {
    try {
        const { name, pricing, cities, isEnabled } = req.body;
        const updateData = {};

        if (name) updateData.name = name.trim();
        if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
        if (cities) updateData.cities = Array.isArray(cities) ? cities : JSON.parse(cities);
        if (pricing) updateData.pricing = typeof pricing === 'string' ? JSON.parse(pricing) : pricing;
        if (req.body.tasks) updateData.tasks = typeof req.body.tasks === 'string' ? JSON.parse(req.body.tasks) : req.body.tasks;
        if (req.body.exclusions) updateData.exclusions = typeof req.body.exclusions === 'string' ? JSON.parse(req.body.exclusions) : req.body.exclusions;

        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => file.path);
            updateData.images = newImages;
        }

        const service = await Service.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!service) return res.status(404).json({ message: 'Service not found' });
        res.json(service);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

/**
 * @swagger
 * /services/{id}:
 *   delete:
 *     summary: Delete service (Admin)
 *     tags: [Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service deleted
 */
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
