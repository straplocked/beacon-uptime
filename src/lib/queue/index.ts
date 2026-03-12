import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Cast needed because BullMQ bundles its own ioredis types
const connection = redis as any;

export const monitorCheckQueue = new Queue("monitor-checks", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const notificationQueue = new Queue("notifications", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
  },
});
