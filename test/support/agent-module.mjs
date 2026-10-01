// A minimal stand-in for the agent module, imported for real by test/import-agent.test.ts.
const answer = (options) => {
  if (options && typeof options.onInitialized === 'function') {
    queueMicrotask(() => {
      options.onInitialized(Object.freeze({ status: 'initialized', requestID: 'c0a8e1f2-3b4d-4e5f-8a6b-7c8d9e0f1a2b' }));
    });
  }
};

export const checkAnonymous = (options) => answer(options);
export const checkAuthenticatedUser = (_userHid, options) => answer(options);
export const forceCheckAnonymous = (options) => answer(options);
export const forceCheckAuthenticatedUser = (_userHid, options) => answer(options);
