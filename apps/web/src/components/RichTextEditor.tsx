import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const wrapSelection = (value: string, tokenStart: string, tokenEnd: string) => {
  return `${tokenStart}${value}${tokenEnd}`;
};

export const sanitizeContent = (value: string) => value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const appendToken = (prefix: string, suffix = '') => {
    onChange(sanitizeContent(`${value}${wrapSelection('', prefix, suffix)}`));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('**', '**')}>Bold</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('*', '*')}>Italic</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('<u>', '</u>')}>Underline</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('\n- ')}>Bullets</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('\n1. ')}>Numbered</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('\n# ')}>Heading</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('\n[align:left]')}>Align Left</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('\n[align:center]')}>Align Center</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => appendToken('\n[align:right]')}>Align Right</Button>
      </div>
      <Textarea
        rows={18}
        value={value}
        onChange={(event) => onChange(sanitizeContent(event.target.value))}
        placeholder="Compose letter body"
      />
    </div>
  );
}
