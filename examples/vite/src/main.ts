import { load, ShieldLabsError, type InteractionIdentifier, type LoadOptions } from '@shieldlabs-ai/js';

const form = document.querySelector<HTMLFormElement>('#signup');
const status = document.querySelector<HTMLParagraphElement>('#status');
if (!form || !status) throw new Error('The signup form is missing.');

const options: LoadOptions = { publicKey: import.meta.env.VITE_SHIELDLABS_PUBLIC_KEY };

function describe(error: unknown): string {
  return error instanceof ShieldLabsError ? `ShieldLabs ${error.code}: ${error.message}` : String(error);
}

// identifyOnInteraction() starts the identification on the first focus, pointer or key interaction
// with the form, so the result is ready when the user submits. The handle is created once the agent
// has loaded. load() reuses the loaded agent on every call and tries again after a failed load, so a
// submit after a passing network error or a slow load still gets an identification.
let handle: InteractionIdentifier | undefined;
async function identifier(signupForm: HTMLFormElement): Promise<InteractionIdentifier> {
  const agent = await load(options);
  return (handle ??= agent.identifyOnInteraction(signupForm));
}

identifier(form).catch((error: unknown) => {
  status.textContent = describe(error);
});

const submit = async (signupForm: HTMLFormElement): Promise<void> => {
  const data = new FormData(signupForm);
  let requestId: string | null = null;
  try {
    // One identification per submission: take() re-arms for the next attempt.
    ({ requestId } = await (await identifier(signupForm)).take());
  } catch (error) {
    // Without an identification your server treats the signup as unverified.
    status.textContent = describe(error);
  }

  // The page stays alive while this request is sent, so the agent can finish posting.
  const response = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: data.get('email'), password: data.get('password'), requestId }),
  });

  status.textContent = response.ok
    ? 'Account created.'
    : `Your server answered ${String(response.status)}. It would receive requestId ${requestId ?? '(none)'}.`;
};

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submit(form);
});
