import { Alert, type AlertButton } from 'react-native';

/** Same as React Native's Alert.alert. Use this instead: Alert.alert does nothing on web. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  Alert.alert(title, message, buttons);
}
