'use strict';
// Reuse the established pen regression's DOM, clock and Obsidian doubles.
const fs = require('node:fs'),
  path = require('node:path');
exports.setup = (pdfFactory) => {
  let code = fs
    .readFileSync(path.join(__dirname, 'stroke-start.cjs'), 'utf8')
    .split(/view\.down\(pointer\(120,\s*0\)\);/)[0];
  code = code.replace(
    'globalThis.__test={Ink,InkView,Brushes};',
    'globalThis.__test={Ink,InkView,Brushes,SmartInkPlugin,Notebook,ShapeKit,VectorOps,Visible,Workflow,Refinement,DigitAssist,I18n,SMART_INK_WORKER_SOURCE};'
  );
  code = code.replace(
    'vm.runInNewContext(code, sandbox',
    'obsidian.loadPdfJs=pdfFactory;vm.runInNewContext(code, sandbox'
  );
  return new Function(
    'require',
    '__dirname',
    'pdfFactory',
    code +
      `
 view.app=plugin.app;
 Node.prototype.click=function(){for(const fn of this.handlers.click||[])fn({target:this});};
 Node.prototype.dispatchEvent=function(e){for(const fn of this.handlers[e.type]||[])fn(e);};
 Node.prototype.toDataURL=()=> 'data:image/png;base64,iVBORw0KGgo=';
 win.Event=class{constructor(type){this.type=type;}};
 return {...sandbox.__test,view,plugin,pointer,backups,idle,document,advance:ms=>now+=ms,
 dispose:()=>{view.disposed=true;if(view.auxTimer)clearTimeout(view.auxTimer);view.stopHold();clearTimeout(view.historyFlashTimer);clearTimeout(view.trimHoverTimer);view.dismissDigitOffer?.();view.cancelGeometry?.();view.cancelGeometry?.('hoverGeometryJob');}};
 `
  )(require, __dirname, pdfFactory);
};
exports.walk = (root) => [root, ...Array.from(root.children || []).flatMap(exports.walk)];
