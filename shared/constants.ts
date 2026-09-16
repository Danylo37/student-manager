/**
 * Application-wide constants
 */

/**
 * Default lesson duration in minutes
 */
export const LESSON_DURATION_MINUTES = 50;

/**
 * Trial lesson duration in minutes
 */
export const TRIAL_LESSON_DURATION_MINUTES = 30;

/**
 * How long a lesson lasts: a trial one is shorter.
 */
export function lessonDurationMinutes(isTrial: boolean | number = false): number {
  return isTrial ? TRIAL_LESSON_DURATION_MINUTES : LESSON_DURATION_MINUTES;
}
