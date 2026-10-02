import { XMLParser } from "fast-xml-parser";
import { unzipSync, strFromU8 } from "fflate";

/** Factura de compra en un formato común, venga de XML DIAN o de una foto leída con IA. */
export type ParsedInvoice = {
  supplierName: string | null;
  supplierNit: string | null;
  invoiceNumber: string | null;
  cufe: string | null;
  issueDate: string | null; // AAAA-MM-DD
  subtotal: number;
  tax: number;
  total: number;
  lines: ParsedInvoiceLine[];
};

export type ParsedInvoiceLine = {
  supplierCode: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  lineTotal: number;
  taxRate: number; // fracción: 0.19
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  parseTagValue: false,
  isArray: (name) => ["InvoiceLine", "TaxSubtotal", "TaxTotal", "Attachment"].includes(name),
});

type Node = Record<string, unknown> | string | undefined;

function text(node: Node): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "object" && "#text" in node) return String(node["#text"]).trim() || null;
  return null;
}

function num(node: Node): number {
  const value = text(node);
  return value ? Number(value) : 0;
}

function get(node: unknown, ...path: string[]): Node {
  let current: unknown = node;
  for (const key of path) {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) current = current[0];
    current = (current as Record<string, unknown>)[key];
  }
  if (Array.isArray(current)) return current[0] as Node;
  return current as Node;
}

/** Extrae la factura (Invoice) de un AttachedDocument de la DIAN o devuelve el Invoice tal cual. */
function findInvoice(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc.Invoice) return doc.Invoice as Record<string, unknown>;
  if (doc.AttachedDocument) {
    const attached = doc.AttachedDocument as Record<string, unknown>;
    const embedded = text(get(attached, "Attachment", "ExternalReference", "Description"));
    if (embedded) {
      const inner = parser.parse(embedded) as Record<string, unknown>;
      if (inner.Invoice) return inner.Invoice as Record<string, unknown>;
    }
  }
  throw new Error("El archivo no contiene una factura electrónica (Invoice) de la DIAN");
}

export function parseDianXml(xml: string): ParsedInvoice {
  const invoice = findInvoice(parser.parse(xml) as Record<string, unknown>);
  const party = get(invoice, "AccountingSupplierParty", "Party");
  const supplierName =
    text(get(party, "PartyTaxScheme", "RegistrationName")) ??
    text(get(party, "PartyLegalEntity", "RegistrationName")) ??
    text(get(party, "PartyName", "Name"));
  const supplierNit =
    text(get(party, "PartyTaxScheme", "CompanyID")) ?? text(get(party, "PartyLegalEntity", "CompanyID"));

  const rawLines = (invoice.InvoiceLine as Record<string, unknown>[] | undefined) ?? [];
  const lines: ParsedInvoiceLine[] = rawLines.map((line) => {
    const qtyNode = get(line, "InvoicedQuantity");
    const unit = typeof qtyNode === "object" && qtyNode ? String(qtyNode["@_unitCode"] ?? "") || null : null;
    const percent = num(get(line, "TaxTotal", "TaxSubtotal", "TaxCategory", "Percent"));
    return {
      supplierCode:
        text(get(line, "Item", "SellersItemIdentification", "ID")) ??
        text(get(line, "Item", "StandardItemIdentification", "ID")),
      description: text(get(line, "Item", "Description")) ?? "Sin descripción",
      quantity: num(qtyNode),
      unit,
      unitPrice: num(get(line, "Price", "PriceAmount")),
      lineTotal: num(get(line, "LineExtensionAmount")),
      taxRate: percent / 100,
    };
  });

  const totals = get(invoice, "LegalMonetaryTotal");
  const subtotal = num(get(totals, "LineExtensionAmount"));
  const total = num(get(totals, "PayableAmount")) || num(get(totals, "TaxInclusiveAmount"));
  const taxTotals = (invoice.TaxTotal as Record<string, unknown>[] | undefined) ?? [];
  const tax = taxTotals.reduce((sum, t) => sum + num(get(t, "TaxAmount")), 0);

  return {
    supplierName,
    supplierNit,
    invoiceNumber: text(get(invoice, "ID")),
    cufe: text(get(invoice, "UUID")),
    issueDate: text(get(invoice, "IssueDate")),
    subtotal,
    tax,
    total,
    lines,
  };
}

/** Acepta el .zip que llega al correo (XML + PDF) o el .xml directo. */
export function parseDianFile(fileName: string, bytes: Uint8Array): ParsedInvoice {
  if (fileName.toLowerCase().endsWith(".zip")) {
    const files = unzipSync(bytes);
    const xmlName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".xml"));
    if (!xmlName) throw new Error("El .zip no trae un archivo XML de factura");
    return parseDianXml(strFromU8(files[xmlName]));
  }
  return parseDianXml(new TextDecoder("utf-8").decode(bytes));
}
