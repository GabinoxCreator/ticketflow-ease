import { QrCode, List, ShoppingBag, BarChart3 } from 'lucide-react';

export type ColaboradorTab = 'qr' | 'listas' | 'vender' | 'relatorios';

interface ColaboradorBottomNavProps {
  activeTab: ColaboradorTab;
  onTabChange: (tab: ColaboradorTab) => void;
}

export default function ColaboradorBottomNav({ activeTab, onTabChange }: ColaboradorBottomNavProps) {
  const tabs: Array<{ id: ColaboradorTab; label: string; Icon: typeof QrCode }> = [
    { id: 'qr', label: 'Check-in', Icon: QrCode },
    { id: 'listas', label: 'Listas', Icon: List },
    { id: 'vender', label: 'Vender', Icon: ShoppingBag },
    { id: 'relatorios', label: 'Relatórios', Icon: BarChart3 },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 shadow-[0_-6px_20px_rgba(15,23,42,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto flex">
        {tabs.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative ${
                active ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 rounded-b-full bg-primary" />
              )}
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  active ? 'bg-primary/10' : ''
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold ${active ? '' : 'font-semibold'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
