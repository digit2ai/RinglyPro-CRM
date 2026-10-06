/* Build With AI — keynote content. One source for the slides (keynote/) and the word-for-word script (script/).
   ONE HOUR, ONE APP BUILT WITH THE ROOM: ideas are recorded, the AI proposes the best one, RinglyPro Architect builds it
   in VS Code while the talk continues, and the room opens and tests it before the close.
   Each slide: sec (section 1-9), min (target minutes; they add up to 60), visual (shared HTML), en/es: title, body, notes,
   cut (short version). {AGENTS} in notes is replaced with EVENT.agentCount. Cues in [BRACKETS] are stage directions, not spoken. */
window.SECTIONS = [
  { en: "Welcome", es: "Bienvenida" },
  { en: "Your ideas", es: "Sus ideas" },
  { en: "AI now", es: "La IA hoy" },
  { en: "The shift", es: "El cambio" },
  { en: "MCP", es: "MCP" },
  { en: "The network", es: "La red" },
  { en: "The reveal", es: "La revelación" },
  { en: "Reality check", es: "Pies en la tierra" },
  { en: "Your turn", es: "Tu turno" }
];

window.SLIDES = [
/* 1 */ {
  sec: 1, min: 3, kind: "title",
  visual: '<div class="v-title-meta"><span data-ev="presenter"></span><span data-ev="presenterRole"></span><span data-ev="date"></span></div><ul class="v-chips"><li><span class="en">AI agents that finish real work</span><span class="es">Agentes de IA que terminan trabajo real</span></li><li><span class="en">Voice AI in English and Spanish</span><span class="es">IA de voz en inglés y español</span></li><li><span class="en">Apps built with AI, from idea to live</span><span class="es">Apps construidas con IA, de la idea a producción</span></li></ul>',
  en: { title: "Build With AI", body: "One hour. One room. One app, built by all of us.",
    notes: `Good evening, everybody. My name is Manny Stagg. I've spent more than twenty-five years working in data infrastructure and enterprise architecture, and today I run DIGIT2AI.
[PAUSE]
What we do, in one sentence: we build AI systems that do real work for companies.
Three kinds of work. AI agents that take a task and finish it. Voice AI that answers the phone in English and in Spanish. And complete applications that go from an idea to a live product, built with AI.
Most of what we ship is built by a team of AI agents that I direct. Tonight I'm going to show you exactly how that works. Not with a video. Live, with you.`,
    cut: "Say your name, one sentence about DIGIT2AI, and move to slide 2." },
  es: { title: "Construye con IA", body: "Una hora. Un salón. Una app, construida entre todos.",
    notes: `Buenas noches a todos. Mi nombre es Manny Stagg. Llevo más de veinticinco años trabajando en infraestructura de datos y arquitectura empresarial, y hoy dirijo DIGIT2AI.
[PAUSA]
Lo que hacemos, en una oración: construimos sistemas de inteligencia artificial que hacen trabajo real para las empresas.
Tres tipos de trabajo. Agentes de IA que reciben una tarea y la terminan. IA de voz que contesta el teléfono en inglés y en español. Y aplicaciones completas que van de una idea a un producto en vivo, construidas con IA.
La mayor parte de lo que entregamos lo construye un equipo de agentes de IA que yo dirijo. Esta noche les voy a mostrar exactamente cómo funciona. No con un video. En vivo, con ustedes.`,
    cut: "Di tu nombre, una oración sobre DIGIT2AI y pasa a la diapositiva 2." }
},
/* 2 */ {
  sec: 1, min: 2,
  visual: '<ol class="v-pipe"><li><span class="en">Your ideas</span><span class="es">Sus ideas</span></li><li><span class="en">I record them</span><span class="es">Las grabo</span></li><li><span class="en">AI proposes the best one</span><span class="es">La IA propone la mejor</span><small><span class="en">we decide</span><span class="es">nosotros decidimos</span></small></li><li><span class="en">Agents build it</span><span class="es">Los agentes la construyen</span><small><span class="en">while I talk</span><span class="es">mientras hablo</span></small></li><li><span class="en">We open it live</span><span class="es">La abrimos en vivo</span></li></ol>',
  en: { title: "Tonight we build one app. Together.", body: "No teams. Your ideas, one build, live on the internet before we leave.",
    notes: `Here is the plan for the hour.
First, you give me ideas. Things you wish existed.
I record that conversation, on this phone, with an app we built, and with a small recorder I carry.
Then I ask the AI to read everything you said and propose the best idea to build tonight. We decide together.
Then I hand that idea to my AI architect on this laptop. And while it builds, I explain what is actually going on: what AI is today, what changed, what MCP is, and how a network of agents works.
Near the end we open the app together, and you tell me what is wrong with it.
[PAUSE]
One honest warning. This is live. It may not work the first time. If it breaks, you will see how we fix it, and that is worth more than a perfect demo.`,
    cut: "Read the five steps on screen and go straight to the ideas." },
  es: { title: "Esta noche construimos una app. Entre todos.", body: "Sin equipos. Sus ideas, una sola construcción, en internet antes de irnos.",
    notes: `Este es el plan para la hora.
Primero, ustedes me dan ideas. Cosas que les gustaría que existieran.
Yo grabo esa conversación, en este teléfono, con una aplicación que construimos nosotros, y con una pequeña grabadora que llevo conmigo.
Después le pido a la IA que lea todo lo que dijeron y proponga la mejor idea para construir esta noche. La decidimos juntos.
Luego le entrego esa idea a mi arquitecto de IA en esta laptop. Y mientras construye, les explico lo que de verdad está pasando: qué es la IA hoy, qué cambió, qué es MCP y cómo funciona una red de agentes.
Cerca del final abrimos la app juntos, y ustedes me dicen qué tiene mal.
[PAUSA]
Una advertencia honesta. Esto es en vivo. Puede que no funcione a la primera. Si falla, van a ver cómo lo arreglamos, y eso vale más que una demostración perfecta.`,
    cut: "Lee los cinco pasos en pantalla y pasa directo a las ideas." }
},
/* 3 */ {
  sec: 2, min: 7,
  visual: '<ul class="v-stack"><li><span class="en">Something that annoys you every week</span><span class="es">Algo que te molesta cada semana</span></li><li><span class="en">Something your school, job or club still does on paper</span><span class="es">Algo que tu escuela, trabajo o club todavía hace en papel</span></li><li><span class="en">Something you would send to your friends tonight</span><span class="es">Algo que le mandarías a tus amigos esta misma noche</span></li></ul><p class="v-cap"><span class="en">Small and clear wins: three features, no login.</span><span class="es">Gana lo pequeño y claro: tres funciones, sin inicio de sesión.</span></p>',
  en: { title: "Give me your ideas", body: "We are recording, so the AI can read what you said and choose.",
    notes: `[START THE RECORDING IN AUTODEV ON THE PHONE. START FIELDY. SAY OUT LOUD THAT YOU ARE RECORDING.]
I am recording from this moment. The only reason is so the AI can read your ideas. If you would rather not be recorded, just don't speak during this part. That is completely fine.
So. What do you wish existed? An app for your school, for your job, for your group of friends. Say it out loud.
[TAKE IDEAS FOR ABOUT SIX MINUTES. REPEAT EACH IDEA INTO THE PHONE IN ONE SENTENCE. THE MICROPHONE HEARS YOU MUCH BETTER THAN IT HEARS THE ROOM.]
[FOR EACH IDEA ASK ONE QUESTION: "Who is it for?" or "What is the first thing it should do?"]
[IF THE ROOM IS QUIET: read two ideas from your backup list and ask which one they would use.]
That is plenty. Thank you. Now let's see what the AI makes of it.`,
    cut: "Take four ideas instead of ten. Two minutes, then stop the recording." },
  es: { title: "Denme sus ideas", body: "Estamos grabando, para que la IA lea lo que dijeron y escoja.",
    notes: `[INICIA LA GRABACIÓN EN AUTODEV EN EL TELÉFONO. INICIA FIELDY. DI EN VOZ ALTA QUE ESTÁS GRABANDO.]
Estoy grabando desde este momento. La única razón es que la IA pueda leer sus ideas. Si prefieren no quedar grabados, simplemente no hablen durante esta parte. No hay ningún problema.
Entonces. ¿Qué les gustaría que existiera? Una app para su escuela, para su trabajo, para su grupo de amigos. Díganlo en voz alta.
[TOMA IDEAS DURANTE UNOS SEIS MINUTOS. REPITE CADA IDEA AL TELÉFONO EN UNA ORACIÓN. EL MICRÓFONO TE ESCUCHA MUCHO MEJOR A TI QUE AL SALÓN.]
[A CADA IDEA HAZLE UNA PREGUNTA: "¿Para quién es?" o "¿Qué es lo primero que debería hacer?"]
[SI EL PÚBLICO NO PARTICIPA: lee dos ideas de tu lista de respaldo y pregunta cuál usarían.]
Con eso es suficiente. Gracias. Ahora veamos qué hace la IA con todo esto.`,
    cut: "Toma cuatro ideas en vez de diez. Dos minutos, y detén la grabación." }
},
/* 4 */ {
  sec: 2, min: 5, kind: "hook",
  visual: '<div class="v-hook"><label for="ideaInput"><span class="en">The idea we are building</span><span class="es">La idea que vamos a construir</span></label><input id="ideaInput" type="text" autocomplete="off" placeholder="Type the idea here"><button class="v-btn" id="startClock" type="button"><span class="en">Start build clock</span><span class="es">Iniciar reloj de construcción</span></button><div class="v-clock" id="clockHook" aria-live="polite"></div></div>',
  en: { title: "The AI proposes one. We build it.", body: "Small, clear, and something we can test tonight.",
    notes: `[STOP THE RECORDING. OPEN THE MEETING IN AUTODEV.]
Now I ask the AI a simple question: of everything we said, which idea is the best one to build in twenty minutes?
I am giving it rules. Small. Three features. No logins. No payments. Nobody's personal data. It has to work on a phone.
[ASK FOR THE SUMMARY AND THE BEST IDEA. READ THE ANSWER OUT LOUD. IF THE TRANSCRIPT IS POOR, USE THE FIELDY SUMMARY, OR CHOOSE FROM YOUR OWN NOTES AND SAY THAT YOU DID.]
Do you agree with that choice?
[QUICK SHOW OF HANDS. IF THE ROOM PREFERS ANOTHER IDEA THAT IS JUST AS SMALL, TAKE THE ROOM'S.]
Notice what just happened. The AI proposed. We decided. Keep that in mind.
[TYPE THE IDEA INTO THE SLIDE.]
Now I give it to RinglyPro Architect, in VS Code with Claude. This is exactly how I work every day.
[PASTE THE BUILD PROMPT IN VS CODE AND SEND IT. PRESS "START BUILD CLOCK".]
From this moment a team of agents is planning it, writing it, testing it and publishing it. I am not going to touch the keyboard. So let's talk about what is happening in there.`,
    cut: "Skip the vote. Read the chosen idea, send it, start the clock." },
  es: { title: "La IA propone una. La construimos.", body: "Pequeña, clara y algo que podamos probar esta noche.",
    notes: `[DETÉN LA GRABACIÓN. ABRE LA REUNIÓN EN AUTODEV.]
Ahora le hago a la IA una pregunta sencilla: de todo lo que dijimos, ¿cuál es la mejor idea para construir en veinte minutos?
Le doy reglas. Pequeña. Tres funciones. Sin inicio de sesión. Sin pagos. Sin datos personales de nadie. Tiene que funcionar en un teléfono.
[PIDE EL RESUMEN Y LA MEJOR IDEA. LEE LA RESPUESTA EN VOZ ALTA. SI LA TRANSCRIPCIÓN SALIÓ MAL, USA EL RESUMEN DE FIELDY, O ESCOGE DE TUS PROPIAS NOTAS Y DILO.]
¿Están de acuerdo con esa elección?
[MANOS ARRIBA, RÁPIDO. SI EL PÚBLICO PREFIERE OTRA IDEA IGUAL DE PEQUEÑA, TOMA LA DEL PÚBLICO.]
Fíjense en lo que acaba de pasar. La IA propuso. Nosotros decidimos. Guarden eso.
[ESCRIBE LA IDEA EN LA DIAPOSITIVA.]
Ahora se la entrego a RinglyPro Architect, en VS Code con Claude. Así es exactamente como trabajo todos los días.
[PEGA EL PROMPT DE CONSTRUCCIÓN EN VS CODE Y ENVÍALO. PRESIONA "INICIAR RELOJ DE CONSTRUCCIÓN".]
Desde este momento un equipo de agentes la está planeando, escribiendo, probando y publicando. Yo no voy a tocar el teclado. Así que hablemos de lo que está pasando ahí dentro.`,
    cut: "Omite la votación. Lee la idea escogida, envíala e inicia el reloj." }
},
/* 5 */ {
  sec: 3, min: 2.5,
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
/* 6 */ {
  sec: 3, min: 2.5,
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
Tonight you already did that. Your ideas became the goal.` },
  es: { title: "Cómo funciona un agente", body: "Un ciclo. Ese es todo el secreto.",
    notes: `Entonces, ¿cómo funciona un agente? Es más simple de lo que creen. Cinco pasos.
Uno: recibe una meta. "Constrúyeme un planificador de estudio."
Dos: hace un plan. Necesito una página, un lugar para guardar datos, quizás un inicio de sesión.
Tres: usa herramientas. Escribe archivos, ejecuta comandos, se conecta a servicios.
Cuatro: revisa su trabajo. ¿Pasó la prueba? ¿Carga la página?
Cinco: si algo está mal, vuelve atrás y repite.
Meta, plan, herramientas, revisar, repetir. Ese ciclo es todo el secreto. Los humanos trabajamos exactamente así. Solo que somos más lentos y nos cansamos.
El agente no se cansa. Pero tampoco sabe qué es importante para ti si no se lo dices. Por eso lo más valioso que tú aportas es la meta. Una meta vaga da un resultado vago. Una meta clara da algo que de verdad puedes usar.
Esta noche ya lo hicieron. Sus ideas se convirtieron en la meta.` }
},
/* 7 */ {
  sec: 4, min: 2,
  visual: '<div class="v-split"><div class="v-col"><h3><span class="en">The old way</span><span class="es">La forma antigua</span></h3><p><span class="en">Learn a language for years. Write every line. Or pay someone who can.</span><span class="es">Aprender un lenguaje por años. Escribir cada línea. O pagarle a alguien que sepa.</span></p></div><div class="v-col on"><h3><span class="en">The new way</span><span class="es">La forma nueva</span></h3><p><span class="en">Describe the outcome. Agents build the first version. You test, judge, and improve.</span><span class="es">Describe el resultado. Los agentes construyen la primera versión. Tú pruebas, juzgas y mejoras.</span></p></div></div>',
  en: { title: "From writing code to describing outcomes", body: "",
    notes: `Here's the shift.
For decades, if you wanted software, you had two options. Learn a programming language, spend years getting good, and write every line yourself. Or pay someone who already did that.
The new way: you describe the outcome you want. Agents write the first version. You test it, you judge it, you improve it.
The bottleneck is moving. It used to be "can you code?" Now it's becoming "do you know what's worth building, and can you tell whether it's good?"
[PAUSE]
Now, I want to be clear. That does not mean coding is dead. People who understand code will direct these systems better and catch more mistakes. If you love code, keep learning it. It becomes a superpower.
But the door is now open to a lot more people. Including everyone in this room.`,
    cut: "Drop the story on slide 9. On slides 8 and 9, read the two lists only." },
  es: { title: "De escribir código a describir resultados", body: "",
    notes: `Este es el cambio.
Durante décadas, si querías software, tenías dos opciones. Aprender un lenguaje de programación, pasar años practicando y escribir cada línea tú mismo. O pagarle a alguien que ya lo hubiera hecho.
La forma nueva: describes el resultado que quieres. Los agentes escriben la primera versión. Tú la pruebas, la juzgas y la mejoras.
El cuello de botella se está moviendo. Antes era "¿sabes programar?" Ahora se está volviendo "¿sabes qué vale la pena construir, y puedes saber si quedó bien?"
[PAUSA]
Quiero ser claro. Eso no significa que programar haya muerto. Las personas que entienden código van a dirigir estos sistemas mejor y van a detectar más errores. Si te gusta programar, sigue aprendiendo. Se vuelve un superpoder.
Pero la puerta ahora está abierta para mucha más gente. Incluyendo a todos en este salón.`,
    cut: "Omite la historia de la diapositiva 9. En las diapositivas 8 y 9, lee solo las dos listas." }
},
/* 8 */ {
  sec: 4, min: 1.5,
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
/* 9 */ {
  sec: 4, min: 1.5,
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
/* 10 */ {
  sec: 5, min: 2, kind: "mcp",
  visual: '<svg class="v-mcp" viewBox="0 0 640 360" role="img" aria-label="An AI model connected through MCP to five tools"><g class="ln"><line x1="320" y1="180" x2="110" y2="60"/><line x1="320" y1="180" x2="530" y2="60"/><line x1="320" y1="180" x2="80" y2="250"/><line x1="320" y1="180" x2="560" y2="250"/><line x1="320" y1="180" x2="320" y2="330"/></g><circle cx="320" cy="180" r="74" class="hub"/><text x="320" y="172" class="hubt">AI</text><text x="320" y="200" class="hubs">MCP</text><g class="tool"><rect x="40" y="36" width="140" height="48" rx="10"/><text x="110" y="66"><tspan class="en">Calendar</tspan><tspan class="es">Calendario</tspan></text></g><g class="tool"><rect x="460" y="36" width="140" height="48" rx="10"/><text x="530" y="66">GitHub</text></g><g class="tool"><rect x="10" y="226" width="140" height="48" rx="10"/><text x="80" y="256"><tspan class="en">Database</tspan><tspan class="es">Base de datos</tspan></text></g><g class="tool"><rect x="490" y="226" width="140" height="48" rx="10"/><text x="560" y="256"><tspan class="en">Payments</tspan><tspan class="es">Pagos</tspan></text></g><g class="tool"><rect x="250" y="306" width="140" height="48" rx="10"/><text x="320" y="336">Email</text></g></svg>',
  en: { title: "MCP: a USB port for AI", body: "Model Context Protocol. One standard plug between AI and real tools.",
    notes: `Here's a term you're going to hear a lot: MCP. Model Context Protocol.
It's an open standard that Anthropic introduced in late 2024, and other major AI companies have adopted it since.
The simplest way to think about it: MCP is a USB port for AI.
[PAUSE]
Remember before USB, when every device had its own weird charger? Connecting an AI to a tool used to be like that. Every connection was custom built, one at a time.
MCP gives everyone one standard plug. Any AI that speaks MCP can connect to any tool that speaks MCP. Your calendar. A database. GitHub, where code lives. Payments. Email.
Build the plug once, and it works everywhere.`,
    cut: "Skip slide 11. Say the USB line, give the calendar example in one sentence, and move on." },
  es: { title: "MCP: un puerto USB para la IA", body: "Model Context Protocol. Un enchufe estándar entre la IA y las herramientas reales.",
    notes: `Este es un término que van a escuchar mucho: MCP. Model Context Protocol, o Protocolo de Contexto de Modelo.
Es un estándar abierto que Anthropic presentó a finales de 2024, y desde entonces otras grandes empresas de IA lo han adoptado.
La forma más fácil de entenderlo: MCP es un puerto USB para la IA.
[PAUSA]
¿Se acuerdan de cuando cada aparato tenía su propio cargador raro? Conectar una IA a una herramienta era así. Cada conexión se construía a la medida, una por una.
MCP le da a todos un mismo enchufe estándar. Cualquier IA que hable MCP se puede conectar a cualquier herramienta que hable MCP. Tu calendario. Una base de datos. GitHub, donde vive el código. Pagos. Correo.
Construyes el enchufe una vez y funciona en todas partes.`,
    cut: "Omite la diapositiva 11. Di la frase del USB, da el ejemplo del calendario en una oración y sigue." }
},
/* 11 */ {
  sec: 5, min: 2,
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
/* 12 */ {
  sec: 6, min: 2, kind: "org",
  visual: '<div class="v-org"><div class="o-top"><span class="en">You: the goal</span><span class="es">Tú: la meta</span></div><div class="o-mid">RinglyPro Architect<small><span class="en">chief orchestrator</span><span class="es">orquestador principal</span></small></div><div class="o-row"><div><span class="en">Triage</span><span class="es">Triaje</span></div><div><span class="en">Premortem</span><span class="es">Premortem</span></div><div><span class="en">Build</span><span class="es">Construcción</span></div><div><span class="en">Test</span><span class="es">Pruebas</span></div><div><span class="en">Deploy</span><span class="es">Despliegue</span></div><div><span class="en">AI Readiness</span><span class="es">Preparación para IA</span></div></div></div>',
  en: { title: "The DIGIT2AI Neural Intelligence Network", body: "An org chart staffed by specialized AI agents, built on MCP.",
    notes: `At DIGIT2AI, we took this idea and asked a bigger question: what if a whole company's org chart could be staffed with AI agents?
That's the DIGIT2AI Neural Intelligence Network. It's built on MCP.
Picture an org chart. At the top is a human. You. The person with the goal.
Under you is a chief orchestrator, the RinglyPro Architect.
And under the Architect are departments of specialized agents. One triages ideas and scores whether they're worth building. One runs a premortem: it imagines how the project could fail before we even start, so we can prevent it. One builds. One tests. One deploys. One helps business leaders get ready to adopt AI.
Each agent is good at one thing. Together they work like a company. Today that's {AGENTS}.`,
    cut: "Merge slides 13 and 14 into one sentence: one contractor, many specialists, running in a loop until it works. Then go to slide 15." },
  es: { title: "La Red de Inteligencia Neuronal de DIGIT2AI", body: "Un organigrama formado por agentes de IA especializados, construido sobre MCP.",
    notes: `En DIGIT2AI tomamos esta idea y nos hicimos una pregunta más grande: ¿y si el organigrama completo de una empresa pudiera estar formado por agentes de IA?
Eso es la Red de Inteligencia Neuronal de DIGIT2AI. Está construida sobre MCP.
Imaginen un organigrama. Arriba está un humano. Tú. La persona con la meta.
Debajo de ti hay un orquestador principal, el RinglyPro Architect.
Y debajo del Architect hay departamentos de agentes especializados. Uno hace el triaje de ideas y califica si vale la pena construirlas. Otro hace un premortem: imagina cómo podría fracasar el proyecto antes de empezar, para prevenirlo. Uno construye. Uno prueba. Uno despliega. Uno ayuda a líderes de empresas a prepararse para adoptar IA.
Cada agente es bueno en una sola cosa. Juntos trabajan como una empresa. Hoy eso es {AGENTS}.`,
    cut: "Une las diapositivas 13 y 14 en una oración: un contratista, muchos especialistas, trabajando en ciclo hasta que funcione. Luego pasa a la diapositiva 15." }
},
/* 13 */ {
  sec: 6, min: 1.5,
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
/* 14 */ {
  sec: 6, min: 1,
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
/* 15 */ {
  sec: 6, min: 1.5,
  visual: '<ol class="v-pipe"><li><span class="en">You talked</span><span class="es">Ustedes hablaron</span></li><li><span class="en">Recording</span><span class="es">Grabación</span><small><span class="en">turned into text</span><span class="es">convertida en texto</span></small></li><li><span class="en">Best idea</span><span class="es">La mejor idea</span><small><span class="en">AI proposed, we decided</span><span class="es">la IA propuso, decidimos</span></small></li><li>RinglyPro Architect<small>VS Code + Claude</small></li><li>GitHub<small><span class="en">code is saved</span><span class="es">se guarda el código</span></small></li><li><span class="en">Live link</span><span class="es">Enlace en vivo</span><small><span class="en">on the internet</span><span class="es">en internet</span></small></li></ol>',
  en: { title: "What is happening on my laptop right now", body: "",
    notes: `This is the exact path your idea took tonight.
You talked. The recording became text. The AI read that text and proposed the best idea, and we decided.
I gave it to the Architect, in VS Code, running on Claude.
Right now, agents are writing files, running tests, and fixing what fails. The code is saved in GitHub. And when it is ready, it is published on the internet with a link you can open on your phone.
Nobody in this room typed a line of code tonight.` },
  es: { title: "Lo que está pasando en mi laptop ahora mismo", body: "",
    notes: `Este es el camino exacto que recorrió su idea esta noche.
Ustedes hablaron. La grabación se convirtió en texto. La IA leyó ese texto y propuso la mejor idea, y nosotros decidimos.
Se la entregué al Architect, en VS Code, funcionando con Claude.
Ahora mismo hay agentes escribiendo archivos, corriendo pruebas y corrigiendo lo que falla. El código se guarda en GitHub. Y cuando está listo, se publica en internet con un enlace que pueden abrir en su teléfono.
Nadie en este salón escribió una sola línea de código esta noche.` }
},
/* 16 */ {
  sec: 6, min: 3,
  visual: '<ul class="v-stack"><li><span class="en">Speed: a first version the same day</span><span class="es">Velocidad: una primera versión el mismo día</span></li><li><span class="en">Cost: one person can direct the work of a team</span><span class="es">Costo: una persona puede dirigir el trabajo de un equipo</span></li><li><span class="en">Language: you build in plain English or Spanish</span><span class="es">Idioma: construyes en español o inglés normal</span></li><li><span class="en">Control: a person approves, tests and answers for it</span><span class="es">Control: una persona aprueba, prueba y responde</span></li><li><span class="en">Ownership: real code, saved, that you can change</span><span class="es">Propiedad: código real, guardado, que puedes cambiar</span></li></ul>',
  en: { title: "Why build this way", body: "",
    notes: `So why does this way of building matter? Five reasons.
Speed. A first version used to take weeks or months. Now you can have one the same day, sometimes the same hour. You find out fast whether the idea is any good.
Cost. One person who knows what they want can direct the work that used to need a whole team. That opens the door to people who could never have paid for one.
Language. You build in plain English or plain Spanish. The skill is explaining clearly, not memorizing syntax.
Control. Nothing here ships by itself. A person approves the plan, a person tests the result, and a person answers for it.
And ownership. What comes out is real code, saved in a real repository. It is not locked inside a tool. You can read it, change it, and take it with you.
[PAUSE]
What it does not give you: a customer. Someone still has to need what you built.`,
    cut: "Read the five lines on screen, one sentence each." },
  es: { title: "Por qué construir así", body: "",
    notes: `Entonces, ¿por qué importa esta forma de construir? Cinco razones.
Velocidad. Una primera versión tomaba semanas o meses. Hoy puedes tenerla el mismo día, a veces en la misma hora. Descubres rápido si la idea sirve.
Costo. Una persona que sabe lo que quiere puede dirigir el trabajo que antes necesitaba un equipo completo. Eso le abre la puerta a gente que nunca habría podido pagar uno.
Idioma. Construyes en español o en inglés normal. La habilidad es explicar con claridad, no memorizar sintaxis.
Control. Aquí nada se publica solo. Una persona aprueba el plan, una persona prueba el resultado y una persona responde por él.
Y propiedad. Lo que sale es código real, guardado en un repositorio real. No queda encerrado dentro de una herramienta. Lo puedes leer, cambiar y llevártelo.
[PAUSA]
Lo que no te da: un cliente. Alguien todavía tiene que necesitar lo que construiste.`,
    cut: "Lee las cinco líneas en pantalla, una oración por cada una." }
},
/* 17 */ {
  sec: 7, min: 5, kind: "reveal",
  visual: '<div class="v-reveal"><p class="v-idea" id="ideaEcho"></p><div class="v-clock big" id="clockReveal" aria-live="polite"></div></div>',
  en: { title: "Remember the idea you chose?", body: "Let's open it.",
    notes: `Remember the idea you chose?
[READ THE IDEA ON SCREEN.]
The clock says how long the agents have been working. Let's look.
[SWITCH TO VS CODE. SHOW THE LAST LINES: THE TESTS, THE PUSH, THE LIVE LINK. OPEN THE LINK ON THE PROJECTOR.]
IF IT WORKS: click through every feature slowly. Then put the link on screen so everyone opens it on their own phone.
IF IT IS STILL BUILDING: show what it is doing right now and read the last step out loud. Go to the reality check slides and come back here afterwards.
IF IT FAILED: this is the best teaching moment of the night. Show the error and say: "This is exactly why the check step exists. And this is exactly why you are still needed." Then open the fallback app you built before the event, and say that it is the fallback.`,
    cut: "Open the link, click two things, and move on." },
  es: { title: "¿Recuerdan la idea que escogieron?", body: "Vamos a abrirla.",
    notes: `¿Recuerdan la idea que escogieron?
[LEE LA IDEA EN PANTALLA.]
El reloj dice cuánto tiempo llevan trabajando los agentes. Veamos.
[CAMBIA A VS CODE. MUESTRA LAS ÚLTIMAS LÍNEAS: LAS PRUEBAS, EL PUSH, EL ENLACE EN VIVO. ABRE EL ENLACE EN EL PROYECTOR.]
SI FUNCIONA: recorre cada función con calma. Luego pon el enlace en pantalla para que todos la abran en su propio teléfono.
SI TODAVÍA ESTÁ CONSTRUYENDO: muestra lo que está haciendo en este momento y lee el último paso en voz alta. Pasa a las diapositivas de "con los pies en la tierra" y vuelve aquí después.
SI FALLÓ: este es el mejor momento de aprendizaje de la noche. Muestra el error y di: "Justamente por esto existe el paso de revisar. Y justamente por esto ustedes siguen siendo necesarios." Luego abre la app de respaldo que construiste antes del evento, y di que es el respaldo.`,
    cut: "Abre el enlace, haz clic en dos cosas y sigue." }
},
/* 18 */ {
  sec: 7, min: 6,
  visual: '<ol class="v-loop wide"><li><b><span class="en">Try it</span><span class="es">Pruébala</span></b></li><li><b><span class="en">Say what is wrong</span><span class="es">Di qué está mal</span></b></li><li><b><span class="en">Ask for one change</span><span class="es">Pide un cambio</span></b></li><li><b><span class="en">Check again</span><span class="es">Revisa otra vez</span></b></li></ol><p class="v-cap"><span class="en">This is the job now: test, judge, ask clearly.</span><span class="es">Este es el trabajo ahora: probar, juzgar, pedir con claridad.</span></p>',
  en: { title: "Now break it", body: "Tell me what is wrong. We fix one thing, live.",
    notes: `Open it on your phone. Try to break it.
What is missing? What is confusing? What is simply wrong?
[TAKE THREE OR FOUR ANSWERS. PICK ONE CHANGE THAT IS SMALL AND VISIBLE.]
Good. I am going to ask for that change in one sentence.
[TYPE THE CHANGE IN VS CODE AND SEND IT.]
While it works, notice what you just did. You tested it. You judged it. You said clearly what you wanted. That is the list from earlier, the skills that are getting more valuable. You just used all three.
[WHEN THE CHANGE IS LIVE, REFRESH THE PAGE ON THE PROJECTOR.]
IF THE CHANGE DOES NOT FINISH IN TIME: say so plainly, and tell them it will be on the event page tonight.`,
    cut: "Take the feedback, send the change, and do not wait for it. Show it at the close if it is ready." },
  es: { title: "Ahora rómpanla", body: "Díganme qué está mal. Arreglamos una cosa, en vivo.",
    notes: `Ábranla en su teléfono. Intenten romperla.
¿Qué le falta? ¿Qué confunde? ¿Qué está sencillamente mal?
[TOMA TRES O CUATRO RESPUESTAS. ESCOGE UN CAMBIO PEQUEÑO Y VISIBLE.]
Bien. Voy a pedir ese cambio en una sola oración.
[ESCRIBE EL CAMBIO EN VS CODE Y ENVÍALO.]
Mientras trabaja, fíjense en lo que acaban de hacer. La probaron. La juzgaron. Dijeron con claridad lo que querían. Esa es la lista de antes, las habilidades que se vuelven más valiosas. Acaban de usar las tres.
[CUANDO EL CAMBIO ESTÉ EN VIVO, RECARGA LA PÁGINA EN EL PROYECTOR.]
SI EL CAMBIO NO TERMINA A TIEMPO: dilo con claridad, y diles que va a estar en la página del evento esta noche.`,
    cut: "Toma los comentarios, envía el cambio y no lo esperes. Muéstralo en el cierre si está listo." }
},
/* 19 */ {
  sec: 8, min: 2.5,
  visual: '<ul class="v-stack warn"><li><span class="en">It can be confidently wrong</span><span class="es">Puede equivocarse con total seguridad</span></li><li><span class="en">It only knows the context you give it</span><span class="es">Solo conoce el contexto que le das</span></li><li><span class="en">It cannot take responsibility</span><span class="es">No puede hacerse responsable</span></li><li><span class="en">It reflects the data it learned from, bias included</span><span class="es">Refleja los datos con los que aprendió, incluidos sus sesgos</span></li></ul>',
  en: { title: "What AI is bad at", body: "",
    notes: `Now the honest part. I'd be lying to you if I only showed you the magic.
AI is bad at some important things.
It can be confidently wrong. It can invent a fact, a quote, or a piece of software that doesn't exist, and say it like it's certain.
It only knows the context you give it. It doesn't know your users, your rules, or your situation unless you tell it.
It cannot take responsibility. If an app leaks someone's personal information, the AI doesn't answer for that. A person does.
And it reflects the data it learned from, including bias.
So the skill is not "trust the AI." The skill is "use the AI, and verify."`,
    cut: "Read only the four rules on slide 20, one line each." },
  es: { title: "En qué es mala la IA", body: "",
    notes: `Ahora la parte honesta. Les estaría mintiendo si solo les mostrara la magia.
La IA es mala en algunas cosas importantes.
Puede equivocarse con total seguridad. Puede inventar un dato, una cita o un programa que no existe, y decirlo como si fuera seguro.
Solo conoce el contexto que le das. No conoce a tus usuarios, tus reglas ni tu situación si no se lo dices.
No puede hacerse responsable. Si una app filtra la información personal de alguien, la IA no responde por eso. Responde una persona.
Y refleja los datos con los que aprendió, incluidos sus sesgos.
Así que la habilidad no es "confiar en la IA". La habilidad es "usar la IA y verificar".`,
    cut: "Lee solo las cuatro reglas de la diapositiva 20, una línea cada una." }
},
/* 20 */ {
  sec: 8, min: 2.5,
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
/* 21 */ {
  sec: 9, min: 1.5,
  visual: '<ol class="v-rules"><li><b><span class="en">Ask</span><span class="es">Pregunta</span></b><span class="en">Talk to five people about a problem they really have.</span><span class="es">Habla con cinco personas sobre un problema que de verdad tienen.</span></li><li><b><span class="en">Write</span><span class="es">Escribe</span></b><span class="en">Describe the app in three features.</span><span class="es">Describe la app en tres funciones.</span></li><li><b><span class="en">Build</span><span class="es">Construye</span></b><span class="en">Get a first version with an AI tool.</span><span class="es">Saca una primera versión con una herramienta de IA.</span></li><li><b><span class="en">Show</span><span class="es">Muestra</span></b><span class="en">Test it, then put it in front of those five people.</span><span class="es">Pruébala y ponla frente a esas cinco personas.</span></li></ol>',
  en: { title: "Your turn, this week", body: "",
    notes: `You watched it happen once. Now it is your turn, and you do not need me for it.
This week, four steps.
Ask. Talk to five people about a problem they really have. Not a problem you imagine they have.
Write. Describe the app in three features. Only three.
Build. Get a first version with an AI tool. The template is on the event page.
Show. Test it yourself, then put it in front of those same five people and watch what they do.
That last step is the one most people skip. Do not skip it.`,
    cut: "Read the four words and one line each." },
  es: { title: "Tu turno, esta semana", body: "",
    notes: `Lo vieron pasar una vez. Ahora les toca a ustedes, y para eso no me necesitan.
Esta semana, cuatro pasos.
Pregunta. Habla con cinco personas sobre un problema que de verdad tienen. No un problema que tú te imaginas que tienen.
Escribe. Describe la app en tres funciones. Solo tres.
Construye. Saca una primera versión con una herramienta de IA. La plantilla está en la página del evento.
Muestra. Pruébala tú mismo, y luego ponla frente a esas mismas cinco personas y observa lo que hacen.
Ese último paso es el que casi todos se saltan. No se lo salten.`,
    cut: "Lee las cuatro palabras y una línea por cada una." }
},
/* 22 */ {
  sec: 9, min: 2.5, kind: "join",
  visual: '<div class="v-join"><img src="../assets/qr-join.svg" alt="QR code to the event page" width="320" height="320"><p class="v-url"></p></div>',
  en: { title: "Scan before you leave", body: "The app we built tonight, the prompt template, and how to build your own.",
    notes: `Take out your phone and scan this code. It opens the event page.
There you will find the link to the app we built tonight, the template to write your own prompt, and the four rules.
[WAIT UNTIL MOST PHONES ARE DOWN.]
One hour ago this app did not exist. It started as something one of you said out loud.
That is the whole message. The distance between an idea and a working product has never been this short. What you do with that is up to you.
Thank you.
[GROUP PHOTO.]` },
  es: { title: "Escanea antes de irte", body: "La app que construimos esta noche, la plantilla del prompt y cómo construir la tuya.",
    notes: `Saquen su teléfono y escaneen este código. Abre la página del evento.
Ahí van a encontrar el enlace a la app que construimos esta noche, la plantilla para escribir su propio prompt y las cuatro reglas.
[ESPERA A QUE LA MAYORÍA BAJE EL TELÉFONO.]
Hace una hora esta app no existía. Empezó como algo que uno de ustedes dijo en voz alta.
Ese es todo el mensaje. La distancia entre una idea y un producto que funciona nunca había sido tan corta. Lo que hagan con eso depende de ustedes.
Gracias.
[FOTO DE GRUPO.]` }
}
];
