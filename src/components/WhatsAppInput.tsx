import React from 'react';
import { Input } from '@/components/ui/input';
import { MessageCircle } from 'lucide-react';

interface WhatsAppInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const formatWhatsApp = (value: string): string => {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, '');
  
  // Limita a 11 dígitos
  const limited = numbers.slice(0, 11);
  
  // Aplica a máscara (99) 99999-9999
  if (limited.length <= 2) {
    return limited.length > 0 ? `(${limited}` : '';
  } else if (limited.length <= 7) {
    return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
  } else {
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
  }
};

const WhatsAppInput: React.FC<WhatsAppInputProps> = ({
  value,
  onChange,
  placeholder = '(17) 99999-9999',
  className = '',
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatWhatsApp(e.target.value);
    onChange(formatted);
  };

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
        <MessageCircle className="h-5 w-5" />
      </div>
      <Input
        type="tel"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={`pl-10 ${className}`}
      />
    </div>
  );
};

export default WhatsAppInput;
