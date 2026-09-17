function ensureWalletSchema_() {
  var spreadsheet = getSpreadsheet_();
  ['CUSTOMERS', 'CUSTOMER_CARDS', 'CUSTOMER_SESSIONS', 'LOYALTY_PROGRAMS', 'TRANSACTIONS', 'REDEMPTIONS', 'PROMOTIONS'].forEach(function(sheetName) {
    ensureSheet_(spreadsheet, sheetName, SHEET_SCHEMAS[sheetName]);
  });
}

function normalizeCustomerPhone_(phone) {
  return normalizePhone_(phone);
}

function findCustomerByPhone_(phone) {
  ensureWalletSchema_();

  var normalized = normalizeCustomerPhone_(phone);
  var customer = findRowByValue_('CUSTOMERS', 'phone_normalized', normalized);

  if (customer) {
    return ensureCustomerWalletFields_(customer);
  }

  customer = findRowByValue_('CUSTOMERS', 'phone', normalized) || findRowByValue_('CUSTOMERS', 'phone', String(phone || '').trim());

  if (customer) {
    return ensureCustomerWalletFields_(customer);
  }

  return null;
}

function getCustomerByPhone_(phone) {
  return findCustomerByPhone_(phone);
}

function getCustomerByWalletId_(walletId) {
  ensureWalletSchema_();

  var customer = findRowByValue_('CUSTOMERS', 'wallet_id', String(walletId || '').trim().toUpperCase());
  return customer ? ensureCustomerWalletFields_(customer) : null;
}

function getCustomerById_(customerId) {
  ensureWalletSchema_();

  var customer = findRowByValue_('CUSTOMERS', 'customer_id', customerId);
  return customer ? ensureCustomerWalletFields_(customer) : null;
}

function createCustomer_(data) {
  ensureWalletSchema_();

  var timestamp = nowIso_();
  var phoneNormalized = normalizeCustomerPhone_(data.phone);
  var customerId = generateId_('CUS');
  var walletId = generateUniqueWalletId_();

  appendObject_('CUSTOMERS', {
    customer_id: customerId,
    wallet_id: walletId,
    full_name: sanitizeText_(data.full_name || data.name || 'Cliente Loyalty', 140),
    phone: phoneNormalized,
    phone_normalized: phoneNormalized,
    email: normalizeEmail_(data.email || ''),
    birthday: sanitizeText_(data.birthday || '', 40),
    avatar_url: sanitizeText_(data.avatar_url || '', 500),
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    last_access_at: timestamp
  });

  var customer = findRowByValue_('CUSTOMERS', 'customer_id', customerId);

  logActivity_('', '', 'wallet_created', 'customer', customerId, {
    wallet_id: walletId
  });

  appendTransaction_({
    type: 'wallet_created',
    customer_id: customerId,
    notes: 'Wallet creada',
    amount: '',
    points_change: 0,
    stamps_change: 0,
    visits_change: 0
  });

  return customer;
}

function updateCustomerProfile_(customer, data) {
  if (!customer || !customer._rowNumber) {
    return customer;
  }

  var updates = {
    updated_at: nowIso_(),
    last_access_at: nowIso_(),
    status: customer.status || 'active'
  };

  if (data.full_name || data.name) {
    updates.full_name = sanitizeText_(data.full_name || data.name, 140);
  }

  if (data.phone) {
    updates.phone = normalizeCustomerPhone_(data.phone);
    updates.phone_normalized = normalizeCustomerPhone_(data.phone);
  }

  if (data.email !== undefined) {
    updates.email = normalizeEmail_(data.email || customer.email || '');
  }

  if (data.birthday !== undefined) {
    updates.birthday = sanitizeText_(data.birthday || customer.birthday || '', 40);
  }

  if (data.avatar_url !== undefined) {
    updates.avatar_url = sanitizeText_(data.avatar_url || customer.avatar_url || '', 500);
  }

  updateRowByNumber_('CUSTOMERS', customer._rowNumber, updates);
  return getCustomerById_(customer.customer_id);
}

function ensureCustomerWalletFields_(customer) {
  var updates = {};

  if (!customer.wallet_id) {
    updates.wallet_id = generateUniqueWalletId_();
  }

  if (!customer.phone_normalized && customer.phone) {
    updates.phone_normalized = normalizeCustomerPhone_(customer.phone);
  }

  if (customer.phone && customer.phone !== normalizeCustomerPhone_(customer.phone)) {
    updates.phone = normalizeCustomerPhone_(customer.phone);
  }

  if (!customer.updated_at) {
    updates.updated_at = customer.created_at || nowIso_();
  }

  if (!customer.status) {
    updates.status = 'active';
  }

  if (Object.keys(updates).length > 0 && customer._rowNumber) {
    updateRowByNumber_('CUSTOMERS', customer._rowNumber, updates);
    return findRowByValue_('CUSTOMERS', 'customer_id', customer.customer_id);
  }

  return customer;
}

function generateUniqueWalletId_() {
  var walletId = generateId_('WALLET');

  while (findRowByValue_('CUSTOMERS', 'wallet_id', walletId)) {
    walletId = generateId_('WALLET');
  }

  return walletId;
}

function createCustomerSession_(customer) {
  ensureWalletSchema_();

  var timestamp = nowIso_();
  var expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60000).toISOString();
  var session = {
    session_id: generateId_('CSES'),
    customer_id: customer.customer_id,
    wallet_id: customer.wallet_id,
    token: generateSecureToken_(),
    created_at: timestamp,
    last_access_at: timestamp,
    expires_at: expiresAt,
    status: 'active'
  };

  appendObject_('CUSTOMER_SESSIONS', session);

  if (customer._rowNumber) {
    updateRowByNumber_('CUSTOMERS', customer._rowNumber, {
      last_access_at: timestamp
    });
  }

  return session;
}

function validateCustomerSession_(token) {
  ensureWalletSchema_();

  if (!token) {
    throw appError_('Sesion de cliente requerida.', 'customer_unauthorized');
  }

  var session = findRowByValue_('CUSTOMER_SESSIONS', 'token', token);

  if (!session || session.status !== 'active') {
    throw appError_('Sesion de cliente invalida.', 'customer_unauthorized');
  }

  var expiresAt = new Date(session.expires_at);

  if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    updateRowByNumber_('CUSTOMER_SESSIONS', session._rowNumber, {
      status: 'expired'
    });
    throw appError_('Sesion de cliente expirada.', 'customer_unauthorized');
  }

  var customer = getCustomerById_(session.customer_id);

  if (!customer || customer.status !== 'active') {
    throw appError_('Cliente inactivo o no encontrado.', 'customer_unauthorized');
  }

  var now = nowIso_();
  updateRowByNumber_('CUSTOMER_SESSIONS', session._rowNumber, {
    last_access_at: now
  });
  updateRowByNumber_('CUSTOMERS', customer._rowNumber, {
    last_access_at: now
  });

  return {
    session: session,
    customer: customer
  };
}

function getCustomerContext_(data) {
  return validateCustomerSession_(data.customer_token || data.token || '');
}

function publicCustomer_(customer) {
  return {
    customer_id: customer.customer_id,
    wallet_id: customer.wallet_id || '',
    full_name: customer.full_name,
    phone: customer.phone || '',
    phone_normalized: customer.phone_normalized || customer.phone || '',
    email: customer.email || '',
    birthday: customer.birthday || '',
    avatar_url: customer.avatar_url || '',
    status: customer.status || ''
  };
}

function publicCustomerSession_(session) {
  return {
    customer_id: session.customer_id,
    wallet_id: session.wallet_id,
    token: session.token,
    expires_at: session.expires_at
  };
}

function requestCustomerOtp_(data) {
  requireFields_(data, ['phone']);

  return {
    phone_normalized: normalizeCustomerPhone_(data.phone),
    otp_configured: false,
    message: 'OTP aun no esta conectado. En esta version se usa identificacion por telefono.'
  };
}

function verifyCustomerOtp_(data) {
  requireFields_(data, ['phone', 'otp']);

  throw appError_('OTP aun no esta conectado. Activa un proveedor WhatsApp/SMS antes de usarlo en produccion.', 'otp_not_configured');
}

function registerCustomer_(data) {
  return registerOrAttachCustomer_(data);
}
