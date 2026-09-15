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
