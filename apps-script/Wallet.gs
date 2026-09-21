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
  var cardId = sanitizeText_(data.card_id || data.card || '', 80);
  var fast = isTruthy_(data.fast);

  if (!walletId && !cardId) {
    throw appError_('Indica el wallet_id del cliente.', 'missing_wallet');
  }

  var business = getBusinessById_(context.user.business_id);

  if (!business || business.status !== 'active') {
    throw appError_('Negocio inactivo o no encontrado.', 'business_not_found');
  }

  var program = getActiveProgramForBusiness_(business.business_id);

  if (!program) {
    throw appError_('Este negocio aun no tiene programa activo.', 'program_not_found');
  }

  var customer = null;
  var card = null;

  if (cardId) {
    card = getCustomerCardById_(cardId);

    if (!card || card.business_id !== business.business_id) {
      throw appError_('Tarjeta no encontrada en este negocio.', 'card_not_found');
    }

    customer = getCustomerById_(card.customer_id);
  }

  if (!customer && walletId) {
    customer = getCustomerByWalletId_(walletId);

    if (!customer) {
      throw appError_('Wallet no encontrada.', 'wallet_not_found');
    }

    card = getCustomerCardForBusiness_(customer.customer_id, business.business_id);
  }

  if (!customer) {
    throw appError_('Cliente no encontrado.', 'customer_not_found');
  }

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
    coupons: (!fast && card) ? getCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
    available_coupons: (!fast && card) ? getAvailableCouponsForCard_(card.card_id).map(publicCustomerCoupon_) : [],
    history: (!fast && card) ? getHistoryForCard_(card.card_id) : []
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

function buildCardQrPayload_(walletId, cardId) {
  var cleanWalletId = String(walletId || '').trim().toUpperCase();
  var cleanCardId = String(cardId || '').trim().toUpperCase();

  return {
    wallet_id: cleanWalletId,
    card_id: cleanCardId,
    payload: cleanWalletId,
    scanner_url: buildBusinessScannerWalletUrl_(cleanWalletId, cleanCardId),
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

function buildBusinessScannerWalletUrl_(walletId, cardId) {
  var appUrl = getConfigValue_('APP_URL', '');

  if (!appUrl) {
    return String(walletId || '');
  }

  var url = appUrl.replace(/\/?$/, '/') + 'business/scanner.html?wallet=' + encodeURIComponent(walletId || '');

  if (cardId) {
    url += '&card=' + encodeURIComponent(cardId);
  }

  return url;
}
