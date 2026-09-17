/**
 * Application-wide constants
 */

/**
 * Default lesson duration in minutes
 */
const LESSON_DURATION_MINUTES = 50;

/**
 * Trial lesson duration in minutes
 */
const TRIAL_LESSON_DURATION_MINUTES = 30;

/**
 * The one Worker every desktop talks to (cloud/); the env var points a
 * development build at `wrangler dev`.
 */
const DEFAULT_WORKER_URL =
  process.env.STUDENT_MANAGER_WORKER_URL || 'https://student-manager.student-manager.workers.dev';

module.exports = {
  LESSON_DURATION_MINUTES,
  TRIAL_LESSON_DURATION_MINUTES,
  DEFAULT_WORKER_URL,
};
