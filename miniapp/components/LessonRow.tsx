import type { ViewLesson } from '../overlay';
import { lessonState, lessonTitle } from '../lessonView';
import useStore from '../store';
import { timeOf } from '../time';
import { Dot, Pill, Row } from './ui';

interface Props {
  lesson: ViewLesson;
  tz: string;
  now: Date;
  /** Shown as the title instead of the student, for a list already about one student. */
  title?: string;
  meta?: string;
}

/** A lesson line; tapping opens the action sheet unless the desktop still owes an answer. */
export default function LessonRow({ lesson, tz, now, title, meta }: Props) {
  const openSheet = useStore((s) => s.openSheet);
  const { status, label } = lessonState(lesson, now);
  return (
    <Row
      lead={
        <span className="min-w-[2.75rem] font-semibold tabular-nums">
          {timeOf(lesson.datetime, tz)}
        </span>
      }
      title={title ?? lessonTitle(lesson)}
      meta={meta ? `${meta} · ${label}` : label}
      trail={lesson.pending ? <Pill>очікує ПК</Pill> : <Dot status={status} />}
      onClick={lesson.pending ? undefined : () => openSheet(lesson.id)}
      faded={lesson.pending === 'delete'}
    />
  );
}
