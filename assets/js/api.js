const API_URL = 'https://script.google.com/macros/s/AKfycbx9po1dIm-5cGsPV31rjEz_SAURlQilTaHeExaT5VUVkTnz42-cc6J33CbFDTAfj5f7dw/exec';

(function() {
  var STORAGE_KEY = 'loyalty_session';

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

    try {
      result = await response.json();
    } catch (error) {
      throw new Error('La API no devolvio JSON valido.');
    }

    if (!result.success && (result.error === 'unauthorized' || result.error === 'forbidden')) {
      clearSession();
    }

    return result;
  }

  window.AppAPI = {
    API_URL: API_URL,
    apiRequest: apiRequest,
    clearSession: clearSession,
    getSession: getSession,
    isConfigured: isConfigured,
    setSession: setSession
  };

  window.apiRequest = apiRequest;
})();
