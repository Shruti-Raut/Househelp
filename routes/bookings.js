const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');
const { sendPushNotification } = require('../utils/notificationScheduler');

/**
 * @swagger
 * /bookings:
 *   post:
 *     summary: Create a new booking (Automatic matching)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceId: { type: string }
 *               address: { type: string }
 *               city: { type: string }
 *               date: { type: string }
 *               timeSlot: { type: string }
 *               location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *     responses:
 *       201:
 *         description: Booking created
 */
router.post('/', protect, authorize('customer'), async (req, res) => {
    try {
        const { serviceId, address, city, date, timeSlot, location } = req.body;

        if (!location || !location.lat || !location.lng) {
            return res.status(400).json({ message: 'Location (lat/lng) is required for booking' });
        }

        // 1. Get Service details for pricing
        const service = await Service.findById(serviceId);
        if (!service) return res.status(404).json({ message: 'Service not found' });

        // 2. Find available verified providers within 40km radius
        const busyProviders = await Booking.find({
            date,
            timeSlot,
            status: { $in: ['confirmed', 'in_progress'] }
        }).distinct('provider');

        console.log(`Searching for available providers for category: "${service.name}"`);
        const availableProvider = await User.findOne({
            role: 'provider',
            isVerified: true,
            serviceCategory: { $regex: new RegExp(`^${service.name.trim()}$`, 'i') },
            _id: { $nin: busyProviders },
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
                    },
                    $maxDistance: 40000 // 40,000 meters = 40km
                }
            }
        });

        if (!availableProvider) {
            console.log(`Auto-assignment failed. Service: "${service.name}". Checked ${busyProviders.length} busy providers. Radius: 40km.`);
            // check if there's any provider at all for this category (unverified or far)
            const backupCheck = await User.findOne({ 
                role: 'provider', 
                serviceCategory: { $regex: new RegExp(`^${service.name.trim()}$`, 'i') } 
            });
            if (backupCheck) {
                console.log(`Found a potential provider "${backupCheck.name}" but they are either not verified (status: ${backupCheck.isVerified}) or too far.`);
            } else {
                console.log(`No provider found at all for category: "${service.name}"`);
            }
        } else {
            console.log(`Found provider: ${availableProvider.name}`);
        }

        // 3. Prepare pricing
        const pricingRule = service.pricing.find(p => p.timeSlot === timeSlot);
        if (!pricingRule) return res.status(400).json({ message: 'Invalid time slot selected' });

        const basePrice = pricingRule.price;
        const tax = basePrice * 0.18;
        const total = basePrice + tax;

        const booking = await Booking.create({
            customer: req.user._id,
            provider: availableProvider ? availableProvider._id : null,
            service: serviceId,
            address,
            city, // Store original city for display
            date,
            timeSlot,
            status: availableProvider ? 'confirmed' : 'pending',
            pricing: {
                base: basePrice,
                tax: tax,
                total: total
            },
            location: location // { lat, lng }
        });

        // Send Notification to Provider
        if (availableProvider && availableProvider.pushToken) {
            sendPushNotification(
                availableProvider.pushToken,
                'New Booking Assigned!',
                `You have a new ${service.name} booking on ${date} at ${timeSlot}.`
            ).catch(err => console.error('Push notify provider failed:', err));
        }

        res.status(201).json({
            booking,
            message: availableProvider
                ? `Booking confirmed with provider ${availableProvider.name}`
                : 'No provider available at this time. Booking is pending.'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/active:
 *   get:
 *     summary: Get active bookings for current user
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active bookings
 */
router.get('/active', protect, async (req, res) => {
    try {
        const query = req.user.role === 'customer'
            ? { customer: req.user._id, status: { $in: ['pending', 'confirmed', 'in_progress'] } }
            : { provider: req.user._id, status: { $in: ['pending', 'confirmed', 'in_progress'] } };

        const bookings = await Booking.find(query)
            .populate('service')
            .populate('provider', 'name phone')
            .populate('customer', 'name phone')
            .sort({ date: -1, timeSlot: -1 });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/pending:
 *   get:
 *     summary: Get pending bookings (Provider)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending bookings
 */
router.get('/pending', protect, authorize('provider'), async (req, res) => {
    try {
        // Providers see bookings assigned to them or pending ones in their city (if we want to allow manual pick)
        // For now, let's show bookings assigned to them that are 'confirmed' or ones specifically 'pending'
        const query = {
            $or: [
                { provider: req.user._id },
                { status: 'pending', city: req.user.city } // This requires city in Booking model, let's stick to provider id
            ]
        };
        const bookings = await Booking.find({ provider: req.user._id }).populate('customer', 'name phone').populate('service');
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/all:
 *   get:
 *     summary: Get all bookings (Admin)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All bookings in system
 */
router.get('/all', protect, authorize('admin'), async (req, res) => {
    try {
        const bookings = await Booking.find()
            .populate('customer provider', 'name phone')
            .populate('service')
            .sort({ date: -1, timeSlot: -1 });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/{id}/assign:
 *   patch:
 *     summary: Manually assign provider (Admin)
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               providerId: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider assigned
 */
router.patch('/:id/assign', protect, authorize('admin'), async (req, res) => {
    try {
        const { providerId } = req.body;
        const booking = await Booking.findById(req.params.id).populate('service');
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        const provider = await User.findById(providerId);
        if (!provider || provider.role !== 'provider') {
            return res.status(404).json({ message: 'Provider not found' });
        }

        // Strict category matching (with trim/lowercase for robustness)
        const providerCat = (provider.serviceCategory || "").trim().toLowerCase();
        const serviceCat = (booking.service.name || "").trim().toLowerCase();

        if (providerCat !== serviceCat) {
            return res.status(400).json({ 
                message: `Provider category ("${provider.serviceCategory}") does not match booking service ("${booking.service.name}")` 
            });
        }

        booking.provider = providerId;
        booking.status = 'confirmed';
        await booking.save();

        // Populate customer to send them a notification too
        await booking.populate('customer', 'pushToken');

        // Notify Provider
        if (provider.pushToken) {
            sendPushNotification(
                provider.pushToken,
                'New Task Assigned!',
                `Admin has assigned you to a ${booking.service.name} booking on ${booking.date}.`
            ).catch(err => console.error('Push notify provider failed:', err));
        }

        // Notify Customer
        if (booking.customer && booking.customer.pushToken) {
            sendPushNotification(
                booking.customer.pushToken,
                'Provider Assigned!',
                `A provider (${provider.name}) has been assigned to your ${booking.service.name} booking.`
            ).catch(err => console.error('Push notify customer failed:', err));
        }

        res.json({ message: 'Provider assigned successfully', booking });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/{id}/complete:
 *   patch:
 *     summary: Mark booking as completed (Provider)
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Booking completed
 */
router.patch('/:id/complete', protect, authorize('provider'), async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.provider.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.status !== 'confirmed') {
            return res.status(400).json({ message: 'Booking must be confirmed to complete' });
        }

        booking.status = 'completed';
        await booking.save();

        // Update provider earnings
        const provider = await User.findById(req.user._id);
        provider.earnings = (provider.earnings || 0) + (booking.pricing.total || 0);
        await provider.save();

        // Notify Customer
        const customer = await User.findById(booking.customer);
        if (customer && customer.pushToken) {
            sendPushNotification(
                customer.pushToken,
                'Service Completed!',
                'Your provider has marked the service as completed. Please rate your experience!'
            ).catch(err => console.error('Push notify customer failed:', err));
        }

        res.json({ message: 'Booking completed and earnings updated', booking });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/{id}/feedback:
 *   patch:
 *     summary: Leave feedback (Customer)
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               rating: { type: number }
 *               comment: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback saved
 */
router.patch('/:id/feedback', protect, authorize('customer'), async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const booking = await Booking.findById(req.params.id);

        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.status !== 'completed') {
            return res.status(400).json({ message: 'Can only leave feedback for completed bookings' });
        }

        booking.feedback = { rating, comment };
        await booking.save();

        // Award points to provider based on rating
        if (booking.provider) {
            const provider = await User.findById(booking.provider);
            const pointsAwarded = rating >= 4 ? 10 : (rating >= 3 ? 5 : 0);
            provider.points = (provider.points || 0) + pointsAwarded;

            // Logic for gifts could go here (e.g. if points > 100, add gift)
            if (provider.points >= 100) {
                provider.gifts.push("Reward Coupon: ₹100 Off Househelp Supplies");
                provider.points -= 100; // Reset or keep accumulating
            }
            await provider.save();
        }

        res.json({ message: 'Feedback saved and points awarded', booking });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/history:
 *   get:
 *     summary: Get booking history
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of previous bookings
 */
router.get('/history', protect, async (req, res) => {
    try {
        const query = req.user.role === 'customer'
            ? { customer: req.user._id, status: { $in: ['completed', 'cancelled'] } }
            : { provider: req.user._id, status: { $in: ['completed', 'cancelled'] } };

        const bookings = await Booking.find(query)
            .populate('service')
            .populate('provider', 'name phone')
            .populate('customer', 'name phone')
            .sort({ date: -1, timeSlot: -1 });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/{id}/start:
 *   patch:
 *     summary: Start service (Provider)
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service started
 */
router.patch('/:id/start', protect, authorize('provider'), async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.provider.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.status !== 'confirmed') {
            return res.status(400).json({ message: 'Can only start confirmed bookings' });
        }

        booking.status = 'in_progress';
        booking.startedAt = new Date();
        await booking.save();

        // Notify Customer
        const customer = await User.findById(booking.customer);
        if (customer && customer.pushToken) {
            sendPushNotification(
                customer.pushToken,
                'Service Started!',
                'Your provider has started the service. Feel free to monitor the progress.'
            ).catch(err => console.error('Push notify customer failed:', err));
        }

        res.json({ message: 'Service started!', booking });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * @swagger
 * /bookings/{id}/stop:
 *   patch:
 *     summary: Stop service (Customer or Provider)
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service stopped
 */
router.patch('/:id/stop', protect, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        
        const isProvider = booking.provider.toString() === req.user._id.toString();
        const isCustomer = booking.customer.toString() === req.user._id.toString();

        if (!isProvider && !isCustomer) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (booking.status !== 'in_progress') {
            return res.status(400).json({ message: 'Can only stop in-progress bookings' });
        }

        booking.status = 'completed';
        await booking.save();

        // Update provider earnings
        const provider = await User.findById(booking.provider);
        provider.earnings = (provider.earnings || 0) + (booking.pricing.total || 0);
        await provider.save();

        // Notify Customer
        const customer = await User.findById(booking.customer);
        if (customer && customer.pushToken) {
            sendPushNotification(
                customer.pushToken,
                'Service Completed!',
                'The service has been marked as completed. Please leave a rating!'
            ).catch(err => console.error('Push notify customer failed:', err));
        }

        // Notify Provider (if customer stopped it)
        if (isCustomer && provider && provider.pushToken) {
            sendPushNotification(
                provider.pushToken,
                'Service Stopped!',
                'The customer has marked the service as stopped.'
            ).catch(err => console.error('Push notify provider failed:', err));
        }

        res.json({ message: 'Service stopped and marked as completed', booking });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
