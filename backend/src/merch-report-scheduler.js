import { query } from './db.js';
import { logInfo, logError } from './logger.js';
import { executeSchedule, ensureTables } from './routes/merch-report-schedules.js';

export async function executeMerchReportSchedules() {
  try {
    await ensureTables();
    const r = await query(
      `SELECT * FROM merch_report_schedules
       WHERE active = true
         AND next_run_at IS NOT NULL
         AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT 20`
    );
    for (const sched of r.rows) {
      try {
        const out = await executeSchedule(sched);
        logInfo('merch-report-scheduler.executed', {
          scheduleId: sched.id, results: out.results.length, next: out.next_run_at,
        });
      } catch (err) {
        logError('merch-report-scheduler.exec_error', err, { scheduleId: sched.id });
      }
    }
  } catch (err) {
    logError('merch-report-scheduler.tick_error', err);
  }
}
