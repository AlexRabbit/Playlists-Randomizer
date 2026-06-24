import { log, type LogEntry } from '@/logs/logger';

export function renderLogPanel(root: HTMLElement): void {
  root.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'log-panel collapsed';
  panel.id = 'log-panel';

  const header = document.createElement('div');
  header.className = 'log-panel-header';
  header.innerHTML = '<span>🔬 Debug Logs (intrusive)</span>';
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '0.5rem';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn';
  clearBtn.textContent = 'Clear';
  clearBtn.style.fontSize = '0.7rem';
  clearBtn.style.padding = '0.2rem 0.5rem';
  clearBtn.onclick = (e) => {
    e.stopPropagation();
    log.clear();
    body.innerHTML = '';
  };

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = 'Export';
  exportBtn.style.fontSize = '0.7rem';
  exportBtn.style.padding = '0.2rem 0.5rem';
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    const blob = new Blob([log.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prr-logs-${Date.now()}.json`;
    a.click();
  };

  actions.append(clearBtn, exportBtn);
  header.appendChild(actions);

  const body = document.createElement('div');
  body.className = 'log-panel-body';

  function appendLine(entry: LogEntry): void {
    const line = document.createElement('div');
    line.className = `log-line ${entry.level}`;
    line.textContent = `[${entry.ts}] [${entry.level}] [${entry.channel}] ${entry.message}`;
    if (entry.data) {
      line.textContent += ` ${JSON.stringify(entry.data)}`;
    }
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  for (const e of log.getEntries()) appendLine(e);
  log.subscribe(appendLine);

  header.onclick = () => panel.classList.toggle('collapsed');

  panel.append(header, body);
  root.appendChild(panel);
}
