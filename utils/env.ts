import { logger } from "./logger";

const getValue = <
  R extends boolean,
  D extends string | undefined,
  O extends R extends true
    ? string
    : D extends string
    ? string
    : string | undefined
>({
  key,
  defaultValue,
  required,
}: {
  key: string;
  defaultValue?: D;
  required?: R;
}): O => {
  const value = process.env[key];
  if (required && !value) {
    logger.error(`Missing required env variable ${key}`);
    process.exit(1);
  }
  return (value || defaultValue) as O;
};

export const env = {
  S3_REGION: getValue({ key: "S3_REGION", required: true }),
  S3_BUCKET_NAME: getValue({ key: "S3_BUCKET_NAME", required: true }),
  S3_ACCESS_KEY_ID: getValue({ key: "S3_ACCESS_KEY_ID", required: true }),
  S3_SECRET_ACCESS_KEY: getValue({
    key: "S3_SECRET_ACCESS_KEY",
    required: true,
  }),
  S3_ENDPOINT: getValue({ key: "S3_ENDPOINT", required: true }),
  HOST_ROOT: getValue({ key: "HOST_ROOT", required: false, defaultValue: "" }),
  CRON: getValue({ key: "CRON", required: false }),
};
