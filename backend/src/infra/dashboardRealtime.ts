import { io } from '../server';

export const SOCKET_EVENT_DASHBOARD_ACTUALIZADO = 'dashboard_actualizado';
export const SOCKET_ROOM_DASHBOARD_GLOBAL = 'dashboard:global';

export interface DashboardInvalidationPayload {
  reason: string;
  timestamp?: string;
  idSolicitud?: number;
  idArea?: number | null;
  userId?: number | null;
}

export function getDashboardAreaRoom(idArea: number): string {
  return `dashboard:area:${idArea}`;
}

export function emitDashboardInvalidation(payload: DashboardInvalidationPayload): void {
  const normalizedPayload = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };

  try {
    io.to(SOCKET_ROOM_DASHBOARD_GLOBAL).emit(SOCKET_EVENT_DASHBOARD_ACTUALIZADO, normalizedPayload);

    if (typeof payload.idArea === 'number' && payload.idArea > 0) {
      io.to(getDashboardAreaRoom(payload.idArea)).emit(SOCKET_EVENT_DASHBOARD_ACTUALIZADO, normalizedPayload);
    }

    if (typeof payload.userId === 'number' && payload.userId > 0) {
      io.to(`user:${payload.userId}`).emit(SOCKET_EVENT_DASHBOARD_ACTUALIZADO, normalizedPayload);
    }
  } catch (error) {
    console.error('Error emitiendo invalidación realtime del dashboard:', error);
  }
}