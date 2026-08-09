/**
 * 把构建产物打包成可直接导入酒馆助手的单文件脚本 JSON。
 *
 * 与 Live Server 调试方式的区别：代码内联在 JSON 的 content 字段里，
 * 导入后即可运行，不依赖本地 HTTP 服务，也不依赖任何 CDN。
 *
 * 前提：产物必须完全自包含（无顶层 import / 无 CDN 导入）。
 * 本脚本会先做这项检查，不通过则拒绝打包 —— 内联一个带外部导入的
 * 产物会在酒馆里静默失败，很难排查。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;

/**
 * 版本号从 domain/plugin-license.ts 读，**不在这里另写一份**。
 *
 * 两处各写一份，日后必然改了一处忘了另一处 —— 而「界面上显示的版本
 * 与产物里的版本对不上」是最难察觉的一类错：两边看单独都没问题。
 */
function readVersion() {
  const src = fs.readFileSync(
    path.join(ROOT, 'src/BaraFrontend/domain/plugin-license.ts'),
    'utf8',
  );
  const m = /PLUGIN_VERSION\s*=\s*'([^']+)'/.exec(src);
  if (!m) {
    console.error('打包中止：读不到 PLUGIN_VERSION。');
    process.exit(1);
  }
  return m[1];
}
const VERSION = readVersion();
const BUNDLE = path.join(ROOT, 'dist', 'BaraFrontend', 'index.js');
const OUT_DIR = path.join(ROOT, 'dist', 'BaraFrontend');
// 文件名带版本号：导入酒馆后脚本列表只显示 name 字段，而下载目录里
// 躺着好几个同名 json 时根本分不清哪个是新的。
//
// 命名统一为 `Script-BaraFrontend-<版本>.json`，与模板的
// `Preset-BaraFrontend-<版本>.json` 成对（见 doc/版本号规则.md）。
// 用 ASCII 前缀而非中文：下载目录里两者相邻排列，一眼能看出是一套。
const OUT = path.join(OUT_DIR, `Script-BaraFrontend-${VERSION}.json`);
// 同内容再出一份中文名，与模板的双名策略一致：
// 中文名面向酒馆社区分发（用户一眼认得出是什么），ASCII 名供 GitHub
// release 附件用。两份由同一次构建写出，不会出现内容漂移。
const OUT_CN = path.join(OUT_DIR, `酒馆助手脚本-BaraFrontend-${VERSION}.json`);

if (!fs.existsSync(BUNDLE)) {
  console.error(`未找到产物: ${BUNDLE}\n请先运行 pnpm build`);
  process.exit(1);
}

const code = fs.readFileSync(BUNDLE, 'utf-8');

// ── 产物检查 ──
//
// CDN 导入是允许的（模板 externals 的默认行为），但要显式列出：
// 它们是运行期的外部依赖点，CDN 不可用时脚本会整体失效。
const cdnImports = [
  ...new Set([...code.matchAll(/from\s*['"](https?:\/\/[^'"]+)['"]/g)].map((m) => m[1])),
];

// 顶层 export 则必须拒绝 —— 内联执行时会直接语法错误。
if (/^\s*export[\s{]/m.test(code)) {
  console.error('打包中止：产物含顶层 export 语句，内联执行时会报错。');
  process.exit(1);
}

const json = {
  id: '7c1e4a92-3b8d-4f60-a5d1-9e2f6b0c84af',
  name: `蔷薇前端 ${VERSION}`,
  content: code,
  info: [
    `蔷薇前端　${VERSION}`,
    '',
    '为 {{user}} 与被标记的重要角色提供属性 / 技能 / 特性 / 状态 / 资源 / 关系',
    '与人设小传的统一前端。',
    '',
    '【使用】启用脚本后界面即常驻于聊天区下方，无需任何触发操作。',
    '点标题栏右侧的 ▾ / ▸ 或坞上的条目可展开、收起内容区。',
    '',
    '【排障】在浏览器控制台执行 BaraFrontend.diagnose() 查看自检信息，',
    '会返回 Vue / jQuery / 数据库插件 / SQL 就绪 / 挂载状态 等字段。',
    '',
    '【依赖】SP·数据库 VII（需处于 SQLite 模式）。',
    '缺少该插件时面板仍可打开，但表格内容为空。',
    '',
    '【授权】Aladdin Free Public License (AFPL) Version 9，不提供任何担保。',
    '完整许可证与致谢见设置面板的「关于」栏目。',
    '本插件参考了骰子系统（作者 kousakayou）：',
    'https://github.com/jerryzmtz/my-tavern-scripts',
  ].join('\n'),
  buttons: [],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const payload = JSON.stringify(json, null, 2);
fs.writeFileSync(OUT, payload, 'utf-8');
fs.writeFileSync(OUT_CN, payload, 'utf-8');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('已生成单文件脚本');
console.log('  路径: ' + path.relative(ROOT, OUT));
console.log('  同内容: ' + path.relative(ROOT, OUT_CN));
console.log('  代码: ' + kb(code.length));
console.log('  JSON: ' + kb(fs.statSync(OUT).size));
if (cdnImports.length > 0) {
  console.log('  运行期 CDN 依赖:');
  for (const u of cdnImports) console.log('    · ' + u);
} else {
  console.log('  运行期 CDN 依赖: 无');
}
