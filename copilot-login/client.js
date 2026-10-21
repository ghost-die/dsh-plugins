/**
 * Client half of the GitHub Copilot sign-in bundle.
 *
 * Renders one compact card in Settings → Models. The card is a pure view over
 * the Host half's same-origin JSON endpoint: it starts and cancels the GitHub
 * device-code login, shows the verification code, and reports whether the
 * Copilot route is installed and signed in. No credentials ever travel
 * through this module.
 *
 * Written as a plain browser module for `window.__ModuleLoader__`; React comes
 * from the page's module table, and every visible string follows the active
 * Harness locale.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-copilot-login',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Mount point of the Host half's endpoints. Must match `basePath`. */
    const BASE = '/plugin/copilot';

    /** Card text, keyed by the two shipped UI locales. */
    const TEXT = {
      en: {
        title: 'GitHub Copilot',
        subtitle: 'Sign in with a GitHub account, then pick Copilot models from the model list. No API key is needed.',
        statusLoading: 'Reading status…',
        statusSignedIn: 'Signed in',
        statusSignedOut: 'Not signed in',
        statusRunning: 'Waiting for GitHub',
        statusWaitingInput: 'More information needed',
        statusNoFlow: 'Sign-in unavailable',
        statusNoRoute: 'Provider not enabled',
        statusFailed: 'Sign-in failed',
        statusAuthorized: 'Authorized',
        statusCancelled: 'Sign-in cancelled',
        modelsAvailable: '{count} models available',
        login: 'Sign in with GitHub',
        relogin: 'Sign in again',
        cancel: 'Cancel sign-in',
        logout: 'Sign out',
        enable: 'Enable Copilot provider',
        submitAnswer: 'Continue',
        open: 'Open GitHub verification page',
        copy: 'Copy code',
        copied: 'Copied',
        enterpriseLabel: 'GitHub domain (optional)',
        enterprisePlaceholder: 'github.com',
        flowMissing: 'No sign-in flow is registered. Enable the llm-pi-ai plugin, then reload this page.',
        routeMissing: 'The Copilot provider is not enabled yet. Enable it to list Copilot models, then sign in.',
        routeActivating: 'Enabling the provider…',
        noCredentials: 'The Host exposes no credential store, so a sign-in cannot be kept.',
        attemptFailed: 'Sign-in failed: {message}',
        requestFailed: 'Request failed: {message}',
        codeHint: 'Open the page above and enter this one-time code. This card updates by itself once GitHub confirms.',
        privacy: 'The credential is stored on this machine by the Harness credential service; this card never reads it.',
      },
      zh: {
        title: 'GitHub Copilot',
        subtitle: '使用 GitHub 账号授权登录，之后即可在模型列表中选择 Copilot 模型，无需 API Key。',
        statusLoading: '正在读取状态…',
        statusSignedIn: '已登录',
        statusSignedOut: '未登录',
        statusRunning: '等待 GitHub 授权',
        statusWaitingInput: '需要补充信息',
        statusNoFlow: '登录流程不可用',
        statusNoRoute: '提供方未启用',
        statusFailed: '授权失败',
        statusAuthorized: '授权成功',
        statusCancelled: '授权已取消',
        modelsAvailable: '{count} 个模型可用',
        login: '使用 GitHub 登录',
        relogin: '重新登录',
        cancel: '取消登录',
        logout: '退出登录',
        enable: '启用 Copilot 提供方',
        submitAnswer: '继续',
        open: '打开 GitHub 验证页',
        copy: '复制代码',
        copied: '已复制',
        enterpriseLabel: 'GitHub 域名（可选）',
        enterprisePlaceholder: 'github.com',
        flowMissing: '未找到登录流程。请确认已启用 llm-pi-ai 插件后刷新页面。',
        routeMissing: 'Copilot 提供方尚未启用。启用后即可在模型列表中选择 Copilot 模型，然后登录。',
        routeActivating: '正在启用提供方…',
        noCredentials: '当前运行环境没有凭证存储，登录结果无法保存。',
        attemptFailed: '授权失败：{message}',
        requestFailed: '请求失败：{message}',
        codeHint: '打开上方页面并输入这个一次性验证码。GitHub 确认后此卡片会自动更新。',
        privacy: '凭证由 Harness 凭证服务保存在本机，此卡片不会读取它。',
      },
    };

    /** Active UI locale id, refreshed from the Client locale service. */
    let activeLocale = 'en';
    /** Components listening for locale/text changes. */
    const listeners = new Set();

    /**
     * Notify mounted cards that shared view state changed.
     */
    function announce() {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* a crashed card must not stop the others */
        }
      }
    }

    /**
     * Subscribe one card to shared view state.
     * @param {() => void} listener - change callback.
     * @returns {() => void} unsubscribe.
     */
    function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    /**
     * Resolve the active locale from the Client locale service.
     * @param {object} ctx - the Client plugin context.
     * @returns {string} the active locale id, defaulting to English.
     */
    function readLocale(ctx) {
      try {
        return ctx.get('locale')?.getLocale?.().active ?? 'en';
      } catch {
        return 'en';
      }
    }

    /**
     * The dictionary for one locale id.
     * @param {string} locale - active locale id.
     * @returns {Record<string, string>} localized text.
     */
    function textFor(locale) {
      return String(locale).toLowerCase().startsWith('zh') ? TEXT.zh : TEXT.en;
    }

    /**
     * Interpolate `{name}` placeholders.
     * @param {string} template - text with placeholders.
     * @param {Record<string, unknown>} values - replacement values.
     * @returns {string} the filled text.
     */
    function fill(template, values) {
      return template.replace(/\{(\w+)\}/gu, (match, key) => String(values[key] ?? match));
    }

    /**
     * Call one Host endpoint.
     * @param {string} path - endpoint suffix (`/state`, `/login`, …).
     * @param {Record<string, unknown>} [body] - JSON body; omission sends GET.
     * @returns {Promise<Record<string, any>>} the decoded state.
     */
    async function request(path, body) {
      const response = await fetch(BASE + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        cache: 'no-store',
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        const message = data && data.error && data.error.message ? data.error.message : `HTTP ${response.status}`;
        const error = new Error(message);
        error.code = data && data.error ? data.error.code : 'failed';
        throw error;
      }
      return data ?? {};
    }

    /**
     * Whether the card currently has a sign-in in flight.
     * @param {Record<string, any> | null} state - latest Host state.
     * @returns {boolean} true while the flow runs.
     */
    function isRunning(state) {
      return Boolean(state && state.attempt && state.attempt.phase === 'running');
    }

    /**
     * Human status line for one Host state.
     * @param {Record<string, any> | null} state - latest Host state.
     * @param {Record<string, string>} t - localized text.
     * @returns {{ label: string, tone: string }} status text and tone.
     */
    function describeState(state, t) {
      if (state === null) return { label: t.statusLoading, tone: 'idle' };
      if (state.flow === null) return { label: t.statusNoFlow, tone: 'error' };
      const attempt = state.attempt ?? { phase: 'idle' };
      if (attempt.phase === 'running') {
        return attempt.prompt === null
          ? { label: t.statusRunning, tone: 'warn' }
          : { label: t.statusWaitingInput, tone: 'warn' };
      }
      if (state.signedIn === false) return { label: t.statusSignedOut, tone: 'idle' };
      if (state.signedIn === null) return { label: t.statusNoFlow, tone: 'error' };
      if (!state.routeActive) return { label: t.statusNoRoute, tone: 'warn' };
      return { label: t.statusSignedIn, tone: 'ok' };
    }

    /**
     * The sign-in card.
     * @param {Record<string, unknown>} props - slot props (unused beyond standard hooks).
     * @returns {import('react').ReactElement} the card.
     */
    function CopilotCard() {
      const t = textFor(activeLocale);
      const [state, setState] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [failure, setFailure] = React.useState(null);
      const [pollError, setPollError] = React.useState(null);
      const [enterprise, setEnterprise] = React.useState('');
      const [answer, setAnswer] = React.useState('');
      const [copied, setCopied] = React.useState(false);
      const [, refresh] = React.useState(0);

      React.useEffect(() => subscribe(() => refresh((value) => value + 1)), []);

      React.useEffect(() => {
        let live = true;
        let timer = null;
        const tick = async () => {
          try {
            const next = await request('/state');
            if (!live) return;
            setState(next);
            setPollError(null);
          } catch (error) {
            if (live) setPollError(fill(t.requestFailed, { message: String(error && error.message ? error.message : error) }));
          }
          if (live) timer = setTimeout(tick, 2000);
        };
        tick();
        return () => {
          live = false;
          if (timer !== null) clearTimeout(timer);
        };
        // The poller reads translated copy only through closure; restarting it
        // on a locale change would drop the in-flight request for no benefit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const act = async (path, body) => {
        setBusy(true);
        setFailure(null);
        try {
          const next = await request(path, body ?? {});
          setState(next);
        } catch (error) {
          setFailure(fill(t.requestFailed, { message: String(error && error.message ? error.message : error) }));
        } finally {
          setBusy(false);
        }
      };

      const copy = async (code) => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      };

      const running = isRunning(state);
      const attempt = state ? state.attempt : null;
      const notice = attempt && attempt.notice ? attempt.notice : null;
      const prompt = attempt && attempt.prompt ? attempt.prompt : null;
      const status = describeState(state, t);
      const flowAvailable = Boolean(state && state.flow !== null);
      const signedIn = Boolean(state && state.signedIn === true);
      const routeActive = Boolean(state && state.routeActive === true);

      const toneColor = {
        ok: 'var(--dsw-alias-state-success-primary)',
        warn: 'var(--dsw-alias-state-warn-primary)',
        error: 'var(--dsw-alias-state-error-primary)',
        idle: 'var(--dsw-alias-state-idle-primary)',
      }[status.tone] ?? 'var(--dsw-alias-state-idle-primary)';

      const button = (label, onClick, options = {}) => h('button', {
        type: 'button',
        className: options.primary ? 'cpl-button cpl-primary' : 'cpl-button',
        disabled: busy || options.disabled === true,
        onClick,
        'aria-busy': busy ? 'true' : undefined,
      }, label);

      const lines = [h('p', { className: 'cpl-subtitle', key: 'subtitle' }, t.subtitle)];

      if (failure !== null) lines.push(h('p', { className: 'cpl-error', role: 'alert', key: 'failure' }, failure));
      if (pollError !== null) lines.push(h('p', { className: 'cpl-error', role: 'alert', key: 'poll-error' }, pollError));
      if (attempt && attempt.phase === 'failed' && attempt.error) {
        lines.push(h('p', { className: 'cpl-error', role: 'alert', key: 'attempt-failure' }, fill(t.attemptFailed, { message: attempt.error })));
      }
      if (state && state.signedIn === null) {
        lines.push(h('p', { className: 'cpl-error', role: 'alert', key: 'no-credentials' }, t.noCredentials));
      }
      if (state && state.flow === null) {
        lines.push(h('p', { className: 'cpl-hint', key: 'flow-missing' }, t.flowMissing));
      } else if (state && !routeActive) {
        lines.push(h('p', { className: 'cpl-hint', key: 'route-missing' }, t.routeMissing));
      }

      if (running && notice && notice.url) {
        lines.push(h('p', { className: 'cpl-code-hint', key: 'code-hint' }, t.codeHint));
      } else if (running && notice && notice.message) {
        lines.push(h('p', { className: 'cpl-hint', key: 'notice' }, notice.message));
      }

      if (running && prompt !== null) {
        lines.push(h('div', { className: 'cpl-prompt', key: 'prompt' },
          h('label', { className: 'cpl-label', htmlFor: 'cpl-answer' }, prompt.message),
          h('div', { className: 'cpl-inline' },
            h('input', {
              id: 'cpl-answer',
              className: 'cpl-input',
              type: prompt.kind === 'secret' ? 'password' : 'text',
              value: answer,
              placeholder: prompt.placeholder ?? '',
              disabled: busy,
              onChange: (event) => setAnswer(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !busy) act('/answer', { value: answer });
              },
            }),
            button(t.submitAnswer, () => {
              act('/answer', { value: answer });
              setAnswer('');
            }, { primary: true }),
          ),
        ));
      }

      const actions = [];
      if (running) {
        actions.push(button(t.cancel, () => act('/cancel'), { primary: true }));
      } else {
        if (!routeActive && flowAvailable) {
          actions.push(button(t.enable, () => act('/enable-route'), { primary: true }));
        }
        if (routeActive && flowAvailable) {
          actions.push(button(signedIn ? t.relogin : t.login, () => act('/login', { enterpriseDomain: enterprise }), { primary: !signedIn }));
        }
        if (signedIn) actions.push(button(t.logout, () => act('/logout')));
      }

      const meta = [];
      if (typeof state?.modelCount === 'number' && routeActive) {
        meta.push(h('span', { className: 'cpl-meta', key: 'models' }, fill(t.modelsAvailable, { count: state.modelCount })));
      }

      return h('section', { className: 'cpl-card', 'aria-label': t.title },
        h('style', {
          key: 'style',
          dangerouslySetInnerHTML: {
            __html: [
              '.cpl-card{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
              '.cpl-head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
              '.cpl-title-row{display:flex;align-items:center;gap:8px;min-width:0}',
              '.cpl-dot{width:8px;height:8px;border-radius:50%;flex:none}',
              '.cpl-title{margin:0;font-size:14px;font-weight:600;line-height:22px}',
              '.cpl-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}',
              '.cpl-subtitle{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
              '.cpl-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
              '.cpl-code-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
              '.cpl-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}',
              '.cpl-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
              '.cpl-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
              '.cpl-inline{display:flex;align-items:center;gap:8px}',
              '.cpl-button{box-sizing:border-box;height:32px;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}',
              '.cpl-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
              '.cpl-button:disabled{opacity:.55;cursor:default}',
              '.cpl-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
              '.cpl-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
              '.cpl-small{height:26px;font-size:12px;padding:0 8px}',
              '.cpl-link{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:12px;line-height:18px}',
              '.cpl-link:hover{text-decoration:underline}',
              '.cpl-code-box{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}',
              '.cpl-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;letter-spacing:.08em;padding:2px 8px;border-radius:4px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
              '.cpl-prompt{display:flex;flex-direction:column;gap:6px}',
              '.cpl-label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
              '.cpl-input{box-sizing:border-box;flex:1;min-width:120px;height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}',
              '.cpl-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}',
              '.cpl-privacy{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
            ].join(''),
          },
        }),
        h('div', { className: 'cpl-head', key: 'head' },
          h('div', { className: 'cpl-title-row' },
            h('span', { className: 'cpl-dot', style: { background: toneColor }, 'aria-hidden': true }),
            h('h3', { className: 'cpl-title' }, t.title),
          ),
          h('span', { className: 'cpl-status', role: 'status', 'aria-live': 'polite' }, status.label),
        ),
        ...lines,
        running && notice && (notice.code || notice.url) ? h('div', { className: 'cpl-code-box', key: 'code-box' },
          notice.url ? h('a', { className: 'cpl-link', href: notice.url, target: '_blank', rel: 'noreferrer noopener' }, t.open) : null,
          notice.code ? h('code', { className: 'cpl-code' }, notice.code) : null,
          notice.code ? h('button', {
            type: 'button',
            className: 'cpl-button cpl-small',
            onClick: () => copy(notice.code),
          }, copied ? t.copied : t.copy) : null,
        ) : null,
        actions.length === 0 ? null : h('div', { className: 'cpl-actions', key: 'actions' }, ...actions),
        routeActive && !signedIn && !running ? h('div', { className: 'cpl-inline', key: 'enterprise' },
          h('label', { className: 'cpl-label', htmlFor: 'cpl-enterprise' }, t.enterpriseLabel),
          h('input', {
            id: 'cpl-enterprise',
            className: 'cpl-input',
            type: 'text',
            value: enterprise,
            placeholder: t.enterprisePlaceholder,
            disabled: busy,
            onChange: (event) => setEnterprise(event.target.value),
          }),
        ) : null,
        h('div', { className: 'cpl-footer', key: 'footer' },
          ...meta,
          h('p', { className: 'cpl-privacy' }, t.privacy),
        ),
      );
    }

    return {
      inject: ['slots'],

      /**
       * Register the card in the Models settings page.
       * @param {object} ctx - the Client plugin context.
       */
      apply(ctx) {
        activeLocale = readLocale(ctx);
        const offLocale = typeof ctx.on === 'function'
          ? ctx.on('locale/change', (snapshot) => {
            activeLocale = snapshot && typeof snapshot.active === 'string' ? snapshot.active : readLocale(ctx);
            announce();
          })
          : undefined;
        ctx.effect(() => () => {
          if (typeof offLocale === 'function') offLocale();
          listeners.clear();
        }, 'copilot-login: locale listener');

        ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
          name: 'settings.models.footer',
          id: 'copilot-login',
          order: 20,
          label: 'GitHub Copilot',
        }, CopilotCard));
      },
    };
  },
});
