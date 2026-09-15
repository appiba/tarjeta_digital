# Loyalty - Fases 1 y 2

Base de una plataforma web de tarjetas digitales de lealtad para GitHub Pages, Google Sheets y Google Apps Script.

Esta base implementa:

- Estructura completa de carpetas y rutas.
- Frontend estatico con HTML, CSS y JavaScript.
- Login en `login.html`.
- Guardado local del token de sesion.
- Validacion de sesion en panel administrador y panel negocio.
- Apps Script separado por archivos.
- `setupSystem()` para crear hojas, encabezados y carpetas Drive.
- `createSuperAdmin()` para crear el primer administrador.
- Solicitud publica de negocio en `solicitud.html`.
- Panel de solicitudes en `admin/solicitudes.html`.
- Aprobacion y rechazo de solicitudes.
- Creacion automatica de negocio, usuario propietario, programa y recompensa inicial.
- Listado basico de negocios en `admin/negocios.html`.

Las fases siguientes conectaran personalizacion del negocio, clientes, tarjetas, QR, scanner, transacciones, promociones y canjes.

## Estructura

```text
/
  index.html
  login.html
  solicitud.html
  admin/
  business/
  client/
  register/
  assets/
    css/
    js/
    images/
  apps-script/
  manifest.json
  service-worker.js
  README.md
```

## Crear Google Sheet

Puedes usar el Sheet que ya tienes o crear uno nuevo.

1. Abre Google Sheets.
2. Crea una hoja nueva con cualquier nombre, por ejemplo `tarjeta de local`.
3. Copia el ID desde la URL.

Ejemplo:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

No necesitas crear hojas manualmente. `setupSystem()` creara:

```text
CONFIG
BUSINESSES
USERS
CUSTOMERS
CUSTOMER_CARDS
LOYALTY_PROGRAMS
TRANSACTIONS
REWARDS
REDEMPTIONS
PROMOTIONS
REQUESTS
SESSIONS
ACTIVITY_LOG
```

## Crear Apps Script

1. Ve a [script.google.com](https://script.google.com).
2. Crea un proyecto nuevo.
3. Crea estos archivos dentro del proyecto y pega el contenido correspondiente desde `apps-script/`:

```text
Code.gs
Auth.gs
Businesses.gs
Customers.gs
Loyalty.gs
Promotions.gs
Uploads.gs
Utils.gs
Security.gs
appsscript.json
```

## Configurar Script Properties

En Apps Script:

1. Abre `Project Settings`.
2. En `Script Properties`, agrega:

```text
SPREADSHEET_ID = ID_DE_TU_GOOGLE_SHEET
INITIAL_ADMIN_NAME = Tu nombre
INITIAL_ADMIN_EMAIL = tu-correo@example.com
INITIAL_ADMIN_PASSWORD = una-contrasena-segura
```

`INITIAL_ADMIN_PASSWORD` se elimina automaticamente despues de ejecutar `createSuperAdmin()`.

## Ejecutar setupSystem()

1. En Apps Script, selecciona la funcion `setupSystem`.
2. Presiona `Run`.
3. Acepta permisos de Google Sheets y Google Drive.
4. Verifica que el Sheet tenga todas las hojas y encabezados.

Si prefieres que Apps Script cree el Sheet por ti, ejecuta:

```text
createSpreadsheetForSystem
```

Esa funcion crea el archivo, guarda `SPREADSHEET_ID` y ejecuta `setupSystem()`.

## Crear administrador inicial

Despues de `setupSystem()`:

1. Selecciona `createSuperAdmin`.
2. Presiona `Run`.
3. Verifica que exista un registro en la hoja `USERS` con rol `super_admin`.

Tambien puedes ejecutarla desde el editor pasando parametros en una funcion temporal:

```js
function createMyAdmin() {
  createSuperAdmin('Tu nombre', 'tu-correo@example.com', 'una-contrasena-segura');
}
```

## Desplegar Apps Script como Web App

1. En Apps Script, presiona `Deploy`.
2. Selecciona `New deployment`.
3. Tipo: `Web app`.
4. `Execute as`: `Me`.
5. `Who has access`: `Anyone`.
6. Presiona `Deploy`.
7. Copia la `Web app URL`.

La API acepta acciones por JSON, por ejemplo:

```json
{
  "action": "login",
  "data": {
    "email": "tu-correo@example.com",
    "password": "una-contrasena-segura"
  }
}
```

Todas las respuestas usan:

```json
{
  "success": true,
  "data": {},
  "message": "Operacion realizada correctamente"
}
```

## Colocar API URL en GitHub Pages

Edita:

```text
assets/js/api.js
```

Cambia:

```js
const API_URL = 'URL_DEL_APPS_SCRIPT';
```

Por la URL del Web App:

```js
const API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

Luego publica el repositorio con GitHub Pages desde la rama principal y la raiz del proyecto.

## Probar Fase 1

1. Abre `login.html`.
2. Inicia sesion con el correo y contrasena del super admin.
3. Debe redirigir a `admin/index.html`.
4. Revisa la hoja `SESSIONS`: debe existir una sesion `active`.
5. Entra a `admin/configuracion.html`: debe validar la sesion con la accion `me`.
6. Presiona `Cerrar sesion`: la sesion debe pasar a `revoked`.

## Probar Fase 2

1. Abre `solicitud.html`.
2. Envia una solicitud de negocio.
3. Revisa la hoja `REQUESTS`: debe existir un registro `pending`.
4. Entra como super admin a `admin/solicitudes.html`.
5. Presiona `Aprobar`.
6. Debe aparecer una tarjeta con:

```text
codigo del negocio
correo del propietario
contrasena temporal
enlace de registro para clientes
```

7. Revisa las hojas:

```text
BUSINESSES
USERS
LOYALTY_PROGRAMS
REWARDS
ACTIVITY_LOG
```

8. Cierra sesion e inicia sesion con el correo del propietario y la contrasena temporal.
9. Debe redirigir a `business/index.html`.

Para rechazo:

1. Crea otra solicitud.
2. En `admin/solicitudes.html`, presiona `Rechazar`.
3. Escribe el motivo.
4. La solicitud debe quedar `rejected` en `REQUESTS`.

## Datos de prueba

Para Fase 1 basta con el super admin:

```text
role: super_admin
status: active
```

Los usuarios `business_owner` y `staff` se crearan automaticamente en fases posteriores cuando el administrador apruebe un negocio.

## Checklist de Fase 1

- [ ] Google Sheet creado o conectado con `SPREADSHEET_ID`.
- [ ] `setupSystem()` ejecutado sin errores.
- [ ] Hojas y encabezados creados.
- [ ] Carpeta Drive `LOYALTY_APP` creada con subcarpetas `logos` y `promotions`.
- [ ] `createSuperAdmin()` ejecutado.
- [ ] Web App desplegado.
- [ ] `API_URL` actualizado en `assets/js/api.js`.
- [ ] Login redirige al panel correcto.
- [ ] `me` valida token en paginas protegidas.
- [ ] Logout revoca la sesion.

## Checklist de Fase 2

- [ ] `solicitud.html` crea registros en `REQUESTS`.
- [ ] `admin/solicitudes.html` muestra solicitudes.
- [ ] Aprobar cambia `REQUESTS.status` a `approved`.
- [ ] Aprobar crea `BUSINESSES`.
- [ ] Aprobar crea `USERS` con rol `business_owner`.
- [ ] Aprobar crea `LOYALTY_PROGRAMS` y `REWARDS`.
- [ ] Aprobar registra actividad en `ACTIVITY_LOG`.
- [ ] El propietario puede iniciar sesion con la contrasena temporal.
- [ ] Rechazar cambia `REQUESTS.status` a `rejected`.
