const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

dotenv.config();

const app = express();

// Swagger Configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Househelp API',
            version: '1.0.0',
            description: 'API documentation for Househelp Mobile App and Admin Panel',
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 5000}`,
                description: 'Local server'
            },
            {
                url: 'https://househelp-1sq5.onrender.com',
                description: 'Production server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                }
            }
        },
        security: [{
            bearerAuth: []
        }]
    },
    apis: ['./routes/*.js'], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Log request bodies for debugging
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Health Check for Deployment Platforms
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/bookings', require('./routes/bookings'));
app.use('/services', require('./routes/services'));

// Static folder for uploads
app.use('/uploads', express.static('uploads'));

// Start notification scheduler
require('./utils/notificationScheduler');

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

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('--- Global Error Handled ---');
    console.error(err);
    if (err.message) console.error('Message:', err.message);
    if (err.stack) console.error('Stack:', err.stack);
    console.error('----------------------------');
    
    // Check if it's a Multer error
    if (err.name === 'MulterError') {
        return res.status(400).json({ message: `Upload Error: ${err.message}`, error: err });
    }

    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 Error Handler
app.use((req, res) => {
    console.log(`404 Error: ${req.method} ${req.url}`);
    res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});
