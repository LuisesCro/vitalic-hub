# Vitalic Hub

App interna en español (Colombia) para la tienda Vitalic. Toda la interfaz, mensajes y comentarios van en español.

- Next.js 16: el middleware se llama `proxy` (`src/proxy.ts`). Antes de usar una API de Next, revisar `node_modules/next/dist/docs/`.
- Cada Server Action llama `requireSession()` antes de tocar datos.
- Montos en COP sin IVA salvo que el nombre diga `Gross`. Materia prima en gramos.
- La lógica de negocio pura vive en `src/lib/` y tiene pruebas en `tests/` (`npm test`). Mantener `npm run lint` y `npm test` en verde.
- Cambios de esquema: editar `src/db/schema.ts` y correr `npm run db:generate`.
