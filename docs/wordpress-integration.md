# WordPress como proveedor de identidad — contrato de integracion

Documento para el socio (el equipo que opera el WordPress de la camara) y para
quien mantenga el lado plataforma. Si se cambia un nombre de cabecera, un claim
o un codigo de estado, hay que actualizar este fichero **en el mismo commit** o
el lado WordPress deja de funcionar.

Primer tenant: `cv-105` (HISPANOTEC).

## Que resuelve

WordPress es el sistema de registro de las cuentas. Los miembros inician sesion
en el WordPress de la camara y entran a su instancia de CamaraVirtual ya
autenticados. La plataforma no guarda contrasenas ni crea una segunda cuenta.

Es multi-tenant desde el primer dia: cada camara tiene su secreto, su mapa de
roles y su fila de configuracion. Dar de alta otra camara no requiere cambios de
codigo ni un redespliegue.

## Los dos canales

### Canal A — handoff SSO (esto hace el login)

```
GET https://www.camaravirtual.app/:tenantSlug/auth/wp?token=<JWT>&redirect=/cv-105/directorio
```

1. El usuario se autentica en `wp-login.php`. WordPress es el duenio de ese paso.
2. Pulsa "Entrar a la Camara Virtual".
3. WordPress firma un JWT HS256 con el secreto compartido del tenant,
   `exp = iat + 120`, `jti` de un solo uso, `aud` = slug del tenant.
4. La plataforma verifica firma, algoritmo, caducidad, `aud`, `iss`, que el
   `jti` no se haya usado, y que `exp - iat` no supere la politica del tenant.
5. Crea o actualiza el miembro por `(chamber_id, wp_user_id)`, mapea los roles y
   emite su propia sesion.

### Canal B — webhook de aprovisionamiento

```
POST https://www.camaravirtual.app/api/v1/webhooks/wordpress/users
```

**No es opcional.** Sin el, un usuario dado de baja en WordPress conserva su
sesion hasta que caduque, y un cambio de rol solo se aplica en el siguiente
acceso.

Cabeceras:

| Cabecera | Contenido |
|---|---|
| `X-CV-Tenant` | slug del tenant, por ejemplo `cv-105` |
| `X-CV-Event` | `user.created`, `user.updated`, `user.role_changed`, `user.deleted` |
| `X-CV-Delivery` | identificador unico del envio; se reutiliza en los reintentos |
| `X-CV-Timestamp` | epoch en segundos |
| `X-CV-Signature` | `sha256=<hex>` — HMAC-SHA256 sobre `${timestamp}.${cuerpoCrudo}` |

La firma se calcula sobre el **cuerpo sin modificar**. Cualquier reserializacion
—un espacio, otro orden de claves— invalida la firma.

Respuestas: `200` aceptado · `401` firma incorrecta · `403` webhook desactivado ·
`404` tenant desconocido · `409` entrega duplicada · `422` payload invalido ·
`5xx` reintentable.

WordPress reintenta 3 veces con 30s / 5min / 30min reutilizando el mismo
`X-CV-Delivery`. La idempotencia la garantiza un indice unico
`(chamber_id, delivery_id)`.

## Claims del JWT

```json
{
  "iss": "https://hispanotec.org/",
  "aud": "cv-105",
  "sub": "4821",
  "jti": "uuid-v4",
  "iat": 1756512000,
  "exp": 1756512120,
  "email": "jperez@empresa.com",
  "email_verified": true,
  "name": "Juan Perez",
  "roles": ["cv_empresario"],
  "locale": "es_ES",
  "wp_user_login": "jperez",
  "company": { "wp_post_id": 1187, "name": "Comercial Perez S.L.", "nif": "B12345678" },
  "chamber_id": "hispanotec",
  "avatar_url": "https://..."
}
```

`sub` es el identificador de usuario de WordPress **en forma de cadena** y es la
clave de union permanente. Nunca se transmiten contrasenas ni hashes.

`jti` es obligatorio: sin el no hay forma de impedir la reutilizacion, y la
plataforma rechaza el token.

## Payload del webhook

```json
{
  "event": "user.updated",
  "occurred_at": "2026-08-30T14:12:03Z",
  "user": {
    "wp_user_id": 4821,
    "email": "jperez@empresa.com",
    "user_login": "jperez",
    "display_name": "Juan Perez",
    "first_name": "Juan",
    "last_name": "Perez",
    "roles": ["cv_empresario"],
    "status": "active",
    "locale": "es_ES",
    "phone": "+34600111222",
    "company": { "wp_post_id": 1187, "name": "Comercial Perez S.L.", "nif": "B12345678" },
    "chamber_id": "hispanotec",
    "meta": {}
  }
}
```

## Mapa de roles

Por tenant, editable desde la interfaz de administracion sin desplegar.

| WordPress | Plataforma | Acceso |
|---|---|---|
| `administrator` | `chamber_admin` | administracion completa del tenant |
| `editor` | `chamber_staff` | directorio y contenidos |
| `cv_empresario` | `empresario` | ficha propia, directorio, agente de IA |
| `subscriber` | `member` | solo lectura |
| sin mapear | `member` | solo lectura |

Si el usuario llega con varios roles, **gana el mayor privilegio**. Un rol sin
mapear nunca escala: cae a `default_role` y se reporta en la respuesta para que
alguien lo anada al mapa.

## Reglas que la plataforma aplica y no negocia

1. Lista blanca de algoritmos explicita. `alg: none` y la confusion RS256 con el
   secreto como clave se rechazan.
2. Un token con `exp - iat` mayor que `max_token_ttl_sec` se rechaza **aunque la
   firma sea correcta**. La firma dice quien emitio, no cuanto vale.
3. `jti` de un solo uso, garantizado por clave primaria en base de datos. No es
   una cache en memoria: la plataforma corre en varias instancias.
4. Comparacion de HMAC en tiempo constante, con comprobacion de longitud previa.
5. Ventana de desfase del webhook: 300 segundos.
6. `redirect` debe ser una ruta relativa que empiece por `/`, no por `//`, y
   estar en la lista del tenant. Cualquier otra cosa cae al inicio de la camara.
7. Cookie de sesion `httpOnly`, `secure`, `sameSite=lax`, con el TTL del tenant.
8. Limite de intentos por IP y por `sub`.
9. Toda consulta filtra por `chamber_id`. Un usuario de cv-105 no es resoluble
   desde una peticion de cv-106.
10. Nunca se registra en el log el token, el secreto ni el cuerpo del webhook.
11. **El estado del usuario es autoridad del webhook.** El SSO no lo modifica:
    entrar no reactiva a nadie. Una baja en WordPress bloquea el acceso hasta
    que llegue un `user.updated` con `status: "active"`.

## Rotacion del secreto

Al generar un secreto nuevo, el anterior se conserva cifrado. La verificacion
prueba el actual y despues el anterior, de modo que los tokens ya emitidos
siguen validando mientras se despliega la clave nueva. Un endpoint de limpieza
borra el anterior cuando el socio confirma. **Sin esta ventana, rotar es una
caida.**

El secreto en claro se muestra **una sola vez**, en el momento de generarlo.
Despues solo se ve una huella de 12 caracteres, suficiente para comprobar que
los dos lados tienen el mismo y no para reconstruirlo.

## Lo que no existe, y por que

**Login con relevo de contrasena**: evaluado y descartado. Rompe el 2FA, esquiva
el endurecimiento de `wp-login.php` y mete credenciales en claro en la memoria
de la plataforma. La columna `direct_login_enabled` existe en `FALSE` para dejar
la decision escrita, no para implementarla.

**OpenID Connect**: todavia no. La columna `provider` esta ahi para que un
segundo proveedor no obligue a rehacer el esquema.

## Diferencias respecto al brief original

El brief describia `ALTER TABLE users` y un indice sobre `(tenant_id, wp_user_id)`.
En esta base de datos eso habria fallado y habria acertado en la tabla
equivocada: `users` son las cuentas del CRM RinglyPro, sin `tenant_id` ni
`chamber_id`; el usuario de camara es `members`, con `chamber_id`. Traduccion
aplicada: `tenant_id` -> `chamber_id`, `users` -> `members`. El contrato con el
socio —cabeceras, claims, codigos de estado— queda intacto.
