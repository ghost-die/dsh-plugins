/**
 * Host half of the GitHub Copilot sign-in bundle.
 *
 * This bundle deliberately owns no model transport. The installed
 * `@deepseek-ai/dsh-llm-pi-ai` bridge already serves the `github-copilot`
 * route — its endpoint, headers, model catalog, token exchange and refresh —
 * and registers pi-ai's GitHub device-code login on the Harness authorization
 * seam under the credential key `llm-pi-ai/github-copilot`. What the Web
 * surface lacked is a place to (a) make the route exist and (b) start that
 * flow, read its device code and finish it. This Host half supplies both
 * behind a small same-origin JSON endpoint, so the Client card stays a pure
 * view and never talks to GitHub itself.
 *
 * Everything is resolved per request: a route added, a credential stored, or
 * a plugin reloaded is visible on the next poll without restarting the Host.
 *
 * @module @local/dsh-copilot-login/index
 */

/** Route defaults; the bundle patch may override any of them. */
const DEFAULTS = {
  provider: 'github-copilot',
  basePath: '/plugin/copilot',
  modelPluginId: 'llm-pi-ai',
};

/** Longest JSON request body this route accepts. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * A failure carrying a stable code for the Client to translate.
 * @param {string} code - machine-readable failure code.
 * @param {string} message - human-readable explanation.
 * @returns {Error & { code: string }} the coded failure.
 */
function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Read a non-empty string option.
 * @param {unknown} value - candidate option value.
 * @returns {string | undefined} the trimmed value, or undefined when unusable.
 */
function text(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Normalize an HTTP mount path: leading slash, no trailing slash.
 * @param {string} path - configured base path.
 * @returns {string} the normalized base path.
 */
function normalizeBasePath(path) {
  const withoutTrailing = path.replace(/\/+$/u, '');
  const withLeading = withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
  return withLeading.length === 0 ? DEFAULTS.basePath : withLeading;
}

/**
 * Resolve this row's options from its patch config, without a Config schema.
 *
 * A Config export would need the `schemastery` package at resolve time; the
 * bundle declares no dependencies so that a profile install stays offline and
 * cannot drift from the Host's own copy. Options are therefore read
 * defensively and documented in the README.
 * @param {unknown} config - the Loader row's config value.
 * @returns {{ provider: string, basePath: string, flowKey: string, modelPluginId: string }} resolved options.
 */
function resolveOptions(config) {
  const source = config !== null && typeof config === 'object' ? config : {};
  const provider = text(source.provider) ?? DEFAULTS.provider;
  return {
    provider,
    basePath: normalizeBasePath(text(source.basePath) ?? DEFAULTS.basePath),
    flowKey: text(source.flowKey) ?? `${DEFAULTS.modelPluginId}/${provider}`,
    modelPluginId: text(source.modelPluginId) ?? DEFAULTS.modelPluginId,
  };
}

/**
 * Turn a thrown value into a readable message.
 * @param {unknown} error - the thrown value.
 * @returns {string} a message safe to display.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Read the code of a thrown value, defaulting to a generic failure.
 * @param {unknown} error - the thrown value.
 * @returns {string} the stable failure code.
 */
function codeOf(error) {
  const code = error !== null && typeof error === 'object' ? error.code : undefined;
  return typeof code === 'string' && code.length > 0 ? code : 'failed';
}

/**
 * Pick a response status for a coded failure.
 * @param {unknown} error - the thrown value.
 * @returns {number} HTTP status.
 */
function statusOf(error) {
  switch (codeOf(error)) {
    case 'cross-origin':
      return 403;
    case 'method-not-allowed':
      return 405;
    case 'bad-request':
      return 400;
    case 'no-attempt':
    case 'flow-unavailable':
    case 'provider-unavailable':
    case 'authorization-unavailable':
    case 'credentials-unavailable':
    case 'services-unavailable':
      return 409;
    default:
      return 500;
  }
}

/**
 * Read the request path below the mount point.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @param {string} basePath - normalized mount path.
 * @returns {string | null} the sub-path, or null when the request is outside this mount.
 */
function subPathOf(req, basePath) {
  let pathname;
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
  if (pathname === basePath) return '/';
  if (!pathname.startsWith(`${basePath}/`)) return null;
  return pathname.slice(basePath.length);
}

/**
 * Send one JSON response.
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON body.
 */
function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

/**
 * Whether a browser request comes from this very origin.
 *
 * A foreign page cannot read the answer (no CORS headers), and requiring a
 * matching Origin keeps it from even performing the mutation: fetch() sends
 * Origin on POST, and a cross-site form POST cannot send the JSON content type
 * the handler insists on. Non-browser callers (curl, scripts) send no Origin
 * and are local to this Host by construction.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {boolean} true when the request may mutate.
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Read one small JSON body.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {Promise<Record<string, unknown>>} the parsed object, or an empty object.
 */
async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw failure('bad-request', 'request body is too large');
    chunks.push(buffer);
  }
  if (total === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw failure('bad-request', 'request body must be JSON');
  }
}

/**
 * Read a nested value without trusting the shape.
 * @param {unknown} value - root value.
 * @param {readonly string[]} path - property path.
 * @returns {unknown} the value at that path, or undefined.
 */
function valueAt(value, path) {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Create the per-plugin sign-in owner.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 * @param {ReturnType<typeof resolveOptions>} options - resolved row options.
 * @returns {{ snapshot: Function, start: Function, answer: Function, cancel: Function, signOut: Function, enableRoute: Function, dispose: Function }} the owner.
 */
function createAuthPanel(ctx, options) {
  /** The one attempt this Host is driving, or null. */
  let attempt = null;

  /**
   * The public shape of the current attempt (never the controller).
   * @returns {object} attempt view.
   */
  function attemptView() {
    if (attempt === null) return { phase: 'idle', notice: null, prompt: null, error: null, startedAt: null, method: null };
    return {
      phase: attempt.phase,
      notice: attempt.notice,
      prompt: attempt.prompt,
      error: attempt.error,
      startedAt: attempt.startedAt,
      method: attempt.method,
    };
  }

  /**
   * Ask the human for one value the flow needs, or take a queued answer.
   * @param {object} owner - the attempt record.
   * @param {{ kind: string, message: string, placeholder?: string, signal?: AbortSignal }} input - the flow's question.
   * @returns {Promise<string>} the answer.
   */
  function ask(owner, input) {
    return new Promise((resolve, reject) => {
      if (owner.answers.length > 0) {
        resolve(owner.answers.shift());
        return;
      }
      owner.pending = { resolve, reject, input };
      owner.prompt = {
        kind: typeof input.kind === 'string' ? input.kind : 'text',
        message: typeof input.message === 'string' ? input.message : '',
        placeholder: typeof input.placeholder === 'string' ? input.placeholder : null,
      };
      input.signal?.addEventListener('abort', () => {
        if (owner.pending?.resolve !== resolve) return;
        owner.pending = null;
        owner.prompt = null;
        reject(failure('cancelled', 'the sign-in attempt was cancelled while waiting for input'));
      }, { once: true });
    });
  }

  /**
   * Describe the live state the card renders.
   * @returns {Promise<object>} detached state.
   */
  async function snapshot() {
    const authorization = ctx.get('authorization');
    const credentials = ctx.get('credentials');
    const llm = ctx.get('llm');
    const flow = authorization === undefined ? undefined : authorization.describe(options.flowKey);

    let signedIn = null;
    if (credentials !== undefined) {
      try {
        signedIn = (await credentials.describeRecord(options.flowKey)).configured;
      } catch {
        signedIn = null;
      }
    }

    const routeActive = llm !== undefined && llm.listProviders().some((route) => route.id === options.provider);
    let modelCount = null;
    if (routeActive && llm !== undefined) {
      try {
        modelCount = (await llm.listModels(options.provider)).length;
      } catch {
        modelCount = null;
      }
    }

    return {
      provider: options.provider,
      flowKey: options.flowKey,
      basePath: options.basePath,
      modelPluginId: options.modelPluginId,
      routeActive,
      signedIn,
      modelCount,
      flow: flow === undefined ? null : {
        label: flow.label,
        inFlight: flow.inFlight === true,
        methods: flow.methods.map((method) => ({ id: method.id, label: method.label })),
      },
      attempt: attemptView(),
    };
  }

  /**
   * Start one authorization attempt through the Harness authorization seam.
   * @param {Record<string, unknown>} body - request body; `method` picks a flow method and `enterpriseDomain` pre-answers the first question.
   * @returns {Promise<object>} the state after the attempt started.
   */
  async function start(body) {
    const authorization = ctx.get('authorization');
    if (authorization === undefined) throw failure('authorization-unavailable', 'this composition has no authorization service, so no sign-in flow can run');
    const flow = authorization.describe(options.flowKey);
    if (flow === undefined) {
      throw failure('flow-unavailable', `no sign-in flow claims "${options.flowKey}"; enable the ${options.modelPluginId} plugin and reload`);
    }
    if (attempt !== null && attempt.phase === 'running') return snapshot();

    const requested = text(body.method);
    const method = requested !== undefined && flow.methods.some((entry) => entry.id === requested)
      ? requested
      : flow.methods[0]?.id;
    if (method === undefined) throw failure('flow-unavailable', `the flow for "${options.flowKey}" offers no method`);

    const controller = new AbortController();
    const started = {
      phase: 'running',
      notice: null,
      prompt: null,
      error: null,
      startedAt: Date.now(),
      method,
      controller,
      pending: null,
      answers: [typeof body.enterpriseDomain === 'string' ? body.enterpriseDomain : ''],
      done: null,
    };
    attempt = started;

    try {
      started.done = authorization.begin({
        key: options.flowKey,
        method,
        signal: controller.signal,
        interaction: {
          notify(notice) {
            started.notice = {
              message: typeof notice?.message === 'string' ? notice.message : '',
              url: typeof notice?.url === 'string' ? notice.url : null,
              code: typeof notice?.code === 'string' ? notice.code : null,
            };
          },
          prompt(input) {
            return ask(started, input);
          },
        },
      }).then((outcome) => {
        started.phase = outcome.status === 'authorized' ? 'authorized' : 'cancelled';
        started.prompt = null;
      }).catch((error) => {
        started.prompt = null;
        if (controller.signal.aborted) {
          started.phase = 'cancelled';
          return;
        }
        started.phase = 'failed';
        started.error = messageOf(error);
      });
    } catch (error) {
      if (attempt === started) attempt = null;
      throw error;
    }

    return snapshot();
  }

  /**
   * Hand one value to a waiting flow question.
   * @param {Record<string, unknown>} body - request body; `value` is the answer.
   * @returns {Promise<object>} the state after answering.
   */
  async function answer(body) {
    if (attempt === null || attempt.phase !== 'running') {
      throw failure('no-attempt', 'no sign-in attempt is waiting for input');
    }
    const value = typeof body.value === 'string' ? body.value : '';
    const pending = attempt.pending;
    if (pending === null) {
      attempt.answers.push(value);
      return snapshot();
    }
    attempt.pending = null;
    attempt.prompt = null;
    pending.resolve(value);
    return snapshot();
  }

  /**
   * Withdraw the current attempt.
   * @returns {Promise<object>} the state after cancellation.
   */
  async function cancel() {
    if (attempt === null) return snapshot();
    ctx.get('authorization')?.cancel(options.flowKey);
    attempt.controller.abort();
    if (attempt.pending !== null) {
      const pending = attempt.pending;
      attempt.pending = null;
      attempt.prompt = null;
      pending.reject(failure('cancelled', 'the sign-in attempt was cancelled'));
    }
    if (attempt.phase === 'running') attempt.phase = 'cancelled';
    return snapshot();
  }

  /**
   * Forget the stored sign-in record.
   * @returns {Promise<object>} the state after sign-out.
   */
  async function signOut() {
    const credentials = ctx.get('credentials');
    if (credentials === undefined) throw failure('credentials-unavailable', 'this composition has no credential service');
    await credentials.deleteRecord(options.flowKey);
    return snapshot();
  }

  /**
   * Make the Copilot provider profile exist so its route registers.
   *
   * The profile is the same empty object the Models page writes for a
   * catalog-owned provider: endpoint, protocol and models all come from the
   * installed catalog, and the stored sign-in supplies authentication.
   * @returns {Promise<object>} the state after the write.
   */
  async function enableRoute() {
    const llm = ctx.get('llm');
    const settings = ctx.get('settings');
    if (llm === undefined || settings === undefined) {
      throw failure('services-unavailable', 'this composition has no llm or settings service');
    }
    if (llm.listProviders().some((route) => route.id === options.provider)) return snapshot();

    const entry = llm.listConfigurableProviders().find((candidate) => candidate.provider === options.provider);
    if (entry === undefined) {
      throw failure('provider-unavailable', `no adapter declares "${options.provider}"; enable the ${options.modelPluginId} plugin and reload`);
    }
    if (entry.settingsPath.length === 0) {
      throw failure('provider-unavailable', `"${options.provider}" has no settings path to write`);
    }

    const described = settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === entry.settingsNs);
    if (described !== undefined && valueAt(described.value, entry.settingsPath) !== undefined) {
      throw failure('provider-unavailable', `the "${options.provider}" profile already exists but its route is not registered; open Settings → Models for its diagnostic`);
    }

    await settings.mutate(entry.settingsNs, [{
      op: 'set',
      path: [...entry.settingsPath],
      value: {},
    }]);
    return snapshot();
  }

  /** Abort anything still running when the plugin unloads. */
  function dispose() {
    if (attempt === null) return;
    attempt.controller.abort();
    if (attempt.pending !== null) {
      const pending = attempt.pending;
      attempt.pending = null;
      attempt.prompt = null;
      pending.reject(failure('cancelled', 'the plugin was unloaded'));
    }
  }

  return { snapshot, start, answer, cancel, signOut, enableRoute, dispose };
}

/**
 * Build the HTTP handler for this bundle's endpoints.
 * @param {ReturnType<typeof createAuthPanel>} panel - the sign-in owner.
 * @param {ReturnType<typeof resolveOptions>} options - resolved row options.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>} the handler.
 */
function createHandler(panel, options) {
  return async function handler(req, res) {
    try {
      const path = subPathOf(req, options.basePath);
      if (path === null) {
        sendJson(res, 404, { error: { code: 'not-found', message: 'unknown path' } });
        return;
      }
      if (req.method === 'GET' && (path === '/' || path === '/state')) {
        sendJson(res, 200, await panel.snapshot());
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: { code: 'method-not-allowed', message: 'only GET /state and POST endpoints are served here' } });
        return;
      }
      if (!sameOrigin(req)) throw failure('cross-origin', 'mutations are accepted only from this origin');
      const body = await readJson(req);
      switch (path) {
        case '/login':
          sendJson(res, 200, await panel.start(body));
          return;
        case '/answer':
          sendJson(res, 200, await panel.answer(body));
          return;
        case '/cancel':
          sendJson(res, 200, await panel.cancel());
          return;
        case '/logout':
          sendJson(res, 200, await panel.signOut());
          return;
        case '/enable-route':
          sendJson(res, 200, await panel.enableRoute());
          return;
        default:
          sendJson(res, 404, { error: { code: 'not-found', message: `unknown endpoint "${path}"` } });
      }
    } catch (error) {
      sendJson(res, statusOf(error), { error: { code: codeOf(error), message: messageOf(error) } });
    }
  };
}

/** Stable plugin name used by the Loader row. */
export const name = 'copilot-login';

/** The HTTP carrier is required; every other service is resolved optionally. */
export const inject = ['webServer'];

/**
 * Mount the Copilot sign-in endpoints.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 * @param {unknown} config - the Loader row's config.
 */
export function apply(ctx, config) {
  const options = resolveOptions(config);
  const panel = createAuthPanel(ctx, options);

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: options.basePath,
    handler: createHandler(panel, options),
  }), 'copilot-login: sign-in endpoints');

  ctx.effect(() => () => panel.dispose(), 'copilot-login: active sign-in attempt');
}
