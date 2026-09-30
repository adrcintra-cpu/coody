'use client';
import { avatarLimitMB } from '@/lib/upload-limits';

import { useRef, useState } from 'react';
import Image from 'next/image';
export function ProfilePhoto({
  url,
  name,
  brandId,
  workspaceId,
  reload,
}: {
  url?: string;
  name: string;
  brandId?: string;
  workspaceId?: string;
  reload: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <section className="profile-upload" aria-label={brandId ? "Foto de perfil do cliente" : "Foto de perfil do usuário"}>
      <div className="profile-upload-row">
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
      <div className="profile-upload-identity">
        <strong>{name}</strong>
        <span>{workspaceId ? 'Perfil do workspace' : brandId ? 'Perfil da marca' : 'Perfil do usuário'}</span>
      </div>
      <button className="profile-upload-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Enviando…' : 'Mudar foto'}
      </button>
      </div>
      <input
        ref={inputRef}
        style={{ display: 'none' }}
        aria-label="Selecionar foto de perfil"
        id={'profile-file-' + (workspaceId || brandId || 'user')}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = '';
          if (file.size > avatarLimitMB * 1024 * 1024) {
            setMessage(`Use uma imagem de até ${avatarLimitMB} MB.`);
            return;
          }
          setBusy(true);
          setMessage('Enviando foto…');
          try {
            const form = new FormData();
            form.set('file', file);
            form.set('kind', workspaceId ? 'workspace' : brandId ? 'brand' : 'user');
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
      {message && <output className="profile-upload-message" aria-live="polite">{message}</output>}
    </section>
  );
}
