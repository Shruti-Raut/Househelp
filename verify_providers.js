const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/househelp';

async function verifyAll() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const result = await User.updateMany(
            { role: 'provider', isVerified: false },
            { $set: { isVerified: true } }
        );

        console.log(`Updated ${result.modifiedCount} providers to verified status.`);
        mongoose.connection.close();
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verifyAll();
