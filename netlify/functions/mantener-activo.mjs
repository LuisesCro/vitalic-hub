// Netlify apaga el servidor cuando nadie lo usa y la primera visita tarda varios
// segundos en despertarlo. Esta tarea lo visita cada 5 minutos para que esté listo.
export default async () => {
  const base = process.env.URL ?? "https://vitalic-hub.netlify.app";
  await fetch(`${base}/api/salud?ligero=1`).catch(() => {});
};

export const config = { schedule: "*/5 * * * *" };
