// Exercise the real WindowManager methods without a running desktop.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const source = new TextDecoder().decode(Gio.File.new_for_path('lib/extension/window.js').load_contents(null)[1])
  .replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
const types = {NORMAL: 0, DIALOG: 1, MODAL_DIALOG: 2, NOTIFICATION: 3};
const stop = new Error('Reached normal window tracking');
const WindowManager = Function('GObject', 'Utils', 'Meta', 'LAYOUT_TYPES', 'Logger', 'global', source + '\nreturn WindowManager;')(
  {Object: class {}, registerClass() {}},
  {createEnum: names => Object.fromEntries(names.map((n, i) => [n, i]))},
  {WindowType: types}, {HSPLIT: 0, VSPLIT: 1}, {debug() {}},
  {display: {get_current_monitor() {throw stop;}}});
let failures = 0;
for (const test of [
  {name: 'unsupported internal window', type: types.NOTIFICATION, expected: 0},
  {name: 'anonymous fixed-size recorder probe', title: '', wmClass: null, resizable: false, expected: 0},
  {name: 'hidden recorder helper', skipTaskbar: true, expected: 0},
  {name: 'dialog', type: types.DIALOG, expected: 0},
  {name: 'transient', transient: {}, expected: 0},
  {name: 'user floating override', overrides: [{wmClass: 'example', mode: 'float'}], expected: 0},
  {name: 'untiled workspace', workspace: false, expected: 0},
  {name: 'duplicate tracking event', existing: true, expected: 0},
  {name: 'normal tiled app', expected: 1},
  {name: 'auto-split disabled', autoSplit: false, expected: 0},
]) {
  const manager = Object.create(WindowManager.prototype);
  const focused = {get_frame_rect: () => ({width: 1200, height: 700})};
  Object.defineProperty(manager, 'focusMetaWindow', {value: focused});
  manager.ext = {settings: {get_boolean: () => test.autoSplit ?? true}};
  manager._tree = {findNode: w => w === focused ? {parentNode: {layout: 0}} : test.existing ? {} : null};
  manager.windowProps = {overrides: test.overrides ?? []};
  manager.isActiveWindowWorkspaceTiled = () => test.workspace ?? true;
  const commands = [];
  manager.command = command => commands.push(command);
  const window = {
    get_window_type: () => test.type ?? types.NORMAL,
    is_skip_taskbar: () => test.skipTaskbar ?? false,
    get_title: () => test.title ?? 'Example app',
    get_wm_class: () => test.wmClass === null ? null : 'example',
    get_transient_for: () => test.transient ?? null,
    allows_resize: () => test.resizable ?? true,
  };
  const started = GLib.get_monotonic_time();
  try { manager.trackWindow(null, window); } catch (e) { if (e !== stop) throw e; }
  const elapsed = (GLib.get_monotonic_time() - started) / 1000;
  if (commands.length !== test.expected || elapsed >= 400) {
    printerr(`${test.name}: expected ${test.expected} splits, got ${commands.length} (${elapsed}ms)`);
    failures++;
  } else {
    print(`${test.name}: PASS (${elapsed}ms)`);
  }
}
if (failures) throw new Error(`${failures} window tracking regressions`);
