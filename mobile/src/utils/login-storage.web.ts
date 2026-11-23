// expo-secure-store doesn't run on web. These are async to match the phone version, so a
// browser that blocks storage rejects (and the caller carries on) instead of throwing.

export async function getItem(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  localStorage.removeItem(key);
}
