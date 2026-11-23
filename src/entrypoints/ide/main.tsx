import { render } from 'preact';
import { App } from '@/ide/App';
import { loadTheme } from '@/ide/storage';
import { applyTheme } from '@/shared/theme';
import './style.css';
import './panels.css';
import './sidebar.css';
import './dialogs.css';

// Apply the saved theme as early as possible so the loading screen is in it too.
void loadTheme().then((theme) => applyTheme(document.documentElement, theme));

const root = document.getElementById('app');
if (root) render(<App />, root);
