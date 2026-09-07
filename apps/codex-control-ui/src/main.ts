import { mount } from 'svelte';

import App from './app/App.svelte';
import './styles.css';

const target = document.getElementById('app');

if (!target) throw new Error('Codex Control mount target is missing.');

mount(App, { target });
