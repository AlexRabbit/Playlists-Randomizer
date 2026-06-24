export function createSkeletonLines(count = 3): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'skeleton-wrap';
  for (let i = 0; i < count; i++) {
    const line = document.createElement('div');
    line.className = 'skeleton-line';
    line.style.width = i === count - 1 ? '60%' : '100%';
    wrap.appendChild(line);
  }
  return wrap;
}

export function createSkeletonCard(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'skeleton-wrap skeleton-player';
  wrap.innerHTML = `
    <div class="skeleton-block skeleton-thumb"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line" style="width:40%"></div>
    <div class="skeleton-row">
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
    </div>`;
  return wrap;
}
