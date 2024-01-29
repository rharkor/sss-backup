import iquirer from "inquirer";
import chalk from "chalk";
import * as fs from "fs/promises";
import { logger } from "./utils/logger";
import { env } from "./utils/env";
import { promisify } from "util";
import { exec as oExec } from "child_process";
import { Spinner } from "cli-spinner";
import { s3Client } from "./utils/s3";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import path from "path";
const exec = promisify(oExec);

let spinner: Spinner | null = null;
const textColor = "#CDCDCD";

export type TOptions = {
  ignoreWeightEstimation?: boolean;
  notInteractive?: boolean;
  noUpload?: boolean;
};

export const makeBackup = async (opts?: TOptions) => {
  const start = Date.now();
  const config = await fs.readFile("./bkp-config.json", "utf-8").catch((e) => {
    logger.error("Error reading config file", e);
    process.exit(1);
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
    process.exit(1);
  }

  if (!parsedConfig.gpgKeyRecipient) {
    logger.error("No GPG key recipient in config");
    process.exit(1);
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
            process.exit(1);
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
      process.exit(0);
    }
  }

  //* Create backup
  spinner = new Spinner(chalk.hex(textColor)(" Creating backup"));
  spinner.setSpinnerString(18);
  spinner.start();
  await fs
    .mkdir(`.tmp/${backupName}`, {
      recursive: true,
    })
    .catch((e) => {
      logger.log("");
      logger.error("Error creating tmp directory");
      logger.subLog(e);
      process.exit(1);
    });
  await exec(
    `tar ${exclusions} -czf .tmp/${backupName}/backup.tar.gz ${paths.join(" ")}`
  ).catch((e) => {
    logger.log("");
    logger.error("Error creating backup");
    logger.subLog(e);
    process.exit(1);
  });
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
    await fs
      .rm(`.tmp/${backupName}`, {
        recursive: true,
      })
      .catch((e) => {
        logger.log("");
        logger.error("Error deleting tmp directory");
        logger.subLog(e);
        process.exit(1);
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
      `gpg --yes --batch -e -r ${recipient} -o .tmp/${backupName}/backup.tar.gz.gpg .tmp/${backupName}/backup.tar.gz`
    ).catch((e) => {
      logger.log("");
      logger.error("Error encrypting backup");
      logger.subLog(e);
      throw e;
    });
    spinner.stop(true);
    logger.success("Backup encrypted");

    //* Upload backup
    if (needUpload) {
      spinner = new Spinner(chalk.hex(textColor)(" Uploading backup"));
      spinner.setSpinnerString(18);
      spinner.start();
      await s3Client
        .send(
          new PutObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: path.join(
              parsedConfig.s3Folder ?? "",
              backupName + ".tar.gz.gpg"
            ),
            Body: await fs.readFile(`.tmp/${backupName}/backup.tar.gz.gpg`),
          })
        )
        .catch((e) => {
          logger.log("");
          logger.error("Error uploading backup");
          logger.subLog(e);
          throw e;
        });
      spinner.stop(true);
      logger.success("Backup uploaded");
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
    process.exit(1);
  }
  await deleteTmp();

  const end = Date.now();
  logger.success(
    `Backup completed in ${Math.round((end - start) / 100) / 10}s`
  );

  s3Client.destroy();
  process.exit(0);
};
