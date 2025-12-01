const PPI = 96;
const LS_KEY = 'ms_nameplate_saved';

const colorOptions = [
  { name: 'Green/White', bg: '#008000', fg: '#ffffff' },
  { name: 'Red/White', bg: '#cc0000', fg: '#ffffff' },
  { name: 'Yellow/Black', bg: '#ffd500', fg: '#000000' },
  { name: 'Blue/White', bg: '#0057d9', fg: '#ffffff' },
  { name: 'Black/White', bg: '#000000', fg: '#ffffff' },
  { name: 'White/Black', bg: '#ffffff', fg: '#000000' },
  { name: 'Orange/Black', bg: '#ff7a00', fg: '#000000' },
  { name: 'Gray/Black', bg: '#808080', fg: '#000000' }
];

let state = {
  heightIn: 1.5,
  widthIn: 5.0,
  qty: 1,
  color: { bg: '#008000', fg: '#ffffff', name: 'Green/White' },
  corners: 'rounded',
  font: 'Inter, system-ui, Arial, Helvetica, sans-serif',
  lines: [
    { text: '', pt: 22 },
    { text: '', pt: 18 },
    { text: '', pt: 16 }
  ]
};

let saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');

function createColorPalette() {
  const container = document.getElementById('colorOptions');
  container.innerHTML = '';
  colorOptions.forEach((opt, idx) => {
    const id = `color-${idx}`;
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'color';
    input.value = opt.name;
    input.id = id;
    if (state.color.name === opt.name) input.checked = true;
    input.addEventListener('change', () => {
      state.color = { ...opt };
      render();
    });

    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.background = opt.bg;
    swatch.title = `${opt.name}`;
    swatch.style.color = opt.fg;

    label.appendChild(input);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(opt.name));
    container.appendChild(label);
  });
}

function setupLineSelectors() {
  const sizes = [12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36];
  ['l1pt', 'l2pt', 'l3pt'].forEach((id, idx) => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    sizes.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = `${s} pt`;
      if (state.lines[idx].pt === s) opt.selected = true;
      sel.appendChild(opt);
    });
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
  const { width: cw, height: ch } = canvas;
  ctx.clearRect(0, 0, cw, ch);

  clampInputs();

  const rawW = state.widthIn * PPI;
  const rawH = state.heightIn * PPI;
  const padding = 20;
  const scale = Math.min((cw - padding * 2) / rawW, (ch - padding * 2) / rawH);
  const drawW = rawW * scale;
  const drawH = rawH * scale;
  const x = (cw - drawW) / 2;
  const y = (ch - drawH) / 2;

  const radius = state.corners === 'rounded' ? Math.min(drawW, drawH) * 0.06 : 0;

  ctx.fillStyle = state.color.bg;
  drawRoundedRect(x, y, drawW, drawH, radius);
  ctx.fill();

  const inset = drawH * 0.1;
  const availableH = drawH - inset * 2;
  const lineCount = state.lines.length;

  state.lines.forEach((line, idx) => {
    const text = (line.text || '').trim();
    if (!text) return;
    const basePx = line.pt * (PPI / 72);
    const fontSize = basePx * scale;
    ctx.font = `${fontSize}px ${state.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state.color.fg;

    const lineY = y + inset + (availableH / lineCount) * idx + (availableH / lineCount) / 2;

    if (state.color.bg.toLowerCase() === '#ffffff') {
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = '#333';
      ctx.strokeText(text, x + drawW / 2, lineY);
    }
    ctx.fillText(text, x + drawW / 2, lineY);
  });
}

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
  document.getElementById('fontSelect').value = state.font;
  document.getElementById('l1').value = state.lines[0].text;
  document.getElementById('l2').value = state.lines[1].text;
  document.getElementById('l3').value = state.lines[2].text;

  ['heightIn', 'widthIn'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      clampInputs();
      render();
    });
  });

  document.getElementById('qty').addEventListener('input', () => {
    clampInputs();
  });

  document.getElementsByName('corners').forEach((input) => {
    input.addEventListener('change', (e) => {
      state.corners = e.target.value;
      render();
    });
  });

  document.getElementById('fontSelect').addEventListener('change', (e) => {
    state.font = e.target.value;
    render();
  });

  ['l1', 'l2', 'l3'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('input', (e) => {
      state.lines[idx].text = e.target.value;
      render();
    });
  });

  ['l1pt', 'l2pt', 'l3pt'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('change', (e) => {
      state.lines[idx].pt = parseInt(e.target.value, 10);
      render();
    });
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
  createColorPalette();
  setupLineSelectors();
  setupControls();
  setupButtons();
  renderSavedList();
  render();
}

document.addEventListener('DOMContentLoaded', init);