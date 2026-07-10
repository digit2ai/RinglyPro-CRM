# Funcionalidades y Pantallas

Este documento describe cada pantalla de Planea, su propósito y lo que el usuario puede hacer en ella.

---

## Navegación general

La app distingue dos áreas:

- **Área pública**: accesible sin cuenta. Incluye el cuestionario de diagnóstico y las pantallas de autenticación.
- **Área privada**: requiere sesión activa. Incluye el dashboard, el progreso, el patrimonio y el perfil.

La navegación en el área privada se realiza mediante:
- **Barra inferior** (móvil y tablet): cuatro iconos — Mi Planea, Progreso, Patrimonio, Perfil.
- **Barra lateral** (escritorio): mismos cuatro destinos en una columna fija a la izquierda.

---

## Pantallas públicas

### Diagnóstico y puntaje (`/score`)

La pantalla principal de entrada a Planea. Cualquier persona puede acceder sin registrarse.

**Flujo:**
1. El usuario responde el cuestionario de 7–9 preguntas (ingresos, gastos, deudas, ahorros, estabilidad, objetivo).
2. La app calcula el Puntaje Planea en tiempo real.
3. Si el usuario no tiene cuenta, aparece una pantalla de captura de correo electrónico antes de mostrar los resultados completos.
4. Se muestran el puntaje, los cuatro pilares con su detalle y el mensaje de Maya.
5. Desde los resultados el usuario puede registrarse para guardar su puntaje y activar el plan mensual.

### Inicio de sesión (`/login`)

Formulario de correo y contraseña para acceder a una cuenta existente.

### Registro (`/register`)

Formulario de nombre, correo y contraseña para crear una cuenta nueva. Al registrarse, si el usuario ya había completado el cuestionario de forma anónima, su puntaje se transfiere automáticamente.

### Recuperar contraseña (`/reset-password`)

El usuario ingresa su correo y recibe un enlace para restablecer su contraseña.

### Nueva contraseña (`/new-password`)

Pantalla que se abre desde el enlace de recuperación de contraseña. Permite ingresar y confirmar la nueva contraseña.

---

## Pantallas privadas

### Mi Planea — Dashboard (`/home`)

La pantalla principal del área privada. Es el punto de control diario del usuario.

**Contiene:**
- **Anillo del puntaje**: visualización circular del puntaje actual (0–100) con la etiqueta correspondiente.
- **Cuatro barras de pilares**: muestra el puntaje de cada pilar (Fondo de Emergencia, Flujo de Caja, Salud de Deudas, Estabilidad). Al tocar un pilar se abre un modal con la explicación detallada de ese resultado.
- **Tarjeta de Maya**: el mensaje de recomendación personalizado de Maya para la situación actual del usuario.
- **Meta mensual activa**: el objetivo del mes con sus cuatro hitos semanales. Cada hito muestra su estado (pendiente, completado) y el usuario puede marcar el hito de la semana actual como done.

### Progreso (`/progress`)

Pantalla de análisis a profundidad de la evolución financiera.

**Contiene:**
- El mismo anillo de puntaje y barras de pilares del dashboard.
- **Gráfico de evolución**: línea de tiempo que muestra cómo ha variado el puntaje del usuario semana a semana o mes a mes. Permite ver la tendencia y el impacto de las acciones tomadas.
- **Metas de largo plazo**: sección donde el usuario gestiona sus objetivos financieros personales (viaje, vehículo, educación, etc.), con montos objetivo, ahorro actual y ahorro mensual.

### Patrimonio (`/patrimony`)

Calculadora de patrimonio neto personal.

**Contiene:**
- **Estado de vivienda**: el usuario indica si su vivienda es propia, en hipoteca o arrendada.
- **Activos**: lista de bienes con valor económico que el usuario registra (cuentas de ahorro, CDTs, fondos, vehículos, negocio, inversiones, etc.).
- **Pasivos**: lista de deudas y obligaciones financieras (tarjetas de crédito, préstamos, hipoteca, deudas informales, etc.).
- **Patrimonio neto**: resultado automático de restar el total de pasivos al total de activos.

### Perfil (`/profile`)

Pantalla de configuración de cuenta y datos personales.

**Contiene:**
- Avatar con iniciales del usuario.
- Nombre y correo electrónico editables.
- Acceso directo para actualizar el diagnóstico (calcular nuevo puntaje).
- Opciones de configuración: seguridad (cambiar contraseña), ayuda, política de privacidad, términos y condiciones.
- Botón de cerrar sesión.
- Opción de eliminar cuenta (con confirmación explícita del usuario).

### Cambiar contraseña (`/change-password`)

Formulario disponible para usuarios autenticados que desean cambiar su contraseña actual por una nueva, sin pasar por el flujo de recuperación por correo.

---

## Resumen de pantallas

| Pantalla | Ruta | Requiere cuenta |
|----------|------|-----------------|
| Diagnóstico y puntaje | `/score` | No |
| Inicio de sesión | `/login` | No |
| Registro | `/register` | No |
| Recuperar contraseña | `/reset-password` | No |
| Nueva contraseña | `/new-password` | No |
| Mi Planea (Dashboard) | `/home` | Sí |
| Progreso | `/progress` | Sí |
| Patrimonio | `/patrimony` | Sí |
| Perfil | `/profile` | Sí |
| Cambiar contraseña | `/change-password` | Sí |
