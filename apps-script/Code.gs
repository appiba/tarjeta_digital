function doGet(e) {
  return handleHttpRequest_(e, 'GET');
}

function doPost(e) {
  return handleHttpRequest_(e, 'POST');
}

function handleHttpRequest_(e, method) {
  try {
    var request = buildRequest_(e, method);
    var data = routeAction_(request);

    return jsonResponse_({
      success: true,
      data: data || {},
      message: 'Operacion realizada correctamente'
    });
  } catch (error) {
    logServerError_(error);

    return jsonResponse_({
      success: false,
      message: error && error.message ? error.message : 'Error interno',
      error: error && error.code ? error.code : 'internal_error'
    });
  }
}

function buildRequest_(e, method) {
  var parameters = e && e.parameter ? e.parameter : {};
  var body = {};

  if (method === 'POST' && e && e.postData && e.postData.contents) {
    body = parseJsonBody_(e.postData.contents);
  }

  var data = body.data || {};
  var action = parameters.action || body.action || data.action;
  var token = body.token || data.token || parameters.token || '';

  return {
    action: String(action || '').trim(),
    data: data,
    method: method,
    parameters: parameters,
    token: token
  };
}

function routeAction_(request) {
  switch (request.action) {
    case 'health':
      return getHealth_();
    case 'login':
      return loginUser_(request.data);
    case 'logout':
      return logoutUser_(requireSession_(request.token));
    case 'me':
      return getCurrentUser_(requireSession_(request.token));
    case 'registerBusiness':
      return registerBusinessRequest_(request.data);
    case 'getPublicBusiness':
      return getPublicBusiness_(request.data);
    case 'registerCustomer':
      return registerCustomer_(request.data);
    case 'getPublicCard':
      return getPublicCard_(request.data);
    case 'getAdminStats':
      return getAdminStats_(requireSession_(request.token, ['super_admin']));
    case 'getPendingRequests':
      return getPendingRequests_(requireSession_(request.token, ['super_admin']));
    case 'getRequests':
      return getRequests_(requireSession_(request.token, ['super_admin']), request.data);
    case 'approveBusiness':
      return approveBusinessRequest_(requireSession_(request.token, ['super_admin']), request.data);
    case 'rejectBusiness':
      return rejectBusinessRequest_(requireSession_(request.token, ['super_admin']), request.data);
    case 'listBusinesses':
      return listBusinesses_(requireSession_(request.token, ['super_admin']), request.data);
    case 'getBusinessHome':
      return getBusinessHome_(requireSession_(request.token, ['business_owner', 'staff']));
    default:
      throw appError_('Accion no implementada: ' + request.action, 'not_implemented');
  }
}

function getHealth_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('SPREADSHEET_ID') || '';

  return {
    app: 'Loyalty',
    phase: '1',
    configured: Boolean(spreadsheetId),
    spreadsheetId: spreadsheetId
  };
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
