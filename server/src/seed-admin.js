require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

(async () => {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in server/.env');
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing && existing.role !== 'admin') throw new Error('That email already belongs to a non-admin account. Use a different admin email.');
  if (existing) {
    existing.name = ADMIN_NAME;
    existing.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    existing.role = 'admin';
    await existing.save();
    console.log('Admin account password updated.');
  } else {
    await User.create({ name: ADMIN_NAME, email, role: 'admin', passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12) });
    console.log('Admin account created.');
  }
  await mongoose.disconnect();
})().catch(async error => {
  console.error(error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
