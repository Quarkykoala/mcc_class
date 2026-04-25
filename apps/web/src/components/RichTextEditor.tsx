import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

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
    if (!activeList) return;
    html.push(`</${activeList}>`);
    activeList = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
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
      return { nextValue, selectionStart: start - markerLength, selectionEnd: end - markerLength };
    }
    const selectionIncludesMarkers =
      selectedText.startsWith(marker)
      && selectedText.endsWith(marker)
      && selectedText.length >= markerLength * 2;
    if (selectionIncludesMarkers) {
      const unwrapped = selectedText.slice(markerLength, selectedText.length - markerLength);
      const nextValue = `${source.slice(0, start)}${unwrapped}${source.slice(end)}`;
      return { nextValue, selectionStart: start, selectionEnd: start + unwrapped.length };
    }
    const wrappedText = `${marker}${selectedText}${marker}`;
    const nextValue = `${source.slice(0, start)}${wrappedText}${source.slice(end)}`;
    return { nextValue, selectionStart: start + markerLength, selectionEnd: start + markerLength + selectedText.length };
  }
  const insertedText = `${marker}${placeholder}${marker}`;
  const nextValue = `${source.slice(0, start)}${insertedText}${source.slice(end)}`;
  return { nextValue, selectionStart: start + markerLength, selectionEnd: start + markerLength + placeholder.length };
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
  return { nextValue, selectionStart: blockStart, selectionEnd: blockStart + transformedBlock.length };
};

const toggleBullets: TextTransform = (source, start, end) =>
  transformSelectedLines(source, start, end, (lines) => {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const allBulleted = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => BULLET_PATTERN.test(line));
    if (allBulleted) return lines.map((line) => line.replace(BULLET_PATTERN, '$1'));
    return lines.map((line) => {
      if (!line.trim()) return line;
      const withoutExistingPrefix = line.replace(BULLET_PATTERN, '$1').replace(ORDERED_PATTERN, '$1');
      return withoutExistingPrefix.replace(/^(\s*)/, '$1- ');
    });
  });

const toggleNumberedList: TextTransform = (source, start, end) =>
  transformSelectedLines(source, start, end, (lines) => {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const allOrdered = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => ORDERED_PATTERN.test(line));
    if (allOrdered) return lines.map((line) => line.replace(ORDERED_PATTERN, '$1'));
    let nextIndex = 1;
    return lines.map((line) => {
      if (!line.trim()) return line;
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
    if (allHeadings) return lines.map((line) => line.replace(HEADING_PATTERN, '$1'));
    return lines.map((line) => {
      if (!line.trim()) return line;
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
    if (!textarea) return;
    const { nextValue, selectionStart, selectionEnd } = transformer(textarea.value, textarea.selectionStart, textarea.selectionEnd);
    onChange(sanitizeContent(nextValue));
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const handleKeyboardShortcuts = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '**', 'bold text'));
    } else if (key === 'i') {
      event.preventDefault();
      applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '*', 'italic text'));
    } else if (key === 'u') {
      event.preventDefault();
      applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '++', 'underlined text'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <ul className="nav nav-pills nav-pills-primary flex gap-2 p-1 bg-gray-100/50 rounded-lg">
          <li className="nav-item">
            <button 
              className={`nav-link px-4 py-1.5 rounded-md font-bold text-[10px] uppercase transition-all ${mode === 'write' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-white'}`} 
              onClick={() => setMode('write')}
            >
              Write
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link px-4 py-1.5 rounded-md font-bold text-[10px] uppercase transition-all ${mode === 'preview' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-white'}`} 
              onClick={() => setMode('preview')}
            >
              Preview
            </button>
          </li>
        </ul>
      </div>

      {mode === 'write' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100">
            <button type="button" className="btn btn-link btn-sm px-3 font-bold" onClick={() => applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '**', 'bold text'))}><i className="material-icons text-lg">format_bold</i></button>
            <button type="button" className="btn btn-link btn-sm px-3 font-bold" onClick={() => applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '*', 'italic text'))}><i className="material-icons text-lg">format_italic</i></button>
            <button type="button" className="btn btn-link btn-sm px-3 font-bold" onClick={() => applyTransform((source, start, end) => toggleInlineMarker(source, start, end, '++', 'underlined text'))}><i className="material-icons text-lg">format_underlined</i></button>
            <div className="w-px h-6 bg-gray-200 mx-1 self-center" />
            <button type="button" className="btn btn-link btn-sm px-3 font-bold" onClick={() => applyTransform(toggleBullets)}><i className="material-icons text-lg">format_list_bulleted</i></button>
            <button type="button" className="btn btn-link btn-sm px-3 font-bold" onClick={() => applyTransform(toggleNumberedList)}><i className="material-icons text-lg">format_list_numbered</i></button>
            <button type="button" className="btn btn-link btn-sm px-3 font-bold" onClick={() => applyTransform(toggleHeading)}><i className="material-icons text-lg">title</i></button>
          </div>

          <textarea
            ref={textareaRef}
            rows={15}
            className="form-control min-h-[20rem] resize-y font-mono text-sm p-4 leading-relaxed bg-white"
            value={value}
            onKeyDown={handleKeyboardShortcuts}
            onChange={(event) => onChange(sanitizeContent(event.target.value))}
            placeholder="Compose letter body in markdown..."
          />
        </div>
      ) : (
        <div className="min-h-[20rem] rounded-xl border border-gray-100 bg-white p-8 text-sm leading-relaxed prose prose-sm max-w-none">
          {previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} className="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4" />
          ) : (
            <p className="text-gray-400 italic text-center py-20">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
