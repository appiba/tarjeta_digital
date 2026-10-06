function ensureSimpleModel_() {
  var spreadsheet = getSpreadsheet_();
  ['BUSINESSES', 'USERS', 'CUSTOMERS', 'PASSES', 'COUPONS', 'REDEMPTIONS', 'REQUESTS', 'SESSIONS', 'ACTIVITY_LOG', 'CUSTOMER_SESSIONS'].forEach(function(sheetName) {
    ensureSheet_(spreadsheet, sheetName, SHEET_SCHEMAS[sheetName]);
  });
}

function calculateLevel_(totalPasses) {
  var total = Math.max(0, Math.min(10000, parseInt(totalPasses || '0', 10) || 0));
  return Math.floor(total / 10) + 1;
}

function publicLevel_(totalPasses) {
  var total = Math.max(0, Math.min(10000, parseInt(totalPasses || '0', 10) || 0));
  var level = calculateLevel_(total);
  var range = Math.floor(total / 100) + 1;
  var currentLevelStart = Math.floor(total / 10) * 10;
  var nextLevelAt = currentLevelStart + 10;
  var progressInLevel = total - currentLevelStart;

  return {
    total_passes: total,
    current_level: level,
    global_level: level,
    range: range,
    current_level_start: currentLevelStart,
    next_level_at: nextLevelAt,
    progress_in_level: progressInLevel,
    progress_percent: Math.min(100, Math.round((progressInLevel / 10) * 100)),
    remaining_to_next_level: Math.max(0, nextLevelAt - total),
    label: total + ' / ' + nextLevelAt + ' pasadas'
  };
}

function getSimpleCustomerByCode_(code) {
  ensureSimpleModel_();
  var cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) {
    return null;
  }
  var customer = findRowByValue_('CUSTOMERS', 'customer_code', cleanCode) || findRowByValue_('CUSTOMERS', 'wallet_id', cleanCode);
  return customer ? ensureCustomerWalletFields_(customer) : null;
}

function getOrCreateSimpleCustomer_(data) {
  ensureSimpleModel_();
  requireFields_(data, ['phone']);

  var phoneNormalized = normalizeCustomerPhone_(data.phone);
  var customer = findCustomerByPhone_(phoneNormalized);

  if (customer) {
    customer = updateCustomerProfile_(customer, {
      full_name: data.full_name || data.name || customer.full_name,
      phone: phoneNormalized,
      email: data.email !== undefined ? data.email : customer.email,
      birthday: data.birthday !== undefined ? data.birthday : customer.birthday
    });
    return customer;
  }

  return createCustomer_({
    full_name: data.full_name || data.name || 'Cliente Loyalty',
    phone: phoneNormalized,
    email: data.email || '',
    birthday: data.birthday || ''
  });
}

function simpleCustomerAccess_(data) {
  var customer = getOrCreateSimpleCustomer_(data);
  var session = createCustomerSession_(customer);
  var payload = buildSimpleCustomerPayload_(customer, null);

  return {
    customer: payload.customer,
    customer_session: publicCustomerSession_(session),
    level: payload.level,
    customer_code: payload.customer.customer_code,
    qr: buildSimpleCustomerQr_(payload.customer.customer_code),
    promotions: payload.promotions,
    history: payload.history,
    client_url: buildClientWalletUrl_(payload.customer.customer_code)
  };
}

function getSimpleCustomerProfile_(data) {
  ensureSimpleModel_();
  var customer = null;

  if (data.customer_token || data.token) {
    customer = getCustomerContext_(data).customer;
  } else if (data.customer_code || data.code || data.wallet) {
    customer = getSimpleCustomerByCode_(data.customer_code || data.code || data.wallet);
  } else if (data.phone) {
    customer = findCustomerByPhone_(data.phone);
  }

  if (!customer) {
    throw appError_('Cliente no encontrado.', 'customer_not_found');
  }

  return buildSimpleCustomerPayload_(customer, data.business_id || '');
}

function buildSimpleCustomerPayload_(customer, businessId) {
  customer = ensureCustomerWalletFields_(customer);
  var level = publicLevel_(customer.total_passes || 0);
  var promotions = businessId ? getAvailableSimpleCoupons_(businessId, level.current_level) : getAvailableSimpleCouponsForCustomer_(level.current_level);

  return {
    customer: publicCustomer_(customer),
    level: level,
    qr: buildSimpleCustomerQr_(customer.customer_code || customer.wallet_id),
    promotions: promotions,
    history: getSimplePassHistory_(customer.customer_id, 8)
  };
}

function buildSimpleCustomerQr_(customerCode) {
  var code = String(customerCode || '').trim().toUpperCase();
  return {
    customer_code: code,
    payload: code,
    display: code
  };
}

function getSimpleBusinessHome_(context) {
  ensureSimpleModel_();
  var business = getBusinessById_(context.user.business_id);
  assertSimpleBusinessCanOperate_(business, true);

  var passes = findRowsByValue_('PASSES', 'business_id', business.business_id);
  var seen = {};
  passes.forEach(function(pass) {
    seen[pass.customer_id] = true;
  });
  var coupons = getSimpleCouponsForBusiness_(business.business_id);

  return {
    business: publicBusiness_(business),
    stats: {
      customers: Object.keys(seen).length,
      passes: passes.length,
      promotions: coupons.filter(function(coupon) { return coupon.status === 'active'; }).length,
      eligible_customers: countEligibleSimpleCustomers_(business.business_id)
    },
    customer_register_url: buildCustomerRegisterUrl_(business.business_code),
    customer_share_text: buildCustomerShareMessage_(business, buildCustomerRegisterUrl_(business.business_code))
  };
}

function scanSimpleCustomer_(context, data) {
  ensureSimpleModel_();
  requireFields_(data, ['customer_code']);

  var business = getBusinessById_(context.user.business_id);
  assertSimpleBusinessCanOperate_(business, true);

  var customer = getSimpleCustomerByCode_(data.customer_code);
  if (!customer || customer.status !== 'active') {
    throw appError_('Cliente no encontrado o inactivo.', 'customer_not_found');
  }

  var level = publicLevel_(customer.total_passes || 0);

  return {
    customer: publicCustomer_(customer),
    business: publicBusiness_(business),
    level: level,
    promotions: getAvailableSimpleCoupons_(business.business_id, level.current_level),
    recent_passes: getSimplePassHistory_(customer.customer_id, 5),
    scan_calls: 1
  };
}

function registerSimplePass_(context, data) {
  ensureSimpleModel_();
  requireFields_(data, ['customer_code']);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var business = getBusinessById_(context.user.business_id);
    assertSimpleBusinessCanOperate_(business, true);

    var customer = getSimpleCustomerByCode_(data.customer_code);
    if (!customer || customer.status !== 'active') {
      throw appError_('Cliente no encontrado o inactivo.', 'customer_not_found');
    }

    var duplicate = findRecentSimplePass_(customer.customer_id, business.business_id, context.user.user_id, 8);
    if (duplicate) {
      return buildSimplePassResult_(customer, business, null, true);
    }

    var previousPasses = parseInt(customer.total_passes || '0', 10) || 0;
    var previousLevel = calculateLevel_(previousPasses);
    var newPasses = Math.min(10000, previousPasses + 1);
    var newLevel = calculateLevel_(newPasses);
    var pass = {
      pass_id: generateId_('PAS'),
      customer_id: customer.customer_id,
      business_id: business.business_id,
      user_id: context.user.user_id,
      previous_passes: previousPasses,
      new_passes: newPasses,
      previous_level: previousLevel,
      new_level: newLevel,
      created_at: nowIso_()
    };

    appendObject_('PASSES', pass);
    updateRowByNumber_('CUSTOMERS', customer._rowNumber, {
      total_passes: newPasses,
      current_level: newLevel,
      updated_at: nowIso_()
    });

    customer = getCustomerById_(customer.customer_id);
    logActivity_(context.user.user_id, business.business_id, 'pass_registered', 'customer', customer.customer_id, {
      pass_id: pass.pass_id,
      previous_level: previousLevel,
      new_level: newLevel
    });

    return buildSimplePassResult_(customer, business, pass, false);
  } finally {
    lock.releaseLock();
  }
}

function buildSimplePassResult_(customer, business, pass, duplicate) {
  var level = publicLevel_(customer.total_passes || 0);
  var previousLevel = pass ? parseInt(pass.previous_level || level.current_level, 10) : level.current_level;

  return {
    customer: publicCustomer_(customer),
    business: publicBusiness_(business),
    level: level,
    pass: pass,
    duplicate: Boolean(duplicate),
    leveled_up: pass ? level.current_level > previousLevel : false,
    promotions: getAvailableSimpleCoupons_(business.business_id, level.current_level),
    history: getSimplePassHistory_(customer.customer_id, 5),
    api_calls_for_scan: 1
  };
}

function listSimpleBusinessCustomers_(context) {
  ensureSimpleModel_();
  var business = getBusinessById_(context.user.business_id);
  assertSimpleBusinessCanOperate_(business, true);

  var passes = findRowsByValue_('PASSES', 'business_id', business.business_id)
    .sort(function(left, right) { return String(right.created_at).localeCompare(String(left.created_at)); });
  var seen = {};
  var rows = [];
  passes.forEach(function(pass) {
    if (seen[pass.customer_id]) {
      return;
    }
    seen[pass.customer_id] = true;
    var customer = getCustomerById_(pass.customer_id);
    if (customer) {
      rows.push({
        customer: publicCustomer_(customer),
        level: publicLevel_(customer.total_passes || 0),
        last_pass_at: pass.created_at
      });
    }
  });

  return {
    customers: rows
  };
}

function listSimpleCoupons_(context) {
  ensureSimpleModel_();
  var business = getBusinessById_(context.user.business_id);
  assertSimpleBusinessCanOperate_(business, true);

  return {
    coupons: getSimpleCouponsForBusiness_(business.business_id)
  };
}

function saveSimpleCoupon_(context, data) {
  ensureSimpleModel_();
  requireFields_(data, ['title', 'level_required']);

  var business = getBusinessById_(context.user.business_id);
  assertSimpleBusinessCanOperate_(business, true);

  var now = nowIso_();
  var coupon = {
    coupon_id: data.coupon_id || generateId_('CPN'),
    business_id: business.business_id,
    title: sanitizeText_(data.title, 160),
    description: sanitizeText_(data.description || '', 400),
    level_required: String(Math.max(1, parseInt(data.level_required || '1', 10) || 1)),
    start_date: sanitizeDateText_(data.start_date || ''),
    end_date: sanitizeDateText_(data.end_date || ''),
    status: String(data.status || 'active').toLowerCase(),
    created_at: now
  };

  if (data.coupon_id) {
    updateRowById_('COUPONS', 'coupon_id', data.coupon_id, coupon);
    coupon = findRowByValue_('COUPONS', 'coupon_id', data.coupon_id);
  } else {
    appendObject_('COUPONS', coupon);
  }

  return {
    coupon: publicSimpleCoupon_(coupon)
  };
}

function redeemSimpleCoupon_(context, data) {
  ensureSimpleModel_();
  requireFields_(data, ['customer_code', 'coupon_id']);

  var business = getBusinessById_(context.user.business_id);
  assertSimpleBusinessCanOperate_(business, true);
  var customer = getSimpleCustomerByCode_(data.customer_code);
  var coupon = findRowByValue_('COUPONS', 'coupon_id', data.coupon_id);

  if (!customer || !coupon || coupon.business_id !== business.business_id) {
    throw appError_('Promocion no disponible.', 'coupon_not_available');
  }

  appendObject_('REDEMPTIONS', {
    redemption_id: generateId_('RED'),
    business_id: business.business_id,
    customer_id: customer.customer_id,
    coupon_id: coupon.coupon_id,
    user_id: context.user.user_id,
    card_id: '',
    reward_id: coupon.coupon_id,
    staff_user_id: context.user.user_id,
    status: 'redeemed',
    created_at: nowIso_(),
    redeemed_at: nowIso_()
  });

  return {
    redeemed: true,
    customer: publicCustomer_(customer),
    coupon: publicSimpleCoupon_(coupon)
  };
}

function renewBusinessPlan_(context, data) {
  requireFields_(data, ['business_id', 'plan_type']);
  var business = getBusinessById_(data.business_id);
  if (!business) {
    throw appError_('Negocio no encontrado.', 'business_not_found');
  }

  var planType = normalizePlanType_(data.plan_type);
  var start = sanitizeDateText_(data.plan_start || todayIso_());
  var end = calculatePlanEnd_(start, planType);

  updateRowByNumber_('BUSINESSES', business._rowNumber, {
    status: 'active',
    plan: planType,
    plan_type: planType,
    plan_start: start,
    plan_end: end,
    plan_status: planType === 'FREE' ? 'trial' : 'active',
    billing_status: 'current',
    next_payment_date: end,
    suspended_reason: '',
    reactivated_at: nowIso_()
  });
  updateBusinessUsersStatus_(business.business_id, 'active');

  return {
    business: publicBusiness_(getBusinessById_(business.business_id))
  };
}

function migrateToSimpleModel_() {
  ensureSimpleModel_();

  var customers = getAllRows_('CUSTOMERS');
  var migrated = 0;
  customers.forEach(function(customer) {
    var updates = {};
    if (!customer.customer_code) {
      updates.customer_code = customer.wallet_id && String(customer.wallet_id).indexOf('LOY-') === 0 ? customer.wallet_id : generateUniqueCustomerCode_();
    }
    if (!customer.wallet_id || String(customer.wallet_id).indexOf('WALLET') === 0) {
      updates.wallet_id = updates.customer_code || customer.customer_code || generateUniqueCustomerCode_();
    }
    if (customer.total_passes === '' || customer.total_passes === undefined || customer.total_passes === null) {
      updates.total_passes = 0;
    }
    if (!customer.current_level) {
      updates.current_level = calculateLevel_(updates.total_passes || customer.total_passes || 0);
    }
    if (Object.keys(updates).length && customer._rowNumber) {
      updateRowByNumber_('CUSTOMERS', customer._rowNumber, updates);
      migrated += 1;
    }
  });

  return {
    migrated_customers: migrated,
    sheets: ['BUSINESSES', 'USERS', 'CUSTOMERS', 'PASSES', 'COUPONS', 'REDEMPTIONS', 'REQUESTS', 'SESSIONS', 'ACTIVITY_LOG'],
    destructive: false
  };
}

function assertSimpleBusinessCanOperate_(business, throwOnExpired) {
  if (!business) {
    throw appError_('Negocio no encontrado.', 'business_not_found');
  }

  var status = getBusinessPlanStatus_(business);
  if (status !== business.plan_status && business._rowNumber) {
    updateRowByNumber_('BUSINESSES', business._rowNumber, {
      plan_status: status
    });
    business.plan_status = status;
  }

  if (business.status !== 'active' || status === 'expired' || status === 'suspended') {
    if (throwOnExpired) {
      throw appError_('Tu servicio ha vencido. Contacta al administrador para renovar.', 'plan_expired');
    }
    return false;
  }

  return true;
}

function getBusinessPlanStatus_(business) {
  var status = String(business.plan_status || business.billing_status || 'active').toLowerCase();
  if (business.status === 'suspended') {
    return 'suspended';
  }
  if (business.plan_end) {
    var end = new Date(String(business.plan_end).slice(0, 10) + 'T23:59:59Z');
    if (!isNaN(end.getTime()) && end.getTime() < Date.now()) {
      return 'expired';
    }
  }
  if (status === 'trial' || status === 'active') {
    return status;
  }
  return 'active';
}

function normalizePlanType_(planType) {
  var value = String(planType || '1_MONTH').toUpperCase();
  if (['FREE', '1_MONTH', '3_MONTHS', '6_MONTHS', '1_YEAR'].indexOf(value) === -1) {
    return '1_MONTH';
  }
  return value;
}

function calculatePlanEnd_(startDate, planType) {
  var date = new Date(String(startDate || todayIso_()).slice(0, 10) + 'T00:00:00Z');
  var months = { FREE: 1, '1_MONTH': 1, '3_MONTHS': 3, '6_MONTHS': 6, '1_YEAR': 12 }[normalizePlanType_(planType)] || 1;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function todayIso_() {
  return new Date().toISOString().slice(0, 10);
}

function getAvailableSimpleCoupons_(businessId, currentLevel) {
  return getSimpleCouponsForBusiness_(businessId).filter(function(coupon) {
    return isSimpleCouponActive_(coupon) && (parseInt(coupon.level_required || '1', 10) || 1) <= currentLevel;
  });
}

function getAvailableSimpleCouponsForCustomer_(currentLevel) {
  return getAllRows_('COUPONS')
    .filter(function(coupon) {
      return isSimpleCouponActive_(coupon) && (parseInt(coupon.level_required || '1', 10) || 1) <= currentLevel;
    })
    .map(publicSimpleCoupon_);
}

function getSimpleCouponsForBusiness_(businessId) {
  return findRowsByValue_('COUPONS', 'business_id', businessId)
    .map(publicSimpleCoupon_)
    .sort(function(left, right) {
      return (parseInt(left.level_required || '1', 10) || 1) - (parseInt(right.level_required || '1', 10) || 1);
    });
}

function isSimpleCouponActive_(coupon) {
  var status = String(coupon.status || 'active').toLowerCase();
  var today = todayIso_();
  return status === 'active' &&
    (!coupon.start_date || String(coupon.start_date).slice(0, 10) <= today) &&
    (!coupon.end_date || String(coupon.end_date).slice(0, 10) >= today);
}

function publicSimpleCoupon_(coupon) {
  var business = coupon.business_id ? getBusinessById_(coupon.business_id) : null;
  return {
    coupon_id: coupon.coupon_id,
    business_id: coupon.business_id || '',
    business: business ? publicBusiness_(business) : null,
    title: coupon.title || '',
    description: coupon.description || '',
    level_required: parseInt(coupon.level_required || '1', 10) || 1,
    start_date: coupon.start_date || '',
    end_date: coupon.end_date || '',
    status: coupon.status || 'active',
    created_at: coupon.created_at || ''
  };
}

function getSimplePassHistory_(customerId, limit) {
  return findRowsByValue_('PASSES', 'customer_id', customerId)
    .sort(function(left, right) { return String(right.created_at).localeCompare(String(left.created_at)); })
    .slice(0, limit || 10)
    .map(function(pass) {
      return {
        pass_id: pass.pass_id,
        customer_id: pass.customer_id,
        business_id: pass.business_id,
        business: pass.business_id ? publicBusiness_(getBusinessById_(pass.business_id) || {}) : null,
        user_id: pass.user_id || '',
        previous_passes: parseInt(pass.previous_passes || '0', 10) || 0,
        new_passes: parseInt(pass.new_passes || '0', 10) || 0,
        previous_level: parseInt(pass.previous_level || '1', 10) || 1,
        new_level: parseInt(pass.new_level || '1', 10) || 1,
        created_at: pass.created_at || ''
      };
    });
}

function findRecentSimplePass_(customerId, businessId, userId, seconds) {
  var threshold = Date.now() - ((seconds || 8) * 1000);
  var passes = findRowsByValue_('PASSES', 'customer_id', customerId);

  for (var index = 0; index < passes.length; index += 1) {
    var pass = passes[index];
    if (pass.business_id !== businessId || pass.user_id !== userId) {
      continue;
    }
    var createdAt = new Date(pass.created_at);
    if (!isNaN(createdAt.getTime()) && createdAt.getTime() >= threshold) {
      return pass;
    }
  }

  return null;
}

function countEligibleSimpleCustomers_(businessId) {
  var coupons = getAvailableSimpleCoupons_(businessId, 1001);
  if (!coupons.length) {
    return 0;
  }
  var minLevel = coupons.reduce(function(min, coupon) {
    return Math.min(min, coupon.level_required || 1);
  }, 1001);
  return getAllRows_('CUSTOMERS').filter(function(customer) {
    return calculateLevel_(customer.total_passes || 0) >= minLevel;
  }).length;
}
