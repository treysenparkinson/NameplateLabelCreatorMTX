const PPI = 96;
const LS_KEY = 'ms_nameplate_saved';
const FONT_SIZES_PT = [8, 12, 14, 16, 18, 20, 22, 24, 28, 32];
const DEFAULT_FONT_PT = 12;

const PT_TO_PX = 96 / 72; // 1pt at 96dpi

function makeFont(px, family) {
  return `${px}px ${family || 'Calibri'}`;
}

function fitFontPxToWidth(ctx, text, startPx, family, maxWidth) {
  let px = Math.max(1, startPx);
  ctx.font = makeFont(px, family);
  let w = ctx.measureText(text).width;
  if (w <= maxWidth) return px;
  while (w > maxWidth && px > 1) {
    px -= Math.max(0.5, Math.ceil((w - maxWidth) / 50)); // fast converge
    ctx.font = makeFont(px, family);
    w = ctx.measureText(text).width;
  }
  return Math.max(1, px);
}

function drawTextLines(ctx, lines, plateX, plateY, plateW, plateH, opts) {
  const { family, sizesPt, fg, innerPad = 12, lineGap = 0.22, dpr = 1 } = opts;

  // reset to neutral transform, then apply uniform HiDPI scale
  ctx.save();
  if (ctx.resetTransform) ctx.resetTransform();
  else ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (typeof ctx.getTransform === 'function') {
    console.debug('text transform', ctx.getTransform());
  }

  ctx.fillStyle = fg || '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxW = Math.max(1, plateW - innerPad * 2);

  const finalPx = lines.map((text, i) => {
    const targetPx = (sizesPt[i] || sizesPt[0] || 18) * PT_TO_PX;
    return fitFontPxToWidth(ctx, text, targetPx, family, maxW);
  });

  const heights = finalPx.map((px) => px);
  const gaps = finalPx.length > 1 ? (finalPx.length - 1) * (finalPx[0] * lineGap) : 0;
  const totalH = heights.reduce((a, b) => a + b, 0) + gaps;

  let y = plateY + (plateH - totalH) / 2 + heights[0] / 2;
  const cx = plateX + plateW / 2;

  lines.forEach((text, i) => {
    const px = finalPx[i];
    ctx.font = makeFont(px, family);
    ctx.fillText(text, cx, y);
    y += px + finalPx[0] * lineGap;
  });

  ctx.restore();
}

function scalePreviewToFit() {
  const stage = document.querySelector('.preview-viewport');
  const fitBox = document.querySelector('.preview-fit');
  const canvasEl = document.getElementById('labelCanvas');
  if (!stage || !fitBox || !canvasEl) return;

  const dpr = window.devicePixelRatio || 1;
  const naturalW = (canvasEl.width || 1) / dpr;
  const naturalH = (canvasEl.height || 1) / dpr;

  const availW = Math.max(1, stage.clientWidth - 2);
  const availH = Math.max(1, stage.clientHeight - 2);

  const scale = Math.min(availW / naturalW, availH / naturalH, 1);

  fitBox.style.transform = `scale(${scale})`;
  fitBox.style.width = `${naturalW}px`;
  fitBox.style.height = `${naturalH}px`;
}

const COLOR_MAP = {
  'Green/White': { bg: '#008000', fg: '#ffffff', name: 'Green/White' },
  'Red/White': { bg: '#cc0000', fg: '#ffffff', name: 'Red/White' },
  'Yellow/Black': { bg: '#ffd500', fg: '#000000', name: 'Yellow/Black' },
  'Blue/White': { bg: '#0057d9', fg: '#ffffff', name: 'Blue/White' },
  'Black/White': { bg: '#000000', fg: '#ffffff', name: 'Black/White' },
  'White/Black': { bg: '#ffffff', fg: '#000000', name: 'White/Black' },
  'Orange/Black': { bg: '#ff7a00', fg: '#000000', name: 'Orange/Black' },
  'Gray/Black': { bg: '#808080', fg: '#000000', name: 'Gray/Black' }
};

let state = {
  heightIn: 1.5,
  widthIn: 5.0,
  qty: 1,
  color: COLOR_MAP['Green/White'],
  corners: 'squared',
  font: 'Calibri, Arial, Helvetica, sans-serif',
  lines: [{ text: '', pt: 22 }]
};

let saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

let ctx = null;
const linesList = document.getElementById('linesList');
const addLineBtn = document.getElementById('addLine');
const fontSelect = document.getElementById('fontSelect');
const cornersGroup = document.getElementById('cornersGroup');
const colorsGroup = document.getElementById('colorsGroup');
const MIN_LINES = 1;
const MAX_LINES = 6;

if (fontSelect) {
  fontSelect.value = state.font;
  fontSelect.addEventListener('change', (e) => {
    state.font = e.target.value;
    render();
  });
}

if (cornersGroup) {
  const inputs = cornersGroup.querySelectorAll('input[name="corners"]');
  inputs.forEach((i) => {
    i.checked = i.value === state.corners;
    i.addEventListener('change', () => {
      state.corners = i.value;
      render();
    });
  });
}

if (colorsGroup) {
  const inputs = colorsGroup.querySelectorAll('input[name="color"]');
  inputs.forEach((i) => {
    i.checked = i.value === state.color.name;
  });
  inputs.forEach((i) => {
    i.addEventListener('change', () => {
      state.color = COLOR_MAP[i.value];
      render();
    });
  });
}

function renderLinesControls() {
  if (!linesList) return;
  linesList.innerHTML = '';
  state.lines.forEach((ln, idx) => {
    const row = document.createElement('div');
    row.className = 'line-row';
    const textInput = document.createElement('input');
    textInput.className = 'line-text';
    textInput.type = 'text';
    textInput.placeholder = `Line ${idx + 1}`;
    textInput.value = ln.text;

    const sizeSelect = document.createElement('select');
    sizeSelect.className = 'line-pt';
    FONT_SIZES_PT.forEach((pt) => {
      const opt = document.createElement('option');
      opt.value = String(pt);
      opt.textContent = `${pt} pt`;
      sizeSelect.appendChild(opt);
    });
    sizeSelect.value = String(ln.pt ?? ln.sizePt ?? DEFAULT_FONT_PT);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'line-remove btn btn-light';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = state.lines.length <= MIN_LINES;

    textInput.addEventListener('input', (e) => {
      ln.text = e.target.value;
      render();
    });

    sizeSelect.addEventListener('change', (e) => {
      ln.pt = Number(e.target.value);
      render();
    });

    removeBtn.addEventListener('click', () => {
      if (state.lines.length > MIN_LINES) {
        state.lines.splice(idx, 1);
        renderLinesControls();
        render();
      }
    });

    row.appendChild(textInput);
    row.appendChild(sizeSelect);
    row.appendChild(removeBtn);
    linesList.appendChild(row);
  });
}

if (addLineBtn) {
  addLineBtn.addEventListener('click', () => {
    if (state.lines.length < MAX_LINES) {
      state.lines.push({ text: '', pt: 18 });
      renderLinesControls();
      render();
    }
  });
}

function clampInputs() {
  const heightInput = document.getElementById('heightIn');
  const widthInput = document.getElementById('widthIn');
  const qtyInput = document.getElementById('qty');

  state.heightIn = Math.max(0.1, parseFloat(heightInput.value) || state.heightIn);
  state.widthIn = Math.max(0.1, parseFloat(widthInput.value) || state.widthIn);
  state.qty = Math.max(1, parseInt(qtyInput.value, 10) || state.qty);

  heightInput.value = state.heightIn.toFixed(2);
  widthInput.value = state.widthIn.toFixed(2);
  qtyInput.value = state.qty;
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function render() {
  clampInputs();
  const canvasEl = document.getElementById('labelCanvas');
  if (!canvasEl) return;

  const dpr = window.devicePixelRatio || 1;

  const wIn = Math.max(0.1, Number(state.widthIn || state.width || 0));
  const hIn = Math.max(0.1, Number(state.heightIn || state.height || 0));

  const PAD = 48;
  const plateW = wIn * PPI;
  const plateH = hIn * PPI;

  const cssW = plateW + PAD * 2;
  const cssH = plateH + PAD * 2;

  canvasEl.style.width = `${cssW}px`;
  canvasEl.style.height = `${cssH}px`;

  canvasEl.width = Math.round(cssW * dpr);
  canvasEl.height = Math.round(cssH * dpr);

  ctx = canvasEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const plateX = PAD;
  const plateY = PAD;
  const radius = state.corners === 'rounded' ? Math.min(plateW, plateH) * 0.06 : 0;

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.fillStyle = state.color.bg;
  drawRoundedRect(plateX, plateY, plateW, plateH, radius);
  ctx.fill();
  ctx.restore();

  const lines = (state.lines || []).map((l) => (l.text || '').trim()).filter(Boolean);
  const sizesPt = (state.lines || []).map((l) => Number(l.pt ?? l.sizePt ?? 18));
  const family = state.font || state.fontFamily || 'Calibri';
  const fg = (state.color && state.color.fg) || '#ffffff';

  drawTextLines(ctx, lines, plateX, plateY, plateW, plateH, {
    family,
    sizesPt,
    fg,
    innerPad: 12,
    lineGap: 0.22,
    dpr
  });

  scalePreviewToFit();
}

const previewWrapEl = document.querySelector('.preview-viewport');
if (typeof ResizeObserver !== 'undefined' && previewWrapEl) {
  const ro = new ResizeObserver(() => render());
  ro.observe(previewWrapEl);
}

let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(scalePreviewToFit, 100);
});

function saveToStorage() {
  localStorage.setItem(LS_KEY, JSON.stringify(saved));
}

function renderSavedList() {
  const container = document.getElementById('savedList');
  container.innerHTML = '';
  if (!saved.length) {
    container.textContent = 'No templates saved yet.';
    return;
  }

  saved.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'saved-card';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.textContent = item.sizeName;
    const color = document.createElement('div');
    color.className = 'muted';
    color.textContent = `${item.colorName} | Qty: ${item.quantity}`;
    meta.appendChild(title);
    meta.appendChild(color);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      saved.splice(idx, 1);
      saveToStorage();
      renderSavedList();
    });

    card.appendChild(meta);
    card.appendChild(del);
    container.appendChild(card);
  });
}

function setupControls() {
  document.getElementById('heightIn').value = state.heightIn.toFixed(2);
  document.getElementById('widthIn').value = state.widthIn.toFixed(2);
  document.getElementById('qty').value = state.qty;

  ['heightIn', 'widthIn'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      clampInputs();
      render();
    });
  });

  document.getElementById('qty').addEventListener('input', () => {
    clampInputs();
  });
}

function setupButtons() {
  document.getElementById('saveTemplate').addEventListener('click', () => {
    clampInputs();
    const entry = {
      variant: 'nameplate',
      height_in: state.heightIn,
      width_in: state.widthIn,
      sizeName: `${state.heightIn.toFixed(2)}" x ${state.widthIn.toFixed(2)}"`,
      colorName: state.color.name,
      bg: state.color.bg,
      fg: state.color.fg,
      corners: state.corners,
      font: state.font,
      lines: state.lines.map((x) => ({ text: x.text, pt: x.pt })),
      quantity: state.qty
    };
    saved.push(entry);
    saveToStorage();
    renderSavedList();
  });

  document.getElementById('submitAll').addEventListener('click', async () => {
    const referenceId = document.getElementById('referenceId').value.trim();
    if (!referenceId) {
      alert('Reference ID is required.');
      return;
    }
    if (!saved.length) {
      alert('Please save at least one template before submitting.');
      return;
    }

    try {
      const res = await fetch('/.netlify/functions/sendNameplate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceId, savedTemplates: saved })
      });
      const data = await res.json().catch(() => ({ ok: false, status: res.status }));
      if (res.ok) {
        saved = [];
        saveToStorage();
        renderSavedList();
        alert('Submitted successfully.');
      } else {
        alert(`Submit failed: ${data.status || res.status}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error submitting label.');
    }
  });
}

function init() {
  setupControls();
  renderLinesControls();
  setupButtons();
  renderSavedList();
  render();
}

document.addEventListener('DOMContentLoaded', init);