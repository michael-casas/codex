/// <reference types="svelte" />
/// <reference types="vite/client" />

import type { ControlClient } from './control/types';

declare global {
  interface Window {
    __CODEX_CONTROL__?: ControlClient;
    __CODEX_CONTROL_MOBILE_BASE_URL__?: string;
    __CODEX_CONTROL_MOBILE_ACCESS__?: 'tailnet' | 'cloudflare-access';
  }
}
