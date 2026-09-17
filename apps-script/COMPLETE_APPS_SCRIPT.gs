// Loyalty Apps Script complete backend
// Paste this entire file into Google Apps Script if you prefer one file instead of multiple .gs files.
// Then configure Script Properties and run setupSystem(), then createSuperAdmin().

// ==================================================
// Code.gs
// ==================================================
function doGet(e) {
  return handleHttpRequest_(e, 'GET');
}

function doPost(e) {
  return handleHttpRequest_(e, 'POST');
}

function handleHttpRequest_(e, method) {
  try {
    var request = buildRequest_(e, method);
    var data = routeAction_(request);

    return jsonResponse_({
      success: true,
      data: data || {},
      message: 'Operacion realizada correctamente'
    });
  } catch (error) {
    logServerError_(error);

    return jsonResponse_({
      success: false,
      message: error && error.message ? error.message : 'Error interno',
      error: error && error.code ? error.code : 'internal_error'
    });
  }
}

function buildRequest_(e, method) {
  var parameters = e && e.parameter ? e.parameter : {};
  var body = {};

  if (method === 'POST' && e && e.postData && e.postData.contents) {
    body = parseJsonBody_(e.postData.contents);
  }

  var data = body.data || {};
  var action = parameters.action || body.action || data.action;
  var token = body.token || data.token || parameters.token || '';

  return {
    action: String(action || '').trim(),
    data: data,
    method: method,
    parameters: parameters,
    token: token
  };
}

function routeAction_(request) {
  switch (request.action) {
    case 'health':
      return getHealth_();
    case 'login':
      return loginUser_(request.data);
    case 'logout':
      return logoutUser_(requireSession_(request.token));
    case 'me':
      return getCurrentUser_(requireSession_(request.token));
    case 'registerBusiness':
      return registerBusinessRequest_(request.data);
    case 'getPublicBusiness':
      return getPublicBusiness_(request.data);
    case 'lookupCustomerPhone':
      return lookupCustomerPhone_(request.data);
    case 'registerCustomerWallet':
      return registerCustomerWallet_(request.data);
    case 'attachBusinessCard':
      return attachBusinessCard_(request.data);
    case 'getCustomerWallet':
      return getCustomerWallet_(request.data);
    case 'getWalletCards':
      return getWalletCards_(request.data);
    case 'getWalletPromotions':
      return getWalletPromotions_(request.data);
    case 'getWalletHistory':
      return getWalletHistory_(request.data);
    case 'getWalletQr':
      return getWalletQr_(request.data);
    case 'requestCustomerOtp':
      return requestCustomerOtp_(request.data);
    case 'verifyCustomerOtp':
      return verifyCustomerOtp_(request.data);
    case 'registerCustomer':
      return registerCustomer_(request.data);
    case 'getPublicCard':
      return getPublicCard_(request.data);
    case 'getAdminStats':
      return getAdminStats_(requireSession_(request.token, ['super_admin']));
    case 'getPendingRequests':
      return getPendingRequests_(requireSession_(request.token, ['super_admin']));
    case 'getRequests':
      return getRequests_(requireSession_(request.token, ['super_admin']), request.data);
    case 'approveBusiness':
      return approveBusinessRequest_(requireSession_(request.token, ['super_admin']), request.data);
    case 'rejectBusiness':
      return rejectBusinessRequest_(requireSession_(request.token, ['super_admin']), request.data);
    case 'listBusinesses':
      return listBusinesses_(requireSession_(request.token, ['super_admin']), request.data);
    case 'setBusinessBilling':
      return setBusinessBilling_(requireSession_(request.token, ['super_admin']), request.data);
    case 'suspendBusinessForPayment':
      return suspendBusinessForPayment_(requireSession_(request.token, ['super_admin']), request.data);
    case 'reactivateBusiness':
      return reactivateBusiness_(requireSession_(request.token, ['super_admin']), request.data);
    case 'resetBusinessOwnerPassword':
      return resetBusinessOwnerPassword_(requireSession_(request.token, ['super_admin']), request.data);
    case 'listAdminCustomers':
      return listAdminCustomers_(requireSession_(request.token, ['super_admin']), request.data);
    case 'analyzeCustomerDuplicates':
      return analyzeCustomerDuplicates_(requireSession_(request.token, ['super_admin']), request.data);
    case 'getBusinessHome':
      return getBusinessHome_(requireSession_(request.token, ['business_owner', 'staff']));
    case 'listBusinessCustomers':
      return listBusinessCustomers_(requireSession_(request.token, ['business_owner', 'staff']), request.data);
    case 'scanWallet':
      return scanWallet_(requireSession_(request.token, ['business_owner', 'staff']), request.data);
    case 'getBusinessCustomerCard':
      return getBusinessCustomerCard_(requireSession_(request.token, ['business_owner', 'staff']), request.data);
    case 'applyBusinessCustomerAction':
      return applyBusinessCustomerAction_(requireSession_(request.token, ['business_owner', 'staff']), request.data);
    default:
      throw appError_('Accion no implementada: ' + request.action, 'not_implemented');
  }
}

function getHealth_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('SPREADSHEET_ID') || '';

  return {
    app: 'Loyalty',
    phase: '1',
    configured: Boolean(spreadsheetId),
    spreadsheetId: spreadsheetId
  };
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================================================
// Security.gs
// ==================================================
function appError_(message, code) {
  var error = new Error(message);
  error.code = code || 'bad_request';
  return error;
}

function parseJsonBody_(contents) {
  if (!contents) {
    return {};
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw appError_('JSON invalido en la solicitud.', 'invalid_json');
  }
}

function requireFields_(data, fields) {
  fields.forEach(function(field) {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
      throw appError_('Falta el campo obligatorio: ' + field, 'missing_field');
    }
  });
}

function sanitizeText_(value, maxLength) {
  var text = String(value || '').trim();

  if (maxLength && text.length > maxLength) {
    return text.substring(0, maxLength);
  }

  return text;
}

function ensureAdminSecret_() {
  var properties = PropertiesService.getScriptProperties();
  var currentSecret = properties.getProperty('ADMIN_SECRET');

  if (!currentSecret) {
    properties.setProperty('ADMIN_SECRET', generateSecureToken_());
  }
}

function generateSecureToken_() {
  var source = Utilities.getUuid() + Utilities.getUuid() + String(Date.now()) + String(Math.random());
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source));
}

function createPasswordHash_(password) {
  if (!password || String(password).length < 6) {
    throw appError_('La contrasena debe tener al menos 6 caracteres.', 'weak_password');
  }

  ensureAdminSecret_();

  var salt = generateSecureToken_().substring(0, 32);
  var hash = hashPasswordWithSalt_(password, salt);

  return 'sha256$' + salt + '$' + hash;
}

function verifyPassword_(password, storedHash) {
  var parts = String(storedHash || '').split('$');

  if (parts.length !== 3 || parts[0] !== 'sha256') {
    return false;
  }

  return constantTimeEquals_(hashPasswordWithSalt_(password, parts[1]), parts[2]);
}

function hashPasswordWithSalt_(password, salt) {
  var secret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
  var input = String(password) + ':' + String(salt) + ':' + secret;
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input));
}

function bytesToHex_(bytes) {
  return bytes.map(function(byte) {
    var value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function constantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');

  if (left.length !== right.length) {
    return false;
  }

  var difference = 0;

  for (var index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

// ==================================================
// Utils.gs
// ==================================================
var SHEET_SCHEMAS = Object.freeze({
  CONFIG: ['key', 'value', 'description'],
  BUSINESSES: [
    'business_id',
    'business_code',
    'business_name',
    'slug',
    'owner_user_id',
    'logo_url',
    'primary_color',
    'secondary_color',
    'phone',
    'whatsapp',
    'email',
    'city',
    'address',
    'business_type',
    'status',
    'plan',
    'billing_cycle',
    'billing_status',
    'next_payment_date',
    'suspended_reason',
    'suspended_at',
    'reactivated_at',
    'created_at',
    'approved_at'
  ],
  USERS: [
    'user_id',
    'business_id',
    'full_name',
    'email',
    'phone',
    'password_hash',
    'role',
    'status',
    'created_at',
    'last_login'
  ],
  CUSTOMERS: [
    'customer_id',
    'wallet_id',
    'full_name',
    'phone',
    'phone_normalized',
    'email',
    'birthday',
    'avatar_url',
    'status',
    'created_at',
    'updated_at',
    'last_access_at'
  ],
  CUSTOMER_CARDS: [
    'card_id',
    'customer_id',
    'business_id',
    'program_id',
    'points',
    'stamps',
    'visits',
    'lifetime_points',
    'welcome_reward_status',
    'coupon_tier',
    'coupon_status',
    'coupon_title',
    'status',
    'created_at',
    'updated_at'
  ],
  CUSTOMER_COUPONS: [
    'coupon_id',
    'customer_id',
    'business_id',
    'card_id',
    'tier',
    'title',
    'description',
    'status',
    'trigger_count',
    'created_at',
    'redeemed_at'
  ],
  LOYALTY_PROGRAMS: [
    'program_id',
    'business_id',
    'program_name',
    'program_type',
    'goal',
    'points_per_dollar',
    'reward_id',
    'welcome_reward_enabled',
    'welcome_reward_type',
    'welcome_reward_value',
    'welcome_reward_title',
    'welcome_reward_description',
    'status',
    'created_at',
    'updated_at'
  ],
  TRANSACTIONS: [
    'transaction_id',
    'business_id',
    'customer_id',
    'card_id',
    'staff_user_id',
    'type',
    'amount',
    'points_change',
    'stamps_change',
    'visits_change',
    'previous_balance',
    'new_balance',
    'notes',
    'reward_id',
    'created_at'
  ],
  REWARDS: [
    'reward_id',
    'business_id',
    'program_id',
    'name',
    'description',
    'points_required',
    'stamps_required',
    'visits_required',
    'status'
  ],
  REDEMPTIONS: [
    'redemption_id',
    'business_id',
    'customer_id',
    'card_id',
    'reward_id',
    'staff_user_id',
    'status',
    'created_at',
    'redeemed_at'
  ],
  PROMOTIONS: [
    'promotion_id',
    'business_id',
    'title',
    'description',
    'image_url',
    'start_date',
    'end_date',
    'status',
    'created_at'
  ],
  REQUESTS: [
    'request_id',
    'business_name',
    'owner_name',
    'email',
    'owner_password_hash',
    'phone',
    'whatsapp',
    'city',
    'address',
    'business_type',
    'logo_url',
    'primary_color',
    'secondary_color',
    'loyalty_type',
    'suggested_goal',
    'suggested_reward',
    'status',
    'created_at',
    'reviewed_at',
    'reviewed_by',
    'rejection_reason'
  ],
  CUSTOMER_SESSIONS: [
    'session_id',
    'customer_id',
    'wallet_id',
    'token',
    'created_at',
    'last_access_at',
    'expires_at',
    'status'
  ],
  SESSIONS: ['session_id', 'user_id', 'business_id', 'role', 'token', 'created_at', 'expires_at', 'status'],
  ACTIVITY_LOG: ['log_id', 'user_id', 'business_id', 'action', 'entity', 'entity_id', 'details', 'created_at']
});

var DEFAULT_CONFIG_ROWS = Object.freeze([
  {
    key: 'APP_NAME',
    value: 'Loyalty',
    description: 'Nombre publico de la plataforma.'
  },
  {
    key: 'APP_URL',
    value: 'https://appiba.github.io/tarjeta_digital/',
    description: 'URL publicada en GitHub Pages.'
  },
  {
    key: 'ADMIN_EMAIL',
    value: '',
    description: 'Correo principal del administrador general.'
  },
  {
    key: 'DEFAULT_PRIMARY_COLOR',
    value: '#1f5eff',
    description: 'Color principal por defecto para nuevos negocios.'
  },
  {
    key: 'DEFAULT_SECONDARY_COLOR',
    value: '#12b981',
    description: 'Color secundario por defecto para nuevos negocios.'
  },
  {
    key: 'SESSION_DURATION',
    value: '1440',
    description: 'Duracion de sesion en minutos.'
  }
]);

function createSpreadsheetForSystem() {
  var spreadsheet = SpreadsheetApp.create('Loyalty Database');
  setSpreadsheetId(spreadsheet.getId());
  setupSystem();

  Logger.log('Spreadsheet creado: ' + spreadsheet.getUrl());
  return {
    spreadsheetId: spreadsheet.getId(),
    url: spreadsheet.getUrl()
  };
}

function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) {
    throw appError_('Debes indicar el ID del Google Sheet.', 'missing_spreadsheet_id');
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', String(spreadsheetId).trim());
  Logger.log('SPREADSHEET_ID configurado.');

  return {
    spreadsheetId: String(spreadsheetId).trim()
  };
}

function setupSystem() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureAdminSecret_();

    var spreadsheet = getSpreadsheet_();
    var sheetNames = Object.keys(SHEET_SCHEMAS);

    sheetNames.forEach(function(sheetName) {
      ensureSheet_(spreadsheet, sheetName, SHEET_SCHEMAS[sheetName]);
    });

    seedDefaultConfig_();
    var folders = ensureDriveFolders_();

    var result = {
      spreadsheetId: spreadsheet.getId(),
      sheets: sheetNames,
      drive: folders
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw appError_('Configura SPREADSHEET_ID en Script Properties o ejecuta createSpreadsheetForSystem().', 'missing_spreadsheet_id');
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);

  if (!sheet) {
    throw appError_('No existe la hoja ' + sheetName + '. Ejecuta setupSystem().', 'missing_sheet');
  }

  return sheet;
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var existingHeaders = getHeadersFromSheet_(sheet);
    var missingHeaders = headers.filter(function(header) {
      return existingHeaders.indexOf(header) === -1;
    });

    if (missingHeaders.length > 0) {
      sheet
        .getRange(1, existingHeaders.length + 1, 1, missingHeaders.length)
        .setValues([missingHeaders]);
    }
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function seedDefaultConfig_() {
  DEFAULT_CONFIG_ROWS.forEach(function(configRow) {
    var existing = findRowByValue_('CONFIG', 'key', configRow.key);

    if (!existing) {
      appendObject_('CONFIG', configRow);
    }
  });
}

function getConfigValue_(key, fallback) {
  var row = findRowByValue_('CONFIG', 'key', key);
  return row && row.value !== '' ? row.value : fallback;
}

function setConfigValue_(key, value, description) {
  var existing = findRowByValue_('CONFIG', 'key', key);

  if (existing) {
    updateRowByNumber_('CONFIG', existing._rowNumber, {
      value: value,
      description: description || existing.description
    });
  } else {
    appendObject_('CONFIG', {
      key: key,
      value: value,
      description: description || ''
    });
  }
}

function getHeaders_(sheetName) {
  return getHeadersFromSheet_(getSheet_(sheetName));
}

function getHeadersFromSheet_(sheet) {
  if (sheet.getLastColumn() === 0) {
    return [];
  }

  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header).trim();
  });
}

function appendObject_(sheetName, values) {
  var sheet = getSheet_(sheetName);
  var headers = getHeadersFromSheet_(sheet);
  var row = headers.map(function(header) {
    return values[header] === undefined || values[header] === null ? '' : values[header];
  });

  sheet.appendRow(row);
  return values;
}

function findRowByValue_(sheetName, columnName, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  var headers = getHeadersFromSheet_(sheet);
  var columnIndex = headers.indexOf(columnName);

  if (columnIndex === -1) {
    throw appError_('No existe la columna ' + columnName + ' en ' + sheetName + '.', 'missing_column');
  }

  var finder = sheet
    .getRange(2, columnIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true);
  var cell = finder.findNext();

  if (!cell) {
    return null;
  }

  var rowNumber = cell.getRow();
  var rowValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var row = objectFromRow_(headers, rowValues);
  row._rowNumber = rowNumber;

  return row;
}

function findRowsByValue_(sheetName, columnName, value) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var headers = getHeadersFromSheet_(sheet);
  var columnIndex = headers.indexOf(columnName);

  if (columnIndex === -1) {
    throw appError_('No existe la columna ' + columnName + ' en ' + sheetName + '.', 'missing_column');
  }

  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];

  data.forEach(function(rowValues, index) {
    if (String(rowValues[columnIndex]) === String(value)) {
      var row = objectFromRow_(headers, rowValues);
      row._rowNumber = index + 2;
      rows.push(row);
    }
  });

  return rows;
}

function getAllRows_(sheetName) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var headers = getHeadersFromSheet_(sheet);
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return data.map(function(rowValues, index) {
    var row = objectFromRow_(headers, rowValues);
    row._rowNumber = index + 2;
    return row;
  });
}

function updateRowById_(sheetName, idColumn, idValue, updates) {
  var row = findRowByValue_(sheetName, idColumn, idValue);

  if (!row) {
    throw appError_('No se encontro el registro solicitado.', 'not_found');
  }

  updateRowByNumber_(sheetName, row._rowNumber, updates);
  return findRowByValue_(sheetName, idColumn, idValue);
}

function updateRowByNumber_(sheetName, rowNumber, updates) {
  var sheet = getSheet_(sheetName);
  var headers = getHeadersFromSheet_(sheet);

  Object.keys(updates).forEach(function(key) {
    var columnIndex = headers.indexOf(key);

    if (columnIndex !== -1) {
      sheet.getRange(rowNumber, columnIndex + 1).setValue(updates[key]);
    }
  });
}

function objectFromRow_(headers, rowValues) {
  var object = {};

  headers.forEach(function(header, index) {
    object[header] = rowValues[index] === undefined || rowValues[index] === null ? '' : rowValues[index];
  });

  return object;
}

function nowIso_() {
  return new Date().toISOString();
}

function generateId_(prefix) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var id = '';

  for (var index = 0; index < 8; index += 1) {
    id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return prefix + '-' + id;
}

function generateReadableCode_(prefix) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';

  for (var index = 0; index < 4; index += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return String(prefix || 'BIZ').toUpperCase().substring(0, 8) + '-' + code;
}

function generateTemporaryPassword_() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var password = 'Loy-';

  for (var index = 0; index < 12; index += 1) {
    password += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return password;
}

function slugify_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 64);
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone_(phone) {
  var raw = String(phone || '').trim();
  var digits = raw.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.indexOf('00') === 0) {
    digits = digits.substring(2);
  }

  if (digits.length === 10 && digits.charAt(0) === '0') {
    digits = '593' + digits.substring(1);
  } else if (digits.length === 9 && digits.charAt(0) === '9') {
    digits = '593' + digits;
  }

  return '+' + digits;
}

function safeJsonString_(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function logActivity_(userId, businessId, action, entity, entityId, details) {
  appendObject_('ACTIVITY_LOG', {
    log_id: generateId_('LOG'),
    user_id: userId || '',
    business_id: businessId || '',
    action: action || '',
    entity: entity || '',
    entity_id: entityId || '',
    details: safeJsonString_(details),
    created_at: nowIso_()
  });
}

function logServerError_(error) {
  console.error(error && error.stack ? error.stack : error);
}

// ==================================================
// Auth.gs
// ==================================================
function createSuperAdmin(name, email, password) {
  var properties = PropertiesService.getScriptProperties();
  var adminName = sanitizeText_(name || properties.getProperty('INITIAL_ADMIN_NAME') || 'Administrador General', 120);
  var adminEmail = normalizeEmail_(email || properties.getProperty('INITIAL_ADMIN_EMAIL') || getConfigValue_('ADMIN_EMAIL', ''));
  var adminPassword = password || properties.getProperty('INITIAL_ADMIN_PASSWORD');

  if (!adminEmail) {
    throw appError_('Configura INITIAL_ADMIN_EMAIL en Script Properties o pasa email a createSuperAdmin().', 'missing_admin_email');
  }

  if (!adminPassword) {
    throw appError_('Configura INITIAL_ADMIN_PASSWORD en Script Properties o pasa password a createSuperAdmin().', 'missing_admin_password');
  }

  var existing = findUserByEmail_(adminEmail);
  var passwordHash = createPasswordHash_(adminPassword);
  var timestamp = nowIso_();

  if (existing) {
    updateRowByNumber_('USERS', existing._rowNumber, {
      full_name: adminName,
      password_hash: passwordHash,
      role: 'super_admin',
      status: 'active'
    });
  } else {
    appendObject_('USERS', {
      user_id: generateId_('USR'),
      business_id: '',
      full_name: adminName,
      email: adminEmail,
      phone: '',
      password_hash: passwordHash,
      role: 'super_admin',
      status: 'active',
      created_at: timestamp,
      last_login: ''
    });
  }

  setConfigValue_('ADMIN_EMAIL', adminEmail, 'Correo principal del administrador general.');
  properties.deleteProperty('INITIAL_ADMIN_PASSWORD');

  Logger.log('Super admin listo: ' + adminEmail);
  return {
    email: adminEmail,
    role: 'super_admin',
    status: 'active'
  };
}

function loginUser_(data) {
  requireFields_(data, ['email', 'password']);

  var email = normalizeEmail_(data.email);
  var password = String(data.password || '');
  var user = findUserByEmail_(email);

  if (!user || user.status !== 'active' || !verifyPassword_(password, user.password_hash)) {
    throw appError_('Correo o contrasena incorrectos.', 'invalid_credentials');
  }

  var session = createSessionForUser_(user);

  updateRowByNumber_('USERS', user._rowNumber, {
    last_login: nowIso_()
  });

  logActivity_(user.user_id, user.business_id, 'login', 'session', session.session_id, {
    role: user.role
  });

  return {
    token: session.token,
    expires_at: session.expires_at,
    user: publicUser_(user)
  };
}

function logoutUser_(context) {
  updateRowByNumber_('SESSIONS', context.session._rowNumber, {
    status: 'revoked'
  });

  logActivity_(context.user.user_id, context.user.business_id, 'logout', 'session', context.session.session_id, {});

  return {
    loggedOut: true
  };
}

function getCurrentUser_(context) {
  return {
    user: publicUser_(context.user),
    session: publicSession_(context.session)
  };
}

function requireSession_(token, roles) {
  var context = validateSession_(token);

  if (roles && roles.length && roles.indexOf(context.user.role) === -1) {
    throw appError_('No autorizado.', 'forbidden');
  }

  return context;
}

function validateSession_(token) {
  if (!token) {
    throw appError_('No autorizado.', 'unauthorized');
  }

  var session = findRowByValue_('SESSIONS', 'token', token);

  if (!session || session.status !== 'active') {
    throw appError_('Sesion invalida.', 'unauthorized');
  }

  var expiresAt = new Date(session.expires_at);

  if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    updateRowByNumber_('SESSIONS', session._rowNumber, {
      status: 'expired'
    });
    throw appError_('Sesion expirada.', 'unauthorized');
  }

  var user = findRowByValue_('USERS', 'user_id', session.user_id);

  if (!user || user.status !== 'active') {
    throw appError_('Usuario inactivo o no encontrado.', 'unauthorized');
  }

  return {
    session: session,
    user: user
  };
}

function createSessionForUser_(user) {
  var durationMinutes = parseInt(getConfigValue_('SESSION_DURATION', '1440'), 10);
  var expiresAt = new Date(Date.now() + (durationMinutes || 1440) * 60000).toISOString();
  var session = {
    session_id: generateId_('SES'),
    user_id: user.user_id,
    business_id: user.business_id || '',
    role: user.role,
    token: generateSecureToken_(),
    created_at: nowIso_(),
    expires_at: expiresAt,
    status: 'active'
  };

  appendObject_('SESSIONS', session);
  return session;
}

function findUserByEmail_(email) {
  return findRowByValue_('USERS', 'email', normalizeEmail_(email));
}

function publicUser_(user) {
  return {
    user_id: user.user_id,
    business_id: user.business_id || '',
    full_name: user.full_name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    status: user.status,
    last_login: user.last_login || ''
  };
}

function publicSession_(session) {
  return {
    session_id: session.session_id,
    business_id: session.business_id || '',
    role: session.role,
    created_at: session.created_at,
    expires_at: session.expires_at,
    status: session.status
  };
}

// ==================================================
// Businesses.gs
// ==================================================
function assertBusinessAccess_(context, businessId) {
  if (context.user.role === 'super_admin') {
    return true;
  }

  if (!businessId || context.user.business_id !== businessId) {
    throw appError_('No autorizado para este negocio.', 'forbidden');
  }

  return true;
}

function getBusinessById_(businessId) {
  return findRowByValue_('BUSINESSES', 'business_id', businessId);
}

function getBusinessByCode_(businessCode) {
  return findRowByValue_('BUSINESSES', 'business_code', String(businessCode || '').trim().toUpperCase());
}

function getPublicBusiness_(data) {
  requireFields_(data, ['business_code']);

  var business = getBusinessByCode_(data.business_code);

  if (!business || business.status !== 'active') {
    throw appError_('Negocio no encontrado o inactivo.', 'business_not_found');
  }

  var program = getActiveProgramForBusiness_(business.business_id);
  var reward = program && program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;

  return {
    business: publicBusiness_(business),
    program: publicProgram_(program),
    reward: publicReward_(reward),
    welcome_reward: publicWelcomeReward_(program, null),
    customer_register_url: buildCustomerRegisterUrl_(business.business_code)
  };
}

function registerBusinessRequest_(data) {
  requireFields_(data, ['business_name', 'owner_name', 'email', 'owner_password', 'whatsapp', 'business_type']);
  ensureSheet_(getSpreadsheet_(), 'REQUESTS', SHEET_SCHEMAS.REQUESTS);

  var email = normalizeEmail_(data.email);
  var whatsapp = normalizePhone_(data.whatsapp);
  var loyaltyType = String(data.loyalty_type || 'STAMPS').toUpperCase();
  var ownerPasswordHash = createPasswordHash_(String(data.owner_password || ''));
  assertSupportedProgramType_(loyaltyType);

  if (findRowByValue_('USERS', 'email', email)) {
    throw appError_('Ya existe un usuario con ese correo.', 'duplicate_email');
  }

  var existingPending = findRowsByValue_('REQUESTS', 'email', email).filter(function(row) {
    return row.status === 'pending';
  });

  if (existingPending.length > 0) {
    if (!existingPending[0].owner_password_hash) {
      updateRowByNumber_('REQUESTS', existingPending[0]._rowNumber, {
        owner_password_hash: ownerPasswordHash
      });
      existingPending[0].owner_password_hash = ownerPasswordHash;
    }

    return publicRequest_(existingPending[0]);
  }

  var request = {
    request_id: generateId_('REQ'),
    business_name: sanitizeText_(data.business_name, 140),
    owner_name: sanitizeText_(data.owner_name, 140),
    email: email,
    owner_password_hash: ownerPasswordHash,
    phone: normalizePhone_(data.phone || data.whatsapp),
    whatsapp: whatsapp,
    city: sanitizeText_(data.city, 100),
    address: sanitizeText_(data.address, 180),
    business_type: sanitizeText_(data.business_type, 90),
    logo_url: sanitizeText_(data.logo_url, 500),
    primary_color: sanitizeText_(data.primary_color || getConfigValue_('DEFAULT_PRIMARY_COLOR', '#1f5eff'), 20),
    secondary_color: sanitizeText_(data.secondary_color || getConfigValue_('DEFAULT_SECONDARY_COLOR', '#12b981'), 20),
    loyalty_type: loyaltyType,
    suggested_goal: String(parseInt(data.suggested_goal || '10', 10) || 10),
    suggested_reward: sanitizeText_(data.suggested_reward || 'Premio especial', 180),
    status: 'pending',
    created_at: nowIso_(),
    reviewed_at: '',
    reviewed_by: '',
    rejection_reason: ''
  };

  appendObject_('REQUESTS', request);
  logActivity_('', '', 'business_request_created', 'request', request.request_id, {
    business_name: request.business_name,
    email: request.email
  });

  return publicRequest_(request);
}

function getPendingRequests_(context) {
  return {
    requests: findRowsByValue_('REQUESTS', 'status', 'pending').map(publicRequest_)
  };
}

function getRequests_(context, data) {
  var status = data && data.status ? String(data.status) : '';
  var rows = status ? findRowsByValue_('REQUESTS', 'status', status) : getAllRows_('REQUESTS');

  rows.sort(function(left, right) {
    return String(right.created_at).localeCompare(String(left.created_at));
  });

  return {
    requests: rows.map(publicRequest_)
  };
}

function approveBusinessRequest_(context, data) {
  requireFields_(data, ['request_id']);
  ensureSheet_(getSpreadsheet_(), 'REQUESTS', SHEET_SCHEMAS.REQUESTS);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var request = findRowByValue_('REQUESTS', 'request_id', data.request_id);

    if (!request) {
      throw appError_('Solicitud no encontrada.', 'not_found');
    }

    if (request.status !== 'pending') {
      throw appError_('La solicitud ya fue revisada.', 'request_already_reviewed');
    }

    if (findRowByValue_('USERS', 'email', request.email)) {
      throw appError_('Ya existe un usuario con ese correo.', 'duplicate_email');
    }

    var businessId = generateId_('BUS');
    var ownerUserId = generateId_('USR');
    var programId = generateId_('PRG');
    var rewardId = generateId_('RWD');
    var businessCode = generateUniqueBusinessCode_(request.business_name);
    var slug = slugify_(request.business_name) + '-' + businessCode.split('-').pop().toLowerCase();
    var hasOwnerPassword = Boolean(request.owner_password_hash);
    var temporaryPassword = hasOwnerPassword ? '' : generateTemporaryPassword_();
    var ownerPasswordHash = hasOwnerPassword ? request.owner_password_hash : createPasswordHash_(temporaryPassword);
    var timestamp = nowIso_();

    appendObject_('BUSINESSES', {
      business_id: businessId,
      business_code: businessCode,
      business_name: request.business_name,
      slug: slug,
      owner_user_id: ownerUserId,
      logo_url: request.logo_url || '',
      primary_color: request.primary_color || getConfigValue_('DEFAULT_PRIMARY_COLOR', '#1f5eff'),
      secondary_color: request.secondary_color || getConfigValue_('DEFAULT_SECONDARY_COLOR', '#12b981'),
      phone: request.phone || '',
      whatsapp: request.whatsapp || '',
      email: request.email,
      city: request.city || '',
      address: request.address || '',
      business_type: request.business_type || '',
      status: 'active',
      plan: 'starter',
      billing_cycle: 'monthly',
      billing_status: 'current',
      next_payment_date: nextPaymentDateForCycle_('monthly'),
      suspended_reason: '',
      suspended_at: '',
      reactivated_at: '',
      created_at: timestamp,
      approved_at: timestamp
    });

    appendObject_('USERS', {
      user_id: ownerUserId,
      business_id: businessId,
      full_name: request.owner_name,
      email: request.email,
      phone: request.phone || request.whatsapp || '',
      password_hash: ownerPasswordHash,
      role: 'business_owner',
      status: 'active',
      created_at: timestamp,
      last_login: ''
    });

    var goal = String(parseInt(request.suggested_goal || '10', 10) || 10);
    var loyaltyType = String(request.loyalty_type || 'STAMPS').toUpperCase();

    appendObject_('REWARDS', {
      reward_id: rewardId,
      business_id: businessId,
      program_id: programId,
      name: request.suggested_reward || 'Premio especial',
      description: request.suggested_reward || 'Premio especial',
      points_required: loyaltyType === 'POINTS' ? goal : '',
      stamps_required: loyaltyType === 'STAMPS' ? goal : '',
      visits_required: loyaltyType === 'VISITS' ? goal : '',
      status: 'active'
    });

    appendObject_('LOYALTY_PROGRAMS', {
      program_id: programId,
      business_id: businessId,
      program_name: 'Programa principal',
      program_type: loyaltyType,
      goal: goal,
      points_per_dollar: loyaltyType === 'POINTS' ? '1' : '',
      reward_id: rewardId,
      welcome_reward_enabled: '',
      welcome_reward_type: '',
      welcome_reward_value: '',
      welcome_reward_title: '',
      welcome_reward_description: '',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp
    });

    updateRowByNumber_('REQUESTS', request._rowNumber, {
      status: 'approved',
      reviewed_at: timestamp,
      reviewed_by: context.user.user_id,
      rejection_reason: ''
    });

    logActivity_(context.user.user_id, businessId, 'business_approved', 'request', request.request_id, {
      business_code: businessCode,
      owner_user_id: ownerUserId
    });

    var business = getBusinessById_(businessId);
    var businessLoginUrl = buildBusinessLoginUrl_();
    var customerRegisterUrl = buildCustomerRegisterUrl_(businessCode);
    var whatsappMessage = buildApprovalMessage_(
      request,
      business,
      temporaryPassword,
      hasOwnerPassword,
      businessLoginUrl,
      customerRegisterUrl
    );
    var emailResult = sendApprovalEmail_(
      request,
      business,
      temporaryPassword,
      hasOwnerPassword,
      businessLoginUrl,
      customerRegisterUrl,
      whatsappMessage
    );

    return {
      business: publicBusiness_(business),
      owner: {
        user_id: ownerUserId,
        full_name: request.owner_name,
        email: request.email,
        temporary_password: temporaryPassword,
        password_mode: hasOwnerPassword ? 'chosen' : 'temporary'
      },
      business_login_url: businessLoginUrl,
      customer_register_url: customerRegisterUrl,
      register_url: customerRegisterUrl,
      whatsapp_message: whatsappMessage,
      whatsapp_url: buildWhatsAppUrl_(request.whatsapp || request.phone, whatsappMessage),
      email_sent: emailResult.sent,
      email_error: emailResult.error || ''
    };
  } finally {
    lock.releaseLock();
  }
}

function rejectBusinessRequest_(context, data) {
  requireFields_(data, ['request_id', 'rejection_reason']);

  var request = findRowByValue_('REQUESTS', 'request_id', data.request_id);

  if (!request) {
    throw appError_('Solicitud no encontrada.', 'not_found');
  }

  if (request.status !== 'pending') {
    throw appError_('La solicitud ya fue revisada.', 'request_already_reviewed');
  }

  updateRowByNumber_('REQUESTS', request._rowNumber, {
    status: 'rejected',
    reviewed_at: nowIso_(),
    reviewed_by: context.user.user_id,
    rejection_reason: sanitizeText_(data.rejection_reason, 300)
  });

  logActivity_(context.user.user_id, '', 'business_rejected', 'request', request.request_id, {
    reason: data.rejection_reason
  });

  return {
    request_id: request.request_id,
    status: 'rejected'
  };
}

function listBusinesses_(context, data) {
  var status = data && data.status ? String(data.status) : '';
  var rows = status ? findRowsByValue_('BUSINESSES', 'status', status) : getAllRows_('BUSINESSES');

  rows.sort(function(left, right) {
    return String(right.created_at).localeCompare(String(left.created_at));
  });

  return {
    businesses: rows.map(publicBusiness_)
  };
}

function setBusinessBilling_(context, data) {
  requireFields_(data, ['business_id']);

  var business = getBusinessById_(data.business_id);

  if (!business) {
    throw appError_('Negocio no encontrado.', 'business_not_found');
  }

  var cycle = normalizeBillingCycle_(data.billing_cycle || business.billing_cycle || 'monthly');
  var billingStatus = normalizeBillingStatus_(data.billing_status || business.billing_status || 'current');
  var nextPaymentDate = sanitizeDateText_(data.next_payment_date || business.next_payment_date || nextPaymentDateForCycle_(cycle));

  updateRowByNumber_('BUSINESSES', business._rowNumber, {
    billing_cycle: cycle,
    billing_status: billingStatus,
    next_payment_date: nextPaymentDate
  });

  var updatedBusiness = getBusinessById_(business.business_id);

  logActivity_(context.user.user_id, business.business_id, 'business_billing_updated', 'business', business.business_id, {
    billing_cycle: cycle,
    billing_status: billingStatus,
    next_payment_date: nextPaymentDate
  });

  return {
    business: publicBusiness_(updatedBusiness),
    whatsapp_message: buildPaymentReminderMessage_(updatedBusiness),
    whatsapp_url: buildWhatsAppUrl_(updatedBusiness.whatsapp || updatedBusiness.phone, buildPaymentReminderMessage_(updatedBusiness))
  };
}

function suspendBusinessForPayment_(context, data) {
  requireFields_(data, ['business_id']);

  var business = getBusinessById_(data.business_id);

  if (!business) {
    throw appError_('Negocio no encontrado.', 'business_not_found');
  }

  var reason = sanitizeText_(data.reason || 'Pago pendiente de mensualidad o anualidad.', 300);
  var timestamp = nowIso_();

  updateRowByNumber_('BUSINESSES', business._rowNumber, {
    status: 'suspended',
    billing_status: 'overdue',
    suspended_reason: reason,
    suspended_at: timestamp
  });
  updateBusinessUsersStatus_(business.business_id, 'suspended');

  var updatedBusiness = getBusinessById_(business.business_id);
  var message = buildPaymentSuspensionMessage_(updatedBusiness);

  logActivity_(context.user.user_id, business.business_id, 'business_suspended_payment', 'business', business.business_id, {
    reason: reason
  });

  return {
    business: publicBusiness_(updatedBusiness),
    whatsapp_message: message,
    whatsapp_url: buildWhatsAppUrl_(updatedBusiness.whatsapp || updatedBusiness.phone, message)
  };
}

function reactivateBusiness_(context, data) {
  requireFields_(data, ['business_id']);

  var business = getBusinessById_(data.business_id);

  if (!business) {
    throw appError_('Negocio no encontrado.', 'business_not_found');
  }

  var cycle = normalizeBillingCycle_(data.billing_cycle || business.billing_cycle || 'monthly');
  var nextPaymentDate = sanitizeDateText_(data.next_payment_date || nextPaymentDateForCycle_(cycle));
  var timestamp = nowIso_();

  updateRowByNumber_('BUSINESSES', business._rowNumber, {
    status: 'active',
    billing_cycle: cycle,
    billing_status: 'current',
    next_payment_date: nextPaymentDate,
    suspended_reason: '',
    reactivated_at: timestamp
  });
  updateBusinessUsersStatus_(business.business_id, 'active');

  var updatedBusiness = getBusinessById_(business.business_id);
  var message = buildPaymentReactivationMessage_(updatedBusiness);

  logActivity_(context.user.user_id, business.business_id, 'business_reactivated_payment', 'business', business.business_id, {
    next_payment_date: nextPaymentDate
  });

  return {
    business: publicBusiness_(updatedBusiness),
    whatsapp_message: message,
    whatsapp_url: buildWhatsAppUrl_(updatedBusiness.whatsapp || updatedBusiness.phone, message)
  };
}

function resetBusinessOwnerPassword_(context, data) {
  requireFields_(data, ['business_id']);

  var business = getBusinessById_(data.business_id);

  if (!business) {
    throw appError_('Negocio no encontrado.', 'business_not_found');
  }

  var owner = findRowByValue_('USERS', 'user_id', business.owner_user_id);

  if (!owner) {
    throw appError_('Propietario no encontrado.', 'owner_not_found');
  }

  var temporaryPassword = generateTemporaryPassword_();
  var timestamp = nowIso_();

  updateRowByNumber_('USERS', owner._rowNumber, {
    password_hash: createPasswordHash_(temporaryPassword),
    status: 'active'
  });

  var businessLoginUrl = buildBusinessLoginUrl_();
  var customerRegisterUrl = buildCustomerRegisterUrl_(business.business_code);
  var requestLike = {
    owner_name: owner.full_name || business.business_name,
    email: owner.email || business.email,
    phone: owner.phone || business.phone || '',
    whatsapp: business.whatsapp || owner.phone || ''
  };
  var whatsappMessage = buildApprovalMessage_(
    requestLike,
    business,
    temporaryPassword,
    false,
    businessLoginUrl,
    customerRegisterUrl
  );
  var emailResult = sendApprovalEmail_(
    requestLike,
    business,
    temporaryPassword,
    false,
    businessLoginUrl,
    customerRegisterUrl,
    whatsappMessage
  );

  logActivity_(context.user.user_id, business.business_id, 'owner_password_reset', 'user', owner.user_id, {
    reset_at: timestamp
  });

  return {
    business: publicBusiness_(business),
    owner: {
      user_id: owner.user_id,
      full_name: owner.full_name || business.business_name,
      email: owner.email || business.email,
      temporary_password: temporaryPassword,
      password_mode: 'temporary'
    },
    business_login_url: businessLoginUrl,
    customer_register_url: customerRegisterUrl,
    register_url: customerRegisterUrl,
    whatsapp_message: whatsappMessage,
    whatsapp_url: buildWhatsAppUrl_(business.whatsapp || owner.phone || business.phone, whatsappMessage),
    email_sent: emailResult.sent,
    email_error: emailResult.error || ''
  };
}

function getBusinessHome_(context) {
  var business = getBusinessById_(context.user.business_id);

  if (!business || business.status !== 'active') {
    throw appError_('Negocio inactivo o no encontrado.', 'business_not_found');
  }

  var program = getActiveProgramForBusiness_(business.business_id);
  var reward = program && program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;
  var cards = findRowsByValue_('CUSTOMER_CARDS', 'business_id', business.business_id);
  var promotions = findRowsByValue_('PROMOTIONS', 'business_id', business.business_id);
  var transactions = findRowsByValue_('TRANSACTIONS', 'business_id', business.business_id);
  var redemptions = findRowsByValue_('REDEMPTIONS', 'business_id', business.business_id);

  return {
    business: publicBusiness_(business),
    program: publicProgram_(program),
    reward: publicReward_(reward),
    customer_register_url: buildCustomerRegisterUrl_(business.business_code),
    customer_share_text: buildCustomerShareMessage_(business, buildCustomerRegisterUrl_(business.business_code)),
    stats: {
      customers: cards.length,
      promotions: promotions.filter(function(row) { return row.status === 'active'; }).length,
      transactions: transactions.length,
      redeemed_rewards: redemptions.filter(function(row) { return row.status === 'redeemed'; }).length
    }
  };
}

function getAdminStats_(context) {
  var businesses = getAllRows_('BUSINESSES');
  var requests = getAllRows_('REQUESTS');
  var customers = getAllRows_('CUSTOMERS');
  var transactions = getAllRows_('TRANSACTIONS');
  var redemptions = getAllRows_('REDEMPTIONS');

  return {
    active_businesses: businesses.filter(function(row) { return row.status === 'active'; }).length,
    pending_requests: requests.filter(function(row) { return row.status === 'pending'; }).length,
    suspended_businesses: businesses.filter(function(row) { return row.status === 'suspended'; }).length,
    total_customers: customers.length,
    total_transactions: transactions.length,
    redeemed_rewards: redemptions.filter(function(row) { return row.status === 'redeemed'; }).length
  };
}

function generateUniqueBusinessCode_(businessName) {
  var prefix = slugify_(businessName).split('-')[0] || 'BIZ';
  var code = generateReadableCode_(prefix);

  while (getBusinessByCode_(code)) {
    code = generateReadableCode_(prefix);
  }

  return code;
}

function buildRegisterUrl_(businessCode) {
  return buildCustomerRegisterUrl_(businessCode);
}

function buildBusinessLoginUrl_() {
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return '';
  }

  return appUrl.replace(/\/?$/, '/') + 'login.html';
}

function buildCustomerRegisterUrl_(businessCode) {
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return '';
  }

  return appUrl.replace(/\/?$/, '/') + 'register/?business=' + encodeURIComponent(businessCode);
}

function buildClientCardUrl_(cardId) {
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return '';
  }

  return appUrl.replace(/\/?$/, '/') + 'client/card.html?card=' + encodeURIComponent(cardId);
}

function buildApprovalMessage_(request, business, temporaryPassword, hasOwnerPassword, businessLoginUrl, customerRegisterUrl) {
  var passwordLine = hasOwnerPassword ?
    'Clave: usa la clave que creaste al enviar la solicitud.' :
    'Contrasena temporal: ' + temporaryPassword;

  return [
    'Hola ' + request.owner_name + ', tu cuenta de ' + business.business_name + ' ya esta activa en Loyalty.',
    '',
    'Panel del negocio: ' + (businessLoginUrl || 'pendiente de configurar'),
    'Correo: ' + request.email,
    passwordLine,
    'Codigo del negocio: ' + business.business_code,
    '',
    'Link para clientes: ' + (customerRegisterUrl || 'pendiente de configurar'),
    'Comparte ese link para que tus clientes creen su Wallet o agreguen tu tarjeta a su Wallet existente.'
  ].join('\n');
}

function buildCustomerShareMessage_(business, customerRegisterUrl) {
  return [
    'Hola, ya puedes agregar ' + business.business_name + ' a tu Wallet Loyalty.',
    customerRegisterUrl || ''
  ].join('\n').trim();
}

function buildPaymentReminderMessage_(business) {
  var businessName = business.business_name || 'tu negocio';
  var cycleLabel = getBillingCycleLabel_(business.billing_cycle);
  var dueDate = business.next_payment_date || 'la fecha pendiente';

  return [
    'Hola, ' + businessName + '.',
    '',
    'Te recordamos que esta pendiente cancelar el pago ' + cycleLabel + ' de tu plataforma Loyalty.',
    'Fecha de pago: ' + dueDate + '.',
    '',
    'Para evitar la suspension del panel y de las tarjetas de clientes, por favor confirma el pago con el administrador.',
    'Gracias.'
  ].join('\n');
}

function buildPaymentSuspensionMessage_(business) {
  var businessName = business.business_name || 'tu negocio';
  var cycleLabel = getBillingCycleLabel_(business.billing_cycle);

  return [
    'Hola, ' + businessName + '.',
    '',
    'Tu cuenta de Loyalty fue suspendida temporalmente por pago ' + cycleLabel + ' pendiente.',
    'Motivo: ' + (business.suspended_reason || 'Pago pendiente') + '.',
    '',
    'Cuando canceles el valor pendiente, el administrador reactivara tu panel y tus tarjetas.'
  ].join('\n');
}

function buildPaymentReactivationMessage_(business) {
  var businessName = business.business_name || 'tu negocio';

  return [
    'Hola, ' + businessName + '.',
    '',
    'Tu cuenta de Loyalty ya fue reactivada.',
    'Proximo pago: ' + (business.next_payment_date || 'por definir') + '.',
    '',
    'Ya puedes entrar nuevamente al panel del negocio.'
  ].join('\n');
}

function buildWhatsAppUrl_(phone, message) {
  var digits = normalizePhone_(phone).replace(/[^\d]/g, '');

  if (!digits) {
    return '';
  }

  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}

function normalizeBillingCycle_(cycle) {
  var value = String(cycle || '').trim().toLowerCase();

  if (value === 'yearly' || value === 'annual' || value === 'anual' || value === 'ano' || value === 'año') {
    return 'yearly';
  }

  return 'monthly';
}

function normalizeBillingStatus_(status) {
  var value = String(status || '').trim().toLowerCase();

  if (value === 'overdue' || value === 'vencido' || value === 'pendiente') {
    return 'overdue';
  }

  if (value === 'cancelled' || value === 'canceled' || value === 'cancelado') {
    return 'cancelled';
  }

  return 'current';
}

function getBillingCycleLabel_(cycle) {
  return normalizeBillingCycle_(cycle) === 'yearly' ? 'anual' : 'mensual';
}

function nextPaymentDateForCycle_(cycle) {
  var days = normalizeBillingCycle_(cycle) === 'yearly' ? 365 : 30;
  var date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return date.toISOString().slice(0, 10);
}

function sanitizeDateText_(value) {
  var text = String(value || '').trim();

  if (!text) {
    return '';
  }

  var match = text.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? text : text.substring(0, 40);
}

function updateBusinessUsersStatus_(businessId, status) {
  var users = findRowsByValue_('USERS', 'business_id', businessId);

  users.forEach(function(user) {
    updateRowByNumber_('USERS', user._rowNumber, {
      status: status
    });
  });
}

function sendApprovalEmail_(request, business, temporaryPassword, hasOwnerPassword, businessLoginUrl, customerRegisterUrl, message) {
  var passwordHtml = hasOwnerPassword ?
    'Clave:</strong> usa la clave que creaste al enviar la solicitud.' :
    'Contrasena temporal:</strong> ' + emailHtml_(temporaryPassword);

  try {
    MailApp.sendEmail({
      to: request.email,
      subject: 'Tu cuenta de Loyalty ya esta activa',
      body: message,
      htmlBody: '<p>Hola ' + emailHtml_(request.owner_name) + ',</p>' +
        '<p>Tu cuenta de <strong>' + emailHtml_(business.business_name) + '</strong> ya esta activa.</p>' +
        '<p><strong>Panel del negocio:</strong><br><a href="' + emailHtml_(businessLoginUrl) + '">' + emailHtml_(businessLoginUrl) + '</a></p>' +
        '<p><strong>Correo:</strong> ' + emailHtml_(request.email) + '<br>' +
        '<strong>' + passwordHtml + '<br>' +
        '<strong>Codigo del negocio:</strong> ' + emailHtml_(business.business_code) + '</p>' +
        '<p><strong>Link para clientes:</strong><br><a href="' + emailHtml_(customerRegisterUrl) + '">' + emailHtml_(customerRegisterUrl) + '</a></p>' +
        '<p>Comparte ese link para que tus clientes creen su Wallet o agreguen tu tarjeta a su Wallet existente.</p>'
    });

    return {
      sent: true,
      error: ''
    };
  } catch (error) {
    return {
      sent: false,
      error: error && error.message ? error.message : 'No se pudo enviar el correo.'
    };
  }
}

function emailHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function publicRequest_(request) {
  return {
    request_id: request.request_id,
    business_name: request.business_name,
    owner_name: request.owner_name,
    email: request.email,
    has_owner_password: Boolean(request.owner_password_hash),
    phone: request.phone || '',
    whatsapp: request.whatsapp || '',
    city: request.city || '',
    address: request.address || '',
    business_type: request.business_type || '',
    logo_url: request.logo_url || '',
    primary_color: request.primary_color || '',
    secondary_color: request.secondary_color || '',
    loyalty_type: request.loyalty_type || '',
    suggested_goal: request.suggested_goal || '',
    suggested_reward: request.suggested_reward || '',
    status: request.status,
    created_at: request.created_at,
    reviewed_at: request.reviewed_at || '',
    reviewed_by: request.reviewed_by || '',
    rejection_reason: request.rejection_reason || ''
  };
}

function publicBusiness_(business) {
  return {
    business_id: business.business_id,
    business_code: business.business_code,
    business_name: business.business_name,
    slug: business.slug,
    owner_user_id: business.owner_user_id,
    logo_url: business.logo_url || '',
    primary_color: business.primary_color || '',
    secondary_color: business.secondary_color || '',
    phone: business.phone || '',
    whatsapp: business.whatsapp || '',
    email: business.email || '',
    city: business.city || '',
    address: business.address || '',
    business_type: business.business_type || '',
    status: business.status,
    plan: business.plan || '',
    billing_cycle: business.billing_cycle || 'monthly',
    billing_status: business.billing_status || 'current',
    next_payment_date: business.next_payment_date || '',
    suspended_reason: business.suspended_reason || '',
    suspended_at: business.suspended_at || '',
    reactivated_at: business.reactivated_at || '',
    payment_whatsapp_message: buildPaymentReminderMessage_(business),
    payment_whatsapp_url: buildWhatsAppUrl_(business.whatsapp || business.phone, buildPaymentReminderMessage_(business)),
    created_at: business.created_at || '',
    approved_at: business.approved_at || ''
  };
}

// ==================================================
// Customers.gs
// ==================================================
function ensureWalletSchema_() {
  var spreadsheet = getSpreadsheet_();
  ['CUSTOMERS', 'CUSTOMER_CARDS', 'CUSTOMER_COUPONS', 'CUSTOMER_SESSIONS', 'LOYALTY_PROGRAMS', 'TRANSACTIONS', 'REDEMPTIONS', 'PROMOTIONS'].forEach(function(sheetName) {
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

// ==================================================
// Cards.gs
// ==================================================
function getCustomerCardById_(cardId) {
  ensureWalletSchema_();
  return findRowByValue_('CUSTOMER_CARDS', 'card_id', cardId);
}

function getCustomerCardForBusiness_(customerId, businessId) {
  ensureWalletSchema_();

  var cards = findRowsByValue_('CUSTOMER_CARDS', 'customer_id', customerId);

  for (var index = 0; index < cards.length; index += 1) {
    if (cards[index].business_id === businessId) {
      return cards[index];
    }
  }

  return null;
}

function createCustomerCard_(customer, business, program, options) {
  ensureWalletSchema_();

  options = options || {};

  var existing = getCustomerCardForBusiness_(customer.customer_id, business.business_id);

  if (existing) {
    return existing;
  }

  var timestamp = nowIso_();
  var cardId = generateId_('CRD');
  var welcomeStatus = getInitialWelcomeRewardStatus_(program);

  appendObject_('CUSTOMER_CARDS', {
    card_id: cardId,
    customer_id: customer.customer_id,
    business_id: business.business_id,
    program_id: program.program_id,
    points: 0,
    stamps: 0,
    visits: 0,
    lifetime_points: 0,
    welcome_reward_status: welcomeStatus,
    coupon_tier: '',
    coupon_status: '',
    coupon_title: '',
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp
  });

  var card = getCustomerCardById_(cardId);
  grantEligibleCoupons_(card, program);
  card = getCustomerCardById_(cardId);

  appendTransaction_({
    business_id: business.business_id,
    customer_id: customer.customer_id,
    card_id: cardId,
    type: 'card_added',
    amount: '',
    points_change: 0,
    stamps_change: 0,
    visits_change: 0,
    notes: 'Tarjeta agregada a Wallet'
  });

  if (welcomeStatus === 'available') {
    appendTransaction_({
      business_id: business.business_id,
      customer_id: customer.customer_id,
      card_id: cardId,
      type: 'welcome_reward_granted',
      amount: '',
      points_change: 0,
      stamps_change: 0,
      visits_change: 0,
      notes: getWelcomeRewardTitle_(program),
      reward_id: program.reward_id || ''
    });
  }

  logActivity_('', business.business_id, 'card_added', 'customer_card', cardId, {
    customer_id: customer.customer_id,
    wallet_id: customer.wallet_id,
    welcome_reward_status: welcomeStatus,
    source: options.source || ''
  });

  return card;
}

function getCardsForCustomer_(customerId) {
  ensureWalletSchema_();
  return findRowsByValue_('CUSTOMER_CARDS', 'customer_id', customerId);
}

function getWalletCardPayload_(card) {
  var business = getBusinessById_(card.business_id);
  var program = findRowByValue_('LOYALTY_PROGRAMS', 'program_id', card.program_id) || getActiveProgramForBusiness_(card.business_id);
  var reward = program && program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;

  return {
    business: publicBusiness_(business || {}),
    program: publicProgram_(program),
    reward: publicReward_(reward),
    welcome_reward: publicWelcomeReward_(program, card),
    coupons: getCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
    available_coupons: getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
    card: publicCustomerCard_(card, program),
    card_url: buildClientCardUrl_(card.card_id)
  };
}

function publicCustomerCard_(card, program) {
  program = program || {};

  var programType = String(program.program_type || 'STAMPS').toUpperCase();
  var current = 0;

  if (programType === 'POINTS') {
    current = parseInt(card.points || '0', 10) || 0;
  } else if (programType === 'VISITS') {
    current = parseInt(card.visits || '0', 10) || 0;
  } else {
    current = parseInt(card.stamps || '0', 10) || 0;
  }

  var goal = parseInt(program.goal || '10', 10) || 10;

  return {
    card_id: card.card_id,
    customer_id: card.customer_id,
    business_id: card.business_id,
    program_id: card.program_id,
    points: parseInt(card.points || '0', 10) || 0,
    stamps: parseInt(card.stamps || '0', 10) || 0,
    visits: parseInt(card.visits || '0', 10) || 0,
    lifetime_points: parseInt(card.lifetime_points || '0', 10) || 0,
    welcome_reward_status: card.welcome_reward_status || 'none',
    coupon_tier: card.coupon_tier || '',
    coupon_status: card.coupon_status || 'none',
    coupon_title: card.coupon_title || '',
    available_coupon_count: getAvailableCouponsForCard_(card.card_id).length,
    status: card.status || 'active',
    current: current,
    goal: goal,
    progress_percent: goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0
  };
}

function getPublicCard_(data) {
  requireFields_(data, ['card_id']);

  var card = getCustomerCardById_(data.card_id);

  if (!card || card.status === 'blocked') {
    throw appError_('Tarjeta no encontrada o inactiva.', 'card_not_found');
  }

  var business = getBusinessById_(card.business_id);
  var customer = getCustomerById_(card.customer_id);
  var program = findRowByValue_('LOYALTY_PROGRAMS', 'program_id', card.program_id);
  var reward = program && program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;
  var history = getHistoryForCard_(card.card_id);
  var promotions = getPromotionsForBusiness_(card.business_id);

  if (!business || !customer || !program) {
    throw appError_('La tarjeta esta incompleta.', 'card_incomplete');
  }

  return {
    business: publicBusiness_(business),
    customer: publicCustomer_(customer),
    card: publicCustomerCard_(card, program),
    program: publicProgram_(program),
    reward: publicReward_(reward),
    welcome_reward: publicWelcomeReward_(program, card),
    coupons: getCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
    available_coupons: getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
    promotions: promotions,
    history: history,
    card_url: buildClientCardUrl_(card.card_id),
    wallet_url: buildClientWalletUrl_(customer.wallet_id),
    wallet_qr: buildWalletQrPayload_(customer.wallet_id)
  };
}

// ==================================================
// Wallet.gs
// ==================================================
function lookupCustomerPhone_(data) {
  requireFields_(data, ['phone']);

  var business = data.business_code ? getActiveBusinessByCodeForCustomer_(data.business_code) : null;
  var customer = findCustomerByPhone_(data.phone);
  var card = customer && business ? getCustomerCardForBusiness_(customer.customer_id, business.business_id) : null;
  var program = business ? getActiveProgramForBusiness_(business.business_id) : null;
  var reward = program && program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;

  return {
    phone_normalized: normalizeCustomerPhone_(data.phone),
    customer_exists: Boolean(customer),
    customer: customer ? publicCustomer_(customer) : null,
    business: business ? publicBusiness_(business) : null,
    program: publicProgram_(program),
    reward: publicReward_(reward),
    welcome_reward: publicWelcomeReward_(program, card),
    has_card: Boolean(card),
    card: card ? publicCustomerCard_(card, program) : null,
    coupons: card ? getCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
    available_coupons: card ? getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
    card_url: card ? buildClientCardUrl_(card.card_id) : '',
    wallet_url: customer ? buildClientWalletUrl_(customer.wallet_id) : ''
  };
}

function registerCustomerWallet_(data) {
  return registerOrAttachCustomer_(data);
}

function registerOrAttachCustomer_(data) {
  requireFields_(data, ['phone']);
  ensureWalletSchema_();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var business = data.business_code ? getActiveBusinessByCodeForCustomer_(data.business_code) : null;
    var program = business ? getActiveProgramForBusiness_(business.business_id) : null;

    if (business && !program) {
      throw appError_('Este negocio aun no tiene programa activo.', 'program_not_found');
    }

    var customer = findCustomerByPhone_(data.phone);
    var isNewCustomer = false;

    if (!customer) {
      if (!data.full_name && !data.name) {
        data.full_name = 'Cliente Loyalty';
      }

      customer = createCustomer_(data);
      isNewCustomer = true;
    } else {
      customer = updateCustomerProfile_(customer, data);
    }

    var card = null;
    var isNewCard = false;

    if (business) {
      card = getCustomerCardForBusiness_(customer.customer_id, business.business_id);

      if (!card) {
        card = createCustomerCard_(customer, business, program, {
          source: 'register_or_attach'
        });
        isNewCard = true;
      }
    }

    var session = createCustomerSession_(customer);
    var wallet = buildCustomerWallet_(customer);

    return {
      customer: publicCustomer_(customer),
      customer_session: publicCustomerSession_(session),
      wallet: wallet,
      business: business ? publicBusiness_(business) : null,
      program: publicProgram_(program),
      reward: program && program.reward_id ? publicReward_(findRowByValue_('REWARDS', 'reward_id', program.reward_id)) : null,
      card: card ? publicCustomerCard_(card, program) : null,
      welcome_reward: publicWelcomeReward_(program, card),
      coupons: card ? getCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
      available_coupons: card ? getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
      is_new_customer: isNewCustomer,
      is_new_card: isNewCard,
      wallet_url: buildClientWalletUrl_(customer.wallet_id),
      card_url: card ? buildClientCardUrl_(card.card_id) : ''
    };
  } finally {
    lock.releaseLock();
  }
}

function attachBusinessCard_(data) {
  requireFields_(data, ['business_code']);

  var context = getCustomerContext_(data);
  var business = getActiveBusinessByCodeForCustomer_(data.business_code);
  var program = getActiveProgramForBusiness_(business.business_id);

  if (!program) {
    throw appError_('Este negocio aun no tiene programa activo.', 'program_not_found');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var existing = getCustomerCardForBusiness_(context.customer.customer_id, business.business_id);
    var isNewCard = false;

    if (!existing) {
      existing = createCustomerCard_(context.customer, business, program, {
        source: 'customer_attach'
      });
      isNewCard = true;
    }

    return {
      customer: publicCustomer_(context.customer),
      business: publicBusiness_(business),
      program: publicProgram_(program),
      reward: program.reward_id ? publicReward_(findRowByValue_('REWARDS', 'reward_id', program.reward_id)) : null,
      card: publicCustomerCard_(existing, program),
      welcome_reward: publicWelcomeReward_(program, existing),
      coupons: getCouponsForCard_(existing.card_id).map(publicCustomerCoupon_),
      available_coupons: getAvailableCouponsForCard_(existing.card_id).map(publicCustomerCoupon_),
      is_new_card: isNewCard,
      wallet_url: buildClientWalletUrl_(context.customer.wallet_id),
      card_url: buildClientCardUrl_(existing.card_id)
    };
  } finally {
    lock.releaseLock();
  }
}

function getCustomerWallet_(data) {
  var context = getCustomerContext_(data);
  return buildCustomerWallet_(context.customer);
}

function getWalletCards_(data) {
  var context = getCustomerContext_(data);
  return {
    customer: publicCustomer_(context.customer),
    cards: getCardsForCustomer_(context.customer.customer_id).map(getWalletCardPayload_)
  };
}

function getWalletPromotions_(data) {
  var context = getCustomerContext_(data);

  return {
    customer: publicCustomer_(context.customer),
    promotions: getWalletPromotionsForCustomer_(context.customer.customer_id)
  };
}

function getWalletHistory_(data) {
  var context = getCustomerContext_(data);

  return {
    customer: publicCustomer_(context.customer),
    history: getWalletHistoryForCustomer_(context.customer.customer_id)
  };
}

function getWalletQr_(data) {
  var context = getCustomerContext_(data);

  return {
    customer: publicCustomer_(context.customer),
    wallet_qr: buildWalletQrPayload_(context.customer.wallet_id)
  };
}

function buildCustomerWallet_(customer) {
  var cards = getCardsForCustomer_(customer.customer_id).map(getWalletCardPayload_);

  return {
    customer: publicCustomer_(customer),
    wallet_id: customer.wallet_id,
    wallet_url: buildClientWalletUrl_(customer.wallet_id),
    wallet_qr: buildWalletQrPayload_(customer.wallet_id),
    cards: cards,
    card_count: cards.length
  };
}

function scanWallet_(context, data) {
  var walletId = extractWalletId_(data.wallet_id || data.wallet || data.code || data.qr || '');

  if (!walletId) {
    throw appError_('Indica el wallet_id del cliente.', 'missing_wallet');
  }

  var customer = getCustomerByWalletId_(walletId);

  if (!customer) {
    throw appError_('Wallet no encontrada.', 'wallet_not_found');
  }

  var business = getBusinessById_(context.user.business_id);

  if (!business || business.status !== 'active') {
    throw appError_('Negocio inactivo o no encontrado.', 'business_not_found');
  }

  var program = getActiveProgramForBusiness_(business.business_id);

  if (!program) {
    throw appError_('Este negocio aun no tiene programa activo.', 'program_not_found');
  }

  var card = getCustomerCardForBusiness_(customer.customer_id, business.business_id);
  var created = false;

  if (!card && data.create_if_missing) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      card = getCustomerCardForBusiness_(customer.customer_id, business.business_id);

      if (!card) {
        card = createCustomerCard_(customer, business, program, {
          source: 'business_scan'
        });
        created = true;
      }
    } finally {
      lock.releaseLock();
    }
  }

  return {
    customer: publicCustomer_(customer),
    business: publicBusiness_(business),
    program: publicProgram_(program),
    reward: program.reward_id ? publicReward_(findRowByValue_('REWARDS', 'reward_id', program.reward_id)) : null,
    has_card: Boolean(card),
    created: created,
    can_add: !card,
    card: card ? publicCustomerCard_(card, program) : null,
    welcome_reward: publicWelcomeReward_(program, card),
    coupons: card ? getCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
    available_coupons: card ? getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
    history: card ? getHistoryForCard_(card.card_id) : []
  };
}

function getBusinessCustomerCard_(context, data) {
  var businessId = context.user.business_id;
  var card = null;

  if (data.card_id) {
    card = getCustomerCardById_(data.card_id);
  } else if (data.wallet_id || data.wallet) {
    var customer = getCustomerByWalletId_(extractWalletId_(data.wallet_id || data.wallet));
    card = customer ? getCustomerCardForBusiness_(customer.customer_id, businessId) : null;
  }

  if (!card || card.business_id !== businessId) {
    throw appError_('Cliente no encontrado en este negocio.', 'card_not_found');
  }

  var customerRow = getCustomerById_(card.customer_id);
  var business = getBusinessById_(businessId);
  var program = findRowByValue_('LOYALTY_PROGRAMS', 'program_id', card.program_id);

  return {
    customer: publicCustomer_(customerRow),
    business: publicBusiness_(business),
    program: publicProgram_(program),
    card: publicCustomerCard_(card, program),
    welcome_reward: publicWelcomeReward_(program, card),
    coupons: getCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
    available_coupons: getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
    history: getHistoryForCard_(card.card_id)
  };
}

function listBusinessCustomers_(context, data) {
  var businessId = context.user.business_id;
  var cards = findRowsByValue_('CUSTOMER_CARDS', 'business_id', businessId);
  var rows = cards.map(function(card) {
    var customer = getCustomerById_(card.customer_id);
    var program = findRowByValue_('LOYALTY_PROGRAMS', 'program_id', card.program_id);

    return {
      customer: publicCustomer_(customer || {}),
      card: publicCustomerCard_(card, program),
      program: publicProgram_(program),
      welcome_reward: publicWelcomeReward_(program, card),
      coupons: getCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
      available_coupons: getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_)
    };
  });

  rows.sort(function(left, right) {
    return String(right.card.card_id).localeCompare(String(left.card.card_id));
  });

  return {
    customers: rows
  };
}

function listAdminCustomers_(context, data) {
  var customers = getAllRows_('CUSTOMERS').map(ensureCustomerWalletFields_);
  var businesses = getAllRows_('BUSINESSES');
  var businessMap = {};

  businesses.forEach(function(business) {
    businessMap[business.business_id] = business;
  });

  return {
    customers: customers.map(function(customer) {
      var cards = getCardsForCustomer_(customer.customer_id);
      return {
        customer: publicCustomer_(customer),
        card_count: cards.length,
        businesses: cards.map(function(card) {
          return publicBusiness_(businessMap[card.business_id] || {});
        })
      };
    })
  };
}

function analyzeCustomerDuplicates_(context, data) {
  var groups = {};
  var duplicates = [];

  getAllRows_('CUSTOMERS').forEach(function(customer) {
    customer = ensureCustomerWalletFields_(customer);
    var key = customer.phone_normalized || normalizeCustomerPhone_(customer.phone || '');

    if (!key) {
      key = 'missing_phone';
    }

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(publicCustomer_(customer));
  });

  Object.keys(groups).forEach(function(key) {
    if (groups[key].length > 1) {
      duplicates.push({
        phone_normalized: key,
        count: groups[key].length,
        customers: groups[key]
      });
    }
  });

  return {
    duplicate_groups: duplicates,
    duplicate_group_count: duplicates.length,
    reviewed_at: nowIso_(),
    note: 'Reporte solamente. No fusiona ni borra clientes.'
  };
}

function getActiveBusinessByCodeForCustomer_(businessCode) {
  var business = getBusinessByCode_(businessCode);

  if (!business || business.status !== 'active') {
    throw appError_('Negocio no encontrado o inactivo.', 'business_not_found');
  }

  return business;
}

function buildWalletQrPayload_(walletId) {
  var cleanWalletId = String(walletId || '').trim().toUpperCase();

  return {
    wallet_id: cleanWalletId,
    payload: cleanWalletId,
    scanner_url: buildBusinessScannerWalletUrl_(cleanWalletId),
    display: abbreviateWalletId_(cleanWalletId)
  };
}

function extractWalletId_(value) {
  var text = String(value || '').trim();

  if (!text) {
    return '';
  }

  var match = text.match(/(?:wallet|wallet_id)=([^&\s]+)/i);
  if (match) {
    text = decodeURIComponent(match[1]);
  }

  return String(text || '').trim().toUpperCase();
}

function abbreviateWalletId_(walletId) {
  var value = String(walletId || '');
  return value.length > 6 ? 'WALLET •••• ' + value.slice(-6) : value;
}

function buildClientWalletUrl_(walletId) {
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return '';
  }

  return appUrl.replace(/\/?$/, '/') + 'client/?wallet=' + encodeURIComponent(walletId || '');
}

function buildBusinessScannerWalletUrl_(walletId) {
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return String(walletId || '');
  }

  return appUrl.replace(/\/?$/, '/') + 'business/scanner.html?wallet=' + encodeURIComponent(walletId || '');
}

// ==================================================
// Loyalty.gs
// ==================================================
function getActiveProgramForBusiness_(businessId) {
  var programs = findRowsByValue_('LOYALTY_PROGRAMS', 'business_id', businessId);

  for (var index = 0; index < programs.length; index += 1) {
    if (programs[index].status === 'active') {
      return programs[index];
    }
  }

  return null;
}

function assertSupportedProgramType_(programType) {
  var supported = ['STAMPS', 'POINTS', 'VISITS'];

  if (supported.indexOf(String(programType || '').toUpperCase()) === -1) {
    throw appError_('Tipo de programa no soportado.', 'invalid_program_type');
  }
}

var COUPON_TIERS = Object.freeze([
  {
    tier: 'initial',
    threshold: 0,
    title: 'Primer cupon',
    description: 'Beneficio inicial por unirte al programa.'
  },
  {
    tier: 'silver',
    threshold: 3,
    title: 'Cupon de plata',
    description: 'Beneficio desbloqueado por volver varias veces.'
  },
  {
    tier: 'gold',
    threshold: 6,
    title: 'Cupon de oro',
    description: 'Beneficio premium por tu fidelidad.'
  },
  {
    tier: 'platinum',
    threshold: 10,
    title: 'Cupon platino',
    description: 'El mejor beneficio del programa.'
  }
]);

function publicProgram_(program) {
  if (!program) {
    return null;
  }

  return {
    program_id: program.program_id,
    business_id: program.business_id,
    program_name: program.program_name,
    program_type: program.program_type,
    goal: parseInt(program.goal || '10', 10) || 10,
    points_per_dollar: program.points_per_dollar || '',
    reward_id: program.reward_id || '',
    welcome_reward_enabled: isTruthy_(program.welcome_reward_enabled),
    welcome_reward_type: program.welcome_reward_type || '',
    welcome_reward_value: program.welcome_reward_value || '',
    welcome_reward_title: program.welcome_reward_title || '',
    welcome_reward_description: program.welcome_reward_description || '',
    status: program.status || ''
  };
}

function publicReward_(reward) {
  if (!reward) {
    return null;
  }

  return {
    reward_id: reward.reward_id,
    business_id: reward.business_id,
    program_id: reward.program_id,
    name: reward.name,
    description: reward.description || '',
    points_required: reward.points_required || '',
    stamps_required: reward.stamps_required || '',
    visits_required: reward.visits_required || '',
    status: reward.status || ''
  };
}

function getInitialWelcomeRewardStatus_(program) {
  return program && isTruthy_(program.welcome_reward_enabled) ? 'available' : 'none';
}

function publicWelcomeReward_(program, card) {
  if (!program || !isTruthy_(program.welcome_reward_enabled)) {
    return {
      enabled: false,
      status: 'none'
    };
  }

  return {
    enabled: true,
    status: card && card.welcome_reward_status ? card.welcome_reward_status : 'available',
    type: program.welcome_reward_type || '',
    value: program.welcome_reward_value || '',
    title: getWelcomeRewardTitle_(program),
    description: program.welcome_reward_description || ''
  };
}

function getCouponProgressCount_(card, program) {
  var type = String(program && program.program_type || 'STAMPS').toUpperCase();

  if (type === 'POINTS') {
    return parseInt(card.lifetime_points || card.points || '0', 10) || 0;
  }

  if (type === 'VISITS') {
    return parseInt(card.visits || '0', 10) || 0;
  }

  return parseInt(card.stamps || '0', 10) || 0;
}

function getCouponTierByName_(tier) {
  var key = String(tier || '').toLowerCase();

  for (var index = 0; index < COUPON_TIERS.length; index += 1) {
    if (COUPON_TIERS[index].tier === key) {
      return COUPON_TIERS[index];
    }
  }

  return null;
}

function getCouponByCardTier_(cardId, tier) {
  var coupons = findRowsByValue_('CUSTOMER_COUPONS', 'card_id', cardId);

  for (var index = 0; index < coupons.length; index += 1) {
    if (String(coupons[index].tier || '').toLowerCase() === String(tier || '').toLowerCase()) {
      return coupons[index];
    }
  }

  return null;
}

function grantEligibleCoupons_(card, program) {
  ensureWalletSchema_();

  var count = getCouponProgressCount_(card, program);
  var granted = [];

  COUPON_TIERS.forEach(function(tier) {
    if (count < tier.threshold) {
      return;
    }

    if (getCouponByCardTier_(card.card_id, tier.tier)) {
      return;
    }

    var coupon = {
      coupon_id: generateId_('CPN'),
      customer_id: card.customer_id,
      business_id: card.business_id,
      card_id: card.card_id,
      tier: tier.tier,
      title: tier.title,
      description: tier.description,
      status: 'available',
      trigger_count: count,
      created_at: nowIso_(),
      redeemed_at: ''
    };

    appendObject_('CUSTOMER_COUPONS', coupon);
    appendTransaction_({
      business_id: card.business_id,
      customer_id: card.customer_id,
      card_id: card.card_id,
      type: 'coupon_granted',
      amount: tier.tier,
      notes: tier.title
    });

    granted.push(coupon);
  });

  syncCardCouponSummary_(card.card_id);
  return granted;
}

function syncCardCouponSummary_(cardId) {
  var card = getCustomerCardById_(cardId);

  if (!card) {
    return null;
  }

  var coupons = getCouponsForCard_(cardId);
  var available = coupons.filter(function(coupon) {
    return coupon.status === 'available';
  });
  var current = available.length ? available[available.length - 1] : (coupons.length ? coupons[coupons.length - 1] : null);

  updateRowByNumber_('CUSTOMER_CARDS', card._rowNumber, {
    coupon_tier: current ? current.tier : '',
    coupon_status: current ? current.status : 'none',
    coupon_title: current ? current.title : '',
    updated_at: nowIso_()
  });

  return current;
}

function getCouponsForCard_(cardId) {
  var coupons = findRowsByValue_('CUSTOMER_COUPONS', 'card_id', cardId);

  coupons.sort(function(left, right) {
    var leftTier = getCouponTierByName_(left.tier);
    var rightTier = getCouponTierByName_(right.tier);
    var leftThreshold = leftTier ? leftTier.threshold : 0;
    var rightThreshold = rightTier ? rightTier.threshold : 0;
    return leftThreshold - rightThreshold;
  });

  return coupons;
}

function getAvailableCouponsForCard_(cardId) {
  return getCouponsForCard_(cardId).filter(function(coupon) {
    return coupon.status === 'available';
  });
}

function getCouponsForCustomer_(customerId) {
  var coupons = findRowsByValue_('CUSTOMER_COUPONS', 'customer_id', customerId);

  coupons.sort(function(left, right) {
    return String(right.created_at).localeCompare(String(left.created_at));
  });

  return coupons;
}

function publicCustomerCoupon_(coupon) {
  var business = coupon.business_id ? getBusinessById_(coupon.business_id) : null;

  return {
    coupon_id: coupon.coupon_id,
    customer_id: coupon.customer_id,
    business_id: coupon.business_id,
    card_id: coupon.card_id,
    business: business ? publicBusiness_(business) : null,
    tier: coupon.tier || '',
    title: coupon.title || '',
    description: coupon.description || '',
    status: coupon.status || '',
    trigger_count: parseInt(coupon.trigger_count || '0', 10) || 0,
    created_at: coupon.created_at || '',
    redeemed_at: coupon.redeemed_at || ''
  };
}

function getWelcomeRewardTitle_(program) {
  if (!program) {
    return '';
  }

  return program.welcome_reward_title || program.welcome_reward_description || 'Beneficio de bienvenida';
}

function isTruthy_(value) {
  var text = String(value || '').toLowerCase();
  return value === true || text === 'true' || text === 'yes' || text === 'si' || text === '1' || text === 'active';
}

function appendTransaction_(values) {
  ensureWalletSchema_();

  var transaction = {
    transaction_id: generateId_('TXN'),
    business_id: values.business_id || '',
    customer_id: values.customer_id || '',
    card_id: values.card_id || '',
    staff_user_id: values.staff_user_id || '',
    type: values.type || '',
    amount: values.amount === undefined ? '' : values.amount,
    points_change: values.points_change === undefined ? '' : values.points_change,
    stamps_change: values.stamps_change === undefined ? '' : values.stamps_change,
    visits_change: values.visits_change === undefined ? '' : values.visits_change,
    previous_balance: values.previous_balance === undefined ? '' : values.previous_balance,
    new_balance: values.new_balance === undefined ? '' : values.new_balance,
    notes: values.notes || '',
    reward_id: values.reward_id || '',
    created_at: values.created_at || nowIso_()
  };

  appendObject_('TRANSACTIONS', transaction);
  return transaction;
}

function getPromotionsForBusiness_(businessId) {
  return findRowsByValue_('PROMOTIONS', 'business_id', businessId)
    .filter(function(promotion) {
      return isPromotionVisible_(promotion);
    })
    .map(function(promotion) {
      var business = getBusinessById_(promotion.business_id);
      return {
        promotion_id: promotion.promotion_id,
        business: publicBusiness_(business || {}),
        title: promotion.title || '',
        description: promotion.description || '',
        image_url: promotion.image_url || '',
        start_date: promotion.start_date || '',
        end_date: promotion.end_date || '',
        status: promotion.status || ''
      };
    });
}

function getWalletPromotionsForCustomer_(customerId) {
  var seen = {};
  var promotions = [];

  getCardsForCustomer_(customerId).forEach(function(card) {
    if (card.status !== 'active') {
      return;
    }

    getPromotionsForBusiness_(card.business_id).forEach(function(promotion) {
      if (!seen[promotion.promotion_id]) {
        seen[promotion.promotion_id] = true;
        promotions.push(promotion);
      }
    });
  });

  getCouponsForCustomer_(customerId).forEach(function(coupon) {
    if (coupon.status !== 'available') {
      return;
    }

    promotions.push({
      promotion_id: coupon.coupon_id,
      type: 'coupon',
      business: coupon.business_id ? publicBusiness_(getBusinessById_(coupon.business_id) || {}) : null,
      title: coupon.title || '',
      description: coupon.description || '',
      image_url: '',
      start_date: coupon.created_at || '',
      end_date: '',
      status: coupon.status || ''
    });
  });

  return promotions;
}

function getWalletHistoryForCustomer_(customerId) {
  return findRowsByValue_('TRANSACTIONS', 'customer_id', customerId)
    .map(publicTransaction_)
    .sort(function(left, right) {
      return String(right.created_at).localeCompare(String(left.created_at));
    });
}

function getHistoryForCard_(cardId) {
  return findRowsByValue_('TRANSACTIONS', 'card_id', cardId)
    .map(publicTransaction_)
    .sort(function(left, right) {
      return String(right.created_at).localeCompare(String(left.created_at));
    });
}

function publicTransaction_(transaction) {
  var business = transaction.business_id ? getBusinessById_(transaction.business_id) : null;

  return {
    transaction_id: transaction.transaction_id,
    business: business ? publicBusiness_(business) : null,
    business_id: transaction.business_id || '',
    customer_id: transaction.customer_id || '',
    card_id: transaction.card_id || '',
    type: transaction.type || '',
    amount: transaction.amount || '',
    points_change: parseInt(transaction.points_change || '0', 10) || 0,
    stamps_change: parseInt(transaction.stamps_change || '0', 10) || 0,
    visits_change: parseInt(transaction.visits_change || '0', 10) || 0,
    previous_balance: transaction.previous_balance || '',
    new_balance: transaction.new_balance || '',
    notes: transaction.notes || '',
    reward_id: transaction.reward_id || '',
    created_at: transaction.created_at || ''
  };
}

function applyBusinessCustomerAction_(context, data) {
  requireFields_(data, ['card_id', 'action']);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var card = getCustomerCardById_(data.card_id);

    if (!card || card.business_id !== context.user.business_id) {
      throw appError_('Tarjeta no encontrada en este negocio.', 'card_not_found');
    }

    if (card.status !== 'active') {
      throw appError_('Tarjeta no activa.', 'card_inactive');
    }

    var program = findRowByValue_('LOYALTY_PROGRAMS', 'program_id', card.program_id);
    var action = String(data.action || '').toLowerCase();
    var updates = {
      updated_at: nowIso_()
    };
    var transaction = null;

    if (action === 'add_stamp') {
      var previousStamps = parseInt(card.stamps || '0', 10) || 0;
      updates.stamps = previousStamps + 1;
      transaction = appendTransaction_({
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        staff_user_id: context.user.user_id,
        type: 'add_stamp',
        stamps_change: 1,
        previous_balance: previousStamps,
        new_balance: updates.stamps,
        notes: data.notes || '+1 sello'
      });
    } else if (action === 'add_visit') {
      var previousVisits = parseInt(card.visits || '0', 10) || 0;
      updates.visits = previousVisits + 1;
      transaction = appendTransaction_({
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        staff_user_id: context.user.user_id,
        type: 'add_visit',
        visits_change: 1,
        previous_balance: previousVisits,
        new_balance: updates.visits,
        notes: data.notes || '+1 visita'
      });
    } else if (action === 'add_points') {
      var amount = parseInt(data.amount || '0', 10) || 0;
      var previousPoints = parseInt(card.points || '0', 10) || 0;
      var previousLifetime = parseInt(card.lifetime_points || '0', 10) || 0;
      updates.points = previousPoints + amount;
      updates.lifetime_points = previousLifetime + amount;
      transaction = appendTransaction_({
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        staff_user_id: context.user.user_id,
        type: 'add_points',
        amount: amount,
        points_change: amount,
        previous_balance: previousPoints,
        new_balance: updates.points,
        notes: data.notes || '+' + amount + ' puntos'
      });
    } else if (action === 'redeem_coupon') {
      requireFields_(data, ['coupon_id']);

      var coupon = findRowByValue_('CUSTOMER_COUPONS', 'coupon_id', data.coupon_id);

      if (!coupon || coupon.card_id !== card.card_id || coupon.status !== 'available') {
        throw appError_('Cupon no disponible.', 'coupon_not_available');
      }

      updateRowByNumber_('CUSTOMER_COUPONS', coupon._rowNumber, {
        status: 'redeemed',
        redeemed_at: nowIso_()
      });
      transaction = appendTransaction_({
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        staff_user_id: context.user.user_id,
        type: 'coupon_redeemed',
        amount: coupon.tier,
        notes: coupon.title || 'Cupon canjeado'
      });

      appendObject_('REDEMPTIONS', {
        redemption_id: generateId_('RED'),
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        reward_id: coupon.coupon_id,
        staff_user_id: context.user.user_id,
        status: 'redeemed',
        created_at: nowIso_(),
        redeemed_at: nowIso_()
      });
      syncCardCouponSummary_(card.card_id);
    } else if (action === 'redeem_welcome_reward') {
      if (card.welcome_reward_status !== 'available') {
        throw appError_('Beneficio de bienvenida no disponible.', 'welcome_reward_not_available');
      }

      updates.welcome_reward_status = 'redeemed';
      transaction = appendTransaction_({
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        staff_user_id: context.user.user_id,
        type: 'welcome_reward_redeemed',
        notes: getWelcomeRewardTitle_(program),
        reward_id: program.reward_id || ''
      });

      appendObject_('REDEMPTIONS', {
        redemption_id: generateId_('RED'),
        business_id: card.business_id,
        customer_id: card.customer_id,
        card_id: card.card_id,
        reward_id: program.reward_id || '',
        staff_user_id: context.user.user_id,
        status: 'redeemed',
        created_at: nowIso_(),
        redeemed_at: nowIso_()
      });
    } else {
      throw appError_('Accion no soportada.', 'invalid_loyalty_action');
    }

    updateRowByNumber_('CUSTOMER_CARDS', card._rowNumber, updates);

    var updatedCard = getCustomerCardById_(card.card_id);
    grantEligibleCoupons_(updatedCard, program);
    updatedCard = getCustomerCardById_(card.card_id);
    var customer = getCustomerById_(card.customer_id);

    logActivity_(context.user.user_id, card.business_id, action, 'customer_card', card.card_id, {
      customer_id: card.customer_id,
      transaction_id: transaction ? transaction.transaction_id : ''
    });

    return {
      customer: publicCustomer_(customer),
      card: publicCustomerCard_(updatedCard, program),
      program: publicProgram_(program),
      welcome_reward: publicWelcomeReward_(program, updatedCard),
      coupons: getCouponsForCard_(card.card_id).map(publicCustomerCoupon_),
      transaction: transaction ? publicTransaction_(transaction) : null,
      history: getHistoryForCard_(card.card_id)
    };
  } finally {
    lock.releaseLock();
  }
}

// ==================================================
// Promotions.gs
// ==================================================
function isPromotionVisible_(promotion, now) {
  if (!promotion || promotion.status !== 'active') {
    return false;
  }

  var current = now ? new Date(now) : new Date();
  var start = promotion.start_date ? new Date(promotion.start_date) : null;
  var end = promotion.end_date ? new Date(promotion.end_date) : null;

  if (start && !isNaN(start.getTime()) && current < start) {
    return false;
  }

  if (end && !isNaN(end.getTime()) && current > end) {
    return false;
  }

  return true;
}

// ==================================================
// Uploads.gs
// ==================================================
function ensureDriveFolders_() {
  var properties = PropertiesService.getScriptProperties();
  var rootFolder = getExistingFolder_(properties.getProperty('DRIVE_FOLDER_ID'));

  if (!rootFolder) {
    rootFolder = DriveApp.createFolder('LOYALTY_APP');
    properties.setProperty('DRIVE_FOLDER_ID', rootFolder.getId());
  }

  var logosFolder = ensureChildFolder_(rootFolder, 'logos');
  var promotionsFolder = ensureChildFolder_(rootFolder, 'promotions');

  properties.setProperty('LOGOS_FOLDER_ID', logosFolder.getId());
  properties.setProperty('PROMOTIONS_FOLDER_ID', promotionsFolder.getId());

  return {
    rootFolderId: rootFolder.getId(),
    logosFolderId: logosFolder.getId(),
    promotionsFolderId: promotionsFolder.getId()
  };
}

function getExistingFolder_(folderId) {
  if (!folderId) {
    return null;
  }

  try {
    return DriveApp.getFolderById(folderId);
  } catch (error) {
    return null;
  }
}

function ensureChildFolder_(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(name);
}
