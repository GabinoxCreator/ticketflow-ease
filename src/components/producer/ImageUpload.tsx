import { useEffect, useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useImageUpload } from '@/hooks/useImageUpload';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string | undefined) => void;
  className?: string;
}

export function ImageUpload({ value, onChange, className }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, deleteImage, isUploading, progress } = useImageUpload();
  const [isDragOver, setIsDragOver] = useState(false);
  const [broken, setBroken] = useState(false);

  // Reset "broken" status whenever the source url changes (e.g. after a new upload).
  useEffect(() => {
    setBroken(false);
  }, [value]);

  const handleFileSelect = async (file: File) => {
    const url = await uploadImage(file);
    if (url) {
      onChange(url);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = async () => {
    if (value && !broken) {
      await deleteImage(value);
    }
    onChange(undefined);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleInputChange}
        className="hidden"
      />

      {value ? (
        <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
          {broken ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 bg-muted">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Imagem indisponível</p>
                <p className="text-xs text-muted-foreground">
                  O arquivo original foi removido. Envie uma nova imagem.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Enviar nova
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleRemove}>
                  <X className="w-4 h-4 mr-2" />
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <>
              <img
                src={value}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={() => setBroken(true)}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Trocar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
                >
                  <X className="w-4 h-4 mr-2" />
                  Remover
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
            isUploading && 'pointer-events-none'
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Fazendo upload...</p>
                <Progress value={progress} className="w-full max-w-xs mx-auto" />
              </div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">
                Clique para fazer upload ou arraste uma imagem
              </p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP ou GIF (máx. 5MB)
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
