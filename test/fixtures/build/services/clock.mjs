// 非 index 的 .mjs 服务模块：验证 services 探测扩到 .mjs，并让 declare() 命名的入口分支真正可达
export function declare() {
  return {
    name: 'clock',
    scope: 'Process'
  };
}

export default function () {
  return { label: 'from-mjs' };
}
