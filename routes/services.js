const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const Booking = require('../models/Booking');
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
            images: imageUrls,
            baseDuration: Number(req.body.baseDuration) || 60,
            type: req.body.type || 'standard',
            durationPacks: typeof req.body.durationPacks === 'string' ? JSON.parse(req.body.durationPacks) : req.body.durationPacks
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
        const { name, pricing, cities, isEnabled, baseDuration } = req.body;
        const updateData = {};

        if (name) updateData.name = name.trim();
        if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
        if (baseDuration !== undefined) updateData.baseDuration = Number(baseDuration);
        if (cities) updateData.cities = Array.isArray(cities) ? cities : JSON.parse(cities);
        if (pricing) updateData.pricing = typeof pricing === 'string' ? JSON.parse(pricing) : pricing;
        if (req.body.tasks) updateData.tasks = typeof req.body.tasks === 'string' ? JSON.parse(req.body.tasks) : req.body.tasks;
        if (req.body.exclusions) updateData.exclusions = typeof req.body.exclusions === 'string' ? JSON.parse(req.body.exclusions) : req.body.exclusions;
        if (req.body.type) updateData.type = req.body.type;
        if (req.body.durationPacks) updateData.durationPacks = typeof req.body.durationPacks === 'string' ? JSON.parse(req.body.durationPacks) : req.body.durationPacks;

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

/**
 * @swagger
 * /services/{id}/availability:
 *   get:
 *     summary: Get slot availability for a specific service and date
 *     tags: [Services]
 */
router.get('/:id/availability', async (req, res) => {
    try {
        const { date, lat, lng } = req.query;
        if (!date || !lat || !lng) {
            return res.status(400).json({ message: 'Date, lat, and lng are required' });
        }

        const service = await Service.findById(req.params.id);
        if (!service) return res.status(404).json({ message: 'Service not found' });
        
        // Use duration from query (for packs) or baseDuration (for standard)
        const duration = Number(req.query.duration) || Number(service.baseDuration) || 60; 

        const fLat = parseFloat(lat);
        const fLng = parseFloat(lng);

        const now = new Date();
        const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
        const istTimeStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' }).format(now);
        
        const isToday = date === istDateStr;
        const [curH, curM] = istTimeStr.split(':').map(Number);
        const currentTotalMin = curH * 60 + curM;

        console.log(`[Availability] Request for service: ${service.name} (${req.params.id})`);
        console.log(`[Availability] Coordinates: lat=${fLat}, lng=${fLng}`);
        console.log(`[Availability] Date: ${date}`);

        if (isNaN(fLat) || isNaN(fLng)) {
            console.error(`[Availability Error]: Invalid coordinates: lat=${lat}, lng=${lng}`);
            return res.status(400).json({ message: 'Invalid latitude or longitude' });
        }

        const categoryRegex = new RegExp(`^${service.name.trim()}$`, 'i');
        console.log(`[Availability] Searching providers with regex: ${categoryRegex}`);

        // 1. Find all eligible providers for this service category in range
        const allEligibleProviders = await User.find({
            role: 'provider',
            isVerified: true,
            serviceCategory: { $regex: categoryRegex },
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [fLng, fLat]
                    },
                    $maxDistance: 40000 // 40km
                }
            }
        });

        const providerIds = allEligibleProviders.map(p => p._id);
        console.log(`[Availability] Found ${allEligibleProviders.length} providers for service: ${service.name}`);

        // 2. Find all current bookings for these providers on this date
        const existingBookings = await Booking.find({
            provider: { $in: providerIds },
            date,
            status: { $in: ['pending', 'confirmed', 'in progress'] }
        });
        console.log(`[Availability] Found ${existingBookings.length} existing bookings on ${date}`);

        /**
         * Helper to check if a slot fits within a price window and get the price
         */
        const getSlotPriceInfo = (current, slotEnd) => {
            const currentTotalMin = current.getHours() * 60 + current.getMinutes();
            const endTotalMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();

            for (const window of service.pricing) {
                const startTimeStr = (window.startTime || '00:00').trim();
                const endTimeStr = (window.endTime || '23:59').trim();
                const [wStartH, wStartM] = startTimeStr.split(':').map(Number);
                const [wEndH, wEndM] = endTimeStr.split(':').map(Number);
                
                const wStartTimeVal = wStartH * 60 + wStartM;
                const wEndTimeVal = wEndH * 60 + wEndM;

                if (currentTotalMin >= wStartTimeVal && endTotalMin <= wEndTimeVal) {
                    return { price: window.price };
                }
            }
            return null;
        };

        const formatSlotTime = (date) => {
            let h = date.getHours();
            let m = date.getMinutes();
            const ampm = h >= 12 ? 'pm' : 'am';
            h = h % 12;
            h = h ? h : 12;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
        };

        /**
         * Helper to generate slots for a provider based on working hours
         */
        const generateProviderSlots = (provider) => {
            try {
                const startStr = provider.workingHours?.start || '08:00';
                const endStr = provider.workingHours?.end || '20:00';
                
                if (!startStr.includes(':') || !endStr.includes(':')) {
                    console.warn(`[Availability] Invalid working hours for provider ${provider._id}: ${startStr}-${endStr}`);
                    return [];
                }

                const [startH, startM] = startStr.split(':').map(Number);
                const [endH, endM] = endStr.split(':').map(Number);
                // Pre-calculate busy ranges for this provider for efficient overlap checking
                const providerBusyRanges = existingBookings
                    .filter(b => b.provider && b.provider.toString() === provider._id.toString())
                    .map(b => {
                        const rangeMatch = b.timeSlot.match(/(\d{2}:\d{2})\s*(AM|PM)\s*-\s*(\d{2}:\d{2})\s*(AM|PM)/i);
                        if (!rangeMatch) return null;
                        
                        const [,, startHStr, startMStr, startAMPM, endHStr, endMStr, endAMPM] = [null, ...rangeMatch];
                        
                        const parseH = (h, ampm) => {
                            let val = parseInt(h);
                            if (ampm.toLowerCase() === 'pm' && val < 12) val += 12;
                            if (ampm.toLowerCase() === 'am' && val === 12) val = 0;
                            return val;
                        };

                        const startH = parseH(rangeMatch[1].split(':')[0], rangeMatch[2]);
                        const startM = parseInt(rangeMatch[1].split(':')[1]);
                        const endH = parseH(rangeMatch[3].split(':')[0], rangeMatch[4]);
                        const endM = parseInt(rangeMatch[3].split(':')[1]);

                        return {
                            start: startH * 60 + startM,
                            end: endH * 60 + endM
                        };
                    })
                    .filter(Boolean);

                const slots = [];
                const providerStartMin = startH * 60 + startM;
                const providerEndMin = endH * 60 + endM;

                // 2.3 Generate possible slots in 30-min increments
                // We use a reference date (Jan 1, 2000) to do mental math on hours/mins
                let current = new Date(2000, 0, 1, startH, startM, 0, 0);
                let safety = 0;
                
                while (safety < 100) {
                    safety++;
                    const slotEnd = new Date(current.getTime() + duration * 60000);
                    
                    const curMin = current.getHours() * 60 + current.getMinutes();
                    const endMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();
                    
                    // Stop if slot overflows the reference day or provider's hours
                    if (slotEnd.getDate() !== 1 || endMin > providerEndMin) break;

                    const priceInfo = getSlotPriceInfo(current, slotEnd);
                    if (priceInfo) {
                        const timeSlotLabel = `${formatSlotTime(current)} - ${formatSlotTime(slotEnd)}`;
                        
                        const isBusy = providerBusyRanges.some(range => {
                            return curMin < range.end && endMin > range.start;
                        });

                        slots.push({
                            timeSlot: timeSlotLabel,
                            startTime: current.getTime(),
                            price: priceInfo.price,
                            isAvailable: !isBusy,
                            providerId: provider._id
                        });
                    }

                    // Increment current time by 30 mins
                    current = new Date(current.getTime() + 30 * 60000);
                }
                return slots;
            } catch (err) {
                console.error(`[Availability] Error generating slots for provider ${provider._id}:`, err);
                return [];
            }
        };

        // 3. Aggregate all available slots from all providers
        let allAvailableSlots = [];
        allEligibleProviders.forEach(p => {
            allAvailableSlots = allAvailableSlots.concat(generateProviderSlots(p));
        });

        console.log(`[Availability] Generated ${allAvailableSlots.length} total raw slots`);

        // 4. Summarize and unique-ify by timeSlot label
        const uniqueSlotsMap = new Map();
        allAvailableSlots.forEach(s => {
            if (!uniqueSlotsMap.has(s.timeSlot)) {
                uniqueSlotsMap.set(s.timeSlot, {
                    timeSlot: s.timeSlot,
                    price: s.price,
                    isAvailable: s.isAvailable,
                    remainingSpots: s.isAvailable ? 1 : 0,
                    startTime: s.startTime
                });
            } else {
                const existing = uniqueSlotsMap.get(s.timeSlot);
                // Combined slot is available if ANY provider is available
                existing.isAvailable = existing.isAvailable || s.isAvailable;
                if (s.isAvailable) existing.remainingSpots += 1;
            }
        });

        let sortedAvailability = Array.from(uniqueSlotsMap.values())
            .sort((a, b) => a.startTime - b.startTime);

        // Filter out past slots if today
        if (isToday) {
            sortedAvailability = sortedAvailability.filter(slot => {
                // Parse the start time from the timeSlot label (e.g., "09:00 am - 11:00 am")
                const match = slot.timeSlot.match(/^(\d{2}):(\d{2})\s*(am|pm)/i);
                if (!match) return true;
                let h = parseInt(match[1]);
                const m = parseInt(match[2]);
                const ampm = match[3].toLowerCase();
                if (ampm === 'pm' && h < 12) h += 12;
                if (ampm === 'am' && h === 12) h = 0;
                const slotTotalMin = h * 60 + m;
                return slotTotalMin > currentTotalMin;
            });
        }

        console.log(`[Availability] Returning ${sortedAvailability.length} unique slots`);

        res.json({ 
            service: service.name, 
            date, 
            duration,
            availability: sortedAvailability 
        });
    } catch (error) {
        console.error('[Availability Error Remote]:', error);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
});

module.exports = router;
