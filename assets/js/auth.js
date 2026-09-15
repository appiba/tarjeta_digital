(function() {
  function rootPath() {
    return document.body.dataset.root || '';
  }

  function loginPath() {
    return rootPath() + 'login.html';
  }

  function roleHome(role) {
    if (role === 'super_admin') {
      return rootPath() + 'admin/index.html';
    }

    if (role === 'staff') {
      return rootPath() + 'business/scanner.html';
    }

    return rootPath() + 'business/index.html';
  }

  function redirectToLogin() {
    window.location.href = loginPath();
  }

  function redirectByRole(role) {
    window.location.href = roleHome(role);
  }

  function userCanEnter(user, roles) {
    return !roles || roles.length === 0 || roles.indexOf(user.role) !== -1;
  }

  function paintUser(user) {
    AppUtils.qsa('[data-user-name]').forEach(function(node) {
      node.textContent = user.full_name || user.email;
    });

    AppUtils.qsa('[data-user-role]').forEach(function(node) {
      node.textContent = user.role || '';
    });
  }

  async function protectPage(roles) {
    var session = AppAPI.getSession();

    if (!session || !session.token || !session.user) {
      redirectToLogin();
      return null;
    }

    if (!userCanEnter(session.user, roles)) {
      redirectByRole(session.user.role);
      return null;
    }

    paintUser(session.user);

    try {
      var result = await AppAPI.apiRequest('me');

      if (!result.success) {
        throw new Error(result.message || 'Sesion invalida.');
      }

      AppAPI.setSession({
        token: session.token,
        expires_at: result.data.session.expires_at,
        user: result.data.user
      });
      paintUser(result.data.user);

      return result.data;
    } catch (error) {
      AppUtils.toast(error.message, 'error');
      redirectToLogin();
      return null;
    }
  }

  function bindLogout() {
    AppUtils.qsa('[data-logout]').forEach(function(button) {
      button.addEventListener('click', async function() {
        try {
          if (AppAPI.getSession()) {
            await AppAPI.apiRequest('logout');
          }
        } catch (error) {
          AppUtils.toast(error.message, 'error');
        } finally {
          AppAPI.clearSession();
          redirectToLogin();
        }
      });
    });
  }

  function initLoginPage() {
    var form = AppUtils.qs('[data-login-form]');
    var warning = AppUtils.qs('[data-api-warning]');

    if (!AppAPI.isConfigured() && warning) {
      warning.classList.add('is-visible');
    }

    if (!form) {
      return;
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      var button = form.querySelector('button[type="submit"]');
      var formData = new FormData(form);

      AppUtils.setButtonLoading(button, true, 'Entrando...');

      try {
        var result = await AppAPI.apiRequest('login', {
          email: formData.get('email'),
          password: formData.get('password')
        });

        if (!result.success) {
          throw new Error(result.message || 'No se pudo iniciar sesion.');
        }

        AppAPI.setSession(result.data);
        AppUtils.toast('Sesion iniciada.', 'success');
        redirectByRole(result.data.user.role);
      } catch (error) {
        AppUtils.toast(error.message, 'error');
      } finally {
        AppUtils.setButtonLoading(button, false);
      }
    });
  }

  window.Auth = {
    bindLogout: bindLogout,
    initLoginPage: initLoginPage,
    protectPage: protectPage,
    redirectByRole: redirectByRole
  };
})();
