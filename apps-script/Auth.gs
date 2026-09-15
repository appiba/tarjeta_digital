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
