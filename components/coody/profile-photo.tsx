'use client';
import { useState } from 'react';
import Image from 'next/image';
export function ProfilePhoto({
  url,
  name,
  brandId,
  reload,
}: {
  url?: string;
  name: string;
  brandId?: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <section className="panel profile-upload">
      <h2>Foto de perfil {brandId ? 'do cliente' : 'do usuário'}</h2>
      {url ? (
        <Image
          unoptimized
          src={url}
          width={96}
          height={96}
          alt={'Foto de ' + name}
          className="profile-preview"
        />
      ) : (
        <span className="profile-placeholder">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <p>
        PNG, JPG ou WEBP de até 5 MB. A foto aparece no perfil e nas
        identificações do workspace.
      </p>
      <label htmlFor={'profile-file-' + (brandId || 'user')}>
        Alterar foto
      </label>
      <input
        id={'profile-file-' + (brandId || 'user')}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = '';
          if (file.size > 5 * 1024 * 1024) {
            setMessage('Use uma imagem de até 5 MB.');
            return;
          }
          setBusy(true);
          setMessage('Enviando foto…');
          try {
            const form = new FormData();
            form.set('file', file);
            form.set('kind', brandId ? 'brand' : 'user');
            if (brandId) form.set('brandId', brandId);
            const response = await fetch('/api/avatars', {
              method: 'POST',
              body: form,
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok)
              throw new Error(result.error || 'Falha no envio.');
            await reload();
            setMessage('Foto atualizada.');
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : 'Falha no envio.',
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <output>{message}</output>
    </section>
  );
}
