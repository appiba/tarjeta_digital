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
