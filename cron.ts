import { CronJob } from "cron";
import { logger } from "./utils/logger";
import { makeBackup } from "./backup";

//? Do a task every day at 2AM
export const cron = (cronRate: string) => {
  logger.info(`Cron has been set to ${cronRate}`);
  return new CronJob(
    cronRate,
    async () => {
      const name = "auto-backup";
      const now = new Date();
      // await makeBackup({
      //   ignoreWeightEstimation: true,
      //   notInteractive: true,
      // }).catch((err) => {
      //   logger.error(
      //     `[${now.toLocaleString()}] ${name} started at ${now.toLocaleString()} and failed after ${
      //       new Date().getTime() - now.getTime()
      //     }ms`
      //   );
      //   throw err;
      // });
      await (async () => {
        console.log("test");
      })();
    },
    null,
    true,
    "Europe/Paris"
  );
};
