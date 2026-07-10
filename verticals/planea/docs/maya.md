# Maya — Consejera Financiera de Planea

## ¿Quién es Maya?

Maya es la consejera financiera de Planea. Se presenta con el ícono de un guacamayo (🦜) y acompaña al usuario a lo largo de toda la experiencia: aparece durante el cuestionario de diagnóstico, en los resultados del puntaje y en la pantalla de inicio como recordatorio de la recomendación activa.

Maya no es un chatbot ni una inteligencia artificial conversacional. Es un **motor de recomendaciones determinístico**: a partir de los datos del diagnóstico del usuario, selecciona el consejo más relevante de un conjunto de escenarios bien definidos y lo presenta en lenguaje natural, cercano y sin jerga.

## ¿Cómo funciona?

Después de analizar el puntaje y los datos del cuestionario, Maya identifica a cuál de los **nueve escenarios financieros** pertenece el usuario. Cada escenario combina factores como:

- Si el usuario tiene superávit o déficit de flujo de caja.
- Si su deuda es costosa (tarjetas, préstamos informales) o moderada/manejable.
- Si cuenta con un fondo de emergencia suficiente.
- Cuál es su objetivo financiero principal (ahorrar, salir de deudas, estabilizarse).

### Los nueve escenarios

| Escenario | Situación típica |
|-----------|-----------------|
| **A** | Sin déficit, sin deuda costosa, con fondo de emergencia suficiente |
| **B** | Sin déficit, sin deuda costosa, fondo de emergencia insuficiente o inexistente |
| **C** | Sin déficit, deuda costosa presente, con fondo de emergencia suficiente |
| **D** | Sin déficit, deuda costosa presente, sin fondo de emergencia suficiente |
| **E** | Sin déficit, deuda moderada, con o sin fondo de emergencia |
| **F** | Sin déficit, sin deuda, sin ningún fondo de emergencia |
| **G** | Con déficit de flujo de caja, independientemente de la deuda |
| **H** | Situación mixta con ingresos variables y alta presión de gastos |
| **I** | Caso general con foco en estabilización básica |

Cada escenario produce:

- Un **mensaje de Maya**: párrafo corto en español colombiano que explica la situación del usuario, valida su esfuerzo y señala el paso más importante a tomar ahora mismo.
- El **texto de la meta mensual**: la descripción del objetivo que se le asignará automáticamente.
- Una **línea de tiempo estimada**: cuánto tiempo podría tomar ver resultados si sigue el plan.

## Presencia en la app

Maya aparece en tres momentos clave de la experiencia:

1. **Durante el cuestionario** (`/score`): En puntos estratégicos del flujo, aparecen "momentos Maya" — burbujas con el ícono del guacamayo que ofrecen contexto o ánimo mientras el usuario responde.

2. **En los resultados del puntaje**: Después de completar el diagnóstico, el mensaje de Maya es lo primero que se muestra, antes que los detalles técnicos del puntaje.

3. **En la pantalla de inicio** (`/home`): La recomendación activa de Maya se muestra como una tarjeta permanente, recordando al usuario cuál es su foco actual.

## Tono y estilo

Maya habla en primera persona, de forma cálida y directa. No juzga ni alarma: reconoce la situación del usuario y ofrece un camino concreto. Los mensajes evitan el lenguaje bancario y usan términos cotidianos. El objetivo es que el usuario sienta que tiene un aliado que entiende su contexto colombiano, no que está siendo evaluado por una institución financiera.

## Limitaciones actuales

- Maya no responde preguntas en tiempo real ni mantiene conversación.
- Sus recomendaciones son fijas por escenario: dos usuarios en el mismo escenario reciben el mismo mensaje base.
- No tiene acceso a datos externos (precios del mercado, tasas de interés actuales, etc.).
