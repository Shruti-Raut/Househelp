const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const aadharStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'househelp/aadhar',
    format: async (req, file) => 'jpg',
    public_id: (req, file) => `aadhar-${Date.now()}`,
  },
});

const serviceStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'househelp/services',
    format: async (req, file) => 'jpg',
    public_id: (req, file) => `service-${Date.now()}`,
  },
});

module.exports = {
  cloudinary,
  aadharStorage,
  serviceStorage,
};
