export async function registerPush(): Promise<string> {
  throw new Error(
    "Push notifications require a configured native development build. In-app updates are available here.",
  );
}
export async function unregisterPush(): Promise<void> {}
export function listenForPush(_onOrder: (id: string) => void): () => void {
  return () => {};
}
