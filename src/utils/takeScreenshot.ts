import { Page } from "playwright-core";
import { uploadToS3 } from "./uploadToS3";
import path from "path";

export async function takeScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}-${timestamp}.png`;
  const localPath = `/tmp/screenshots/${filename}`;

  await page.screenshot({ path: localPath });

  const url = await uploadToS3(localPath, filename);
  return url;
}