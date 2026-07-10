# Esquemas JSON de la Base de Datos

Varias columnas de la base de datos almacenan datos estructurados como JSON (`jsonb`). Este documento describe exactamente qué campos contiene cada uno y qué valores son válidos.

---

## `persons.score_data`

Contiene el resultado del último diagnóstico financiero del usuario.

```json
{
  "timestamp": "2026-05-31T12:00:00.000Z",
  "company":   null,
  "score":     72,
  "scenario":  "B",
  "source":    "survey",
  "pillars": {
    "emergency_fund": 65,
    "cash_flow":      80,
    "debt_health":    100,
    "stability":      55
  },
  "answers": {
    "P1": "C",
    "P2": "B",
    "P3": "none",
    "P4": "B",
    "P5": "B",
    "P6": "1",
    "P7": "save"
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | Fecha y hora en que se calculó el puntaje |
| `company` | string \| null | Empresa asociada al diagnóstico, si aplica (uso B2B futuro) |
| `score` | number \| null | Puntaje global de 0 a 100 |
| `scenario` | `"A"` \| `"B"` \| ... \| `"I"` \| null | Escenario de recomendación asignado por Maya |
| `source` | `"survey"` \| `"checkin"` | Origen del diagnóstico: cuestionario completo o actualización rápida |
| `pillars.emergency_fund` | number | Puntaje del pilar Fondo de Emergencia (0–100) |
| `pillars.cash_flow` | number | Puntaje del pilar Flujo de Caja (0–100) |
| `pillars.debt_health` | number | Puntaje del pilar Salud de Deudas (0–100) |
| `pillars.stability` | number | Puntaje del pilar Estabilidad (0–100) |
| `answers` | object | Respuestas originales del cuestionario (ver detalle abajo) |

### Respuestas del cuestionario (`answers`)

Cada clave corresponde a una pregunta del formulario. Los valores son códigos de rango o valores exactos:

| Clave | Pregunta | Valores posibles |
|-------|----------|-----------------|
| `P1` | Ingreso mensual | `"A"` (≈$1.2M) · `"B"` (≈$2.25M) · `"C"` (≈$4M) · `"D"` (≈$6.5M) · `"E"` (≈$9M) · `"X"` (exacto) |
| `P2` | Gastos mensuales (sin deudas) | Mismos rangos que P1 |
| `P3` | ¿Tiene deudas? | `"none"` · `"A"` · `"B"` · `"C"` · `"D"` · `"E"` · `"X"` |
| `P4` | Cobertura del fondo de emergencia | `"A"` (0.5 meses) · `"B"` (1.5) · `"C"` (3) · `"D"` (6) · `"E"` (12) · `"none"` |
| `P5` | Tipo de ingreso | `"fixed"` · `"variable"` |
| `P6` | Personas a cargo | `"0"` · `"1"` · `"2"` · `"3+"` |
| `P7` | Objetivo financiero principal | `"save"` · `"debt"` · `"stability"` |
| `P1_exact` | Ingreso exacto (solo si P1 = `"X"`) | string numérico en COP |
| `P2_exact` | Gasto exacto (solo si P2 = `"X"`) | string numérico en COP |
| `P3_exact` | Cuota de deuda exacta (solo si P3 = `"X"`) | string numérico en COP |
| `P5_rate` | Tasa de interés de la deuda | `"lt10"` · `"10to20"` · `"20to30"` · `"gt30"` |

---

## `persons.progress_data`

Contiene la meta mensual activa del usuario. Se almacena el objeto completo `UserGoal`.

```json
{
  "pillar":        "emergency_fund",
  "initial_value": 45,
  "goal_text":     "Construye tu fondo de emergencia para 1 mes de gastos",
  "created_at":    "2026-05-01T00:00:00.000Z",
  "completed_at":  null,
  "next_goal_at":  null,
  "milestones": [
    {
      "index":        1,
      "points":       55,
      "start_date":   "2026-05-01",
      "end_date":     "2026-05-07",
      "completed":    true,
      "completed_at": "2026-05-06T18:30:00.000Z"
    },
    {
      "index":        2,
      "points":       62,
      "start_date":   "2026-05-08",
      "end_date":     "2026-05-14",
      "completed":    false,
      "completed_at": null
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `pillar` | `"emergency_fund"` \| `"cash_flow"` \| `"debt_health"` \| `"stability"` | Pilar objetivo de la meta |
| `initial_value` | number | Puntaje del pilar al momento de crear la meta |
| `goal_text` | string | Descripción en texto de la meta del mes |
| `created_at` | string (ISO 8601) | Fecha de creación de la meta |
| `completed_at` | string \| null | Fecha en que se completaron todos los hitos; null si aún activa |
| `next_goal_at` | string \| null | Fecha mínima para crear la siguiente meta (24h después de completar) |
| `milestones` | array | Lista de los 4 hitos semanales (ver detalle abajo) |

### Hitos (`milestones[]`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `index` | number | Número de hito: 1, 2, 3 o 4 |
| `points` | number | Puntaje del pilar esperado al completar este hito |
| `start_date` | string (YYYY-MM-DD) | Inicio de la semana del hito |
| `end_date` | string (YYYY-MM-DD) | Fin de la semana del hito |
| `completed` | boolean | Si el usuario marcó este hito como completado |
| `completed_at` | string \| null | Fecha y hora en que se marcó como completado |

---

## `persons.patrimony_data`

Almacena el estado de vivienda del usuario.

```json
{
  "housing_status": "mortgage"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `housing_status` | `"owned"` \| `"mortgage"` \| `"rented"` \| null | Situación de vivienda del usuario |

---

## `persons_patrimony.assets_data` y `persons_patrimony.liabilities_data`

Ambos campos son **arrays** donde cada elemento representa un activo o pasivo registrado por el usuario.

```json
[
  {
    "id":         1,
    "person_id":  42,
    "name":       "Apartamento Bogotá",
    "type":       "housing",
    "value":      320000000,
    "created_at": "2026-05-15T10:00:00.000Z"
  },
  {
    "id":         2,
    "person_id":  42,
    "name":       "Cuenta de ahorros Bancolombia",
    "type":       "savings_account",
    "value":      8500000,
    "created_at": "2026-05-15T10:05:00.000Z"
  }
]
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | Identificador único del ítem |
| `person_id` | number | ID de la persona propietaria |
| `name` | string | Nombre descriptivo del activo o pasivo |
| `type` | string | Categoría (ver tablas abajo) |
| `value` | number | Valor en pesos colombianos (COP) |
| `created_at` | string (ISO 8601) | Fecha de registro |

### Tipos de activos (`assets_data[].type`)

| Valor | Descripción |
|-------|-------------|
| `housing` | Vivienda propia |
| `savings_account` | Cuenta de ahorros |
| `term_deposit` | CDT / depósito a término |
| `severance_fund` | Cesantías |
| `pension_fund` | Fondo de pensiones |
| `vehicle` | Vehículo |
| `business` | Negocio propio |
| `investments` | Inversiones (acciones, fondos, cripto) |
| `other` | Otro activo |

### Tipos de pasivos (`liabilities_data[].type`)

| Valor | Descripción |
|-------|-------------|
| `credit_card` | Tarjeta de crédito |
| `consumer_loan` | Crédito de consumo / libranza |
| `vehicle_loan` | Crédito de vehículo |
| `mortgage` | Crédito hipotecario |
| `informal_debt` | Deuda informal |
| `other` | Otro pasivo |

---

## `persons_score_history.score_data` y `persons_goals_history.goal_data`

Estos campos almacenan **snapshots inmutables** con el mismo formato que `persons.score_data` y `persons.progress_data` respectivamente, en el momento en que se archivaron. Su estructura es idéntica a las descritas arriba.
