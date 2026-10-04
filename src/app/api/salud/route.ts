import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cashSessions } from "@/db/schema";
import { todayISO } from "@/lib/format";
import { expensesByMonth, monthlySales, productPerformance, rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { readSession } from "@/lib/session";
import { ensureSchema } from "@/db/ensure-schema";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { getSettings } from "@/lib/settings";

// Diagnóstico público: dice en qué paso falla la aplicación sin mostrar claves ni datos del negocio.
export const dynamic = "force-dynamic";

async function step<T>(fn: () => Promise<T>, ms = 8000) {
  const t = Date.now();
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`sin respuesta en ${ms / 1000} s`)), ms)),
    ]);
    return { ok: true, ms: Date.now() - t, value };
  } catch (error) {
    // Drizzle envuelve el error real de Postgres en `cause`.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    const message = cause instanceof Error ? `${(cause as { code?: string }).code ?? ""} ${cause.message}`.trim() : String(cause);
    return { ok: false, ms: Date.now() - t, error: message };
  }
}

function describeUrl(raw: string | undefined) {
  if (!raw) return "FALTA";
  try {
    const u = new URL(raw);
    return {
      puerto: u.port || "5432",
      pooler: u.hostname.includes("pooler"),
      usuario: u.username.replace(/\..*/, ".***"),
      claveConCorchetes: decodeURIComponent(u.password).includes("["),
      baseDeDatos: u.pathname.slice(1),
    };
  } catch {
    return "NO ES UNA DIRECCIÓN VÁLIDA";
  }
}

export async function GET(request: Request) {
  // ?ligero=1 lo usa la tarea que mantiene el servidor encendido: solo despierta la conexión.
  if (new URL(request.url).searchParams.has("ligero")) {
    await db.execute(sql`select 1`);
    return new Response("ok", { headers: { "cache-control": "no-store" } });
  }
  const conexion = await step(() => db.execute(sql`select 1`).then(() => "ok"));
  // Sin conexión no vale la pena seguir: cada paso esperaría hasta agotar el tiempo.
  const skip = async () => ({ ok: false, ms: 0, error: "no se intentó: falló la conexión" });
  const report = {
    version: process.env.BUILD_COMMIT ?? "local",
    variables: {
      DATABASE_URL: describeUrl(process.env.DATABASE_URL),
      AUTH_SECRET: process.env.AUTH_SECRET ? (process.env.AUTH_SECRET.length >= 32 ? "ok" : "MUY CORTA") : "FALTA",
      SEED_USERS: process.env.SEED_USERS ? "ok" : "no está (normal después del primer ingreso)",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "ok" : "no está (solo afecta fotos de facturas)",
    },
    conexion,
    estructura: !conexion.ok ? await skip() : await step(() =>
      db.execute<{ t: string; c: string }>(sql`
        select (select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public') as t,
               (select string_agg(column_name, ', ') from information_schema.columns where table_schema = 'public' and table_name = 'users') as c`)
        .then((r) => ({ tablas: r[0]?.t, columnasUsuarios: r[0]?.c })),
    ),
    bloqueos: !conexion.ok ? await skip() : await step(() =>
      db.execute<{ n: string }>(sql`select count(*) as n from pg_stat_activity where state like 'idle in transaction%' or wait_event_type = 'Lock'`)
        .then((r) => Number(r[0]?.n)),
    ),
    usuarios: !conexion.ok ? await skip() : await step(() => db.execute<{ n: string }>(sql`select count(*) as n from users`).then((r) => Number(r[0]?.n))),
    ventas: !conexion.ok ? await skip() : await step(() => db.execute<{ n: string }>(sql`select count(*) as n from sale_lines`).then((r) => Number(r[0]?.n))),
  };
  // Si quien abre el diagnóstico tiene sesión, se repite paso a paso lo que hace Inicio.
  const sesion = conexion.ok ? await step(() => readSession().then((s) => (s ? { nombre: s.name, rol: s.role } : "sin sesión"))) : await skip();
  const inicio =
    "value" in sesion && typeof sesion.value === "object"
      ? {
          ventasMes: await step(() => monthlySales().then((r) => r.length)),
          gastos: await step(() => expensesByMonth().then((r) => r.size)),
          productos: await step(() => productPerformance(90).then((r) => r.length)),
          consumo: await step(() => rawMaterialConsumption(90).then((r) => r.size)),
          conteos: await step(() => trackedRawMaterialIds().then((r) => r.size)),
          ajustes: await step(() => getSettings().then(() => "ok")),
          caja: await step(() => db.select().from(cashSessions).where(eq(cashSessions.businessDate, todayISO())).then((r) => r.length)),
        }
      : "inicia sesión en esta misma ventana y vuelve a abrir esta página";
  // Pasos del ingreso, cada uno con su tiempo, para ubicar cualquier demora.
  const ingreso = !conexion.ok ? await skip() : {
    estructuraAlDia: await step(() => ensureSchema().then(() => "ok")),
    buscarUsuario: await step(() => db.execute(sql`select id from users order by id limit 1`).then((r) => r.length)),
    cifrado: await step(() => bcrypt.hash("prueba-de-velocidad", 10).then(() => "ok")),
    firma: await step(() =>
      new SignJWT({ prueba: true }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? "x".repeat(32))).then(() => "ok"),
    ),
  };
  const full = { ...report, node: process.version, sesion, ingreso, inicio };
  return new Response(JSON.stringify(full, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
