'use strict';

/**
 * Authored practice content, one entry per module.
 *
 * The lesson bodies in ti_lessons are reading passages. This bank is what turns each
 * of them into practice: the situations a learner speaks their way through, the thing
 * they can claim to be able to do afterwards, and the one grammar point the module
 * actually rests on.
 *
 * Two deliberate choices:
 *
 *   1. Grammar is here at all. The conversation apps skip it — that is their most
 *      consistent review criticism. One focused point per module, tied to the module's
 *      own vocabulary, costs little and is the difference between practice and drift.
 *
 *   2. From Module 7 the modules carry an `occupational` track — Spanish for the
 *      Philippine BPO floor (contact centre, healthcare coordination, technical
 *      support, sales, interpretation). That is where the salary premium is, and it
 *      is the reason a learner finishes B1 rather than stalling at A2.
 *
 * Everything here is scenario scaffolding for a live tutor session, not a script to
 * be read aloud. `situation` sets the scene, `opens` is the tutor's first line, and
 * `must_use` names the language the learner has to actually produce for the turn to
 * count.
 */

const MODULES = {
  1: {
    theme: 'Presentaciones',
    can_do: [
      'Greet someone and say goodbye at the right level of formality',
      'Give my name, nationality and a short description of myself',
      'Name the members of my family and say what they are like',
    ],
    grammar: {
      point: 'ser vs estar, and tú vs usted',
      why: 'Both distinctions are absent in Tagalog and English, and both are load-bearing from the very first conversation: ser for who you are, estar for how you are; usted for elders, strangers and work.',
      examples: ['Soy filipino. / Estoy cansado.', '¿Cómo está usted? / ¿Cómo estás?'],
    },
    roleplays: [
      { title: 'First day at a language exchange', situation: 'You arrive at a Spanish conversation night in Makati and sit down next to someone you have never met.', opens: 'Hola, buenas noches. No nos conocemos, ¿verdad? Me llamo Carmen.', must_use: ['me llamo', 'soy de', 'mucho gusto', 'encantado/a'] },
      { title: 'Introducing your family', situation: 'A Spanish-speaking colleague asks about the photo on your desk.', opens: '¿Y esta foto? ¿Es tu familia?', must_use: ['mi madre / mi padre', 'tengo … hermanos', 'es + adjective'] },
      { title: 'Formal introduction', situation: 'You are introduced to your manager\'s manager, who is visiting from Mexico.', opens: 'Buenos días. Soy el señor Ramírez, director regional.', must_use: ['usted', 'mucho gusto', 'trabajo en'] },
    ],
    debate: null,
  },

  2: {
    theme: 'La rutina diaria',
    can_do: [
      'Describe my daily routine in order, with times',
      'Say how often I do something',
      'Talk about what I am going to do this week',
    ],
    grammar: {
      point: 'Present tense of regular verbs, plus reflexives for routine',
      why: 'Routine is the first place a learner needs conjugation to hold together across a whole paragraph, and reflexives (levantarse, ducharse) have no direct Tagalog equivalent.',
      examples: ['Me levanto a las seis.', 'Trabajo de nueve a seis.', 'Voy a estudiar esta noche.'],
    },
    roleplays: [
      { title: 'Comparing schedules', situation: 'A classmate wants to find a time to study together this week.', opens: '¿A qué hora sales del trabajo normalmente?', must_use: ['a las …', 'normalmente', 'los lunes / los martes'] },
      { title: 'The night shift', situation: 'You explain your BPO schedule to someone who keeps daytime hours.', opens: 'Espera — ¿trabajas de noche? ¿Cómo es tu día entonces?', must_use: ['me levanto', 'empiezo a', 'termino a', 'después'] },
      { title: 'Making weekend plans', situation: 'A friend calls on Friday to plan the weekend.', opens: '¿Qué vas a hacer este fin de semana?', must_use: ['voy a + infinitive', 'el sábado', 'primero … luego'] },
    ],
    debate: null,
  },

  3: {
    theme: 'Comida y compras',
    can_do: [
      'Order a meal and ask what a dish contains',
      'Ask for a price, a quantity and a different size',
      'Say what I like, dislike and am allergic to',
    ],
    grammar: {
      point: 'gustar and the indirect object',
      why: 'gustar inverts the sentence — the thing does the pleasing, not the person. Learners who never confront this say "yo gusto" for years.',
      examples: ['Me gusta el adobo.', 'No me gustan los mariscos.', '¿Te gustaría probarlo?'],
    },
    roleplays: [
      { title: 'Ordering at a restaurant', situation: 'You are at a Mexican restaurant and the waiter arrives.', opens: 'Buenas tardes, ¿ya sabe qué va a pedir?', must_use: ['para mí', 'quisiera', '¿qué lleva …?', 'la cuenta'] },
      { title: 'At the market', situation: 'You are buying fruit at a market stall and the price seems high.', opens: '¿Cuántos kilos le doy?', must_use: ['¿cuánto cuesta?', 'un kilo de', 'es un poco caro'] },
      { title: 'A dietary restriction', situation: 'You have been invited to dinner and there is something you cannot eat.', opens: 'Preparé camarones, espero que te gusten.', must_use: ['soy alérgico/a a', 'lo siento', 'prefiero'] },
    ],
    debate: null,
  },

  4: {
    theme: 'Lugares y transporte',
    can_do: [
      'Ask for and follow directions on foot and by transport',
      'Buy a ticket and ask about times and platforms',
      'Describe where something is in relation to something else',
    ],
    grammar: {
      point: 'Prepositions of place and the imperative for directions',
      why: 'Directions are given in commands (siga, gire, cruce) — the first place a learner must understand a form they are not yet producing.',
      examples: ['Siga derecho dos cuadras.', 'Está al lado del banco.', 'Gire a la izquierda.'],
    },
    roleplays: [
      { title: 'Lost in the city', situation: 'You are looking for the train station and stop someone on the street.', opens: 'Sí, dígame, ¿qué busca?', must_use: ['perdone', '¿cómo llego a …?', '¿está lejos?'] },
      { title: 'Buying a ticket', situation: 'You are at a ticket window and the next train is full.', opens: 'Ese tren ya está completo. ¿Le sirve el de las cuatro?', must_use: ['un boleto para', '¿a qué hora sale?', '¿de qué andén?'] },
      { title: 'Giving directions back', situation: 'A tourist asks you how to get to a place you know well.', opens: 'Disculpe, ¿sabe dónde queda el museo?', must_use: ['siga derecho', 'a la derecha', 'enfrente de'] },
    ],
    debate: null,
  },

  5: {
    theme: 'Hábitos e invitaciones',
    can_do: [
      'Invite someone out and accept or decline politely',
      'Say what I used to do and what I do now',
      'Agree on a time and place with someone',
    ],
    grammar: {
      point: 'Imperfect for habitual past ("antes … ahora …")',
      why: 'The first past tense a learner needs is not the one for events but the one for how life used to be — and it is the natural home of this module\'s vocabulary.',
      examples: ['Antes fumaba, ahora no.', 'Cuando era niño jugaba baloncesto.'],
    },
    roleplays: [
      { title: 'The invitation', situation: 'A colleague invites you to a concert on a night you already have plans.', opens: '¿Estás libre el viernes? Tengo dos entradas.', must_use: ['me encantaría, pero', 'es que', '¿qué tal el sábado?'] },
      { title: 'How things used to be', situation: 'You are telling someone how your habits changed after you started working.', opens: '¿Y hacías deporte antes?', must_use: ['antes …', 'ahora …', 'ya no'] },
      { title: 'Settling the details', situation: 'You have both agreed to meet but nothing is fixed.', opens: 'Perfecto. ¿Dónde nos vemos?', must_use: ['quedamos en', 'a eso de las', 'te aviso'] },
    ],
    debate: null,
  },

  6: {
    theme: 'Salud y bienestar',
    can_do: [
      'Describe a symptom and how long I have had it',
      'Understand and give a health recommendation',
      'Make an appointment and explain why',
    ],
    grammar: {
      point: 'doler, and recommendations with deber / tener que',
      why: 'doler behaves like gustar (me duele la cabeza), so this module either consolidates that pattern or exposes that it never landed.',
      examples: ['Me duele la garganta.', 'Debería descansar.', 'Tiene que tomar el medicamento cada ocho horas.'],
    },
    roleplays: [
      { title: 'At the clinic', situation: 'You have had a fever for three days and are seeing a doctor.', opens: 'Cuénteme, ¿qué le pasa?', must_use: ['me duele', 'desde hace … días', 'tengo fiebre'] },
      { title: 'Advising a friend', situation: 'A friend keeps working through a bad cough.', opens: 'No es nada, es solo un poco de tos.', must_use: ['deberías', 'tienes que', 'te recomiendo que'] },
      { title: 'Booking the appointment', situation: 'You call a clinic and the first opening is next week.', opens: 'Tenemos disponibilidad hasta el martes que viene.', must_use: ['quisiera una cita', 'es urgente', '¿no hay nada antes?'] },
    ],
    debate: { prompt: '¿Es responsabilidad de la empresa cuidar la salud de sus empleados, o de cada persona?', position_a: 'La empresa debe pagar chequeos y proteger los horarios de descanso.', position_b: 'Cada persona decide cómo vive; la empresa no debe entrar en eso.' },
  },

  7: {
    theme: 'El trabajo',
    can_do: [
      'Describe my job, my team and my responsibilities',
      'Talk about my professional experience and what I have done',
      'Handle a short work conversation with a Spanish-speaking colleague',
    ],
    grammar: {
      point: 'Present perfect for experience (he trabajado, he vivido)',
      why: 'Interviews and professional small talk both run on "what have you done" — the tense that connects a past experience to the present moment.',
      examples: ['He trabajado en atención al cliente durante tres años.', '¿Has usado este sistema antes?'],
    },
    roleplays: [
      { title: 'Describing your role', situation: 'A new Spanish-speaking colleague asks what exactly you do.', opens: 'Todavía no entiendo bien qué hace tu equipo. ¿Me explicas?', must_use: ['me encargo de', 'trabajo con', 'mi equipo'] },
      { title: 'The job interview', situation: 'You are interviewing for a bilingual position.', opens: 'Cuénteme sobre su experiencia con clientes hispanohablantes.', must_use: ['he trabajado', 'durante … años', 'mi mayor fortaleza'] },
      { title: 'Asking for what you need', situation: 'You need a deadline moved and your manager is busy.', opens: 'Tengo dos minutos, dime.', must_use: ['necesito', '¿sería posible …?', 'el motivo es'] },
    ],
    debate: { prompt: '¿El trabajo remoto ayuda o perjudica a los equipos jóvenes?', position_a: 'Ahorra horas de tráfico y permite contratar en toda Filipinas.', position_b: 'Los que empiezan aprenden menos sin tener gente al lado.' },
    occupational: {
      track: 'Contact centre — inbound customer service',
      register: 'Formal usted throughout. Never tutear a customer, however friendly the call becomes.',
      scenarios: [
        { title: 'Opening and verifying', situation: 'An inbound call from a Mexico City customer about a charge they do not recognise.', opens: 'Buenas tardes, hay un cargo en mi cuenta que yo no hice.', must_use: ['gracias por comunicarse con', '¿me permite confirmar …?', 'permítame revisar'] },
        { title: 'Holding and returning', situation: 'You need ninety seconds to check the account and must not leave dead air.', opens: '¿Sigue ahí? Llevo un rato esperando.', must_use: ['¿me permite ponerlo en espera?', 'gracias por su paciencia', 'ya tengo la información'] },
      ],
      compliance: 'Never confirm a resolution the system has not shown you. "Déjeme confirmarlo" is always safer than a promise you cannot keep.',
    },
  },

  8: {
    theme: 'Cultura y tradiciones',
    can_do: [
      'Describe a Filipino tradition to someone who has never seen it',
      'Compare a Filipino and a Latin American celebration',
      'Talk about a past event and how it felt',
    ],
    grammar: {
      point: 'Preterite vs imperfect in narration',
      why: 'Telling a story requires both: the imperfect paints the scene, the preterite moves it forward. Choosing between them is the single hardest thing at B1.',
      examples: ['Era diciembre y llovía. Entonces llegó mi tío con la lechona.'],
    },
    roleplays: [
      { title: 'Explaining Noche Buena', situation: 'A Colombian friend asks what Filipino Christmas actually looks like.', opens: 'Me dijeron que en Filipinas la Navidad empieza en septiembre. ¿Es cierto?', must_use: ['se celebra', 'la gente suele', 'lo más importante es'] },
      { title: 'The shared inheritance', situation: 'You are explaining why so many Filipino words are Spanish.', opens: 'Cada vez que hablas escucho palabras que conozco. ¿Por qué?', must_use: ['viene de', 'durante la época colonial', 'todavía se usa'] },
      { title: 'A fiesta you remember', situation: 'Describe a town fiesta you attended as a child.', opens: 'Cuéntame de alguna fiesta que recuerdes bien.', must_use: ['era', 'había', 'de repente', 'nunca se me olvidó'] },
    ],
    debate: { prompt: 'La herencia hispana en Filipinas: ¿algo que recuperar o un capítulo cerrado?', position_a: 'Es parte de quiénes somos; Rizal escribió en español y hoy no podemos leerlo.', position_b: 'El país siguió adelante; el inglés y el filipino ya cuentan nuestra historia.' },
    occupational: {
      track: 'Contact centre — cultural register across markets',
      register: 'The same Spanish sentence lands differently in Mexico, Colombia and Argentina. Neutral LatAm Spanish is the professional default.',
      scenarios: [
        { title: 'Reading the market', situation: 'Two customers, one from Bogotá and one from Buenos Aires, on the same script.', opens: 'Che, ¿me estás diciendo que tengo que esperar una semana?', must_use: ['comprendo su molestia', 'permítame explicarle', 'con mucho gusto'] },
      ],
      compliance: 'Regional slang is for recognising, not producing. Understand "che", "órale" and "vaina"; do not use them on a call.',
    },
  },

  9: {
    theme: 'Medios y tecnología',
    can_do: [
      'Explain a technical problem clearly to someone who cannot see my screen',
      'Give step-by-step instructions',
      'Say what I read, watch and follow, and why',
    ],
    grammar: {
      point: 'Formal commands and sequencing',
      why: 'Every instruction a support agent gives is a command in usted (haga clic, cierre, reinicie), chained with primero / luego / por último.',
      examples: ['Primero cierre la aplicación. Luego reinicie el equipo.'],
    },
    roleplays: [
      { title: 'Walking someone through it', situation: 'A relative cannot get their phone to connect to wifi.', opens: 'No sé qué le pasa, no se conecta y ya probé todo.', must_use: ['primero', 'haga clic en', 'ahora dígame qué ve'] },
      { title: 'Describing what broke', situation: 'You are reporting a bug and the person cannot see your screen.', opens: 'Descríbeme exactamente qué pasó.', must_use: ['cuando intento …, aparece', 'el mensaje dice', 'empezó ayer'] },
      { title: 'What you follow and why', situation: 'A colleague asks where you get your news.', opens: '¿Y tú qué sigues? Yo ya no leo nada.', must_use: ['suelo leer', 'me parece que', 'lo que más me interesa'] },
    ],
    debate: { prompt: '¿Las redes sociales conectan a las familias filipinas separadas por el trabajo, o solo lo aparentan?', position_a: 'Para un OFW, una videollamada diaria es la diferencia entre estar presente o no.', position_b: 'Una pantalla no sustituye estar ahí; crea la ilusión de presencia.' },
    occupational: {
      track: 'Technical support — Spanish-language tier 1',
      register: 'Plain language over jargon. The customer does not know what a cache is, and telling them is not support.',
      scenarios: [
        { title: 'Diagnosing blind', situation: 'The customer insists nothing changed, but something clearly did.', opens: 'Yo no toqué nada, se descompuso solo.', must_use: ['entiendo', '¿me puede decir qué ve en la pantalla?', 'vamos a probar algo'] },
        { title: 'Escalating honestly', situation: 'The issue is beyond tier 1 and the customer wants it fixed now.', opens: 'Llevo tres llamadas con esto. ¿Nadie lo puede resolver?', must_use: ['voy a escalar su caso', 'el tiempo estimado es', 'le doy un número de referencia'] },
      ],
      compliance: 'Never invent a cause. "No estoy seguro, déjeme verificarlo" protects the account; a confident wrong answer costs the contract.',
    },
  },

  10: {
    theme: 'Viajes y turismo',
    can_do: [
      'Handle a booking, a check-in and a problem with a reservation',
      'Tell the story of a trip I took',
      'Make a complaint politely and get it resolved',
    ],
    grammar: {
      point: 'Conditional for politeness and hypotheticals',
      why: 'The gap between demanding and requesting is one verb form. "Quiero" and "querría" ask for the same thing and get different answers.',
      examples: ['¿Podría cambiar la habitación?', 'Me gustaría hablar con el encargado.'],
    },
    roleplays: [
      { title: 'The room is wrong', situation: 'You booked a room with two beds and got one.', opens: 'Déjeme revisar … no, aquí dice una cama matrimonial.', must_use: ['reservé', '¿podría …?', 'en la confirmación dice'] },
      { title: 'The delayed flight', situation: 'Your connection is at risk because of a delay.', opens: 'El vuelo sale con dos horas de retraso, señor.', must_use: ['tengo una conexión', '¿qué opciones tengo?', 'necesito llegar a'] },
      { title: 'The trip you took', situation: 'Tell someone about a journey that did not go to plan.', opens: 'Cuéntame de ese viaje. ¿Qué pasó?', must_use: ['fuimos a', 'resulta que', 'al final'] },
    ],
    debate: { prompt: '¿El turismo masivo ayuda o daña a las islas de Filipinas?', position_a: 'Da trabajo donde no hay otra industria.', position_b: 'Boracay tuvo que cerrar seis meses para recuperarse. Eso lo dice todo.' },
    occupational: {
      track: 'Travel and hospitality accounts',
      register: 'Ownership language. "Yo me encargo" outperforms "el sistema no me deja" on every quality scorecard.',
      scenarios: [
        { title: 'The angry escalation', situation: 'A customer stranded overnight wants compensation you cannot authorise.', opens: 'Pasé la noche en el aeropuerto. Quiero que alguien me responda.', must_use: ['lamento mucho lo que pasó', 'lo que sí puedo hacer es', 'permítame confirmar con'] },
      ],
      compliance: 'Apologise for the experience, never for fault you have not established. "Lamento lo que vivió" is not an admission of liability.',
    },
  },

  11: {
    theme: 'Ambiente y sustentabilidad',
    can_do: [
      'State an opinion and support it with a reason',
      'Agree and disagree without being rude',
      'Talk about causes, consequences and what should be done',
    ],
    grammar: {
      point: 'Subjunctive after opinion and doubt',
      why: 'The moment a learner starts arguing, the subjunctive becomes unavoidable: no creo que sea, es importante que hagamos. This is the B1+ threshold.',
      examples: ['No creo que sea suficiente.', 'Es importante que el gobierno actúe.'],
    },
    roleplays: [
      { title: 'After the typhoon', situation: 'Discussing what should change after a storm hits your province.', opens: 'Cada año es lo mismo. ¿Y qué se puede hacer realmente?', must_use: ['creo que', 'es necesario que', 'el problema es que'] },
      { title: 'Disagreeing well', situation: 'Someone argues that individual recycling is pointless.', opens: 'Reciclar no sirve de nada, lo que contamina son las empresas.', must_use: ['entiendo tu punto, pero', 'no estoy de acuerdo', 'por otro lado'] },
      { title: 'Proposing something concrete', situation: 'Your workplace asks for a sustainability suggestion.', opens: 'Tenemos presupuesto pequeño. ¿Qué propones?', must_use: ['propongo que', 'si hiciéramos …, podríamos', 'a largo plazo'] },
    ],
    debate: { prompt: '¿Debe Filipinas priorizar el crecimiento económico o la protección ambiental?', position_a: 'Sin crecimiento no hay trabajo, y sin trabajo la gente se va.', position_b: 'Somos de los países más vulnerables del mundo al clima. Crecer sin proteger es no crecer.' },
    occupational: {
      track: 'Healthcare coordination and insurance',
      register: 'Precision over fluency. A misheard number in this track is a clinical and legal problem, not a language one.',
      scenarios: [
        { title: 'Confirming a patient record', situation: 'Verifying identity and coverage before scheduling.', opens: 'Sí, llamo para una cita con el especialista.', must_use: ['¿me confirma su fecha de nacimiento?', 'su póliza cubre', 'le repito para confirmar'] },
        { title: 'Explaining a denial', situation: 'A claim was denied and the patient does not understand why.', opens: 'Me dijeron que no está cubierto. ¿Por qué?', must_use: ['según su plan', 'lo que puede hacer es', 'tiene derecho a apelar'] },
      ],
      compliance: 'Read every number back. Never give clinical advice, ever — you coordinate, you do not diagnose.',
    },
  },

  12: {
    theme: 'Sociedad contemporánea',
    can_do: [
      'Sustain an argument over several turns',
      'Concede a point without abandoning my position',
      'Summarise a discussion and state where I stand',
    ],
    grammar: {
      point: 'Connectors of argument, and si + subjunctive hypotheticals',
      why: 'At the exit level, what separates B1 from B1+ is not vocabulary but the ability to hold an argument together across turns: sin embargo, aunque, por lo tanto, si tuviera.',
      examples: ['Aunque entiendo el argumento, sigo pensando que …', 'Si tuviera que elegir, elegiría …'],
    },
    roleplays: [
      { title: 'The migration question', situation: 'Discussing why so many Filipinos work abroad, with someone who has never left.', opens: 'Yo nunca me iría. ¿Tú sí?', must_use: ['por un lado … por otro', 'depende de', 'en mi caso'] },
      { title: 'Holding your ground', situation: 'The other person makes a fair point against you.', opens: 'Sí, pero eso contradice lo que dijiste antes.', must_use: ['tienes razón en que', 'sin embargo', 'lo que quise decir es'] },
      { title: 'Closing the discussion', situation: 'Summarise a twenty-minute conversation in one minute.', opens: 'Resumamos. ¿En qué quedamos?', must_use: ['en resumen', 'estamos de acuerdo en que', 'seguimos discrepando en'] },
    ],
    debate: { prompt: '¿El trabajo en el extranjero fortalece a las familias filipinas o las rompe?', position_a: 'Las remesas educaron a una generación entera que no habría estudiado.', position_b: 'Una generación creció por videollamada. Eso también se paga.' },
    occupational: {
      track: 'Interpretation and bilingual team lead',
      register: 'You are now the language boundary for other people. Everything you say is on the record.',
      scenarios: [
        { title: 'Interpreting in the first person', situation: 'Interpreting between an English-speaking supervisor and a Spanish-speaking customer.', opens: 'Tell her the refund was already processed on our end.', must_use: ['first-person rendering, no "he says"', 'no additions', 'no omissions'] },
        { title: 'Coaching an agent', situation: 'Giving feedback to a junior agent whose Spanish is causing repeat calls.', opens: 'Yo creo que me explico bien, no sé por qué vuelven a llamar.', must_use: ['lo que noté fue', 'te sugiero que', 'la próxima vez intenta'] },
      ],
      compliance: 'An interpreter adds nothing, softens nothing and omits nothing. If you did not understand, you say so — you never guess on someone else\'s behalf.',
    },
  },
};

/** The module entry, by 1-based module position. */
function forModule(n) {
  return MODULES[Number(n)] || null;
}

module.exports = { MODULES, forModule };
