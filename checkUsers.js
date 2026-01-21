const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/househelp';

const checkUsers = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        const users = await User.find({}, 'name phone role isVerified isSuspended');
        console.log('--- User Status Report ---');
        users.forEach(u => {
            console.log(`- ${u.name} (${u.phone}): Role=${u.role}, Verified=${u.isVerified}, Suspended=${u.isSuspended}`);
        });
        console.log('--------------------------');
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
};

checkUsers();
