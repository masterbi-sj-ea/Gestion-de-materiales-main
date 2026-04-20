import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { sileo } from 'sileo';
import { apiFetch } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';
import { usePermisos } from './PermisosContext';
import { useRealtimeSocket } from './RealtimeSocketContext';

const SOCKET_ROOM_APROBACIONES = 'aprobaciones';
const SOCKET_EVENT_SOLICITUD_PENDIENTE_APROBACION = 'solicitud_pendiente_aprobacion';
const SOCKET_EVENT_SOLICITUD_APROBACION_ACTUALIZADA = 'solicitud_aprobacion_actualizada';
const SOUND_STORAGE_KEY = 'aprobaciones:realtime:sound-enabled';
const SOUND_TONE_STORAGE_KEY = 'aprobaciones:realtime:sound-tone';
const PUSH_SCOPE_APROBACIONES = 'aprobaciones';
const SOUND_TONES = ['classic', 'soft', 'bell', 'urgent'] as const;
export type ApprovalSoundTone = typeof SOUND_TONES[number];

export interface SolicitudPendienteRealtimePayload {
  id: number;
  codigo: string;
  area: string;
  solicitante: string;
  items: number;
  createdAt: string;
}

export interface SolicitudAprobacionActualizadaRealtimePayload {
  id: number;
  codigo: string;
  estado: 'APROBADA' | 'RECHAZADA';
  aprobador: string | null;
  comentario: string | null;
  idAprobador: number;
  updatedAt: string;
}

interface PushConfigPayload {
  enabled: boolean;
  publicKey: string | null;
  reason?: string | null;
}

interface AprobacionesRealtimeContextValue {
  canAccessAprobaciones: boolean;
  canApproveAprobaciones: boolean;
  pendingCount: number;
  realtimeConnected: boolean;
  lastEventAt: string | null;
  latestPendingRequest: SolicitudPendienteRealtimePayload | null;
  eventVersion: number;
  attentionPulse: boolean;
  canUseBrowserNotifications: boolean;
  notificationPermission: NotificationPermission;
  requestBrowserNotificationPermission: () => Promise<NotificationPermission>;
  pushNotificationsEnabled: boolean;
  pushNotificationsBusy: boolean;
  pushNotificationsReason: string | null;
  enablePushNotifications: () => Promise<boolean>;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  soundTone: ApprovalSoundTone;
  setSoundTone: (tone: ApprovalSoundTone) => void;
  refreshPendingCount: () => Promise<number>;
}

const AprobacionesRealtimeContext = createContext<AprobacionesRealtimeContextValue | null>(null);

function getInitialNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'default';
  }

  return Notification.permission;
}

function getInitialSoundEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
  if (stored == null) {
    return true;
  }

  return stored === 'true';
}

function getInitialSoundTone(): ApprovalSoundTone {
  if (typeof window === 'undefined') {
    return 'classic';
  }

  const stored = window.localStorage.getItem(SOUND_TONE_STORAGE_KEY);
  if (!stored) {
    return 'classic';
  }

  return SOUND_TONES.includes(stored as ApprovalSoundTone)
    ? (stored as ApprovalSoundTone)
    : 'classic';
}

function browserSupportsDesktopNotifications(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof Notification !== 'undefined';
}

function browserSupportsPushNotifications(): boolean {
  return browserSupportsDesktopNotifications()
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

function getPushUnavailableReason(): string {
  if (typeof window === 'undefined') {
    return 'Las notificaciones externas no están disponibles en este entorno.';
  }

  if (!window.isSecureContext) {
    return 'Las notificaciones externas requieren HTTPS o localhost.';
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'Este navegador no soporta Web Push para avisos fuera de la aplicación.';
  }

  return 'No se pudo habilitar Web Push en este navegador.';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function arrayBufferToUint8Array(value: ArrayBuffer | null): Uint8Array | null {
  return value ? new Uint8Array(value) : null;
}

function uint8ArrayToArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

function uint8ArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function getTotalFromListPayload(payload: unknown): number {
  if (typeof payload === 'object' && payload !== null && typeof (payload as { total?: unknown }).total === 'number') {
    return Number((payload as { total: number }).total);
  }

  return Array.isArray(payload) ? payload.length : 0;
}

function getAudioContextConstructor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const browserWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: new () => AudioContext;
  };

  return browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

async function playDiscreetApprovalChime(audioContext: AudioContext, tone: ApprovalSoundTone): Promise<void> {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const tonePresets: Record<ApprovalSoundTone, Array<{ frequency: number; delay: number; duration: number; peak: number; type: OscillatorType }>> = {
    classic: [
      { frequency: 659.25, delay: 0, duration: 0.08, peak: 0.06, type: 'sine' },
      { frequency: 783.99, delay: 0.09, duration: 0.11, peak: 0.055, type: 'sine' },
    ],
    soft: [
      { frequency: 523.25, delay: 0, duration: 0.1, peak: 0.045, type: 'sine' },
      { frequency: 659.25, delay: 0.11, duration: 0.1, peak: 0.04, type: 'triangle' },
    ],
    bell: [
      { frequency: 880, delay: 0, duration: 0.13, peak: 0.052, type: 'triangle' },
      { frequency: 1174.66, delay: 0.08, duration: 0.15, peak: 0.048, type: 'triangle' },
    ],
    urgent: [
      { frequency: 740, delay: 0, duration: 0.07, peak: 0.065, type: 'square' },
      { frequency: 622, delay: 0.08, duration: 0.07, peak: 0.06, type: 'square' },
      { frequency: 740, delay: 0.16, duration: 0.07, peak: 0.065, type: 'square' },
    ],
  };
  const notes = tonePresets[tone] ?? tonePresets.classic;
  const MASTER_VOLUME = 2.2;
  const MAX_PEAK = 0.16;

  notes.forEach((note) => {
    const startAt = audioContext.currentTime + note.delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, startAt);
    const effectivePeak = Math.min(MAX_PEAK, note.peak * MASTER_VOLUME);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(effectivePeak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(startAt);
    oscillator.stop(startAt + note.duration + 0.02);
  });
}

export function useAprobacionesRealtime(): AprobacionesRealtimeContextValue {
  const context = useContext(AprobacionesRealtimeContext);
  if (!context) {
    throw new Error('useAprobacionesRealtime must be used within AprobacionesRealtimeProvider');
  }
  return context;
}

export function AprobacionesRealtimeProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const { socket } = useRealtimeSocket();
  const { cargandoPermisos, puedeAcceder, getPermisosModulo } = usePermisos();
  const location = useLocation();
  const canShowDesktopNotifications = browserSupportsDesktopNotifications();
  const canUseBrowserNotifications = browserSupportsPushNotifications();
  const [pendingCount, setPendingCount] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [latestPendingRequest, setLatestPendingRequest] = useState<SolicitudPendienteRealtimePayload | null>(null);
  const [eventVersion, setEventVersion] = useState(0);
  const [attentionPulse, setAttentionPulse] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(getInitialNotificationPermission);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [pushNotificationsBusy, setPushNotificationsBusy] = useState(false);
  const [pushNotificationsReason, setPushNotificationsReason] = useState<string | null>(null);
  const [soundEnabledState, setSoundEnabledState] = useState<boolean>(getInitialSoundEnabled);
  const [soundToneState, setSoundToneState] = useState<ApprovalSoundTone>(getInitialSoundTone);
  const pulseTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const baseDocumentTitleRef = useRef<string>(typeof document !== 'undefined' ? document.title : 'Gestión de Materiales App');
  const locationPathRef = useRef(location.pathname);
  const refreshPendingCountRef = useRef<() => Promise<number>>(async () => 0);
  const notificationPermissionRef = useRef(notificationPermission);
  const soundEnabledRef = useRef(soundEnabledState);
  const soundToneRef = useRef<ApprovalSoundTone>(soundToneState);
  const canShowDesktopNotificationsRef = useRef(canShowDesktopNotifications);
  const pushNotificationsEnabledRef = useRef(pushNotificationsEnabled);
  const pushConfigRef = useRef<PushConfigPayload | null>(null);
  const serviceWorkerRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const canAccessAprobaciones = !!user && !cargandoPermisos && puedeAcceder(user.role, 'aprobaciones');
  const canApproveAprobaciones = !!user && !cargandoPermisos && !!getPermisosModulo(user.role, 'aprobaciones')?.puedeAprobar;

  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    notificationPermissionRef.current = notificationPermission;
  }, [notificationPermission]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabledState;
  }, [soundEnabledState]);

  useEffect(() => {
    soundToneRef.current = soundToneState;
  }, [soundToneState]);

  useEffect(() => {
    canShowDesktopNotificationsRef.current = canShowDesktopNotifications;
  }, [canShowDesktopNotifications]);

  useEffect(() => {
    pushNotificationsEnabledRef.current = pushNotificationsEnabled;
  }, [pushNotificationsEnabled]);

  const clearAttentionPulse = useCallback(() => {
    if (pulseTimeoutRef.current != null) {
      window.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = null;
    }
    setAttentionPulse(false);
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    }
  }, []);

  const setSoundTone = useCallback((tone: ApprovalSoundTone) => {
    setSoundToneState(tone);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SOUND_TONE_STORAGE_KEY, tone);
    }
  }, []);

  const fetchPushConfig = useCallback(async (): Promise<PushConfigPayload | null> => {
    if (!token || !canApproveAprobaciones) {
      pushConfigRef.current = null;
      return null;
    }

    if (pushConfigRef.current) {
      return pushConfigRef.current;
    }

    try {
      const response = await apiFetch('/push/config');
      const payload = response.ok ? await response.json() : null;

      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message?: unknown }).message || '')
          : '';
        throw new Error(message || `HTTP ${response.status}`);
      }

      const config: PushConfigPayload = {
        enabled: Boolean(payload && typeof payload === 'object' && 'enabled' in payload ? (payload as { enabled?: unknown }).enabled : false),
        publicKey: payload && typeof payload === 'object' && 'publicKey' in payload && typeof (payload as { publicKey?: unknown }).publicKey === 'string'
          ? String((payload as { publicKey: string }).publicKey).trim() || null
          : null,
        reason: payload && typeof payload === 'object' && 'reason' in payload && typeof (payload as { reason?: unknown }).reason === 'string'
          ? String((payload as { reason: string }).reason)
          : null,
      };

      pushConfigRef.current = config;
      return config;
    } catch (error) {
      console.error('No se pudo cargar la configuración Web Push', error);
      setPushNotificationsReason('No se pudo validar la configuración del servidor para notificaciones externas.');
      return null;
    }
  }, [canApproveAprobaciones, token]);

  const getServiceWorkerRegistration = useCallback(async (): Promise<ServiceWorkerRegistration> => {
    if (serviceWorkerRegistrationRef.current) {
      return serviceWorkerRegistrationRef.current;
    }

    const registration = await navigator.serviceWorker.register('/push-sw.js');
    serviceWorkerRegistrationRef.current = await navigator.serviceWorker.ready;
    return serviceWorkerRegistrationRef.current ?? registration;
  }, []);

  const syncPushSubscription = useCallback(async (requestPermission: boolean): Promise<boolean> => {
    if (!token || !canApproveAprobaciones) {
      setPushNotificationsEnabled(false);
      setPushNotificationsReason(null);
      return false;
    }

    if (!canUseBrowserNotifications) {
      setPushNotificationsEnabled(false);
      setPushNotificationsReason(getPushUnavailableReason());
      return false;
    }

    const config = await fetchPushConfig();
    if (!config?.enabled || !config.publicKey) {
      setPushNotificationsEnabled(false);
      setPushNotificationsReason(config?.reason || 'El servidor todavía no tiene Web Push configurado.');
      return false;
    }

    setPushNotificationsReason(null);

    let permission = notificationPermission;
    if (requestPermission) {
      permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }

    if (permission !== 'granted') {
      setPushNotificationsEnabled(false);
      setPushNotificationsReason(
        permission === 'denied'
          ? 'El navegador tiene bloqueadas las notificaciones para este sitio.'
          : 'Debes permitir las notificaciones del navegador para activar avisos externos.',
      );
      return false;
    }

    try {
      const registration = await getServiceWorkerRegistration();
      const expectedServerKey = urlBase64ToUint8Array(config.publicKey);
      let subscription = await registration.pushManager.getSubscription();

      const currentServerKey = subscription
        ? arrayBufferToUint8Array(subscription.options.applicationServerKey)
        : null;

      if (subscription && currentServerKey && !uint8ArraysEqual(currentServerKey, expectedServerKey)) {
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: uint8ArrayToArrayBuffer(expectedServerKey),
        });
      }

      const response = await apiFetch('/push/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          subscription,
          scope: PUSH_SCOPE_APROBACIONES,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setPushNotificationsEnabled(true);
      setPushNotificationsReason(null);
      return true;
    } catch (error) {
      console.error('No se pudo sincronizar la suscripción Web Push', error);
      setPushNotificationsEnabled(false);
      setPushNotificationsReason('No se pudo registrar este dispositivo para avisos externos.');
      return false;
    }
  }, [canApproveAprobaciones, canUseBrowserNotifications, fetchPushConfig, getServiceWorkerRegistration, notificationPermission, token]);

  const enablePushNotifications = useCallback(async (): Promise<boolean> => {
    setPushNotificationsBusy(true);

    try {
      const enabled = await syncPushSubscription(true);
      if (!enabled) {
        return false;
      }

      void apiFetch('/push/test', { method: 'POST' }).catch((error) => {
        console.error('No se pudo enviar la notificación push de prueba', error);
      });

      sileo.success({
        title: 'Notificaciones externas activadas',
        description: 'Este equipo recibirá solicitudes pendientes incluso fuera de la aplicación.',
      });

      return true;
    } finally {
      setPushNotificationsBusy(false);
    }
  }, [syncPushSubscription]);

  const refreshPendingCount = useCallback(async (): Promise<number> => {
    if (!token || !canAccessAprobaciones) {
      setPendingCount(0);
      return 0;
    }

    try {
      const response = await apiFetch('/solicitudes?estado=PENDIENTE&page=1&pageSize=1');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const nextCount = getTotalFromListPayload(payload);
      setPendingCount(nextCount);
      return nextCount;
    } catch (error) {
      console.error('Error al refrescar el contador de aprobaciones pendientes', error);
      return 0;
    }
  }, [canAccessAprobaciones, token]);

  useEffect(() => {
    refreshPendingCountRef.current = refreshPendingCount;
  }, [refreshPendingCount]);

  const requestBrowserNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!canShowDesktopNotifications) {
      return 'default';
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    return permission;
  }, [canShowDesktopNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabledState));
  }, [soundEnabledState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SOUND_TONE_STORAGE_KEY, soundToneState);
  }, [soundToneState]);

  useEffect(() => {
    if (!canAccessAprobaciones) {
      setPendingCount(0);
      setRealtimeConnected(false);
      setLatestPendingRequest(null);
      clearAttentionPulse();
      return;
    }

    void refreshPendingCount();
  }, [canAccessAprobaciones, clearAttentionPulse, refreshPendingCount]);

  useEffect(() => {
    if (!token || !canApproveAprobaciones) {
      pushConfigRef.current = null;
      setPushNotificationsEnabled(false);
      setPushNotificationsReason(null);
      return;
    }

    if (!canUseBrowserNotifications) {
      setPushNotificationsEnabled(false);
      setPushNotificationsReason(getPushUnavailableReason());
      return;
    }

    setPushNotificationsBusy(true);
    void (async () => {
      try {
        await syncPushSubscription(false);
      } finally {
        setPushNotificationsBusy(false);
      }
    })();
  }, [canApproveAprobaciones, canUseBrowserNotifications, syncPushSubscription, token]);

  useEffect(() => {
    if (!location.pathname.startsWith('/aprobaciones')) {
      return;
    }

    clearAttentionPulse();
  }, [clearAttentionPulse, location.pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const baseTitle = baseDocumentTitleRef.current || 'Gestión de Materiales App';

    if (!canAccessAprobaciones) {
      document.title = baseTitle;
      return;
    }

    if (pendingCount > 0) {
      const pendingTitle = pendingCount > 99
        ? '99+ pendientes'
        : pendingCount === 1
          ? '1 pendiente'
          : `${pendingCount} pendientes`;

      document.title = `${pendingTitle} | ${baseTitle}`;
      return;
    }

    document.title = location.pathname.startsWith('/aprobaciones')
      ? `Aprobaciones | ${baseTitle}`
      : baseTitle;
  }, [canAccessAprobaciones, location.pathname, pendingCount]);

  useEffect(() => {
    if (!socket || !token || !canAccessAprobaciones) {
      setRealtimeConnected(false);
      return;
    }

    let isCleaningUp = false;

    const playSoundIfEnabled = async () => {
      if (!soundEnabledRef.current) {
        return;
      }

      try {
        const AudioContextConstructor = getAudioContextConstructor();
        if (!AudioContextConstructor) {
          return;
        }

        audioContextRef.current = audioContextRef.current ?? new AudioContextConstructor();
        await playDiscreetApprovalChime(audioContextRef.current, soundToneRef.current);
      } catch (error) {
        console.error('No se pudo reproducir el sonido de aprobaciones', error);
      }
    };

    const showDesktopNotification = (payload: SolicitudPendienteRealtimePayload) => {
      if (
        !canShowDesktopNotificationsRef.current
        || notificationPermissionRef.current !== 'granted'
        || pushNotificationsEnabledRef.current
        || document.visibilityState === 'visible'
      ) {
        return;
      }

      try {
        const notification = new Notification('Nueva solicitud por aprobar', {
          body: `${payload.solicitante} envió ${payload.codigo} para ${payload.area}.`,
          tag: `aprobacion-pendiente-${payload.id}`,
        });
        window.setTimeout(() => notification.close(), 7000);
      } catch (error) {
        console.error('No se pudo mostrar la notificación de escritorio', error);
      }
    };

    const handlePendingRequest = async (payload: SolicitudPendienteRealtimePayload) => {
      setLastEventAt(payload.createdAt || new Date().toISOString());
      setLatestPendingRequest(payload);
      setEventVersion((current) => current + 1);
      setAttentionPulse(true);

      if (pulseTimeoutRef.current != null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }

      pulseTimeoutRef.current = window.setTimeout(() => {
        setAttentionPulse(false);
        pulseTimeoutRef.current = null;
      }, 12000);

      await refreshPendingCount();
      await playSoundIfEnabled();
      showDesktopNotification(payload);

      sileo.show({
        title: `Nueva solicitud: ${payload.codigo}`,
        description: `${payload.solicitante} envió una solicitud para ${payload.area}.`,
      });

      if (locationPathRef.current.startsWith('/aprobaciones')) {
        setAttentionPulse(true);
      }
    };

    const handleApprovalUpdate = async (payload: SolicitudAprobacionActualizadaRealtimePayload) => {
      setLastEventAt(payload.updatedAt || new Date().toISOString());
      setEventVersion((current) => current + 1);
      await refreshPendingCountRef.current();
    };

    const handleConnect = () => {
      setRealtimeConnected(true);
      socket.emit('join', SOCKET_ROOM_APROBACIONES);
    };

    const handleDisconnect = () => {
      if (isCleaningUp) {
        return;
      }

      setRealtimeConnected(false);
    };

    const handleConnectError = (error: Error) => {
      if (isCleaningUp) {
        return;
      }

      setRealtimeConnected(false);
      if (error?.message) {
        console.warn('Canal realtime de aprobaciones en espera:', error.message);
      }
    };

    const handlePendingRequestEvent = (payload: SolicitudPendienteRealtimePayload) => {
      void handlePendingRequest(payload);
    };

    const handleApprovalUpdateEvent = (payload: SolicitudAprobacionActualizadaRealtimePayload) => {
      void handleApprovalUpdate(payload);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(SOCKET_EVENT_SOLICITUD_PENDIENTE_APROBACION, handlePendingRequestEvent);
    socket.on(SOCKET_EVENT_SOLICITUD_APROBACION_ACTUALIZADA, handleApprovalUpdateEvent);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      isCleaningUp = true;
      setRealtimeConnected(false);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(SOCKET_EVENT_SOLICITUD_PENDIENTE_APROBACION, handlePendingRequestEvent);
      socket.off(SOCKET_EVENT_SOLICITUD_APROBACION_ACTUALIZADA, handleApprovalUpdateEvent);
      socket.emit('leave', SOCKET_ROOM_APROBACIONES);
    };
  }, [canAccessAprobaciones, refreshPendingCount, socket, token]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current != null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const value = useMemo<AprobacionesRealtimeContextValue>(
    () => ({
      canAccessAprobaciones,
      canApproveAprobaciones,
      pendingCount,
      realtimeConnected,
      lastEventAt,
      latestPendingRequest,
      eventVersion,
      attentionPulse,
      canUseBrowserNotifications,
      notificationPermission,
      requestBrowserNotificationPermission,
      pushNotificationsEnabled,
      pushNotificationsBusy,
      pushNotificationsReason,
      enablePushNotifications,
      soundEnabled: soundEnabledState,
      setSoundEnabled,
      soundTone: soundToneState,
      setSoundTone,
      refreshPendingCount,
    }),
    [
      attentionPulse,
      canAccessAprobaciones,
      canApproveAprobaciones,
      canUseBrowserNotifications,
      eventVersion,
      lastEventAt,
      latestPendingRequest,
      notificationPermission,
      pendingCount,
      pushNotificationsBusy,
      pushNotificationsEnabled,
      pushNotificationsReason,
      realtimeConnected,
      refreshPendingCount,
      enablePushNotifications,
      requestBrowserNotificationPermission,
      setSoundEnabled,
      setSoundTone,
      soundEnabledState,
      soundToneState,
    ],
  );

  return (
    <AprobacionesRealtimeContext.Provider value={value}>
      {children}
    </AprobacionesRealtimeContext.Provider>
  );
}