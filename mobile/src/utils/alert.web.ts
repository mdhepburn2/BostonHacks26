import { type AlertButton } from 'react-native';

import { pushAlert } from '@/utils/alert-queue';

/** Shows the alert in <AlertHost>, which the root layout renders. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  pushAlert({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}
