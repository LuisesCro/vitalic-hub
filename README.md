# Vitalic Hub

Plataforma interna de Vitalic (tienda de frutos secos, especias y condimentos en Alameda, Cali) para
controlar compras, inventario de materia prima, empaque, precios y resultados. Funciona en computador y celular.

No reemplaza el POS ni la facturación electrónica: las ventas se siguen haciendo en Vendty (o el POS que se
elija) y se importan aquí.

## Módulos

| Módulo | Qué hace |
|---|---|
| Tablero | Ventas, margen, utilidad bruta y neta, punto de equilibrio y alertas |
| Compras | Sube la factura del proveedor (XML o ZIP de la DIAN, foto o PDF). Sugiere el insumo y los kilos de cada línea; al confirmar suma al inventario y actualiza el costo promedio. Aprende cada producto del proveedor para la próxima factura |
| Inventario | Existencia en kilos, consumo semanal según ventas, cobertura en días, conteo físico y stock mínimo |
| Empaque | Registra bolsas empacadas: descuenta los kilos del insumo y la merma |
| Precios | Costo, margen y precio recomendado por producto. Sube catálogos de la competencia y recalcula |
| Productos | Ventas, utilidad y clasificación ABC de los últimos 12 meses; enlace de productos con su insumo |
| Resultados | Estado de resultados mensual con los gastos registrados |
| Importar | Catálogo y ventas exportados de Vendty |
| Ajustes | Márgenes objetivo, margen mínimo, posición frente a la competencia, costo de bolsas |

### Regla de precios

1. Referencia: el precio más bajo de la competencia para el mismo producto y peso.
2. Precio competitivo: la referencia ajustada por la posición elegida (por defecto 3 % más barato).
3. Nunca por debajo del piso que garantiza el margen mínimo (por defecto 40 %).
4. Sin competencia: se mantiene el precio actual, salvo que esté bajo el margen mínimo.
5. Con competencia puede recomendar bajar precios, siempre respetando el margen mínimo (se desactiva en Ajustes).
6. Si el costo parece mal cargado (más del doble del precio), pide revisarlo en vez de recomendar.

## Tecnología

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, PostgreSQL con Drizzle ORM, sesión con JWT en cookie,
y la API de Claude (`claude-opus-5-5`) para leer fotos y PDF de facturas.

## Puesta en marcha local

Requisitos: Node 22 y una base PostgreSQL.

```bash
npm install
cp .env.example .env        # completar DATABASE_URL, AUTH_SECRET, SEED_USERS y ANTHROPIC_API_KEY
npm run db:migrate          # crea las tablas
npm run db:seed             # crea los usuarios y los ajustes iniciales
npm run dev                 # http://localhost:3000
```

Luego, en la app: Importar → catálogo de productos de Vendty → ventas (Transacciones).

## Publicar en internet (Supabase + Netlify o Vercel)

1. **Base de datos:** crear un proyecto en Supabase. En Project Settings → Database copiar la cadena de
   conexión del pooler (modo transacción, puerto 6543). Esa es `DATABASE_URL`.
   Al crear el proyecto, desactivar "Enable Data API": la app se conecta directo a Postgres y así las
   tablas no quedan expuestas en la API pública de Supabase.
2. **Tablas:** en Supabase → SQL Editor, pegar y ejecutar `drizzle/0000_init.sql`, `drizzle/0001_caja.sql` y `drizzle/0002_usuarios_roles.sql` (o correr
   `npm run db:migrate` con `DATABASE_URL` apuntando a Supabase).
3. **Aplicación:** importar el repositorio en Netlify (usa `netlify.toml`) o en Vercel, y definir las variables `DATABASE_URL`, `AUTH_SECRET`
   (texto aleatorio de 32+ caracteres), `SEED_USERS` y `ANTHROPIC_API_KEY`.
4. **Usuarios:** en el primer ingreso, si la base no tiene usuarios, la app los crea desde `SEED_USERS`.
   Cada persona cambia su clave en Ajustes; después se puede borrar `SEED_USERS`.

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas (lectores de Vendty y DIAN, precios, costos, emparejamiento) |
| `npm run lint` | Revisión de tipos |
| `npm run db:generate` | Genera una migración después de cambiar `src/db/schema.ts` |

## Datos y supuestos

- Montos de compras y ventas sin IVA (Vitalic es responsable de IVA y el IVA de compras es descontable).
- Vendty guarda el costo de los ingredientes por gramo; costos mayores a $1.000.000/kg se tratan como mal
  cargados.
- La línea de venta con cantidad de 1.000 o más a $0 se excluye por ser un ajuste de inventario registrado
  como venta.
