/* Petits outils d'interface : création d'éléments, modales, toasts, formulaires générés. */
(function (root) {
  'use strict';

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'); let cur = o;
    for (let i = 0; i < ks.length - 1; i++) { if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {}; cur = cur[ks[i]]; }
    cur[ks[ks.length - 1]] = v;
  }

  // ---------- modales ----------
  function modal(build, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const rootEl = document.getElementById('modal-root');
      const back = h('div', { class: 'modal-back' });
      const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') });
      back.append(box);
      let done = false;
      const close = (v) => { if (done) return; done = true; back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(opts.escValue === undefined ? null : opts.escValue); }
        if (e.key === 'Enter' && opts.enter && !(e.target.tagName === 'TEXTAREA')) { e.preventDefault(); e.stopPropagation(); opts.enter(close); }
      };
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(opts.escValue === undefined ? null : opts.escValue); });
      build(box, close);
      rootEl.append(back);
      const f = box.querySelector('input,select,textarea,button.primary');
      if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 10);
    });
  }

  function prompt(title, value, label) {
    let input;
    return modal((box, close) => {
      input = h('input', { type: 'text', value: value || '' });
      box.append(...[
        h('h3', {}, title),
        label ? h('label', { class: 'field-label' }, label) : null,
        input,
        h('div', { class: 'modal-actions' },
          h('button', { onclick: () => close(null) }, 'Annuler'),
          h('button', { class: 'primary', onclick: () => close(input.value.trim()) }, 'Valider'))
      ].filter(Boolean));
    }, { enter: (close) => close(input.value.trim()) });
  }

  function confirm(message, opts) {
    opts = opts || {};
    return modal((box, close) => {
      box.append(
        h('h3', {}, opts.title || 'Confirmation'),
        h('p', {}, message),
        h('div', { class: 'modal-actions' },
          h('button', { onclick: () => close(false) }, opts.cancel || 'Annuler'),
          h('button', { class: opts.danger ? 'danger' : 'primary', onclick: () => close(true) }, opts.ok || 'OK'))
      );
    }, { escValue: false, enter: (close) => close(true) });
  }

  function alert(title, body) {
    return modal((box, close) => {
      box.append(h('h3', {}, title));
      if (Array.isArray(body)) box.append(h('ul', { class: 'modal-list' }, body.map(b => h('li', {}, b))));
      else if (body) box.append(h('p', {}, body));
      box.append(h('div', { class: 'modal-actions' }, h('button', { class: 'primary', onclick: () => close(true) }, 'OK')));
    }, { escValue: true, enter: (close) => close(true) });
  }

  /** Choix dans une liste de boutons. options = [{value, label, desc}] */
  function choose(title, options, text, settings) {
    settings = settings || {};
    return modal((box, close) => {
      box.append(h('h3', {}, title), text ? h('p', {}, text) : '',
        h('div', { class: 'choice-list' }, options.map(o => h('button', { class: 'choice' + (o.primary ? ' primary' : ''), onclick: () => close(o.value) },
          h('b', {}, o.label), o.desc ? h('span', {}, o.desc) : null))),
        h('div', { class: 'modal-actions' }, h('button', { onclick: () => close(null) }, settings.cancelLabel || 'Annuler')));
    }, { wide: !!settings.wide });
  }

  function toast(msg, kind) {
    const el = h('div', { class: 'toast ' + (kind || '') }, msg);
    document.getElementById('toast-root').append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // ---------- formulaires ----------
  /**
   * fields : [{ key, label, type, ... }]
   * types : text, textarea, number, checkbox, select, multicheck, stats, costs, inventory, color, image, info, heading, row
   * ctx : { onChange(key, value, field), baseUrl, importImage() -> Promise<rel> }
   */
  function form(fields, obj, ctx) {
    const wrap = h('div', { class: 'form' });
    for (const f of fields) wrap.append(field(f, obj, ctx));
    return wrap;
  }

  function opts(f, obj) { return typeof f.options === 'function' ? f.options(obj) : (f.options || []); }

  function field(f, obj, ctx) {
    if (f.when && !f.when(obj)) return null;
    const change = (v) => { setPath(obj, f.key, v); ctx.onChange && ctx.onChange(f.key, v, f); };
    const val = f.key ? getPath(obj, f.key) : undefined;
    const label = f.label ? h('label', { class: 'field-label' }, f.label, f.help ? h('span', { class: 'help', title: f.help }, '?') : null) : null;
    let input;
    switch (f.type) {
      case 'heading': return h('div', { class: 'form-heading' }, f.label);
      case 'info': return h('p', { class: 'form-info' }, typeof f.text === 'function' ? f.text(obj) : f.text);
      case 'row': return h('div', { class: 'form-row' }, f.fields.map(sf => field(sf, obj, ctx)));
      case 'custom': return f.render(obj, ctx);
      case 'textarea':
        input = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '', spellcheck: false });
        input.value = val || '';
        input.addEventListener('input', () => change(input.value));
        break;
      case 'number':
        input = h('input', { type: 'number', min: f.min, max: f.max, step: f.step || 1 });
        input.value = val === undefined || val === null ? '' : val;
        input.addEventListener('change', () => change(input.value === '' ? 0 : Number(input.value)));
        break;
      case 'checkbox': {
        const cb = h('input', { type: 'checkbox' }); cb.checked = !!val;
        cb.addEventListener('change', () => change(cb.checked));
        return h('label', { class: 'field checkbox' }, cb, h('span', {}, f.label));
      }
      case 'select':
        input = h('select', {}, (f.empty ? [h('option', { value: '' }, f.empty)] : []).concat(opts(f, obj).map(o => h('option', { value: o.value }, o.label))));
        input.value = val === undefined || val === null ? '' : val;
        input.addEventListener('change', () => change(f.numeric ? Number(input.value) : input.value));
        break;
      case 'multicheck': {
        const cur = new Set(val || []);
        input = h('div', { class: 'chips' }, opts(f, obj).map(o => {
          const c = h('button', { type: 'button', class: 'chip' + (cur.has(o.value) ? ' on' : '') }, o.label);
          c.addEventListener('click', () => {
            if (cur.has(o.value)) cur.delete(o.value); else cur.add(o.value);
            c.classList.toggle('on'); change([...cur]);
          });
          return c;
        }));
        break;
      }
      case 'stats': {
        const keys = f.keys || Rules.STATS;
        const o = Object.assign({}, val || {});
        input = h('div', { class: 'stats-grid' + (f.percent ? ' pct' : '') }, keys.map(k => {
          const inp = h('input', { type: 'number', min: 0, max: f.max || 255 });
          inp.value = o[k] === undefined ? 0 : o[k];
          inp.addEventListener('change', () => { o[k] = Number(inp.value) || 0; change(Object.assign({}, o)); });
          return h('label', { class: 'stat-cell' }, h('span', {}, (f.labels && f.labels[k]) || Rules.STAT_LABELS[k] || k), inp);
        }));
        break;
      }
      case 'costs': {
        const o = Object.assign({}, val || {});
        input = h('div', { class: 'stats-grid' }, Rules.MOVE_TYPES.map(mt => {
          const inp = h('input', { type: 'number', min: 1, max: 99, title: '99 = infranchissable' });
          inp.value = o[mt.id] === undefined ? 1 : o[mt.id];
          inp.addEventListener('change', () => { o[mt.id] = Math.max(1, Number(inp.value) || 1); change(Object.assign({}, o)); });
          return h('label', { class: 'stat-cell wide' }, h('span', {}, mt.name), inp);
        }));
        break;
      }
      case 'inventory': {
        const list = (val || []).map(e => Object.assign({}, e));
        const all = opts(f, obj);
        const box = h('div', { class: 'inv-list' });
        const redraw = () => {
          box.innerHTML = '';
          list.forEach((slot, i) => {
            const sel = h('select', {}, all.map(o => h('option', { value: o.value }, o.label)));
            sel.value = slot.id;
            sel.addEventListener('change', () => { slot.id = sel.value; delete slot.uses; change(list.map(x => Object.assign({}, x))); });
            const up = h('button', { class: 'mini', title: 'Monter', html: Icons.icon('up') });
            up.addEventListener('click', () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; change(list.map(x => Object.assign({}, x))); redraw(); } });
            const del = h('button', { class: 'mini', title: 'Retirer', html: Icons.icon('trash') });
            del.addEventListener('click', () => { list.splice(i, 1); change(list.map(x => Object.assign({}, x))); redraw(); });
            box.append(h('div', { class: 'inv-row' }, h('span', { class: 'inv-n' }, i === 0 ? 'É' : String(i + 1)), sel, up, del));
          });
          if (list.length < (f.max || 5)) {
            const add = h('button', { class: 'ghost small' }, '+ Ajouter');
            add.addEventListener('click', () => { if (!all.length) return; list.push({ id: all[0].value }); change(list.map(x => Object.assign({}, x))); redraw(); });
            box.append(add);
          }
        };
        redraw();
        input = box;
        break;
      }
      case 'color':
        input = h('input', { type: 'color', value: val || '#888888' });
        input.addEventListener('input', () => change(input.value));
        break;
      case 'image': {
        const prev = h('div', { class: 'img-prev' });
        const show = () => {
          prev.innerHTML = '';
          const v = getPath(obj, f.key);
          if (v) prev.append(h('img', { src: Render.imageUrl(ctx.baseUrl, v) + '?t=' + Date.now() }));
          else prev.append(h('span', { class: 'muted' }, 'Aucune'));
        };
        show();
        const pick = h('button', { class: 'small' }, 'Choisir…');
        pick.addEventListener('click', async () => {
          const rel = await (f.importer || ctx.importImage)();
          if (rel) { change(rel); show(); }
        });
        const clr = h('button', { class: 'small ghost' }, 'Retirer');
        clr.addEventListener('click', () => { change(''); show(); });
        input = h('div', { class: 'img-field' }, prev, h('div', { class: 'img-actions' }, pick, clr));
        break;
      }
      default:
        input = h('input', { type: 'text', placeholder: f.placeholder || '' });
        input.value = val || '';
        input.addEventListener(f.live ? 'input' : 'change', () => change(input.value));
    }
    return h('div', { class: 'field' + (f.compact ? ' compact' : '') }, label, input);
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  root.UI = { h, getPath, setPath, modal, prompt, confirm, alert, choose, toast, form, debounce };
})(self);
