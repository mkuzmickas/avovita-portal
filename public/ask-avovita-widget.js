/* Ask AvoVita — chat widget. Talks to portal.avovita.ca/api/insights/chat. */
(function () {
  'use strict';

  var CONFIG = {
    endpoint: 'https://portal.avovita.ca/api/insights/chat',
    catalogueUrl: 'https://portal.avovita.ca/tests',
    testUrl: 'https://portal.avovita.ca/tests?test=',
    side: 'right',
    launcherLabel: 'Ask AvoVita',
    launcherSub: 'Tests, prices, booking',
    teaser: 'Questions about testing? Ask me — prices, what a test measures, how collection works.',
    teaserDelay: 3500,
    title: 'Ask AvoVita',
    subtitle: 'Tests, pricing, and how it all works',
    greeting: 'Ask me anything — what a test measures, what it costs, or how collection and results work.',
    starters: ['Fatigue and low energy', 'Hormone check', 'How does collection work?', 'Do I need a doctor’s note?'],
    disclaimer: 'Collection fee applies on top of test prices. Information only, not medical advice.',
    storageKey: 'avovita_ask_v1',
    maxChars: 600
  };

  if (window.__avovitaAsk) return;
  window.__avovitaAsk = true;
  if (!window.fetch) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    var host = document.createElement('div');
    host.id = 'avovita-ask';
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = template();
    wire(root);
  }

  function template() {
    return '<style>' + styles() + '</style>' +
      '<div class="teaser" hidden>' +
        '<button class="teaser-x" aria-label="Dismiss">&times;</button>' +
        '<p>' + esc(CONFIG.teaser) + '</p>' +
      '</div>' +
      '<button class="launcher" part="launcher" aria-expanded="false" aria-haspopup="dialog">' +
        '<span class="pulse" aria-hidden="true"></span>' +
        '<span class="launcher-txt">' +
          '<span class="launcher-main">' + esc(CONFIG.launcherLabel) + '</span>' +
          '<span class="launcher-sub">' + esc(CONFIG.launcherSub) + '</span>' +
        '</span>' +
      '</button>' +
      '<section class="panel" role="dialog" aria-modal="false" aria-label="' + esc(CONFIG.title) + '" hidden>' +
        '<header class="head">' +
          '<div>' +
            '<p class="eyebrow">' + esc(CONFIG.title) + '</p>' +
            '<p class="sub">' + esc(CONFIG.subtitle) + '</p>' +
          '</div>' +
          '<div class="head-btns">' +
            '<button class="expand" aria-label="Make window wider">' +
              '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
            '<button class="close" aria-label="Close Ask AvoVita">' +
              '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>' +
            '</button>' +
          '</div>' +
        '</header>' +
        '<div class="log" role="log" aria-live="polite" tabindex="0"></div>' +
        '<form class="composer">' +
          '<label class="sr" for="avf-input">Your question</label>' +
          '<textarea id="avf-input" rows="1" maxlength="' + CONFIG.maxChars + '" placeholder="Ask a question…"></textarea>' +
          '<button class="send" type="submit" aria-label="Send">' +
            '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</form>' +
        '<p class="disclaimer">' + esc(CONFIG.disclaimer) + '</p>' +
      '</section>';
  }

  function styles() {
    var edge = CONFIG.side === 'left' ? 'left' : 'right';
    return [
      ':host,*{box-sizing:border-box}',
      '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
      'button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}',
      ':focus-visible{outline:2px solid #B7D167;outline-offset:2px}',
      '.launcher{position:fixed;bottom:24px;' + edge + ':24px;z-index:2147483000;',
      'display:flex;align-items:center;gap:12px;padding:15px 26px;border-radius:999px;',
      'background:linear-gradient(135deg,#025C2B,#01381A);color:#fff;text-align:left;',
      'box-shadow:0 8px 30px rgba(1,56,26,.42);transition:transform .18s ease,box-shadow .18s ease}',
      '.launcher:hover{transform:translateY(-3px);box-shadow:0 14px 38px rgba(1,56,26,.5)}',
      '.launcher[hidden]{display:none}',
      '.launcher-txt{display:flex;flex-direction:column;gap:2px}',
      '.launcher-main{font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:15px;',
      'letter-spacing:.05em;text-transform:uppercase;line-height:1.1}',
      '.launcher-sub{font-family:\'Quicksand\',sans-serif;font-size:11.5px;line-height:1.2;opacity:.82}',
      '.pulse{width:10px;height:10px;flex:none;border-radius:50%;background:#B7D167;animation:p 2.6s infinite}',
      '.teaser{position:fixed;bottom:104px;' + edge + ':24px;z-index:2147483000;width:290px;',
      'max-width:calc(100vw - 48px);padding:15px 17px 15px 16px;border-radius:14px 14px 4px 14px;',
      'background:#fff;border-left:3px solid #B7D167;box-shadow:0 10px 34px rgba(1,56,26,.24);',
      'font-family:\'Quicksand\',sans-serif;animation:in .3s ease}',
      '.teaser[hidden]{display:none}',
      '.teaser p{margin:0;font-size:13.5px;line-height:1.5;color:#1E1E1E;cursor:pointer;padding-right:8px}',
      '.teaser-x{position:absolute;top:5px;right:7px;width:20px;height:20px;border-radius:50%;',
      'font-size:17px;line-height:1;color:#9aa89a}',
      '.teaser-x:hover{color:#1E1E1E;background:#f0f2ee}',
      '@keyframes p{0%{box-shadow:0 0 0 0 rgba(183,209,103,.6)}70%{box-shadow:0 0 0 9px rgba(183,209,103,0)}100%{box-shadow:0 0 0 0 rgba(183,209,103,0)}}',
      '.panel{position:fixed;bottom:22px;' + edge + ':22px;z-index:2147483000;',
      'width:450px;max-width:calc(100vw - 32px);height:min(760px,calc(100vh - 28px));',
      'display:flex;flex-direction:column;overflow:hidden;border-radius:18px;background:#fff;',
      'font-family:\'Quicksand\',sans-serif;color:#1E1E1E;',
      'box-shadow:0 18px 60px rgba(1,56,26,.28);animation:in .2s ease}',
      '@keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
      '.panel[hidden]{display:none}',
      '.panel.wide{width:680px;height:calc(100vh - 28px)}',
      '.head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:17px 18px;',
      'background:linear-gradient(135deg,#025C2B,#01381A);color:#fff}',
      '.eyebrow{margin:0;font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#B7D167}',
      '.sub{margin:5px 0 0;font-size:13.5px;line-height:1.4;opacity:.92}',
      '.head-btns{display:flex;gap:2px;flex:none}',
      '.close,.expand{width:30px;height:30px;flex:none;border-radius:8px;color:#fff;opacity:.75}',
      '.close:hover,.expand:hover{opacity:1;background:rgba(255,255,255,.12)}',
      '.expand svg{width:17px;height:17px;display:block;margin:auto}',
      '.close svg{width:18px;height:18px;display:block;margin:auto}',
      '.log{flex:1;overflow-y:auto;padding:18px;background:#F5F5F5;display:flex;flex-direction:column;gap:13px}',
      '.msg{max-width:88%;font-size:14.5px;line-height:1.55}',
      '.msg.you{align-self:flex-end;background:#1A3A1F;color:#fff;padding:10px 14px;border-radius:14px 14px 4px 14px}',
      '.msg.bot{align-self:flex-start;color:#1E1E1E}',
      '.msg.bot p{margin:0 0 9px}',
      '.msg.bot p:last-child{margin-bottom:0}',
      '.msg.bot strong{font-weight:700}',
      '.msg.bot a{color:#025C2B;font-weight:600}',
      '.msg.bot a.linkbtn{display:block;margin:11px 0 4px;padding:11px 14px;border-radius:8px;',
      'background:#025C2B;color:#fff;text-align:center;text-decoration:none;',
      'font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:11.5px;',
      'letter-spacing:.08em;text-transform:uppercase}',
      '.msg.bot a.linkbtn:hover{background:#1A3A1F}',
      '.slip{display:block;margin:9px 0;padding:12px 14px;background:#fff;border-radius:4px;',
      'border-left:3px solid #B7D167;box-shadow:0 1px 4px rgba(30,30,30,.09);text-decoration:none;color:inherit;',
      'transition:box-shadow .15s ease,transform .15s ease}',
      '.slip:hover{box-shadow:0 4px 14px rgba(1,56,26,.16);transform:translateX(2px)}',
      '.slip-name{display:block;font-family:\'Montserrat\',sans-serif;font-weight:600;font-size:14px;line-height:1.35;color:#1A3A1F}',
      '.slip-meta{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:7px}',
      '.slip-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.09em;color:#6b7a6b}',
      '.slip-price{font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:13px;color:#025C2B;white-space:nowrap}',
      '.slip-fee{display:block;margin-top:3px;font-size:11px;line-height:1.4;color:#6b7a6b;text-align:right}',
      '.slip-desc{display:block;margin-top:8px;font-size:12.5px;line-height:1.5;color:#4a544a}',
      '.slip-lab{display:block;margin-top:6px;font-size:11.5px;line-height:1.4;color:#6b7a6b}',
      '.slip-cta{display:block;margin-top:11px;padding:9px 12px;border-radius:8px;background:#025C2B;color:#fff;',
      'text-align:center;font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase}',
      '.slip:hover .slip-cta{background:#1A3A1F}',
      '.msg.bot p.h{margin:15px 0 2px;font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7a6b}',
      '.msg.bot p.h:first-child{margin-top:0}',
      '.msg.bot ul{margin:0 0 9px;padding-left:18px}',
      '.msg.bot li{margin-bottom:5px}',
      '.msg.bot em{font-style:italic}',
      '.msg.bot table{width:100%;border-collapse:collapse;margin:9px 0 11px;font-size:13px}',
      '.msg.bot th{text-align:left;background:#eef2ea;color:#1A3A1F;font-weight:700;',
      'padding:6px 9px;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase}',
      '.msg.bot td{padding:6px 9px;border-top:1px solid #e6eae3;vertical-align:top}',
      '.msg.bot th.r,.msg.bot td.r{text-align:right;white-space:nowrap}',
      '.starters{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}',
      '.chip{padding:7px 13px;border-radius:999px;border:1px solid #d5ddd2;background:#fff;font-size:13px;color:#1A3A1F}',
      '.chip:hover{border-color:#025C2B}',
      '.dots{display:flex;gap:4px;align-self:flex-start;padding:4px 2px}',
      '.dots i{width:6px;height:6px;border-radius:50%;background:#9aa89a;animation:b 1.3s infinite}',
      '.dots i:nth-child(2){animation-delay:.18s}.dots i:nth-child(3){animation-delay:.36s}',
      '@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}',
      '.note{align-self:stretch;padding:11px 13px;border-radius:4px;background:#fff;border-left:3px solid #c9553d;font-size:13.5px;line-height:1.5}',
      '.note a{color:#025C2B;font-weight:600}',
      '.composer{display:flex;align-items:flex-end;gap:9px;padding:12px 14px 8px;background:#fff;border-top:1px solid #ececec}',
      'textarea{flex:1;resize:none;max-height:110px;padding:10px 12px;border:1px solid #dcdcdc;border-radius:11px;',
      'font-family:inherit;font-size:14.5px;line-height:1.45;color:inherit;background:#fff}',
      'textarea:focus{outline:none;border-color:#025C2B}',
      '.send{width:40px;height:40px;flex:none;border-radius:11px;background:#025C2B;color:#fff}',
      '.send:hover{background:#1A3A1F}',
      '.send[disabled]{opacity:.4;cursor:not-allowed}',
      '.send svg{width:19px;height:19px;display:block;margin:auto}',
      '.disclaimer{margin:0;padding:0 14px 12px;background:#fff;font-size:11px;line-height:1.4;color:#8b948b;text-align:center}',
      '@media (max-width:520px){',
      '.panel{width:auto;left:12px;right:12px;bottom:12px;height:min(88vh,calc(100vh - 24px))}',
      '.launcher{bottom:16px;' + edge + ':16px;padding:13px 20px}',
      '.launcher-sub{display:none}',
      '.teaser{bottom:86px;' + edge + ':16px;left:16px;width:auto}',
      '.expand{display:none}',
      '.panel.wide{width:auto;height:min(88vh,calc(100vh - 24px))}}',
      '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
    ].join('');
  }

  function wire(root) {
    var launcher = root.querySelector('.launcher');
    var panel = root.querySelector('.panel');
    var closeBtn = root.querySelector('.close');
    var log = root.querySelector('.log');
    var form = root.querySelector('.composer');
    var input = root.querySelector('textarea');
    var send = root.querySelector('.send');
    var expand = root.querySelector('.expand');

    var history = load();
    var busy = false;
    var anchor = null;
    var pending = null;

    render();

    var wideKey = CONFIG.storageKey + '_wide';
    var startWide = false;
    try { startWide = sessionStorage.getItem(wideKey) === '1'; } catch (e) {}
    setWide(startWide);

    var teaser = root.querySelector('.teaser');
    var teaserKey = CONFIG.storageKey + '_teased';
    var teased = false;
    try { teased = sessionStorage.getItem(teaserKey) === '1'; } catch (e) {}

    if (!teased && !history.length) {
      setTimeout(function () {
        if (panel.hidden && !launcher.hidden) { teaser.hidden = false; }
      }, CONFIG.teaserDelay);
    }

    function dismissTeaser() {
      teaser.hidden = true;
      try { sessionStorage.setItem(teaserKey, '1'); } catch (e) {}
    }

    teaser.querySelector('p').addEventListener('click', function () { dismissTeaser(); open(); });
    teaser.querySelector('.teaser-x').addEventListener('click', dismissTeaser);

    launcher.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    /* Any link ending #ask anywhere on the site opens the panel. */
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href$="#ask"]');
      if (a) { e.preventDefault(); open(); }
    });
    if (location.hash === '#ask') setTimeout(open, 0);
    window.addEventListener('hashchange', function () {
      if (location.hash === '#ask') open();
    });

    expand.addEventListener('click', function () {
      setWide(!panel.classList.contains('wide'));
      position();
    });

    function setWide(on) {
      panel.classList.toggle('wide', !!on);
      expand.setAttribute('aria-label', on ? 'Make window narrower' : 'Make window wider');
      try { sessionStorage.setItem(wideKey, on ? '1' : '0'); } catch (e) {}
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close();
    });

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input.value);
    });

    log.addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.chip');
      if (chip) ask(chip.textContent);
    });

    function open() {
      dismissTeaser();
      panel.hidden = false;
      launcher.hidden = true;
      launcher.setAttribute('aria-expanded', 'true');
      input.focus();
      position();
    }

    function close() {
      panel.hidden = true;
      launcher.hidden = false;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    }

    function ask(text) {
      text = (text || '').trim();
      if (!text || busy) return;
      input.value = '';
      input.style.height = 'auto';
      history.push({ role: 'user', content: text });
      save(history);
      render();
      request();
    }

    function request() {
      busy = true;
      send.disabled = true;
      var typing = document.createElement('div');
      typing.className = 'dots';
      typing.innerHTML = '<i></i><i></i><i></i>';
      log.appendChild(typing);
      log.scrollTop = log.scrollHeight;
      anchor = null;

      fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, retry: res.headers.get('Retry-After'), data: data };
        });
      }).then(function (r) {
        if (r.status === 429) {
          pending = problem('rate', r.retry);
        } else if (r.status >= 400 || !r.data || !r.data.content) {
          pending = problem('down');
        } else {
          history.push({ role: 'assistant', content: r.data.content });
          save(history);
        }
      }).catch(function () {
        pending = problem('down');
      }).then(function () {
        busy = false;
        send.disabled = false;
        render();
        input.focus();
      });
    }

    function problem(kind, retry) {
      if (kind === 'rate') {
        var mins = retry ? Math.max(1, Math.ceil(parseInt(retry, 10) / 60)) : null;
        return 'You’ve reached the question limit for now' +
          (mins ? '. Try again in about ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.' : '.') +
          ' In the meantime you can <a href="' + CONFIG.catalogueUrl + '" target="_blank" rel="noopener">browse the full catalogue</a>.';
      }
      return 'Ask AvoVita isn’t responding right now. ' +
        '<a href="' + CONFIG.catalogueUrl + '" target="_blank" rel="noopener">Browse the full catalogue</a> ' +
        'or try again in a moment.';
    }

    function render() {
      log.innerHTML = '';

      if (!history.length) {
        var hi = document.createElement('div');
        hi.className = 'msg bot';
        hi.innerHTML = '<p>' + esc(CONFIG.greeting) + '</p><div class="starters">' +
          CONFIG.starters.map(function (s) {
            return '<button type="button" class="chip">' + esc(s) + '</button>';
          }).join('') + '</div>';
        log.appendChild(hi);
      }

      var lastBot = null;
      history.forEach(function (m) {
        var el = document.createElement('div');
        if (m.role === 'user') {
          el.className = 'msg you';
          el.textContent = m.content;
        } else {
          el.className = 'msg bot';
          el.innerHTML = format(m.content);
          lastBot = el;
        }
        log.appendChild(el);
      });

      var showNote = false;
      if (pending) {
        var n = document.createElement('div');
        n.className = 'note';
        n.innerHTML = pending;
        log.appendChild(n);
        pending = null;
        showNote = true;
      }

      anchor = showNote ? null : lastBot;
      position();
    }

    function position() {
      if (!anchor || log.clientHeight === 0) {
        log.scrollTop = log.scrollHeight;
        return;
      }
      var offset = anchor.getBoundingClientRect().top -
                   log.getBoundingClientRect().top + log.scrollTop;
      log.scrollTop = Math.max(0, offset - 10);
    }
  }

  /* The model replies in markdown. Turn any line carrying a test code into a
     card, fold a following italic description / Turnaround / Collection line
     into it, render pipe tables, and handle the rest of the markdown. */

  function format(text) {
    var lines = String(text).split(/\r?\n/);
    var out = [], list = [];

    function flush() {
      if (list.length) { out.push('<ul>' + list.join('') + '</ul>'); list = []; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (/^\s*([-*_]\s*){3,}$/.test(line)) { flush(); continue; }
      if (!line.trim()) { flush(); continue; }

      var head = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (head) { flush(); out.push('<p class="h">' + inline(esc(head[1])) + '</p>'); continue; }

      var slip = asSlip(line);
      if (slip) {
        flush();
        var desc = '', taken = 0, j = i + 1;
        while (j < lines.length && taken < 4) {
          var nxt = lines[j];
          if (!nxt.trim()) { j++; continue; }
          var it = nxt.match(/^\s*\*([^*].*?)\*\s*$/);
          var tn = nxt.match(/^\s*\*{0,2}Turnaround\*{0,2}:\s*(.+?)\s*$/i);
          var cl = nxt.match(/^\s*\*{0,2}Collection\*{0,2}:\s*(.+?)\s*$/i);
          if (it && !desc) { desc = it[1]; i = j; j++; taken++; continue; }
          if (tn && !slip.turn) { slip.turn = tn[1].replace(/\*\*/g, ''); i = j; j++; taken++; continue; }
          if (cl && !slip.coll) { slip.coll = cl[1].replace(/\*\*/g, ''); i = j; j++; taken++; continue; }
          break;
        }
        out.push(renderSlip(slip, desc));
        continue;
      }

      if (isRow(line)) {
        flush();
        var rows = [], k = i;
        while (k < lines.length && isRow(lines[k])) { rows.push(lines[k]); k++; }
        i = k - 1;
        out.push(renderTable(rows));
        continue;
      }

      var bul = line.match(/^\s*[-*•]\s+(.*)$/);
      if (bul) { list.push('<li>' + inline(esc(bul[1])) + '</li>'); continue; }

      flush();
      out.push('<p>' + inline(esc(line)) + '</p>');
    }

    flush();
    return out.join('');
  }

  /* Markdown pipe tables — the model uses them for cost breakdowns. */

  function isRow(l) { return /^\s*\|.*\|\s*$/.test(l); }
  function isSep(l) { return /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.indexOf('-') > -1; }
  function cells(l) {
    return l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
  }

  function renderTable(rows) {
    var hasHead = rows.length > 1 && isSep(rows[1]);
    var body = rows.filter(function (r) { return !isSep(r); });
    if (!body.length) return '';
    var html = '<table>';
    body.forEach(function (r, idx) {
      var tag = (hasHead && idx === 0) ? 'th' : 'td';
      html += '<tr>' + cells(r).map(function (c, ci) {
        return '<' + tag + (ci > 0 ? ' class="r"' : '') + '>' + inline(esc(c)) + '</' + tag + '>';
      }).join('') + '</tr>';
    });
    return html + '</table>';
  }

  function asSlip(line) {
    var m = line.match(/Code:\s*\**([A-Za-z0-9][A-Za-z0-9_+\-]*)/i);
    if (!m) return null;

    var price = (line.match(/\$\s?[\d,]+(?:\.\d{2})?/) || [''])[0];
    var lab = (line.match(/Lab:\s*([^|\n]+?)\s*(?:\||$)/i) || [, ''])[1];
    var turn = (line.match(/Turnaround:\s*([^|\n]+?)\s*(?:\||$)/i) || [, ''])[1];
    var coll = (line.match(/Collection:\s*([^|\n]+?)\s*(?:\||$)/i) || [, ''])[1];
    if (!price && !lab) return null;

    var name = line.slice(0, m.index)
      .replace(/^\s*[-•*]\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/[|—–-]\s*$/, '')
      .trim()
      .replace(/[|—–-]\s*$/, '')
      .trim();
    if (!name || name.length > 140) return null;

    return { name: name, sku: m[1], price: price, lab: lab, turn: turn, coll: coll };
  }

  function renderSlip(s, desc) {
    var foot = [s.lab, s.turn].filter(Boolean).join(' · ');
    return '<a class="slip" href="' + CONFIG.testUrl + encodeURIComponent(s.sku) +
      '" target="_blank" rel="noopener">' +
      '<span class="slip-name">' + esc(s.name) + '</span>' +
      '<span class="slip-meta"><span class="slip-code">' + esc(s.sku) + '</span>' +
      (s.price ? '<span class="slip-price">' + esc(s.price) + '</span>' : '') + '</span>' +
      (s.coll ? '<span class="slip-fee">' + esc(/^\$/.test(s.coll) ? '+ ' + s.coll : s.coll) + '</span>' : '') +
      (desc ? '<span class="slip-desc">' + esc(desc) + '</span>' : '') +
      (foot ? '<span class="slip-lab">' + esc(foot) + '</span>' : '') +
      '<span class="slip-cta">Book this test →</span></a>';
  }

  function inline(safe) {
    return safe
      .replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g, function (m, txt, url) {
        if (!/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(url)) return m;
        var btn = /\/contact|#ask/i.test(url);
        var ext = /^https?:\/\//i.test(url) && url.indexOf('avovita.ca') === -1;
        return '<a href="' + url + '"' + (btn ? ' class="linkbtn"' : '') +
          (ext ? ' target="_blank" rel="noopener"' : '') + '>' + txt + '</a>';
      })
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\bCode:\s*([A-Z0-9][A-Z0-9_+\-]*)/g, function (m, code) {
        return 'Code: <a href="' + CONFIG.testUrl + encodeURIComponent(code) +
          '" target="_blank" rel="noopener">' + code + '</a>';
      });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    try {
      var raw = sessionStorage.getItem(CONFIG.storageKey);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function save(h) {
    try { sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(h)); } catch (e) {}
  }
})();
