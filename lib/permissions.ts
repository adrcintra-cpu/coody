/**
 * Workspace roles. The owner (COODY_OWNER_EMAIL) is always an administrator
 * with access to every workspace. Invited people get one of three roles and
 * only the workspaces an administrator released to them. Pure, tested in Node.
 */
export type Role = 'ADMINISTRADOR' | 'EDITOR' | 'APROVADOR';
export const roleLabels: Record<Role, string> = {
  ADMINISTRADOR: 'Administrador',
  EDITOR: 'Editor',
  APROVADOR: 'Aprovador',
};
export const roleHelp: Record<Role, string> = {
  ADMINISTRADOR: 'Faz tudo, inclusive pessoas, integrações e workspaces.',
  EDITOR: 'Cria e edita marcas, pautas, artes e arquivos; envia para aprovação.',
  APROVADOR: 'Vê as peças, comenta, aprova ou pede alteração.',
};
/** manage: people, integrations, workspaces, brand lifecycle.
 *  edit: brands, contents, versions, files, plans, AI.
 *  approve: approve or request changes on a piece in approval.
 *  comment: comment on a piece. */
export type Permission = 'manage' | 'edit' | 'approve' | 'comment';
const grants: Record<Role, Permission[]> = {
  ADMINISTRADOR: ['manage', 'edit', 'approve', 'comment'],
  EDITOR: ['edit', 'comment'],
  APROVADOR: ['approve', 'comment'],
};
export function can(role: string | undefined, permission: Permission) {
  return !!grants[role as Role]?.includes(permission);
}
export function isRole(value: unknown): value is Role {
  return value === 'ADMINISTRADOR' || value === 'EDITOR' || value === 'APROVADOR';
}
/** The permission a workspace action needs (status depends on the move). */
export function actionPermission(
  action: string,
  data: { status?: unknown },
  currentStatus?: string,
): Permission {
  if (action === 'comment') return 'comment';
  if (['setBrandStatus', 'deleteBrand', 'restoreBrand'].includes(action))
    return 'manage';
  if (action === 'planApproval' && data.status === 'aprovado') return 'approve';
  if (action === 'status') {
    if (data.status === 'APROVADO') return 'approve';
    if (
      (data.status === 'ALTERAÇÃO' || data.status === 'AJUSTE') &&
      currentStatus === 'APROVAÇÃO'
    )
      return 'approve';
  }
  return 'edit';
}
export function deniedMessage(permission: Permission) {
  return permission === 'manage'
    ? 'Somente administradores podem fazer isso.'
    : permission === 'approve'
      ? 'Somente aprovadores e administradores podem aprovar ou pedir alteração.'
      : permission === 'edit'
        ? 'Seu acesso é de aprovador: você pode comentar, aprovar ou pedir alteração.'
        : 'Sem permissão para esta ação.';
}
