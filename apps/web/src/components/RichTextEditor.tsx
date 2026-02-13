import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export const sanitizeContent = (value: string) => value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

const applySelectionFormat = (
  source: string,
  start: number,
  end: number,
  prefix: string,
  suffix = prefix,
  fallback = 'text',
) => {
  const selectedText = source.slice(start, end);
  const textToWrap = selectedText || fallback;
  const formattedText = `${prefix}${textToWrap}${suffix}`;
  const nextValue = `${source.slice(0, start)}${formattedText}${source.slice(end)}`;
  const cursorPosition = start + formattedText.length;

  return { nextValue, cursorPosition };
};

const insertAtCursor = (source: string, start: number, end: number, snippet: string) => {
  const nextValue = `${source.slice(0, start)}${snippet}${source.slice(end)}`;
  const cursorPosition = start + snippet.length;

  return { nextValue, cursorPosition };
};

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const withSelection = (
    formatter: (source: string, start: number, end: number) => { nextValue: string; cursorPosition: number },
  ) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd } = textarea;
    const { nextValue, cursorPosition } = formatter(value, selectionStart, selectionEnd);
    onChange(sanitizeContent(nextValue));

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => withSelection((source, start, end) => applySelectionFormat(source, start, end, '**'))}>Bold</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => withSelection((source, start, end) => applySelectionFormat(source, start, end, '*'))}>Italic</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => withSelection((source, start, end) => applySelectionFormat(source, start, end, '__'))}>Underline</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => withSelection((source, start, end) => insertAtCursor(source, start, end, '\n- '))}>Bullets</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => withSelection((source, start, end) => insertAtCursor(source, start, end, '\n1. '))}>Numbered</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => withSelection((source, start, end) => insertAtCursor(source, start, end, '\n# '))}>Heading</Button>
      </div>
      <Textarea
        ref={textareaRef}
        rows={18}
        value={value}
        onChange={(event) => onChange(sanitizeContent(event.target.value))}
        placeholder="Compose letter body"
      />
    </div>
  );
}
