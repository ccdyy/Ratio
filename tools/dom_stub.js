'use strict';

/**
 * 极简 DOM 桩 — 供 jsc 端到端运行 js/app.js 使用（tools/app.test.js）。
 * 仅实现 app.js 用到的 API 子集。
 */

function makeEl(tag, attrs) {
  var e = {
    tagName: tag,
    attrs: attrs || {},
    children: [],
    parentNode: null,
    hidden: false,
    className: '',
    textContent: '',
    checked: false,
    _value: (attrs && attrs.value !== undefined) ? String(attrs.value) : '',
    _innerHTML: '',
    _listeners: {},
    _classes: {},

    get value() { return this._value; },
    set value(v) { this._value = String(v); },

    get innerHTML() { return this._innerHTML; },
    set innerHTML(html) {
      this._innerHTML = html;
      this.children = parseHTML(html, this);
    },

    classList: {
      toggle: function (cls, force) {
        var on = (force !== undefined) ? !!force : !e.classList.contains(cls);
        if (on) e._classes[cls] = true; else delete e._classes[cls];
        var names = Object.keys(e._classes);
        e.className = names.join(' ');
        return on;
      },
      contains: function (cls) {
        return e._classes[cls] === true ||
          (' ' + e.className + ' ').indexOf(' ' + cls + ' ') >= 0;
      },
      add: function (cls) { e.classList.toggle(cls, true); },
      remove: function (cls) { e.classList.toggle(cls, false); }
    },

    appendChild: function (c) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    removeChild: function (c) {
      var i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    addEventListener: function (type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    dispatch: function (type, target) {
      var self = this;
      var ev = { type: type, target: target || self };
      (self._listeners[type] || []).forEach(function (fn) { fn(ev); });
      if (self.parentNode) self.parentNode.dispatch(type, target || self);
    },
    getAttribute: function (n) { return this.attrs[n] !== undefined ? this.attrs[n] : null; },
    setAttribute: function (n, v) { this.attrs[n] = v; },
    closest: function (sel) {
      var node = this;
      while (node) {
        if (matchSelector(node, sel)) return node;
        node = node.parentNode;
      }
      return null;
    },
    querySelector: function (sel) {
      if (matchSelector(this, sel)) return this;
      for (var i = 0; i < this.children.length; i++) {
        var r = this.children[i].querySelector(sel);
        if (r) return r;
      }
      return null;
    },
    querySelectorAll: function (sel) {
      var out = [];
      if (matchSelector(this, sel)) out.push(this);
      for (var i = 0; i < this.children.length; i++) {
        out = out.concat(this.children[i].querySelectorAll(sel));
      }
      return out;
    }
  };
  if (e.attrs.name !== undefined) e.name = e.attrs.name; // e.target.name 兼容
  return e;
}

function hasClass(el, cls) {
  return el._classes[cls] === true ||
    (' ' + el.className + ' ').indexOf(' ' + cls + ' ') >= 0;
}

/** 简易选择器匹配：支持 .cls、tag、[attr]、tag[attr="v"]、:checked、逗号分隔 */
function matchSelector(el, sel) {
  var parts = sel.split(',');
  for (var p = 0; p < parts.length; p++) {
    if (matchSingle(el, parts[p].trim())) return true;
  }
  return false;
}

function matchSingle(el, sel) {
  var checked = false;
  if (sel.indexOf(':checked') >= 0) { checked = true; sel = sel.replace(':checked', ''); }
  var attrM = sel.match(/^([a-z]+)?\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/);
  var clsM = sel.match(/^\.([a-zA-Z0-9_-]+)$/);
  var tagM = sel.match(/^[a-z]+$/);

  if (checked && !el.checked) return false;

  if (clsM) return hasClass(el, clsM[1]);
  if (tagM) return el.tagName === sel;
  if (attrM) {
    if (attrM[1] && el.tagName !== attrM[1]) return false;
    var v = el.attrs[attrM[2]];
    if (attrM[3] !== undefined) return v === attrM[3];
    return v !== undefined && v !== null;
  }
  return false;
}

/** 极简 HTML 片段解析：支持 select/option/span/input/button/div/td/tr/th + class/value/type/step/min/max/placeholder/title/hidden */
function parseHTML(html, parent) {
  var children = [];
  var re = /<([a-zA-Z]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/?)>([\s\S]*?)<\/\1>|<([a-zA-Z]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>/g;
  var lastIndex = 0;
  var m;
  while ((m = re.exec(html)) !== null) {
    lastIndex = m.index + m[0].length;
    if (m[1]) {
      // 成对标签
      var e = makeEl(m[1], parseAttrs(m[2]));
      e.parentNode = parent;
      if (e.attrs.hidden !== undefined) e.hidden = true; // hidden 属性同步
      if (e.attrs['class'] !== undefined) {
        e.className = e.attrs['class'];
        e.attrs['class'].split(/\s+/).forEach(function (c) { e._classes[c] = true; });
      }
      if (m[1] === 'option') { e.textContent = m[4]; e._value = m[4]; }
      else {
        // 提取纯文本（去标签）
        e.textContent = m[4].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      }
      // 嵌套解析（如 select > option）
      var inner = m[4];
      if (inner.trim()) {
        e.children = parseHTML(inner, e);
      }
      children.push(e);
    } else if (m[5]) {
      // 自闭合标签
      var v = makeEl(m[5], parseAttrs(m[6]));
      v.parentNode = parent;
      if (v.attrs.hidden !== undefined) v.hidden = true;
      if (v.attrs['class'] !== undefined) {
        v.className = v.attrs['class'];
        v.attrs['class'].split(/\s+/).forEach(function (c) { v._classes[c] = true; });
      }
      children.push(v);
    }
  }
  return children;
}

function parseAttrs(str) {
  var attrs = {};
  var re = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
  var m;
  while ((m = re.exec(str)) !== null) attrs[m[1]] = m[2] !== undefined ? m[2] : '';
  return attrs;
}

var document = {
  readyState: 'complete',
  _byId: {},
  _all: [],
  getElementById: function (id) {
    if (!this._byId[id]) {
      this._byId[id] = makeEl('div', { id: id });
      this._all.push(this._byId[id]);
    }
    return this._byId[id];
  },
  createElement: function (tag) {
    var e = makeEl(tag);
    this._all.push(e);
    return e;
  },
  createDocumentFragment: function () {
    var e = makeEl('fragment');
    this._all.push(e);
    return e;
  },
  querySelector: function (sel) {
    for (var i = 0; i < this._all.length; i++) {
      if (matchSelector(this._all[i], sel)) return this._all[i];
    }
    return null;
  },
  querySelectorAll: function (sel) {
    var out = [];
    for (var i = 0; i < this._all.length; i++) {
      if (matchSelector(this._all[i], sel)) out.push(this._all[i]);
    }
    return out;
  },
  addEventListener: function () {}
};

/** 测试辅助：统计子树中的 tr 数量 */
function countRows(root) {
  var n = (root.tagName === 'tr') ? 1 : 0;
  for (var i = 0; i < root.children.length; i++) n += countRows(root.children[i]);
  return n;
}

/** 测试辅助：递归查找第一个匹配元素 */
function find(root, sel) {
  if (matchSelector(root, sel)) return root;
  for (var i = 0; i < root.children.length; i++) {
    var r = find(root.children[i], sel);
    if (r) return r;
  }
  return null;
}

globalThis.__dom = { makeEl: makeEl, countRows: countRows, find: find, matchSelector: matchSelector };
