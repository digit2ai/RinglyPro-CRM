# Administración

## ¿Qué es el área de administración?

El área de administración de Planea es un conjunto de herramientas internas accesibles únicamente para el equipo. No está visible en la navegación del usuario final y requiere credenciales con permisos especiales.

Actualmente, el área de administración se centra en la gestión de los mensajes de contacto recibidos a través del formulario público de Planea.

---

## Mensajes de contacto

### Listado de mensajes (`/admin/contact-request-messages`)

Vista principal del área de administración. Muestra todos los mensajes enviados por usuarios o visitantes a través del formulario de contacto.

**Funcionalidades:**
- **Paginación**: los mensajes se muestran en grupos de 10, con navegación entre páginas.
- **Filtro por estado**: permite ver solo los mensajes pendientes, leídos o archivados.
- **Búsqueda**: campo de texto libre para encontrar mensajes por nombre del remitente, correo electrónico o contenido del mensaje.

Cada fila del listado muestra el nombre, el correo, un extracto del mensaje, la fecha de recepción y el estado actual.

---

### Detalle de mensaje (`/admin/contact-request-messages/:id`)

Vista individual de un mensaje de contacto.

**Funcionalidades:**
- Muestra el contenido completo del mensaje.
- Permite cambiar el estado del mensaje entre las opciones disponibles: `pendiente`, `leído`, `archivado`.
- Los cambios de estado se guardan explícitamente con un botón de guardar.

---

## Estados de un mensaje

El ciclo de vida de un mensaje de contacto sigue este flujo:

```
pendiente → leído → archivado
```

| Estado | Significado |
|--------|-------------|
| **Pendiente** | Mensaje recibido, aún no revisado |
| **Leído** | El equipo ha revisado el mensaje |
| **Archivado** | El mensaje ha sido procesado y ya no requiere atención |

---

## Acceso y permisos

La aplicación cuenta con una infraestructura de roles y permisos que permite asignar accesos granulares a los miembros del equipo. Actualmente esta infraestructura está implementada a nivel de base de datos pero no está expuesta en la interfaz de administración: el acceso se gestiona directamente.

> **Nota**: Las rutas de administración están protegidas en el lado del servidor. Un usuario sin los permisos adecuados no puede ver ni interactuar con los datos administrativos aunque conozca la URL.
