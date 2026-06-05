# Veritas en defensoresdelapatria.app/veritas (dominio en GoHighLevel)

El dominio `defensoresdelapatria.app` está conectado en **GoHighLevel (GHL)**, no en Render. GHL **no** permite redirigir (proxy) una subruta como `/veritas` hacia un servidor externo (Render) desde su configuración. Por eso `/veritas` no aparece automáticamente en el dominio.

Hay tres formas de lograrlo. La **Opción A** conserva exactamente la ruta `/veritas` y se hace 100% dentro de GHL.

---

## Opción A — Página GHL en `/veritas` que incrusta el panel (recomendada, conserva la ruta)

Crea una página en GHL con la ruta (slug) `veritas` y pega un iframe a pantalla completa que carga el panel real de Render. La URL en la barra del navegador sigue siendo `https://defensoresdelapatria.app/veritas`.

**Pasos en GHL:**
1. **Sites → Funnels/Websites** → abre (o crea) el sitio del dominio `defensoresdelapatria.app`.
2. **Add Step / New Page** → nómbrala "Veritas" → en **Path / URL slug** escribe: `veritas`
3. Abre el editor de esa página. Borra secciones por defecto para dejarla en blanco.
4. Agrega un elemento **Custom JS/HTML** (o **Code**) y pega:

```html
<style>
  html,body{margin:0;padding:0;height:100%}
  #veritas-frame{position:fixed;top:0;left:0;width:100%;height:100%;border:0}
</style>
<iframe id="veritas-frame"
        src="https://aiagent.ringlypro.com/veritas/"
        allow="clipboard-write; fullscreen"
        title="Veritas — Protección contra Deepfakes"></iframe>
```

5. (Opcional) En **Page Settings** quita encabezado/pie del builder para que el panel ocupe toda la pantalla.
6. **Save → Publish**.

Resultado: `https://defensoresdelapatria.app/veritas` muestra el panel en español. Las llamadas a la API y la descarga de CSV funcionan porque el iframe corre sobre el origen de Render.

> Nota: el iframe sirve perfecto para el **panel**. Si en el futuro agregas voz (orbe convai con micrófono) conviene la Opción B (subdominio) para permisos de micrófono sin restricciones de iframe.

---

## Opción B — Subdominio en Render (más limpio técnicamente)

`veritas.defensoresdelapatria.app` apuntando directo a Render.

1. En el **DNS del dominio** (en GHL si ahí administras el DNS, o en tu registrador): crea un registro **CNAME**
   - Host/Name: `veritas`
   - Value/Target: el hostname del servicio de Render (p. ej. `aiagent.ringlypro.com` o el `*.onrender.com`)
2. En **Render → el servicio → Settings → Custom Domains**: agrega `veritas.defensoresdelapatria.app`. Render emite el certificado SSL automáticamente.
3. Listo: `https://veritas.defensoresdelapatria.app/veritas/` (o, si quieres que la raíz del subdominio abra Veritas, avísame y agrego una regla de host en `src/app.js` que reescriba la raíz a `/veritas`).

Desventaja: es un subdominio, no la ruta `/veritas` exacta que pediste.

---

## Opción C — Redirección simple (la más rápida, pero cambia la URL)

En GHL crea la página con slug `veritas` y configúrala como **Redirect** a `https://aiagent.ringlypro.com/veritas/`. Funciona en 1 minuto, pero la barra de direcciones termina mostrando `aiagent.ringlypro.com`.

---

## Recomendación

- Quieres la **ruta exacta `/veritas`** sin tocar DNS → **Opción A** (iframe en una página GHL).
- Aceptas un **subdominio** y quieres lo más robusto → **Opción B**.

Yo no tengo acceso a tu cuenta de GHL ni al DNS; el snippet y los pasos de arriba son para pegar tal cual. Dime cuál eliges y te ayudo a afinarla.
