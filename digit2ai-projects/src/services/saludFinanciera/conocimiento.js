'use strict';
/**
 * Lina's memory: 50 questions a person asks to understand their financial
 * health, answered the way a good human advisor would — plainly, in "tú".
 *
 * General guidance is labelled as such ("como regla general"). Anything about
 * the owner's own money is NEVER written here as a figure: it comes from the
 * engine (`d`, built from engine.analyze) at answer time. No specific
 * investment products are ever recommended — cash flow and budget only.
 *
 * k = key phrases (accent-free, lowercase). A multi-word phrase weighs 2,
 * a single word 1. The best entry needs 2 points to answer.
 */
const { fmt } = require('./money');
const engine = require('./engine');
const fl = (iso) => engine.fechaLarga(iso);

const QA = [
  { id: 'que_es_salud', p: '¿Qué es la salud financiera?', k: ['salud financiera', 'que es la salud', 'que significa salud', 'estar sano financieramente'],
    r: d => `La salud financiera es poder cubrir tus gastos de hoy, aguantar un imprevisto sin endeudarte y avanzar hacia lo que quieres sin vivir con angustia. No se trata de cuánto ganas, sino de que lo que entra alcance para lo que sale y te sobre un margen. Hoy la tuya está en ${d.score}%: ${d.frase.toLowerCase()}.` },
  { id: 'como_se_mide', p: '¿Cómo se mide mi salud financiera aquí?', k: ['como se mide mi salud', 'se mide', 'como se mide', 'como mides', 'de donde sale el porcentaje', 'que mide el porcentaje', 'que significa el porcentaje', 'puntaje'],
    r: d => `Tu porcentaje junta cuatro cosas: tu punto más bajo (hasta 40 puntos, ${d.colchon > 0 ? `según qué tan arriba de ${fmt(d.colchon)} se mantiene` : 'completos mientras no quede en negativo'}), qué tan cerca vas del plan (hasta 30), si respetas el presupuesto de esta semana (hasta 20) y si tus pagos importantes quedan cubiertos (10). Hoy tienes ${d.A} + ${d.B} + ${d.C} + ${d.D}. Si algún día quedaras en negativo, el porcentaje no pasaría de 49.` },
  { id: 'colores', p: '¿Qué significa estar en verde o en amarillo?', k: ['verde', 'amarillo', 'que significa el color', 'por que estoy en'],
    r: d => `Verde, de 50% para arriba, quiere decir que vas bien: tus pagos están cubiertos y el plan se sostiene. Amarillo, por debajo de 50%, es una señal para ajustar algo antes de que se vuelva problema, no una alarma. Hoy estás en ${d.color} con ${d.score}%.` },
  { id: 'colchon', p: '¿Qué es un colchón o fondo de emergencia?', k: ['colchon', 'fondo de emergencia', 'fondo de emergencias', 'dinero de emergencia', 'para emergencias'],
    r: d => `Es dinero que apartas para lo inesperado: una reparación, una consulta médica, un mes con menos ingresos. Su trabajo es que un imprevisto no te obligue a endeudarte ni a dejar de pagar algo importante. ${d.colchon > 0 ? `Tu meta aquí es no bajar de ${fmt(d.colchon)}` : 'Hoy no tienes una meta de colchón configurada; la referencia es no quedar en negativo'}; tu punto más bajo proyectado es ${fmt(d.saldo_min)} el ${fl(d.fecha_min)}.` },
  { id: 'cuanto_colchon', p: '¿Cuánto debería tener en mi fondo de emergencia?', k: ['tener en mi fondo', 'cuanto deberia tener en', 'cuanto debo tener de colchon', 'cuanto deberia tener', 'cuanto colchon', 'tamano del fondo', 'cuantos meses de gastos', 'cuanto de emergencia'],
    r: d => `Como regla general se recomiendan entre tres y seis meses de tus gastos esenciales. ${d.colchon > 0 ? `Tu meta de ${fmt(d.colchon)} es un buen primer piso; cuando lo tengas estable, súbela poco a poco.` : 'Hoy no tienes una meta configurada; cuando tus números lo permitan, conviene ponerte una.'}${d.fijos_prox ? ` Como referencia, tus pagos fijos de ${d.prox_mes} suman ${fmt(d.fijos_prox)}.` : ''}` },
  { id: 'armar_colchon', p: '¿Cómo armo un colchón si no me sobra nada?', k: ['como armo', 'como junto', 'como construyo', 'empezar a ahorrar', 'no me sobra', 'no me alcanza para ahorrar'],
    r: () => 'Empieza chico y automático: separa una cantidad fija el mismo día que entra tu salario, aunque sea poca, antes de gastar. Suma también lo inesperado: un ingreso extra, un reembolso. Lo importante es el hábito, no el monto; cuando el hábito existe, el monto crece.' },
  { id: 'presupuesto', p: '¿Qué es un presupuesto?', k: ['que es un presupuesto', 'para que sirve un presupuesto', 'para que sirve el presupuesto'],
    r: d => `Un presupuesto es decidir antes a dónde va tu dinero, en lugar de averiguarlo después. Es tu plan: cuánto entra, qué tienes que pagar sí o sí y cuánto te queda para lo demás. Aquí tu presupuesto personal es de ${fmt(d.presupuesto)} por semana.` },
  { id: 'hacer_presupuesto', p: '¿Cómo hago un presupuesto?', k: ['como hago un presupuesto', 'como armo un presupuesto', 'como hacer un presupuesto', 'hacer presupuesto'],
    r: () => 'Cuatro pasos: anota lo que entra cada mes; lista los pagos que no puedes dejar de hacer; aparta tu ahorro como si fuera un pago más; y lo que sobra divídelo por semanas para tus gastos personales. Revísalo cada viernes cinco minutos y ajústalo con lo que realmente pasó.' },
  { id: 'regla_503020', p: '¿Qué es la regla 50/30/20?', k: ['50 30 20', '50/30/20', 'regla 50', 'cincuenta treinta veinte'],
    r: () => 'Es una guía sencilla: alrededor de la mitad de tus ingresos para necesidades, un tercio para gustos y una quinta parte para ahorro o pagar deudas. No es una ley; si tus pagos fijos son altos, lo que importa es que el ahorro exista, aunque sea menos.' },
  { id: 'cuanto_ahorrar', p: '¿Cuánto debería ahorrar cada mes?', k: ['cuanto ahorrar', 'cuanto deberia ahorrar', 'cuanto debo ahorrar', 'porcentaje de ahorro', 'cuanto guardar'],
    r: () => 'Como regla general, entre el diez y el veinte por ciento de lo que ganas. Si hoy no llegas, empieza con lo que puedas y súbelo cada vez que tus ingresos crezcan o termine un pago. Ahorrar algo siempre es mejor que esperar a poder ahorrar mucho.' },
  { id: 'flujo_caja', p: '¿Qué es el flujo de caja?', k: ['flujo de caja', 'flujo de efectivo', 'cash flow'],
    r: d => `Es el movimiento de tu dinero en el tiempo: cuándo entra y cuándo sale. Puedes terminar el mes con saldo positivo y aun así quedarte corto un día a mitad de mes si un pago grande llega antes que tu salario. Por eso aquí vigilamos cada día, no solo el final: tu día más justo es el ${fl(d.fecha_min)}.` },
  { id: 'saldo_minimo', p: '¿Por qué importa el saldo mínimo y no solo el final?', k: ['importa el saldo minimo', 'no solo el final', 'por que importa el minimo', 'por que el saldo minimo', 'importancia del punto mas bajo', 'para que sirve el minimo'],
    r: d => `Porque las cuentas se pagan en fechas, no al final del plan. Si un día tu saldo baja demasiado, cualquier imprevisto ese día te obliga a usar crédito. Tu saldo final proyectado es ${fmt(d.saldo_final)}, pero el día que más importa vigilar es el ${fl(d.fecha_min)}, cuando bajas a ${fmt(d.saldo_min)}.` },
  { id: 'fijos_variables', p: '¿Qué son gastos fijos y variables?', k: ['gastos fijos', 'gastos variables', 'fijos y variables'],
    r: () => 'Los fijos se repiten con el mismo monto y no puedes dejarlos de pagar: en tu caso la corte, el pago Lina, la casa de tu hija y tus servicios mensuales. Los variables cambian según lo que decidas: comida fuera, compras, salidas. El ahorro casi siempre se encuentra en los variables.' },
  { id: 'hormiga', p: '¿Qué son los gastos hormiga?', k: ['gastos hormiga', 'gasto hormiga', 'gastos pequenos', 'gastitos'],
    r: () => 'Son los gastos chicos que no se sienten: un café, una botana, una app, un envío. Uno solo no importa, pero juntos en un mes pueden ser una cuenta grande. Registrarlos aquí, aunque sean de cinco dólares, es la manera más rápida de verlos.' },
  { id: 'controlar_pequenos', p: '¿Cómo controlo los gastos pequeños?', k: ['controlo los gastos pequenos', 'controlar gastos', 'controlo los gastos', 'gastar menos en cosas pequenas', 'como gasto menos'],
    r: d => `Dales un techo y regístralos en el momento: dime "gasté tanto en tal cosa" y lo anoto. Tu techo es de ${fmt(d.presupuesto)} por semana y esta semana llevas ${fmt(d.semana_gastado)}. Ver el número cada vez es lo que cambia el hábito.` },
  { id: 'me_pase', p: '¿Qué hago si me paso del presupuesto semanal?', k: ['me paso del presupuesto', 'si me paso', 'me paso de', 'me pase del presupuesto', 'me pase de los', 'gaste de mas', 'me excedi', 'me sali del presupuesto'],
    r: d => `No pasa nada grave si es una semana: no intentes compensar todo de golpe, solo baja el gasto las próximas semanas hasta recuperar la diferencia. Lo que sí cuenta es que no se vuelva costumbre, sobre todo antes del ${fl(d.fecha_min)}, que es tu semana más justa. Esta semana llevas ${fmt(d.semana_gastado)} de ${fmt(d.presupuesto)}.` },
  { id: 'no_alcanza_mes', p: '¿Qué hago si un mes no me alcanza?', k: ['un mes no me alcanza', 'que hago si un mes', 'no me alcanza el mes', 'un mes no me alcanza', 'si no me alcanza', 'me falta dinero', 'estoy corto'],
    r: () => 'Primero ordena: cubre lo que no puede esperar (tus pagos fijos), luego pausa lo que sí puede (gustos, compras, inversión). Después busca el origen: ¿fue un gasto único o algo que se repite? Y antes de pedir prestado, pregúntame "si muevo tal gasto, ¿cómo quedo?" y lo simulamos.' },
  { id: 'tarjeta', p: '¿Conviene usar la tarjeta de crédito para llegar a fin de mes?', k: ['tarjeta de credito', 'usar la tarjeta', 'pagar con tarjeta', 'credito para llegar'],
    r: () => 'Solo si la pagas completa antes de la fecha límite. Usarla para tapar un hueco que se repite cada mes convierte un problema de flujo en una deuda con intereses altos. Si ves que la vas a necesitar, es mejor ajustar el plan antes.' },
  { id: 'deuda_buena_mala', p: '¿Hay deuda buena y deuda mala?', k: ['deuda buena', 'deuda mala', 'buena deuda', 'mala deuda'],
    r: () => 'Una deuda razonable es la que te deja algo que dura o que produce, con un pago que cabe tranquilo en tu presupuesto. Una deuda dañina es la que pagas por consumo que ya se fue, con intereses altos, o la que tomas para pagar otra deuda.' },
  { id: 'deuda_o_ahorro', p: '¿Pago primero mis deudas o ahorro?', k: ['deudas o ahorro', 'primero la deuda', 'pagar deuda o ahorrar', 'ahorro o deuda'],
    r: () => 'Las dos, en orden: primero un colchón pequeño para no volver a endeudarte con el primer imprevisto; luego ataca las deudas más caras; y cuando salgas de ellas, todo eso que pagabas se vuelve ahorro.' },
  { id: 'bola_nieve', p: '¿Qué es el método bola de nieve o avalancha?', k: ['bola de nieve', 'avalancha', 'metodo para pagar deudas', 'como pago mis deudas'],
    r: () => 'Son dos formas de salir de varias deudas. Bola de nieve: pagas primero la más pequeña para ganar impulso. Avalancha: pagas primero la de interés más alto para pagar menos en total. En las dos sigues pagando el mínimo de las demás.' },
  { id: 'evitar_deuda', p: '¿Cómo evito endeudarme?', k: ['evitar deudas', 'evito endeudarme', 'no endeudarme', 'no caer en deudas'],
    r: () => 'Con tres cosas: un colchón para los imprevistos, un presupuesto que respetes cada semana, y una regla simple: si no lo puedes pagar completo este mes, espera. Casi todas las deudas que duelen empiezan con un imprevisto sin colchón.' },
  { id: 'interes_compuesto', p: '¿Qué es el interés compuesto?', k: ['interes compuesto', 'intereses sobre intereses'],
    r: () => 'Es cuando ganas intereses sobre los intereses que ya ganaste, y por eso el dinero crece más rápido con el tiempo. Funciona igual al revés: en una deuda, pagas intereses sobre intereses. Por eso el tiempo juega a tu favor si ahorras y en tu contra si debes.' },
  { id: 'invertir', p: '¿Debo invertir?', k: ['debo invertir', 'conviene invertir', 'deberia invertir', 'en que invierto', 'donde invertir'],
    r: d => `Invertir tiene sentido con lo que sobra, después de cubrir tus pagos y tu colchón; esa es la regla de este plan. No te recomiendo productos específicos: para eso conviene un asesor de inversiones. Lo que sí puedo decirte es que hoy tu punto más bajo es ${fmt(d.saldo_min)}${d.saldo_min < d.colchon ? `, por debajo de tu colchón, así que antes de invertir más conviene cuidar ese margen` : ''}.` },
  { id: 'cuando_invertir', p: '¿Cuándo es buen momento para invertir?', k: ['cuando invertir', 'buen momento para invertir', 'momento de invertir'],
    r: () => 'Cuando se cumplen tres cosas: tus pagos fijos están cubiertos, tienes tu colchón completo y no tienes deudas caras. A partir de ahí, invertir con constancia vale más que acertar el momento.' },
  { id: 'liquidez', p: '¿Qué es la liquidez?', k: ['liquidez', 'liquido', 'dinero disponible al momento'],
    r: () => 'Es qué tan rápido puedes usar tu dinero sin perder valor. El efectivo en tu cuenta es muy líquido; una inversión a plazo o una propiedad, menos. Tu colchón siempre debe estar en algo líquido, porque una emergencia no espera.' },
  { id: 'prioridades', p: '¿En qué orden pago las cosas?', k: ['en que orden', 'orden pago', 'orden de pagos', 'que pago primero', 'prioridades', 'como priorizo'],
    r: () => 'Este es el orden que sigo contigo: primero, nunca quedar en negativo; segundo, cubrir la corte, el pago Lina y la casa de tu hija; tercero, mantener tu colchón; cuarto, respetar tu presupuesto semanal; y quinto, invertir solo lo que sobre.' },
  { id: 'atrasarse', p: '¿Qué pasa si me atraso en un pago?', k: ['me atraso en un pago', 'atraso en un pago', 'atraso', 'me atraso', 'pago tarde', 'no pago a tiempo', 'retraso en un pago'],
    r: () => 'Según el pago, puede traer recargos, intereses o problemas mayores; con pagos como la corte, atrasarse no es opción. Si ves venir un atraso, avisa antes y busca un acuerdo; y aquí, mueve gastos que sí pueden esperar para que ese pago quede cubierto.' },
  { id: 'gasto_grande', p: '¿Cómo me preparo para un gasto grande?', k: ['gasto grande', 'compra grande', 'prepararme para un gasto', 'juntar para algo'],
    r: () => 'Divide el monto entre los meses que faltan y apártalo cada mes como si fuera un pago fijo. Así, cuando llega la fecha, el dinero ya está y no le pega a tu saldo de un golpe. Si me dices el monto y la fecha, simulo cómo quedarías.' },
  { id: 'ahorro_metas', p: '¿Qué es ahorrar por metas?', k: ['ahorrar por metas', 'por metas', 'ahorro por metas', 'ahorro programado', 'apartados', 'ahorrar para una meta'],
    r: () => 'Es separar tu ahorro en apartados con nombre: colchón, vacaciones, un arreglo de la casa. Tener un nombre hace más difícil gastarlo en otra cosa y te deja ver cuánto falta para cada meta.' },
  { id: 'poner_metas', p: '¿Cómo pongo metas financieras?', k: ['metas financieras', 'poner metas', 'como fijo metas', 'objetivos financieros'],
    r: () => 'Una buena meta tiene monto, fecha y un aporte mensual: "juntar tal cantidad para tal mes, apartando tanto cada quincena". Si no tiene fecha y monto es un deseo, no una meta. Empieza con una sola y cuando la cumplas, sigue con la siguiente.' },
  { id: 'vivir_al_dia', p: '¿Cómo dejo de vivir de quincena en quincena?', k: ['vivir al dia', 'quincena en quincena', 'de salario en salario', 'cheque a cheque', 'sin dinero antes del pago'],
    r: d => `Creando una quincena de ventaja: poco a poco junta un colchón equivalente a un pago, para que el dinero de hoy pague lo de hoy y no dependas del siguiente salario. Ese colchón es justo el primer paso.` },
  { id: 'cada_cuanto_revisar', p: '¿Cada cuánto debo revisar mis finanzas?', k: ['cada cuanto', 'revisar mis finanzas', 'cada cuanto revisar', 'cada cuanto reviso', 'con que frecuencia', 'cuando reviso mis finanzas'],
    r: () => 'Cinco minutos cada viernes, cuando cierra tu semana de presupuesto: anota lo que falte, marca lo que ya pagaste y mira tu porcentaje. Y una revisión un poco más larga a fin de mes para ver si el plan sigue siendo realista.' },
  { id: 'que_registrar', p: '¿Qué debo registrar?', k: ['que debo registrar', 'que registro', 'que anoto', 'que tengo que anotar'],
    r: () => 'Todo lo que se mueva y no esté en el plan: gastos personales, imprevistos e ingresos extra. Y cuando hagas un pago del plan, márcalo como cumplido con el monto real. Mientras más fiel sea el registro, más fiel es tu proyección.' },
  { id: 'por_que_registrar', p: '¿Por qué registrar hasta los gastos pequeños?', k: ['registrar hasta', 'por que registrar hasta', 'por que registrar', 'para que registrar', 'vale la pena anotar', 'por que anotar'],
    r: () => 'Porque lo que no se anota no existe para tu plan, y luego la cuenta no cuadra sin saber por qué. Además, el simple hecho de anotar te hace pensar dos veces antes de gastar.' },
  { id: 'ingreso_extra', p: '¿Qué hago con un ingreso extra o un bono?', k: ['con un bono', 'que hago con un bono', 'que hago con un ingreso', 'que hago con el dinero extra', 'ingreso extra', 'bono', 'dinero extra', 'aguinaldo', 'me sobro dinero'],
    r: d => `Antes de gastarlo, repártelo: primero llena tu colchón si está corto, luego adelanta lo que más te aprieta y deja una parte para darte un gusto. ${d.saldo_min < d.colchon ? `Hoy tu punto más bajo (${fmt(d.saldo_min)}) está debajo de tu colchón, así que un ingreso extra rendiría mucho ahí.` : 'Tu colchón está cubierto, así que puedes destinarlo a metas.'} Si me lo dices, lo registro y te digo cómo cambia tu proyección.` },
  { id: 'ingresos_irregulares', p: '¿Cómo manejo ingresos irregulares?', k: ['ingresos irregulares', 'ingreso variable', 'no gano lo mismo', 'ingresos inestables'],
    r: () => 'Haz tu presupuesto con tu mes más bajo, no con el promedio. Lo que entre de más, guárdalo para los meses flojos. Así tus pagos fijos siempre quedan cubiertos aunque un mes venga corto.' },
  { id: 'reducir_gastos', p: '¿Cómo reduzco gastos sin sufrir?', k: ['reduzco gastos', 'sin sufrir', 'reducir gastos', 'recortar gastos', 'gastar menos', 'bajar gastos', 'ahorrar mas'],
    r: () => 'No recortes todo: elige dos o tres gastos que te importan poco y bájalos fuerte, y deja intactos los que de verdad disfrutas. Un recorte que te hace sentir castigado no dura; uno que no extrañas, sí.' },
  { id: 'que_recortar', p: '¿Qué gastos recorto primero?', k: ['que recorto', 'que gastos recorto', 'que quito primero', 'que gasto elimino'],
    r: () => 'Primero lo que se repite sin que lo uses: suscripciones, membresías, servicios que olvidaste. Luego lo de impulso. Al final, solo si hace falta, los gustos que sí valoras. Nunca empieces por tus pagos fijos.' },
  { id: 'negociar', p: '¿Cómo bajo lo que pago en servicios?', k: ['pago en servicios', 'bajo lo que pago', 'negociar', 'bajar facturas', 'pagar menos en servicios', 'telefono internet', 'servicios mas baratos'],
    r: () => 'Una vez al año revisa tus servicios: compara precios, pregunta por planes más baratos y menciona que estás pensando en cambiarte; muchas veces te ofrecen un descuento. Una llamada de veinte minutos puede ahorrarte cada mes.' },
  { id: 'suscripciones', p: '¿Cómo controlo las suscripciones?', k: ['controlo las suscripciones', 'suscripciones', 'suscripcion', 'membresias', 'cargos automaticos'],
    r: () => 'Haz una lista con todas las que tienes y pregúntate de cada una: ¿la usé el mes pasado? Si no, cancélala; siempre puedes volver. Revisa tu estado de cuenta, porque las que se cobran solas son las que más se olvidan.' },
  { id: 'impulso', p: '¿Cómo evito las compras por impulso?', k: ['impulso', 'compras impulsivas', 'compro sin pensar', 'antojos'],
    r: () => 'Usa la regla de esperar: si no estaba en tu plan, espera un día, y si es caro, una semana. Si después sigues queriéndolo, cómpralo sin culpa. Y antes de comprar, pregúntame "si compro esto, ¿cómo quedo?" y te lo digo con números.' },
  { id: 'hablar_familia', p: '¿Cómo hablo de dinero con mi familia?', k: ['hablar de dinero', 'con mi familia', 'con mi pareja', 'conversacion de dinero'],
    r: () => 'Con datos y sin culpas: muestra el plan, explica las prioridades y pide acuerdos concretos, por ejemplo un límite semanal. Hablarlo antes de que haya un problema hace que, cuando lo haya, todos ya sepan qué hacer.' },
  { id: 'ayudar_familia', p: '¿Cómo ayudo a mi familia sin descuidarme?', k: ['ayudo a mi familia', 'sin descuidarme', 'ayudar a mi familia', 'ayudar a mi hija', 'apoyar a mi hija', 'apoyo familiar', 'casa de mi hija'],
    r: d => `Poniéndole monto y fecha a la ayuda, como un pago más del plan, para que no salga de tu colchón. Tú ya lo haces así con la casa de tu hija: está planeada y ${d.todo_cubierto ? 'queda cubierta' : 'hay que revisar que quede cubierta'}. La regla es ayudar sin quedar tú en riesgo.` },
  { id: 'inflacion', p: '¿Qué es la inflación y cómo me afecta?', k: ['inflacion', 'suben los precios', 'precios mas caros'],
    r: () => 'Es el aumento general de los precios: con el mismo dinero compras menos con el tiempo. Te afecta en dos lados: tus gastos suben aunque no cambies nada, y el dinero guardado sin rendir pierde valor. Por eso conviene revisar tu presupuesto al menos una vez al año.' },
  { id: 'seguros', p: '¿Necesito seguros?', k: ['seguro', 'seguros', 'aseguranza', 'seguro de vida', 'seguro medico'],
    r: () => 'Un seguro sirve para lo que no podrías pagar solo: una emergencia médica grave, o que alguien dependa de tu ingreso. Revisa qué cubres hoy y qué no; para elegir uno concreto conviene hablar con un agente o asesor, porque depende de tu situación.' },
  { id: 'retiro', p: '¿Cómo me preparo para el retiro?', k: ['retiro', 'jubilacion', 'pension', 'cuando me retire'],
    r: () => 'Mientras antes empieces, menos tienes que apartar cada mes, por el efecto del tiempo. El primer paso es tener tus finanzas de hoy en orden, que es lo que hacemos aquí; para el plan de retiro en sí, conviene un asesor que vea tu caso completo.' },
  { id: 'mayor_riesgo', p: '¿Cuál es mi mayor riesgo financiero ahora?', k: ['mayor riesgo financiero', 'mayor riesgo', 'que me preocupa', 'donde estoy mas vulnerable', 'mi riesgo', 'que me puede salir mal'],
    r: d => `Hoy tu riesgo principal es el ${fl(d.fecha_min)}: ese día tu saldo baja a ${fmt(d.saldo_min)}${d.saldo_min < 0 ? ', en negativo' : (d.saldo_min < d.colchon ? `, por debajo de tu colchón de ${fmt(d.colchon)}` : '')}. Un imprevisto esa semana te dejaría sin margen. Todo lo demás se ve cubierto.` },
  { id: 'mejor_habito', p: '¿Qué hábito me ayudaría más?', k: ['que habito', 'mejor habito', 'buenos habitos', 'habitos financieros'],
    r: d => `Registrar tus gastos el mismo día y respetar los ${fmt(d.presupuesto)} por semana. Es el hábito que más protege tu punto más bajo, y en tu plan, el punto más bajo es lo que más mueve tu porcentaje.` },
  { id: 'tranquilo', p: '¿Cómo sé que voy bien?', k: ['como se que voy bien', 'estoy tranquilo', 'puedo estar tranquilo', 'voy bien', 'estoy bien'],
    r: d => `Vas bien cuando se cumplen tres cosas: tu porcentaje está en verde, tus pagos importantes están cubiertos y tu punto más bajo no queda en negativo. Hoy: ${d.score}% (${d.color}), ${d.todo_cubierto ? 'todos tus pagos cubiertos' : 'hay un pago por revisar'}, y tu punto más bajo es ${fmt(d.saldo_min)}${d.saldo_min < d.colchon ? ', que es lo único por cuidar' : ''}.` },
  { id: 'proyeccion_que_es', p: '¿Qué es una proyección financiera?', k: ['que es una proyeccion', 'que es proyectar', 'para que sirve la proyeccion'],
    r: () => 'Es una foto adelantada de tu dinero: tomando lo que ya pasó y lo que planeaste, calcula cuánto tendrás cada día. No adivina el futuro; te deja ver con tiempo los días apretados para que puedas moverte antes de que lleguen.' }
];

function score(entry, t) {
  let s = 0;
  for (const k of entry.k) if (t.includes(k)) s += k.includes(' ') ? 2 : 1;
  return s;
}

// A definitional question ("¿qué es...?", "¿cómo funciona...?") earns one extra point.
const DEF = /^(que hago|que pasa si|en que|cada cuanto|por que|que es|que son|que significa|como funciona|para que sirve|como se|como hago|como armo|como evito|como manejo|como reduzco|como controlo|como bajo|como me preparo|como pongo|como dejo|como se que|cual es|cuanto deberia|cuanto debo|debo|necesito|conviene|hay )/;
function buscar(textoNorm) {
  let best = null, bs = 0;
  const bonus = DEF.test(textoNorm) ? 1 : 0;
  for (const e of QA) { const s0 = score(e, textoNorm); const s = s0 ? s0 + bonus : 0; if (s > bs) { bs = s; best = e; } }
  return bs >= 2 ? { entrada: best, puntaje: bs } : null;
}

/** Facts the answers may use — all from the engine, never typed here. */
function datos(cur, fin) {
  const ym = cur.today.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const r = fin.resumenMes(cur, next);
  const fijos = cur.steps.filter(s => s.row.fecha >= r.desde && s.row.fecha <= r.hasta && s.row.tipo === 'egreso' && ['corte', 'pago_lina', 'hija'].includes(s.row.categoria)).reduce((a, s) => a + s.amount, 0);
  return {
    score: cur.score, color: cur.color, frase: cur.frase, A: cur.A, B: cur.B, C: cur.C, D: cur.D,
    saldo_hoy: cur.saldo_hoy, saldo_min: cur.saldo_min, fecha_min: cur.fecha_min, saldo_final: cur.saldo_final,
    colchon: cur.colchon_meta, presupuesto: cur.presupuesto_semanal, semana_gastado: cur.semana.gastado,
    fijos_prox: fijos, prox_mes: engine.MESES[Number(next.slice(5, 7)) - 1],
    todo_cubierto: cur.obligaciones_descubiertas.length === 0
  };
}

function responder(entrada, cur, fin) { return entrada.r(datos(cur, fin)); }

module.exports = { QA, buscar, responder, datos };
