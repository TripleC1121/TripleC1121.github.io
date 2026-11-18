/* Personal site — no build step. All content lives in content/site.yml.
   Edit content through admin.html (管理後台); you normally never need to edit this file. */
(function () {
  var S = null, gotPreview = false;
  var PREVIEW = /[?&]preview=1/.test(location.search);
  var qlang = (location.search.match(/[?&]lang=(zh|en)\b/) || [])[1];
  var lang = qlang || 'en';
  if (!qlang) { try { lang = localStorage.getItem('lang') || 'en'; } catch (e) {} }
  var app = document.getElementById('app');
  var UI = { zh: {}, en: {} };
  (window.SITE_LABELS || []).forEach(function (x) { UI.zh[x.k] = x.zh; UI.en[x.k] = x.en; });
  function t(k) { var o = S && S.labels && S.labels[k], v = o && o[lang]; return v || UI[lang][k] || ''; }
  function L(v) { if (v == null) return ''; if (typeof v === 'object' && !Array.isArray(v)) return v[lang] != null && v[lang] !== '' ? v[lang] : (v.zh || v.en || ''); return v; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function arr(a) { a = L(a); return Array.isArray(a) ? a : (a ? [a] : []); }
  function list(a, cls) { a = arr(a); return a.length ? '<ul' + (cls ? ' class="' + cls + '"' : '') + '>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function get(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.text(); }); }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  // In preview mode, files are read straight from GitHub so new uploads show before the site finishes deploying.
  function asset(p) {
    if (!p) return '';
    if (/^https?:\/\//.test(p)) return p;
    var g = PREVIEW && S && S.site && S.site.github, enc = p.split('/').map(encodeURIComponent).join('/');
    return g && g.user ? 'https://raw.githubusercontent.com/' + g.user + '/' + g.repo + '/' + (g.branch || 'main') + '/' + enc : enc;
  }
  function num(v, d, lo, hi) { v = parseFloat(v); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); }
  function coverCss(p, inHero) {
    if (p.cover && !(inHero && p.cover_hero === false)) {
      var contain = p.cover_fit === 'contain';
      return 'background-image:url(&quot;' + esc(asset(p.cover)) + '&quot;);background-size:' + (contain ? 'contain' : 'cover') +
        ';background-position:' + num(p.cover_x, 50, 0, 100) + '% ' + num(p.cover_y, 50, 0, 100) + '%;background-repeat:no-repeat;background-color:#0b1b33';
    }
    var h = 190 + hue(p.slug || '') % 70;
    return 'background:linear-gradient(135deg,hsl(' + h + ' 60% 18%),hsl(' + (h - 25) + ' 62% 36%))';
  }
  function tags(p) { return '<div class="tags">' + (p.tags || []).map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('') + '</div>'; }
  function links(cls) {
    return ((S.profile.links) || []).filter(function (l) { return l.url; }).map(function (l) {
      return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
    });
  }
  function chrome() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.getElementById('brand').innerHTML = '<i></i>' + esc(L(S.profile.name));
    var route = location.hash.replace(/^#\//, '').split('/')[0];
    document.getElementById('nav').innerHTML = [['experience', 'exp'], ['projects', 'proj'], ['awards', 'awards'], ['cv', 'cv']].map(function (i) {
      return '<a href="#/' + i[0] + '"' + (route === i[0] ? ' class="on"' : '') + '>' + t(i[1]) + '</a>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.langsw button'), function (b) { b.className = b.getAttribute('data-lang') === lang ? 'on' : ''; });
    var d = document.getElementById('draft');
    if (PREVIEW) { d.hidden = false; d.className = 'draft preview no-print'; d.textContent = '預覽模式 Preview：顯示後台目前（含尚未儲存）的內容 · showing unsaved changes from the editor'; }
    else { d.hidden = !(S.site && S.site.draft_banner); d.textContent = t('draft'); }
    document.getElementById('foot').innerHTML = '© ' + new Date().getFullYear() + ' ' + esc(L(S.profile.name)) + (links().length ? ' · ' + links().join(' · ') : '');
  }
  function card(p, i) {
    return '<a class="card" href="#/projects/' + esc(p.slug) + '"><div class="cover' + (p.cover ? '' : ' gen') + '" style="' + coverCss(p) + '">' +
      (p.cover ? '' : '<span class="num">' + ('0' + (i + 1)).slice(-2) + '</span>') + (L(p.role) ? '<span class="chip">' + esc(L(p.role)) + '</span>' : '') + '</div>' +
      '<div class="body"><div class="when">' + esc(p.period || '') + '</div><h3>' + esc(L(p.title)) + '</h3><p>' + esc(L(p.summary)) + '</p>' + tags(p) + '<span class="go">' + t('view') + '</span></div></a>';
  }
  function tl(items) {
    return '<ul class="tl">' + (items || []).map(function (e) {
      return '<li><div class="row"><div><h3>' + esc(L(e.org)) + '</h3><div class="role">' + esc(L(e.role)) + '</div></div><div class="when">' + esc(e.period || '') + (L(e.place) ? ' · ' + esc(L(e.place)) : '') + '</div></div>' + list(e.points) + '</li>';
    }).join('') + '</ul>';
  }
  function head(k, title, right) { return '<div class="sec-head"><div>' + (k ? '<span class="k">' + k + '</span>' : '') + '<h2>' + title + '</h2></div>' + (right || '') + '</div>'; }
  function cta() {
    var p = S.profile;
    return '<div class="cta no-print"><div class="wrap"><h2>' + t('ctaT') + '</h2><p>' + t('ctaP') + '</p><div class="actions"><a class="btn" href="#/cv">' + t('cv') + '</a>' +
      (p.email ? '<a class="btn line" href="mailto:' + esc(p.email) + '">' + t('mail') + '</a>' : '') + links('btn line').join('') + '</div></div></div>';
  }
  function home() {
    var p = S.profile, feat = (S.projects || []).filter(function (x) { return x.featured; });
    var initials = (L(p.name).match(/[A-Z]/g) || ['G']).slice(0, 2).join('');
    app.innerHTML = '<section class="hero"><div class="wrap"><div><span class="eyebrow">' + esc(L(p.location)) + '</span><h1>' + esc(L(p.name)) + '</h1>' +
      '<p class="role">' + esc(L(p.headline)) + '</p><p class="sum">' + esc(L(p.summary)) + '</p></div>' +
      (p.photo ? '<img class="portrait" src="' + esc(asset(p.photo)) + '" alt="">' : '<div class="portrait ph">' + esc(initials) + '</div>') + '</div></section>' +
      '<div class="wrap">' +
      '<section class="block">' + head(t('sel'), t('featured'), '<a href="#/projects">' + t('more') + ' →</a>') + '<div class="grid feat">' + feat.map(card).join('') + '</div></section>' +
      '<section class="block">' + head(t('career'), t('work'), '<a href="#/experience">' + t('exp') + ' →</a>') + tl((S.experience || []).slice(0, 3)) + '</section></div>' + cta();
  }
  function experience() {
    app.innerHTML = '<div class="page-head"><div class="wrap"><h1>' + t('exp') + '</h1><p>' + t('expSub') + '</p></div></div><div class="wrap pad">' +
      '<div class="cols2"><div>' + head(t('kEdu'), t('edu')) + tl(S.education) + '</div><div>' + head(t('career'), t('work')) + tl(S.experience) + '</div></div>' +
      '<section class="block">' + head(t('kSkills'), t('skills')) + '<div class="skillrow">' + (S.skills || []).map(function (s) {
        return '<div class="skillcard"><b>' + esc(L(s.group)) + '</b><div class="tags">' + String(L(s.items)).split(/[,、，]\s*/).filter(Boolean).map(function (x) { return '<span class="tag">' + esc(x.trim()) + '</span>'; }).join('') + '</div></div>';
      }).join('') + '</div></section><div class="end"></div></div>' + cta();
  }
  function awards() {
    var aw = S.awards || [], pubs = arr(S.publications);
    app.innerHTML = '<div class="page-head"><div class="wrap"><h1>' + t('awards') + '</h1><p>' + t('awardsSub') + '</p></div></div><div class="wrap pad"><div class="cols2">' +
      '<div>' + head(t('kHonors'), t('awardsOnly') + ' <span class="count">' + aw.length + '</span>') + '<div class="awards">' + aw.map(function (a) {
        return '<div class="award"><div class="yr">' + esc(a.date || '') + '</div><div><h3>' + esc(L(a.title)) + '</h3>' + (L(a.org) ? '<div class="org">' + esc(L(a.org)) + '</div>' : '') + (L(a.note) ? '<p>' + esc(L(a.note)) + '</p>' : '') + '</div></div>';
      }).join('') + '</div></div>' +
      '<div>' + head(t('kResearch'), t('pubsOnly') + ' <span class="count">' + pubs.length + '</span>') + '<div class="pubs2">' + pubs.map(function (x, i) {
        return '<div class="pub"><span class="n">' + ('0' + (i + 1)).slice(-2) + '</span><div>' + esc(x) + '</div></div>';
      }).join('') + '</div></div></div><div class="end"></div></div>' + cta();
  }
  var filter = '';
  function projects() {
    var all = S.projects || [], tg = [];
    all.forEach(function (p) { (p.tags || []).forEach(function (x) { if (tg.indexOf(x) < 0) tg.push(x); }); });
    var shown = all.filter(function (p) { return !filter || (p.tags || []).indexOf(filter) >= 0; });
    app.innerHTML = '<div class="page-head"><div class="wrap"><h1>' + t('proj') + '</h1><p>' + t('projSub') + '</p></div></div><div class="wrap pad"><div class="filters"><button data-tag=""' + (filter ? '' : ' class="on"') + '>' + t('all') + '</button>' +
      tg.map(function (x) { return '<button data-tag="' + esc(x) + '"' + (filter === x ? ' class="on"' : '') + '>' + esc(x) + '</button>'; }).join('') +
      '</div><div class="grid">' + shown.map(function (p) { return card(p, all.indexOf(p)); }).join('') + '</div><div class="end"></div></div>';
    Array.prototype.forEach.call(app.querySelectorAll('.filters button'), function (b) { b.onclick = function () { filter = b.getAttribute('data-tag'); projects(); }; });
  }
  function embedUrl(u) {
    var m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? 'https://www.youtube-nocookie.com/embed/' + m[1] : '';
  }
  function boxStyle(b) {
    var w = num(b.width, 100, 10, 100), al = b.align || 'center';
    return 'width:' + w + '%;margin-left:' + (al === 'left' ? '0' : 'auto') + ';margin-right:' + (al === 'right' ? '0' : 'auto');
  }
  function blocksHtml(p) {
    var dir = 'assets/projects/' + p.slug + '/';
    function u(f) { return esc(asset(dir + f)); }
    function cap(b) { var c = L(b.caption); return c ? '<figcaption>' + esc(c) + '</figcaption>' : ''; }
    return (p.blocks || []).map(function (b) {
      var v = L(b);
      if (b.t === 'h') return v ? '<h2>' + esc(v) + '</h2>' : '';
      if (b.t === 'p') return v ? marked.parse(v) : '';
      if (b.t === 'callout') return v ? '<blockquote>' + marked.parse(v) + '</blockquote>' : '';
      if (b.t === 'divider') return '<hr>';
      if (b.t === 'image') {
        var fs = b.files || []; if (!fs.length) return '';
        var ratio = b.ratio && b.ratio !== 'auto' ? b.ratio : '';
        var imgs = fs.map(function (f) {
          var img = '<img src="' + u(f) + '" alt="' + esc(L(b.caption) || f) + '" loading="lazy" decoding="async" data-zoom="' + u(f) + '"' +
            (ratio ? ' style="aspect-ratio:' + esc(ratio) + '"' : ' onload="if(this.naturalHeight)this.parentNode.style.flex=(this.naturalWidth/this.naturalHeight)+\' 1 0\'"') + '>';
          return ratio ? img : '<div class="cell">' + img + '</div>';
        }).join('');
        return '<figure class="' + (ratio ? 'crop c' + Math.min(fs.length, 3) : 'pics') + '" style="' + boxStyle(b) + '"><div class="row">' + imgs + '</div>' + cap(b) + '</figure>';
      }
      if (b.t === 'video') {
        var yt = embedUrl(b.url), inner = yt ? '<div class="embed"><iframe src="' + yt + '" allowfullscreen loading="lazy"></iframe></div>' : (b.file ? '<video src="' + u(b.file) + '" controls preload="metadata" playsinline></video>' : '');
        return inner ? '<figure class="vid" style="' + boxStyle(b) + '">' + inner + cap(b) + '</figure>' : '';
      }
      if (b.t === 'file') return b.file ? '<a class="filelink" href="' + u(b.file) + '" target="_blank" rel="noopener"><span>' + esc(L(b.label) || b.file) + '</span><em>' + esc((b.file.split('.').pop() || '').toUpperCase()) + '</em></a>' : '';
      return '';
    }).join('');
  }
  function project(slug) {
    var all = S.projects || [], p = all.filter(function (x) { return x.slug === slug; })[0];
    if (!p) { app.innerHTML = '<div class="wrap pad"><p>' + t('none') + '</p></div>'; return; }
    var facts = [p.period, L(p.role)].filter(Boolean).map(function (x) { return '<span class="f">' + esc(x) + '</span>'; }).join('');
    app.innerHTML = '<div class="phero' + (p.cover && p.cover_hero !== false ? '' : ' plain') + '" style="' + coverCss(p, true) + '"><div class="wrap narrow"><a class="back" href="#/projects">' + t('back') + '</a><h1>' + esc(L(p.title)) + '</h1>' +
      '<div class="meta">' + esc(L(p.summary)) + '</div><div class="facts">' + facts + tags(p) + '</div></div></div>' +
      '<div class="wrap narrow pad"><article class="md">' + (blocksHtml(p) || '<p>' + esc(L(p.summary)) + '</p>') + '</article><div class="end"></div></div>';
  }
  function cv() {
    var p = S.profile, pdf = L(p.cv_pdf);
    function e(x, sub) { return '<div class="e"><div class="row"><div><b>' + esc(L(x.org || x.title)) + '</b>' + (L(x.role) ? ', ' + esc(L(x.role)) : '') + '</div><div>' + esc(x.period || '') + '</div></div>' + list(sub || x.points) + '</div>'; }
    var contact = [L(p.location), p.email].concat((p.links || []).filter(function (l) { return l.url; }).map(function (l) { return l.url.replace(/^https?:\/\/(www\.)?/, ''); })).filter(Boolean).map(esc).join(' | ');
    app.innerHTML = '<div class="wrap pad"><div class="cvbar no-print"><button class="btn" id="print" type="button">' + t('print') + '</button>' +
      (pdf ? '<a class="btn soft" href="' + esc(asset(pdf)) + '" target="_blank">' + t('dl') + '</a>' : '') + '<span style="color:#6b7887;font-size:14px">' + t('cvnote') + '</span></div>' +
      '<article class="cv"><h1>' + esc(L(p.name)) + '</h1><div class="contact">' + esc(L(p.headline)) + '<br>' + contact + '</div>' +
      '<h2>' + t('summary') + '</h2><div>' + esc(L(p.summary)) + '</div><h2>' + t('edu') + '</h2>' + (S.education || []).map(function (x) { return e(x); }).join('') +
      '<h2>' + t('work') + '</h2>' + (S.experience || []).map(function (x) { return e(x); }).join('') +
      '<h2>' + t('proj') + '</h2>' + (S.projects || []).filter(function (x) { return x.in_cv !== false; }).map(function (x) { return e(x, x.cv_points); }).join('') +
      '<h2>' + t('pubs') + '</h2>' + '<ul>' + (S.awards || []).map(function (a) { return '<li>' + esc(L(a.title)) + (L(a.org) ? ', ' + esc(L(a.org)) : '') + (a.date ? ' (' + esc(a.date) + ')' : '') + '</li>'; }).join('') + arr(S.publications).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><h2>' + t('skills') + '</h2>' + (S.skills || []).map(function (s) { return '<div><b>' + esc(L(s.group)) + ':</b> ' + esc(L(s.items)) + '</div>'; }).join('') + '</article><div class="end no-print"></div></div>';
    document.getElementById('print').onclick = function () { window.print(); };
  }
  function render(keepScroll) {
    if (!S) return;
    var parts = location.hash.replace(/^#\//, '').split('/'), y = window.scrollY;
    chrome();
    if (!parts[0]) home(); else if (parts[0] === 'experience') experience(); else if (parts[0] === 'projects' && parts[1]) project(decodeURIComponent(parts[1]));
    else if (parts[0] === 'projects') projects(); else if (parts[0] === 'awards') awards(); else if (parts[0] === 'cv') cv(); else app.innerHTML = '<div class="wrap pad"><p>' + t('none') + '</p></div>';
    window.scrollTo(0, keepScroll ? y : 0);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.langsw button'), function (b) {
    b.onclick = function () { lang = b.getAttribute('data-lang'); try { localStorage.setItem('lang', lang); } catch (e) {} render(true); };
  });
  document.addEventListener('click', function (ev) {
    var z = ev.target.getAttribute && ev.target.getAttribute('data-zoom');
    if (z) { var d = document.createElement('div'); d.className = 'lightbox'; d.innerHTML = '<img src="' + z + '" alt="">'; d.onclick = function () { d.remove(); }; document.body.appendChild(d); }
  });
  window.addEventListener('hashchange', function () { render(false); });
  if (PREVIEW) {
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'preview') return;
      gotPreview = true; S = e.data.S;
      if (e.data.route && e.data.route !== location.hash) { location.hash = e.data.route; return; }
      render(true);
    });
    if (window.opener) try { window.opener.postMessage({ type: 'preview-ready' }, location.origin); } catch (e) {}
  }
  get('content/site.yml').then(function (txt) { if (!gotPreview) { S = jsyaml.load(txt); render(false); } })
    .catch(function (err) { if (!gotPreview) app.innerHTML = '<div class="wrap pad"><p>content/site.yml 讀取或格式錯誤：' + esc(err.message) + '</p></div>'; });
})();
