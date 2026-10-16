type StorageObject = { name: string; id: string | null };
type Bucket = { id: string; name: string; public: boolean };

function headers(key: string): HeadersInit {
  return { apikey: key, authorization: `Bearer ${key}` };
}

export async function copyStorageFiles(input: {
  sourceUrl: string;
  targetUrl: string;
  serviceRoleKey: string;
}): Promise<{ copied: number; failed: number }> {
  const source = input.sourceUrl.replace(/\/$/, "");
  const target = input.targetUrl.replace(/\/$/, "");
  const key = input.serviceRoleKey;
  const response = await fetch(`${source}/storage/v1/bucket`, { headers: headers(key) });
  if (!response.ok) throw new Error(`Could not list storage buckets (${response.status}).`);
  const buckets = (await response.json()) as Bucket[];
  let copied = 0;
  let failed = 0;
  for (const bucket of buckets) {
    const created = await fetch(`${target}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers(key), "content-type": "application/json" },
      body: JSON.stringify({ id: bucket.id, name: bucket.name, public: bucket.public }),
    });
    if (!created.ok && created.status !== 409 && created.status !== 400) {
      failed += 1;
      continue;
    }
    const paths = await listPaths(source, bucket.id || bucket.name, key);
    for (const objectPath of paths) {
      try {
        const file = await fetch(`${source}/storage/v1/object/${encodePath(bucket.name, objectPath)}`, { headers: headers(key) });
        if (!file.ok) throw new Error(String(file.status));
        const body = Buffer.from(await file.arrayBuffer());
        const uploaded = await fetch(`${target}/storage/v1/object/${encodePath(bucket.name, objectPath)}`, {
          method: "POST",
          headers: {
            ...headers(key),
            "content-type": file.headers.get("content-type") || "application/octet-stream",
            "x-upsert": "true",
          },
          body,
        });
        if (!uploaded.ok) throw new Error(String(uploaded.status));
        copied += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { copied, failed };
}

async function listPaths(source: string, bucket: string, key: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const response = await fetch(`${source}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { ...headers(key), "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!response.ok) throw new Error(`Could not list storage objects (${response.status}).`);
    const rows = (await response.json()) as StorageObject[];
    if (!rows.length) break;
    for (const row of rows) {
      const objectPath = prefix ? `${prefix}/${row.name}` : row.name;
      if (!row.id) paths.push(...(await listPaths(source, bucket, key, objectPath)));
      else paths.push(objectPath);
    }
    if (rows.length < 100) break;
    offset += rows.length;
  }
  return paths;
}

function encodePath(bucket: string, objectPath: string): string {
  return [bucket, ...objectPath.split("/")].map((part) => encodeURIComponent(part)).join("/");
}
