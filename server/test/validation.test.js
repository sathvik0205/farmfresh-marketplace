const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanPinCodes, validEmail, validDeliveryAddress, validProductInput, canTransitionOrder, groupOrderLinesByFarmerAndDelivery, deriveParentOrderStatus } = require('../src/validation');

test('PIN codes are trimmed, deduplicated and six digits only', () => {
  assert.deepEqual(cleanPinCodes(['500001', ' 500001 ', '12', 'abcdef', null]), ['500001']);
  assert.deepEqual(cleanPinCodes('500001'), []);
});

test('email validation rejects malformed addresses', () => {
  assert.equal(validEmail('person@example.com'), true);
  assert.equal(validEmail('not-an-email'), false);
  assert.equal(validEmail(null), false);
});

test('product creation requires supported category, valid price and stock', () => {
  const good = { name: 'Tomatoes', category: 'Vegetables', price: 30, stock: 12, unit: 'kg', deliveryMethod: 'platform', description: '' };
  assert.equal(validProductInput(good), null);
  assert.match(validProductInput({ ...good, category: 'Fake category' }), /category/);
  assert.match(validProductInput({ ...good, price: -1 }), /Price/);
  assert.match(validProductInput({ ...good, stock: 1.5 }), /Stock/);
});

test('partial product updates validate only supplied fields', () => {
  assert.equal(validProductInput({ stock: 0 }, true), null);
  assert.match(validProductInput({ unit: 'truckload' }, true), /unit/);
  assert.match(validProductInput({ description: 'x'.repeat(1001) }, true), /Description/);
});

test('farmer order status follows the allowed forward workflow', () => {
  assert.equal(canTransitionOrder('placed', 'accepted'), true);
  assert.equal(canTransitionOrder('accepted', 'packed'), true);
  assert.equal(canTransitionOrder('packed', 'out_for_delivery'), true);
  assert.equal(canTransitionOrder('out_for_delivery', 'delivered'), true);
  assert.equal(canTransitionOrder('placed', 'delivered'), false);
  assert.equal(canTransitionOrder('delivered', 'packed'), false);
  assert.equal(canTransitionOrder('cancelled', 'accepted'), false);
});


test('parent order status reflects all farmer fulfilment orders', () => {
  assert.equal(deriveParentOrderStatus([]), 'placed');
  assert.equal(deriveParentOrderStatus([{ status: 'accepted' }, { status: 'placed' }]), 'accepted');
  assert.equal(deriveParentOrderStatus([{ status: 'out_for_delivery' }, { status: 'packed' }]), 'out_for_delivery');
  assert.equal(deriveParentOrderStatus([{ status: 'delivered' }, { status: 'delivered' }]), 'delivered');
  assert.equal(deriveParentOrderStatus([{ status: 'cancelled' }, { status: 'cancelled' }]), 'cancelled');
  assert.equal(deriveParentOrderStatus([{ status: 'delivered' }, { status: 'cancelled' }]), 'partially_fulfilled');
});

test('delivery address validation rejects malformed field types and lengths', () => {
  assert.equal(validDeliveryAddress({ name: 'A', phone: '9999999999', line1: 'Road', city: 'Hyderabad', pinCode: '500001' }), true);
  assert.equal(validDeliveryAddress({ name: 12, phone: '9999999999', line1: 'Road', pinCode: '500001' }), false);
  assert.equal(validDeliveryAddress({ name: 'A', phone: '9999999999', line1: 'Road', pinCode: '123' }), false);
  assert.equal(validDeliveryAddress({ name: 'A'.repeat(101), phone: '9999999999', line1: 'Road', pinCode: '500001' }), false);
  assert.equal(validDeliveryAddress(null), false);
});


test('checkout separates fulfilments by farmer and delivery method', () => {
  const groups = groupOrderLinesByFarmerAndDelivery([
    { farmer: 'farmer-a', deliveryMethod: 'farmer', name: 'Tomatoes', quantity: 1, unitPrice: 20 },
    { farmer: 'farmer-a', deliveryMethod: 'platform', name: 'Rice', quantity: 2, unitPrice: 40 },
    { farmer: 'farmer-b', deliveryMethod: 'platform', name: 'Mangoes', quantity: 1, unitPrice: 60 }
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => [g.farmer, g.deliveryMethod, g.items.length]), [
    ['farmer-a', 'farmer', 1], ['farmer-a', 'platform', 1], ['farmer-b', 'platform', 1]
  ]);
  assert.equal(groups[0].items[0].deliveryMethod, undefined);
});
