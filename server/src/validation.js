const PRODUCT_CATEGORIES = [
  'Vegetables', 'Fruits', 'Dairy & eggs', 'Grains & millets',
  'Pulses & legumes', 'Spices', 'Oilseeds & cooking oils', 'Other farm products'
];
const PRODUCT_UNITS = ['kg', 'g', '500 g', '250 g', 'litre', 'ml', 'dozen', 'packet', 'piece'];
const DELIVERY_METHODS = ['farmer', 'platform'];
const ORDER_TRANSITIONS = { placed: ['accepted', 'cancelled'], accepted: ['packed', 'cancelled'], packed: ['out_for_delivery', 'cancelled'], out_for_delivery: ['delivered'], delivered: [], cancelled: [] };
function canTransitionOrder(current, next) { return Boolean(ORDER_TRANSITIONS[current]?.includes(next)); }
function groupOrderLinesByFarmerAndDelivery(lines = []) {
  const groups = new Map();
  for (const line of lines) {
    const farmer = String(line.farmer);
    const deliveryMethod = line.deliveryMethod === 'farmer' ? 'farmer' : 'platform';
    const key = `${farmer}:${deliveryMethod}`;
    if (!groups.has(key)) groups.set(key, { farmer: line.farmer, deliveryMethod, items: [] });
    const { deliveryMethod: _ignored, farmer: _farmer, ...item } = line;
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}
function deriveParentOrderStatus(farmerOrders = []) {
  const statuses = farmerOrders.map(order => order?.status).filter(Boolean);
  if (!statuses.length) return 'placed';
  if (statuses.every(status => status === 'cancelled')) return 'cancelled';
  if (statuses.every(status => status === 'delivered')) return 'delivered';
  if (statuses.every(status => ['delivered', 'cancelled'].includes(status))) return 'partially_fulfilled';
  if (statuses.includes('out_for_delivery')) return 'out_for_delivery';
  if (statuses.includes('packed')) return 'packed';
  if (statuses.includes('accepted')) return 'accepted';
  return 'placed';
}

function cleanPinCodes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map(x => x.trim()).filter(x => /^\d{6}$/.test(x)))];
}
function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function validDeliveryAddress(address) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return false;
  const fields = ['name', 'phone', 'line1'];
  if (!fields.every(key => typeof address[key] === 'string' && address[key].trim().length > 0)) return false;
  if (address.name.trim().length > 100 || address.phone.trim().length > 30 || address.line1.trim().length > 300) return false;
  if (address.city !== undefined && (typeof address.city !== 'string' || address.city.trim().length > 100)) return false;
  return typeof address.pinCode === 'string' || typeof address.pinCode === 'number' ? /^\d{6}$/.test(String(address.pinCode)) : false;
}
function validProductInput(body, partial = false) {
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) return 'Product name is required and must be at most 100 characters.';
  }
  if (!partial || body.category !== undefined) {
    if (!PRODUCT_CATEGORIES.includes(body.category)) return 'Choose a valid product category.';
  }
  if (!partial || body.price !== undefined) {
    if (!Number.isFinite(Number(body.price)) || Number(body.price) <= 0 || Number(body.price) > 10000000) return 'Price must be greater than zero and within the allowed limit.';
  }
  if (!partial || body.stock !== undefined) {
    if (!Number.isInteger(Number(body.stock)) || Number(body.stock) < 0 || Number(body.stock) > 1000000) return 'Stock must be a whole number between 0 and 1,000,000.';
  }
  if (body.unit !== undefined && !PRODUCT_UNITS.includes(body.unit)) return 'Choose a valid product unit.';
  if (body.deliveryMethod !== undefined && !DELIVERY_METHODS.includes(body.deliveryMethod)) return 'Invalid delivery method.';
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 1000)) return 'Description must be 1,000 characters or fewer.';
  if (body.availablePinCodes !== undefined && !Array.isArray(body.availablePinCodes)) return 'PIN codes must be provided as a list.';
  return null;
}
module.exports = { PRODUCT_CATEGORIES, PRODUCT_UNITS, DELIVERY_METHODS, ORDER_TRANSITIONS, canTransitionOrder, groupOrderLinesByFarmerAndDelivery, deriveParentOrderStatus, cleanPinCodes, validEmail, validDeliveryAddress, validProductInput };
