# Autenticación y Gestión de Cuenta

## Principios generales

Planea permite explorar el diagnóstico financiero sin necesidad de crear una cuenta, pero para guardar el puntaje, acceder al plan mensual y hacer seguimiento del progreso es necesario registrarse. La autenticación se gestiona de forma segura y soporta los flujos más comunes: registro, inicio de sesión, recuperación de contraseña y eliminación de cuenta.

---

## Registro

El usuario crea su cuenta con tres datos:

- **Nombre completo**
- **Correo electrónico**
- **Contraseña**

Tras registrarse, se envía un correo de confirmación al email indicado. El usuario debe verificar su correo antes de poder iniciar sesión por primera vez.

### Transferencia del puntaje pre-registro

Si el usuario completó el cuestionario de diagnóstico de forma anónima antes de registrarse, el puntaje calculado en esa sesión se transfiere automáticamente a su cuenta nueva. No pierde su resultado por haberse registrado después.

---

## Inicio de sesión

El acceso se realiza con correo electrónico y contraseña. Si las credenciales son correctas, el usuario entra directamente al dashboard.

Si llega desde el registro (donde se le pidió confirmar el correo), se muestra un mensaje informativo recordándole el paso pendiente.

---

## Recuperación de contraseña

Si el usuario olvidó su contraseña:

1. Ingresa su correo en la pantalla de recuperación.
2. Recibe un correo con un enlace seguro de un solo uso.
3. Al hacer clic en el enlace, accede a la pantalla de nueva contraseña.
4. Ingresa y confirma su nueva contraseña.

Este flujo funciona tanto en el navegador web como en la app Android: los enlaces mágicos del correo abren la app directamente cuando está instalada.

---

## Cambio de contraseña (usuario autenticado)

Un usuario con sesión activa puede cambiar su contraseña desde la sección de **Perfil → Seguridad** sin necesidad de pasar por el flujo de recuperación por correo.

---

## Cierre de sesión

Disponible desde el menú del perfil o desde el encabezado de la app. Al cerrar sesión, el usuario regresa a la pantalla pública del diagnóstico.

---

## Eliminación de cuenta

El usuario puede eliminar su cuenta desde la pantalla de Perfil. Por seguridad, se le pide que escriba una frase de confirmación antes de proceder. La eliminación es un **soft delete**: no borra los datos, sino que desvincula el correo electrónico de la cuenta. El registro queda inaccesible para el usuario (no puede volver a iniciar sesión con ese correo) pero los datos permanecen en el sistema asociados al identificador interno de la cuenta.

---

## Sesiones y seguridad

- Las sesiones se mantienen activas de forma segura entre aperturas de la app.
- Los tokens de sesión se renuevan automáticamente.
- Los enlaces de recuperación de contraseña y confirmación de correo son de un solo uso y tienen expiración.
- Ninguna contraseña se almacena en texto plano.

---

## Flujo del ciclo de vida de una cuenta

```
Diagnóstico anónimo
        ↓
   Captura de correo (resultados)
        ↓
   Registro (nombre + email + contraseña)
        ↓
   Confirmación de correo
        ↓
   Inicio de sesión
        ↓
   Uso normal de la app
        ↓
   (opcional) Cambio de contraseña
        ↓
   (opcional) Eliminación de cuenta
```
