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
