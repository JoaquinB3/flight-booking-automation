import type { Page } from "playwright-core";
import { promises as fs } from "fs";

export async function takeStepScreenshot(page: Page, stepName: string): Promise<string> {
  const sanitizedStepName = stepName.replace(/\s+/g, "_").toLowerCase();
  const filename = `step-${sanitizedStepName}-${Date.now()}.png`;
  const localPath = `/tmp/screenshots/${filename}`;

  await fs.mkdir("/tmp/screenshots", { recursive: true });
  await page.screenshot({ path: localPath });

  // Aquí sólo devuelves la ruta local, porque en runStep quizás sólo guardás localmente
  // O si querés subir a S3 en cada paso, agregamos lógica similar a la función final.

  return localPath;
}