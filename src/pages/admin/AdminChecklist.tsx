import React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import ProcessoEventoFestPag from '@/components/admin/ProcessoEventoFestPag';

const AdminChecklist: React.FC = () => {
  return (
    <AdminLayout title="Checklist">
      <ProcessoEventoFestPag />
    </AdminLayout>
  );
};

export default AdminChecklist;
