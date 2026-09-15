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
  requireFields_(data, ['business_name', 'owner_name', 'email', 'whatsapp', 'business_type']);

  var email = normalizeEmail_(data.email);
  var whatsapp = normalizePhone_(data.whatsapp);
  var loyaltyType = String(data.loyalty_type || 'STAMPS').toUpperCase();
  assertSupportedProgramType_(loyaltyType);

  if (findRowByValue_('USERS', 'email', email)) {
    throw appError_('Ya existe un usuario con ese correo.', 'duplicate_email');
  }

  var existingPending = findRowsByValue_('REQUESTS', 'email', email).filter(function(row) {
    return row.status === 'pending';
  });

  if (existingPending.length > 0) {
    return publicRequest_(existingPending[0]);
  }

  var request = {
    request_id: generateId_('REQ'),
    business_name: sanitizeText_(data.business_name, 140),
    owner_name: sanitizeText_(data.owner_name, 140),
    email: email,
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
    var temporaryPassword = generateTemporaryPassword_();
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
      password_hash: createPasswordHash_(temporaryPassword),
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

    return {
      business: publicBusiness_(business),
      owner: {
        user_id: ownerUserId,
        full_name: request.owner_name,
        email: request.email,
        temporary_password: temporaryPassword
      },
      register_url: buildRegisterUrl_(businessCode)
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
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return '';
  }

  return appUrl.replace(/\/?$/, '/') + 'register/?business=' + encodeURIComponent(businessCode);
}

function publicRequest_(request) {
  return {
    request_id: request.request_id,
    business_name: request.business_name,
    owner_name: request.owner_name,
    email: request.email,
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
