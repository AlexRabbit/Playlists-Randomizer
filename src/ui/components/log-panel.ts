import { log, type LogEntry } from '@/logs/logger';
import { t } from '@/i18n';

let panelEl: HTMLElement | null = null;
let bodyEl: HTMLElement | null = null;
let open = false;

function formatLine(entry: LogEntry): string {
  let line = `[${entry.ts}] [${entry.level}] [${entry.channel}] ${entry.message}`;
  if (entry.data) line += ` ${JSON.stringify(entry.data)}`;
  return line;
}

function appendLine(entry: LogEntry): void {
  if (!bodyEl) return;
  const line = document.createElement('div');
  line.className = `log-line ${entry.level}`;
  line.textContent = formatLine(entry);
  bodyEl.appendChild(line);
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

export function toggleLogPanel(): void {
  if (!panelEl) return;
  open = !open;
  panelEl.hidden = !open;
  document.body.classList.toggle('log-modal-open', open);
}

export function renderLogPanel(root: HTMLElement): void {
  root.innerHTML = '';
  panelEl = document.createElement('div');
  panelEl.className = 'log-modal-overlay';
  panelEl.hidden = true;

  const modal = document.createElement('div');
  modal.className = 'log-modal glass';

  const header = document.createElement('div');
  header.className = 'log-modal-header';
  const title = document.createElement('h2');
  title.textContent = t('logs');
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'log-modal-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = t('copyLogs');
  copyBtn.onclick = () => {
    const text = log.getEntries().map(formatLine).join('\n');
    navigator.clipboard.writeText(text || '(empty)').catch(() => {});
  };

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn';
  clearBtn.textContent = 'Clear';
  clearBtn.onclick = () => {
    log.clear();
    if (bodyEl) bodyEl.innerHTML = '';
  };

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = 'Export';
  exportBtn.onclick = () => {
    const blob = new Blob([log.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prr-logs-${Date.now()}.json`;
    a.click();
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-icon';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => toggleLogPanel();

  actions.append(copyBtn, clearBtn, exportBtn, closeBtn);
  header.appendChild(actions);

  bodyEl = document.createElement('div');
  bodyEl.className = 'log-panel-body';

  for (const e of log.getEntries()) appendLine(e);
  log.subscribe(appendLine);

  panelEl.onclick = (e) => {
    if (e.target === panelEl) toggleLogPanel();
  };

  modal.append(header, bodyEl);
  panelEl.appendChild(modal);
  root.appendChild(panelEl);
}
