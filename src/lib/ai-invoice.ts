import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ParsedInvoice } from "./dian";

const InvoiceSchema = z.object({
  supplierName: z.string().nullable(),
  supplierNit: z.string().nullable().describe("NIT del proveedor sin dígito de verificación ni puntos"),
  invoiceNumber: z.string().nullable(),
  issueDate: z.string().nullable().describe("Fecha de la factura en formato AAAA-MM-DD"),
  subtotal: z.number().describe("Total antes de IVA en pesos"),
  tax: z.number().describe("Total de IVA en pesos"),
  total: z.number().describe("Total a pagar en pesos"),
  lines: z.array(
    z.object({
      supplierCode: z.string().nullable(),
      description: z.string().describe("Descripción tal como aparece, incluido el peso o la presentación"),
      quantity: z.number(),
      unit: z.string().nullable().describe("Unidad tal como aparece: KG, UND, CAJA, BULTO, LB..."),
      unitPrice: z.number().describe("Precio unitario antes de IVA"),
      lineTotal: z.number().describe("Total de la línea antes de IVA"),
      taxRate: z.number().describe("IVA de la línea como fracción: 0.19, 0.05 o 0"),
    }),
  ),
});

const SYSTEM = `Lees facturas de compra de proveedores colombianos de una tienda de frutos secos, especias y condimentos.
Extrae los datos exactamente como aparecen. Los montos van en pesos colombianos como números sin separadores (1.234.567,50 es 1234567.5).
Si un valor no aparece o no se lee, usa null; no lo inventes. Si el precio unitario aparece con IVA incluido, calcula el valor antes de IVA.`;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Lee una foto o un PDF de factura y devuelve los datos estructurados. */
export async function readInvoiceWithAI(bytes: Uint8Array, mediaType: ImageMediaType | "application/pdf"): Promise<ParsedInvoice> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY: la lectura de fotos de facturas no está configurada");
  }
  const client = new Anthropic();
  const data = Buffer.from(bytes).toString("base64");
  const fileBlock =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType, data } } as const);

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // Si el modelo declina la solicitud, la API la reintenta con el modelo de respaldo recomendado.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(InvoiceSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Extrae los datos de esta factura de compra." }] }],
  });

  if (response.stop_reason === "refusal") throw new Error("La IA no pudo procesar esta imagen");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("No pude leer la factura. Intenta con una foto más nítida y completa.");
  return { ...parsed, cufe: null };
}
