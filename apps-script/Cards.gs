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
