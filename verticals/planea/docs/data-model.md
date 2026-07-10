# Modelo de Datos

Este documento describe las entidades principales que maneja Planea y cómo se relacionan entre sí. El enfoque es conceptual: se explica qué representa cada entidad y qué información contiene, sin entrar en detalles de implementación técnica.

---

## Entidades principales

### Persona (`Person`)

Es la entidad central de la aplicación. Cada usuario registrado tiene exactamente un perfil de Persona, que se crea automáticamente al registrarse.

**Información que almacena:**
- Nombre completo
- Número de teléfono (opcional)
- **Puntaje actual**: el resultado del último diagnóstico financiero (puntaje total, puntaje por pilares, respuestas del cuestionario, fecha, escenario asignado)
- **Meta activa**: el objetivo mensual en curso con sus cuatro hitos semanales
- **Estado de vivienda**: si la vivienda es propia, en hipoteca o arrendada

La Persona está vinculada a la cuenta de autenticación del usuario mediante su identificador único.

---

### Historial de Puntajes (`Score History`)

Registro inmutable de todos los diagnósticos que el usuario ha realizado a lo largo del tiempo. Cada vez que se calcula un nuevo puntaje, el resultado anterior queda archivado aquí.

**Información que almacena por entrada:**
- Fecha y hora del diagnóstico
- Todos los datos del puntaje (mismo formato que el puntaje actual en la Persona)

Este historial es la base para el gráfico de evolución en la pantalla de Progreso.

---

### Historial de Metas (`Goals History`)

Registro de todas las metas mensuales que el usuario ha completado o que han vencido. Permite ver el recorrido histórico de objetivos.

**Información que almacena por entrada:**
- Fecha de registro
- Datos completos de la meta (texto del objetivo, hitos, estado de completitud)

---

### Patrimonio (`Patrimony`)

Cada usuario tiene exactamente un registro de patrimonio que contiene dos listas:

**Activos**: lista de bienes del usuario. Cada activo tiene:
- Nombre descriptivo
- Categoría (vivienda, ahorros, CDT, pensión, vehículo, negocio, inversiones, otro)
- Valor en pesos colombianos

**Pasivos**: lista de deudas del usuario. Cada pasivo tiene:
- Nombre descriptivo
- Categoría (tarjeta de crédito, crédito de consumo, crédito de vehículo, hipoteca, deuda informal, otro)
- Valor en pesos colombianos

---

### Metas de Largo Plazo (`Long-Term Goals`)

Objetivos financieros personales definidos libremente por el usuario. Son independientes de las metas mensuales generadas automáticamente.

**Información que almacena:**
- Nombre del objetivo
- Tipo (viaje, vivienda, vehículo, educación, otro)
- Monto objetivo (cuánto necesita en total)
- Ahorro acumulado actual (con cuánto ya cuenta)
- Ahorro mensual planificado (cuánto aporta cada mes)

---

### Mensajes de Contacto (`Contact Request Messages`)

Mensajes enviados a través del formulario de contacto público de Planea. Son gestionados internamente por el equipo.

**Información que almacena:**
- Nombre del remitente
- Correo electrónico
- Contenido del mensaje
- Estado: `pendiente` → `leído` → `archivado`
- Fecha de recepción

---

## Relaciones entre entidades

```
Usuario (auth)
    │
    └── Persona (1:1)
            ├── Historial de Puntajes (1:N)
            ├── Historial de Metas (1:N)
            ├── Patrimonio (1:1)
            │       ├── Activos []
            │       └── Pasivos []
            └── Metas de Largo Plazo (1:N)

(independiente)
    └── Mensajes de Contacto
```

---

## Persistencia y privacidad

- Todos los datos de usuario están asociados a su cuenta y son **privados**: ningún usuario puede ver los datos de otro.
- El historial de puntajes y metas es **inmutable**: los registros pasados no se modifican ni eliminan, salvo al eliminar la cuenta completa.
- Al eliminar la cuenta, se desvincula el correo electrónico del usuario (soft delete). Los datos permanecen en el sistema pero la cuenta queda inaccesible para el usuario.

Para ver la estructura interna de cada campo JSON, consulta [Esquemas JSON](./json-schemas.md).
