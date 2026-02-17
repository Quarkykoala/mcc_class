import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type EditorMode = 'write' | 'preview';

type TransformResult = {
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
};

type TextTransform = (source: string, start: number, end: number) => TransformResult;

const SCRIPT_TAG_PATTERN = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const BULLET_PATTERN = /^(\s*)-\s+/;
const ORDERED_PATTERN = /^(\s*)\d+\.\s+/;
const HEADING_PATTERN = /^(\s*)#{1,6}\s+/;

export const sanitizeContent = (value: string) => value.replace(SCRIPT_TAG_PATTERN, '');

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatInlineMarkdown = (value: string) => {
  let formatted = value;

  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__(.+?)__/g, '<u>$1</u>');
  formatted = formatted.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');

  return formatted;
};

const renderMarkdownPreview = (source: string) => {
  const safeSource = escapeHtml(source);
  const lines = safeSource.split('\n');
  const html: string[] = [];
  let activeList: 'ul' | 'ol' | null = null;
  let paragraphLines: string[] = [];

  const closeList = () => {
    if (!activeList) {
      return;
    }

    html.push(`</${activeList}>`);
    activeList = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    html.push(`<p>${paragraphLines.map((line) => formatInlineMarkdown(line)).join('<br />')}</p>`);
    paragraphLines = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();

      const level = headingMatch[1].length;
      html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (activeList !== 'ul') {
        closeList();
        html.push('<ul>');
        activeList = 'ul';
      }

      html.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (activeList !== 'ol') {
        closeList();
        html.push('<ol>');
        activeList = 'ol';
      }

      html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  closeList();

  return html.join('');
};

const toggleInlineMarker = (
  source: string,
  start: number,
  end: number,
  marker: string,
  placeholder: string,
): TransformResult => {
  const selectedText = source.slice(start, end);
  const markerLength = marker.length;

  if (start !== end) {
    const hasSurroundingMarkers =
      start >= markerLength
      && source.slice(start - markerLength, start) === marker
      && source.slice(end, end + markerLength) === marker;

    if (hasSurroundingMarkers) {
      const nextValue = `${source.slice(0, start - markerLength)}${selectedText}${source.slice(end + markerLength)}`;
      return {
        nextValue,
        selectionStart: start - markerLength,
        selectionEnd: end - markerLength,
      };
    }

    const selectionIncludesMarkers =
      selectedText.startsWith(marker)
      && selectedText.endsWith(marker)
      && selectedText.length >= markerLength * 2;

    if (selectionIncludesMarkers) {
      const unwrapped = selectedText.slice(markerLength, selectedText.length - markerLength);
      const nextValue = `${source.slice(0, start)}${unwrapped}${source.slice(end)}`;
      return {
        nextValue,
        selectionStart: start,
        selectionEnd: start + unwrapped.length,
      };
    }

    const wrappedText = `${marker}${selectedText}${marker}`;
    const nextValue = `${source.slice(0, start)}${wrappedText}${source.slice(end)}`;

    return {
      nextValue,
      selectionStart: start + markerLength,
      selectionEnd: start + markerLength + selectedText.length,
    };
  }

  const insertedText = `${marker}${placeholder}${marker}`;
  const nextValue = `${source.slice(0, start)}${insertedText}${source.slice(end)}`;

  return {
    nextValue,
    selectionStart: start + markerLength,
    selectionEnd: start + markerLength + placeholder.length,
  };
};

const transformSelectedLines = (
  source: string,
  start: number,
  end: number,
  transformLines: (lines: string[]) => string[],
): TransformResult => {
  const blockStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const blockEndBreak = source.indexOf('\n', end);
  const blockEnd = blockEndBreak === -1 ? source.length : blockEndBreak;

  const block = source.slice(blockStart, blockEnd);
  const transformedBlock = transformLines(block.split('\n')).join('\n');
  const nextValue = `${source.slice(0, blockStart)}${transformedBlock}${source.slice(blockEnd)}`;

  return {
    nextValue,
    selectionStart: blockStart,
    selectionEnd: blockStart + transformedBlock.length,
  };
};

const toggleBullets: TextTransform = (source, start, end) =>
  transformSelectedLines(source, start, end, (lines) => {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const allBulleted = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => BULLET_PATTERN.test(line));

    if (allBulleted) {
      return lines.map((line) => line.replace(BULLET_PATTERN, '$1'));
    }

    return lines.map((line) => {
      if (!line.trim()) {
        return line;
      }

      const withoutExistingPrefix = line.replace(BULLET_PATTERN, '$1').replace(ORDERED_PATTERN, '$1');
      return withoutExistingPrefix.replace(/^(\s*)/, '$1- ');
    });
  });

const toggleNumberedList: TextTransform = (source, start, end) =>
  transformSelectedLines(source, start, end, (lines) => {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const allOrdered = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => ORDERED_PATTERN.test(line));

    if (allOrdered) {
      return lines.map((line) => line.replace(ORDERED_PATTERN, '$1'));
    }

    let nextIndex = 1;
    return lines.map((line) => {
      if (!line.trim()) {
        return line;
      }

      const withoutExistingPrefix = line.replace(BULLET_PATTERN, '$1').replace(ORDERED_PATTERN, '$1');
      const transformedLine = withoutExistingPrefix.replace(/^(\s*)/, (_match, indentation: string) => `${indentation}${nextIndex}. `);
      nextIndex += 1;

      return transformedLine;
    });
  });

const toggleHeading: TextTransform = (source, start, end) =>
  transformSelectedLines(source, start, end, (lines) => {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const allHeadings = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => HEADING_PATTERN.test(line));

    if (allHeadings) {
      return lines.map((line) => line.replace(HEADING_PATTERN, '$1'));
    }

    return lines.map((line) => {
      if (!line.trim()) {
        return line;
      }

      const withoutHeading = line.replace(HEADING_PATTERN, '$1');
      return withoutHeading.replace(/^(\s*)/, '$1# ');
    });
  });

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<EditorMode>('write');
  const previewHtml = useMemo(() => renderMarkdownPreview(value), [value]);

  const applyTransform = (transformer: TextTransform) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const source = textarea.value;
    const { nextValue, selectionStart, selectionEnd } = transformer(source, start, end);
    onChange(sanitizeContent(nextValue));

    requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) {
        return;
      }

      nextTextarea.focus();
      nextTextarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const handleKeyboardShortcuts = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 'b') {
      event.preventDefault();
      applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '**', 'bold text'));
      return;
    }

    if (key === 'i') {
      event.preventDefault();
      applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '*', 'italic text'));
      return;
    }

    if (key === 'u') {
      event.preventDefault();
      applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '++', 'underlined text'));
    }
  };

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={(nextMode) => setMode(nextMode === 'preview' ? 'preview' : 'write')} className="space-y-2">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="write" className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '**', 'bold text'))}>Bold</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '*', 'italic text'))}>Italic</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '++', 'underlined text'))}>Underline</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTransform(toggleBullets)}>Bullets</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTransform(toggleNumberedList)}>Numbered</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTransform(toggleHeading)}>Heading</Button>
          </div>

          <Textarea
            ref={textareaRef}
            rows={18}
            className="min-h-[24rem] resize-y font-mono text-sm leading-6"
            value={value}
            onKeyDown={handleKeyboardShortcuts}
            onChange={(event) => onChange(sanitizeContent(event.target.value))}
            placeholder="Compose letter body in markdown"
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          <div className="min-h-[24rem] rounded-md border border-input bg-background px-4 py-3 text-sm leading-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:mb-3 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:mb-3 [&_strong]:font-semibold [&_u]:underline [&_ul]:mb-3 [&_ul]:ml-6 [&_ul]:list-disc">
            {previewHtml
              ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              : <p className="text-muted-foreground">Nothing to preview yet.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
