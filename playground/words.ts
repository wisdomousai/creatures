/** A name as words ('inspectClaw': 'inspect claw'), as it's written on a key or switch. */
const SPELT: Record<string, string> = { cattree: 'cat tree', birdbath: 'bird bath' };
export const words = (name: string) =>
  SPELT[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
