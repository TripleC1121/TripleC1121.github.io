/* 管理後台：用表單編輯網站內容並上傳檔案，透過 GitHub API 直接存回儲存庫。
   存取權杖只存在這台瀏覽器，不會上傳到任何其他地方。 */
(function () {
  var CFG = { user: 'TripleC1121', repo: 'TripleC1121.github.io', branch: 'main' };
  var S = null, token = '', tab = 'profile', open = {}, bodies = {}, dirtyBody = {}, busy = false;
  try { token = localStorage.getItem('gh_token') || ''; var c = JSON.parse(localStorage.getItem('gh_cfg') || 'null'); if (c) CFG = c; } catch (e) {}
  var main = document.getElementById('main'), statusEl = document.getElementById('status');
  var IMG = /\.(png|jpe?g|gif|webp|svg)$/i;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k]; else if (k === 'html') n.innerHTML = attrs[k]; else if (k.slice(0, 2) === 'on') n[k] = attrs[k]; else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function status(msg, kind) { statusEl.textContent = msg || ''; statusEl.style.color = kind === 'bad' ? '#ffb4ab' : kind === 'ok' ? '#9be7c4' : '#cfe0f5'; }
  function b64enc(str) { var b = new TextEncoder().encode(str), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function b64dec(b64) { var s = atob(b64.replace(/\s/g, '')), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); }
  function fileB64(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(file); }); }
  function api(method, path, body) {
    var url = 'https://api.github.com/repos/' + CFG.user + '/' + CFG.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    if (method === 'GET') url += '?ref=' + encodeURIComponent(CFG.branch) + '&t=' + Date.now();
    return fetch(url, { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (r.status === 404 && method === 'GET') return null; if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(r.status + ' ' + (j.message || '')); }); return r.json(); });
  }
  function put(path, b64, msg) {
    return api('GET', path).then(function (cur) {
      return api('PUT', path, { message: msg, content: b64, branch: CFG.branch, sha: cur && cur.sha ? cur.sha : undefined });
    });
  }
  function del(path, msg) { return api('GET', path).then(function (cur) { return cur ? api('DELETE', path, { message: msg, sha: cur.sha, branch: CFG.branch }) : null; }); }
  function raw(path) { return 'https://raw.githubusercontent.com/' + CFG.user + '/' + CFG.repo + '/' + CFG.branch + '/' + path.split('/').map(encodeURIComponent).join('/'); }
  function bi(v) { return v && typeof v === 'object' && !Array.isArray(v) ? { zh: v.zh || '', en: v.en || '' } : { zh: v || '', en: v || '' }; }
  function bilines(v) { if (Array.isArray(v)) return { zh: v.slice(), en: v.slice() }; v = v || {}; return { zh: v.zh || [], en: v.en || [] }; }
  function safeName(n) { var m = n.match(/(\.[A-Za-z0-9]+)$/), ext = m ? m[1].toLowerCase() : ''; var base = n.slice(0, n.length - ext.length).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || ('file-' + Date.now()); return base + ext; }

  /* ---------- field helpers ---------- */
  function text(o, k, label, ph) { return el('div', {}, [el('label', { text: label }), el('input', { type: 'text', value: o[k] == null ? '' : o[k], placeholder: ph || '', oninput: function () { o[k] = this.value; } })]); }
  function bitext(o, k, label, area) {
    o[k] = bi(o[k]);
    function f(l, name) { var i = el(area ? 'textarea' : 'input', area ? {} : { type: 'text' }); i.value = o[k][l]; i.oninput = function () { o[k][l] = this.value; }; return el('div', {}, [el('label', { text: label + '（' + name + '）' }), i]); }
    return el('div', { class: 'two' }, [f('zh', '中文'), f('en', 'English')]);
  }
  function lines(o, k, label) {
    o[k] = bilines(o[k]);
    function f(l, name) { var i = el('textarea'); i.value = o[k][l].join('\n'); i.oninput = function () { o[k][l] = this.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }; return el('div', {}, [el('label', { text: label + '（' + name + '，一行一點）' }), i]); }
    return el('div', { class: 'two' }, [f('zh', '中文'), f('en', 'English')]);
  }
  function check(o, k, label, dflt) { var v = o[k] == null ? dflt : o[k]; return el('label', { class: 'chk' }, [el('input', { type: 'checkbox', checked: !!v, onchange: function () { o[k] = this.checked; } }), label]); }
  function listEditor(arr, title, hint, make, blank, labelOf, key) {
    var box = el('div', {});
    arr.forEach(function (it, i) {
      var id = key + i, body = el('div', { hidden: !open[id] }, open[id] ? make(it) : []);
      box.appendChild(el('div', { class: 'box' }, [el('div', { class: 'itemhead', onclick: function (e) { if (e.target.tagName === 'BUTTON') return; open[id] = !open[id]; render(); } }, [
        el('b', { text: (open[id] ? '▾ ' : '▸ ') + (labelOf(it) || '（未命名）') }),
        el('button', { class: 'btn w s', text: '↑', title: '上移', onclick: function () { if (i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); open = {}; render(); } } }),
        el('button', { class: 'btn w s', text: '↓', title: '下移', onclick: function () { if (i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); open = {}; render(); } } }),
        el('button', { class: 'btn d s', text: '刪除', onclick: function () { if (confirmDel(labelOf(it))) { arr.splice(i, 1); open = {}; render(); } } })
      ]), body]));
    });
    return el('div', {}, [el('div', { class: 'box' }, [el('h3', { text: title }), el('p', { class: 'hint', text: hint }), el('button', { class: 'btn', text: '＋ 新增一筆', onclick: function () { arr.push(blank()); open = {}; open[key + (arr.length - 1)] = true; render(); } })]), box]);
  }
  function confirmDel(name) { return window.confirm('確定刪除「' + (name || '此項目') + '」？按「儲存並發布」後才會生效。'); }

  /* ---------- tabs ---------- */
  function tProfile() {
    var p = S.profile = S.profile || {}; S.site = S.site || {}; p.links = p.links || [];
    function linkUrl(label) { var l = p.links.filter(function (x) { return x.label === label; })[0]; if (!l) { l = { label: label, url: '' }; p.links.push(l); } return text(l, 'url', label + ' 網址', 'https://'); }
    p.cv_pdf = bi(p.cv_pdf);
    var photo = el('div', { class: 'box' }, [el('h3', { text: '大頭照' }), el('p', { class: 'hint', text: '建議正方形、500×500 以上。目前：' + (p.photo || '未設定') }),
      p.photo ? el('img', { src: raw(p.photo) + '?t=' + Date.now(), style: 'width:110px;height:110px;border-radius:50%;object-fit:cover;display:block;margin-bottom:10px' }) : null,
      picker('選擇照片', 'image/*', false, function (files) { var f = files[0], path = 'assets/photo' + (f.name.match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0].toLowerCase(); return fileB64(f).then(function (b) { return put(path, b, 'Update photo'); }).then(function () { p.photo = path; return saveAll(); }); })]);
    function cvUp(l, name) { return el('div', {}, [el('label', { text: '履歷 PDF（' + name + '）：' + (p.cv_pdf[l] || '未上傳') }), picker('上傳 PDF', 'application/pdf', false, function (files) { var path = 'assets/cv/George_Chang_CV_' + l.toUpperCase() + '.pdf'; return fileB64(files[0]).then(function (b) { return put(path, b, 'Update CV pdf'); }).then(function () { p.cv_pdf[l] = path; return saveAll(); }); })]); }
    return el('div', {}, [
      el('div', { class: 'box' }, [el('h3', { text: '基本資料' }), el('p', { class: 'hint', text: '顯示在首頁最上方與履歷頁。' }), bitext(p, 'name', '姓名（左上角與首頁大標題；中文版顯示中文、英文版顯示英文）'), bitext(p, 'headline', '定位（一句話）'), bitext(p, 'location', '所在地'), bitext(p, 'summary', '簡介', true),
        el('div', { class: 'two' }, [text(p, 'email', 'Email'), linkUrl('LinkedIn')]),
        check(S.site, 'draft_banner', '顯示「草稿預覽」橫幅（內容審核完成後取消勾選）', false)]),
      photo,
      el('div', { class: 'box' }, [el('h3', { text: '可下載的履歷 PDF' }), el('p', { class: 'hint', text: '上傳後，履歷頁會出現下載按鈕。' }), el('div', { class: 'two' }, [cvUp('zh', '中文'), cvUp('en', 'English')])])
    ]);
  }
  function entryForm(e) { return [bitext(e, 'org', '單位／學校'), bitext(e, 'role', '職稱／學位'), el('div', { class: 'two' }, [text(e, 'period', '期間', '2025/09 – 2026/07'), el('div')]), bitext(e, 'place', '地點'), lines(e, 'points', '重點條列')]; }
  function blankEntry() { return { org: bi(''), role: bi(''), period: '', place: bi(''), points: { zh: [], en: [] } }; }
  function tExp() {
    return el('div', {}, [
      listEditor(S.experience = S.experience || [], '工作與實習經歷', '由新到舊排列。', entryForm, blankEntry, function (e) { return bi(e.org).zh + '｜' + bi(e.role).zh; }, 'ex'),
      listEditor(S.education = S.education || [], '學歷', '由新到舊排列。', entryForm, blankEntry, function (e) { return bi(e.org).zh; }, 'ed'),
      listEditor(S.skills = S.skills || [], '技能', '每一組一個類別，項目用逗號分隔。', function (s) { return [bitext(s, 'group', '類別'), bitext(s, 'items', '項目（逗號分隔）', true)]; }, function () { return { group: bi(''), items: bi('') }; }, function (s) { return bi(s.group).zh; }, 'sk')
    ]);
  }
  function tAwards() {
    S.publications = bilines(S.publications);
    return el('div', {}, [
      listEditor(S.awards = S.awards || [], '獎項與證照', '顯示在「獎項」頁，由新到舊排列。', function (a) { return [bitext(a, 'title', '名稱'), bitext(a, 'org', '頒發單位'), el('div', { class: 'two' }, [text(a, 'date', '時間', '2024/06'), el('div')]), bitext(a, 'note', '補充說明（選填）', true)]; }, function () { return { title: bi(''), org: bi(''), date: '', note: bi('') }; }, function (a) { return bi(a.title).zh; }, 'aw'),
      el('div', { class: 'box' }, [el('h3', { text: '發表' }), el('p', { class: 'hint', text: '顯示在「獎項」頁下方與履歷頁。' }), lines(S, 'publications', '清單')])
    ]);
  }
  function picker(label, accept, multiple, handler) {
    var input = el('input', { type: 'file', accept: accept || false, multiple: !!multiple, hidden: true });
    function run(files) { if (!files.length || busy) return; busy = true; status('上傳中…（請勿關閉頁面）'); Promise.resolve(handler(Array.prototype.slice.call(files))).then(function () { busy = false; render(); }).catch(function (e) { busy = false; status('上傳失敗：' + e.message, 'bad'); }); }
    input.onchange = function () { run(input.files); };
    var d = el('div', { class: 'drop', text: label + '（點擊選擇，或把檔案拖到這裡）', onclick: function () { input.click(); } });
    d.ondragover = function (e) { e.preventDefault(); d.className = 'drop over'; }; d.ondragleave = function () { d.className = 'drop'; };
    d.ondrop = function (e) { e.preventDefault(); d.className = 'drop'; run(e.dataTransfer.files); };
    return el('div', {}, [input, d]);
  }
  function tLabels() {
    S.labels = S.labels || {};
    var rows = (window.SITE_LABELS || []).map(function (x) {
      function f(l) { var i = el('input', { type: 'text', placeholder: x[l] }); i.value = (S.labels[x.k] && S.labels[x.k][l]) || ''; i.oninput = function () { var o = S.labels[x.k] = S.labels[x.k] || {}; o[l] = this.value; if (!o.zh && !o.en) delete S.labels[x.k]; }; return i; }
      return el('div', {}, [el('label', { text: x.d }), el('div', { class: 'two' }, [f('zh'), f('en')])]);
    });
    return el('div', { class: 'box' }, [el('h3', { text: '介面文字' }), el('p', { class: 'hint', text: '網站上所有固定的標題、選單與按鈕文字。左欄中文、右欄英文。留空就使用灰色字顯示的預設值。' })].concat(rows));
  }
  function num(v, d, lo, hi) { v = parseFloat(v); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); }
  function slider(o, k, label, min, max, step, dflt, unit, onch) {
    var out = el('b', { text: num(o[k], dflt, min, max) + unit });
    var r = el('input', { type: 'range', min: min, max: max, step: step, value: num(o[k], dflt, min, max) });
    r.oninput = function () { o[k] = +this.value; out.textContent = this.value + unit; if (onch) onch(); pushPreview(); };
    return el('div', { class: 'ctl' }, [el('label', {}, [label + '：', out]), r]);
  }
  function select(o, k, label, opts, dflt, onch) {
    var s = el('select', {}, opts.map(function (x) { return el('option', { value: x[0], text: x[1], selected: (o[k] || dflt) === x[0] }); }));
    s.onchange = function () { o[k] = this.value; if (onch) onch(); pushPreview(); };
    return el('div', { class: 'ctl' }, [el('label', { text: label }), s]);
  }
  function boxStyle(b) { var w = num(b.width, 100, 10, 100), al = b.align || 'center'; return 'width:' + w + '%;margin-left:' + (al === 'left' ? '0' : 'auto') + ';margin-right:' + (al === 'right' ? '0' : 'auto'); }
  function miniImage(dir, b) {
    var ratio = b.ratio && b.ratio !== 'auto' ? b.ratio : '';
    var imgs = (b.files || []).map(function (f) {
      var u = raw(dir + f);
      return ratio ? '<img src="' + u + '" style="aspect-ratio:' + ratio + ';object-fit:cover;width:100%">' :
        '<div class="cell"><img src="' + u + '" onload="if(this.naturalHeight)this.parentNode.style.flex=(this.naturalWidth/this.naturalHeight)+\' 1 0\'"></div>';
    }).join('');
    return '<div class="mfig ' + (ratio ? 'crop c' + Math.min((b.files || []).length, 3) : 'pics') + '" style="' + boxStyle(b) + '"><div class="row">' + imgs + '</div></div>';
  }
  function coverStyle(p) {
    if (!p.cover) return 'background:linear-gradient(135deg,#0b1b33,#1f4f7a)';
    return 'background-image:url("' + raw(p.cover) + '");background-size:' + (p.cover_fit === 'contain' ? 'contain' : 'cover') + ';background-position:' + num(p.cover_x, 50, 0, 100) + '% ' + num(p.cover_y, 50, 0, 100) + '%;background-repeat:no-repeat;background-color:#0b1b33';
  }
  var dragFrom = null;
  var TYPES = [['h', '標題'], ['p', '文字'], ['image', '圖片'], ['video', '影片'], ['file', '檔案'], ['callout', '提醒框'], ['divider', '分隔線']];
  function typeName(t) { return (TYPES.filter(function (x) { return x[0] === t; })[0] || [0, t])[1]; }
  var RESIZE = false; try { RESIZE = localStorage.getItem('resize2400') === '1'; } catch (e) {}
  function resizeToggle() {
    return el('label', { class: 'chk' }, [el('input', { type: 'checkbox', checked: RESIZE, onchange: function () { RESIZE = this.checked; try { localStorage.setItem('resize2400', RESIZE ? '1' : '0'); } catch (e) {} } }),
      '上傳前把寬度超過 2400 px 的圖片等比例縮小到 2400 px（不裁切；PNG 維持無損。可大幅加快網頁載入，建議開啟）']);
  }
  function prepare(f) {
    if (!RESIZE || !/^image\/(png|jpeg|webp)$/.test(f.type)) return fileB64(f).then(function (b) { return { name: safeName(f.name), b64: b }; });
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        if (img.naturalWidth <= 2400) return fileB64(f).then(function (b) { res({ name: safeName(f.name), b64: b }); }, rej);
        var c = document.createElement('canvas'); c.width = 2400; c.height = Math.round(img.naturalHeight * 2400 / img.naturalWidth);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var type = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
        res({ name: safeName(f.name), b64: c.toDataURL(type, 0.92).split(',')[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); fileB64(f).then(function (b) { res({ name: safeName(f.name), b64: b }); }, rej); };
      img.src = url;
    });
  }
  function upload(p, files, each) {
    var dir = 'assets/projects/' + p.slug + '/', chain = Promise.resolve();
    files.forEach(function (f) { chain = chain.then(function () { if (f.size > 50 * 1024 * 1024) throw new Error(f.name + ' 超過 50 MB，請壓縮或改貼 YouTube 連結'); status('處理 ' + f.name + '…'); return prepare(f).then(function (x) { status('上傳 ' + x.name + '…'); return put(dir + x.name, x.b64, 'Upload ' + x.name).then(function () { each(x.name); }); }); }); });
    return chain.then(saveAll);
  }
  function blockEditor(p) {
    var arr = p.blocks = p.blocks || [], dir = 'assets/projects/' + p.slug + '/', wrap = el('div', { class: 'doc' });
    function inserter(at) {
      return el('div', { class: 'ins' }, [el('span', { text: '＋ 插入：' })].concat(TYPES.map(function (t) {
        return el('button', { class: 'btn w s', text: t[1], onclick: function () { var b = { t: t[0] }; if (t[0] === 'image') b.files = []; arr.splice(at, 0, b); render(); } });
      })));
    }
    function two(b, area, ph) {
      function f(l, name) { var i = el(area ? 'textarea' : 'input', area ? { placeholder: name + (ph || '') } : { type: 'text', placeholder: name + (ph || '') }); i.value = b[l] || ''; i.oninput = function () { b[l] = this.value; }; if (area) { i.style.minHeight = Math.min(360, 60 + (i.value.split('\n').length) * 24) + 'px'; } return i; }
      return el('div', { class: 'two' }, [f('zh', '中文'), f('en', 'English')]);
    }
    wrap.appendChild(inserter(0));
    arr.forEach(function (b, i) {
      var body = [];
      if (b.t === 'h') body.push(two(b, false, '標題'));
      else if (b.t === 'p') body.push(two(b, true, '內文（可用 - 條列、**粗體**、[連結文字](網址)）'));
      else if (b.t === 'callout') body.push(two(b, true, '提醒文字'));
      else if (b.t === 'divider') body.push(el('hr'));
      else if (b.t === 'image') {
        b.files = b.files || []; b.caption = bi(b.caption);
        body.push(el('div', { class: 'media' }, b.files.map(function (f, k) { var path = dir + f, isCover = p.cover === path;
          return el('div', { class: 'm' + (isCover ? ' cover' : '') }, [el('div', { class: 'th', style: 'background-image:url(' + raw(path) + ')', title: f }), el('div', { class: 'in' }, [el('div', { class: 'fname', text: f }), el('div', { class: 'row' }, [
            el('button', { class: 'btn w s', text: '←', title: '左移', onclick: function () { if (k > 0) { b.files.splice(k - 1, 0, b.files.splice(k, 1)[0]); render(); } } }),
            el('button', { class: 'btn w s', text: '→', title: '右移', onclick: function () { if (k < b.files.length - 1) { b.files.splice(k + 1, 0, b.files.splice(k, 1)[0]); render(); } } }),
            el('button', { class: 'btn ' + (isCover ? '' : 'w ') + 's', text: isCover ? '✓ 封面' : '設為封面', onclick: function () { p.cover = isCover ? '' : path; render(); } }),
            el('button', { class: 'btn d s', text: '移除', onclick: function () { b.files.splice(k, 1); if (p.cover === path) p.cover = ''; render(); } })])])]); })));
        body.push(picker('加入圖片（可一次多張，多張會並排）', 'image/*', true, function (files) { return upload(p, files, function (n) { b.files.push(n); }); }));
        body.push(bitext(b, 'caption', '圖說（選填）'));
        if (b.files.length) {
          var mp = el('div', { class: 'mini' }), upd = function () { mp.innerHTML = miniImage(dir, b); };
          body.push(el('div', { class: 'layout' }, [
            slider(b, 'width', '顯示寬度', 20, 100, 5, 100, '%', upd),
            select(b, 'align', '對齊', [['center', '置中'], ['left', '靠左'], ['right', '靠右']], 'center', upd),
            select(b, 'ratio', '比例', [['auto', '原比例（不裁切）'], ['16/9', '16:9（裁切）'], ['4/3', '4:3（裁切）'], ['1/1', '1:1（裁切）']], 'auto', upd)]));
          body.push(el('div', { class: 'minilabel', text: '版面預覽（灰框＝專案頁內文寬度）' })); body.push(mp); upd();
        }
      } else if (b.t === 'video') {
        b.caption = bi(b.caption);
        body.push(el('p', { class: 'hint', text: b.file ? '已上傳：' + b.file : '上傳 mp4（建議 25 MB 以下），或在下方貼 YouTube 連結，二擇一。' }));
        body.push(picker(b.file ? '更換影片檔' : '上傳影片檔', 'video/*', false, function (files) { return upload(p, files, function (n) { b.file = n; b.url = ''; }); }));
        body.push(text(b, 'url', 'YouTube 連結', 'https://youtu.be/...')); body.push(bitext(b, 'caption', '說明（選填）'));
        body.push(el('div', { class: 'layout' }, [slider(b, 'width', '顯示寬度', 20, 100, 5, 100, '%'), select(b, 'align', '對齊', [['center', '置中'], ['left', '靠左'], ['right', '靠右']], 'center')]));
      } else if (b.t === 'file') {
        b.label = bi(b.label);
        body.push(el('p', { class: 'hint', text: b.file ? '已上傳：' + b.file : '上傳 PDF、簡報或其他文件，網站上會顯示為下載連結。' }));
        body.push(picker(b.file ? '更換檔案' : '上傳檔案', '', false, function (files) { return upload(p, files, function (n) { b.file = n; }); }));
        body.push(bitext(b, 'label', '顯示名稱'));
      }
      var handle = el('span', { class: 'grip', title: '按住拖曳可調整順序', draggable: 'true', text: '⠿' });
      handle.ondragstart = function (e) { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.setDragImage(blk, 20, 20); } catch (x) {} };
      handle.ondragend = function () { dragFrom = null; };
      var blk = el('div', { class: 'blk t-' + b.t }, [el('div', { class: 'bar' }, [handle, el('span', { class: 'ty', text: typeName(b.t) }), el('span', { style: 'flex:1' }),
        el('button', { class: 'btn w s', text: '↑', onclick: function () { if (i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); render(); } } }),
        el('button', { class: 'btn w s', text: '↓', onclick: function () { if (i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); render(); } } }),
        el('button', { class: 'btn d s', text: '刪除', onclick: function () { if (confirmDel(typeName(b.t) + '區塊')) { arr.splice(i, 1); render(); } } })])].concat(body));
      blk.ondragover = function (e) { if (dragFrom === null || dragFrom === i) return; e.preventDefault(); blk.classList.add('dropto'); };
      blk.ondragleave = function () { blk.classList.remove('dropto'); };
      blk.ondrop = function (e) { if (dragFrom === null) return; e.preventDefault(); e.stopPropagation(); var from = dragFrom; dragFrom = null; if (from !== i) { arr.splice(i, 0, arr.splice(from, 1)[0]); } render(); };
      wrap.appendChild(blk);
      wrap.appendChild(inserter(i + 1));
    });
    return wrap;
  }
  function coverEditor(p) {
    var card = el('div', { class: 'pv-card' }), hero = el('div', { class: 'pv-hero' }, [el('span', { text: '專案頁頂部' })]);
    function upd() { card.setAttribute('style', coverStyle(p)); hero.setAttribute('style', p.cover_hero === false ? 'background:linear-gradient(135deg,#0b1b33,#132a4d)' : coverStyle(p)); xy.hidden = p.cover_fit === 'contain' || !p.cover; }
    var xy = el('div', { class: 'layout' }, [slider(p, 'cover_x', '水平位置', 0, 100, 1, 50, '%', upd), slider(p, 'cover_y', '垂直位置', 0, 100, 1, 50, '%', upd)]);
    var box = el('div', {}, [
      p.cover ? el('div', { class: 'layout' }, [select(p, 'cover_fit', '顯示方式', [['cover', '填滿（超出部分裁切，可調位置）'], ['contain', '完整顯示（不裁切，留白補深藍）']], 'cover', upd),
        el('div', { class: 'ctl' }, [el('label', { text: '專案頁頂部背景' }), (function () { var sl = el('select', {}, [el('option', { value: '1', text: '使用封面圖', selected: p.cover_hero !== false }), el('option', { value: '0', text: '不使用（深藍純色，適合含文字的封面）', selected: p.cover_hero === false })]); sl.onchange = function () { if (this.value === '0') p.cover_hero = false; else delete p.cover_hero; upd(); pushPreview(); }; return sl; })()]),
        el('div', { class: 'ctl' }, [el('label', { text: '原始圖片' }), el('a', { href: raw(p.cover), target: '_blank', text: '開新分頁查看原圖' })])]) : null,
      p.cover ? xy : null,
      el('div', { class: 'pvrow' }, [el('div', {}, [el('div', { class: 'minilabel', text: '卡片（首頁與專案列表）' }), card]), el('div', { style: 'flex:1' }, [el('div', { class: 'minilabel', text: '專案頁頂部' }), hero])])
    ]);
    upd(); return box;
  }
  function projectForm(p) {
    var tagsIn = el('input', { type: 'text', value: (p.tags || []).join(', '), oninput: function () { p.tags = this.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); } });
    return [
      el('p', { class: 'hint', text: '專案代號：' + p.slug + '（網址與資料夾名稱，建立後不可更改）' }),
      bitext(p, 'title', '專案名稱'), el('div', { class: 'two' }, [text(p, 'period', '期間', '2024 – 2026'), el('div', {}, [el('label', { text: '領域標籤（逗號分隔，用於篩選）' }), tagsIn])]),
      bitext(p, 'role', '角色／類型'), bitext(p, 'summary', '一句話摘要（顯示在卡片與專案頁上方）', true),
      check(p, 'featured', '顯示在首頁精選', false), check(p, 'in_cv', '列入履歷頁', true), lines(p, 'cv_points', '履歷頁條列'),
      el('h3', { text: '封面', style: 'margin:18px 0 0' }), el('p', { class: 'hint', text: '目前：' + (p.cover ? p.cover.split('/').pop() : '未設定（網站顯示自動色塊）') + '。可在這裡上傳，或在下方任一張圖片按「設為封面」。' }),
      coverEditor(p),
      picker('上傳封面圖', 'image/*', false, function (files) { return upload(p, files, function (n) { p.cover = 'assets/projects/' + p.slug + '/' + n; }); }),
      resizeToggle(),
      el('h3', { text: '頁面內容', style: 'margin:22px 0 0' }), el('p', { class: 'hint', text: '由上到下就是專案頁的呈現順序。用「＋ 插入」在任何位置加入標題、文字、圖片、影片、檔案；用 ↑ ↓ 調整順序。' }),
      blockEditor(p)
    ];
  }
  function tProjects() {
    var arr = S.projects = S.projects || [];
    var wrap = listEditor(arr, '專案', '由上到下即網站上的排列順序。點開專案可編輯頁面內容、上傳檔案與選擇封面。', projectForm, function () { return null; }, function (p) { return bi(p.title).zh + (p.featured ? '  ★精選' : ''); }, 'pj');
    wrap.querySelector('.box .btn').onclick = function () {
      var slug = (window.prompt('輸入專案代號（英文小寫、數字與連字號，例如 my-new-project）') || '').trim().toLowerCase();
      if (!slug) return; if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return window.alert('代號只能用英文小寫、數字與連字號。');
      if (arr.some(function (p) { return p.slug === slug; })) return window.alert('這個代號已存在。');
      arr.push({ slug: slug, title: bi(''), period: '', role: bi(''), tags: [], featured: false, in_cv: true, cover: '', summary: bi(''), cv_points: { zh: [], en: [] },
        blocks: [{ t: 'h', zh: '專案概述', en: 'Overview' }, { t: 'p', zh: '', en: '' }, { t: 'h', zh: '研究方法', en: 'Approach' }, { t: 'p', zh: '', en: '' }, { t: 'h', zh: '研究成果', en: 'Results' }, { t: 'p', zh: '', en: '' }] });
      open = {}; open['pj' + (arr.length - 1)] = true; render();
    };
    return wrap;
  }

  /* ---------- live preview ---------- */
  var pv = null, pvTimer = null, lastRoute = null;
  function currentRoute() {
    if (tab === 'exp') return '#/experience';
    if (tab === 'awards') return '#/awards';
    if (tab === 'projects') { for (var i = 0; i < (S.projects || []).length; i++) if (open['pj' + i]) return '#/projects/' + S.projects[i].slug; return '#/projects'; }
    return '#/';
  }
  function pushPreview(force) {
    if (!pv || pv.closed || !S) return;
    clearTimeout(pvTimer);
    pvTimer = setTimeout(function () {
      var r = currentRoute(), msg = { type: 'preview', S: JSON.parse(JSON.stringify(S)) };
      if (force || r !== lastRoute) { msg.route = r; lastRoute = r; }
      try { pv.postMessage(msg, location.origin); } catch (e) {}
    }, force ? 0 : 250);
  }
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.type === 'preview-ready') pushPreview(true); });
  main.addEventListener('input', function () { pushPreview(); });
  main.addEventListener('change', function () { pushPreview(); });
  document.getElementById('preview').onclick = function () {
    lastRoute = null;
    if (pv && !pv.closed) { pv.focus(); pushPreview(true); return; }
    pv = window.open('index.html?preview=1' + currentRoute(), 'site-preview');
  };
  /* After saving, check the public site until the new content is live. */
  var liveCheck = 0;
  function waitLive(yml) {
    var my = ++liveCheck, tries = 0, t0 = Date.now();
    if (!/github\.io$/.test(location.hostname)) return;
    (function poll() {
      if (my !== liveCheck) return;
      fetch('content/site.yml?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
        if (my !== liveCheck) return;
        if (txt === yml) { status('✓ 網站已更新（' + new Date().toLocaleTimeString() + '，部署約 ' + Math.round((Date.now() - t0) / 1000) + ' 秒）', 'ok'); return; }
        if (++tries > 40) { status('已儲存；網站仍在部署中，請稍後重新整理（可到 GitHub 儲存庫的 Actions 分頁查看進度）', 'ok'); return; }
        status('已儲存，網站部署中…（' + Math.round((Date.now() - t0) / 1000) + ' 秒，通常 30–90 秒）'); setTimeout(poll, 5000);
      }).catch(function () { if (my === liveCheck && ++tries <= 40) setTimeout(poll, 5000); });
    })();
  }

  /* ---------- load / save ---------- */
  function saveAll() {
    S.site = S.site || {}; S.site.github = { user: CFG.user, repo: CFG.repo, branch: CFG.branch };
    status('儲存中…');
    var yml = '# 此檔由管理後台（admin.html）產生與維護\n' + jsyaml.dump(S, { lineWidth: 200, noRefs: true });
    var chain = put('content/site.yml', b64enc(yml), 'Update site content');
    Object.keys(dirtyBody).forEach(function (slug) { chain = chain.then(function () { var b = bodies[slug]; return put('content/projects/' + slug + '.md', b64enc(b.zh.trim() + '\n\n<!--en-->\n\n' + b.en.trim() + '\n'), 'Update ' + slug); }).then(function () { delete dirtyBody[slug]; }); });
    return chain.then(function () { status('已儲存，網站部署中…'); waitLive(yml); });
  }
  function render() {
    document.getElementById('save').hidden = document.getElementById('logout').hidden = document.getElementById('preview').hidden = !S;
    pushPreview();
    main.innerHTML = '';
    if (!S) return main.appendChild(login());
    var tabs = [['profile', '基本資料'], ['exp', '學歷與工作經歷'], ['projects', '專案成果'], ['awards', '獎項與發表'], ['labels', '介面文字']];
    main.appendChild(el('div', { class: 'tabs' }, tabs.map(function (t) { return el('button', { class: tab === t[0] ? 'on' : '', text: t[1], onclick: function () { tab = t[0]; open = {}; render(); } }); })));
    main.appendChild(tab === 'profile' ? tProfile() : tab === 'exp' ? tExp() : tab === 'awards' ? tAwards() : tab === 'labels' ? tLabels() : tProjects());
  }
  function login() {
    var o = { token: token, user: CFG.user, repo: CFG.repo, branch: CFG.branch };
    var tk = el('input', { type: 'password', value: o.token, placeholder: 'github_pat_...', oninput: function () { o.token = this.value.trim(); } });
    return el('div', { class: 'box' }, [el('h3', { text: '登入' }),
      el('p', { class: 'hint', text: '這個後台用你的 GitHub 存取權杖直接把內容存回儲存庫。權杖只存在這台瀏覽器。' }),
      el('ol', { class: 'steps', html: '<li>GitHub 右上角頭像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</li><li>Repository access 選 <b>Only select repositories</b>，只勾這個網站的儲存庫</li><li>Permissions → Repository permissions → <b>Contents：Read and write</b></li><li>產生後把權杖貼到下方</li>' }),
      el('label', { text: '存取權杖' }), tk, el('div', { class: 'two' }, [text(o, 'user', 'GitHub 帳號'), text(o, 'repo', '儲存庫名稱')]), text(o, 'branch', '分支'),
      el('div', { style: 'margin-top:14px' }, [el('button', { class: 'btn', text: '登入並讀取內容', onclick: function () { token = o.token; CFG = { user: o.user.trim(), repo: o.repo.trim(), branch: o.branch.trim() || 'main' }; load(true); } })])]);
  }
  function load(remember) {
    status('讀取中…');
    api('GET', 'content/site.yml').then(function (r) {
      if (!r) throw new Error('找不到 content/site.yml');
      S = jsyaml.load(b64dec(r.content)) || {};
      if (remember) { try { localStorage.setItem('gh_token', token); localStorage.setItem('gh_cfg', JSON.stringify(CFG)); } catch (e) {} }
      status('已讀取', 'ok'); render();
    }).catch(function (e) { S = null; status('讀取失敗：' + e.message + '（請確認權杖與儲存庫名稱）', 'bad'); render(); });
  }
  document.getElementById('save').onclick = function () { if (busy) return; busy = true; saveAll().then(function () { busy = false; }).catch(function (e) { busy = false; status('儲存失敗：' + e.message, 'bad'); }); };
  document.getElementById('logout').onclick = function () { try { localStorage.removeItem('gh_token'); } catch (e) {} token = ''; S = null; status('已登出'); render(); };
  if (token) load(false); else render();
})();
