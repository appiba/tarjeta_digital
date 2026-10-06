(function() {
  var currentWallet = null;

  function init() {
    AppUtils.mountIcons();
    bindLogout();
    preserveWalletInNavigation();
  }

  async function initWallet() {
    init();
    var fallbackWallet = getFallbackWallet();
    var session = AppAPI.getCustomerSession();
    var code = getParam('code') || getParam('wallet');

    if ((!session || !session.token) && code) {
      await loadSimpleProfileByCode(code, paintSimpleWallet);
      return;
    }

    if ((!session || !session.token) && fallbackWallet) {
      currentWallet = fallbackWallet;
      paintSimpleWallet(fallbackWallet);
      return;
    }

    await withCustomerSession(async function(session) {
      var result = await AppAPI.apiRequest('getSimpleCustomerProfile', {
        customer_token: session.token,
        customer_code: code
      });

      if (!result.success && isNotImplemented(result, 'getSimpleCustomerProfile')) {
        result = await AppAPI.apiRequest('getCustomerWallet', {
          customer_token: session.token
        });
      }

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar tu perfil.');
      }

      currentWallet = result.data;
      if (result.data.level || result.data.qr) {
        paintSimpleWallet(result.data);
      } else {
        paintWallet(result.data);
      }
    });
  }

  async function initCard() {
    init();

    var cardId = getParam('card');

    if (!cardId) {
      AppUtils.toast('Falta el codigo de la tarjeta.', 'error');
      return;
    }

    try {
      var result = await AppAPI.apiRequest('getPublicCard', {
        card_id: cardId
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar la tarjeta.');
      }

      paintCard(result.data);
      preserveWalletInNavigation(result.data.customer && result.data.customer.wallet_id);
    } catch (error) {
      var fallbackCard = getFallbackCard(cardId);

      if (fallbackCard) {
        paintCard(fallbackCard);
        preserveWalletInNavigation(fallbackCard.customer && fallbackCard.customer.wallet_id);
      } else {
        AppUtils.toast(error.message, 'error');
      }
    }
  }

  async function initPage(pageName) {
    init();
    var fallbackWallet = getFallbackWallet();
    var session = AppAPI.getCustomerSession();
    var code = getParam('code') || getParam('wallet');

    if ((!session || !session.token) && code) {
      await loadSimpleProfileByCode(code, function(data) {
        paintSimplePage(pageName, data);
      });
      return;
    }

    if ((!session || !session.token) && fallbackWallet) {
      if (pageName === 'promotions') {
        paintPromotions(collectFallbackPromotions(fallbackWallet));
      } else if (pageName === 'history') {
        paintHistory([]);
      } else if (pageName === 'profile') {
        paintProfile(fallbackWallet.customer || {});
      } else if (pageName === 'qr') {
        paintWalletQr(fallbackWallet.wallet_qr || {
          wallet_id: fallbackWallet.wallet_id,
          display: fallbackWallet.wallet_id
        }, fallbackWallet.customer || {});
      }

      return;
    }

    await withCustomerSession(async function(session) {
      var result = await AppAPI.apiRequest('getSimpleCustomerProfile', {
        customer_token: session.token,
        customer_code: code
      });

      if (!result.success && isNotImplemented(result, 'getSimpleCustomerProfile')) {
        var action = pageAction(pageName);
        result = await AppAPI.apiRequest(action, {
          customer_token: session.token
        });
      }

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar la informacion.');
      }

      if (result.data.level || result.data.qr) {
        paintSimplePage(pageName, result.data);
        return;
      }

      if (pageName === 'promotions') {
        paintPromotions(result.data.promotions || []);
      } else if (pageName === 'history') {
        paintHistory(result.data.history || []);
      } else if (pageName === 'profile') {
        paintProfile(result.data.customer || {});
      } else if (pageName === 'qr') {
        paintWalletQr(result.data.wallet_qr || {}, result.data.customer || {});
      }
    });
  }

  async function loadSimpleProfileByCode(code, painter) {
    try {
      var result = await AppAPI.apiRequest('getSimpleCustomerProfile', {
        customer_code: code
      });

      if (!result.success) {
        throw new Error(result.message || 'No se pudo cargar el perfil.');
      }

      currentWallet = result.data;
      painter(result.data);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
      showMissingSession();
    }
  }

  function paintSimplePage(pageName, data) {
    if (pageName === 'promotions') {
      paintPromotions(data.promotions || []);
    } else if (pageName === 'history') {
      paintHistory(data.history || []);
    } else if (pageName === 'profile') {
      paintProfile(data.customer || {});
    } else if (pageName === 'qr') {
      paintWalletQr(data.qr || data.wallet_qr || {}, data.customer || {});
    }
  }

  function pageAction(pageName) {
    if (pageName === 'promotions') {
      return 'getWalletPromotions';
    }

    if (pageName === 'history') {
      return 'getWalletHistory';
    }

    if (pageName === 'qr') {
      return 'getWalletQr';
    }

    return 'getCustomerWallet';
  }

  function isNotImplemented(result, action) {
    var message = String(result && result.message || '').toLowerCase();
    var error = String(result && result.error || '').toLowerCase();
    var actionName = String(action || '').toLowerCase();

    return error === 'not_implemented' || (message.indexOf('accion no implementada') !== -1 && message.indexOf(actionName) !== -1);
  }

  async function withCustomerSession(callback) {
    var session = AppAPI.getCustomerSession();

    if (!session || !session.token) {
      showMissingSession();
      return;
    }

    try {
      await callback(session);
    } catch (error) {
      AppUtils.toast(error.message, 'error');
      if (String(error.message || '').toLowerCase().indexOf('sesion') !== -1) {
        showMissingSession();
      }
    }
  }

  function showMissingSession() {
    var target = AppUtils.qs('[data-client-content]') || AppUtils.qs('.client-page') || AppUtils.qs('.client-screen');

    if (!target) {
      return;
    }

    target.innerHTML = '<section class="panel-card wallet-empty">' +
      '<i data-lucide="wallet"></i>' +
      '<h1>Abre tu perfil desde un negocio</h1>' +
      '<p>Escanea el QR o entra al link que te compartio un establecimiento para identificarte con tu WhatsApp.</p>' +
      '<a class="button button--primary" href="../index.html">Ir al inicio</a>' +
      '</section>';
    AppUtils.mountIcons();
  }

  function getFallbackWallet() {
    try {
      return JSON.parse(window.localStorage.getItem('loyalty_fallback_wallet') || 'null');
    } catch (error) {
      return null;
    }
  }

  function getFallbackCard(cardId) {
    var wallet = getFallbackWallet();
    var cards = wallet && wallet.cards ? wallet.cards : [];

    for (var index = 0; index < cards.length; index += 1) {
      if (cards[index].card && cards[index].card.card_id === cardId) {
        return {
          business: cards[index].business || {},
          customer: wallet.customer || {},
          card: cards[index].card || {},
          program: cards[index].program || {},
          reward: cards[index].reward || {},
          welcome_reward: cards[index].welcome_reward || {},
          coupons: cards[index].coupons || [],
          available_coupons: cards[index].available_coupons || [],
          promotions: collectFallbackPromotions(wallet),
          history: [],
          wallet_qr: wallet.wallet_qr || {
            wallet_id: wallet.wallet_id,
            display: wallet.wallet_id
          }
        };
      }
    }

    return null;
  }

  function collectFallbackPromotions(wallet) {
    var promotions = [];
    var cards = wallet && wallet.cards ? wallet.cards : [];
    var localPromotions = [];

    try {
      localPromotions = JSON.parse(window.localStorage.getItem('loyalty_fallback_promotions') || '[]');
    } catch (error) {
      localPromotions = [];
    }

    cards.forEach(function(item) {
      localPromotions.forEach(function(promotion) {
        promotions.push(Object.assign({
          business: item.business || {}
        }, promotion));
      });

      (item.available_coupons || item.coupons || []).forEach(function(coupon) {
        promotions.push({
          promotion_id: coupon.coupon_id || coupon.title,
          type: 'coupon',
          business: item.business || {},
          title: coupon.title || 'Cupon disponible',
          description: coupon.description || 'Beneficio de tu perfil.',
          status: coupon.status || 'available',
          start_date: coupon.created_at || '',
          end_date: ''
        });
      });
    });

    return promotions;
  }

  function paintWallet(data) {
    var customer = data.customer || {};
    var cards = data.cards || [];

    setText('[data-wallet-name]', firstName(customer.full_name || 'Cliente'));
    setText('[data-wallet-count]', cards.length + ' negocios activos');
    setText('[data-wallet-id]', data.wallet_qr && data.wallet_qr.display ? data.wallet_qr.display : customer.wallet_id || '');

    var list = AppUtils.qs('[data-wallet-cards]');

    if (!list) {
      return;
    }

    if (cards.length === 0) {
      list.innerHTML = '<article class="wallet-empty"><i data-lucide="badge"></i><h2>Sin actividad todavia</h2><p>Usa tu codigo Loyalty en un negocio para registrar tu primera pasada.</p></article>';
      AppUtils.mountIcons();
      return;
    }

    list.innerHTML = cards.map(renderWalletCard).join('');
    AppUtils.mountIcons();
  }

  function paintSimpleWallet(data) {
    var customer = data.customer || {};
    var level = data.level || {};
    var qr = data.qr || data.wallet_qr || {};
    var code = customer.customer_code || customer.wallet_id || data.customer_code || data.wallet_id || qr.customer_code || qr.wallet_id || '';
    var promotions = data.promotions || [];
    var history = data.history || [];

    setText('[data-wallet-name]', firstName(customer.full_name || 'Cliente'));
    setText('[data-wallet-count]', 'Nivel ' + (level.current_level || customer.current_level || 1));
    setText('[data-wallet-id]', code);

    var list = AppUtils.qs('[data-wallet-cards]');

    if (!list) {
      return;
    }

    list.innerHTML =
      '<article class="wallet-qr-card">' +
        '<span class="badge">Mi codigo unico</span>' +
        '<h1>' + escapeHtml(code || 'LOY') + '</h1>' +
        '<div class="wallet-qr-frame"><img alt="QR unico Loyalty" src="' + escapeAttr(qrImageUrl(code)) + '"></div>' +
        '<strong>' + escapeHtml(code) + '</strong>' +
      '</article>' +
      '<article class="panel-card">' +
        '<h2>Nivel ' + escapeHtml(level.current_level || customer.current_level || 1) + '</h2>' +
        '<p>' + escapeHtml(level.label || ((customer.total_passes || 0) + ' pasadas')) + '</p>' +
        '<div class="wallet-progress"><span style="width:' + escapeAttr(level.progress_percent || 0) + '%"></span></div>' +
        '<p>Te faltan ' + escapeHtml(level.remaining_to_next_level === undefined ? 10 : level.remaining_to_next_level) + ' pasadas para subir de nivel.</p>' +
      '</article>' +
      '<article class="panel-card"><h2>Promociones disponibles</h2>' + renderSimplePromotions(promotions) + '</article>' +
      '<article class="panel-card"><h2>Historial reciente</h2>' + renderSimpleHistory(history) + '</article>';

    AppUtils.mountIcons();
  }

  function qrImageUrl(payload) {
    return payload ? 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=' + encodeURIComponent(payload) : '';
  }

  function renderSimplePromotions(promotions) {
    if (!promotions || !promotions.length) {
      return '<p class="muted">Aun no tienes promociones disponibles.</p>';
    }

    return '<div class="client-list">' + promotions.map(function(promotion) {
      var business = promotion.business || {};
      return '<article class="history-card"><div class="history-card__icon"><i data-lucide="ticket"></i></div><div><span class="badge">' + escapeHtml(business.business_name || ('Nivel ' + (promotion.level_required || ''))) + '</span><h3>' + escapeHtml(promotion.title || 'Promocion') + '</h3><p>' + escapeHtml(promotion.description || '') + '</p></div></article>';
    }).join('') + '</div>';
  }

  function renderSimpleHistory(history) {
    if (!history || !history.length) {
      return '<p class="muted">Sin pasadas todavia.</p>';
    }

    return '<div class="client-list">' + history.map(function(item) {
      var business = item.business || {};
      return '<article class="history-card"><div class="history-card__icon"><i data-lucide="scan-line"></i></div><div><strong>+1 pasada</strong><p>' + escapeHtml(business.business_name || 'Local') + ' / ' + escapeHtml(AppUtils.formatDate(item.created_at)) + '</p></div></article>';
    }).join('') + '</div>';
  }

  function renderWalletCard(item, index) {
    var business = item.business || {};
    var program = item.program || {};
    var card = item.card || {};
    var welcome = item.welcome_reward || {};
    var coupon = firstAvailableCoupon(item.available_coupons || item.coupons || []);
    var disabled = business.status === 'suspended' || card.status !== 'active';
    var style = 'style="--card-primary:' + escapeAttr(business.primary_color || '#1f5eff') + ';--card-secondary:' + escapeAttr(business.secondary_color || '#12b981') + ';--stack-index:' + index + '"';
    var benefit = coupon ? coupon.title : (welcome.enabled && welcome.status === 'available' ? '1 beneficio disponible' : 'Ofertas y cupones sorpresa');
    var label = progressText(card, program);

    return '<a class="wallet-card' + (disabled ? ' is-disabled' : '') + '" ' + style + ' href="card.html?card=' + escapeAttr(card.card_id) + '">' +
      '<div class="wallet-card__top">' +
        '<div class="wallet-card__logo">' + escapeHtml(initials(business.business_name || 'L')) + '</div>' +
        '<span>' + escapeHtml(labelProgramType(program.program_type)) + '</span>' +
      '</div>' +
      '<h2>' + escapeHtml(business.business_name || 'Negocio') + '</h2>' +
      '<p>' + escapeHtml(label) + '</p>' +
      '<div class="wallet-progress"><span style="width:' + escapeAttr(card.progress_percent || 0) + '%"></span></div>' +
      '<strong>' + escapeHtml(benefit) + '</strong>' +
      (disabled ? '<em>Programa temporalmente no disponible.</em>' : '') +
      '</a>';
  }

  function paintCard(data) {
    var business = data.business || {};
    var customer = data.customer || {};
    var card = data.card || {};
    var program = data.program || {};
    var welcome = data.welcome_reward || {};
    var coupons = data.coupons || [];
    var left = Math.max(0, (card.goal || 0) - (card.current || 0));

    setThemeColor('--primary', business.primary_color || '#1f5eff');
    setThemeColor('--secondary', business.secondary_color || '#12b981');
    setText('[data-business-initials]', initials(business.business_name || 'Loyalty'));
    setText('[data-business-name]', business.business_name || 'Loyalty');
    setText('[data-business-type]', business.business_type || 'Tarjeta digital');
    setText('[data-customer-name]', customer.full_name || 'Cliente');
    setText('[data-progress-label]', progressText(card, program));
    setText('[data-progress-percent]', (card.progress_percent || 0) + '%');
    setText('[data-progress-left]', left > 0 ? 'Te faltan ' + left + ' para desbloquear nuevas ofertas.' : 'Ya puedes solicitar tu beneficio en el local.');
    setText('[data-reward-name]', benefitLabel(data));
    setText('[data-wallet-display]', data.wallet_qr && data.wallet_qr.display ? data.wallet_qr.display : customer.wallet_id || '');
    setText('[data-welcome-title]', welcome.enabled ? welcome.title : 'Cupones sorpresa y descuentos');
    setText('[data-welcome-status]', welcome.enabled ? statusLabel(welcome.status) : 'Se activan por calendario');
    paintCardQr(data.wallet_qr || {}, customer, card);
    paintProgressBeans(card.current || 0, card.goal || 10);
    paintMiniList('[data-card-coupons]', coupons, renderCouponItem, 'Aun no tienes cupones.');
    paintMiniList('[data-card-promotions]', data.promotions || [], renderPromotionItem, 'Aun no hay ofertas o cupones sorpresa activos.');
    paintMiniList('[data-card-history]', data.history || [], renderHistoryItem, 'Sin movimientos todavia.');
    AppUtils.mountIcons();
  }

  function paintPromotions(promotions) {
    paintMiniList('[data-promotions-list]', promotions, renderPromotionItem, 'Todavia no tienes promociones activas.');
  }

  function paintHistory(history) {
    paintMiniList('[data-history-list]', history, renderHistoryItem, 'Sin movimientos todavia.');
  }

  function paintProfile(customer) {
    setText('[data-profile-initials]', initials(customer.full_name || 'Cliente'));
    setText('[data-profile-name]', customer.full_name || 'Cliente');
    setText('[data-profile-phone]', customer.phone || 'Sin WhatsApp');
    setText('[data-profile-email]', customer.email || 'Sin correo');
    setText('[data-profile-birthday]', customer.birthday || 'Sin fecha');
    setText('[data-profile-wallet]', customer.wallet_id || '');
  }

  function paintWalletQr(walletQr, customer) {
    setText('[data-qr-customer]', customer.full_name || 'Cliente');
    setText('[data-wallet-qr-id]', walletQr.display || walletQr.customer_code || walletQr.wallet_id || '');
    setText('[data-wallet-qr-payload]', walletQr.customer_code || walletQr.wallet_id || '');

    var img = AppUtils.qs('[data-wallet-qr-image]');
    var payload = walletQr.payload || walletQr.customer_code || walletQr.wallet_id || '';

    if (img && payload) {
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(payload);
      img.alt = 'QR Loyalty ' + (walletQr.display || payload);
    }
  }

  function paintCardQr(walletQr, customer, card) {
    var img = AppUtils.qs('[data-card-qr-image]');
    var walletId = walletQr.wallet_id || customer.wallet_id || '';
    var payload = buildCardScannerPayload(walletQr, walletId, card && card.card_id);

    if (!img || !payload) {
      return;
    }

    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=' + encodeURIComponent(payload);
    img.alt = 'QR Loyalty ' + (walletQr.display || walletId);
  }

  function buildCardScannerPayload(walletQr, walletId, cardId) {
    var source = walletQr.scanner_url || walletQr.payload || walletId;
    var url;

    if (!walletId && walletQr.wallet_id) {
      walletId = walletQr.wallet_id;
    }

    try {
      url = new URL(source, window.location.href);
    } catch (error) {
      url = new URL('../business/scanner.html', window.location.href);
    }

    if (url.pathname.indexOf('/business/scanner.html') === -1) {
      url = new URL('../business/scanner.html', window.location.href);
    }

    if (walletId) {
      url.searchParams.set('wallet', walletId);
    }

    if (cardId) {
      url.searchParams.set('card', cardId);
    }

    return url.href;
  }

  function paintMiniList(selector, rows, renderer, emptyMessage) {
    var container = AppUtils.qs(selector);

    if (!container) {
      return;
    }

    if (!rows || rows.length === 0) {
      container.innerHTML = '<article class="empty-state"><div><i data-lucide="inbox"></i><h2>' + escapeHtml(emptyMessage) + '</h2></div></article>';
      AppUtils.mountIcons();
      return;
    }

    container.innerHTML = rows.map(renderer).join('');
    AppUtils.mountIcons();
  }

  function renderPromotionItem(promotion) {
    var business = promotion.business || {};
    var icon = promotion.type === 'coupon' || promotion.type === 'surprise_coupon' ? 'ticket' : initials(business.business_name || 'L');
    var state = promotion.visibility_status || promotion.status || 'active';
    var typeLabel = promotion.type === 'surprise_coupon' || promotion.promotion_type === 'surprise' ? 'Cupon sorpresa' : (promotion.type === 'coupon' ? 'Cupon' : 'Promocion');
    return '<article class="promotion-card">' +
      '<div class="promotion-card__image" style="background:linear-gradient(135deg,' + escapeAttr(business.primary_color || '#1f5eff') + ',' + escapeAttr(business.secondary_color || '#12b981') + ')">' + escapeHtml(icon) + '</div>' +
      '<div><span class="badge">' + escapeHtml(typeLabel + ' / ' + promotionStateLabel(state)) + '</span><h2>' + escapeHtml(promotion.title || 'Promocion') + '</h2><p>' + escapeHtml(promotion.description || '') + '</p><p>' + escapeHtml(dateRangeLabel(promotion)) + '</p></div>' +
      '</article>';
  }

  function renderCouponItem(coupon) {
    var business = coupon.business || {};
    return '<article class="history-card">' +
      '<div class="history-card__icon"><i data-lucide="ticket"></i></div>' +
      '<div><span class="badge">' + escapeHtml(statusLabel(coupon.status)) + '</span><h2>' + escapeHtml(coupon.title || 'Cupon') + '</h2><p>' + escapeHtml(coupon.description || business.business_name || '') + '</p><p>' + escapeHtml(coupon.redeemed_at ? 'Canjeado: ' + AppUtils.formatDate(coupon.redeemed_at) : 'Listo para usar en el local') + '</p></div>' +
      '</article>';
  }

  function renderHistoryItem(item) {
    var business = item.business || {};
    return '<article class="history-card">' +
      '<div class="history-card__icon"><i data-lucide="' + escapeAttr(iconForTransaction(item.type)) + '"></i></div>' +
      '<div><span class="badge">' + escapeHtml(business.business_name || 'Loyalty') + '</span><h2>' + escapeHtml(transactionLabel(item)) + '</h2><p>' + escapeHtml(AppUtils.formatDate(item.created_at)) + '</p></div>' +
      '</article>';
  }

  function transactionLabel(item) {
    if (item.type === 'add_stamp') {
      return '+1 sello';
    }

    if (item.type === 'add_visit') {
      return '+1 visita';
    }

    if (item.type === 'add_points') {
      return '+' + (item.points_change || item.amount || 0) + ' puntos';
    }

    if (item.type === 'welcome_reward_granted') {
      return 'Beneficio de bienvenida';
    }

    if (item.type === 'welcome_reward_redeemed') {
      return 'Beneficio canjeado';
    }

    if (item.type === 'coupon_granted') {
      return item.notes || 'Cupon desbloqueado';
    }

    if (item.type === 'coupon_redeemed') {
      return item.notes || 'Cupon canjeado';
    }

    if (item.type === 'card_added') {
      return 'Tarjeta agregada';
    }

    return item.notes || item.type || 'Movimiento';
  }

  function iconForTransaction(type) {
    if (type === 'welcome_reward_granted' || type === 'welcome_reward_redeemed') {
      return 'gift';
    }

    if (type === 'add_points') {
      return 'badge-dollar-sign';
    }

    if (type === 'card_added') {
      return 'badge-check';
    }

    return 'plus';
  }

  function paintProgressBeans(current, goal) {
    var container = AppUtils.qs('[data-progress-beans]');
    var total = Math.max(1, Math.min(20, parseInt(goal || '10', 10) || 10));
    var filled = Math.max(0, Math.min(total, parseInt(current || '0', 10) || 0));
    var html = '';

    if (!container) {
      return;
    }

    for (var index = 0; index < total; index += 1) {
      html += '<span class="coffee-bean' + (index >= filled ? ' is-empty' : '') + '"></span>';
    }

    container.innerHTML = html;
  }

  function getParam(name) {
    var params = new URLSearchParams(window.location.search);
    return String(params.get(name) || '').trim();
  }

  function setText(selector, value) {
    AppUtils.qsa(selector).forEach(function(node) {
      node.textContent = value === undefined || value === null ? '' : String(value);
    });
  }

  function setThemeColor(name, value) {
    document.documentElement.style.setProperty(name, value);
    document.body.style.setProperty(name, value);
  }

  function labelProgramType(type) {
    var value = String(type || 'STAMPS').toUpperCase();

    if (value === 'POINTS') {
      return 'puntos';
    }

    if (value === 'VISITS') {
      return 'visitas';
    }

    return 'sellos';
  }

  function progressText(card, program) {
    var type = String(program && program.program_type || 'STAMPS').toUpperCase();

    if (type === 'POINTS') {
      return (card.points || 0) + ' puntos';
    }

    if (type === 'VISITS') {
      return (card.visits || 0) + ' de ' + (card.goal || 10) + ' visitas';
    }

    return (card.stamps || 0) + ' de ' + (card.goal || 10) + ' sellos';
  }

  function statusLabel(status) {
    if (status === 'available') {
      return 'Disponible';
    }

    if (status === 'redeemed') {
      return 'Canjeado';
    }

    if (status === 'expired') {
      return 'Vencido';
    }

    return status || 'No configurado';
  }

  function benefitLabel(data) {
    var coupons = data.available_coupons || [];
    var promotions = data.promotions || [];

    if (coupons.length && coupons[0].title) {
      return coupons[0].title;
    }

    if (promotions.some(function(promotion) {
      var state = promotion.visibility_status || promotion.status || 'active';
      return state === 'active' && (promotion.type === 'surprise_coupon' || promotion.promotion_type === 'surprise');
    })) {
      return 'Cupon sorpresa activo';
    }

    if (promotions.some(function(promotion) {
      var state = promotion.visibility_status || promotion.status || 'active';
      return state === 'active';
    })) {
      return 'Ofertas y descuentos activos';
    }

    return 'Ofertas, cupones sorpresa y descuentos';
  }

  function promotionStateLabel(state) {
    if (state === 'scheduled') {
      return 'Programada';
    }

    if (state === 'expired') {
      return 'Finalizada';
    }

    if (state === 'disabled') {
      return 'Deshabilitada';
    }

    if (state === 'redeemed') {
      return 'Canjeada';
    }

    return 'Activa';
  }

  function dateRangeLabel(promotion) {
    if (!promotion.start_date && !promotion.end_date) {
      return 'Sin calendario definido';
    }

    return 'Vigencia: ' + (promotion.start_date ? AppUtils.formatDate(promotion.start_date) : 'ahora') + ' - ' + (promotion.end_date ? AppUtils.formatDate(promotion.end_date) : 'sin fin');
  }

  function firstAvailableCoupon(coupons) {
    for (var index = coupons.length - 1; index >= 0; index -= 1) {
      if (coupons[index].status === 'available') {
        return coupons[index];
      }
    }

    return coupons.length ? coupons[coupons.length - 1] : null;
  }

  function firstName(name) {
    return String(name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
  }

  function initials(value) {
    return String(value || 'L')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function(part) { return part.charAt(0).toUpperCase(); })
      .join('') || 'L';
  }

  function preserveWalletInNavigation(walletId) {
    var wallet = walletId || getParam('code') || getParam('wallet') || (AppAPI.getCustomerSession() && AppAPI.getCustomerSession().wallet_id) || '';

    AppUtils.qsa('.bottom-nav a').forEach(function(link) {
      var href = link.getAttribute('href');

      if (!href || href.indexOf('#') === 0) {
        return;
      }

      var url = new URL(href, window.location.href);

      if (wallet) {
        url.searchParams.set('code', wallet);
      }

      link.href = url.pathname.split('/').pop() + url.search;
    });
  }

  function bindLogout() {
    AppUtils.qsa('[data-client-logout]').forEach(function(button) {
      button.addEventListener('click', function() {
        AppAPI.clearCustomerSession();
        window.location.href = '../index.html';
      });
    });
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  window.ClientApp = {
    init: init,
    initCard: initCard,
    initPage: initPage,
    initWallet: initWallet
  };
})();
