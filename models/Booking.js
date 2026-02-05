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
        enum: ['pending', 'confirmed', 'in progress', 'completed', 'cancelled'],
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
    selectedPack: {
        duration: Number,
        label: String,
        price: Number
    },
    selectedTasks: [{
        name: String
    }],
    feedback: {
        rating: Number,
        comment: String
    }
}, { timestamps: true });

// Prevent double booking: A provider cannot have two confirmed or in-progress bookings for the same slot
// We use a partial index to ignore null providers (pending assignment)
bookingSchema.index(
    { provider: 1, date: 1, timeSlot: 1 },
    { 
        unique: true, 
        partialFilterExpression: { 
            provider: { $exists: true, $ne: null },
            status: { $in: ['pending', 'confirmed', 'in progress'] }
        }
    }
);

module.exports = mongoose.model('Booking', bookingSchema);
