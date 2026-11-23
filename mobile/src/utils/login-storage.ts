import * as SecureStore from 'expo-secure-store';

/** Where the saved login lives: the phone's keychain here, localStorage in login-storage.web.ts. */
export function getItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export function setItem(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value);
}

export function removeItem(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key);
}
