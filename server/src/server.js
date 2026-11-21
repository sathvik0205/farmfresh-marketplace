require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Farmer, Product, FarmerOrder, Order } = require('./models');
const { protect, allow } = require('./auth');
const { cleanPinCodes, validEmail, validDeliveryAddress, validProductInput, canTransitionOrder, groupOrderLinesByFarmerAndDelivery, deriveParentOrderStatus } = require('./validation');

const app = express();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const tokenFor = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role });

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(x => x.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'FarmFresh API' }));

// Authentication. Public registration can create customer/farmer accounts only.
app.post('/api/auth/register', wrap(async (req, res) => {
  let { name, email, password, phone, role = 'customer' } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || !validEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 128 || !['customer', 'farmer'].includes(role))
    return res.status(400).json({ message: 'Enter name, valid email, password (8+ characters), and customer/farmer role.' });
  email = email.toLowerCase().trim();
  if (await User.findOne({ email })) return res.status(409).json({ message: 'Email already registered.' });
  const user = await User.create({ name: name.trim(), email, phone: typeof phone === 'string' ? phone.trim().slice(0, 30) : undefined, role, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Email or password incorrect.' });
  res.json({ token: tokenFor(user), user: safeUser(user) });
}));
app.get('/api/auth/me', protect, (req, res) => res.json({ user: safeUser(req.user) }));

// Farmer profile and approval.
app.post('/api/farmers/profile', protect, allow('farmer'), wrap(async (req, res) => {
  const { farmName, village, description = '', district = 'Hyderabad' } = req.body;
  if (typeof farmName !== 'string' || !farmName.trim() || farmName.length > 100 || typeof village !== 'string' || !village.trim() || village.length > 100 || typeof description !== 'string' || description.length > 1000) return res.status(400).json({ message: 'Enter a farm name and village (100 characters max); description must be 1,000 characters or fewer.' });
  const profile = await Farmer.findOneAndUpdate(
    { user: req.user._id },
    { farmName: farmName.trim(), village: village.trim(), description, district, pinCodes: cleanPinCodes(req.body.pinCodes), approvalStatus: 'pending' },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ farmer: profile });
}));
app.get('/api/farmers/me', protect, allow('farmer'), wrap(async (req, res) => res.json({ farmer: await Farmer.findOne({ user: req.user._id }) })));
app.get('/api/farmers/public', wrap(async (_req, res) => res.json({ farmers: await Farmer.find({ approvalStatus: 'approved' }).populate('user', 'name') })));

// Catalogue and farmer-owned product management.
app.get('/api/products', wrap(async (req, res) => {
  const approvedFarmers = await Farmer.find({ approvalStatus: 'approved' }).distinct('user');
  const filter = { isActive: true, farmer: { $in: approvedFarmers } };
  if (req.query.category) filter.category = String(req.query.category);
  if (req.query.q) {
    const escaped = String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: escaped, $options: 'i' };
  }
  if (req.query.pinCode && /^\d{6}$/.test(String(req.query.pinCode))) filter.availablePinCodes = String(req.query.pinCode);
  const products = await Product.find(filter).populate('farmer', 'name').sort({ createdAt: -1 }).limit(100);
  res.json({ products });
}));
app.get('/api/products/mine', protect, allow('farmer'), wrap(async (req, res) => res.json({ products: await Product.find({ farmer: req.user._id }).sort({ createdAt: -1 }) })));
app.post('/api/products', protect, allow('farmer'), wrap(async (req, res) => {
  const profile = await Farmer.findOne({ user: req.user._id, approvalStatus: 'approved' });
  if (!profile) return res.status(403).json({ message: 'Your farmer profile must be approved before listing products.' });
  const input = { unit: 'kg', deliveryMethod: 'platform', description: '', ...req.body };
  const validationError = validProductInput(input);
  if (validationError) return res.status(400).json({ message: validationError });
  const { name, category, price, stock, unit, description, deliveryMethod } = input;
  const product = await Product.create({ farmer: req.user._id, name: name.trim(), category, price: Number(price), stock: Number(stock), unit, description, deliveryMethod, availablePinCodes: cleanPinCodes(req.body.availablePinCodes?.length ? req.body.availablePinCodes : profile.pinCodes) });
  res.status(201).json({ product });
}));
app.patch('/api/products/:id', protect, allow('farmer'), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID.' });
  const product = await Product.findOne({ _id: req.params.id, farmer: req.user._id });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  const validationError = validProductInput(req.body, true);
  if (validationError) return res.status(400).json({ message: validationError });
  const { isActive } = req.body;
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ message: 'Listing active state must be true or false.' });
  const fields = ['name', 'description', 'category', 'price', 'unit', 'stock', 'isActive', 'deliveryMethod'];
  for (const key of fields) if (req.body[key] !== undefined) product[key] = key === 'name' ? req.body[key].trim() : req.body[key];
  if (req.body.availablePinCodes !== undefined) product.availablePinCodes = cleanPinCodes(req.body.availablePinCodes);
  await product.save();
  res.json({ product });
}));
app.delete('/api/products/:id', protect, allow('farmer'), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID.' });
  const product = await Product.findOneAndUpdate({ _id: req.params.id, farmer: req.user._id }, { isActive: false }, { new: true });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  res.json({ message: 'Listing hidden.' });
}));

// Checkout is transactional: stock changes and all order documents commit together or not at all.
app.post('/api/orders', protect, allow('customer'), wrap(async (req, res) => {
  const { items, address, paymentMethod = 'cod' } = req.body;
  if (!Array.isArray(items) || !items.length || items.length > 30) return res.status(400).json({ message: 'Your basket must contain between 1 and 30 line items.' });
  if (!validDeliveryAddress(address))
    return res.status(400).json({ message: 'Enter a valid recipient name, phone, street address and 6-digit PIN code.' });
  if (paymentMethod !== 'cod') return res.status(400).json({ message: 'Online payments are not enabled yet. Choose cash on delivery.' });
  const ids = items.map(item => String(item.productId));
  if (ids.some(id => !mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Invalid or duplicate basket item.' });

  const session = await mongoose.startSession();
  let createdOrder;
  try {
    await session.withTransaction(async () => {
      const products = await Product.find({ _id: { $in: ids }, isActive: true }).session(session);
      if (products.length !== ids.length) throw Object.assign(new Error('A product is unavailable.'), { status: 409 });
      const productMap = new Map(products.map(product => [String(product._id), product]));
      const orderLines = [];
      const parentItems = [];
      let total = 0;
      for (const item of items) {
        const product = productMap.get(String(item.productId));
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 || product.stock < quantity)
          throw Object.assign(new Error(`Invalid quantity or insufficient stock for ${product.name}.`), { status: 409 });
        if (product.availablePinCodes.length && !product.availablePinCodes.includes(String(address.pinCode)))
          throw Object.assign(new Error(`${product.name} cannot be delivered to this PIN code.`), { status: 400 });
        const farmerProfile = await Farmer.findOne({ user: product.farmer, approvalStatus: 'approved' }).session(session);
        if (!farmerProfile) throw Object.assign(new Error(`${product.name} is no longer listed by an approved farmer.`), { status: 409 });
        product.stock -= quantity;
        await product.save({ session });
        const line = { product: product._id, name: product.name, quantity, unit: product.unit, unitPrice: product.price };
        parentItems.push({ ...line, farmer: product.farmer });
        orderLines.push({ ...line, farmer: product.farmer, deliveryMethod: product.deliveryMethod || 'platform' });
        total += product.price * quantity;
      }
      const farmerOrders = [];
      for (const group of groupOrderLinesByFarmerAndDelivery(orderLines)) {
        const subtotal = group.items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
        const [farmerOrder] = await FarmerOrder.create([{ farmer: group.farmer, items: group.items, subtotal, deliveryMethod: group.deliveryMethod }], { session });
        farmerOrders.push(farmerOrder._id);
      }
      [createdOrder] = await Order.create([{
        customer: req.user._id, items: parentItems, farmerOrders,
        address: { name: address.name.trim(), phone: address.phone.trim(), line1: address.line1.trim(), city: String(address.city || 'Hyderabad').trim(), pinCode: String(address.pinCode) },
        paymentMethod: 'cod', paymentStatus: 'pending', total
      }], { session });
    });
    res.status(201).json({ order: createdOrder });
  } finally {
    await session.endSession();
  }
}));
app.get('/api/orders/mine', protect, wrap(async (req, res) => {
  if (req.user.role === 'farmer') return res.json({ orders: await FarmerOrder.find({ farmer: req.user._id }).sort({ createdAt: -1 }) });
  const query = req.user.role === 'admin' ? {} : { customer: req.user._id };
  const orders = await Order.find(query)
    .populate({ path: 'farmerOrders', populate: { path: 'farmer', select: 'name' } })
    .sort({ createdAt: -1 }).limit(req.user.role === 'admin' ? 100 : 50);
  const withFulfilmentStatus = orders.map(order => {
    const data = order.toObject();
    data.status = deriveParentOrderStatus(data.farmerOrders);
    return data;
  });
  res.json({ orders: withFulfilmentStatus });
}));
app.patch('/api/orders/farmer/:id/status', protect, allow('farmer'), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid order ID.' });
  const order = await FarmerOrder.findOne({ _id: req.params.id, farmer: req.user._id });
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  if (!canTransitionOrder(order.status, req.body.status)) return res.status(409).json({ message: `Cannot move an order from ${order.status} to ${req.body.status}.` });
  order.status = req.body.status;
  await order.save();
  res.json({ order });
}));

// Admin-only routes.
app.use('/api/admin', protect, allow('admin'));
app.get('/api/admin/overview', wrap(async (_req, res) => {
  const [pendingFarmers, users, orders] = await Promise.all([Farmer.countDocuments({ approvalStatus: 'pending' }), User.countDocuments(), Order.countDocuments()]);
  res.json({ pendingFarmers, users, orders });
}));
app.get('/api/admin/orders', wrap(async (_req, res) => {
  const orders = await Order.find().populate('customer', 'name email').populate({ path: 'farmerOrders', populate: { path: 'farmer', select: 'name' } }).sort({ createdAt: -1 }).limit(200);
  res.json({ orders: orders.map(order => { const data = order.toObject(); data.status = deriveParentOrderStatus(data.farmerOrders); return data; }) });
}));
app.get('/api/admin/farmers', wrap(async (_req, res) => res.json({ farmers: await Farmer.find().populate('user', 'name email phone').sort({ createdAt: -1 }) })));
app.patch('/api/admin/farmers/:id/approval', wrap(async (req, res) => {
  if (!['approved', 'rejected', 'pending'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid approval status.' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid farmer ID.' });
  const farmer = await Farmer.findByIdAndUpdate(req.params.id, { approvalStatus: req.body.status }, { new: true, runValidators: true }).populate('user', 'name email');
  if (!farmer) return res.status(404).json({ message: 'Farmer not found.' });
  res.json({ farmer });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Unexpected server error.' });
});

if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  console.error('Set MONGODB_URI and JWT_SECRET in server/.env');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(process.env.PORT || 5000, () => console.log(`FarmFresh API ready on port ${process.env.PORT || 5000}`)))
  .catch(error => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
