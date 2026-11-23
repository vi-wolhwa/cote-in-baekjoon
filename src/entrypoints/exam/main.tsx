import { render } from 'preact';
import { ExamApp } from '@/exam/ExamApp';
import { loadTheme } from '@/ide/storage';
import { applyTheme } from '@/shared/theme';
// The exam screen is the IDE's layout: same tokens, themes and components (ADR-0005).
import '../ide/style.css';
import '../ide/panels.css';
import '../ide/sidebar.css';
import '../ide/dialogs.css';
import '@/exam/setup-form.css';
import './exam.css';

// Apply the saved theme as early as possible so the loading screen is in it too.
void loadTheme().then((theme) => applyTheme(document.documentElement, theme));

const root = document.getElementById('app');
if (root) render(<ExamApp />, root);
