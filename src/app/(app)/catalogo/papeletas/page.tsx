import { redirect } from "next/navigation";

// La papeleta ahora se llama sachet.
export default function PapeletasRedirect() {
  redirect("/catalogo/sachets");
}
