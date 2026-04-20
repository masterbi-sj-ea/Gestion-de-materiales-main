export function normalizeRoleKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isSuperUserRole(roles: string[] | null | undefined): boolean {
  return (roles ?? []).some((rol) => {
    const normalized = normalizeRoleKey(rol);
    return normalized === 'administrador' || normalized === 'admin' || normalized === 'administrator';
  });
}

export function hasGlobalOperationalScope(roles: string[] | null | undefined): boolean {
  if (isSuperUserRole(roles)) {
    return true;
  }

  return (roles ?? []).some((rol) => {
    const normalized = normalizeRoleKey(rol);
    return (
      normalized === 'bodeguero'
      || normalized === 'encargado de bodega'
      || normalized === 'bodega'
      || normalized === 'jefe'
      || normalized.startsWith('jefe ')
      || normalized.startsWith('jefe de ')
    );
  });
}

export function hasPersonalOperationalScope(roles: string[] | null | undefined): boolean {
  return !hasGlobalOperationalScope(roles);
}