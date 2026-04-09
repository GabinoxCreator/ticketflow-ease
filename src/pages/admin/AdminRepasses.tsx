import React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Banknote } from 'lucide-react';

const AdminRepasses: React.FC = () => {
  return (
    <AdminLayout title="Repasses">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Repasses Financeiros</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Banknote className="h-12 w-12 mb-4 text-orange-500/50" />
            <p className="text-lg font-medium">Em breve</p>
            <p className="text-sm">Gestão de repasses será implementada no próximo bloco</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminRepasses;
