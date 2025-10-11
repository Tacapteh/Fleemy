/**
 * Sélecteurs pour le planning avec résolution des clients
 * Optimisé avec memoization pour éviter les rendus inutiles
 */

import { useMemo } from 'react';

/**
 * Crée un map client_id -> client pour résolution rapide
 */
export function useClientMap(clients: any[]) {
  return useMemo(() => {
    const map = new Map();
    clients.forEach(client => {
      map.set(client.id, client);
    });
    return map;
  }, [clients]);
}

/**
 * Résout le client_id d'un événement vers le display_name
 * Retourne le client_name (label) si le client n'est pas trouvé
 */
export function resolveClientName(
  event: any,
  clientMap: Map<string, any>
): string {
  if (!event.client_id) {
    // Pas de client_id, utiliser client_name/label
    return event.client_name || event.client || 'Client inconnu';
  }
  
  const client = clientMap.get(event.client_id);
  return client?.display_name || event.client_name || 'Client inconnu';
}

/**
 * Enrichit les événements avec les informations clients complètes
 */
export function useEnrichedEvents(events: any[], clients: any[]) {
  const clientMap = useClientMap(clients);
  
  return useMemo(() => {
    return events.map(event => ({
      ...event,
      clientDisplayName: resolveClientName(event, clientMap),
      client: clientMap.get(event.client_id)
    }));
  }, [events, clientMap]);
}

/**
 * Filtre les événements par client_id
 */
export function filterEventsByClient(events: any[], clientId: string) {
  return events.filter(event => event.client_id === clientId);
}

/**
 * Groupe les événements par client
 */
export function groupEventsByClient(events: any[], clientMap: Map<string, any>) {
  const grouped = new Map<string, any[]>();
  
  events.forEach(event => {
    const clientId = event.client_id || 'unknown';
    if (!grouped.has(clientId)) {
      grouped.set(clientId, []);
    }
    grouped.get(clientId)!.push({
      ...event,
      clientDisplayName: resolveClientName(event, clientMap)
    });
  });
  
  return grouped;
}
