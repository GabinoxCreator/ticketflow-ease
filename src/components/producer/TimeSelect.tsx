import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  options?: string[];
}

const timeOptions: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    timeOptions.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

export function TimeSelect({ value, onChange, placeholder = 'Horário', disabled, options }: TimeSelectProps) {
  const items = options || timeOptions;
  // Tolerate HH:mm:ss coming directly from DB columns; normalize to HH:mm.
  const m = typeof value === 'string' ? value.match(/^(\d{2}):(\d{2})/) : null;
  const normalized = m ? `${m[1]}:${m[2]}` : '';
  return (
    <Select value={normalized} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {items.map((time) => (
          <SelectItem key={time} value={time}>
            {time}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
