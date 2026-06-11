# AgroMercadoDigital / AgrollanoDigital — Recap Completo de la Sesión

> Documento de traspaso para el equipo (ISTC: Luisa, Luis, Carlos · Digit2AI: Manuel Stagg).
> Fecha: Junio 2026. Resume todo lo construido y decidido en la sesión, el estado actual en
> producción, los hallazgos de seguridad, y la dirección de próximos pasos.

---

## 0. Actores y estructura (corregido durante la sesión)

- **ISTC (Ingeniería y Servicios Tecnológicos Colón)** — empresa venezolana. Desarrollo conceptual + software. **Dueña/registrante de la plataforma AgroMercado.** Contactos: istc.ingenieriatecnologica@gmail.com · Ing. Carlos Alvarado 0414-759-7526 · Ing. Luisa Pirela 0424-713-2078.
- **Digit2AI LLC (EE. UU.)** — socio que aporta la **capa de inteligencia artificial**. Contacto: mstagg@digit2ai.com · 223-294-9184.
- **Grupo Agrollano** — agroindustria venezolana a quien se le presenta el producto. El producto para ellos = **AgrollanoDigital** (marca blanca de AgroMercado, un `tenant_id` separado).
- La alianza es **ISTC × Digit2AI** (NO "AgroMercado × Digit2AI").

---

## 1. Lo que se construyó (en orden)

### 1.1 Teaser ejecutivo para la Junta de Grupo Agrollano
- Página full-bleed autocontenida: `public/agromercado-teaser.html`.
- Live: https://aiagent.ringlypro.com/agromercado-teaser.html · GHL: https://digit2ai.com/agromercado
- Secciones: oportunidad, qué es AgrollanoDigital, la alianza ISTC × Digit2AI, valor para Agrollano, cómo avanzamos (4 pasos), próximo paso, contacto (ISTC + Digit2AI).
- Versión texto plano + versión WhatsApp entregadas.

### 1.2 Presentadora de voz "Lina"
- Primero como agente convai interactivo de ElevenLabs (`agent_8701kts27sfrf6rs4zxrkr7qhwd0`, voz Lina ES).
- Se ajustó: manejo de ruido de fondo (`background_voice_detection`), respuesta más rápida (turn eager + speculative + TTS latency).
- **Decisión final del usuario:** cambiar de voz interactiva en vivo a un **MP3 pregrabado** para eliminar el riesgo de mala señal / latencia en la sala de Junta.
  - MP3: `public/agromercado-lina-presentacion.mp3` (~4:14). URL: https://aiagent.ringlypro.com/agromercado-lina-presentacion.mp3
  - El orbe animado quedó como control play/pausa sobre el MP3 (sin SDK en la página).
  - Enfoque del guion: por qué AgroMercado, cómo funciona, y **principalmente los beneficios para Agrollano**.

### 1.3 Correcciones / pulido
- Página en blanco arreglada (causa real: falta de `</style>` tras agregar CSS del orbe; antes se sospechó `all:initial`). Envuelta como documento HTML completo.
- Full-bleed para que el bloque de GHL ocupe todo el ancho (`width:100vw; margin:calc(50% - 50vw)`).
- Contactos de ISTC agregados.

### 1.4 Prompt de ecosistema para /ringlypro-architect
- `prompts/agromercado-ecosystem-build.md` — convierte el PDF técnico v1.0.1 de ISTC en un plan de 6 fases construible en loop, mapeado al stack RinglyPro.

### 1.5 Vertical AgroMercadoDigital construido y desplegado
- Ubicación: `verticals/agromercado/` (patrón igual a `verticals/veritas/`).
- Montado en `/agromercado`. Health: `/agromercado/health`. Debug: `/debug/agromercado-error`.
- **9 tablas multi-tenant `am_*`** auto-creadas en producción + migración canónica + índice GIN.
- Fases implementadas y verificadas en producción:
  1. **Auth** — login unificado Cédula/RIF, roles admin/producer/buyer, JWT cookie, KYC submit.
  2. **Productos** — 8 categorías, metadata JSONB + GIN, publicación por productor verificado.
  3. **Subastas** — pujas ACID con row-lock, fórmula `P_min = P_actual + Δ_base × (1 + ln(n+1))` (verificada), feed SSE en vivo.
  4. **Divisas** — tabla FX BCV/paralelo, convert, poller 09:00/13:00 + fallback.
  5. **Servicios** — KYC review, directorio, mapa de fincas, leads de financiamiento/logística, WhatsApp (log-only por defecto).
  6. **Capa IA (Digit2AI)** — fraud-flags, market-trends, auction-trail, monitor.
- Dashboard de operaciones: `/agromercado/` (full-bleed, español, sin emojis).
- Documentado en CLAUDE.md. Datos de QA limpiados (tablas vacías, listas para datos reales).

### 1.6 Comparación con la app de ISTC
- Conclusión: son **capas complementarias**. La app de ISTC (Next.js/Supabase) es el storefront público; el vertical RinglyPro es el backend gemelo + operaciones + IA. No compiten.
- Mi build AGREGA la capa de IA que no existe en la app pública; NO tiene el storefront de cara al usuario.
- Tres caminos: (1) IA sobre Supabase de solo lectura, (2) backend gemelo + migración, (3) sandbox de demo.

---

## 2. Hallazgos de Seguridad (CRÍTICO — pendiente de remediar)

Del vertical desplegado (explotables hoy):
- **C1 — Escalamiento de rol en registro:** `role` se toma del body → cualquiera se registra como `admin`. (`routes/auth.js`)
- **C2 — Inyección de tenant en registro:** `tenant_id` del body → registrarse en cualquier tenant (incl. Agrollano). (`middleware/auth.js`)
- **C3 — Secreto JWT por defecto público:** fallback `'agromercado-istc-2026-secret'` en repo público → tokens admin forjables si `AGROMERCADO_JWT_SECRET` no está seteado en Render.
- Altos: sin rate-limit (fuerza bruta), CSRF (cookie SameSite=None sin token), lectura cruzada de tenants en endpoints públicos, comparte la BD de producción del CRM.
- Lado ISTC (diseño): **auditar las RLS policies de Supabase** (riesgo #1 si usa anon key en cliente); re-validar cola offline de IndexedDB; firmar webhooks de WhatsApp.

**Acción recomendada antes de cualquier demo con datos reales:** parchear C1–C3 + setear `AGROMERCADO_JWT_SECRET`.

---

## 3. Próximos pasos según la dirección del usuario (interpretación de la nota de voz — CONFIRMAR)

> Esta sección es mi interpretación de una nota de voz larga; por favor corregir lo que no cuadre.

1. **Arquitectura en 3 módulos** (estilo "reverse engineering", misma estructura que un modelo probado):
   - **Módulo 1 — El Motor / Sistema Financiero** = la base, la capa más importante y más segura.
   - **Módulo 2 — Dashboard Administrativo / Franquicia** (subset del Módulo 1 → se vuelve una franquicia).
   - **Módulo 3 — Requerimientos de Negocio** = donde vive TODO el business requirement; **empezar por aquí** porque el resto fluye de él.
2. **Empezar por el Módulo 3** y hacer reverse engineering de los requerimientos.
3. **Sistema financiero (Módulo 1)** — la capa crítica:
   - Evaluar soluciones de pago para Venezuela: Stripe, Square, PayPal, Apple Pay, QuickBooks — o construir uno propio.
   - Realidad: Venezuela = país de alto riesgo → cada transacción pasa por revisión (AML/compliance), lo que puede retener fondos y "defeat the purpose". PayPal/bancos cobran comisión; típicamente ~2.5% por transacción.
   - Es la capa más sensible y debe diseñarse con seguridad primero. (Compliance/ruteo de fondos NO va en el teaser de la Junta — se maneja aparte.)
4. **Metodología de captura de requerimientos = historias de usuario.** Pensar como José (gerente de Agrollano): *"Como gerente de AgroLlano, quiero ver una pantalla donde [X], para poder [Y]"* + criterios de aceptación (*"aprieto [botón] y obtengo [Z]"*). Roles a soportar en Agrollano: secretaria, administrador, contador, etc. Transparente para ellos.
5. **Diagramar primero el modelo** (paso 1) antes de codificar. Modelo #1 = AgroLlano: qué información capturar (quiénes son, qué hacen, dónde compran, qué usan, con quién se conectan, cómo ocurre una transacción).
6. **Investigación profunda (deep research)** con Gemini/Luisa sobre AgroLlano (info pública) para alimentar el diseño; idea de un **MCP server con ~80 agentes de IA en "un solo cerebro"**.
7. **Consolidar infraestructura en un solo engine = Render.** Mover el repo (los 3 módulos) a Render. GitHub + Render como pipeline. Luis trabaja en GitHub; lenguaje Node.js.
8. **Entregar el workflow técnico documentado** para que Luis/Luisa puedan trabajar, revisar y dar **sign-off**.

---

## 4. URLs y referencias rápidas
- Teaser (RinglyPro): https://aiagent.ringlypro.com/agromercado-teaser.html
- Teaser (GHL): https://digit2ai.com/agromercado
- MP3 Lina: https://aiagent.ringlypro.com/agromercado-lina-presentacion.mp3
- Backend vertical: https://aiagent.ringlypro.com/agromercado/ · health `/agromercado/health`
- App pública ISTC: https://agromercado-vzla.vercel.app/
- Prompt de build: `prompts/agromercado-ecosystem-build.md`
- Código del vertical: `verticals/agromercado/`
