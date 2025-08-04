import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import path from "path";

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function uploadToS3(localPath: string, filename: string): Promise<string> {
  const fileContent = await readFile(localPath);

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `screenshots/${filename}`,
    Body: fileContent,
    ContentType: "image/png",
  });

  await s3.send(command);

  const bucket = process.env.AWS_S3_BUCKET;
  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/screenshots/${filename}`;
}