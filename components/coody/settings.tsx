'use client';
import { useState } from 'react';
import {
  Sparkles,
  Columns3,
  Lock,
  ArrowUpRight,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { FormModal } from './forms';
export function Integrations() {
  const [details, setDetails] = useState('');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU ECOSSISTEMA CRIATIVO</p>
          <h1>Integrações</h1>
          <p>Conecte inteligência, produção e colaboração.</p>
        </div>
        <span className="stage-label">Próxima etapa</span>
      </div>
      <div className="integration-grid">
        {[
          {
            name: 'OpenAI',
            Icon: Sparkles,
            description:
              'Planejamento contextual, legendas e criação de artes para cada marca.',
            features: [
              'Geração de texto com 5 hashtags',
              'Feed e Story com composições próprias',
              'Brand Context e histórico editorial',
            ],
          },
          {
            name: 'Trello',
            Icon: Columns3,
            description:
              'Aprovações e alterações conectadas ao fluxo da sua equipe.',
            features: [
              'Cards com texto, Feed e Story',
              'Listas de aprovação, alteração e aprovado',
              'Sincronização de status e comentários',
            ],
          },
        ].map(({ name, Icon, description, features }) => (
          <section className="integration-card" key={name}>
            <div className="integration-icon">
              <Icon size={28} strokeWidth={1.3} />
            </div>
            <div className="section-head">
              <h2>{name}</h2>
              <span className="stage-label">Não conectado</span>
            </div>
            <p className="muted">{description}</p>
            <ul>
              {features.map((f) => (
                <li key={f}>
                  <span /> {f}
                </li>
              ))}
            </ul>
            <button
              className="outline-btn full"
              onClick={() => setDetails(name)}
            >
              Ver preparação <ArrowUpRight size={15} />
            </button>
          </section>
        ))}
      </div>
      <p className="security-note">
        <Lock size={15} /> As credenciais serão configuradas no servidor.
        Nenhuma chave é solicitada nesta etapa.
      </p>
      {details && (
        <FormModal
          open
          onClose={() => setDetails('')}
          title={details + ' · preparação'}
          description="A arquitetura está separada da interface e pronta para receber o adaptador real."
        >
          <p className="muted">
            {details === 'OpenAI'
              ? 'A próxima etapa conectará a API oficial para geração de texto e imagem, usando o contexto da marca. O Story será recomposto para 9:16.'
              : 'A próxima etapa permitirá selecionar Workspace, Board e listas, criar cards com anexos e sincronizar alterações por webhook.'}
          </p>
          <p className="notice">
            Nesta versão, o fluxo de criação e aprovação é interno. Nenhuma
            chamada externa é realizada.
          </p>
          <button className="outline-btn" onClick={() => setDetails('')}>
            Entendido
          </button>
        </FormModal>
      )}
    </>
  );
}
export function Settings() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU ESPAÇO DE TRABALHO</p>
          <h1>Configurações</h1>
          <p>Uma base organizada para a sua equipe crescer.</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="panel">
          <UserRound size={24} />
          <h2>Agência criativa</h2>
          <p className="muted">Perfil demonstrativo · Administrador</p>
          <div className="detail-line">
            <span>Workspace</span>
            <strong>COODY</strong>
          </div>
          <div className="detail-line">
            <span>Idioma</span>
            <strong>Português (Brasil)</strong>
          </div>
          <div className="detail-line">
            <span>Interface</span>
            <strong>Dark</strong>
          </div>
          <p className="notice">
            Dados fictícios para validar o fluxo. Alterações e arquivos são
            salvos neste workspace demonstrativo.
          </p>
        </section>
        <section className="panel">
          <ShieldCheck size={24} />
          <h2>Papéis preparados</h2>
          <p className="muted">
            Contas individuais e aplicação de permissões serão ativadas em uma
            próxima etapa.
          </p>
          {[
            ['Administrador', 'Acesso completo ao workspace.'],
            [
              'Criativo',
              'Planejamento, criação, edição, Studio e envio para aprovação.',
            ],
            [
              'Aprovador',
              'Visualização, comentários, aprovação e solicitação de alteração.',
            ],
          ].map(([role, desc]) => (
            <div className="role-row" key={role}>
              <h3>{role}</h3>
              <p className="muted">{desc}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
