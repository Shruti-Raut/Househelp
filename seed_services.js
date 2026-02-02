const mongoose = require('mongoose');
const Service = require('./models/Service');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/househelp';

const newServices = [
    {
        name: 'Bathroom Cleaning',
        cities: ['Mumbai', 'Pune'],
        pricing: [
            { timeSlot: '09:00 AM - 11:00 AM', price: 400 },
            { timeSlot: '11:00 AM - 01:00 PM', price: 400 },
            { timeSlot: '03:00 PM - 05:00 PM', price: 500 }
        ],
        tasks: [
            { name: 'Toilet Cleaning', duration: '20m' },
            { name: 'Floor Scrubbing', duration: '30m' },
            { name: 'Mirror & Sink Polishing', duration: '15m' }
        ],
        exclusions: ['Deep tile grout removal', 'Acid wash'],
        images: ['/uploads/bathroom.jpg'],
        isEnabled: true
    },
    {
        name: 'Home Cleaning Services',
        cities: ['Mumbai', 'Pune'],
        pricing: [
            { timeSlot: '08:00 AM - 10:00 AM', price: 500 },
            { timeSlot: '10:00 AM - 12:00 PM', price: 500 },
            { timeSlot: '02:00 PM - 04:00 PM', price: 600 },
            { timeSlot: '04:00 PM - 06:00 PM', price: 600 }
        ],
        tasks: [
            { name: 'Mopping', duration: '30m' },
            { name: 'Dusting', duration: '30m' },
            { name: 'Kitchen Cleaning', duration: '30m' },
            { name: 'Bathroom Cleaning', duration: '30m' }
        ],
        exclusions: ['Window exterior', 'Deep carpet cleaning'],
        images: ['/uploads/cleaning_composite.jpg'],
        isEnabled: true
    },
    {
        name: 'Cooking Services',
        cities: ['Mumbai', 'Pune'],
        pricing: [
            { timeSlot: '07:00 AM - 09:00 AM', price: 400 },
            { timeSlot: '12:00 PM - 02:00 PM', price: 400 },
            { timeSlot: '07:00 PM - 09:00 PM', price: 500 }
        ],
        tasks: [
            { name: 'Meal preparation', duration: '1h' },
            { name: 'Veggies chopping', duration: '30m' },
            { name: 'Dishwashing', duration: '30m' }
        ],
        exclusions: ['Grocery shopping'],
        images: ['/uploads/cooking_prep.jpg'],
        isEnabled: true
    },
    {
        name: 'Water Tank Cleaning',
        cities: ['Mumbai', 'Pune'],
        pricing: [
            { timeSlot: '09:00 AM - 12:00 PM', price: 800 },
            { timeSlot: '02:00 PM - 05:00 PM', price: 800 }
        ],
        tasks: [
            { name: 'Sediment removal', duration: '1h' },
            { name: 'Chlorination', duration: '1h' },
            { name: 'Inlet/Outlet cleaning', duration: '1h' }
        ],
        exclusions: ['Plumbing repairs'],
        images: ['/uploads/watertank.jpg'],
        isEnabled: true
    },
    {
        name: 'Cleaning & Folding',
        cities: ['Mumbai', 'Pune'],
        pricing: [
            { timeSlot: '10:00 AM - 12:00 PM', price: 300 },
            { timeSlot: '03:00 PM - 05:00 PM', price: 300 }
        ],
        tasks: [
            { name: 'Laundry folding', duration: '1h' },
            { name: 'Ironing', duration: '30m' },
            { name: 'Wardrobe organization', duration: '30m' }
        ],
        exclusions: ['Laundry washing'],
        images: ['/uploads/folding.png'],
        isEnabled: true
    }
];

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        for (const s of newServices) {
            await Service.findOneAndUpdate(
                { name: s.name },
                s,
                { upsert: true, new: true }
            );
            console.log(`Synced service: ${s.name}`);
        }

        mongoose.connection.close();
        console.log('Seeding complete');
    } catch (err) {
        console.error('Seeding failed:', err);
    }
}

seed();
