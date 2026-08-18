import type { KeyboardEvent } from 'react';

/**
 * Enter confirms the form. Buttons and textareas keep their native behavior.
 * Works even inside react-datepicker, which swallows the native form submit.
 */
export function submitOnEnter(handler: () => void) {
  return (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
    e.preventDefault();
    handler();
  };
}
