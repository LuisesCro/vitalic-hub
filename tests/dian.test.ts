import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseDianFile, parseDianXml } from "@/lib/dian";

const invoice = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-659184</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">abc123cufe</cbc:UUID>
  <cbc:IssueDate>2026-09-24</cbc:IssueDate>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:RegistrationName>PRODUCTOS 3A SAS</cbc:RegistrationName><cbc:CompanyID schemeID="7">900123456</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="COP">158798</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">835780</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">994578</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">994578</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">835780</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount currencyID="COP">158798</cbc:TaxAmount>
      <cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item><cbc:Description>ALMENDRA ENTERA CAJA X 22,68 KG</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>ALM001</cbc:ID></cac:SellersItemIdentification></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="COP">835780</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const attached = `<?xml version="1.0" encoding="UTF-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cac:Attachment><cac:ExternalReference><cbc:MimeCode>text/xml</cbc:MimeCode>
    <cbc:Description><![CDATA[${invoice}]]></cbc:Description>
  </cac:ExternalReference></cac:Attachment>
</AttachedDocument>`;

describe("parseDianXml", () => {
  it("lee una factura UBL", () => {
    const r = parseDianXml(invoice);
    expect(r.supplierName).toBe("PRODUCTOS 3A SAS");
    expect(r.supplierNit).toBe("900123456");
    expect(r.invoiceNumber).toBe("FE-659184");
    expect(r.cufe).toBe("abc123cufe");
    expect(r.issueDate).toBe("2026-09-24");
    expect(r.total).toBe(994578);
    expect(r.tax).toBe(158798);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ supplierCode: "ALM001", quantity: 1, unit: "NIU", lineTotal: 835780, taxRate: 0.19 });
  });

  it("lee la factura dentro de un AttachedDocument", () => {
    expect(parseDianXml(attached).invoiceNumber).toBe("FE-659184");
  });

  it("abre el .zip del correo", () => {
    const zip = zipSync({ "ad0900123456.xml": strToU8(attached), "factura.pdf": strToU8("%PDF") });
    expect(parseDianFile("z.zip", zip).cufe).toBe("abc123cufe");
  });
});
