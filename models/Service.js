const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    images: [{ type: String }], // Multi-images for specs, exclusions, description
    pricing: [{
        startTime: { type: String, default: '00:00' },
        endTime: { type: String, default: '23:59' },
        price: { type: Number, required: true }
    }],
    type: { 
        type: String, 
        enum: ['standard', 'pack'], 
        default: 'standard' 
    },
    durationPacks: [{
        duration: { type: Number }, // in minutes
        label: { type: String },    // e.g. "1 hour"
        price: { type: Number },
        originalPrice: { type: Number }
    }],
    cities: [{ type: String }],
    tasks: [{
        name: { type: String },
        duration: { type: String },
        icon: { type: String } // For pack tasks
    }],
    exclusions: [{ type: String }],
    isEnabled: { type: Boolean, default: true },
    baseDuration: { type: Number, default: 60 } // Default for standard services
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
