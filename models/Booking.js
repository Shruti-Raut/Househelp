const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    address: { type: String, required: true },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    startedAt: { type: Date },
    pricing: {
        base: Number,
        tax: Number,
        total: Number
    },
    location: {
        lat: Number,
        lng: Number
    },
    feedback: {
        rating: Number,
        comment: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
