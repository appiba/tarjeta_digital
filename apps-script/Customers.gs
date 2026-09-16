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
