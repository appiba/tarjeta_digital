function isPromotionVisible_(promotion, now) {
  if (!promotion || promotion.status !== 'active') {
    return false;
  }

  var current = now ? new Date(now) : new Date();
  var start = promotion.start_date ? new Date(promotion.start_date) : null;
  var end = promotion.end_date ? new Date(promotion.end_date) : null;

  if (start && !isNaN(start.getTime()) && current < start) {
    return false;
  }

  if (end && !isNaN(end.getTime()) && current > end) {
    return false;
  }

  return true;
}
