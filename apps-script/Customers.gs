function normalizeCustomerPhone_(phone) {
  return normalizePhone_(phone);
}

function getCustomerByPhone_(phone) {
  return findRowByValue_('CUSTOMERS', 'phone', normalizeCustomerPhone_(phone));
}

function getCustomerCardById_(cardId) {
  return findRowByValue_('CUSTOMER_CARDS', 'card_id', cardId);
}
