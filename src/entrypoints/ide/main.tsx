import { render } from 'preact';
import { App } from '@/ide/App';
import './style.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
