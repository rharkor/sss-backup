import iquirer from "inquirer";
import chalk from "chalk";
import * as fs from "fs";
import { logger } from "./utils/logger";
import { env } from "./utils/env";
import { promisify } from "util";
import { exec as oExec } from "child_process";
import { Spinner } from "cli-spinner";
import { s3Client } from "./utils/s3";
import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
const exec = promisify(oExec);

let spinner: Spinner | null = null;
const textColor = "#CDCDCD";

export type TOptions = {
  ignoreWeightEstimation?: boolean;
  notInteractive?: boolean;
  noUpload?: boolean;
};

function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export const makeBackup = async (opts?: TOptions) => {
  const start = Date.now();
  const config = await fs.promises
    .readFile("./bkp-config.json", "utf-8")
    .catch((e) => {
      logger.error("Error reading config file", e);
      throw e;
    });
  const parsedConfig = JSON.parse(config) as {
    paths: string[] | undefined;
    ignore: string[] | undefined;
    gpgKeyRecipient: string | undefined;
    noUpload: boolean | undefined;
    s3Folder?: string;
    deleteOlderThan?: string;
    deleteAll?: boolean;
  };

  if (!parsedConfig.paths) {
    logger.error("No paths to backup in config");
    throw new Error("No paths to backup in config");
  }

  if (!parsedConfig.gpgKeyRecipient) {
    logger.error("No GPG key recipient in config");
    throw new Error("No GPG key recipient in config");
  }

  const { paths: _paths, ignore } = parsedConfig;
  const hostRoot = env.HOST_ROOT;
  const paths = _paths.map((p) => path.join(hostRoot, p));

  const backupName = "sss-bkp--" + new Date().toISOString();

  //* Get each directory's size (using du)
  const exclusions = ignore?.map((path) => `--exclude ${path}`).join(" ");
  if (!opts?.ignoreWeightEstimation) {
    spinner = new Spinner(
      chalk.hex(textColor)(" Getting sizes of directories")
    );
    spinner.setSpinnerString(18);
    spinner.start();
    const sizes = await Promise.all(
      paths.map(async (path) => {
        spinner!.setSpinnerTitle(
          chalk.hex(textColor)(` Getting size of directories (${path})`)
        );
        const { stdout } = await exec(`du -s ${exclusions} ${path}`).catch(
          (e) => {
            logger.log("");
            logger.error(`Error getting size of ${path}`);
            logger.subLog(e);
            throw e;
          }
        );
        const size = parseInt(stdout.split("\t")[0]);
        return size;
      })
    );
    spinner.stop(true);
    sizes.forEach((size, i) => {
      let sizeStr = "";
      if (size > 1000000) {
        sizeStr = `${Math.round(size / 100000) / 10} GB`;
      } else if (size > 1000) {
        sizeStr = `${Math.round(size / 100) / 10} MB`;
      } else {
        sizeStr = `${size} KB`;
      }
      logger.info(`${paths[i]}: ${sizeStr}`);
    });
    logger.log("");
    const total = sizes.reduce((a, b) => a + b);
    let totalStr = "";
    if (total > 1000000) {
      totalStr = `${Math.round(total / 100000) / 10} GB`;
    } else if (total > 1000) {
      totalStr = `${Math.round(total / 100) / 10} MB`;
    } else {
      totalStr = `${total} KB`;
    }
    logger.info("Total size: " + totalStr);
  }

  //* Confirm backup
  if (!opts?.notInteractive) {
    const { confirm } = await iquirer.prompt({
      type: "confirm",
      name: "confirm",
      message: "Confirm backup?",
      default: true,
    });
    if (!confirm) {
      logger.log("Aborting backup");
      return;
    }
  }

  //* Create backup
  spinner = new Spinner(chalk.hex(textColor)(` Creating backup`));
  spinner.setSpinnerString(18);
  spinner.start();
  await fs.promises
    .mkdir(`.tmp/${backupName}`, {
      recursive: true,
    })
    .catch((e) => {
      logger.log("");
      logger.error("Error creating tmp directory");
      logger.subLog(e);
      throw e;
    });
  const tar = exec(
    `tar ${exclusions} -czf .tmp/${backupName}/backup.tar.gz ${paths.join(" ")}`
  ).catch((e) => {
    logger.log("");
    logger.error("Error creating backup");
    logger.subLog(e);
    throw e;
  });
  const tarInterval = setInterval(async () => {
    // Each 5 seconds, update the spinner with the current size of the backup
    if (!spinner) {
      return;
    }
    const size = (await fs.promises.stat(`.tmp/${backupName}/backup.tar.gz`))
      .size;
    const sizeStr = formatBytes(size);
    spinner.setSpinnerTitle(
      chalk.hex(textColor)(` Creating backup (${sizeStr})`)
    );
  }, 5000);
  await tar;
  clearInterval(tarInterval);
  spinner.stop(true);
  logger.success("Backup created");

  const needUpload = !opts?.noUpload && !parsedConfig.noUpload;
  const deleteTmp = async () => {
    if (!needUpload) {
      logger.log("Skipping deletion of tmp directory due to no upload");
      return;
    }
    //* Delete backup
    spinner = new Spinner(chalk.hex(textColor)(" Deleting backup"));
    spinner.setSpinnerString(18);
    spinner.start();
    await fs.promises
      .rm(`.tmp/${backupName}`, {
        recursive: true,
      })
      .catch((e) => {
        logger.log("");
        logger.error("Error deleting tmp directory");
        logger.subLog(e);
        throw e;
      });
    spinner.stop(true);
  };

  try {
    //* Encrypt backup with GPG
    spinner = new Spinner(chalk.hex(textColor)(" Encrypting backup"));
    spinner.setSpinnerString(18);
    spinner.start();
    const recipient = parsedConfig.gpgKeyRecipient;
    await exec(
      `gpg --yes --trust-model always --batch -e -r ${recipient} -o .tmp/${backupName}/backup.tar.gz.gpg .tmp/${backupName}/backup.tar.gz`
    ).catch((e) => {
      logger.log("");
      logger.error("Error encrypting backup");
      logger.subLog(e);
      throw e;
    });
    spinner.stop(true);
    logger.success("Backup encrypted");

    //* Upload backup
    //* Upload backup
    if (needUpload) {
      let attempts = 0;
      const maxAttempts = 5;
      let success = false;
      while (!success && attempts < maxAttempts) {
        attempts++;
        try {
          spinner = new Spinner(chalk.hex(textColor)(" Uploading backup"));
          spinner.setSpinnerString(18);
          spinner.start();

          const filePath = `.tmp/${backupName}/backup.tar.gz.gpg`;
          const fileStream = fs.createReadStream(filePath);

          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: env.S3_BUCKET_NAME,
              Key:
                path.join(parsedConfig.s3Folder ?? "", backupName) +
                ".tar.gz.gpg",
              Body: fileStream,
            },
            partSize: 5 * 1024 * 1024, // Adjust part size as needed, this is 5 MB
            queueSize: 4, // Adjust queue size as needed
          });

          fileStream.on("error", (e) => {
            logger.log("");
            logger.error("Error uploading backup");
            logger.subLog(e);
            throw e;
          });

          upload.on("httpUploadProgress", (progress) => {
            if (!spinner || !progress.total || !progress.loaded) {
              return;
            }
            spinner.setSpinnerTitle(
              chalk.hex(textColor)(
                ` Uploading backup (${Math.round(
                  (progress.loaded / progress.total) * 100
                )}%)`
              )
            );
          });

          await upload.done().catch((e) => {
            logger.log("");
            logger.error("Error uploading backup");
            logger.subLog(e);
            throw e;
          });
          spinner.stop(true);
          logger.success("Backup uploaded");
          success = true;
        } catch (e) {
          if (attempts < maxAttempts) {
            logger.log("");
            logger.error(
              `Error uploading backup, retrying (${attempts}/${maxAttempts})`
            );
            logger.subLog(e);
          } else {
            logger.log("");
            logger.error("Error uploading backup");
            logger.subLog(e);
            throw e;
          }
        }
      }
    }

    //* Delete old backups
    if (parsedConfig.deleteOlderThan || parsedConfig.deleteAll) {
      spinner = new Spinner(chalk.hex(textColor)(" Deleting old backups"));
      spinner.setSpinnerString(18);
      spinner.start();
      const { Contents } = await s3Client
        .send(
          new ListObjectsV2Command({
            Bucket: env.S3_BUCKET_NAME,
            Prefix: parsedConfig.s3Folder ?? "",
          })
        )
        .catch((e) => {
          logger.log("");
          logger.error("Error listing old backups");
          logger.subLog(e);
          throw e;
        });
      const backups = Contents?.map((c) => c.Key).filter(
        (key) => key && key.includes(".tar.gz.gpg")
      ) as string[];
      if (!backups) {
        logger.log("");
        logger.error("Error listing old backups");
        throw new Error("Error listing old backups");
      }
      const now = Date.now();
      const backupsToDelete = backups.filter((key) => {
        if (parsedConfig.deleteAll) {
          // Not the current backup
          return (
            key !==
            path.join(parsedConfig.s3Folder ?? "", backupName) + ".tar.gz.gpg"
          );
        }
        const backupDate = new Date(
          key
            .replace("sss-bkp--", "")
            .replace(parsedConfig.s3Folder + "/" ?? "", "")
            .replace(".tar.gz.gpg", "")
        );
        if (parsedConfig.deleteOlderThan) {
          const deleteDate = parseInt(parsedConfig.deleteOlderThan);
          if (isNaN(deleteDate)) {
            logger.log("");
            logger.error(
              `Error parsing deleteOlderThan in config: ${parsedConfig.deleteOlderThan}`
            );
            throw new Error(
              `Error parsing deleteOlderThan in config: ${parsedConfig.deleteOlderThan}`
            );
          }
          return now - backupDate.getTime() > deleteDate;
        }
        return false;
      });
      await Promise.all(
        backupsToDelete.map((key) =>
          s3Client
            .send(
              new DeleteObjectCommand({
                Bucket: env.S3_BUCKET_NAME,
                Key: key,
              })
            )
            .catch((e) => {
              logger.log("");
              logger.error(`Error deleting old backup ${key}`);
              logger.subLog(e);
              throw e;
            })
        )
      );
      spinner.stop(true);
      logger.success(`Old backups deleted (${backupsToDelete.length})`);
    }
  } catch (e) {
    await deleteTmp();
    throw e;
  }
  await deleteTmp();

  const end = Date.now();
  logger.success(
    `Backup completed in ${Math.round((end - start) / 100) / 10}s`
  );

  s3Client.destroy();
  return;
};
