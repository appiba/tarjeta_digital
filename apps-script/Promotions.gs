function isPromotionVisible_(promotion, now) {
  return getPromotionScheduleState_(promotion, now) === 'active';
}

function getPromotionScheduleState_(promotion, now) {
  if (!promotion || promotion.status !== 'active') {
    return 'disabled';
  }

  var current = now ? new Date(now) : new Date();
  var start = promotion.start_date ? new Date(promotion.start_date) : null;
  var end = promotion.end_date ? new Date(promotion.end_date) : null;

  if (start && !isNaN(start.getTime()) && current < start) {
    return 'scheduled';
  }

  if (end && !isNaN(end.getTime()) && current > end) {
    return 'expired';
  }

  return 'active';
}

function listBusinessPromotions_(context, data) {
  var rows = findRowsByValue_('PROMOTIONS', 'business_id', context.user.business_id);

  rows.sort(function(left, right) {
    return String(right.created_at).localeCompare(String(left.created_at));
  });

  return {
    promotions: rows.map(publicPromotion_)
  };
}

function createBusinessPromotion_(context, data) {
  requireFields_(data, ['title']);

  var promotion = {
    promotion_id: generateId_('PRO'),
    business_id: context.user.business_id,
    title: sanitizeText_(data.title, 140),
    description: sanitizeText_(data.description || '', 300),
    image_url: sanitizeText_(data.image_url || '', 500),
    promotion_type: normalizePromotionType_(data.promotion_type),
    visibility_status: data.start_date ? 'scheduled' : 'active',
    surprise_enabled: isTruthy_(data.surprise_enabled) ? 'true' : '',
    coupon_label: sanitizeText_(data.coupon_label || '', 140),
    start_date: sanitizeDateText_(data.start_date || ''),
    end_date: sanitizeDateText_(data.end_date || ''),
    status: 'active',
    created_at: nowIso_()
  };

  appendObject_('PROMOTIONS', promotion);

  logActivity_(context.user.user_id, context.user.business_id, 'promotion_created', 'promotion', promotion.promotion_id, {
    promotion_type: promotion.promotion_type,
    start_date: promotion.start_date,
    end_date: promotion.end_date
  });

  return {
    promotion: publicPromotion_(promotion)
  };
}

function updateBusinessPromotionStatus_(context, data) {
  requireFields_(data, ['promotion_id', 'status']);

  var promotion = findRowByValue_('PROMOTIONS', 'promotion_id', data.promotion_id);

  if (!promotion || promotion.business_id !== context.user.business_id) {
    throw appError_('Promocion no encontrada.', 'promotion_not_found');
  }

  var status = String(data.status || '').toLowerCase() === 'disabled' ? 'disabled' : 'active';
  var nextPromotion = Object.assign({}, promotion, {
    status: status
  });

  updateRowByNumber_('PROMOTIONS', promotion._rowNumber, {
    status: status,
    visibility_status: status === 'active' ? getPromotionScheduleState_(nextPromotion) : 'disabled'
  });

  logActivity_(context.user.user_id, context.user.business_id, 'promotion_status_updated', 'promotion', promotion.promotion_id, {
    status: status
  });

  return {
    promotion: publicPromotion_(findRowByValue_('PROMOTIONS', 'promotion_id', data.promotion_id))
  };
}

function publicPromotion_(promotion) {
  var business = promotion.business_id ? getBusinessById_(promotion.business_id) : null;
  var scheduleState = getPromotionScheduleState_(promotion);

  return {
    promotion_id: promotion.promotion_id,
    business_id: promotion.business_id || '',
    business: business ? publicBusiness_(business) : null,
    title: promotion.title || '',
    description: promotion.description || '',
    image_url: promotion.image_url || '',
    promotion_type: promotion.promotion_type || 'standard',
    type: promotion.promotion_type === 'surprise' ? 'surprise_coupon' : 'promotion',
    visibility_status: scheduleState,
    surprise_enabled: isTruthy_(promotion.surprise_enabled),
    coupon_label: promotion.coupon_label || '',
    start_date: promotion.start_date || '',
    end_date: promotion.end_date || '',
    status: promotion.status || '',
    created_at: promotion.created_at || ''
  };
}

function normalizePromotionType_(value) {
  var text = String(value || '').trim().toLowerCase();

  if (text === 'surprise' || text === 'sorpresa' || text === 'coupon' || text === 'cupon') {
    return 'surprise';
  }

  return 'standard';
}
