/* Build With AI — keynote content. One source for the slides (keynote/) and the word-for-word script (script/).
   Each slide: sec (section 1-7), min (target minutes), visual (shared HTML), en/es: title, body, notes, cut (first slide of a section only).
   {AGENTS} in notes is replaced with EVENT.agentCount. Cues in [BRACKETS] are stage directions, not spoken. */
window.SECTIONS = [
  { en: "Hook", es: "Gancho" },
  { en: "What AI is now", es: "Qué es la IA hoy" },
  { en: "The shift", es: "El cambio" },
  { en: "MCP", es: "MCP" },
  { en: "Neural Intelligence Network", es: "Red de Inteligencia Neuronal" },
  { en: "Reality check", es: "Con los pies en la tierra" },
  { en: "Your turn", es: "Tu turno" }
];

window.SLIDES = [
/* 1 */ {
  sec: 1, min: 0.5, kind: "title",
  visual: '<div class="v-title-meta"><span data-ev="presenter"></span><span data-ev="presenterRole"></span><span data-ev="date"></span></div>',
  en: { title: "Build With AI", body: "Tonight you don't just hear about AI. You ship something with it.",
    notes: `Good evening, everybody. My name is Manny Stagg. I've spent more than twenty-five years working in data infrastructure and enterprise architecture, and today I build AI systems at DIGIT2AI.
[PAUSE]
Tonight is not a lecture. In two hours, every team in this room is going to build a working app and put it on the internet. So let's not waste a minute. Let's start right now.`,
    cut: "Use a pre-chosen idea on the next slide instead of asking the room. Saves about one minute." },
  es: { title: "Construye con IA", body: "Esta noche no solo vas a escuchar sobre IA. Vas a lanzar algo con ella.",
    notes: `Buenas noches a todos. Mi nombre es Manny Stagg. Llevo más de veinticinco años trabajando en infraestructura de datos y arquitectura empresarial, y hoy construyo sistemas de inteligencia artificial en DIGIT2AI.
[PAUSA]
Esta noche no es una clase. En dos horas, cada equipo en este salón va a construir una aplicación que funciona y la va a poner en internet. Así que no perdamos ni un minuto. Empecemos ya.`,
    cut: "Usa una idea preparada de antemano en la siguiente diapositiva en vez de pedirla al público. Ahorra cerca de un minuto." }
},
/* 2 */ {
  sec: 1, min: 1.5, kind: "hook",
  visual: '<div class="v-hook"><label for="ideaInput"><span class="en">The idea from this room</span><span class="es">La idea de este salón</span></label><input id="ideaInput" type="text" autocomplete="off" placeholder="Type the idea here"><button class="v-btn" id="startClock" type="button"><span class="en">Start build clock</span><span class="es">Iniciar reloj de construcción</span></button><div class="v-clock" id="clockHook" aria-live="polite"></div></div>',
  en: { title: "Give me one idea. I'll build it while I talk.", body: "Something you wish existed for your school, your job, or your friends.",
    notes: `I need one idea from you. Something you wish existed. An app for your school, for your job, for your group of friends. Just shout it out.
[TAKE TWO OR THREE IDEAS. PICK THE ONE THAT IS SMALL AND CLEAR.]
Great. I'm typing it right here so we don't forget it.
[TYPE THE IDEA INTO THE SLIDE. PRESS "START BUILD CLOCK".]
Now watch what I do. I'm going to describe this idea in plain English to our Factory and send it. No code.
[SEND THE BUILD FROM YOUR PHONE OR SECOND SCREEN.]
While I talk for the next twenty minutes, a team of AI agents is going to plan it, write it, test it, and put it online. At the end of my talk, we open it together.
If it works, you'll see why everything is changing. If it breaks, you'll see something just as important: how we fix it. Either way, you learn something real.` },
  es: { title: "Dame una idea. La construyo mientras hablo.", body: "Algo que te gustaría que existiera para tu escuela, tu trabajo o tus amigos.",
    notes: `Necesito una idea de ustedes. Algo que les gustaría que existiera. Una app para su escuela, para su trabajo, para su grupo de amigos. Díganla en voz alta.
[TOMA DOS O TRES IDEAS. ESCOGE LA MÁS PEQUEÑA Y CLARA.]
Perfecto. La escribo aquí mismo para que no se nos olvide.
[ESCRIBE LA IDEA EN LA DIAPOSITIVA. PRESIONA "INICIAR RELOJ DE CONSTRUCCIÓN".]
Ahora miren lo que hago. Voy a describir esta idea en lenguaje normal a nuestra Factory y la voy a enviar. Sin código.
[ENVÍA LA CONSTRUCCIÓN DESDE TU TELÉFONO O SEGUNDA PANTALLA.]
Mientras hablo los próximos veinte minutos, un equipo de agentes de IA la va a planear, escribir, probar y publicar en internet. Al final de mi charla la abrimos juntos.
Si funciona, van a ver por qué todo está cambiando. Si falla, van a ver algo igual de importante: cómo lo arreglamos. De cualquier forma, aprenden algo real.` }
},
/* 3 */ {
  sec: 2, min: 2.5,
  visual: '<div class="v-split"><div class="v-col"><h3><span class="en">Chatbot</span><span class="es">Chatbot</span></h3><ul><li><span class="en">You ask, it answers</span><span class="es">Preguntas, responde</span></li><li><span class="en">One turn</span><span class="es">Un turno</span></li><li><span class="en">You do the work</span><span class="es">Tú haces el trabajo</span></li></ul></div><div class="v-col on"><h3><span class="en">Agent</span><span class="es">Agente</span></h3><ul><li><span class="en">You give a goal, it acts</span><span class="es">Das una meta, actúa</span></li><li><span class="en">Many steps</span><span class="es">Muchos pasos</span></li><li><span class="en">It does the work, you check it</span><span class="es">Hace el trabajo, tú lo revisas</span></li></ul></div></div>',
  en: { title: "AI used to answer. Now it acts.", body: "",
    notes: `Quick show of hands. Who has used ChatGPT, Claude, Gemini, or any AI chat in the last week?
[HANDS. PAUSE.]
Keep your hand up if you used it for homework.
[LET THE LAUGH HAPPEN.]
That's most of you. So you already know the first version of AI: you ask, it answers. That's a chatbot. It's like having a really smart friend on the phone. They can tell you how to change a tire, but they can't touch your car.
What changed in the last couple of years is that AI can now act. An agent doesn't just tell you the steps. It takes them. It can open files, search, write code, run that code, see the error, and try again.
Think about the difference between a friend who explains a recipe over text and a friend who walks into your kitchen and cooks it. The second one is an agent.
[POINT TO THE TWO COLUMNS.]
On the left: answers, one turn, you do the work. On the right: actions, many steps, it does the work and you check it.
That last part matters. You check it. Hold on to that. We'll come back to it.`,
    cut: "Skip the cooking analogy and the step-by-step explanation on the next slide. Keep the show of hands and leave the loop on screen." },
  es: { title: "Antes la IA respondía. Ahora actúa.", body: "",
    notes: `Levanten la mano rápido. ¿Quién ha usado ChatGPT, Claude, Gemini o cualquier chat de IA en la última semana?
[MANOS. PAUSA.]
Déjenla arriba si la usaron para la tarea.
[DEJA QUE SE RÍAN.]
Casi todos. Entonces ya conocen la primera versión de la IA: preguntas y responde. Eso es un chatbot. Es como tener un amigo muy inteligente al teléfono. Te puede explicar cómo cambiar una llanta, pero no puede tocar tu carro.
Lo que cambió en los últimos años es que la IA ahora puede actuar. Un agente no solo te dice los pasos. Los ejecuta. Puede abrir archivos, buscar, escribir código, correr ese código, ver el error e intentarlo otra vez.
Piensen en la diferencia entre un amigo que te explica una receta por mensaje y un amigo que entra a tu cocina y la prepara. El segundo es un agente.
[SEÑALA LAS DOS COLUMNAS.]
A la izquierda: respuestas, un turno, tú haces el trabajo. A la derecha: acciones, muchos pasos, el agente hace el trabajo y tú lo revisas.
Esa última parte es clave. Tú lo revisas. Guarden eso. Vamos a volver a ello.`,
    cut: "Omite la analogía de la cocina y la explicación paso a paso de la siguiente diapositiva. Deja la pregunta de las manos y el ciclo en pantalla." }
},
/* 4 */ {
  sec: 2, min: 2.5,
  visual: '<ol class="v-loop"><li><b><span class="en">Goal</span><span class="es">Meta</span></b></li><li><b><span class="en">Plan</span><span class="es">Plan</span></b></li><li><b><span class="en">Use tools</span><span class="es">Usar herramientas</span></b></li><li><b><span class="en">Check</span><span class="es">Revisar</span></b></li><li><b><span class="en">Repeat</span><span class="es">Repetir</span></b></li></ol>',
  en: { title: "How an agent works", body: "One loop. That's the whole secret.",
    notes: `So how does an agent actually work? It's simpler than you think. Five steps.
One: it gets a goal. "Build me a study planner."
Two: it makes a plan. I need a page, a place to save data, maybe a login.
Three: it uses tools. It writes files, runs commands, connects to services.
Four: it checks its work. Did the test pass? Does the page load?
Five: if something is wrong, it goes back and repeats.
Goal, plan, tools, check, repeat. That loop is the whole secret. Humans work exactly like this. We're just slower, and we get tired.
The agent doesn't get tired. But it also doesn't know what matters to you unless you tell it. So the most valuable thing you bring is the goal. A vague goal gets a vague result. A clear goal gets something you can actually use.
Tonight, you're going to practice writing clear goals.` },
  es: { title: "Cómo funciona un agente", body: "Un ciclo. Ese es todo el secreto.",
    notes: `Entonces, ¿cómo funciona un agente? Es más simple de lo que creen. Cinco pasos.
Uno: recibe una meta. "Constrúyeme un planificador de estudio."
Dos: hace un plan. Necesito una página, un lugar para guardar datos, quizás un inicio de sesión.
Tres: usa herramientas. Escribe archivos, ejecuta comandos, se conecta a servicios.
Cuatro: revisa su trabajo. ¿Pasó la prueba? ¿Carga la página?
Cinco: si algo está mal, vuelve atrás y repite.
Meta, plan, herramientas, revisar, repetir. Ese ciclo es todo el secreto. Los humanos trabajamos exactamente así. Solo que somos más lentos y nos cansamos.
El agente no se cansa. Pero tampoco sabe qué es importante para ti si no se lo dices. Por eso lo más valioso que tú aportas es la meta. Una meta vaga da un resultado vago. Una meta clara da algo que de verdad puedes usar.
Esta noche van a practicar cómo escribir metas claras.` }
},
/* 5 */ {
  sec: 3, min: 2,
  visual: '<div class="v-split"><div class="v-col"><h3><span class="en">The old way</span><span class="es">La forma antigua</span></h3><p><span class="en">Learn a language for years. Write every line. Or pay someone who can.</span><span class="es">Aprender un lenguaje por años. Escribir cada línea. O pagarle a alguien que sepa.</span></p></div><div class="v-col on"><h3><span class="en">The new way</span><span class="es">La forma nueva</span></h3><p><span class="en">Describe the outcome. Agents build the first version. You test, judge, and improve.</span><span class="es">Describe el resultado. Los agentes construyen la primera versión. Tú pruebas, juzgas y mejoras.</span></p></div></div>',
  en: { title: "From writing code to describing outcomes", body: "",
    notes: `Here's the shift.
For decades, if you wanted software, you had two options. Learn a programming language, spend years getting good, and write every line yourself. Or pay someone who already did that.
The new way: you describe the outcome you want. Agents write the first version. You test it, you judge it, you improve it.
The bottleneck is moving. It used to be "can you code?" Now it's becoming "do you know what's worth building, and can you tell whether it's good?"
[PAUSE]
Now, I want to be clear. That does not mean coding is dead. People who understand code will direct these systems better and catch more mistakes. If you love code, keep learning it. It becomes a superpower.
But the door is now open to a lot more people. Including everyone in this room.`,
    cut: "Drop the story on slide 7. On slides 6 and 7, read the two lists only." },
  es: { title: "De escribir código a describir resultados", body: "",
    notes: `Este es el cambio.
Durante décadas, si querías software, tenías dos opciones. Aprender un lenguaje de programación, pasar años practicando y escribir cada línea tú mismo. O pagarle a alguien que ya lo hubiera hecho.
La forma nueva: describes el resultado que quieres. Los agentes escriben la primera versión. Tú la pruebas, la juzgas y la mejoras.
El cuello de botella se está moviendo. Antes era "¿sabes programar?" Ahora se está volviendo "¿sabes qué vale la pena construir, y puedes saber si quedó bien?"
[PAUSA]
Quiero ser claro. Eso no significa que programar haya muerto. Las personas que entienden código van a dirigir estos sistemas mejor y van a detectar más errores. Si te gusta programar, sigue aprendiendo. Se vuelve un superpoder.
Pero la puerta ahora está abierta para mucha más gente. Incluyendo a todos en este salón.`,
    cut: "Omite la historia de la diapositiva 7. En las diapositivas 6 y 7, lee solo las dos listas." }
},
/* 6 */ {
  sec: 3, min: 2,
  visual: '<ul class="v-stack"><li><span class="en">Explaining a problem clearly</span><span class="es">Explicar un problema con claridad</span></li><li><span class="en">Knowing real people and their real problems</span><span class="es">Conocer a personas reales y sus problemas reales</span></li><li><span class="en">Judgment: is this good enough?</span><span class="es">Criterio: ¿esto está bien hecho?</span></li><li><span class="en">Testing and breaking things on purpose</span><span class="es">Probar y romper cosas a propósito</span></li><li><span class="en">Owning the result</span><span class="es">Hacerte responsable del resultado</span></li></ul>',
  en: { title: "What becomes more valuable", body: "",
    notes: `Let me ask you something. In five years, what do you think will matter more: memorizing programming syntax, or being able to explain a problem clearly?
[TAKE TWO OR THREE ANSWERS.]
Right. Here's my list of what becomes more valuable.
Explaining a problem clearly. If you can't say what you want, no agent can build it.
Knowing real people and their real problems. The AI doesn't know your school, your neighborhood, your part-time job. You do. That's an advantage.
Judgment. Looking at something and saying "this is good" or "this is not good enough yet."
Testing. Trying to break things on purpose before your users do.
And owning the result. When it's your name on it, it's your responsibility.
Notice none of these are about a specific tool. Tools change every few months. These skills last.` },
  es: { title: "Lo que se vuelve más valioso", body: "",
    notes: `Les pregunto algo. En cinco años, ¿qué creen que va a importar más: memorizar la sintaxis de un lenguaje, o saber explicar un problema con claridad?
[TOMA DOS O TRES RESPUESTAS.]
Exacto. Esta es mi lista de lo que se vuelve más valioso.
Explicar un problema con claridad. Si no puedes decir lo que quieres, ningún agente lo puede construir.
Conocer a personas reales y sus problemas reales. La IA no conoce tu escuela, tu barrio, tu trabajo de medio tiempo. Tú sí. Esa es una ventaja.
Criterio. Mirar algo y decir "esto está bien" o "esto todavía no es suficiente".
Probar. Intentar romper las cosas a propósito antes de que lo hagan tus usuarios.
Y hacerte responsable del resultado. Cuando tu nombre está en algo, es tu responsabilidad.
Fíjense que nada de esto depende de una herramienta específica. Las herramientas cambian cada pocos meses. Estas habilidades duran.` }
},
/* 7 */ {
  sec: 3, min: 2,
  visual: '<div class="v-split"><div class="v-col on"><h3><span class="en">Got cheaper</span><span class="es">Se volvió barato</span></h3><ul><li><span class="en">Building a first version</span><span class="es">Construir una primera versión</span></li><li><span class="en">Trying an idea this week</span><span class="es">Probar una idea esta semana</span></li><li><span class="en">Learning almost anything</span><span class="es">Aprender casi cualquier cosa</span></li></ul></div><div class="v-col"><h3><span class="en">Still hard</span><span class="es">Sigue siendo difícil</span></h3><ul><li><span class="en">Finding people who need it</span><span class="es">Encontrar a quien lo necesita</span></li><li><span class="en">Earning trust</span><span class="es">Ganarse la confianza</span></li><li><span class="en">Showing up every week</span><span class="es">Ser constante cada semana</span></li></ul></div></div>',
  en: { title: "Starting something at 19", body: "",
    notes: `So what does this mean if you're nineteen and you want to start something?
[POINT LEFT.] Some things got dramatically cheaper. Building a first version. Trying an idea this week instead of next year. Learning almost anything, because you have a tutor available all day.
[POINT RIGHT.] And some things did not get cheaper at all. Finding the people who actually need what you built. Earning their trust. Showing up every single week.
[YOUR STORY. KEEP IT HONEST AND SHORT. SUGGESTED:]
When I started building products, a first version took months and a team. Today I can describe a product in the morning and test it the same afternoon. That's real. But I'll be honest with you: not everything I've built has found customers. Building got easy. Finding the people who need it is still the hard part.
So start practicing the hard part now. Talk to people. Ask what annoys them. That's where good apps come from.` },
  es: { title: "Emprender a los 19", body: "",
    notes: `Entonces, ¿qué significa esto si tienes diecinueve años y quieres emprender?
[SEÑALA A LA IZQUIERDA.] Algunas cosas se volvieron muchísimo más baratas. Construir una primera versión. Probar una idea esta semana en lugar del próximo año. Aprender casi cualquier cosa, porque tienes un tutor disponible todo el día.
[SEÑALA A LA DERECHA.] Y otras cosas no se abarataron para nada. Encontrar a las personas que de verdad necesitan lo que construiste. Ganarte su confianza. Ser constante todas las semanas.
[TU HISTORIA. HONESTA Y CORTA. SUGERENCIA:]
Cuando empecé a construir productos, una primera versión tomaba meses y un equipo. Hoy puedo describir un producto en la mañana y probarlo esa misma tarde. Eso es real. Pero les voy a ser honesto: no todo lo que he construido ha encontrado clientes. Construir se volvió fácil. Encontrar a quien lo necesita sigue siendo lo difícil.
Así que empiecen a practicar la parte difícil desde ya. Hablen con la gente. Pregunten qué les molesta. De ahí salen las buenas apps.` }
},
/* 8 */ {
  sec: 4, min: 2, kind: "mcp",
  visual: '<svg class="v-mcp" viewBox="0 0 640 360" role="img" aria-label="An AI model connected through MCP to five tools"><g class="ln"><line x1="320" y1="180" x2="110" y2="60"/><line x1="320" y1="180" x2="530" y2="60"/><line x1="320" y1="180" x2="80" y2="250"/><line x1="320" y1="180" x2="560" y2="250"/><line x1="320" y1="180" x2="320" y2="330"/></g><circle cx="320" cy="180" r="74" class="hub"/><text x="320" y="172" class="hubt">AI</text><text x="320" y="200" class="hubs">MCP</text><g class="tool"><rect x="40" y="36" width="140" height="48" rx="10"/><text x="110" y="66"><tspan class="en">Calendar</tspan><tspan class="es">Calendario</tspan></text></g><g class="tool"><rect x="460" y="36" width="140" height="48" rx="10"/><text x="530" y="66">GitHub</text></g><g class="tool"><rect x="10" y="226" width="140" height="48" rx="10"/><text x="80" y="256"><tspan class="en">Database</tspan><tspan class="es">Base de datos</tspan></text></g><g class="tool"><rect x="490" y="226" width="140" height="48" rx="10"/><text x="560" y="256"><tspan class="en">Payments</tspan><tspan class="es">Pagos</tspan></text></g><g class="tool"><rect x="250" y="306" width="140" height="48" rx="10"/><text x="320" y="336">Email</text></g></svg>',
  en: { title: "MCP: a USB port for AI", body: "Model Context Protocol. One standard plug between AI and real tools.",
    notes: `Here's a term you're going to hear a lot: MCP. Model Context Protocol.
It's an open standard that Anthropic introduced in late 2024, and other major AI companies have adopted it since.
The simplest way to think about it: MCP is a USB port for AI.
[PAUSE]
Remember before USB, when every device had its own weird charger? Connecting an AI to a tool used to be like that. Every connection was custom built, one at a time.
MCP gives everyone one standard plug. Any AI that speaks MCP can connect to any tool that speaks MCP. Your calendar. A database. GitHub, where code lives. Payments. Email.
Build the plug once, and it works everywhere.`,
    cut: "Skip slide 9. Say the USB line, give the calendar example in one sentence, and move on." },
  es: { title: "MCP: un puerto USB para la IA", body: "Model Context Protocol. Un enchufe estándar entre la IA y las herramientas reales.",
    notes: `Este es un término que van a escuchar mucho: MCP. Model Context Protocol, o Protocolo de Contexto de Modelo.
Es un estándar abierto que Anthropic presentó a finales de 2024, y desde entonces otras grandes empresas de IA lo han adoptado.
La forma más fácil de entenderlo: MCP es un puerto USB para la IA.
[PAUSA]
¿Se acuerdan de cuando cada aparato tenía su propio cargador raro? Conectar una IA a una herramienta era así. Cada conexión se construía a la medida, una por una.
MCP le da a todos un mismo enchufe estándar. Cualquier IA que hable MCP se puede conectar a cualquier herramienta que hable MCP. Tu calendario. Una base de datos. GitHub, donde vive el código. Pagos. Correo.
Construyes el enchufe una vez y funciona en todas partes.`,
    cut: "Omite la diapositiva 9. Di la frase del USB, da el ejemplo del calendario en una oración y sigue." }
},
/* 9 */ {
  sec: 4, min: 2,
  visual: '<div class="v-split"><div class="v-col"><h3><span class="en">Without MCP</span><span class="es">Sin MCP</span></h3><p class="v-quote"><span class="en">"I can\'t see your calendar. Here\'s how you could book a room."</span><span class="es">"No puedo ver tu calendario. Así es como podrías reservar un salón."</span></p></div><div class="v-col on"><h3><span class="en">With MCP</span><span class="es">Con MCP</span></h3><p class="v-quote"><span class="en">"You\'re free at 4. I booked study room B and added it to your calendar."</span><span class="es">"Estás libre a las 4. Reservé el salón de estudio B y lo agregué a tu calendario."</span></p></div></div>',
  en: { title: "A brain in a jar vs a brain with hands", body: "Same AI. Now plugged in.",
    notes: `Let me make it concrete.
You ask an AI: "Find me a free hour tomorrow and book a study room."
Without MCP, it says: "I can't see your calendar. Here's how you could do it yourself."
With MCP, it reads your calendar, finds the free hour, books the room, and tells you it's done.
Same AI. Now plugged in. That's the difference between a brain in a jar and a brain with hands.
[PAUSE]
And here's the part I want you to remember: when an AI can act on your accounts, you decide what it's allowed to touch. More power means more responsibility. That's true for you tonight, and it's true for every company using this.` },
  es: { title: "Un cerebro en un frasco vs un cerebro con manos", body: "La misma IA. Ahora conectada.",
    notes: `Hagámoslo concreto.
Le pides a una IA: "Encuéntrame una hora libre mañana y resérvame un salón de estudio."
Sin MCP, te dice: "No puedo ver tu calendario. Así es como lo podrías hacer tú."
Con MCP, lee tu calendario, encuentra la hora libre, reserva el salón y te avisa que ya está.
La misma IA. Ahora conectada. Esa es la diferencia entre un cerebro en un frasco y un cerebro con manos.
[PAUSA]
Y esta es la parte que quiero que recuerden: cuando una IA puede actuar sobre tus cuentas, tú decides qué puede tocar. Más poder significa más responsabilidad. Eso aplica para ustedes esta noche y para cualquier empresa que use esto.` }
},
/* 10 */ {
  sec: 5, min: 2, kind: "org",
  visual: '<div class="v-org"><div class="o-top"><span class="en">You: the goal</span><span class="es">Tú: la meta</span></div><div class="o-mid">RinglyPro Architect<small><span class="en">chief orchestrator</span><span class="es">orquestador principal</span></small></div><div class="o-row"><div><span class="en">Triage</span><span class="es">Triaje</span></div><div><span class="en">Premortem</span><span class="es">Premortem</span></div><div><span class="en">Build</span><span class="es">Construcción</span></div><div><span class="en">Test</span><span class="es">Pruebas</span></div><div><span class="en">Deploy</span><span class="es">Despliegue</span></div><div><span class="en">AI Readiness</span><span class="es">Preparación para IA</span></div></div></div>',
  en: { title: "The DIGIT2AI Neural Intelligence Network", body: "An org chart staffed by specialized AI agents, built on MCP.",
    notes: `At DIGIT2AI, we took this idea and asked a bigger question: what if a whole company's org chart could be staffed with AI agents?
That's the DIGIT2AI Neural Intelligence Network. It's built on MCP.
Picture an org chart. At the top is a human. You. The person with the goal.
Under you is a chief orchestrator, the RinglyPro Architect.
And under the Architect are departments of specialized agents. One triages ideas and scores whether they're worth building. One runs a premortem: it imagines how the project could fail before we even start, so we can prevent it. One builds. One tests. One deploys. One helps business leaders get ready to adopt AI.
Each agent is good at one thing. Together they work like a company. Today that's {AGENTS}.`,
    cut: "Merge slides 11 and 12 into one sentence: one contractor, many specialists, running in a loop until it works. Then go straight to the reveal." },
  es: { title: "La Red de Inteligencia Neuronal de DIGIT2AI", body: "Un organigrama formado por agentes de IA especializados, construido sobre MCP.",
    notes: `En DIGIT2AI tomamos esta idea y nos hicimos una pregunta más grande: ¿y si el organigrama completo de una empresa pudiera estar formado por agentes de IA?
Eso es la Red de Inteligencia Neuronal de DIGIT2AI. Está construida sobre MCP.
Imaginen un organigrama. Arriba está un humano. Tú. La persona con la meta.
Debajo de ti hay un orquestador principal, el RinglyPro Architect.
Y debajo del Architect hay departamentos de agentes especializados. Uno hace el triaje de ideas y califica si vale la pena construirlas. Otro hace un premortem: imagina cómo podría fracasar el proyecto antes de empezar, para prevenirlo. Uno construye. Uno prueba. Uno despliega. Uno ayuda a líderes de empresas a prepararse para adoptar IA.
Cada agente es bueno en una sola cosa. Juntos trabajan como una empresa. Hoy eso es {AGENTS}.`,
    cut: "Une las diapositivas 11 y 12 en una oración: un contratista, muchos especialistas, trabajando en ciclo hasta que funcione. Luego pasa directo a la revelación." }
},
/* 11 */ {
  sec: 5, min: 1.5,
  visual: '<div class="v-flow"><div><span class="en">Your request</span><span class="es">Tu solicitud</span></div><div class="on">Architect<small><span class="en">splits it into tasks</span><span class="es">la divide en tareas</span></small></div><div><span class="en">Right specialist for each task</span><span class="es">El especialista correcto para cada tarea</span></div><div><span class="en">One finished system</span><span class="es">Un sistema terminado</span></div></div>',
  en: { title: "One contractor, many specialists", body: "",
    notes: `Think of the Architect like a general contractor building a house.
You don't hire one person to do the plumbing, the electrical, and the roof. You hire a contractor, and the contractor calls the right specialist at the right time.
When a request comes in, the Architect breaks it into tasks, sends each task to the right specialist, collects the work, and makes sure it all fits together.
You talk to one agent. A whole team does the work.` },
  es: { title: "Un contratista, muchos especialistas", body: "",
    notes: `Piensen en el Architect como el contratista general que construye una casa.
No contratas a una sola persona para la plomería, la electricidad y el techo. Contratas a un contratista, y él llama al especialista correcto en el momento correcto.
Cuando llega una solicitud, el Architect la divide en tareas, envía cada tarea al especialista indicado, recoge el trabajo y se asegura de que todo encaje.
Tú hablas con un solo agente. Un equipo completo hace el trabajo.` }
},
/* 12 */ {
  sec: 5, min: 1.5,
  visual: '<ol class="v-loop wide"><li><b><span class="en">Analyze</span><span class="es">Analizar</span></b></li><li><b><span class="en">Build</span><span class="es">Construir</span></b></li><li><b><span class="en">Test</span><span class="es">Probar</span></b></li><li><b><span class="en">Deploy</span><span class="es">Desplegar</span></b></li><li><b><span class="en">Review</span><span class="es">Revisar</span></b></li></ol><p class="v-cap"><span class="en">Something broken? Loop back and fix it until it works.</span><span class="es">¿Algo falla? Vuelve al inicio y corrígelo hasta que funcione.</span></p>',
  en: { title: "The build loop", body: "",
    notes: `And it runs in a loop. The same agent loop we saw earlier, scaled up to a whole software team.
Analyze the request. Build the code. Test it. Deploy it live on the internet. Review the logs.
If something is broken, it loops back and fixes it, automatically, until everything is green.
Goal, plan, tools, check, repeat. Same secret. Bigger team.` },
  es: { title: "El ciclo de construcción", body: "",
    notes: `Y funciona en ciclo. El mismo ciclo del agente que vimos antes, llevado a un equipo de software completo.
Analizar la solicitud. Construir el código. Probarlo. Desplegarlo en internet. Revisar los registros.
Si algo falla, vuelve al inicio y lo corrige, automáticamente, hasta que todo esté en verde.
Meta, plan, herramientas, revisar, repetir. El mismo secreto. Un equipo más grande.` }
},
/* 13 */ {
  sec: 5, min: 1,
  visual: '<ol class="v-pipe"><li><span class="en">You talk</span><span class="es">Hablas</span></li><li>SpeakUp<small><span class="en">transcribes EN / ES</span><span class="es">transcribe EN / ES</span></small></li><li>Factory<small><span class="en">agents build</span><span class="es">los agentes construyen</span></small></li><li>GitHub<small><span class="en">code is saved</span><span class="es">se guarda el código</span></small></li><li><span class="en">Live link</span><span class="es">Enlace en vivo</span><small><span class="en">on the internet</span><span class="es">en internet</span></small></li></ol>',
  en: { title: "From your voice to a live link", body: "",
    notes: `And the input doesn't even have to be typed.
We built a tool called SpeakUp. You talk through an idea, in English or in Spanish. It transcribes it, pulls out the decisions, and with one command sends it to the Factory.
You talk. SpeakUp transcribes. The Factory builds. The code is saved in GitHub. And it goes live on the internet with a link you can send to anyone.
That's the pipeline you're using tonight.` },
  es: { title: "De tu voz a un enlace en vivo", body: "",
    notes: `Y la idea ni siquiera tiene que estar escrita.
Construimos una herramienta llamada SpeakUp. Hablas sobre una idea, en inglés o en español. La transcribe, saca las decisiones y con un solo comando la envía a la Factory.
Tú hablas. SpeakUp transcribe. La Factory construye. El código se guarda en GitHub. Y se publica en internet con un enlace que puedes enviarle a quien quieras.
Ese es el flujo que van a usar esta noche.` }
},
/* 14 */ {
  sec: 5, min: 1, kind: "reveal",
  visual: '<div class="v-reveal"><p class="v-idea" id="ideaEcho"></p><div class="v-clock big" id="clockReveal" aria-live="polite"></div></div>',
  en: { title: "Remember the idea from the start?", body: "Let's open it.",
    notes: `Remember the idea from the beginning?
[READ THE IDEA ON SCREEN.]
The clock says it's been this long. Let's look.
[OPEN THE BUILD ON THE PROJECTOR.]
IF IT WORKS: click around, then call up the person who suggested the idea and ask: "What's missing?" That's the next prompt. That's how building works now.
IF IT FAILED: this is the best teaching moment of the night. Show the error and say: "This is exactly why the check step exists. And this is exactly why you are still needed." Then show the fallback version you built before the event.` },
  es: { title: "¿Recuerdan la idea del inicio?", body: "Vamos a abrirla.",
    notes: `¿Recuerdan la idea del principio?
[LEE LA IDEA EN PANTALLA.]
El reloj dice cuánto tiempo ha pasado. Veamos.
[ABRE LA CONSTRUCCIÓN EN EL PROYECTOR.]
SI FUNCIONA: haz clic por varias partes, luego llama a la persona que sugirió la idea y pregúntale: "¿Qué le falta?" Ese es el siguiente prompt. Así se construye ahora.
SI FALLÓ: este es el mejor momento de aprendizaje de la noche. Muestra el error y di: "Justamente por esto existe el paso de revisar. Y justamente por esto ustedes siguen siendo necesarios." Luego muestra la versión de respaldo que construiste antes del evento.` }
},
/* 15 */ {
  sec: 6, min: 1.5,
  visual: '<ul class="v-stack warn"><li><span class="en">It can be confidently wrong</span><span class="es">Puede equivocarse con total seguridad</span></li><li><span class="en">It only knows the context you give it</span><span class="es">Solo conoce el contexto que le das</span></li><li><span class="en">It cannot take responsibility</span><span class="es">No puede hacerse responsable</span></li><li><span class="en">It reflects the data it learned from, bias included</span><span class="es">Refleja los datos con los que aprendió, incluidos sus sesgos</span></li></ul>',
  en: { title: "What AI is bad at", body: "",
    notes: `Now the honest part. I'd be lying to you if I only showed you the magic.
AI is bad at some important things.
It can be confidently wrong. It can invent a fact, a quote, or a piece of software that doesn't exist, and say it like it's certain.
It only knows the context you give it. It doesn't know your users, your rules, or your situation unless you tell it.
It cannot take responsibility. If an app leaks someone's personal information, the AI doesn't answer for that. A person does.
And it reflects the data it learned from, including bias.
So the skill is not "trust the AI." The skill is "use the AI, and verify."`,
    cut: "Read only the four rules on slide 16, one line each." },
  es: { title: "En qué es mala la IA", body: "",
    notes: `Ahora la parte honesta. Les estaría mintiendo si solo les mostrara la magia.
La IA es mala en algunas cosas importantes.
Puede equivocarse con total seguridad. Puede inventar un dato, una cita o un programa que no existe, y decirlo como si fuera seguro.
Solo conoce el contexto que le das. No conoce a tus usuarios, tus reglas ni tu situación si no se lo dices.
No puede hacerse responsable. Si una app filtra la información personal de alguien, la IA no responde por eso. Responde una persona.
Y refleja los datos con los que aprendió, incluidos sus sesgos.
Así que la habilidad no es "confiar en la IA". La habilidad es "usar la IA y verificar".`,
    cut: "Lee solo las cuatro reglas de la diapositiva 16, una línea cada una." }
},
/* 16 */ {
  sec: 6, min: 1.5,
  visual: '<ol class="v-rules"><li><b><span class="en">Verify</span><span class="es">Verifica</span></b><span class="en">Test what it builds. Check the facts that matter.</span><span class="es">Prueba lo que construye. Revisa los datos importantes.</span></li><li><b><span class="en">Protect data</span><span class="es">Protege los datos</span></b><span class="en">No passwords or other people\'s private info in tools you don\'t control.</span><span class="es">Nada de contraseñas ni información privada de otros en herramientas que no controlas.</span></li><li><b><span class="en">Be honest about AI use</span><span class="es">Sé honesto sobre el uso de IA</span></b><span class="en">Follow your school\'s and employer\'s rules. Say when AI helped.</span><span class="es">Sigue las reglas de tu escuela y tu trabajo. Di cuándo te ayudó la IA.</span></li><li><b><span class="en">Own the result</span><span class="es">Responde por el resultado</span></b><span class="en">The AI is your team. You are the boss.</span><span class="es">La IA es tu equipo. Tú eres el jefe.</span></li></ol>',
  en: { title: "Four rules to take home", body: "",
    notes: `So here are four rules I want you to take home.
One: verify. Test what it builds. Check the facts that matter before you share them.
Two: protect data. Never paste passwords, other people's personal information, or anything private into a tool you don't control.
Three: be honest about how you used AI. At school and at work, follow the rules, and say when AI helped you.
Four: own the result. The AI is your team. You are the boss. And the boss is responsible.` },
  es: { title: "Cuatro reglas para llevar a casa", body: "",
    notes: `Estas son cuatro reglas que quiero que se lleven a casa.
Uno: verifica. Prueba lo que construye. Revisa los datos importantes antes de compartirlos.
Dos: protege los datos. Nunca pegues contraseñas, información personal de otras personas ni nada privado en una herramienta que no controlas.
Tres: sé honesto sobre cómo usaste la IA. En la escuela y en el trabajo, sigue las reglas y di cuándo te ayudó.
Cuatro: responde por el resultado. La IA es tu equipo. Tú eres el jefe. Y el jefe es el responsable.` }
},
/* 17 */ {
  sec: 7, min: 1.5,
  visual: '<div class="v-roles"><div><b><span class="en">Product Lead</span><span class="es">Líder de Producto</span></b><span class="en">Owns the idea. Decides what matters.</span><span class="es">Dueño de la idea. Decide qué importa.</span></div><div><b><span class="en">Prompt Writer</span><span class="es">Redactor de Prompts</span></b><span class="en">Turns it into a clear description.</span><span class="es">La convierte en una descripción clara.</span></div><div><b><span class="en">Tester</span><span class="es">Probador</span></b><span class="en">Tries to break it.</span><span class="es">Intenta romperla.</span></div><div><b><span class="en">Presenter</span><span class="es">Presentador</span></b><span class="en">Shows it to the room.</span><span class="es">La muestra al salón.</span></div></div>',
  en: { title: "Now you build one", body: "6 teams. 4 roles. 90 minutes. One live app per team.",
    notes: `Enough talking from me. Now you build.
You'll form six teams of four or five people. Every team has four roles.
The Product Lead owns the idea and decides what matters most.
The Prompt Writer turns the idea into a clear description for the Factory.
The Tester tries to break it. Your job is to find problems before we do.
And the Presenter shows it to the whole room at the end.
You have ninety minutes. The goal is not perfection. The goal is a working app, live on the internet, that you can send to your friends tonight.`,
    cut: "Skip explaining the roles out loud. They are on the join page. Go straight to the QR code." },
  es: { title: "Ahora construyes tú", body: "6 equipos. 4 roles. 90 minutos. Una app en vivo por equipo.",
    notes: `Ya hablé suficiente. Ahora construyen ustedes.
Van a formar seis equipos de cuatro o cinco personas. Cada equipo tiene cuatro roles.
El Líder de Producto es dueño de la idea y decide qué es lo más importante.
El Redactor de Prompts convierte la idea en una descripción clara para la Factory.
El Probador intenta romperla. Su trabajo es encontrar problemas antes que nosotros.
Y el Presentador la muestra a todo el salón al final.
Tienen noventa minutos. La meta no es la perfección. La meta es una app que funcione, en internet, que le puedan mandar a sus amigos esta misma noche.`,
    cut: "No expliques los roles en voz alta. Están en la página de unirse. Pasa directo al código QR." }
},
/* 18 */ {
  sec: 7, min: 1.5, kind: "join",
  visual: '<div class="v-join"><img src="../assets/qr-join.svg" alt="QR code to the event join page" width="320" height="320"><p class="v-url"></p></div>',
  en: { title: "Scan to join your team", body: "Pick your team, grab the prompt template, open the Factory.",
    notes: `Grab your phone and scan this code. It takes you to the event page.
Pick your team number, and you'll find the prompt template and the link to the Factory.
[WAIT UNTIL MOST PHONES ARE DOWN.]
Teams: let's count off around the room, one through six.
[COUNT OFF.]
Find your team. Your first fifteen minutes: pick your idea, assign your roles, and write your prompt.
Go.` },
  es: { title: "Escanea para unirte a tu equipo", body: "Escoge tu equipo, toma la plantilla del prompt, abre la Factory.",
    notes: `Saquen su teléfono y escaneen este código. Los lleva a la página del evento.
Escojan su número de equipo, y ahí van a encontrar la plantilla del prompt y el enlace a la Factory.
[ESPERA A QUE LA MAYORÍA BAJE EL TELÉFONO.]
Equipos: vamos a contar alrededor del salón, del uno al seis.
[CUENTA.]
Busquen a su equipo. Sus primeros quince minutos: escojan la idea, repartan los roles y escriban su prompt.
¡Vamos!` }
}
];
