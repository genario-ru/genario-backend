const PUBLIC_S3_URL_SCHEME = "s3-public://";

// Куда раскрываются публичные адреса: бакет и папка проекта в нём — в том же
// виде, что и переменные приватного бакета.
const PUBLIC_S3_VARIABLES = [
  "S3_PUBLIC_BUCKET_BASE_URL",
  "S3_PUBLIC_BUCKET_NAME",
  "S3_PUBLIC_KEY_PREFIX",
] as const;

/**
 * В JSON сида публичные адреса записаны как `s3-public://<путь>` — путь внутри
 * папки проекта в публичном бакете. Здесь они превращаются в URL этой папки,
 * чтобы JSON не зависел ни от бакета, ни от проекта, ни от окружения.
 *
 * Переменные нужны только сиду, поэтому они читаются здесь и проверяются лишь
 * когда строке они действительно нужны.
 */
export function resolvePublicS3Urls(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, resolveValue(value)]),
  );
}

function resolveValue(value: unknown) {
  if (typeof value !== "string" || !value.startsWith(PUBLIC_S3_URL_SCHEME)) {
    return value;
  }

  const missing = PUBLIC_S3_VARIABLES.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Для публичных адресов в сиде нужны переменные: ${missing.join(", ")}`,
    );
  }

  const [baseUrl, bucketName, keyPrefix] = PUBLIC_S3_VARIABLES.map((name) =>
    String(process.env[name]).replace(/^\/+|\/+$/g, ""),
  );
  const path = value.slice(PUBLIC_S3_URL_SCHEME.length);

  return `${baseUrl}/${bucketName}/${keyPrefix}/${path}`;
}
