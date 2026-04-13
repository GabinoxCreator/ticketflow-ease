import { QrCode, List } from 'lucide-react';

interface ColaboradorBottomNavProps {
  activeTab: 'qr' | 'listas';
  onTabChange: (tab: 'qr' | 'listas') => void;
}

export default function ColaboradorBottomNav({ activeTab, onTabChange }: ColaboradorBottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t z-20 safe-area-bottom">
      <div className="max-w-lg mx-auto flex">
        <button
          onClick={() => onTabChange('qr')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
            activeTab === 'qr'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <QrCode className="w-6 h-6" />
          <span className="text-xs font-medium">QR Code</span>
        </button>
        <button
          onClick={() => onTabChange('listas')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
            activeTab === 'listas'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <List className="w-6 h-6" />
          <span className="text-xs font-medium">Listas</span>
        </button>
      </div>
    </div>
  );
}
