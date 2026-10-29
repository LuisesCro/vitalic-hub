import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoicePhotos } from "@/db/schema";
import { readSession } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return new Response("No autorizado", { status: 401 });
  const [p] = await db.select().from(invoicePhotos).where(eq(invoicePhotos.id, Number((await params).id)));
  if (!p || (session.role !== "admin")) return new Response("No encontrada", { status: 404 });
  return new Response(Buffer.from(p.imageBase64, "base64"), { headers: { "Content-Type": p.mediaType, "Cache-Control": "private, max-age=3600" } });
}
