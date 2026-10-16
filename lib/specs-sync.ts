import { fetchConfiguredServer } from "@/lib/coolify";
import { getSetting, setSetting } from "@/lib/settings";
import { parseStoredSpecs, SPECS_KEY, specsFromCoolify, type StoredServerSpecs } from "@/lib/server-specs";

export function readStoredSpecs(): StoredServerSpecs | null {
  return parseStoredSpecs(getSetting(SPECS_KEY));
}

export async function refreshServerSpecs(): Promise<StoredServerSpecs | null> {
  try {
    const raw = await fetchConfiguredServer();
    const specs = raw ? specsFromCoolify(raw) : null;
    if (!specs) return readStoredSpecs();
    setSetting(SPECS_KEY, JSON.stringify(specs));
    setSetting("server_ram_mb", String(specs.memoryMb));
    return specs;
  } catch {
    return readStoredSpecs();
  }
}
