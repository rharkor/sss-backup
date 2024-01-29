import { makeBackup } from "./backup";
import { cron } from "./cron";
import { env } from "./utils/env";

const cronRate = env.CRON;
if (cronRate) {
  cron(cronRate);
} else {
  makeBackup();
}
