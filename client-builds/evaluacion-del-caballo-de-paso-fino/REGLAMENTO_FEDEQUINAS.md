# Reglamento FEDEQUINAS — Reglas de Juzgamiento (base de conocimiento del ecosistema)

Fuente autoritativa: **Reglamento de las Exposiciones, Actos y Demás Actividades del Ámbito de la
Federación Colombiana de Asociaciones Equinas (FEDEQUINAS)**, actualizado al **13 de enero de 2026**
(151 pp., incluye Resoluciones 4058/2019 … 4758/2025).

Este documento destila del reglamento **solo lo que el motor de juzgamiento de EquiMind necesita** —
tablas de puntaje, definición de andares, alzadas mínimas, defectos descalificantes y faltas en pista —
y **audita** cada regla contra lo que el motor mide hoy (`lib/*`). Es la fuente de verdad para reconciliar
el rubro del motor con el rubro oficial. No sustituye el reglamento completo; cita capítulo/artículo/resolución
para trazabilidad y apelaciones.

> **Regla de honestidad (ya vigente en el ecosistema):** medidas y hallazgos = salida real del análisis;
> el motor **no sustituye al juez oficial de la pista** (así lo firma `lib/dictamen.js`). Bajo el sistema
> real F1‑F2 el fallo lo emiten 1/3/5 jueces por *mejor puesto promedio* (Cap. XI, Art. 15). EquiMind es
> **asistente de juzgamiento y de cría**, no la instancia oficial.

---

## 1. Andares del Caballo Criollo Colombiano (CCC) — Cap. XI, Art. 1, Par. 3

| Andar | Tiempos | Patrón | Juzgamiento | Sonido |
|---|---|---|---|---|
| **Trote y Galope Colombianos** | 2 (trote) + galope | bípedos **diagonales** | 50% trote **+ 50% galope** | TAS‑TAS / "catorce" |
| **Trocha y Galope Colombianos** | 4 (trocha) + galope | **diagonal** | 50% trocha **+ 50% galope** | tras…tras… / "catorce" |
| **Trocha Colombiana** | 4 | **diagonal** | trocha simple | tras…tras…tras…tras |
| **Paso Fino Colombiano** | 4 isócronos | **lateral** (post‑izq→ant‑izq) | paso fino simple | ta‑ca‑ta‑ca |
| Paso Fino (Performance) / de Placer | 4 | lateral | variantes | — |

Secuencia isócrona del Paso Fino: **post‑izq, ant‑izq, post‑der, ant‑der** (4 tiempos iguales, cadencia rápida,
elevación media‑baja). La **firma discriminante lateral vs diagonal** que usa `lib/classifier.js` (cada mano
sigue al posterior del **mismo** lado ⇒ lateral ⇒ paso fino) es **correcta y coincide con el reglamento**.

**AUDIT — mapeo de modalidad (`lib/classifier.js`, `lib/thresholds.js`):**
- ✅ paso_fino (4T lateral isócrono) — correcto.
- ✅ trocha (4T diagonal) — correcto.
- ⚠️ **trote_galope / trocha_galope son andares COMPUESTOS (50/50 con galope), no "trote puro" ni "galope puro".**
  El clasificador hoy rotula `trote_galope` como "trote (2T)" **o** "galope (3T)". En una categoría real de
  Trote y Galope el ejemplar ejecuta **ambos** aires en el mismo recorrido (dos vueltas trote + dos al galope,
  Cap. XI, Art. 7). El motor debería (a) detectar la **transición** trote↔galope dentro de una sesión y
  puntuar 50/50, y (b) distinguir `trocha` (simple) de `trocha_galope` (compuesto) por presencia de fase de galope.
- ⚠️ Faltan `paso_fino_performance` y `paso_fino_de_placer` como sub‑modalidades (Cap. XI, Art. 1).

---

## 2. Tabla de puntajes OFICIAL — Cap. XI, Art. 3 (mod. Res. 4755 de 30‑jul‑2025)

**Este es el rubro que un juez de CCC aplica. El motor usa otro (ver AUDIT).**

### 2.1 Caballo Criollo Colombiano (reproductores adiestrados)
| Bloque | Ítem | Puntos |
|---|---|---:|
| **MOVIMIENTOS (40%)** | Suavidad y Naturalidad en el andar | **10** |
| | Ritmo, Cadencia, firmeza y seguridad en la pisada | 8 |
| | Brío y Temperamento | 8 |
| | Compensación (armonía tren anterior/posterior) | 8 |
| | Quietud de Anca | 6 |
| **ADIESTRAMIENTO (25%)** | Sostenimiento | **15** |
| | Rienda y comportamiento | 5 |
| | Reunión, armonía y posición de cabeza | 5 |
| **FENOTIPO (35%)** | Balance y conjunto en conformación (Cabeza, Cuello, Pecho, Vientre, Dorso, Anca, Cola, **Alzada**) + **Manchas/Pintas** | **20** |
| | Aplomos | 15 |
| | | **100** |

- **Suavidad** = "serenidad y comodidad con la cual el ejemplar transporta su jinete sobre el dorso… **la más
  relevante cualidad**" (Cap. XI, Art. 3, Par. 5). Es la línea de mayor peso individual del reglamento.
- **Alzada**: rangos superiores a la mínima con igual proporcionalidad → **mejor** calificados.
- **Manchas/Pintas**: es deseable la **menor** presencia (raza de colores cerrados).

### 2.2 Campeón/Campeona Joven (36–48 m, con freno y falsa rienda) — Cap. XI, Art. 3, Par. 4 (Res. 4616)
Movimientos 35% (Suavidad 9 · Ritmo/cadencia/firmeza 7 · Brío 7 · Compensación 7 · Quietud anca 5) ·
Adiestramiento 35% (Sostenimiento 15 · **Falsa rienda** y comportamiento‑caminar 15 · Reunión/posición cabeza 5) ·
Fenotipo 30% (Balance/conjunto+Alzada 15 · Aplomos 15).

### 2.3 Grupos de Yeguas (Para/Con Cría) — Par. 3 (Res. 4613)
Grupo/Lote **uniformidad 10%** · Movimientos 30% (Armonía+naturalidad 15 · Cadencia/ritmo 15) ·
Comportamiento 15% (brío/mansedumbre/docilidad) · Fenotipo 45% (conformación/feminidad/pintas 10 · línea dorsal 8 ·
amplitud‑angulación ancas/pecho/alzada 7 · glándula mamaria/vulva 5 · **Aplomos 15**).

### 2.4 Asnales — Par. 1 (Res. 4613)
Movimientos 45% (Armonía 25 · Cadencia/ritmo/suavidad 10 · Brío 10) · Adiestramiento 15% ·
Fenotipo 40% (cabeza/pecho/vientre/anca/color 10 · mandíbula 4 · orejas 4 · cruz 2 · cuello 4 · **alzada 6** ·
línea dorsal 3 · calidad podal 3 · aplomos 4).

### 2.5 Mulares de Silla — Par. 2 (Res. 4613)
Movimientos 50% (Armonía+quietud anca+suavidad 25 · Cadencia/ritmo 15 · Brío 10) · Adiestramiento 25% ·
Fenotipo 25%. Se juzgan las 4 modalidades + **gateadoras** (rienda suelta). Gateadoras **no** hacen prueba del 8.

**AUDIT — rubro del motor (`lib/scoring.js` → `CRITERIOS_PASO_FINO`):**

| Criterio del motor | Peso motor | Bloque oficial más cercano | Peso oficial | Estado |
|---|---:|---|---:|---|
| Ritmo y regularidad (CV intervalos) | 35% | Movimientos › Ritmo/Cadencia/firmeza (8) + Sostenimiento (15) | ~23% | ✅ mide bien; **sobre‑pesado** |
| Claridad 4 tiempos | 25% | Movimientos › (implícito en ritmo/firmeza de pisada) | — | ⚠️ concepto válido, **no es una línea oficial separada** |
| Simetría lateral | 15% | Movimientos › (proxy de quietud/compensación) | — | ⚠️ proxy |
| Brío / cadencia | 15% | Movimientos › Brío y Temperamento (8) | 8% | ✅ alineado |
| Elevación | 10% | Movimientos › (aporta pero **no** es línea) | — | ⚠️ proxy de acción |
| **Suavidad y Naturalidad** | **0%** | Movimientos › **10** (la más relevante) | **10%** | ❌ **NO MEDIDA** |
| **Compensación** | 0% | Movimientos › 8 | 8% | ❌ no medida (derivable de arcos ant/post en pose) |
| **Quietud de Anca** | 0% | Movimientos › 6 | 6% | ❌ no medida (derivable de desplazamiento de anca en pose) |
| **ADIESTRAMIENTO** (Sostenimiento/Rienda/Reunión/**posición cabeza**) | 0% | 25% | 25% | ❌ ausente (sostenimiento≈regularidad; posición cabeza y reunión = pose) |
| **FENOTIPO** (conformación/**aplomos**/**alzada**/manchas‑pintas) | 0% | 35% | 35% | ❌ ausente en el motor de marcha → **dominio del `equimind-gs-engine`** |

**Juicio:** el motor de marcha cubre bien **Movimientos** y parte de **Adiestramiento** (sostenimiento vía CV),
pero pesa distinto al oficial, **omite Suavidad** (la línea #1), y no toca **Adiestramiento completo** ni
**Fenotipo (35%)**. Fenotipo/Aplomos/Alzada/Pintas son medibles por el **GS engine** (conformación 3D). La
puntuación "de campeonato" honesta exige **fusionar** ambos motores: `evaluacion` = Movimientos (+parte de
Adiestramiento medible por pose), `equimind-gs-engine` = Fenotipo/Aplomos/Alzada/Color. Ver §6.

---

## 3. Alzadas mínimas (prepista) — Cap. VI, Art. 5, Par. 3

| Andar | Edad (m) | Machos (m) | Hembras (m) |
|---|---|---:|---:|
| Trote y Galope / Trocha y Galope | 36–48 | 1.36 | 1.34 |
| | >48–60 | 1.38 | 1.36 |
| | >60 | 1.40 | 1.38 |
| Trocha Colombiana / Paso Fino | 36–48 | 1.34 | 1.32 |
| | >48–60 | 1.36 | 1.34 |
| | >60 | 1.38 | 1.36 |
| Mulares (cualquier sexo) | >36 | 1.33 | 1.33 |
| Asnales | >36 | 1.25 (M) | 1.22 (H) |
| Caballos castrados | — | sin mínimo | — |

Herrajes: 4 iguales, mismo material, espesor 7 mm–1 cm; lumbres ≤ 8.5 cm; talón ≤ 4.25 cm. Cascos sin pintura.
**AUDIT:** el motor **no valida alzada** (es dato de prepista/medición) → competencia del **GS engine** (medición
de conformación escalada). El campo `ecpf_categorias.edad_min/max_meses` existe; falta la tabla de alzada mínima.

---

## 4. Defectos que impiden competir (prepista) — Cap. VI, Art. 5–6

45 renglones (Cap. VI, Art. 6). Descalificantes **Des**, Penalizables **Pen**, Reportables **Rep**. Selección de
los relevantes para visión/pose (el resto es veterinario en prepista):

- **Pose/medición (parcialmente automatizable):** Lordosis/**Pando** (>8 cm dorso; yeguas >60 m tolera 12 cm) ·
  **Aplomos** técnica/anatómicamente inaceptables · No hacer **pisada plana** (apoyo en lumbres/talones) ·
  **Cuello caído** (Pen) · alzada no cumplida.
- **Color/pigmentación (GS engine):** Ojicambiado · Calzado irreglamentario · Pintas no continuas · Manchas en cara
  que exceden plano sagital (Des para nacidos ≥ 1‑ene‑2027, Pen antes — **Res. 4756/2025**, rige 1‑ene‑2026) ·
  Manchas que invaden ollares/labios · Colimocho · Pseudo‑albino.
- **Veterinario (fuera de alcance del motor):** Belfo/Picudo · faltan ≥2 dientes permanentes · Encarrillado ·
  Tuerto · Tungo/Gacho · Aguacates · Ciclán / testículos anómalos · Yegua 1 pezón · Colas inmóviles/inyectadas/
  recién picadas · Cuerpos extraños en cola · Indocilidad · Doping.

**Excepción del caballo castrado (Cap. VI, Art. 5.27 / Cap. XII):** sin restricción de color/pintas, sin alzada
mínima, belfo/picudo/falta de dientes **no** descalifican.

**AUDIT:** el único descalificante que el motor modela es **modalidad ≠ categoría** (`es_modalidad_valida`,
`lib/classifier.js` + `lib/dictamen.js` sección crítica) — correcto y bien redactado. **Falta** modelar la
taxonomía de descalificantes/penalizables (aunque la mayoría sea veterinaria, pando/aplomos/pisada‑plana/pintas
son detectables por pose+GS y deberían al menos existir como catálogo con `origen: pose|gs|veterinario`).

---

## 5. Faltas descalificantes EN PISTA — Cap. XI, Art. 15.d (mod. Res. 4734 de 15‑jul‑2025, 18 renglones)

Retiran al ejemplar (1 juez salvo hiperflexión = 2 jueces + protocolo):
brincar con jinete/silla · sangrar boca/herida · **retacarse** (plantarse) · castigo del montador · montador
ebrio/uniforme indebido · girar 2+ vueltas sobre el poste (prueba del 8) · **salirse/girar sobre la Tabla de
Resonancia** o recorrido incompleto · no estar en condiciones · perder 2+ herraduras · **andar que no corresponde**
· no retroceder/levantar dos manos (indocilidad) · en proceso adiestramiento no flexionar cuello tras retroceso ·
**hiperflexión del tren posterior (calambre)** · **cojera evidente** · cola sin tono · entrar a pista sonora ocupada ·
obstaculizar a otro · **no dirigirse a la bahía en el aire juzgado**.

Recorrido individual obligatorio (orden estricto): **Figura del 8 → Cejar/retroceder → (flexión si en
adiestramiento) → Tabla de Resonancia → Bahía** (Cap. XI, Art. 8). Pruebas opcionales de dificultad (sorteo):
doble pase por tabla · cambio de dirección · paralelo · círculos 3+3 · pare‑y‑siga/cambio de andar · montar los
ejemplares (Art. 13).

**AUDIT:** varias faltas son detectables por pose/audio y **no están modeladas**:
- **Cojera evidente** ≈ asimetría fuerte (el motor tiene `simetria_lateral`; hoy solo la comenta, no la marca como
  falta). Debería emitir bandera **crítica** cuando la asimetría cruce umbral, alineado con Art. 15.d‑14.
- **Andar que no corresponde** ✅ ya cubierto (`es_modalidad_valida`).
- **Hiperflexión / retaque / salirse de tabla** — requieren pose de la trayectoria (keypoints de casco/anca);
  el contrato de pose existe (`ecpf_pose_keypoints`) pero estas reglas de pista no se evalúan.
- El motor puntúa una **grabación libre**; no valida la **secuencia obligatoria** (8→cejar→tabla→bahía). Para modo
  "campeonato" real debería verificar orden y penalizar 7 pts por saltar/omitir prueba (Cap. XI, Art. 14, Par. 1).

---

## 6. Recomendación de arquitectura — motor de puntaje alineado al oficial

Para que EquiMind emita un puntaje **reconciliable con el rubro FEDEQUINAS** (sin dejar de ser honesto sobre lo
que puede/ no puede medir), el rubro debería **re‑pesarse al 40/25/35 oficial** y repartir criterios así, marcando
`medible:false` (ya soportado en `lib/scoring.js`) lo que aún no se capta:

- **MOVIMIENTOS 40%** → motor de marcha (`evaluacion`): **Suavidad 10** (nuevo — desplazamiento vertical del dorso/
  jinete en pose ⇒ comodidad), Ritmo/Cadencia/firmeza 8 (CV + claridad), Brío 8 (cadencia), **Compensación 8**
  (nuevo — |arco ant − arco post|), **Quietud de anca 6** (nuevo — rango de anca en pose).
- **ADIESTRAMIENTO 25%** → marcha + pose: Sostenimiento 15 (constancia del ritmo ≈ 1−CV a lo largo del clip),
  Rienda/comportamiento 5 (medible:false hasta tener señal), **Reunión/posición de cabeza 5** (ángulo cabeza‑cuello en pose).
- **FENOTIPO 35%** → **`equimind-gs-engine`**: Balance/conjunto+Alzada 20 (medidas de conformación 3D + alzada
  escalada) · Aplomos 15 (líneas verticales de miembros) · Manchas/Pintas (color).

El puntaje total ya **renormaliza por cobertura** cuando un criterio no es medible (`score()` en `lib/scoring.js`),
así que se puede publicar el rubro oficial completo hoy y dejar Suavidad/Compensación/Quietud/Fenotipo como
`medible:false` hasta cablear pose+GS, sin castigar con ceros. La UI ya muestra "parcial" por `cobertura`.

Sub‑motores por tipo (para cubrir todo el reglamento): `caballo` (default), `campeon_joven`, `grupo_yeguas`,
`asnal`, `mular` — cada uno con su tabla oficial (§2.1–2.5) en `ecpf_criterios_evaluacion` versionado
(nunca hardcodeado — el patrón de `umbrales_json` de `lib/thresholds.js` ya lo permite).

---

## 7. Resoluciones 2026 que impactan el juzgamiento (rigen desde 1‑ene‑2026)

- **Res. 4755** — nueva tabla de puntajes CCC (§2.1). **Es el rubro vigente.**
- **Res. 4756** — manchas/pintas: Descalificante para nacidos ≥ 1‑ene‑2027, Penalizable para anteriores (§4).
- **Res. 4757** — nuevos requisitos de **Fuera de Concurso** (12 Grandes Campeonatos Grado A en 5 zonas, 5 en
  Grado B, 1 en JNP, 1 en AA/Nacional; ≥15 jueces distintos; 2 hijos con ADN).
- **Res. 4754** — Figura del 8 para ejemplares **en proceso de adiestramiento** (vigencia solo 2026).
- **Res. 4752** — retiro por causa sanitaria tras iniciar competencia ⇒ **toma de muestra antidoping obligatoria**.
- **Res. 4758** (Anexo) — **prohíbe en prepista** cualquier producto para acicalar équidos.
- **Res. 4753** — uniforme: suéter cuello en V negro opcional (clima frío).
- **Res. 4729** — nacidos ≥ 1‑jul‑2025: **una sola marca** en zona húmero‑escapular, en frío (nitrógeno líquido).
- **Uniforme (Cap. VII, Art. 12, desde 1‑ene‑2026):** sombrero criollo **blanco**, camisa blanca, blazer negro,
  pantalón negro, botas negras, zamarros negro/marrón/café. Sin uniforme reglamentario **no compite** el ejemplar.

## 8. Zonas geográficas (para títulos del año / Fuera de Concurso) — Cap. XVII, Art. 2

Z1 Costa (Córdoba, Sucre, Bolívar, Atlántico, Magdalena, Cesar, Guajira, San Andrés) · Z2 Centro (Bogotá,
Cundinamarca, Caquetá) · Z3 Antioquia/Eje (Antioquia, Caldas, Risaralda, Quindío) · Z4 Pacífico/Sur (Chocó, Valle,
Cauca, Nariño, Putumayo, Huila, Tolima) · Z5 Oriente (N. Santander, Santander, Boyacá, Arauca, Casanare, Meta,
Vichada, Guainía, Guaviare, Vaupés, Amazonas).

---

### Trazabilidad
Todo puntaje/veredicto del motor debe citar (a) el modelo de umbrales versionado (`lib/thresholds.js`,
`ecpf_modelos_clasificacion`) y (b) el artículo/resolución de este documento. Cambios del reglamento se reflejan
editando **este archivo + los umbrales**, no el código del motor.
