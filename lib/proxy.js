/** Turns any remote asset URL into our same-origin proxy URL. */
export const proxied = (remoteUrl) =>
  remoteUrl ? `/api/proxy?url=${encodeURIComponent(remoteUrl)}` : '';
