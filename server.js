const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health Check for Deployment Platforms
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/bookings', require('./routes/bookings'));
app.use('/services', require('./routes/services'));

// Static folder for uploads
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/househelp';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected successfully');
        app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.log(err));

// Simple polling endpoint for "notifications"
app.get('/notifications/new-bookings', async (req, res) => {
    // In a real app, this would check for bookings created in the last minute
    res.json({ message: 'No new bookings' });
});
