import { QrCode, List } from 'lucide-react';

interface ColaboradorBottomNavProps {
  activeTab: 'qr' | 'listas';
  onTabChange: (tab: 'qr' | 'listas') => void;
}

export default function ColaboradorBottomNav({ activeTab, onTabChange }: ColaboradorBottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t z-20 safe-area-bottom shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
      <div className="max-w-lg mx-auto flex">
        <button
          onClick={() => onTabChange('qr')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
            activeTab === 'qr' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {activeTab === 'qr' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full bg-primary" />
          )}
          <QrCode className="w-6 h-6" />
          <span className="text-xs font-semibold">QR Code</span>
        </button>
        <button
          onClick={() => onTabChange('listas')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
            activeTab === 'listas' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {activeTab === 'listas' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full bg-primary" />
          )}
          <List className="w-6 h-6" />
          <span className="text-xs font-semibold">Listas</span>
        </button>
      </div>
    </div>
  );
}
