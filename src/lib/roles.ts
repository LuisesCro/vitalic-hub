export type Role = "admin" | "cajera";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador (todo)",
  cajera: "Cajera (solo Caja)",
};

export function isRole(value: string): value is Role {
  return value === "admin" || value === "cajera";
}

