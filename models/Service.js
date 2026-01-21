const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    images: [{ type: String }], // Multi-images for specs, exclusions, description
    pricing: [{
        timeSlot: { type: String, required: true }, // e.g., "15 mins", "30 mins", "1 hour"
        price: { type: Number, required: true }
    }],
    cities: [{ type: String }],
    tasks: [{
        name: { type: String },
        duration: { type: String }
    }],
    exclusions: [{ type: String }],
    isEnabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
