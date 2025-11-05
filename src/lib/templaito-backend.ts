interface BackendRequestOptions extends RequestInit {
  path: string;
  searchParams?: Record<string, string | number | boolean | undefined>;
}

export async function callTemplaitoBackend<T = unknown>(
  options: BackendRequestOptions
): Promise<T> {
  const baseUrl = process.env.TEMPLAITO_BACKEND_URL;
  const token = process.env.TEMPLAITO_SERVICE_TOKEN;

  if (!baseUrl) {
    throw new Error("TEMPLAITO_BACKEND_URL environment variable is not set");
  }

  if (!token) {
    throw new Error("TEMPLAITO_SERVICE_TOKEN environment variable is not set");
  }

  const { path, searchParams, headers, ...rest } = options;
  const url = new URL(path, baseUrl);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const combinedHeaders: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
    ...(headers || {}),
  };

  const response = await fetch(url.toString(), {
    ...rest,
    headers: combinedHeaders,
  });

  console.log('response --------------------------------------', url);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      "Templaito backend request failed with " + response.status + ": " + message
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
