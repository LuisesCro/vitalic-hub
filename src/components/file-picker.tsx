"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "./icons";

/** Selector de archivo en español, grande y fácil de tocar en el celular. */
export function FilePicker({ name = "file", accept, hint }: { name?: string; accept: string; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Después de enviar, React limpia el formulario: el nombre mostrado también se limpia.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setFileName(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)]/50 p-4 transition-colors hover:border-brand-500 focus-within:border-brand-500">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-500">
        <IconUpload />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{fileName ?? "Toca para elegir el archivo"}</span>
        <span className="block text-xs text-muted">{fileName ? "Toca para cambiarlo" : hint ?? `Formatos: ${accept.replace("image/*", "fotos").replaceAll(",", ", ")}`}</span>
      </span>
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        required
        className="sr-only"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
    </label>
  );
}
