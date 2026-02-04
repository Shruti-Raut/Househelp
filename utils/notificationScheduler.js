const cron = require('node-cron');
const Booking = require('../models/Booking');
const User = require('../models/User');
const axios = require('axios');

/**
 * Sends push notifications using Expo Push API
 */
const sendPushNotification = async (expoPushToken, title, body) => {
    const message = {
        to: expoPushToken,
        sound: 'default',
        title: title,
        body: body,
        data: { someData: 'goes here' },
    };

    try {
        await axios.post('https://exp.host/--/api/v2/push/send', message, {
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
        });
        console.log(`Notification sent to ${expoPushToken}`);
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
};

/**
 * Task to check bookings 10 minutes before end time
 * Run every minute
 */
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const tenMinutesLater = new Date(now.getTime() + 10 * 60000);
        
        // Find in_progress bookings
        // Note: We need a better way to track "end time"
        // For now, let's assume services have a standard duration or we calculate based on startedAt + duration
        // Simplified: Check if any booking is reaching its estimated end time
        
        const bookings = await Booking.find({ status: 'in_progress' })
            .populate('customer', 'pushToken name')
            .populate('provider', 'pushToken name');

        for (const booking of bookings) {
            // Placeholder logic: If booking started 50 mins ago (assuming 1 hour duration)
            // In a real app, duration would be part of Service or Booking model
            if (booking.startedAt) {
                const startTime = new Date(booking.startedAt);
                const durationMinutes = 60; // Default 1 hour
                const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
                const timeDiff = endTime.getTime() - now.getTime();
                const minutesRemaining = Math.floor(timeDiff / 60000);

                if (minutesRemaining === 10) {
                    // Send notifications
                    if (booking.customer?.pushToken) {
                        await sendPushNotification(
                            booking.customer.pushToken,
                            'Service Ending Soon',
                            `Your service with ${booking.provider?.name || 'the provider'} will end in 10 minutes.`
                        );
                    }
                    if (booking.provider?.pushToken) {
                        await sendPushNotification(
                            booking.provider.pushToken,
                            'Service Ending Soon',
                            `Your service for ${booking.customer?.name || 'the customer'} will end in 10 minutes.`
                        );
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in notification scheduler:', error);
    }
});

module.exports = { sendPushNotification };
