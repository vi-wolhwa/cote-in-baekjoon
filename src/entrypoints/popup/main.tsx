import { render } from 'preact';
import { App } from '@/popup/App';
import '@/shared/app-theme.css';
import './style.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
