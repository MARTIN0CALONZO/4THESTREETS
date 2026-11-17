/**
 * ONE-OFF MIGRATION: base64 images in MongoDB -> Cloudinary
 *
 * File Location: server/migrateImagesToCloudinary.js
 *
 * Usage (from /server or root):
 *   node migrateImagesToCloudinary.js --dry-run
 *   node migrateImagesToCloudinary.js --limit=3
 *   node migrateImagesToCloudinary.js
 *   node migrateImagesToCloudinary.js --orders
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// 1. Multi-location .env resolver (checks server/.env then root ../.env)
let envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(__dirname, '../.env');
}

const result = dotenv.config({ path: envPath });

// 2. Debug output
console.log('--- ENV DIAGNOSTIC ---');
console.log('Target .env Path:', envPath);
console.log('Dotenv Error:', result.error ? result.error.message : 'None');
console.log('Loaded Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME || 'MISSING');
console.log('Loaded MONGO_URI:', process.env.MONGO_URI ? 'FOUND' : 'MISSING');
console.log('----------------------\n');

const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');

const Product = require('./models/Product');
const Order = require('./models/Orders_item');

// ---------------------------------------------------------------
// Options
// ---------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const WITH_ORDERS = args.includes('--orders');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) || 0 : 0;

const FOLDER = process.env.CLOUDINARY_FOLDER || '4thestreets';
const SLOTS = ['front', 'back', 'model'];

// ---------------------------------------------------------------
// Cloudinary config
// ---------------------------------------------------------------
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const isBase64 = (v) => typeof v === 'string' && v.startsWith('data:');
const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => String(s || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

async function upload(dataUri, publicId, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await cloudinary.uploader.upload(dataUri, {
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
      });
      if (!res?.secure_url) throw new Error('Cloudinary returned no URL');
      return res.secure_url;
    } catch (err) {
      const msg = err?.message || err?.error?.message || String(err);
      if (attempt === tries) throw new Error(msg);
      console.warn(`    retry ${attempt}/${tries} (${msg})`);
      await sleep(1000 * attempt);
    }
  }
}

const stats = {
  productsDone: 0,
  productsSkipped: 0,
  productsFailed: [],
  uploads: 0,
  bytesMoved: 0,
  ordersDone: 0,
  ordersFailed: [],
};

// ---------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------
async function migrateProducts() {
  const filter = {
    $or: [
      { 'images.front': /^data:/ },
      { 'images.back': /^data:/ },
      { 'images.model': /^data:/ },
      { image: /^data:/ },
    ],
  };

  let q = Product.find(filter).select('_id').sort({ createdAt: 1 }).lean();
  if (LIMIT) q = q.limit(LIMIT);
  const ids = (await q).map((d) => d._id);

  const total = await Product.countDocuments({});
  console.log(`\nProducts in DB: ${total}`);
  console.log(`Products that still contain base64: ${ids.length}${LIMIT ? ` (limited to ${LIMIT})` : ''}\n`);

  for (let n = 0; n < ids.length; n++) {
    const p = await Product.findById(ids[n]).lean();
    if (!p) continue;
    const tag = `[${n + 1}/${ids.length}] ${p.code} - ${p.name}`;

    try {
      const original = p.images || {};
      const images = { ...original };
      const set = {};
      const base = `${FOLDER}/products/${safe(p.code)}`;
      const todo = SLOTS.filter((s) => isBase64(original[s]));

      const legacyIsFront = !original.front && isBase64(p.image);

      if (DRY_RUN) {
        const bytes =
          todo.reduce((sum, s) => sum + (original[s] ? original[s].length : 0), 0) +
          (legacyIsFront && p.image ? p.image.length : 0);
        const what = [...todo, ...(legacyIsFront ? ['front(legacy)'] : [])].join(', ');
        console.log(`${tag}\n    would upload: ${what} (${mb(bytes)})`);
        stats.bytesMoved += bytes;
        stats.productsDone++;
        continue;
      }

      const results = await Promise.all(
        todo.map(async (slot) => ({ slot, url: await upload(original[slot], `${base}/${slot}`) }))
      );
      for (const { slot, url } of results) {
        images[slot] = url;
        set[`images.${slot}`] = url;
        stats.bytesMoved += original[slot].length;
        stats.uploads++;
      }

      if (legacyIsFront) {
        const url = await upload(p.image, `${base}/front`);
        images.front = url;
        set['images.front'] = url;
        stats.bytesMoved += p.image.length;
        stats.uploads++;
      }

      if (isBase64(p.image) || (images.front && p.image !== images.front)) {
        if (isUrl(images.front)) set.image = images.front;
      }

      if (Object.keys(set).length === 0) {
        console.log(`${tag}\n    nothing to change`);
        stats.productsSkipped++;
        continue;
      }

      await Product.updateOne({ _id: p._id }, { $set: set }, { timestamps: false });

      console.log(`${tag}\n    ok: ${Object.keys(set).join(', ')}`);
      stats.productsDone++;
    } catch (err) {
      console.error(`${tag}\n    FAILED: ${err.message}  (database left unchanged for this product)`);
      stats.productsFailed.push(`${p.code}: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------
async function migrateOrders() {
  const filter = { 'items.image': /^data:/ };
  const ids = (await Order.find(filter).select('_id').lean()).map((d) => d._id);
  console.log(`\nOrders that still contain base64 item pictures: ${ids.length}\n`);
  if (!ids.length) return;

  const prods = await Product.find({ 'images.front': /^https?:/ }).select('images.front').lean();
  const frontOf = new Map(prods.map((p) => [String(p._id), p.images.front]));

  for (let n = 0; n < ids.length; n++) {
    const o = await Order.findById(ids[n]).lean();
    if (!o) continue;
    const tag = `[${n + 1}/${ids.length}] order ${o.orderNumber}`;

    try {
      const set = {};
      for (let i = 0; i < o.items.length; i++) {
        const img = o.items[i].image;
        if (!isBase64(img)) continue;

        const reuse = o.items[i].product && frontOf.get(String(o.items[i].product));
        if (DRY_RUN) {
          stats.bytesMoved += img.length;
          set[`items.${i}.image`] = reuse || '(would upload)';
          continue;
        }
        if (reuse) {
          set[`items.${i}.image`] = reuse;
        } else {
          set[`items.${i}.image`] = await upload(img, `${FOLDER}/orders/${safe(o.orderNumber)}-${i}`);
          stats.uploads++;
        }
        stats.bytesMoved += img.length;
      }

      if (!DRY_RUN && Object.keys(set).length) {
        await Order.updateOne({ _id: o._id }, { $set: set }, { timestamps: false });
      }
      console.log(`${tag}: ${Object.keys(set).length} item picture(s)`);
      stats.ordersDone++;
    } catch (err) {
      console.error(`${tag}: FAILED: ${err.message}`);
      stats.ordersFailed.push(`${o.orderNumber}: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------
;(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }
  if (
    !process.env.CLOUDINARY_URL &&
    !(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  ) {
    console.error(
      'Cloudinary credentials are missing. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to server/.env'
    );
    process.exit(1);
  }

  console.log(DRY_RUN ? '*** DRY RUN: nothing will be uploaded or changed ***' : '*** LIVE RUN ***');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  await migrateProducts();
  if (WITH_ORDERS) await migrateOrders();

  const leftProducts = await Product.countDocuments({
    $or: [{ 'images.front': /^data:/ }, { 'images.back': /^data:/ }, { 'images.model': /^data:/ }, { image: /^data:/ }],
  });
  const leftOrders = await Order.countDocuments({ 'items.image': /^data:/ });

  console.log('\n================ SUMMARY ================');
  console.log(`Products migrated : ${stats.productsDone}`);
  console.log(`Products skipped  : ${stats.productsSkipped}`);
  console.log(`Products failed   : ${stats.productsFailed.length}`);
  if (WITH_ORDERS) {
    console.log(`Orders migrated   : ${stats.ordersDone}`);
    console.log(`Orders failed     : ${stats.ordersFailed.length}`);
  }
  console.log(`Cloudinary uploads: ${stats.uploads}`);
  console.log(`Base64 ${DRY_RUN ? 'to move' : 'removed'}    : ${mb(stats.bytesMoved)}`);
  console.log(`Still base64 in DB: ${leftProducts} product(s)${WITH_ORDERS || leftOrders ? `, ${leftOrders} order(s)` : ''}`);
  if (stats.productsFailed.length) console.log('\nFailed products:\n' + stats.productsFailed.join('\n'));
  if (stats.ordersFailed.length) console.log('\nFailed orders:\n' + stats.ordersFailed.join('\n'));
  console.log('=========================================\n');

  await mongoose.disconnect();
  process.exit(stats.productsFailed.length || stats.ordersFailed.length ? 1 : 0);
})().catch(async (err) => {
  console.error('Migration crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});