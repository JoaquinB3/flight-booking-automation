import type { Page } from "playwright-core";
import { takeStepScreenshot } from "./takeStepScreenshot";
import { uploadToS3 } from "./uploadToS3";

export type StepResult = {
  name: string;
  status: "success" | "error";
  durationMs: number;
  screenshotUrl?: string;
  errorMessage?: string;
};

export const stepResults: StepResult[] = [];

export async function runStep(
  name: string,
  fn: () => Promise<void>,
  page: Page
) {
  const start = Date.now();
  const result: StepResult = {
    name,
    status: "success",
    durationMs: 0,
  };

  try {
    await fn();
  } catch (error: any) {
    result.status = "error";
    result.errorMessage = error.message;
    // No hagas throw todavía, esperá al final
  }

  try {
    const localPath = await takeStepScreenshot(page, name);
    const filename = localPath.split("/").pop()!;
    result.screenshotUrl = await uploadToS3(localPath, filename);
  } catch (e) {
    // No detengas el test por error al subir screenshot
    console.error(`❌ Failed to capture/upload screenshot for "${name}":`, e);
  }

  result.durationMs = Date.now() - start;
  stepResults.push(result);

  if (result.status === "error") {
    throw new Error(result.errorMessage);
  }
}