import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
	"notifications-daily",
	{ hourUTC: 13, minuteUTC: 0 },
	internal.notifications.processDaily,
);

crons.daily(
	"attachments-pending-cleanup",
	{ hourUTC: 4, minuteUTC: 0 },
	internal.attachments.cleanupExpiredPendingUploads,
);

export default crons;
