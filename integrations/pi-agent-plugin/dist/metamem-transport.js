// Transport routing only: native host hooks and tools remain unchanged.
if (process.env.METAMEM_API_KEY) process.env.MEM0_API_KEY = process.env.METAMEM_API_KEY;
if (process.env.METAMEM_BACKEND_URL) process.env.MEM0_API_URL = process.env.METAMEM_BACKEND_URL;
const components = new Set(['metamemory','invmem','hymemory','refind','activememoryindex','flowgrid','mem0','mem0_platform','jev-mem','hindsight','everos']);
const originalFetch = globalThis.fetch;
const marker = Symbol.for('metamem.fixed-endpoint.fetch');
export function metamemAuthOrigin() {
  const endpoint = process.env.METAMEM_BACKEND_URL || process.env.MEM0_API_URL
    || 'https://metamemory.8-163-122-236.nip.io';
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash
      || (url.pathname !== '/' && !/^\/metamem(?:\/[a-z0-9_-]+)?\/?$/.test(url.pathname))) {
    throw new Error('invalid_metamem_backend_url');
  }
  return url.origin;
}
if (!globalThis[marker]) {
  globalThis[marker] = true;
  globalThis.fetch = async function(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    // Installation is account authentication, not a memory operation. Keep
    // the official {email}/{email,code} bodies byte-shape compatible.
    if (url.origin === metamemAuthOrigin()
        && /^\/api\/v1\/auth\/email_code\/(?:verify\/)?$/.test(url.pathname)) {
      return originalFetch.call(this, input, init);
    }
    const configured = process.env.METAMEM_BACKEND_URL || process.env.MEM0_API_URL || metamemAuthOrigin();
    if (!configured || url.origin !== new URL(configured).origin || !/^(?:\/metamem)?\/(v[123]|api|extensions)\//.test(url.pathname)) {
      return originalFetch.call(this, input, init);
    }
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    let body;
    let component = url.searchParams.get('memory_component') || process.env.METAMEM_MEMORY_COMPONENT || 'mem0_platform';
    if (!['GET','HEAD'].includes(request.method) && request.headers.get('content-type')?.split(';')[0] === 'application/json') {
      body = await request.clone().json();
      component = body.memory_component ?? component;
      if (components.has(component)) body.memory_component = component;
    }
    if (!components.has(component)) throw new Error('metamem_memory_component_required');
    headers.set('X-Metamem-Memory-Component', component);
    if (body !== undefined) {
      headers.delete('content-length');
      return originalFetch.call(this, new Request(request, {headers, body: JSON.stringify(body)}));
    }
    return originalFetch.call(this, new Request(request, {headers}));
  };
}


// Native SDK management clients may use Axios rather than Fetch.
export function metamemClientOptions(options) {
  const endpoint = process.env.METAMEM_BACKEND_URL || process.env.MEM0_API_URL || metamemAuthOrigin();
  if (!endpoint) throw new Error('metamem_backend_url_required');
  const target = new URL(endpoint);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password
      || target.search || target.hash
      || (target.pathname !== '/' && !/^\/metamem(?:\/[a-z0-9_-]+)?\/?$/.test(target.pathname))) {
    throw new Error('invalid_metamem_backend_url');
  }
  return {...options, host: endpoint.replace(/\/$/, '')};
}

export function bindMetamemClient(client) {
  const component = process.env.METAMEM_MEMORY_COMPONENT || 'mem0_platform';
  if (!components.has(component)) throw new Error('metamem_memory_component_required');
  const endpoint = process.env.METAMEM_BACKEND_URL || process.env.MEM0_API_URL || metamemAuthOrigin();
  if (!endpoint) throw new Error('metamem_backend_url_required');
  const expected = new URL(endpoint);
  if (!['http:', 'https:'].includes(expected.protocol) || expected.username || expected.password
      || expected.search || expected.hash
      || (expected.pathname !== '/' && !/^\/metamem(?:\/[a-z0-9_-]+)?\/?$/.test(expected.pathname))) {
    throw new Error('invalid_metamem_backend_url');
  }
  // The same official client owns fetch and Axios operations. Bind both;
  // otherwise an unchanged native constructor may still select api.mem0.ai.
  client.host = endpoint.replace(/\/$/, '');
  const axios = client.client;
  if (axios?.defaults) axios.defaults.baseURL = client.host;
  if (axios?.interceptors?.request) {
    axios.interceptors.request.use(config => {
      const target = new URL(config.url, config.baseURL || client.host);
      if (target.origin !== expected.origin || !/^(?:\/metamem)?\/(v[123]|api|extensions)\//.test(target.pathname)) return config;
      config.headers = config.headers || {};
      config.headers['X-Metamem-Memory-Component'] = component;
      return config;
    });
  }
  return client;
}
