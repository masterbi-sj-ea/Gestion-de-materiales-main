import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { sileo as toast } from 'sileo';
import { useAuth } from '../hooks/useAuth';
import {
  SOCKET_ALLOW_UPGRADE,
  SOCKET_ORIGIN,
  SOCKET_TRANSPORTS,
} from '../services/apiConfig';

const SOCKET_ROOM_BODEGA = 'bodega';
const SOCKET_ROOM_DASHBOARD_GLOBAL = 'dashboard:global';
const SOCKET_EVENT_NUEVA_SOLICITUD = 'nueva_solicitud';
const SOCKET_EVENT_SOLICITUD_APROBADA = 'solicitud_aprobada';

type RealtimeSocketContextValue = {
  socket: Socket | null;
  realtimeConnected: boolean;
  realtimeError: string | null;
};

const RealtimeSocketContext = createContext<RealtimeSocketContextValue | null>(null);

function normalizeRoleKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function hasGlobalOperationalScope(role: string | null | undefined): boolean {
  const normalized = normalizeRoleKey(role);
  return normalized === 'administrador'
    || normalized === 'admin'
    || normalized === 'administrator'
    || normalized === 'bodega'
    || normalized === 'bodeguero'
    || normalized === 'encargado de bodega'
    || normalized.startsWith('jefe');
}

function shouldJoinBodegaRoom(role: string | null | undefined): boolean {
  const normalized = normalizeRoleKey(role);
  return normalized === 'administrador'
    || normalized === 'admin'
    || normalized === 'administrator'
    || normalized === 'bodega'
    || normalized === 'bodeguero'
    || normalized === 'encargado de bodega';
}

export function useRealtimeSocket(): RealtimeSocketContextValue {
  const context = useContext(RealtimeSocketContext);
  if (!context) {
    throw new Error('useRealtimeSocket must be used within RealtimeSocketProvider');
  }

  return context;
}

export function RealtimeSocketProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) {
      setSocket(null);
      setRealtimeConnected(false);
      setRealtimeError(null);
      return;
    }

    const socketInstance = io(SOCKET_ORIGIN, {
      auth: { token },
      transports: [...SOCKET_TRANSPORTS],
      upgrade: SOCKET_ALLOW_UPGRADE,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    const handleConnect = () => {
      setRealtimeConnected(true);
      setRealtimeError(null);
      socketInstance.emit('join', `user:${user.id}`);

      if (shouldJoinBodegaRoom(user.role)) {
        socketInstance.emit('join', SOCKET_ROOM_BODEGA);
      }

      if (hasGlobalOperationalScope(user.role)) {
        socketInstance.emit('join', SOCKET_ROOM_DASHBOARD_GLOBAL);
      }
    };

    const handleDisconnect = () => {
      setRealtimeConnected(false);
    };

    const handleConnectError = (error: Error) => {
      setRealtimeConnected(false);
      setRealtimeError(error.message || 'No se pudo conectar el canal en tiempo real.');
      console.error('Error de conexión realtime principal', error);
    };

    const handleNuevaSolicitud = (data: { codigo?: string; area?: string }) => {
      toast.show({
        title: 'Nueva Solicitud',
        description: `Se ha creado la solicitud ${data?.codigo || '-'} de ${data?.area || 'General'}`,
      });
    };

    const handleSolicitudAprobada = (data: { codigo?: string }) => {
      toast.show({
        title: 'Solicitud Aprobada',
        description: `Tu solicitud ${data?.codigo || '-'} ha sido aprobada.`,
      });
    };

    setSocket(socketInstance);

    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('connect_error', handleConnectError);
    socketInstance.on(SOCKET_EVENT_NUEVA_SOLICITUD, handleNuevaSolicitud);
    socketInstance.on(SOCKET_EVENT_SOLICITUD_APROBADA, handleSolicitudAprobada);

    return () => {
      setRealtimeConnected(false);
      setRealtimeError(null);
      setSocket((current) => (current === socketInstance ? null : current));
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.off('connect_error', handleConnectError);
      socketInstance.off(SOCKET_EVENT_NUEVA_SOLICITUD, handleNuevaSolicitud);
      socketInstance.off(SOCKET_EVENT_SOLICITUD_APROBADA, handleSolicitudAprobada);
      socketInstance.disconnect();
    };
  }, [token, user]);

  const value = useMemo<RealtimeSocketContextValue>(
    () => ({
      socket,
      realtimeConnected,
      realtimeError,
    }),
    [realtimeConnected, realtimeError, socket],
  );

  return (
    <RealtimeSocketContext.Provider value={value}>
      {children}
    </RealtimeSocketContext.Provider>
  );
}