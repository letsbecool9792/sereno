// The native helper (EXTENSION_DESIGN.md §3.2): `npx sereno-ak connect` registers `ak` as the native messaging host
// com.sereno.ak, admitting only this extension. It signs with the user's own SSH key (ssh-agent, a security key, or
// the phone on Windows) and returns only the signature; the key never reaches the browser.
export const NATIVE_HOST = "com.sereno.ak";

export async function nativeInfo(): Promise<{ connected: boolean; key?: string; fingerprint?: string; listed?: boolean; error?: string }> {
  if (!(await chrome.permissions.contains({ permissions: ["nativeMessaging"] }))) return { connected: false, error: "permission" };
  try {
    const r = (await chrome.runtime.sendNativeMessage(NATIVE_HOST, { op: "info" })) as { key?: string; fingerprint?: string; listed?: boolean; error?: string };
    return r.error ? { connected: true, error: r.error } : { connected: true, ...r };
  } catch (e) {
    return { connected: false, error: (e as Error).message };
  }
}

/// Signs `text` in namespace sereno@v1 with the user's own key; returns the armored SSHSIG.
export async function nativeSign(text: string, login: string): Promise<string> {
  const r = (await chrome.runtime.sendNativeMessage(NATIVE_HOST, { op: "sign", text, login })) as { signature?: string; error?: string };
  if (!r?.signature) throw new Error(r?.error ?? "The helper didn't sign");
  return r.signature;
}
