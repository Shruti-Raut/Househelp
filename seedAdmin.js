const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/househelp';

const seedAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const adminPhone = '9999999999';
        const existingAdmin = await User.findOne({ phone: adminPhone });

        if (existingAdmin) {
            console.log('Admin user already exists');
        } else {
            const admin = new User({
                name: 'System Admin',
                phone: adminPhone,
                password: 'adminpassword',
                role: 'admin',
                city: 'Universal'
            });
            await admin.save();
            console.log('Admin user created successfully');
            console.log('Phone:', adminPhone);
            console.log('Password: adminpassword');
        }
    } catch (err) {
        console.error('Error seeding admin:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedAdmin();
