import React from 'react';

interface PasswordStrengthProps {
  password: string;
}

export const getPasswordScore = (password: string): number => {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
};

const PasswordStrength: React.FC<PasswordStrengthProps> = ({ password }) => {
  const score = getPasswordScore(password);

  const labels = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Excelente'];
  const colors = [
    'bg-destructive',
    'bg-destructive',
    'bg-yellow-500',
    'bg-green-500',
    'bg-gradient-to-r from-primary to-[hsl(330,85%,60%)]',
  ];

  if (!password) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? colors[score] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Força da senha: <span className="font-medium text-foreground">{labels[score]}</span>
      </p>
    </div>
  );
};

export default PasswordStrength;
