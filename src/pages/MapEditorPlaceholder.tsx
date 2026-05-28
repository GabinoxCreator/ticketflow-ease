import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Hammer } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function MapEditorPlaceholder() {
  const { venueId } = useParams<{ venueId: string; mapId: string }>();

  return (
    <ProducerLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={`/produtor/locais/${venueId}/mapas`}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Mapas
          </Link>
        </Button>
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Hammer className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Editor de mapa em construção</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                O editor visual de assentos chega na Fase 5. Por enquanto, você já
                pode criar locais, mapas e tipos de assento.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProducerLayout>
  );
}
