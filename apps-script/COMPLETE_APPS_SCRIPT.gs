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
    case 'resetBusinessOwnerPassword':
      return resetBusinessOwnerPassword_(requireSession_(request.token, ['super_admin']), request.data);
    case 'getBusinessHome':
      return getBusinessHome_(requireSession_(request.token, ['business_owner', 'staff']));
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
  CUSTOMERS: ['customer_id', 'full_name', 'phone', 'email', 'birthday', 'created_at', 'status'],
  CUSTOMER_CARDS: [
    'card_id',
    'customer_id',
    'business_id',
    'program_id',
    'points',
    'stamps',
    'visits',
    'lifetime_points',
    'status',
    'created_at',
    'updated_at'
  ],
  LOYALTY_PROGRAMS: [
    'program_id',
    'business_id',
    'program_name',
    'program_type',
    'goal',
    'points_per_dollar',
    'reward_id',
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
  return String(phone || '').replace(/[^\d+]/g, '');
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

  return appUrl.replace(/\/?$/, '/') + 'client/?card=' + encodeURIComponent(cardId);
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
    'Comparte ese link con tus clientes para que creen su tarjeta digital.'
  ].join('\n');
}

function buildCustomerShareMessage_(business, customerRegisterUrl) {
  return [
    'Hola, ya puedes crear tu tarjeta digital de lealtad de ' + business.business_name + '.',
    customerRegisterUrl || ''
  ].join('\n').trim();
}

function buildWhatsAppUrl_(phone, message) {
  var digits = normalizePhone_(phone).replace(/[^\d]/g, '');

  if (!digits) {
    return '';
  }

  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
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
        '<p>Comparte ese link con tus clientes para que creen su tarjeta digital.</p>'
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
    created_at: business.created_at || '',
    approved_at: business.approved_at || ''
  };
}

// ==================================================
// Customers.gs
// ==================================================
function normalizeCustomerPhone_(phone) {
  return normalizePhone_(phone);
}

function getCustomerByPhone_(phone) {
  return findRowByValue_('CUSTOMERS', 'phone', normalizeCustomerPhone_(phone));
}

function getCustomerCardById_(cardId) {
  return findRowByValue_('CUSTOMER_CARDS', 'card_id', cardId);
}

function getCustomerCardForBusiness_(customerId, businessId) {
  var cards = findRowsByValue_('CUSTOMER_CARDS', 'customer_id', customerId);

  for (var index = 0; index < cards.length; index += 1) {
    if (cards[index].business_id === businessId) {
      return cards[index];
    }
  }

  return null;
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
    customer_register_url: buildCustomerRegisterUrl_(business.business_code)
  };
}

function registerCustomer_(data) {
  requireFields_(data, ['business_code', 'full_name', 'phone']);

  var business = getBusinessByCode_(data.business_code);

  if (!business || business.status !== 'active') {
    throw appError_('Negocio no encontrado o inactivo.', 'business_not_found');
  }

  var program = getActiveProgramForBusiness_(business.business_id);

  if (!program) {
    throw appError_('Este negocio aun no tiene programa activo.', 'program_not_found');
  }

  var phone = normalizeCustomerPhone_(data.phone);
  var timestamp = nowIso_();
  var customer = getCustomerByPhone_(phone);

  if (!customer) {
    var customerId = generateId_('CUS');

    appendObject_('CUSTOMERS', {
      customer_id: customerId,
      full_name: sanitizeText_(data.full_name, 140),
      phone: phone,
      email: normalizeEmail_(data.email || ''),
      birthday: sanitizeText_(data.birthday || '', 40),
      created_at: timestamp,
      status: 'active'
    });

    customer = findRowByValue_('CUSTOMERS', 'customer_id', customerId);
  } else {
    updateRowByNumber_('CUSTOMERS', customer._rowNumber, {
      full_name: sanitizeText_(data.full_name || customer.full_name, 140),
      email: normalizeEmail_(data.email || customer.email || ''),
      birthday: sanitizeText_(data.birthday || customer.birthday || '', 40),
      status: 'active'
    });
    customer = findRowByValue_('CUSTOMERS', 'customer_id', customer.customer_id);
  }

  var card = getCustomerCardForBusiness_(customer.customer_id, business.business_id);

  if (!card) {
    var cardId = generateId_('CRD');

    appendObject_('CUSTOMER_CARDS', {
      card_id: cardId,
      customer_id: customer.customer_id,
      business_id: business.business_id,
      program_id: program.program_id,
      points: 0,
      stamps: 0,
      visits: 0,
      lifetime_points: 0,
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp
    });

    card = getCustomerCardById_(cardId);
  }

  var reward = program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;
  var cardUrl = buildClientCardUrl_(card.card_id);

  logActivity_('', business.business_id, 'customer_registered', 'customer_card', card.card_id, {
    customer_id: customer.customer_id
  });

  return {
    business: publicBusiness_(business),
    customer: publicCustomer_(customer),
    card: publicCustomerCard_(card, program),
    program: publicProgram_(program),
    reward: publicReward_(reward),
    card_url: cardUrl
  };
}

function getPublicCard_(data) {
  requireFields_(data, ['card_id']);

  var card = getCustomerCardById_(data.card_id);

  if (!card || card.status !== 'active') {
    throw appError_('Tarjeta no encontrada o inactiva.', 'card_not_found');
  }

  var business = getBusinessById_(card.business_id);
  var customer = findRowByValue_('CUSTOMERS', 'customer_id', card.customer_id);
  var program = findRowByValue_('LOYALTY_PROGRAMS', 'program_id', card.program_id);
  var reward = program && program.reward_id ? findRowByValue_('REWARDS', 'reward_id', program.reward_id) : null;

  if (!business || !customer || !program) {
    throw appError_('La tarjeta esta incompleta.', 'card_incomplete');
  }

  return {
    business: publicBusiness_(business),
    customer: publicCustomer_(customer),
    card: publicCustomerCard_(card, program),
    program: publicProgram_(program),
    reward: publicReward_(reward),
    card_url: buildClientCardUrl_(card.card_id)
  };
}

function publicCustomer_(customer) {
  return {
    customer_id: customer.customer_id,
    full_name: customer.full_name,
    phone: customer.phone || '',
    email: customer.email || '',
    birthday: customer.birthday || '',
    status: customer.status || ''
  };
}

function publicCustomerCard_(card, program) {
  var programType = String(program && program.program_type ? program.program_type : 'STAMPS').toUpperCase();
  var current = 0;

  if (programType === 'POINTS') {
    current = parseInt(card.points || '0', 10) || 0;
  } else if (programType === 'VISITS') {
    current = parseInt(card.visits || '0', 10) || 0;
  } else {
    current = parseInt(card.stamps || '0', 10) || 0;
  }

  var goal = parseInt(program && program.goal ? program.goal : '10', 10) || 10;

  return {
    card_id: card.card_id,
    customer_id: card.customer_id,
    business_id: card.business_id,
    program_id: card.program_id,
    points: parseInt(card.points || '0', 10) || 0,
    stamps: parseInt(card.stamps || '0', 10) || 0,
    visits: parseInt(card.visits || '0', 10) || 0,
    lifetime_points: parseInt(card.lifetime_points || '0', 10) || 0,
    status: card.status,
    current: current,
    goal: goal,
    progress_percent: Math.min(100, Math.round((current / goal) * 100))
  };
}

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

