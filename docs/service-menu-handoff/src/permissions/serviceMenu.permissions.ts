import type { ServiceRole } from '../types/serviceMenu';

export interface ServiceGuardContext {
  role: ServiceRole;
  hasActiveCharging: boolean;
}

export const canOpenSettings = (ctx: ServiceGuardContext): boolean => {
  return !ctx.hasActiveCharging && (ctx.role === 'service' || ctx.role === 'admin');
};

export const canRunSensitiveAction = (role: ServiceRole): boolean => {
  return role === 'admin' || role === 'service';
};

export const requiresAdminPassword = true;
