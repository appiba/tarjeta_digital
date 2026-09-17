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
