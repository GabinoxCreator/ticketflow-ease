import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps, labels }) => {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <motion.div
                  className={`relative flex items-center justify-center h-8 w-8 rounded-full border-2 text-xs font-semibold transition-colors ${
                    isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground'
                  }`}
                  animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
                >
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{
                        boxShadow: '0 0 20px hsl(var(--primary) / 0.5)',
                      }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </motion.div>
                {labels?.[idx] && (
                  <span
                    className={`text-[10px] font-medium hidden sm:block ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {labels[idx]}
                  </span>
                )}
              </div>
              {idx < totalSteps - 1 && (
                <div className="flex-1 h-0.5 rounded-full bg-border overflow-hidden -mt-4">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-[hsl(330,85%,60%)]"
                    initial={{ width: '0%' }}
                    animate={{ width: stepNum < currentStep ? '100%' : '0%' }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default StepIndicator;
