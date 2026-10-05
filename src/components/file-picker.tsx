"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "./icons";

/** Selector de archivo en español, grande y fácil de tocar en el celular. */
/**
 * Las fotos del celular pesan de 3 a 8 MB y el servidor rechaza cuerpos de más de ~4,5 MB.
 * Se reducen aquí (lado mayor 2000 px, JPEG) antes de enviarlas; se sigue leyendo bien el texto.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 1_200_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function FilePicker({ name = "file", accept, hint, multiple = false }: { name?: string; accept: string; hint?: string; multiple?: boolean }) {
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
        multiple={multiple}
        required
        className="sr-only"
        onChange={async (e) => {
          const input = e.target;
          const file = input.files?.[0];
          const count = input.files?.length ?? 0;
          setFileName(count > 1 ? `${count} archivos elegidos` : file?.name ?? null);
          if (!file || count > 1) return;
          const small = await shrinkImage(file);
          if (small !== file) {
            const data = new DataTransfer();
            data.items.add(small);
            input.files = data.files;
          }
        }}
      />
    </label>
  );
}
