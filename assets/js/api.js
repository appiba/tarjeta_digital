const API_URL = 'https://script.google.com/macros/s/AKfycbx9po1dIm-5cGsPV31rjEz_SAURlQilTaHeExaT5VUVkTnz42-cc6J33CbFDTAfj5f7dw/exec';

(function() {
  var STORAGE_KEY = 'loyalty_session';
  var CUSTOMER_STORAGE_KEY = 'loyalty_customer_session';

  function isConfigured() {
    return API_URL && API_URL.indexOf('URL_DEL_APPS_SCRIPT') === -1;
  }

  function getSession() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function setSession(session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clearSession() {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function getCustomerSession() {
    try {
      return JSON.parse(window.localStorage.getItem(CUSTOMER_STORAGE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function setCustomerSession(session) {
    window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(session));
  }

  function clearCustomerSession() {
    window.localStorage.removeItem(CUSTOMER_STORAGE_KEY);
  }

  async function apiRequest(action, data, options) {
    options = options || {};

    if (!isConfigured()) {
      throw new Error('Configura API_URL en assets/js/api.js con la URL del Web App de Apps Script.');
    }

    var session = getSession();
    var payload = {
      action: action,
      data: data || {},
      token: options.token || (session && session.token ? session.token : '')
    };

    var response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    var result;
    var text;

    try {
      text = await response.text();
      result = JSON.parse(text);
    } catch (error) {
      console.error('Respuesta API no JSON', {
        status: response.status,
        action: action,
        body: text || ''
      });
      throw new Error('No pudimos cargar la informacion. Intenta nuevamente.');
    }

    if (!result.success && (result.error === 'unauthorized' || result.error === 'forbidden')) {
      clearSession();
    }

    if (!result.success && result.error === 'customer_unauthorized') {
      clearCustomerSession();
    }

    return result;
  }

  window.AppAPI = {
    API_URL: API_URL,
    apiRequest: apiRequest,
    clearCustomerSession: clearCustomerSession,
    clearSession: clearSession,
    getCustomerSession: getCustomerSession,
    getSession: getSession,
    isConfigured: isConfigured,
    setCustomerSession: setCustomerSession,
    setSession: setSession
  };

  window.apiRequest = apiRequest;
})();
