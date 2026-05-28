// Navegação unificada para o checkout de mesa.
// Centraliza markProceeding() + navigate() para que exista UM único call-site
// de markProceeding em todo o app — modal e painel chamam este helper.
import type { NavigateFunction } from 'react-router-dom';

export function goToSeatCheckout(
  navigate: NavigateFunction,
  markProceeding: () => void,
  eventId: string,
) {
  markProceeding();
  navigate(`/checkout/mesa/${eventId}`);
}
