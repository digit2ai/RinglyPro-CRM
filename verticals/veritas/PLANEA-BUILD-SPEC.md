# PLANEA — Build Spec (Requirements Intake)

> **Estado:** FASE 1 — RECOLECTANDO INFORMACIÓN. No construir hasta que el usuario diga "build".
> **Objetivo:** Replicar / desplegar la app **PLANEA** en `https://aiagent.ringlypro.com/planea`.
> **Mantenido por:** RinglyPro AI Architect (MCP Brain). Cada dato nuevo que alimente el usuario se agrega/actualiza aquí.
> **Fecha inicio intake:** 2026-07-10

---

## 0. Cómo se usa este documento
- El usuario alimenta información en cualquier orden.
- El Architect la guarda **inmediatamente** en la sección correspondiente (o crea una nueva).
- Nada se construye en esta fase. Solo se captura.
- Cuando el usuario diga que terminó, este spec se convierte en el **PROMPT DE BUILD** (Fase 2).
- El build solo arranca con la orden explícita **"build"** (Fase 3).

---

## 1. Qué es PLANEA (definición / propósito)
**Copiloto financiero personal para Colombia.** Tagline: "Entiende tu dinero. Planea tu futuro."
Muestra al usuario cómo está hoy financieramente y qué puede hacer para mejorar. Diagnóstico
gratuito en ~60 segundos. Keywords: finanzas personales, copiloto financiero, IA, ahorro,
deudas, Colombia, diagnóstico gratis.

**FUENTE:** app real existente copiada del Desktop del usuario (`~/Desktop/Planea-main`),
ya desplegada previamente en Vercel. Copiada al repo el 2026-07-10 en:
`/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/verticals/planea/`

**Stack técnico (confirmado del código fuente):**
- Frontend: **Ionic React 8 + React 19 + Vite 5 + TypeScript**
- Estilos: **Tailwind CSS 4** (via `@tailwindcss/vite`)
- Estado: **Zustand**; formularios: **react-hook-form + zod**; i18n: **i18next / react-i18next**
- Gráficos: **d3**; animación: **motion**; routing: **react-router 5 / @ionic/react-router**
- Móvil: **Capacitor 8** (app/haptics/keyboard/status-bar) — build web + móvil
- Backend: **Supabase** (`@supabase/supabase-js`) con **edge functions** + **migrations** + `config.toml`
- Tests: **Cypress** (e2e) + **Vitest** (unit)
- Deploy previo: **Vercel** (`vercel.json` → SPA rewrite de `/(.*)` a `/index.html`, outputDir `dist`)
- Gestor de paquetes: **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml`)
- `<base href="/" />` — OJO: para servir bajo sub-ruta `/planea` habrá que ajustar base path en build (Fase 3).

**Contenido extra incluido en la carpeta (docs de negocio):**
- `Planea Company Strategy.docx`, `Planea Logica Recomendaciones.docx`, `Planea Politica Privacidad.docx`
- `PLANEA_todo_list_by_priority.pdf`, carpeta `BRD/` (business requirements), `docs/`, `email/`, `user id/`

## 2. Público objetivo / usuarios
**Target primario:** empleados colombianos urbanos de **25 a 38 años**, ingresos **$1.5M–$8M COP/mes**.
Sienten que "el dinero no les rinde" pero quieren organizarse; tienen acceso a tecnología pero no han
encontrado una herramienta que conecte con su realidad. Personas que: (a) quieren entender su situación
financiera real pero no saben por dónde empezar; (b) sienten que sus ingresos no alcanzan pero no
identifican el problema; (c) quieren reducir deudas o construir fondo de emergencia; (d) buscan guía
clara en español colombiano sin jerga.

**Canal de distribución: B2B2C** — Planea llega al usuario a través de la **empresa donde trabaja**.
La empresa paga el acceso, el empleado lo recibe gratis. Ventajas: adquisición a costo casi cero,
credibilidad inmediata, escala rápida (una empresa de 500 empleados = 500 usuarios). Piloto: empresas
en Cali con 300–500 empleados. B2B Premium ($10.000 COP/empleado/mes) es modelo de Año 2.

## 3. Idioma(s)
**Español colombiano** como idioma principal y único en la práctica — `<html lang="es">`. Todo el
contenido, mensajes de Maya y etiquetas están en español colombiano. Tiene i18next configurado (permite
multi-idioma futuro, pero v1 es solo-ES). Sin emojis en deliverables Digit2AI; ortografía española correcta.

## 4. Funcionalidades / módulos (qué debe hacer)
**Los 3 problemas que resuelve:** (1) no saber qué tan sana está la situación financiera propia;
(2) no entender cuál es el punto más débil y por dónde empezar; (3) no tener una siguiente acción clara,
concreta y personalizada.

**Módulos núcleo (v1 / MVP — YA construido en la app copiada):**
1. **Diagnóstico / Planea Score (`/score`)** — cuestionario de 7–9 preguntas → puntaje 0–100 en tiempo real.
   Público, sin cuenta. Captura de email antes de mostrar resultados completos.
2. **Planea Score — 4 pilares ponderados:**
   - Fondo de Emergencia **35%** (¿cuántos meses sobrevives sin ingresos?)
   - Flujo de Caja **25%** (¿te queda dinero al final del mes?)
   - Salud de Deudas **25%** (¿cuánto del ingreso se va en cuotas? DTI)
   - Estabilidad **15%** (ingreso fijo/variable + personas a cargo)
   - Metodología CFP adaptada a Colombia. Suma ponderada, no promedio.
   - **5 rangos/etiquetas:** Punto de partida (0–30) · Construyendo (31–50) · En camino (51–70) · Sólido (71–85) · Planeado (86–100)
3. **Maya — consejera financiera** (ícono guacamayo 🦜). Motor de recomendaciones **determinístico**
   (NO chatbot/IA en v1): mapea al usuario a 1 de **9 escenarios** y entrega mensaje + meta + timeline.
   Aparece en 3 momentos: durante el cuestionario, en resultados, y como tarjeta permanente en `/home`.
   "Martes de Maya": insight semanal los martes 7PM (v1.5 push). Lógica completa en §16.
4. **Dashboard "Mi Planea" (`/home`)** — anillo del puntaje + 4 barras de pilares (modal por pilar) +
   tarjeta de Maya + meta mensual activa con 4 hitos semanales marcables.
5. **Sistema de Metas (`/progress` + `/home`)** — meta mensual autogenerada sobre el pilar más débil,
   dividida en 4 hitos semanales con fechas; solo 1 meta activa; al completar, 24h de celebración y
   luego nueva meta. Historial inmutable. + **Metas de largo plazo** libres (viaje/vehículo/vivienda/
   estudios/otro) con monto objetivo, ahorro actual, ahorro mensual → cálculo de tiempo a la meta.
6. **Gráfico de evolución** (`/progress`) — línea de tiempo del puntaje semana a semana / mes a mes.
7. **Patrimonio (`/patrimony`)** — patrimonio neto = activos − pasivos. Estado de vivienda
   (propia/hipoteca/arrendada) + activos (9 tipos) + pasivos (6 tipos), en COP. Complementa el score
   (score mide flujo; patrimonio mide stock).
8. **Perfil (`/profile`)** — avatar iniciales, nombre/email editables, re-diagnóstico, seguridad,
   ayuda, privacidad, T&C, cerrar sesión, eliminar cuenta (soft delete con frase de confirmación).
9. **Admin interno (`/admin/contact-request-messages`)** — gestión de mensajes de contacto
   (pendiente → leído → archivado), paginación, filtro, búsqueda. Protegido server-side por rol.

**Roadmap (contexto, NO en v1):** v1.5 (jun–ago 2026): integración bancaria (Bancolombia/Nequi/Finerio),
check-in quincenal automático, push del Martes de Maya, subida de extractos PDF, simulador de metas,
onboarding corporativo por link, pantalla Premium con pago. v2 (sep–dic 2026): Maya conversacional con
IA, marketplace de afiliados, educación financiera, comparador de productos. v3 (2027, pivot): broker
propio (CDTs, fondos, seguros) — requiere licencias Superfinanciera.

## 5. Flujo de usuario (paso a paso)
Ciclo de vida: **Diagnóstico anónimo → captura de email (en resultados) → registro (nombre+email+
contraseña) → confirmación de correo → login → uso normal → (opc) cambio de contraseña → (opc)
eliminación de cuenta.** Si completó el cuestionario anónimo antes de registrarse, **el puntaje se
transfiere automáticamente** a la cuenta nueva.

**Navegación privada:** barra inferior (móvil/tablet) + barra lateral (desktop), 4 destinos:
**Mi Planea · Progreso · Patrimonio · Perfil**.

**Rutas (confirmadas en docs):**
| Pantalla | Ruta | Cuenta |
|---|---|---|
| Diagnóstico y puntaje | `/score` | No |
| Login | `/login` | No |
| Registro | `/register` | No |
| Recuperar contraseña | `/reset-password` | No |
| Nueva contraseña | `/new-password` | No |
| Mi Planea (Dashboard) | `/home` | Sí |
| Progreso | `/progress` | Sí |
| Patrimonio | `/patrimony` | Sí |
| Perfil | `/profile` | Sí |
| Cambiar contraseña | `/change-password` | Sí |
| Admin mensajes | `/admin/contact-request-messages[/:id]` | Rol admin |

## 6. UI / diseño / marca
Marca **Planea** (NO Digit2AI de cara al usuario). Lema: "Claridad financiera a tu alcance." /
"Planea ve tus finanzas. Solo tú mueves tu dinero." Empresa: **Planea Financiera S.A.S.**, Cali,
Colombia, dominio **planea.co**, contacto **hola@planea.co**. Diseño mobile-first (PWA instalable +
Android nativo vía Capacitor). Estética inspirada en **Copilot Money** (calidad de diseño, sensación de
"app que te conoce"). Anillo de puntaje circular como elemento visual central. Tailwind 4. Sin emojis en
lo que produzca Digit2AI, pero OJO: el producto original usa el guacamayo 🦜 como ícono de Maya — decisión
de marca del cliente, respetar el diseño existente de la app copiada.

## 7. Datos / base de datos (tablas, campos, multi-tenant)
Backend actual: **Supabase (PostgreSQL)** con Row Level Security (cada usuario ve solo lo suyo).
Migraciones en `verticals/planea/supabase/migrations/`. Entidades:
- **`persons`** (1:1 con usuario auth) — nombre, teléfono, `score_data` (jsonb), `progress_data`
  (jsonb, meta activa), `patrimony_data` (jsonb, housing_status).
- **`persons_score_history`** (1:N) — snapshots inmutables `score_data` con `source: survey|checkin`.
- **`persons_goals_history`** (1:N) — snapshots inmutables de metas.
- **`persons_patrimony`** (1:1) — `assets_data[]` + `liabilities_data[]` (jsonb arrays).
- **Long-term goals** (1:N) — nombre, tipo, monto objetivo, ahorro actual, ahorro mensual.
- **Contact request messages** (independiente) — nombre, email, mensaje, estado, fecha.
- Infra de **roles y permisos** a nivel DB (aún no expuesta en UI).

Esquemas JSON exactos (score_data, progress_data, milestones, assets/liabilities types, códigos de
respuestas P1–P7) documentados en `verticals/planea/docs/json-schemas.md` — replicar campo por campo.

**DECISIÓN ABIERTA (Fase 3):** ¿el build en `/planea` mantiene Supabase cloud, o se migra al Postgres
del CRM con patrón `tenant_id`? Ver §15. La regla multi-tenant del ecosistema RinglyPro aplicaría si se
migra; Supabase ya aísla por usuario vía RLS.

## 8. API / endpoints
Actualmente NO hay API Express propia: la app habla directo con Supabase (auth + DB + storage) vía
`@supabase/supabase-js` + Supabase Edge Functions (`verticals/planea/supabase/functions/`). El cálculo
del score y la lógica de Maya viven en el frontend/edge. Si el build se integra al CRM, habría que decidir
si se exponen endpoints REST propios (`/planea/api/v1/*`) o se conserva el modelo Supabase directo.

## 9. Integraciones (voz, LLM, TTS, webhooks, terceros)
- **Supabase** — auth, PostgreSQL, storage, edge functions (núcleo actual).
- **Vercel** — hosting previo (deploy auto desde GitHub, SPA rewrites).
- **Capacitor** — empaquetado Android nativo + PWA.
- **Email transaccional** — plantillas en `verticals/planea/email/` (confirm-sign-up, reset-password,
  magic-link, change-email, invite-user, reauthentication). Actualmente vía Supabase Auth.
- **WhatsApp** (Martes de Maya / notificaciones) — declarado en política de privacidad; v1.5.
- **Futuras (v2):** integración bancaria (Bancolombia/Nequi API, Finerio), afiliados (Nubank CO, Lulo
  Bank, Addi, Sura, Fincomercio, Bancolombia), IA conversacional para Maya.
- **Digit2AI value-add potencial (no en la app original):** Maya conversacional podría montarse con el
  patrón de voz/LLM del ecosistema — a discutir en Fase 2.

## 10. Autenticación / roles / seguridad
Supabase Auth: registro (nombre+email+contraseña) con confirmación de correo obligatoria; login
email/contraseña; recuperación por enlace mágico de un solo uso; cambio de contraseña autenticado;
soft-delete de cuenta (desvincula email, conserva datos por id interno). Sesiones persistentes con
refresh automático de tokens. Contraseñas nunca en texto plano. RLS por usuario. Rutas admin protegidas
server-side por rol. Enlaces mágicos abren la app Android si está instalada (deep links).

## 11. Variables de entorno
Actuales (frontend Vite → prefijo `VITE_`): credenciales de Supabase (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` — confirmar nombres exactos en `src/configurations/`). Supabase edge functions
tienen sus propios secrets. **PENDIENTE (Fase 3):** enumerar env vars reales leyendo
`verticals/planea/src/configurations/` + `supabase/config.toml`, y decidir cómo se inyectan en Render
si se despliega bajo el CRM.

## 12. Ruta de montaje / arquitectura
Objetivo: servir la app en **`https://aiagent.ringlypro.com/planea`**.
- La app es un **SPA Ionic React** que compila con Vite a `dist/` estático (+ SPA fallback a index.html).
- **NO es servible tal cual** (a diferencia de roundshare) — requiere `pnpm install` + `pnpm build`.
- Hay que ajustar el **base path** de `/` a `/planea` (Vite `base` + `<base href>` + rutas del router +
  `vercel.json` rewrites → equivalente en Express) para que funcione bajo subruta.
- Opciones de montaje a decidir en Fase 3: (a) build estático servido por Express bajo `/planea`
  con fallback SPA; (b) patrón client-builds; (c) mantener Vercel y solo enlazar. Ver §15.

## 13. Fuera de alcance (lo que PLANEA NO hace / v1)
- NO conecta cuentas bancarias, NO pide contraseñas de bancos, NO ve saldos exactos, NO mueve dinero
  ("Planea ve tus finanzas. Solo tú mueves tu dinero.").
- Maya v1 **NO es conversacional** ni IA en tiempo real: 9 escenarios fijos, mismo mensaje base por escenario.
- NO hay integración bancaria en v1 (survey + entrada manual + extractos PDF la reemplazan).
- El empleador **NUNCA** ve datos financieros individuales (solo agregados anónimos).
- NO para menores de 18 años. NO vende publicidad ni comparte datos con fines comerciales.

## 14. Criterios de éxito / verificación
Métricas MVP del negocio: onboarding completion > 60%, retención día 7 > 30%, NPS > 30, adopción de
productos recomendados > 5%, conversión Premium > 8% de activos, **bugs críticos en producción = 0**
("no se lanza hasta que sea 0"). Verificación técnica del build (Fase 3): `pnpm build` limpio, la app
carga en `/planea`, el flujo diagnóstico→score→registro→dashboard funciona, Supabase responde, health
check verde.

## 15. Notas sueltas / decisiones abiertas
1. **Backend: Supabase cloud vs. Postgres del CRM.** La app trae su propio Supabase (auth+DB+RLS+edge
   functions). Decidir en Fase 3 si se conserva (más rápido, menos cambios) o se migra al ecosistema
   RinglyPro (multi-tenant `tenant_id`, un solo Postgres). Recomendación preliminar: **conservar Supabase**
   para el primer deploy y no romper nada; migrar solo si el negocio lo exige.
2. **Base path `/planea`.** Ajuste obligatorio de Vite `base`, router e index `<base href>`.
3. **Env vars reales** — falta enumerarlas del código (Fase 3).
4. **Dos versiones de la lógica de Maya:** `docs/` (implementado, P1–P7, escenarios A–I por
   flujo/deuda/fondo) vs. `Planea Logica Recomendaciones.docx` (P0–P8 + árbol CFP con código explícito).
   Ver §16. Reconciliar cuál es la fuente de verdad en Fase 3 (probablemente el docx es la spec de negocio
   y `docs/` describe lo que quedó en código).
5. **Marca:** producto es **Planea Financiera S.A.S.** (cliente), NO Digit2AI de cara al usuario.
6. **Emoji guacamayo (Maya):** parte del diseño de marca del cliente — respetarlo en el producto aunque
   la regla Digit2AI sea sin emojis (esa regla aplica a deliverables internos/propuestas).
7. **Objetivo declarado del build:** el usuario pidió "replicar este repo en aiagent.ringlypro.com/planea".
   Interpretación de trabajo: desplegar la app real (ya copiada) bajo esa ruta. Confirmar con el usuario si
   además quiere alguna capa Digit2AI encima (Maya con IA, teaser, etc.) — Fase 2.

## 16. Lógica de Maya — Motor de Recomendaciones (spec de negocio, del .docx)
> Fuente: `Planea Logica Recomendaciones.docx`. Base académica: CFP Board + Pirámide de Prioridades
> Financieras adaptada a Colombia. El usuario sube de nivel solo si resolvió el anterior.

**Pirámide (de abajo hacia arriba):** N1 colchón mínimo ($500.000 COP) · N2 pagar deuda cara (>20% EA) ·
N3 fondo emergencia completo (3–6 meses) · N4 ahorrar metas grandes · N5 invertir/crecer.

**Regla de honestidad:** si el objetivo declarado (P0) ≠ recomendación del sistema, Maya dice la verdad:
"Sé que quieres [objetivo]. Vamos a llegar ahí. Pero primero [razón honesta]. Cuando lo resolvamos,
[cómo se conecta con el objetivo original]."

**Árbol de decisión (orden estricto):**
1. **Flujo de caja** `margen = (ingresos - gastos) / ingresos`
   - `< 0%` → **Esc. A** (flujo negativo): meta = cerrar el hueco; timeline 30 días.
   - `0–10%` → **Esc. B** (flujo crítico): meta = colchón $500.000; timeline = 500.000/margen.
   - `> 10%` → continúa a deuda.
2. **Deuda** `DTI = cuotas/ingresos`; `deuda_cara = P3=Sí AND tasa>20%` (si no declaró tasa, asumir cara)
   - cara AND DTI>20% → **Esc. C** (Avalanche, pagar deuda más cara primero).
   - cara AND DTI≤20% → **Esc. D** (50% deuda / 50% fondo simultáneo).
   - sin deuda cara → continúa a fondo.
3. **Fondo de emergencia** `meses = ahorros/gasto_mensual`
   - `== 0` → **Esc. E** (primer mes; aporte semanal = gasto/4).
   - `< 1` → **Esc. F** (llegar a 1 mes; faltante = gasto - ahorros).
   - `1–3` → **Esc. G** (completar 3 meses; si hay deuda moderada, 60% fondo / 40% deuda).
   - `≥ 3` → usuario sólido.
4. **Sólido** — con deuda moderada → **Esc. H** (70% invertir / 30% acelerar crédito); sin deuda →
   **Esc. I** (invertir ≥20% de ingresos; candidato ideal marketplace afiliados).

Cada escenario tiene **texto exacto del mensaje de Maya** (ver docx, PARTE 2–5) + meta que aparece en la
app + cálculo de timeline. Puntos medios de rangos: <$1.5M→$1.2M · $1.5–3M→$2.25M · $3–5M→$4M · $5–8M→$6.5M
· >$8M→$9M (misma lógica para gastos y cuotas).

**Check-in quincenal (sin Open Banking):** cada 15 días Maya hace 2 preguntas cortas para actualizar un
pilar y recalcular el score, guardando registro con `source='checkin'`. 4 preguntas tipo (una por pilar)
en el docx PARTE 8.

## 17. Contexto de negocio / estrategia (del Company Strategy .docx)
- **Visión 3 años:** líder de bienestar financiero personal en Colombia, +500.000 usuarios, alianzas con
  bancos/fintechs, expansión a Perú y Ecuador.
- **Modelo de monetización en fases:** F1 conocer perfil (score+metas como instrumento de datos) →
  F2 alianzas/afiliados (comisión $50k–$100k COP/lead, recomendación contextual NO publicidad) →
  F3 Premium ($14.900 COP/mes individual; $10.000 COP/empleado/mes B2B) → pivot a broker propio (2027).
- **Referentes:** Credit Karma (modelo de negocio/score gratis + afiliados), Copilot Money (UX/diseño),
  Origin Financial (B2B2C). Diferenciador central: **Maya proactiva** (vs. apps que solo muestran datos)
  + **independencia** (sin conflicto de interés de banco).
- **Moat:** data acumulada de perfiles, relación con Maya, posicionamiento de independencia, score
  propietario, canal B2B2C.
- **Stack/costos declarados:** Ionic+React / Supabase / Vercel / planea.co; infra ~$77 USD/mes.
- **Proyección:** breakeven mes 15–16; primer mes flujo positivo mes 9 (2.500 usuarios). TRM $3.600.

## 18. Privacidad y cumplimiento legal (del Política de Privacidad .docx v1.0, abr 2026)
- **Responsable:** Planea Financiera S.A.S., Cali, hola@planea.co. Marco: **Ley 1581 de 2012** + Decreto
  1377 de 2013 (habeas data Colombia). Autoridad: SIC.
- **Recolecta:** identificación/contacto (nombre, WhatsApp, email, empresa) + datos financieros del survey
  (objetivo, ingresos, gastos, deudas, ahorros, estabilidad, dependientes). **NO recolecta** datos
  bancarios/contraseñas/saldos/nada que permita mover dinero.
- **Canal corporativo:** el empleador SOLO ve agregados anónimos (# de activaciones), NUNCA nombre/score/
  finanzas/objetivos/conversaciones. Recomiendan usar email personal, no corporativo.
- **Encargados:** Supabase (DB/auth/storage, cifrado en reposo y tránsito) + Vercel (hosting, sin datos
  financieros). No vende ni transfiere datos con fines comerciales.
- **Derechos titular:** conocer, actualizar, suprimir (≤15 días hábiles), revocar, reclamar (SIC).
  Retención: mientras sea usuario activo + hasta 2 años tras última interacción. Solo +18 años.
- Página pública `planea.co/privacidad`. Copy legal completo en `Planea Politica Privacidad.docx`.

---

## CHANGELOG DEL INTAKE
- 2026-07-10 — Documento creado. Esperando la primera tanda de información del usuario.
- 2026-07-10 — Usuario pidió copiar la app real `Planea-main` desde el Desktop. Resuelto bloqueo de
  permisos de macOS (Full Disk Access para VS Code). Carpeta copiada a `verticals/planea/` (2.0 MB,
  sin node_modules/.git/dist). Identificado stack: Ionic React + Vite + Supabase + Capacitor (ver §1).
  App NO es estática — requiere build de Vite (`pnpm build` → `tsc && vite build` → `dist/`) para servir.
  PENDIENTE (Fase 3, solo con "build"): decidir montaje en `/planea` (ajustar `base`, servir `dist/`,
  y decidir qué hacer con el backend Supabase — externo vs. migrar a Postgres del CRM).
- 2026-07-10 — Revisados `docs/` (11 archivos MD: overview, score, maya, goals, features, patrimony,
  data-model, authentication, admin, json-schemas, index) + los 3 `.docx` (Company Strategy, Lógica de
  Recomendaciones, Política de Privacidad). Spec §2–§18 completadas con: público B2B2C, 9 módulos,
  flujo/rutas, 4 pilares + pesos, 5 rangos, esquemas de datos, auth Supabase, lógica completa de Maya
  (9 escenarios A–I con código, §16), estrategia/monetización (§17) y cumplimiento Ley 1581 (§18).
  `BRD/` está vacío. `docs/` es la documentación funcional real; los `.docx` son la spec de negocio.
  Fase 1 prácticamente completa a nivel de conocimiento del producto. Faltan decisiones de Fase 3
  (Supabase vs CRM, base path, env vars) — todas registradas en §15. Esperando más info o el "build".
