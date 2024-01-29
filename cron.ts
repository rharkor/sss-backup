import { CronJob } from "cron";
import { logger } from "./utils/logger";
import { makeBackup } from "./backup";

//? Do a task every day at 2AM
export const cron = (cronRate: string) => {
  logger.info(`Cron has been set to ${cronRate}`);
  new CronJob(
    cronRate,
    async () => {
      const maxDurationWarning = 1000 * 60 * 15; // 15 minutes
      const name = "auto-backup";
      const now = new Date();
      await makeBackup({
        ignoreWeightEstimation: true,
        notInteractive: true,
      }).catch((err) => {
        logger.error(
          `[${now.toLocaleString()}] ${name} started at ${now.toLocaleString()} and failed after ${
            new Date().getTime() - now.getTime()
          }ms`
        );
        throw err;
      });
      const took = new Date().getTime() - now.getTime();
      if (took > maxDurationWarning)
        logger.warn(`[${now.toLocaleString()}] ${name} took ${took}ms`);
    },
    null,
    true,
    "Europe/Paris"
  );
};
