const { v2: cloudinary } = require('cloudinary')

// server.js loads dotenv before any route is required, so these are ready here.
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
} else if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true })
}

const FOLDER = process.env.CLOUDINARY_FOLDER || '4thestreets'

const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/')

// Uploads one base64 data URL and returns the https URL.
async function uploadImage(dataUrl, publicId) {
  try {
    const res = await cloudinary.uploader.upload(dataUrl, {
      public_id: publicId,
      resource_type: 'image',
      overwrite: false,
      // Cloudinary stores the original, so cap it at 1200px (never enlarges)
      transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
    })
    if (!res?.secure_url) throw new Error('Cloudinary returned no URL')
    return res.secure_url
  } catch (e) {
    const err = new Error(e?.message || e?.error?.message || 'Upload failed')
    err.name = 'UploadError'
    throw err
  }
}

module.exports = { cloudinary, FOLDER, isDataUrl, uploadImage }