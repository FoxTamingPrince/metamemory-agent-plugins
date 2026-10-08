export function metamemHost() {
  const value = process.env.METAMEM_BACKEND_URL || "https://metamemory.8-163-122-236.nip.io";
  let url;
  try { url = new URL(value); } catch { throw new Error("invalid_metamem_backend_url"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || (url.pathname !== "/" && !/^\/metamem(?:\/[a-z0-9_-]+)?\/?$/.test(url.pathname))) {
    throw new Error("invalid_metamem_backend_url");
  }
  return value.replace(/\/$/, "");
}
