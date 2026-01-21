const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');

// @route   POST /bookings
// @desc    Customer creates a booking with automatic matching
router.post('/', protect, authorize('customer'), async (req, res) => {
    try {
        const { serviceId, address, city, date, timeSlot, location } = req.body;

        // 1. Get Service details for pricing
        const service = await Service.findById(serviceId);
        if (!service) return res.status(404).json({ message: 'Service not found' });

        // 2. Find available verified providers in the same city
        // Simplified matching: provider must be in same city, verified, and not have a confirmed booking in same slot
        const busyProviders = await Booking.find({
            date,
            timeSlot,
            status: 'confirmed'
        }).distinct('provider');

        const availableProvider = await User.findOne({
            role: 'provider',
            city: city,
            isVerified: true,
            _id: { $nin: busyProviders }
        });

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

// @route   GET /bookings/active
// @desc    Customer or Provider gets their current/active bookings
router.get('/active', protect, async (req, res) => {
    try {
        const query = req.user.role === 'customer'
            ? { customer: req.user._id, status: { $in: ['pending', 'confirmed'] } }
            : { provider: req.user._id, status: { $in: ['pending', 'confirmed'] } };

        const bookings = await Booking.find(query)
            .populate('service')
            .populate('provider', 'name phone')
            .populate('customer', 'name phone')
            .sort({ date: 1, timeSlot: 1 });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /bookings/pending
// @desc    Provider gets their assigned or unassigned pending bookings
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

// @route   GET /bookings/all
// @desc    Admin gets all bookings
router.get('/all', protect, authorize('admin'), async (req, res) => {
    try {
        const bookings = await Booking.find().populate('customer provider', 'name phone').populate('service');
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PATCH /bookings/:id/complete
// @desc    Provider marks a booking as completed
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

        res.json({ message: 'Booking completed and earnings updated', booking });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route   PATCH /bookings/:id/feedback
// @desc    Customer leaves feedback for a completed booking
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

// @route   GET /bookings/history
// @desc    Customer or Provider gets their previous booking history
router.get('/history', protect, async (req, res) => {
    try {
        const query = req.user.role === 'customer'
            ? { customer: req.user._id, status: { $in: ['completed', 'cancelled'] } }
            : { provider: req.user._id, status: { $in: ['completed', 'cancelled'] } };

        const bookings = await Booking.find(query)
            .populate('service')
            .populate('provider', 'name phone')
            .populate('customer', 'name phone')
            .sort({ createdAt: -1 });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
