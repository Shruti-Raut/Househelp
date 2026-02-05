const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['customer', 'provider', 'admin'], default: 'customer' },
    isSuspended: { type: Boolean, default: false },
    // Expansion fields
    city: { type: String },
    aadharUrl: { type: String }, // Path to uploaded Aadhar image
    serviceCategory: { type: String }, // For providers (e.g., "Cleaning")
    isVerified: { type: Boolean, default: false }, // Admin approval status for providers
    earnings: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    gifts: [{ type: String }],
    pushToken: { type: String },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [73.8567, 18.5204] } // Default [lng, lat] for Pune
    },
    workingHours: {
        start: { type: String, default: '08:00' }, // 24h format
        end: { type: String, default: '20:00' }
    }
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
