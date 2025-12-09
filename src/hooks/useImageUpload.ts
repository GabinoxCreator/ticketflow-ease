import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setIsUploading(true);
      setProgress(0);

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Tipo de arquivo não suportado. Use JPG, PNG, WebP ou GIF.');
        return null;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('Arquivo muito grande. O tamanho máximo é 5MB.');
        return null;
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `events/${fileName}`;

      setProgress(30);

      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setProgress(80);

      const { data: urlData } = supabase.storage
        .from('event-images')
        .getPublicUrl(filePath);

      setProgress(100);

      return urlData.publicUrl;
    } catch (error: any) {
      toast.error(`Erro ao fazer upload: ${error.message}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const deleteImage = async (url: string): Promise<boolean> => {
    try {
      // Extract file path from URL
      const urlParts = url.split('/event-images/');
      if (urlParts.length < 2) return false;
      
      const filePath = urlParts[1];

      const { error } = await supabase.storage
        .from('event-images')
        .remove([filePath]);

      if (error) throw error;

      return true;
    } catch (error: any) {
      toast.error(`Erro ao excluir imagem: ${error.message}`);
      return false;
    }
  };

  return {
    uploadImage,
    deleteImage,
    isUploading,
    progress,
  };
}
